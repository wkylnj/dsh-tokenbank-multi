import { createServer } from 'node:http'
import { createGateway } from './gateway.js'
import { DEFAULT_BASE_URL, HttpError, isJson, normalizeBaseUrl, readBody, sendJson } from './http.js'
import { createModelManager } from './models.js'
import { accountLive, createAccountStore, normalizeAccount, normalizeGatewaySettings, publicAccount, upsertAccount } from './store.js'
import * as tb from './tb.js'
import { createRegistry } from './core/registry.js'
import { createXingchiChannel } from './channels/xingchi/index.js'
import { createXingchiModels, ensureXingchiToken } from './channels/xingchi/models.js'
import { listModels as listXingchiModels } from './channels/xingchi/api.js'

export const ROUTE = '/dsh-switchboard/api'
export const GATEWAY_PORT = 39917
const GATEWAY_AUTHORITY = `127.0.0.1:${GATEWAY_PORT}`
const GATEWAY_URL = `http://${GATEWAY_AUTHORITY}`
const PANEL_BODY_LIMIT = 256 * 1024
const BALANCE_CONCURRENCY = 4

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-switchboard',
    validate(input) {
      if (input == null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [{ message: 'expected an object' }] }
      if (input.baseUrl === undefined) return { value: {} }
      try { return { value: { baseUrl: normalizeBaseUrl(input.baseUrl) } } }
      catch { return { issues: [{ message: 'expected an HTTPS base URL (or HTTP on loopback) without credentials, query or fragment', path: ['baseUrl'] }] } }
    },
  },
}

const dayKey = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const numberOrNull = (value) => Number.isSafeInteger(value) ? value : null
const niceText = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : ''
const emailPattern = /^[^@\s]{1,128}@[^@\s]{1,253}$/
const sameSession = (left, right) => Boolean(left && right && left.id === right.id && left.sessionToken === right.sessionToken)
const publicAccounts = (store) => store.accounts.map((account) => publicAccount(account, store.activeId))
const activeAccount = (store) => store.accounts.find((item) => item.id === store.activeId)
const autoStatus = (store) => ({ ...store.autoCheckin, todayDone: store.autoCheckin.lastDay === dayKey() })
const unauthorized = (error) => error instanceof tb.PortalError && (error.status === 401 || error.status === 403)
const accountChanged = () => new HttpError(409, 'the TokenBank account changed; refresh and try again', 'account_changed')
const notFound = () => new HttpError(404, 'TokenBank account not found', 'account_not_found')
const sessionExpired = () => new HttpError(409, 'TokenBank session is not active; sign in or select another account', 'session_expired')

function requiredText(value, limit, label, trim = true) {
  const text = typeof value === 'string' ? trim ? value.trim() : value : ''
  if (!text || text.length > limit) throw new HttpError(400, `invalid ${label}`, 'invalid_input')
  return text
}
function requireEmail(value) {
  const email = requiredText(value, 254, 'email')
  if (!emailPattern.test(email)) throw new HttpError(400, 'invalid email', 'invalid_input')
  return email
}
function checkinView(data) {
  if (typeof data?.checked_today !== 'boolean' && data?.enabled !== false) {
    throw new HttpError(502, 'TokenBank returned an invalid check-in status', 'upstream_response')
  }
  return {
    enabled: data.enabled !== false,
    checked_today: data.checked_today === true,
    streak: numberOrNull(data.streak) ?? 0,
    amount_nano_usd: numberOrNull(data.amount_nano_usd) ?? 0,
  }
}

