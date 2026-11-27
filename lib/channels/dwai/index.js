import { HttpError } from '../../http.js'
import { DEFAULT_GATEWAY_SETTINGS } from '../../gateway.js'
import * as dw from './api.js'
import { accountLive, createDwaiStore, emptyStore, normalizeAccount, publicAccount } from './store.js'

export const CHANNEL_ID = 'dwai'
export const CHANNEL_LABEL = 'dwai'
export const DWAI_UPSTREAM = 'https://api.dwai.cloud'
// 默认分组：codex-plus。它同时支持 /v1/chat/completions 与 /v1/responses，
// 倍率 0.24 也是可用分组里最低的。dwai 会拒绝没有分组的 key，所以必须有默认值。
const DEFAULT_GROUP_ID = 2
const REFRESH_MARGIN_MS = 30 * 60 * 1000
const dayKey = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const notFound = () => new HttpError(404, 'dwai 账号不存在', 'account_not_found')
const needsToken = () => new HttpError(409, 'dwai 账号的登录状态已失效，请重新获取 refresh_token', 'session_expired')

/**
 * 一个 dwai 渠道：多个账号，每个带自己的轮换 refresh token。
 * 与星驰不同，dwai 不校验客户端 UA，所以不需要伪装 User-Agent；
 * 但它按分组决定协议，所以每把 key 建的时候都要绑分组。
 */
