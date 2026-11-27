import { HttpError } from '../../http.js'
import { DEFAULT_GATEWAY_SETTINGS } from '../../gateway.js'
import * as xc from './api.js'
import { accountLive, createXingchiStore, emptyStore, normalizeAccount, publicAccount } from './store.js'

export const CHANNEL_ID = 'xingchi'
export const CHANNEL_LABEL = '星驰'
export const XINGCHI_UPSTREAM = 'https://api.xingchiapi.com'
const REFRESH_MARGIN_MS = 30 * 60 * 1000
const dayKey = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const notFound = () => new HttpError(404, '星驰账号不存在', 'account_not_found')
const needsToken = () => new HttpError(409, '星驰账号的登录状态已失效，请重新获取 refresh_token', 'session_expired')

/**
 * One XingChi channel: several accounts, each with its own rotating refresh
 * token. XingChi gates /v1/responses on the client identity, so the gateway
 * presents a versioned User-Agent for this channel only.
 */
export function createXingchiChannel({ credentials, ua = 'DeepSeek-Harness/0.2.2', models = null, isListening = () => false, getGateway = () => null, localUrl = '', port = 0 }) {
  const store = createXingchiStore(credentials)
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
   * Rotate one account's token pair. The old refresh token dies the moment the
   * upstream answers, so the new pair is persisted inside the same update.
   */
  function rotate(email, options = {}) {
    const existing = refreshFlights.get(email)
    if (existing && !options.force) return existing
    const run = (async () => {
      const current = await store.read()
      const account = current.accounts.find((item) => item.id === email)
      if (!account) throw notFound()
      const pair = await xc.refreshToken(account.refreshToken)
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

  /** Return an account with a usable access token, rotating it when stale. */
  async function live(email) {
    const current = await store.read()
    const account = current.accounts.find((item) => item.id === email)
    if (!account) throw notFound()
    const stale = !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt - REFRESH_MARGIN_MS <= Date.now())
    if (!stale) return account
    return rotate(email)
  }

  /** First group this account may use; a key with no group is unusable. */
  async function pickGroup(token) {
    try {
      const groups = await xc.listGroups(token)
      return groups.length ? groups[0].id : null
    } catch {
      return null
    }
  }

  /**
   * Return a key the gateway can actually spend. sub2api rejects keys that
   * belong to no group with 403, so a group is attached when one is missing.
   */
  async function adoptKey(email, token) {
    const keys = await xc.listKeys(token)
    const usable = keys.find((item) => item.status === 'active' && item.key) ?? null
    if (usable) {
      if (usable.groupId !== null && usable.groupId !== undefined) {
        return { apiKey: usable.key, keyId: usable.id, created: false }
      }
      const groupId = await pickGroup(token)
      if (groupId === null) return { apiKey: usable.key, keyId: usable.id, created: false }
      const attached = await xc.assignGroup(token, usable.id, groupId)
      return { apiKey: attached.key || usable.key, keyId: attached.id ?? usable.id, created: false }
    }
    const groupId = await pickGroup(token)
    const created = await xc.createKey(token, `dsh-${email.split('@')[0]}`.slice(0, 64), groupId ?? undefined)
    if (!created.key) throw new HttpError(502, '星驰没有返回可用的 API key', 'upstream_response')
    return { apiKey: created.key, keyId: created.id, created: true }
  }

  async function syncAccount(email) {
    const account = await live(email)
    const info = await xc.profile(account.accessToken)
    const adopted = await adoptKey(email, account.accessToken)
    const patch = {
      userId: info.id ?? account.userId,
      displayName: info.email || account.displayName,
      apiKey: adopted.apiKey,
      keyId: adopted.keyId,
    }
    await store.update((next) => ({
      ...next,
      accounts: next.accounts.map((item) => item.id === email ? { ...item, ...patch } : item),
    }))
    return { ...account, ...patch }
  }

  async function addAccount({ refreshToken }) {
    const token = typeof refreshToken === 'string' ? refreshToken.trim() : ''
    if (!/^rt_[0-9a-f]{64}$/i.test(token)) throw new HttpError(400, 'refresh_token 格式不正确', 'invalid_input')
    await ensure()
    const pair = await xc.refreshToken(token)
    const expiresAt = Date.now() + pair.expiresIn * 1000
    const info = await xc.profile(pair.accessToken)
    const email = info.email
    if (!email) throw new HttpError(502, '星驰没有返回账号邮箱', 'upstream_response')
    const adopted = await adoptKey(email, pair.accessToken)
    const account = normalizeAccount({
      email, userId: info.id, accessToken: pair.accessToken, refreshToken: pair.refreshToken,
      tokenExpiresAt: expiresAt, apiKey: adopted.apiKey, keyId: adopted.keyId, displayName: email, addedAt: Date.now(),
    })
    await store.update((next) => ({
      ...next,
      accounts: [...next.accounts.filter((item) => item.id !== email), account],
    }))
    return { account, balance: info.balance }
  }

  /**
   * Like `live`, but a dead refresh token becomes a 409 the panel can act on.
   * A missing account (404) or a malformed id (400) must pass through: turning
   * those into "session expired" sends people hunting for a new refresh_token
   * when the account id was simply wrong.
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
        const info = await xc.profile(account_.accessToken)
        out[account.id] = info.balance
      } catch {
        out[account.id] = null
      }
    }
    return out
  }

  async function checkinOne(email, options = {}) {
    const account = await liveSafe(email)
    const status = await xc.checkinStatus(account.accessToken)
    if (!status.enabled) return { email, status: 'disabled', amount: 0 }
    if (status.claimedToday && !options.force) return { email, status: 'already', amount: 0 }
    const result = await xc.claimCheckin(account.accessToken)
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
      disabledCount: results.filter((item) => item.status === 'disabled').length,
      totalAmount: total,
    }
  }

  async function status() {
    await ensure()
    const current = await store.read()
    const accounts = current.accounts.map(publicAccount)
    // XingChi has no "current account" concept: every pooled account is used.
    // The first one is reported so the shared panel can poll its check-in state.
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
      upstream: XINGCHI_UPSTREAM,
      site: xc.SITE_URL,
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
      case 'balances':
        return { ok: true, balances: await balances() }
      case 'checkin-status': {
        const id = String(body.id ?? '')
        const account = await liveSafe(id)
        const info = await xc.checkinStatus(account.accessToken)
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
          // The settings page reads data.accounts to render the pool list.
          accounts,
          accountCount: accounts.length,
          liveCount: live.length,
          poolCount: accounts.filter((item) => item.pool).length,
          listening: isListening(),
          port,
          upstream: XINGCHI_UPSTREAM,
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
          upstream: XINGCHI_UPSTREAM,
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
        if (!usable.length) throw new HttpError(409, 'enable a XingChi account with an API key first', 'pool_empty')
        const account = usable[0]
        const listed = await listXingchiModels(account.apiKey)
        if (!listed.length) throw new HttpError(503, 'XingChi returned no usable models', 'catalog_empty')
        return models.synchronize(listed)
      }
      default:
        throw new HttpError(400, `unknown xingchi action: ${action || '(empty)'}`, 'unknown_action')
    }
  }

  /** Accounts the gateway may spend, plus the tuning knobs it honours. */
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

  /** Refresh tokens that are about to expire, then run the daily check-in. */
  async function tick() {
    await ensure()
    const current = await store.read()
    for (const account of current.accounts) {
      if (!account.refreshToken) continue
      const due = !account.accessToken || (account.tokenExpiresAt > 0 && account.tokenExpiresAt - REFRESH_MARGIN_MS <= Date.now())
      if (!due) continue
      try { await rotate(account.id) } catch { /* surfaced on the next manual action */ }
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
    /** Gateway descriptor: a distinct token, upstream and User-Agent. */
    gatewayFor(token) {
      return {
        id: CHANNEL_ID,
        label: CHANNEL_LABEL,
        token,
        baseUrl: XINGCHI_UPSTREAM,
        ua,
        // XingChi only serves Responses and model listing; /v1/messages is gated
        // per API-key group and /v1/chat/completions is disabled site-wide.
        routes: ['models', 'responses'],
        getPool: pool,
      }
    },
  }
}