/** Internal controller shared by the authenticated panel and the host timers. */
export function createController({ credentials, settings, baseUrl, localUrl, isListening, getGateway }) {
  const accounts = createAccountStore(credentials, baseUrl)
  const models = createModelManager({ settings, credentials, baseUrl, localUrl, isListening })
  const keyFlights = new Map()
  const signFlights = new Map()
  let autoFlight
  let balanceFlight

  async function patchSession(account, patch) {
    return accounts.update((store) => {
      if (!store.accounts.some((item) => sameSession(account, item))) return undefined
      return { ...store, accounts: store.accounts.map((item) => sameSession(account, item) ? { ...item, ...patch } : item) }
    })
  }

  async function ensureKey(account) {
    if (account.accessKey) return account.accessKey
    const flightKey = JSON.stringify([account.id, account.sessionToken])
    if (keyFlights.has(flightKey)) return keyFlights.get(flightKey)
    const flight = (async () => {
      const existing = (await accounts.read()).accounts.find((item) => sameSession(account, item))
      if (!accountLive(existing)) throw accountChanged()
      if (existing.accessKey) return existing.accessKey
      const tokens = (await tb.listAccessKeys(baseUrl, account.sessionToken))?.keys
      if (!Array.isArray(tokens)) throw new HttpError(502, 'TokenBank returned an invalid key list', 'upstream_response')
      const first = tokens.find((entry) => entry?.id != null && (entry.status ?? 'active') === 'active')
      const key = first
        ? (await tb.revealAccessKey(baseUrl, account.sessionToken, first.id))?.key
        : await tb.createAccessKey(baseUrl, account.sessionToken, 'DSH TokenBank Multi')
      if (typeof key !== 'string' || !key || /[\r\n]/.test(key)) throw new HttpError(409, 'no usable access key was returned by TokenBank', 'key_unavailable')
      const newest = await patchSession(account, { accessKey: key })
      if (!newest.accounts.some((item) => sameSession(account, item))) throw accountChanged()
      return key
    })().finally(() => keyFlights.delete(flightKey))
    keyFlights.set(flightKey, flight)
    return flight
  }

  async function status(store) {
    const before = activeAccount(store)
    let data
    let unavailable = false
    if (accountLive(before)) {
      try { data = await tb.me(baseUrl, before.sessionToken) }
      catch (error) {
        if (unauthorized(error)) await patchSession(before, { authExpired: true })
        else unavailable = true
      }
    }
    const latest = await accounts.read()
    const active = activeAccount(latest)
    const fresh = sameSession(before, active)
    const loggedIn = accountLive(active)
    return {
      ok: true, loggedIn, expired: Boolean(active && !loggedIn), unavailable: fresh && unavailable,
      activeId: latest.activeId, portalUrl: baseUrl, accounts: publicAccounts(latest), autoCheckin: autoStatus(latest),
      ...(loggedIn ? {
        user: { display_name: (fresh && niceText(data?.user?.display_name)) || active.displayName },
        account: { balance_nano_usd: fresh ? numberOrNull(data?.account?.balance_nano_usd) : null },
      } : {}),
    }
  }

  async function balances() {
    if (balanceFlight) return balanceFlight
    balanceFlight = (async () => {
      const snapshot = await accounts.read()
      const rows = new Map()
      let index = 0
      const worker = async () => {
        while (index < snapshot.accounts.length) {
          const item = snapshot.accounts[index++]
          let balance = null
          if (accountLive(item)) {
            try { balance = numberOrNull((await tb.me(baseUrl, item.sessionToken))?.account?.balance_nano_usd) }
            catch (error) { if (unauthorized(error)) await patchSession(item, { authExpired: true }) }
          }
          rows.set(item.id, { item, balance })
        }
      }
      await Promise.all(Array.from({ length: Math.min(BALANCE_CONCURRENCY, snapshot.accounts.length) }, worker))
      const latest = await accounts.read()
      const entries = latest.accounts.map((item) => {
        const row = rows.get(item.id)
        return [item.id, sameSession(item, row?.item) && accountLive(item) ? row.balance : null]
      })
      const knownCount = entries.filter(([, amount]) => amount !== null).length
      return { ok: true, balances: Object.fromEntries(entries), knownCount, accountCount: entries.length }
    })().finally(() => { balanceFlight = undefined })
    return balanceFlight
  }

  async function authenticate(action, body) {
    const email = requireEmail(body.email)
    const password = requiredText(body.password, 1024, 'password', false)
    const data = action === 'register'
      ? await tb.registerWithSession(baseUrl, { email, password, code: requiredText(body.code, 128, 'verification code'), displayName: niceText(body.displayName) })
      : await tb.loginWithSession(baseUrl, {
        email, password, captchaId: requiredText(body.captchaId, 256, 'captcha ID'), captchaCode: requiredText(body.captchaCode, 128, 'captcha answer'),
      })
    const replyEmail = niceText(data.user?.email)
    const identity = emailPattern.test(replyEmail) ? replyEmail : email
    const account = normalizeAccount({
      id: identity, email: identity, displayName: niceText(data.user?.display_name) || niceText(body.displayName),
      sessionToken: data.sessionToken, expiresAtMS: data.expiresAtMS, accessKey: data.accessKey,
    })
    if (!accountLive(account)) throw new HttpError(502, 'TokenBank did not return a usable session', 'upstream_session')
    const saved = await accounts.update((store) => upsertAccount(store, account))
    const current = saved.accounts.find((item) => item.sessionToken === account.sessionToken && item.email === account.email)
    if (!current) throw accountChanged()
    if (!current.accessKey) {
      try { await ensureKey(current) } catch { /* sign-in succeeded; model sync can retry provisioning */ }
    }
    const latest = await accounts.read()
    if (!latest.accounts.some((item) => sameSession(current, item))) throw accountChanged()
    return { ok: true, activeId: latest.activeId, accounts: publicAccounts(latest) }
  }

  function signAccount(item) {
    const key = JSON.stringify([item.id, item.sessionToken])
    if (signFlights.has(key)) return signFlights.get(key)
    const pending = (async () => {
      const before = checkinView(await tb.checkinStatus(baseUrl, item.sessionToken))
      if (!before.enabled) return { status: 'disabled', checkin: before }
      if (before.checked_today) return { status: 'already', checkin: before }
      const current = (await accounts.read()).accounts.find((account) => sameSession(account, item))
      if (!accountLive(current)) throw accountChanged()
      const checkin = checkinView(await tb.doCheckin(baseUrl, item.sessionToken))
      return { status: checkin.checked_today ? 'checked' : 'failed', checkin }
    })().finally(() => signFlights.delete(key))
    signFlights.set(key, pending)
    return pending
  }

  async function runCheckin(snapshot, auto = false) {
    const results = []
    const completed = new Map()
    for (const item of snapshot.accounts.filter((account) => accountLive(account))) {
      const current = await accounts.read()
      if (auto && !current.autoCheckin.enabled) break
      if (!current.accounts.some((account) => sameSession(account, item) && accountLive(account))) continue
      let result
      try { result = await signAccount(item) }
      catch { result = { status: 'error', checkin: {} } }
      const { status, checkin } = result
      if (status === 'checked' || status === 'already' || status === 'disabled') completed.set(item.id, item.sessionToken)
      results.push({ id: item.id, status, streak: checkin.streak ?? 0, amount: status === 'checked' ? checkin.amount_nano_usd : 0 })
    }
    return {
      completed,
      summary: {
        results,
        checkedCount: results.filter(({ status }) => status === 'checked').length,
        alreadyCount: results.filter(({ status }) => status === 'already').length,
        disabledCount: results.filter(({ status }) => status === 'disabled').length,
        failedCount: results.filter(({ status }) => status === 'failed' || status === 'error').length,
        totalNano: results.reduce((total, item) => total + item.amount, 0),
      },
    }
  }

  function autoTick() {
    if (autoFlight) return autoFlight
    autoFlight = (async () => {
      const today = dayKey()
      const store = await accounts.read()
      if (!store.autoCheckin.enabled || store.autoCheckin.lastDay === today || !store.accounts.some((item) => accountLive(item))) return null
      const { completed, summary } = await runCheckin(store, true)
      if (completed.size) await accounts.update((latest) => {
        if (!latest.autoCheckin.enabled || dayKey() !== today) return undefined
        const live = latest.accounts.filter((item) => accountLive(item))
        if (!live.length || !live.every((item) => completed.get(item.id) === item.sessionToken)) return undefined
        return { ...latest, autoCheckin: { ...latest.autoCheckin, lastDay: today } }
      })
      return summary
    })().finally(() => { autoFlight = undefined })
    return autoFlight
  }

  async function pool() {
    const store = await accounts.read()
    return { accounts: store.accounts.filter((item) => accountLive(item) && item.pool && item.accessKey), tuning: store.gateway }
  }

  async function dispatch(body) {
    const action = body.action
    if (action === 'captcha') {
      const data = await tb.newCaptcha(baseUrl)
      const image = typeof data?.image === 'string' && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=\r\n]+$/i.test(data.image) ? data.image : ''
      if (!image || !data?.captcha_id) throw new HttpError(502, 'TokenBank did not return a usable captcha', 'upstream_response')
      return { ok: true, captchaId: niceText(data.captcha_id), image }
    }
    if (action === 'send-code') { await tb.sendCode(baseUrl, requireEmail(body.email)); return { ok: true, sent: true } }
    if (action === 'register' || action === 'login') return authenticate(action, body)
    if (action === 'accounts-balance') return balances()
    const store = await accounts.read()
    const requireActive = () => {
      const active = activeAccount(store)
      if (body.id !== undefined && body.id !== active?.id) throw accountChanged()
      if (!accountLive(active)) throw sessionExpired()
      return active
    }
    const live = store.accounts.filter((item) => accountLive(item))
    const selected = live.filter((item) => item.pool)
    const ready = selected.filter((item) => item.accessKey)
    switch (action) {
      case 'status': return status(store)
      case 'switch': {
        const id = requiredText(body.id, 254, 'account ID')
        const next = await accounts.update((latest) => {
          const target = latest.accounts.find((item) => item.id === id)
          if (!target) throw notFound()
          if (!accountLive(target)) throw sessionExpired()
          return { ...latest, activeId: id }
        })
        return { ok: true, activeId: next.activeId }
      }
      case 'remove': {
        const id = requiredText(body.id, 254, 'account ID')
        let removed = false
        const next = await accounts.update((latest) => {
          const remaining = latest.accounts.filter((item) => item.id !== id)
          if (remaining.length === latest.accounts.length) return undefined
          removed = true
          return { ...latest, accounts: remaining }
        })
        return { ok: true, activeId: next.activeId, removed }
      }
      case 'profile-update': {
        const active = requireActive()
        const displayName = requiredText(body.displayName, 256, 'display name')
        const data = await tb.updateProfile(baseUrl, active.sessionToken, displayName)
        const name = niceText(data?.user?.display_name) || displayName
        await patchSession(active, { displayName: name })
        return { ok: true, displayName: name }
      }
      case 'checkin-status': return { ok: true, checkin: checkinView(await tb.checkinStatus(baseUrl, requireActive().sessionToken)) }
      case 'checkin-do': {
        const result = await signAccount(requireActive())
        return { ok: true, status: result.status, checkin: result.checkin }
      }
      case 'checkin-all': {
        const { summary } = await runCheckin(store)
        if (!summary.results.length) throw sessionExpired()
        return { ok: true, ...summary }
      }
      case 'auto-checkin-set': {
        if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'expected a boolean switch', 'invalid_input')
        await accounts.update((latest) => ({ ...latest, autoCheckin: { ...latest.autoCheckin, enabled: body.enabled } }))
        const run = body.enabled ? await autoTick() : null
        return { ok: true, ...autoStatus(await accounts.read()), run }
      }
      case 'settings-get': return {
        ok: true, gateway: store.gateway, autoCheckin: autoStatus(store), accounts: publicAccounts(store),
        accountCount: store.accounts.length, liveCount: live.length, poolCount: ready.length,
        listening: isListening(), port: GATEWAY_PORT, upstream: baseUrl,
      }
      case 'settings-set': {
        if (!body.gateway || typeof body.gateway !== 'object' || Array.isArray(body.gateway)) throw new HttpError(400, 'expected gateway settings', 'invalid_input')
        const values = Object.fromEntries(Object.entries(body.gateway).filter(([key, value]) => Object.hasOwn(store.gateway, key) && Number.isFinite(value)))
        const next = await accounts.update((latest) => ({ ...latest, gateway: normalizeGatewaySettings({ ...latest.gateway, ...values }) }))
        return { ok: true, gateway: next.gateway }
      }
      case 'account-pool': {
        const id = requiredText(body.id, 254, 'account ID')
        if (typeof body.pool !== 'boolean') throw new HttpError(400, 'expected a boolean pool value', 'invalid_input')
        await accounts.update((latest) => {
          if (!latest.accounts.some((item) => item.id === id)) throw notFound()
          return { ...latest, accounts: latest.accounts.map((item) => item.id === id ? { ...item, pool: body.pool } : item) }
        })
        return { ok: true, id, pool: body.pool }
      }
      case 'model-sync': {
        if (!isListening()) throw new HttpError(503, 'the local gateway is not listening; model settings were left untouched', 'gateway_down')
        const active = activeAccount(store)
        const chosen = ready.find((item) => item.id === active?.id) ?? ready[0] ?? selected[0]
        if (!chosen) throw new HttpError(409, 'enable a signed-in account in the model pool first', 'pool_empty')
        const key = await ensureKey(chosen)
        return models.synchronize({ ...chosen, accessKey: key }, async () => {
          const latest = await accounts.read()
          return latest.accounts.some((item) => sameSession(chosen, item) && accountLive(item) && item.pool && item.accessKey === key)
        })
      }
      case 'gateway-status': return {
        ok: true, baseURL: localUrl, port: GATEWAY_PORT, upstream: baseUrl, listening: isListening(),
        accounts: live.length, ready: ready.length, pool: selected.map((item) => item.id), poolCount: ready.length,
        poolMissingKey: selected.filter((item) => !item.accessKey).map((item) => item.id), tuning: store.gateway,
        ...getGateway()?.stats(ready),
      }
      case 'gateway-reset': getGateway()?.reset(); return { ok: true }
      default: throw new HttpError(400, 'unknown TokenBank panel action', 'unknown_action')
    }
  }
  return { dispatch, autoTick, pool, initializeStore: accounts.initialize, initializeGateway: models.initialize, migrateModel: models.migrate }
}

