import { normalizeGatewaySettings } from '../../store.js'

const RECORD = 'dsh-tokenbank-multi/xingchi'
const VERSION = 1

/**
 * XingChi accounts are keyed by email and carry a rotating refresh token.
 * A refresh consumes the old token, so every successful rotation must be
 * written back before the next network call — losing one signs the account out
 * for good.
 */
export function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null
  const email = typeof raw.email === 'string' ? raw.email.trim() : ''
  if (!email) return null
  const refresh = typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : ''
  if (!refresh) return null
  return {
    id: email,
    email,
    userId: Number.isSafeInteger(raw.userId) ? raw.userId : null,
    accessToken: typeof raw.accessToken === 'string' ? raw.accessToken : '',
    refreshToken: refresh,
    tokenExpiresAt: Number.isFinite(raw.tokenExpiresAt) ? raw.tokenExpiresAt : 0,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    keyId: Number.isSafeInteger(raw.keyId) ? raw.keyId : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName.slice(0, 64) : '',
    pool: raw.pool !== false,
    addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
  }
}

export function emptyStore() {
  return { version: VERSION, accounts: [], gateway: normalizeGatewaySettings(null), autoCheckin: { enabled: true, lastDay: '' } }
}

function normalize(raw) {
  const base = emptyStore()
  if (!raw || typeof raw !== 'object') return base
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount).filter(Boolean) : []
  const auto = raw.autoCheckin && typeof raw.autoCheckin === 'object' ? raw.autoCheckin : {}
  return {
    version: VERSION,
    accounts,
    gateway: normalizeGatewaySettings(raw.gateway),
    autoCheckin: { enabled: auto.enabled !== false, lastDay: typeof auto.lastDay === 'string' ? auto.lastDay : '' },
  }
}

/**
 * Serialised access to the credential record. `update` always re-reads the
 * latest value, so a rotation can never clobber a concurrent edit.
 */
export function createXingchiStore(credentials) {
  let chain = Promise.resolve()

  async function read() {
    const record = await credentials.readRecord(RECORD)
    return normalize(record?.payload)
  }

  async function write(store) {
    const payload = {
      version: VERSION,
      accounts: store.accounts.map((account) => ({ ...account })),
      gateway: normalizeGatewaySettings(store.gateway),
      autoCheckin: { enabled: store.autoCheckin.enabled !== false, lastDay: store.autoCheckin.lastDay || '' },
    }
    await credentials.modifyRecord(RECORD, () => ({ kind: 'grant', payload }))
    return store
  }

  /** Run `mutate` against the freshest store, then persist whatever it returns. */
  function update(mutate) {
    const run = chain.then(async () => {
      const current = await read()
      const next = await mutate(current)
      if (!next) return current
      return write(next)
    })
    chain = run.then(() => {}, () => {})
    return run
  }

  return { read, write, update }
}

/** Public shape: never leak tokens to the UI. */
export function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    userId: account.userId,
    displayName: account.displayName,
    pool: account.pool !== false,
    hasKey: Boolean(account.apiKey),
    tokenExpiresAt: account.tokenExpiresAt,
    expired: !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt <= Date.now()),
  }
}

export function accountLive(account, now = Date.now()) {
  if (!account?.accessToken) return false
  return !(account.tokenExpiresAt > 0 && account.tokenExpiresAt <= now)
}

export { RECORD as XINGCHI_RECORD }
