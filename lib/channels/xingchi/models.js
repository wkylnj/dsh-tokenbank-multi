import { randomBytes } from 'node:crypto'
import { HttpError } from '../../http.js'

export const XINGCHI_KEY_REF = 'XINGCHI_MULTI_GATEWAY_KEY'
const LOCAL_RECORD = 'dsh-tokenbank-multi/xingchi-gateway'
const MODEL_NS = 'llm-pi-ai'
const ROUTE = 'xingchi'
const TOKEN = /^tb-local-[a-f0-9]{64}$/
const RETRY_POLICY = { mode: 'normal', maxRetries: 3, retryableCodes: ['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'], backoff: { initialDelayMs: 2000, maxDelayMs: 30_000, jitterRatio: 0.15 } }

/**
 * XingChi gets its own local gateway credential so traffic for one channel can
 * never spend another channel's accounts.
 */
export async function ensureXingchiToken(credentials) {
  const result = await credentials.modifyRecord(LOCAL_RECORD, async (current) => {
    if (current?.kind === 'grant' && TOKEN.test(current.payload?.token ?? '')) return undefined
    return { kind: 'grant', payload: { token: `tb-local-${randomBytes(32).toString('hex')}` } }
  })
  const token = result?.payload?.token
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('local gateway credential unavailable')
  if ((await credentials.resolve(XINGCHI_KEY_REF))?.value !== token) await credentials.set(XINGCHI_KEY_REF, token)
  return token
}

/**
 * Point the `xingchi` provider at the local gateway. XingChi only speaks the
 * Responses API, so the protocol is pinned regardless of what was configured
 * before. Existing model entries and user options are preserved.
 */
export function createXingchiModels({ settings, localUrl, isListening }) {
  function view() {
    const namespace = settings?.describe({ redactSecrets: true }).find((entry) => entry.ns === MODEL_NS)
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
      await settings.mutate(MODEL_NS, ops, namespace.revision)
      return true
    } catch {
      throw new HttpError(409, 'DSH model settings changed or could not be saved; try syncing again', 'settings_conflict')
    }
  }

  async function synchronize(models) {
    if (!isListening()) throw new HttpError(503, 'local gateway is not listening; model settings were left untouched', 'gateway_down')
    const start = view()
    const current = start.value?.providers?.[ROUTE]
    const ids = [...new Set(models.map((item) => item?.id).filter((id) => typeof id === 'string' && id))].slice(0, 1000)
    if (!ids.length) throw new HttpError(503, 'upstream returned no usable models', 'catalog_empty')
    const configured = new Map((Array.isArray(current?.models) ? current.models : [])
      .map((entry) => [typeof entry === 'string' ? entry : entry?.id, entry]))
    const next = ids.map((id) => {
      const existing = configured.get(id)
      return existing && typeof existing === 'object' ? existing : { id }
    })
    for (const [id, entry] of configured) if (id && !ids.includes(id)) next.push(entry)
    const values = { apiKeyEnv: XINGCHI_KEY_REF, baseURL: localUrl, api: 'openai-responses', models: next }
    if (!current) Object.assign(values, { displayName: '星驰', retryPolicy: RETRY_POLICY })
    const changed = await write(view(), values, current)
    return { ok: true, changed, count: ids.length }
  }

  return { synchronize }
}