/** Independent Web route: use the host's signed browser session, not just an Origin check. */
export function createPanelHandler(connection, dispatch) {
  return async (req, res) => {
    const fail = (status, error, code, close = false) => sendJson(res, status, { ok: false, error, code }, close ? { Connection: 'close' } : undefined)
    const { headers } = req
    let admitted
    try { admitted = connection.admit({ headers }) }
    catch { fail(503, 'DSH browser authentication is unavailable', 'auth_unavailable', true); return }
    if (admitted.rejection || !admitted.peer || admitted.peer.id !== connection.browserPeer?.id) {
      fail(admitted.rejection ?? 403, 'an authenticated DSH browser session is required', 'auth_required', true); return
    }
    if (req.method !== 'POST') { fail(405, 'expected POST', 'method_not_allowed', true); return }
    if (headers['x-dsh-switchboard'] !== '1' || (headers['sec-fetch-site'] && headers['sec-fetch-site'] !== 'same-origin')) {
      fail(403, 'same-origin TokenBank panel request required', 'origin_required', true); return
    }
    if (headers.origin !== undefined) {
      let matches = false
      try {
        const origin = new URL(headers.origin)
        matches = origin.origin === headers.origin && origin.host === headers.host && ['http:', 'https:'].includes(origin.protocol)
      } catch { /* invalid Origin */ }
      if (!matches) { fail(403, 'cross-origin request refused', 'origin_required', true); return }
    }
    if (!isJson(headers) || (headers['content-encoding'] && headers['content-encoding'] !== 'identity')) {
      fail(415, 'expected uncompressed JSON', 'invalid_content_type', true); return
    }
    let body
    try {
      const bytes = await readBody(req, PANEL_BODY_LIMIT, AbortSignal.timeout(10_000))
      body = JSON.parse(bytes.toString('utf8'))
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('expected an object')
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error?.name === 'TimeoutError' ? 408 : 400
      fail(status, status === 413 ? 'panel request is too large' : 'could not read panel JSON', error?.code ?? 'invalid_json', true)
      return
    }
    try { sendJson(res, 200, await dispatch(body)) }
    catch (error) {
      const controlled = error instanceof HttpError || error instanceof tb.PortalError
      const status = controlled && error.status >= 400 && error.status <= 599 ? error.status : 500
      // 500 一律脱敏：走到这里说明是我们自己没预料到的失败，内部报文和错误码不该出网。
      const expose = controlled && status !== 500
      fail(status, expose ? error.message : 'the switchboard plugin could not complete the operation', expose ? error.code : 'internal_error')
    }
  }
}

