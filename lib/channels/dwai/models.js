import { randomBytes } from 'node:crypto'
import { HttpError } from '../../http.js'

export const DWAI_KEY_REF = 'DWAI_MULTI_GATEWAY_KEY'
const LOCAL_RECORD = 'dsh-tokenbank-multi/dwai-gateway'
const MODEL_NS = 'llm-pi-ai'
// 路由 id 与用户自建的直连 provider 分开，否则同步会把别人的配置当自己的。
const ROUTE = 'switchboard-dwai'
const LEGACY_ROUTE = 'dwai'
const DWAI_HOST = 'api.dwai.cloud'
const DISPLAY_NAME = '转接台 · dwai'
const TOKEN = /^tb-local-[a-f0-9]{64}$/
const RETRY_POLICY = { mode: 'normal', maxRetries: 3, retryableCodes: ['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'], backoff: { initialDelayMs: 2000, maxDelayMs: 30_000, jitterRatio: 0.15 } }

/**
 * dwai 用独立的本地网关凭据，这样一个渠道的流量永远花不到另一个渠道的账号。
 */
export async function ensureDwaiToken(credentials) {
  let token = ''
  await credentials.modifyRecord(LOCAL_RECORD, (current) => {
    const payload = current?.kind === 'grant' ? current.payload : null
    if (payload && TOKEN.test(String(payload.token ?? ''))) {
      token = payload.token
      return undefined
    }
    token = `tb-local-${randomBytes(32).toString('hex')}`
    return { kind: 'grant', payload: { token, createdAt: Date.now() } }
  })
  await credentials.set(DWAI_KEY_REF, token)
  return token
}

/**
 * 写指向本地网关的 DSH provider。dwai 的 codex-plus 分组同时支持
 * /v1/chat/completions 与 /v1/responses，这里钉死 Responses 协议：它保留
 * reasoning 与工具调用语义，比 chat 更完整。已有的模型条目和用户选项都保留。
 */
export function createDwaiModels({ settings, getSettings, localUrl, isListening, logger }) {
  // 服务在 apply 时可能还没就绪，所以允许传 getter，每次用时再取。
  function service() {
    return typeof getSettings === 'function' ? getSettings() : settings
  }

  function owned(profile) {
    const url = typeof profile?.baseURL === 'string' ? profile.baseURL.replace(/\/+$/, '') : ''
    return profile?.apiKeyEnv === DWAI_KEY_REF && url === localUrl
  }

  // 用户可能早就直连过 dwai，那是一个独立 provider（见 LEGACY_ROUTE）。它属于
  // 同一个渠道，同步成功后由本插件接管：先写新的网关 provider，再删直连那份，
  // 顺序保证中途失败也不会出现两个都不可用。
  function isDirect(profile) {
    const raw = typeof profile?.baseURL === 'string' ? profile.baseURL.trim() : ''
    if (!raw) return false
    try {
      return new URL(raw).host === DWAI_HOST
    } catch {
      return false
    }
  }

  function view() {
    const namespace = service()?.describe({ redactSecrets: true }).find((entry) => entry.ns === MODEL_NS)
    if (!namespace || !Number.isFinite(namespace.revision)) {
      throw new HttpError(503, 'DSH model settings are not available', 'settings_unavailable')
    }
    return namespace
  }

  async function write(namespace, values, current) {
    const path = ['providers', ROUTE]
    const ops = current
      ? Object.entries(values)
        .filter(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))
        .map(([key, value]) => ({ op: 'set', path: [...path, key], value }))
      : [{ op: 'set', path, value: values }]
    if (!ops.length) return false
    try {
      await service().mutate(MODEL_NS, ops, namespace.revision)
      return true
    } catch {
      throw new HttpError(409, 'DSH model settings changed or could not be saved; try syncing again', 'settings_conflict')
    }
  }

  async function dropDirect(namespace) {
    const direct = namespace.value?.providers?.[LEGACY_ROUTE]
    if (!isDirect(direct)) return false
    try {
      await service().mutate(MODEL_NS, [{ op: 'unset', path: ['providers', LEGACY_ROUTE] }], namespace.revision)
      return true
    } catch {
      // 删不掉不算同步失败：新的网关 provider 已经可用，旧的那份下次再清。
      return false
    }
  }

  /**
   * 启动时把旧的直连 provider 换成走网关的那份，不联网：模型列表沿用旧配置。
   * 用户不用先去点「同步模型」，升级后就只有一个 dwai provider。
   */
  async function migrate() {
    if (!isListening()) return false
    const start = view()
    if (start.value?.providers?.[ROUTE]) return false
    const legacy = start.value?.providers?.[LEGACY_ROUTE]
    if (!isDirect(legacy)) return false
    const models = Array.isArray(legacy.models) && legacy.models.length ? legacy.models : []
    const values = {
      apiKeyEnv: DWAI_KEY_REF, baseURL: localUrl, api: 'openai-responses', models,
      displayName: DISPLAY_NAME, retryPolicy: RETRY_POLICY,
    }
    try {
      await service().mutate(MODEL_NS, [{ op: 'set', path: ['providers', ROUTE], value: values }], start.revision)
    } catch (error) {
      // 插件刚被 HMR 重载时，settings.mutate 会报 "HMR transactions cannot be nested"。
      // 这不算真失败，调用方会稍后重试。
      logger?.warn?.(`dsh-switchboard: dwai provider migration deferred: ${error?.message ?? error}`)
      return false
    }
    await dropDirect(view())
    return true
  }

  async function synchronize(models) {
    if (!isListening()) throw new HttpError(503, 'local gateway is not listening; model settings were left untouched', 'gateway_down')
    const start = view()
    const current = start.value?.providers?.[ROUTE]
    if (current && !owned(current)) {
      throw new HttpError(409, 'the switchboard dwai provider points somewhere else; its settings were left untouched', 'provider_conflict')
    }
    const ids = [...new Set(models.map((item) => item?.id).filter((id) => typeof id === 'string' && id))].slice(0, 1000)
    if (!ids.length) throw new HttpError(503, 'upstream returned no usable models', 'catalog_empty')
    // 接管直连 provider 时，用户在上面调过的模型选项要跟着搬过来，否则等于让人重配。
    const legacy = start.value?.providers?.[LEGACY_ROUTE]
    const base = Array.isArray(current?.models) && current.models.length ? current.models
      : (isDirect(legacy) && Array.isArray(legacy.models) ? legacy.models : [])
    const configured = new Map(base.map((entry) => [typeof entry === 'string' ? entry : entry?.id, entry]))
    const next = ids.map((id) => {
      const existing = configured.get(id)
      return existing && typeof existing === 'object' ? existing : { id }
    })
    for (const [id, entry] of configured) if (id && !ids.includes(id)) next.push(entry)
    const values = { apiKeyEnv: DWAI_KEY_REF, baseURL: localUrl, api: 'openai-responses', models: next }
    if (!current) Object.assign(values, { displayName: DISPLAY_NAME, retryPolicy: RETRY_POLICY })
    // 网络 I/O 之后重读，revision 才是最新的。
    const namespace = view()
    const latest = namespace.value?.providers?.[ROUTE]
    if (latest && !owned(latest)) {
      throw new HttpError(409, 'the switchboard dwai provider was changed while syncing; its settings were left untouched', 'provider_conflict')
    }
    const changed = await write(namespace, values, latest)
    const dropped = await dropDirect(view())
    return { ok: true, changed, dropped, count: ids.length, route: ROUTE }
  }

  return { synchronize, migrate, ROUTE, DISPLAY_NAME }
}
