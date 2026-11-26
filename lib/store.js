import { DEFAULT_BASE_URL, normalizeBaseUrl } from './http.js'
import { DEFAULT_GATEWAY_SETTINGS } from './gateway.js'

export const ACCOUNTS_RECORD = 'dsh-tokenbank/accounts'
export const LEGACY_IDENTITY_RECORD = 'dsh-tokenbank/identity'
const VERSION = 2
const LIMITS = { requestRetryRounds: [0, 10], maxRetryIntervalMs: [0, 120_000], cooldownMs: [0, 600_000] }

export function normalizeGatewaySettings(raw) {
  return Object.fromEntries(Object.entries(DEFAULT_GATEWAY_SETTINGS).map(([key, fallback]) => {
    const value = raw?.[key]
    const [min, max] = LIMITS[key]
    return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback]
  }))
}

const empty = () => ({
  activeId: null, accounts: [], autoCheckin: { enabled: false, lastDay: '' }, gateway: { ...DEFAULT_GATEWAY_SETTINGS },
})
const asString = (value) => typeof value === 'string' ? value : ''

export function normalizeAccount(raw) {
  const email = asString(raw?.email).trim()
  const sessionToken = asString(raw?.sessionToken)
  if (!email || !sessionToken) return null
  return {
    id: asString(raw.id) || email,
    email,
    displayName: asString(raw.displayName),
    sessionToken,
    expiresAtMS: Number.isFinite(raw.expiresAtMS) ? raw.expiresAtMS : 0,
    accessKey: asString(raw.accessKey),
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : 0,
    pool: raw.pool !== false,
    authExpired: raw.authExpired === true,
  }
}

export function accountLive(account, now = Date.now()) {
  return Boolean(account?.sessionToken) && !account.authExpired && (!account.expiresAtMS || account.expiresAtMS > now)
}

export function publicAccount(account, activeId) {
  return {
    id: account.id, email: account.email, displayName: account.displayName,
    active: account.id === activeId, expired: !accountLive(account), pool: account.pool, keyReady: Boolean(account.accessKey),
  }
}

function normalizeStore(raw) {
  const accounts = (Array.isArray(raw?.accounts) ? raw.accounts : []).map(normalizeAccount).filter(Boolean)
  return {
    activeId: accounts.some((item) => item.id === raw?.activeId) ? raw.activeId
      : (accounts.find((item) => accountLive(item)) ?? accounts[0])?.id ?? null,
    accounts,
    autoCheckin: { enabled: raw?.autoCheckin?.enabled === true, lastDay: asString(raw?.autoCheckin?.lastDay) },
    gateway: normalizeGatewaySettings(raw?.gateway),
  }
}

function decode(record) {
  if (!record) return new Map()
  if (record.kind !== 'grant') throw new Error('unexpected TokenBank credential record')
  const raw = record.payload
  if (!raw || typeof raw !== 'object') throw new Error('invalid TokenBank account record')
  if (raw.version === undefined && Array.isArray(raw.accounts)) return new Map([[DEFAULT_BASE_URL, normalizeStore(raw)]])
  if (raw.version !== VERSION || !Array.isArray(raw.stores)) throw new Error('unsupported TokenBank account record version')
  return new Map(raw.stores.map(({ baseUrl, store }) => [normalizeBaseUrl(baseUrl), normalizeStore(store)]))
}

function encode(stores) {
  return { kind: 'grant', payload: { version: VERSION, stores: [...stores].map(([baseUrl, store]) => ({ baseUrl, store })) } }
}

// Store writes are always confined to the configured upstream. Old unscoped
// accounts belong to the official default only, never to a newly configured URL.
export function createAccountStore(credentials, baseUrl) {
  const scope = normalizeBaseUrl(baseUrl)
  let initialization
  async function migrate() {
    const legacy = await credentials.readRecord(LEGACY_IDENTITY_RECORD)
    const old = normalizeAccount(legacy?.kind === 'grant' ? legacy.payload : null)
    await credentials.modifyRecord(ACCOUNTS_RECORD, async (current) => {
      const stores = decode(current)
      if (old && !stores.has(DEFAULT_BASE_URL)) {
        stores.set(DEFAULT_BASE_URL, { ...empty(), activeId: old.id, accounts: [old] })
      }
      if (!current && stores.size === 0) return undefined
      const next = encode(stores)
      return JSON.stringify(current?.payload) === JSON.stringify(next.payload) ? undefined : next
    })
    // The old plugin may still use its single-account record. Keep its session
    // intact, but scrub any password from the latest version of that record.
    if (legacy?.kind === 'grant' && Object.hasOwn(legacy.payload ?? {}, 'password')) {
      await credentials.modifyRecord(LEGACY_IDENTITY_RECORD, async (current) => {
        if (current?.kind !== 'grant' || !Object.hasOwn(current.payload ?? {}, 'password')) return undefined
        const { password: _discarded, ...payload } = current.payload
        return { kind: 'grant', payload }
      })
    }
  }

  function initialize() {
    if (!initialization) initialization = migrate().catch((error) => { initialization = undefined; throw error })
    return initialization
  }

  async function read() {
    await initialize()
    return decode(await credentials.readRecord(ACCOUNTS_RECORD)).get(scope) ?? empty()
  }

  async function update(mutate) {
    await initialize()
    const record = await credentials.modifyRecord(ACCOUNTS_RECORD, async (current) => {
      const stores = decode(current)
      const next = mutate(stores.get(scope) ?? empty())
      if (next === undefined) return undefined
      stores.set(scope, normalizeStore(next))
      return encode(stores)
    })
    return decode(record).get(scope) ?? empty()
  }
  return { initialize, read, update }
}

export function upsertAccount(store, account) {
  const existing = store.accounts.find((item) => item.id === account.id || item.email.toLowerCase() === account.email.toLowerCase())
  const next = existing ? {
    ...account, id: existing.id, pool: existing.pool, addedAt: existing.addedAt,
    accessKey: account.accessKey || existing.accessKey, displayName: account.displayName || existing.displayName,
  } : { ...account, addedAt: Date.now() }
  const accounts = existing ? store.accounts.map((item) => item.id === existing.id ? next : item) : [...store.accounts, next]
  return { ...store, activeId: next.id, accounts, autoCheckin: { ...store.autoCheckin, lastDay: '' } }
}