export default {
  name: 'dsh-switchboard',
  Config,
  inject: ['credentials'],
  apply(ctx, config) {
    const baseUrl = normalizeBaseUrl(config?.baseUrl ?? DEFAULT_BASE_URL)
    let gateway
    let listening = false
    const registry = createRegistry()
    const controller = createController({
      credentials: ctx.credentials, settings: ctx.get('settings'), baseUrl, localUrl: GATEWAY_URL,
      isListening: () => listening, getGateway: () => gateway,
    })
    const xingchiModels = createXingchiModels({
      getSettings: () => ctx.get('settings'), localUrl: GATEWAY_URL, isListening: () => listening,
      logger: ctx.logger,
    })
    const xingchi = createXingchiChannel({
      credentials: ctx.credentials, models: xingchiModels,
      isListening: () => listening, getGateway: () => gateway, localUrl: GATEWAY_URL, port: GATEWAY_PORT,
    })

    ctx.inject(['webServer', 'connection'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact', path: ROUTE, handler: createPanelHandler(child.connection, (body) => registry.dispatch(body)),
      }), 'dsh-switchboard: authenticated panel API')
    })

    ctx.effect(() => {
      let stopped = false
      let server
      void (async () => {
        const [, token, xingchiToken] = await Promise.all([
          controller.initializeStore(), controller.initializeGateway(), ensureXingchiToken(ctx.credentials), xingchi.ensure(),
        ])
        if (stopped) return
        // Each channel registers its own gateway token, upstream origin and
        // User-Agent. One server, one port; the token picks the channel.
        registry.add({
          id: 'tokenbank',
          dispatch: controller.dispatch,
          tick: controller.autoTick,
        })
        registry.add({
          id: 'xingchi',
          dispatch: xingchi.dispatch,
          tick: xingchi.tick,
          gateway: xingchi.gatewayFor(xingchiToken),
        })
        gateway = createGateway({
          channels: [
            { id: 'tokenbank', label: 'TokenBank', token, baseUrl, routes: ['models', 'anthropic', 'chat', 'responses'], getPool: controller.pool },
            xingchi.gatewayFor(xingchiToken),
          ],
          authority: GATEWAY_AUTHORITY,
        })
        server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, (req, res) => {
          void gateway.handle(req, res).catch(() => sendJson(res, 502, { error: { type: 'proxy_error', message: 'local gateway failed' } }))
        })
        server.on('error', () => {
          listening = false
          ctx.logger?.warn?.('dsh-switchboard: local model gateway could not bind or listen')
        })
        server.listen(GATEWAY_PORT, '127.0.0.1', () => {
          if (stopped) return
          listening = true
          // 必须延后到本插件 apply 的事务之外：插件加载期间 settings.mutate 会报
          // "HMR transactions cannot be nested"，迁移会被静默吞掉。
          const migrated = setTimeout(() => {
            if (stopped) return
            controller.migrateModel().catch(() => ctx.logger?.warn?.('dsh-switchboard: existing model config was not migrated; use Sync models in settings'))
            xingchiModels.migrate().catch(() => ctx.logger?.warn?.('dsh-switchboard: xingchi model config was not migrated; use Sync models in settings'))
          }, 1500)
          if (typeof migrated?.unref === 'function') migrated.unref()
        })
      })().catch(() => ctx.logger?.warn?.('dsh-switchboard: failed to initialize the local model gateway'))
      return () => {
        stopped = true
        listening = false
        server?.close()
        server?.closeAllConnections?.()
      }
    }, 'dsh-switchboard: authenticated model gateway')

    ctx.effect(() => {
      const tick = () => registry.tick().catch(() => ctx.logger?.warn?.('dsh-switchboard: auto check-in could not finish'))
      const first = setTimeout(tick, 60_000)
      const interval = setInterval(tick, 30 * 60_000)
      return () => { clearTimeout(first); clearInterval(interval) }
    }, 'dsh-switchboard: auto check-in timer')
  },
}
