import { randomBytes } from 'node:crypto'
import { DEFAULT_BASE_URL, HttpError } from './http.js'
import { listGatewayModels, portalModels } from './tb.js'

export const GATEWAY_KEY_REF = 'TOKENBANK_MULTI_GATEWAY_KEY'
const LOCAL_RECORD = 'dsh-tokenbank-multi/gateway-credential'
const LEGACY_REF = 'TOKENBANK_API_KEY'
const MODEL_NS = 'llm-pi-ai'
const ROUTE = 'tokenbank'
const VALID_APIS = new Set(['anthropic-messages', 'openai-completions', 'openai-responses'])
const TOKEN = /^tb-local-[a-f0-9]{64}$/
const CACHE_TTL_MS = 10 * 60_000
const MIN_REQUEST_GAP_MS = 60_000
const ERROR_GAP_MS = 10_000
const MAX_ENTRIES = 32
const MODEL_ID = /^[^\s\x00-\x1f\x7f]{1,256}$/
const RETRY_POLICY = { mode: 'normal', maxRetries: 3, retryableCodes: ['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'], backoff: { initialDelayMs: 2000, maxDelayMs: 30_000, jitterRatio: 0.15 } }

export async function ensureGatewayCredential(credentials) {
  const result = await credentials.modifyRecord(LOCAL_RECORD, async (current) => {
    if (current?.kind === 'grant' && TOKEN.test(current.payload?.token ?? '')) return undefined
    return { kind: 'grant', payload: { token: `tb-local-${randomBytes(32).toString('hex')}` } }
  })
  const token = result?.payload?.token
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('local gateway credential unavailable')
  if ((await credentials.resolve(GATEWAY_KEY_REF))?.value !== token) await credentials.set(GATEWAY_KEY_REF, token)
  return token
}

function presentModel(raw) {
  if (typeof raw?.id !== 'string' || !MODEL_ID.test(raw.id)) return null
  const model = { id: raw.id }
  const input = Array.isArray(raw.input) ? [...new Set(raw.input.filter((item) => item === 'text' || item === 'image'))] : []
  if (input.length) model.input = input
  if (Number.isSafeInteger(raw.context_window) && raw.context_window > 0) model.contextWindow = raw.context_window
  if (Number.isSafeInteger(raw.max_tokens) && raw.max_tokens > 0) model.maxTokens = raw.max_tokens
  const efforts = Object.entries(raw.reasoning_efforts ?? {}).filter(([key, value]) =>
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(key) && (value === null || typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value)))
  if (efforts.length) model.reasoningEfforts = Object.fromEntries(efforts)
  return model
}

