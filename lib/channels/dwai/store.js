import { normalizeGatewaySettings } from '../../store.js'

const RECORD = 'dsh-tokenbank-multi/dwai'
const VERSION = 1

/**
 * dwai 账号以邮箱为主键，带一个会轮换的 refresh token。一次刷新就吃掉旧的，
 * 所以每次轮换成功都必须在下一个网络请求之前写回 —— 丢一次就等于账号登出。
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
    // 分组决定这把 key 能用哪些模型和协议，必须记住建 key 时选的哪个。
    groupId: Number.isSafeInteger(raw.groupId) ? raw.groupId : null,
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
 * 串行访问凭据记录。`update` 每次都重读最新值，所以轮换永远不会覆盖并发编辑。
 */
export function createDwaiStore(credentials) {
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

  /** 拿最新 store 跑 `mutate`，把它返回的结果持久化。 */
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

/** 公开形态：绝不把 token 泄漏给界面。 */
export function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    userId: account.userId,
    displayName: account.displayName,
    pool: account.pool !== false,
    hasKey: Boolean(account.apiKey),
    groupId: account.groupId,
    tokenExpiresAt: account.tokenExpiresAt,
    expired: !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt <= Date.now()),
  }
}

export function accountLive(account, now = Date.now()) {
  if (!account?.accessToken) return false
  return !(account.tokenExpiresAt > 0 && account.tokenExpiresAt <= now)
}

export { RECORD as DWAI_RECORD }