export function createDwaiChannel({ credentials, models = null, isListening = () => false, getGateway = () => null, localUrl = '', port = 0 }) {
  const store = createDwaiStore(credentials)
  const refreshFlights = new Map()
  const checkinFlights = new Map()
  let initialized = false

  async function ensure() {
    if (initialized) return
    const current = await store.read()
    if (!current.accounts.length) await store.write(emptyStore())
    initialized = true
  }

  /**
   * 轮换一个账号的 token 对。旧的 refresh token 在上游应答的瞬间就作废，
   * 所以新的一对必须在同一次 update 里落盘。
   */
  function rotate(email, options = {}) {
    const existing = refreshFlights.get(email)
    if (existing && !options.force) return existing
    const run = (async () => {
      const current = await store.read()
      const account = current.accounts.find((item) => item.id === email)
      if (!account) throw notFound()
      const pair = await dw.refreshToken(account.refreshToken)
      const expiresAt = Date.now() + pair.expiresIn * 1000
      await store.update((next) => ({
        ...next,
        accounts: next.accounts.map((item) => item.id === email
          ? { ...item, accessToken: pair.accessToken, refreshToken: pair.refreshToken, tokenExpiresAt: expiresAt }
          : item),
      }))
      return { ...account, accessToken: pair.accessToken, refreshToken: pair.refreshToken, tokenExpiresAt: expiresAt }
    })().finally(() => { refreshFlights.delete(email) })
    refreshFlights.set(email, run)
    return run
  }

  /** 返回一个带可用 access token 的账号，过期就轮换。 */
  async function live(email) {
    const current = await store.read()
    const account = current.accounts.find((item) => item.id === email)
    if (!account) throw notFound()
    const stale = !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt - REFRESH_MARGIN_MS <= Date.now())
    if (!stale) return account
    return rotate(email)
  }

  /**
   * 挑一个能用的分组。优先用户给过的，其次默认 codex-plus，最后退到账号
   * 可见的第一个活跃分组 —— 站点可能随时下架某个分组。
   */
  async function pickGroup(token, preferred) {
    try {
      const groups = await dw.listGroups(token)
      if (!groups.length) return null
      if (Number.isFinite(preferred) && groups.some((item) => item.id === preferred)) return preferred
      if (groups.some((item) => item.id === DEFAULT_GROUP_ID)) return DEFAULT_GROUP_ID
      return groups[0].id
    } catch {
      return Number.isFinite(preferred) ? preferred : DEFAULT_GROUP_ID
    }
  }

  /**
   * 返回一把网关真能花的 key。dwai 会拒绝没有分组的 key（403 GROUP_DELETED
   * 或未分配分组），所以缺分组时要补上。
   */
  async function adoptKey(email, token, preferredGroup) {
    const keys = await dw.listKeys(token)
    const usable = keys.find((item) => item.status === 'active' && item.key) ?? null
    if (usable) {
      if (usable.groupId !== null && usable.groupId !== undefined) {
        return { apiKey: usable.key, keyId: usable.id, groupId: usable.groupId, created: false }
      }
      const groupId = await pickGroup(token, preferredGroup)
      if (groupId === null) return { apiKey: usable.key, keyId: usable.id, groupId: null, created: false }
      const attached = await dw.assignGroup(token, usable.id, groupId)
      return { apiKey: attached.key || usable.key, keyId: attached.id ?? usable.id, groupId: attached.groupId ?? groupId, created: false }
    }
    const groupId = await pickGroup(token, preferredGroup)
    const created = await dw.createKey(token, `dsh-${email.split('@')[0]}`.slice(0, 64), groupId ?? undefined)
    if (!created.key) throw new HttpError(502, 'dwai 没有返回可用的 API key', 'upstream_response')
    return { apiKey: created.key, keyId: created.id, groupId: created.groupId ?? groupId, created: true }
  }

  async function syncAccount(email, options = {}) {
    const account = await live(email)
    const info = await dw.profile(account.accessToken)
    const adopted = await adoptKey(email, account.accessToken, options.groupId ?? account.groupId)
    const patch = {
      userId: info.id ?? account.userId,
      displayName: info.email || account.displayName,
      apiKey: adopted.apiKey,
      keyId: adopted.keyId,
      groupId: adopted.groupId,
    }
    await store.update((next) => ({
      ...next,
      accounts: next.accounts.map((item) => item.id === email ? { ...item, ...patch } : item),
    }))
    return { ...account, ...patch }
  }

  async function addAccount({ refreshToken, groupId }) {
    const token = typeof refreshToken === 'string' ? refreshToken.trim() : ''
    if (!/^rt_[0-9a-f]{64}$/i.test(token)) throw new HttpError(400, 'refresh_token 格式不正确', 'invalid_input')
    await ensure()
    const pair = await dw.refreshToken(token)
    const expiresAt = Date.now() + pair.expiresIn * 1000
    const info = await dw.profile(pair.accessToken)
    const email = info.email
    if (!email) throw new HttpError(502, 'dwai 没有返回账号邮箱', 'upstream_response')
    const preferred = Number.isSafeInteger(groupId) ? groupId : null
    const adopted = await adoptKey(email, pair.accessToken, preferred)
    const account = normalizeAccount({
      email, userId: info.id, accessToken: pair.accessToken, refreshToken: pair.refreshToken,
      tokenExpiresAt: expiresAt, apiKey: adopted.apiKey, keyId: adopted.keyId, groupId: adopted.groupId,
      displayName: email, addedAt: Date.now(),
    })
    await store.update((next) => ({
      ...next,
      accounts: [...next.accounts.filter((item) => item.id !== email), account],
    }))
    return { account, balance: info.balance }
  }

  /**
   * 与 live 相同，但死掉的 refresh token 会变成面板能处理的 409。
   * 账号不存在（404）或 id 格式不对（400）必须透传：把它们说成「会话失效」
   * 会让人白去找新的 refresh_token。
   */
  async function liveSafe(email) {
    try {
      return await live(email)
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 400)) throw error
      throw needsToken()
    }
  }

  async function balances() {
    const current = await store.read()
    const out = {}
    for (const account of current.accounts) {
      if (!accountLive(account) && !account.refreshToken) { out[account.id] = null; continue }
      try {
        const account_ = await liveSafe(account.id)
        const info = await dw.profile(account_.accessToken)
        out[account.id] = info.balance
      } catch {
        out[account.id] = null
      }
    }
    return out
  }

  async function checkinOne(email, options = {}) {
    const account = await liveSafe(email)
    const status = await dw.checkinStatus(account.accessToken)
    if (!status.enabled) return { email, status: 'disabled', amount: 0 }
    if (!status.eligible) return { email, status: 'ineligible', amount: 0 }
    if (status.claimedToday && !options.force) return { email, status: 'already', amount: 0 }
    // dwai 必须带上要领取的日期，通常就是总览里的 today。
    const day = status.today || dayKey()
    const result = await dw.claimCheckin(account.accessToken, day)
    if (result.alreadyClaimed) return { email, status: 'already', amount: 0 }
    return { email, status: 'checked', amount: result.amount }
  }

  async function checkinAll() {
    await ensure()
    const current = await store.read()
    const results = []
    for (const account of current.accounts) {
      if (!account.pool) continue
      const flight = checkinFlights.get(account.id)
      if (flight) { results.push(await flight); continue }
      const run = checkinOne(account.id).catch((error) => ({
        email: account.id, status: 'error',
        amount: 0, message: error instanceof Error ? error.message : 'check-in failed',
      })).finally(() => { checkinFlights.delete(account.id) })
      checkinFlights.set(account.id, run)
      results.push(await run)
    }
    const checked = results.filter((item) => item.status === 'checked')
    const total = checked.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0)
    return {
      results,
      checkedCount: checked.length,
      alreadyCount: results.filter((item) => item.status === 'already').length,
      failedCount: results.filter((item) => item.status === 'error').length,
      disabledCount: results.filter((item) => item.status === 'disabled' || item.status === 'ineligible').length,
      totalAmount: total,
    }
  }

  async function status() {
    await ensure()
    // 启动时的模型配置迁移可能因为 HMR 事务失败，打开面板时补一次。
    if (models && typeof models.migrate === 'function') {
      void models.migrate().catch(() => {})
    }
    const current = await store.read()
    const accounts = current.accounts.map(publicAccount)
    // dwai 没有「当前账号」概念：池里每个账号都会被用到。
    // 报第一个是给共享面板轮询签到状态用的。
    const first = accounts.find((item) => !item.expired) ?? accounts[0] ?? null
    return {
      ok: true,
      channel: CHANNEL_ID,
      loggedIn: accounts.length > 0,
      accounts,
      activeId: first ? first.id : '',
      accountCount: accounts.length,
      gateway: current.gateway,
      autoCheckin: { ...current.autoCheckin, todayDone: current.autoCheckin.lastDay === dayKey() },
      upstream: DWAI_UPSTREAM,
      site: dw.SITE_URL,
    }
  }

  async function dispatch(body) {
    const action = typeof body?.action === 'string' ? body.action : ''
    switch (action) {
      case 'status':
        return status()
      case 'add-account': {
        const { account, balance } = await addAccount(body)
        return { ok: true, account: publicAccount(account), balance }
      }
      case 'remove-account': {
        const id = String(body.id ?? '')
        const current = await store.read()
        if (!current.accounts.some((item) => item.id === id)) throw notFound()
        await store.update((next) => ({ ...next, accounts: next.accounts.filter((item) => item.id !== id) }))
        return { ok: true }
      }
      case 'refresh-account': {
        const id = String(body.id ?? '')
        await rotate(id, { force: true })
        const account = await syncAccount(id)
        return { ok: true, account: publicAccount(account) }
      }
      case 'account-pool': {
        const id = String(body.id ?? '')
        const pool = body.pool !== false
        const current = await store.read()
        if (!current.accounts.some((item) => item.id === id)) throw notFound()
        await store.update((next) => ({
          ...next, accounts: next.accounts.map((item) => item.id === id ? { ...item, pool } : item),
        }))
        return { ok: true, id, pool }
      }
      case 'groups': {
        const id = String(body.id ?? '')
        const account = await liveSafe(id)
        return { ok: true, groups: await dw.listGroups(account.accessToken) }
      }
      case 'balances':
        return { ok: true, balances: await balances() }
      case 'checkin-status': {
        const id = String(body.id ?? '')
        const account = await liveSafe(id)
        const info = await dw.checkinStatus(account.accessToken)
        return { ok: true, checkin: info }
      }
      case 'checkin-do': {
        const id = String(body.id ?? '')
        return { ok: true, ...(await checkinOne(id, { force: true })) }
      }
      case 'checkin-all':
        return { ok: true, ...(await checkinAll()) }
      case 'auto-checkin-set': {
        const enabled = body.enabled !== false
        let lastDay = ''
        await store.update((next) => ({ ...next, autoCheckin: { ...next.autoCheckin, enabled } }))
        const current = await store.read()
        lastDay = current.autoCheckin.lastDay
        let run = null
        if (enabled && lastDay !== dayKey()) {
          run = await checkinAll()
          if (run.results.length > 0) {
            lastDay = dayKey()
            await store.update((next) => ({ ...next, autoCheckin: { ...next.autoCheckin, lastDay } }))
          }
        }
        return { ok: true, enabled, lastDay, todayDone: lastDay === dayKey(), run }
      }
      case 'settings-get': {
        const current = await store.read()
        const accounts = current.accounts.map(publicAccount)
        const live = current.accounts.filter((item) => accountLive(item) || item.refreshToken)
        return {
          ok: true,
          channel: CHANNEL_ID,
          gateway: current.gateway,
          autoCheckin: { ...current.autoCheckin, todayDone: current.autoCheckin.lastDay === dayKey() },
          // 设置页读 data.accounts 渲染轮询池列表。
          accounts,
          accountCount: accounts.length,
          liveCount: live.length,
          poolCount: accounts.filter((item) => item.pool).length,
          listening: isListening(),
          port,
          upstream: DWAI_UPSTREAM,
        }
      }
      case 'gateway-status': {
        const current = await store.read()
        const ready = current.accounts.filter((item) => item.pool && item.apiKey)
        const gateway = getGateway()
        return {
          ok: true,
          channel: CHANNEL_ID,
          baseURL: localUrl,
          port,
          upstream: DWAI_UPSTREAM,
          listening: isListening(),
          accounts: current.accounts.length,
          ready: ready.length,
          pool: ready.map((item) => item.id),
          poolCount: ready.length,
          poolMissingKey: current.accounts.filter((item) => item.pool && !item.apiKey).map((item) => item.id),
          tuning: current.gateway,
          ...(gateway && typeof gateway.stats === 'function' ? gateway.stats(ready, CHANNEL_ID) : {}),
        }
      }
      case 'settings-set': {
        const current = await store.read()
        const gateway = { ...current.gateway, ...(body.gateway || {}) }
        await store.update((next) => ({ ...next, gateway }))
        const fresh = await store.read()
        return { ok: true, gateway: fresh.gateway }
      }
      case 'model-sync': {
        if (!models) throw new HttpError(503, 'model settings are not available', 'settings_unavailable')
        const current = await store.read()
        const usable = current.accounts.filter((item) => item.pool && item.apiKey)
        if (!usable.length) throw new HttpError(409, 'enable a dwai account with an API key first', 'pool_empty')
        const account = usable[0]
        const listed = await dw.listModels(account.apiKey)
        if (!listed.length) throw new HttpError(503, 'dwai returned no usable models', 'catalog_empty')
        return models.synchronize(listed)
      }
      default:
        throw new HttpError(400, `unknown dwai action: ${action || '(empty)'}`, 'unknown_action')
    }
  }

  /** 网关可以花的账号，加上它认的调参。 */
  async function pool() {
    const current = await store.read()
    const accounts = []
    for (const account of current.accounts) {
      if (!account.pool || !account.apiKey) continue
      if (!accountLive(account) && !account.refreshToken) continue
      accounts.push({ id: account.id, accessKey: account.apiKey })
    }
    return { accounts, tuning: { ...DEFAULT_GATEWAY_SETTINGS, ...current.gateway } }
  }

  /** 轮换快过期的 token，然后跑每日签到。 */
  async function tick() {
    await ensure()
    const current = await store.read()
    for (const account of current.accounts) {
      if (!account.refreshToken) continue
      const due = !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt - REFRESH_MARGIN_MS <= Date.now())
      if (!due) continue
      try { await rotate(account.id) } catch { /* 下次手动操作时再暴露 */ }
    }
    if (!current.autoCheckin.enabled) return null
    if (current.autoCheckin.lastDay === dayKey()) return null
    const run = await checkinAll()
    if (run.results.length === 0) return null
    await store.update((next) => ({ ...next, autoCheckin: { ...next.autoCheckin, lastDay: dayKey() } }))
    return run
  }

  return {
    id: CHANNEL_ID,
    label: CHANNEL_LABEL,
    dispatch,
    tick,
    pool,
    ensure,
    status,
    addAccount,
    rotate,
    syncAccount,
    checkinAll,
    store,
    /**
     * 网关描述符：独立令牌、独立上游。dwai 的 codex-plus 分组同时支持
     * chat 与 responses，所以两种都放行；/v1/messages 只有 anthropic 分组
     * 才支持，默认分组下会 403，因此不声明。
     */
    gatewayFor(token) {
      return {
        id: CHANNEL_ID,
        label: CHANNEL_LABEL,
        token,
        baseUrl: DWAI_UPSTREAM,
        routes: ['models', 'chat', 'responses'],
        getPool: pool,
      }
    },
  }
}