export function createModelManager({ settings, credentials, baseUrl, localUrl, isListening }) {
  const cache = new Map()
  let syncing

  async function catalog(account) {
    // Cache only the gateway's confirmed model IDs; the portal supplies metadata.
    // There is no browser-controlled force flag or credential input.
    const key = account.accessKey
    let entry = cache.get(key)
    if (entry?.inflight) return entry.inflight
    if (entry && (entry.at + CACHE_TTL_MS > Date.now() || entry.next > Date.now())) {
      if (entry.ids) return entry.ids
      throw new HttpError(503, 'model catalog is cooling down; try again later', 'catalog_cooldown')
    }
    if (!entry) {
      if (cache.size >= MAX_ENTRIES) {
        const spare = [...cache].find(([, value]) => !value.inflight)
        if (!spare) throw new HttpError(503, 'model catalog is busy', 'catalog_busy')
        cache.delete(spare[0])
      }
      entry = { at: 0, next: 0, ids: null, inflight: null }
      cache.set(key, entry)
    }
    entry.next = Date.now() + MIN_REQUEST_GAP_MS
    entry.inflight = (async () => {
      try {
        const models = await listGatewayModels(baseUrl, key)
        const ids = [...new Set(models.map(presentModel).filter(Boolean).map((item) => item.id))].slice(0, 1000)
        if (!ids.length) throw new HttpError(503, 'upstream returned no usable models', 'catalog_empty')
        entry.ids = ids
        entry.at = Date.now()
        return ids
      } catch (error) {
        entry.next = Math.max(entry.next, Date.now() + (error.retryAfterMs ?? ERROR_GAP_MS))
        if (entry.ids) return entry.ids
        throw error
      } finally {
        entry.inflight = null
      }
    })()
    return entry.inflight
  }

  function view() {
    const namespace = settings?.describe({ redactSecrets: true }).find((entry) => entry.ns === MODEL_NS)
    if (!namespace || !Number.isFinite(namespace.revision)) throw new HttpError(503, 'DSH model settings are not available', 'settings_unavailable')
    return namespace
  }

  function owns(profile) {
    const url = typeof profile?.baseURL === 'string' ? profile.baseURL.replace(/\/+$/, '') : ''
    return profile?.apiKeyEnv === GATEWAY_KEY_REF && url === localUrl ||
      profile?.apiKeyEnv === LEGACY_REF && [localUrl, baseUrl, DEFAULT_BASE_URL].includes(url)
  }

  async function writeProfile(namespace, values, current) {
    const path = ['providers', ROUTE]
    // Field-level edits are revision-fenced; never restate another field (including secrets).
    const ops = current ? Object.entries(values).filter(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))
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

  async function migrate() {
    if (!settings || !isListening()) return false
    const namespace = view()
    const current = namespace.value?.providers?.[ROUTE]
    if (!owns(current)) return false
    return writeProfile(namespace, { apiKeyEnv: GATEWAY_KEY_REF, baseURL: localUrl }, current)
  }

  async function sync(account, isCurrent = async () => true) {
    if (!isListening()) throw new HttpError(503, 'local gateway is not listening; model settings were left untouched', 'gateway_down')
    const start = view()
    const existing = start.value?.providers?.[ROUTE]
    if (existing && !owns(existing)) throw new HttpError(409, 'the tokenbank provider is configured separately; its settings were left untouched', 'provider_conflict')
    if (!account?.accessKey) throw new HttpError(409, 'there is no account with a ready access key', 'key_unavailable')
    const [ids, groups] = await Promise.all([catalog(account), portalModels(baseUrl, account.sessionToken).catch(() => [])])
    const metadata = new Map()
    let protocol
    for (const group of groups) {
      if (!protocol && VALID_APIS.has(group?.protocol)) protocol = group.protocol
      if (!Array.isArray(group?.models)) continue
      for (const item of group.models) {
        const model = presentModel(item)
        if (model && !metadata.has(model.id)) metadata.set(model.id, model)
      }
    }
    if (!isListening()) throw new HttpError(503, 'local gateway stopped; model settings were left untouched', 'gateway_down')
    if (!await isCurrent()) throw new HttpError(409, 'the account changed while syncing; please try again', 'account_changed')
    // Re-read after network I/O. Existing per-model options and manual entries stay intact.
    const namespace = view()
    const current = namespace.value?.providers?.[ROUTE]
    if (current && !owns(current)) throw new HttpError(409, 'the tokenbank provider is configured separately; its settings were left untouched', 'provider_conflict')
    const currentModels = Array.isArray(current?.models) ? current.models : []
    const configured = new Map(currentModels.map((entry) => typeof entry === 'string' ? [entry, { id: entry }] : [entry?.id, entry]))
    const models = ids.map((id) => ({ ...(metadata.get(id) ?? { id }), ...configured.get(id) }))
    for (const entry of currentModels) if (!ids.includes(typeof entry === 'string' ? entry : entry?.id)) models.push(entry)
    const values = { apiKeyEnv: GATEWAY_KEY_REF, baseURL: localUrl, models }
    if (!current) Object.assign(values, { displayName: 'TokenBank', api: protocol ?? 'openai-completions', retryPolicy: RETRY_POLICY })
    const changed = await writeProfile(namespace, values, current)
    return { ok: true, changed, count: ids.length }
  }

  function synchronize(account, isCurrent) {
    if (syncing) throw new HttpError(409, 'model synchronization is already running', 'catalog_busy')
    syncing = sync(account, isCurrent).finally(() => { syncing = undefined })
    return syncing
  }
  return { initialize: () => ensureGatewayCredential(credentials), migrate, synchronize }
}
