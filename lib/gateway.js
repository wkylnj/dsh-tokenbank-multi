import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { hasGatewayToken, HttpError, isJson, normalizeBaseUrl, readBody, readResponseBytes, retryAfterMs, sendJson } from './http.js'

const MAX_BODY = 32 * 1024 * 1024
const MAX_ERROR_BODY = 64 * 1024
const MAX_CONCURRENT = 4
const MAX_ATTEMPTS = 8
const REQUEST_BUDGET_MS = 120_000
const ATTEMPT_TIMEOUT_MS = 60_000
const BODY_TIMEOUT_MS = 15_000
const ERROR_TIMEOUT_MS = 3_000
const STREAM_IDLE_MS = 120_000
const MIN_ROUND_GAP_MS = 1000
const SERVER_COOLDOWN_MS = 10_000
const MODELS = new Set(['/models', '/v1/models'])
const ANTHROPIC = new Set(['/v1/messages', '/v1/messages/count_tokens'])
const OPENAI = new Map([
  ['/chat/completions', '/v1/chat/completions'], ['/v1/chat/completions', '/v1/chat/completions'],
  ['/responses', '/v1/responses'], ['/v1/responses', '/v1/responses'],
])

export const DEFAULT_GATEWAY_SETTINGS = Object.freeze({ requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 })

function errorResponse(res, status, message, headers) {
  sendJson(res, status, { error: { type: status === 429 ? 'rate_limit_error' : 'proxy_error', message } }, headers)
}

function upstreamRoute(target, method) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.includes('#')) return null
  const question = target.indexOf('?')
  const path = question < 0 ? target : target.slice(0, question)
  if (MODELS.has(path) && method === 'GET') {
    const params = new URLSearchParams(question < 0 ? '' : target.slice(question + 1))
    for (const [key, value] of params) {
      if (params.getAll(key).length !== 1) return null
      if (key === 'limit' ? !/^\d{1,4}$/.test(value) || Number(value) < 1 || Number(value) > 1000
        : !['after_id', 'before_id'].includes(key) || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(value)) return null
    }
    return { path: `/v1/models${params.size ? '?' + params : ''}`, modelList: true }
  }
  if (method !== 'POST' || question >= 0) return null
  if (ANTHROPIC.has(path)) return { path, anthropic: true }
  if (OPENAI.has(path)) return { path: OPENAI.get(path), anthropic: false }
  return null
}

function forwardHeaders(incoming, route, key) {
  const headers = new Headers()
  const anthro = route.anthropic || (route.modelList && typeof incoming['anthropic-version'] === 'string')
  if (anthro) {
    headers.set('x-api-key', key)
    for (const name of ['anthropic-version', 'anthropic-beta']) {
      const value = incoming[name]
      if (typeof value === 'string' && value.length <= 4096) headers.set(name, value)
    }
  } else {
    headers.set('authorization', `Bearer ${key}`)
  }
  if (!route.modelList) headers.set('content-type', 'application/json')
  const accept = incoming.accept
  if (typeof accept === 'string' && accept.length <= 4096) headers.set('accept', accept)
  return headers
}

function responseHeaders(headers) {
  const result = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  for (const name of ['content-type', 'retry-after', 'request-id', 'x-request-id']) {
    const value = headers.get(name)
    if (value && value.length <= 1024) result[name] = value
  }
  return result
}

async function pipeBack(res, response, signal) {
  if (res.destroyed || signal.aborted) { void response.body?.cancel().catch(() => {}); return false }
  res.writeHead(response.status, responseHeaders(response.headers))
  if (!response.body) { res.end(); return true }
  const idleController = new AbortController()
  let timer
  function refreshTimeout() {
    clearTimeout(timer)
    timer = setTimeout(() => idleController.abort(), STREAM_IDLE_MS)
    timer.unref?.()
  }
  refreshTimeout()
  const activity = new Transform({
    transform(chunk, _encoding, callback) { refreshTimeout(); callback(null, chunk) },
  })
  try {
    await pipeline(Readable.fromWeb(response.body), activity, res, { signal: AbortSignal.any([signal, idleController.signal]) })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Only models traffic is forwarded. A local credential never leaves this process. */
export function createGateway({ getPool, baseUrl, token, authority, fetchImpl = fetch, limits = {} }) {
  const base = normalizeBaseUrl(baseUrl)
  const maxBody = limits.maxBody ?? MAX_BODY
  const maxConcurrent = limits.maxConcurrent ?? MAX_CONCURRENT
  const budgetMs = limits.budgetMs ?? REQUEST_BUDGET_MS
  const attemptTimeoutMs = limits.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS
  const cooldown = new Map()
  const state = { lastPicked: '', served: 0, switched: 0, waitedRounds: 0, active: 0 }

  function cooling(id, now = Date.now()) {
    const item = cooldown.get(id)
    if (item && item.until > now) return item
    if (item) cooldown.delete(id)
    return null
  }

  async function handle(req, res) {
    const headers = req.headers ?? {}
    if ((authority && headers.host !== authority) || headers.origin !== undefined || headers['sec-fetch-site'] !== undefined) {
      errorResponse(res, 403, 'gateway accepts only local model clients', { Connection: 'close' })
      return
    }
    if (!hasGatewayToken(headers, token)) {
      errorResponse(res, 401, 'local gateway credential required', { Connection: 'close' })
      return
    }
    const method = req.method
    const route = upstreamRoute(req.url, method)
    if (!route) {
      errorResponse(res, 404, 'unsupported gateway route', { Connection: 'close' })
      return
    }
    if (method === 'POST' && (!isJson(headers) || (headers['content-encoding'] && headers['content-encoding'] !== 'identity'))) {
      errorResponse(res, 415, 'expected uncompressed application/json', { Connection: 'close' })
      return
    }
    if (state.active >= maxConcurrent) {
      errorResponse(res, 503, 'local gateway is busy', { 'Retry-After': '1', Connection: 'close' })
      return
    }

    state.active += 1
    const client = new AbortController()
    const onClose = () => { if (!res.writableFinished) client.abort() }
    res.once('close', onClose)
    const deadline = Date.now() + budgetMs
    let remaining = () => deadline - Date.now()
    try {
      let body
      if (method === 'POST') {
        try {
          body = await readBody(req, maxBody, AbortSignal.any([client.signal, AbortSignal.timeout(Math.min(BODY_TIMEOUT_MS, Math.max(1, remaining())))]))
        } catch (error) {
          if (!client.signal.aborted) errorResponse(res, error instanceof HttpError ? error.status : 408, 'could not read gateway request body', { Connection: 'close' })
          return
        }
      }
      const { accounts: pool, tuning } = await getPool()
      if (client.signal.aborted) return
      const accounts = [...new Map(pool.filter((a) => a?.id && a?.accessKey).map((a) => [a.id, a])).values()]
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (accounts.length === 0) {
        errorResponse(res, 503, 'no enabled TokenBank account with a ready access key')
        return
      }
      const ids = new Set(accounts.map((account) => account.id))
      for (const id of cooldown.keys()) if (!ids.has(id) || !cooling(id)) cooldown.delete(id)
      const settings = { ...DEFAULT_GATEWAY_SETTINGS, ...tuning }
      const rounds = Math.max(0, Math.min(10, settings.requestRetryRounds))
      let attempts = 0
      let previousAccount = ''
      let lastServer = null
      let saw429 = false
      let transportStatus = 0
      let postReplay = false

      attemptsLoop: for (let round = 0; round <= rounds; round += 1) {
        const tried = new Set()
        while (attempts < MAX_ATTEMPTS && remaining() > 0 && !client.signal.aborted) {
          const available = accounts.filter((account) => !tried.has(account.id) && !cooling(account.id))
          const account = available.find((item) => item.id > state.lastPicked) ?? available[0]
          if (!account) break
          state.lastPicked = account.id
          if (previousAccount && previousAccount !== account.id) state.switched += 1
          previousAccount = account.id
          tried.add(account.id)
          attempts += 1

          const attempt = new AbortController()
          const signal = AbortSignal.any([client.signal, attempt.signal])
          const duration = Math.max(1, Math.min(attemptTimeoutMs, remaining()))
          let timeout = setTimeout(() => attempt.abort(), duration)
          timeout.unref?.()
          let response
          try {
            response = await fetchImpl(base + route.path, {
              method, headers: forwardHeaders(headers, route, account.accessKey), body, signal, redirect: 'manual',
            })
          } catch {
            clearTimeout(timeout)
            if (client.signal.aborted) return
            transportStatus = attempt.signal.aborted ? 504 : 502
            // No HTTP response: the upstream may already have accepted a generation.
            if (method === 'POST') break attemptsLoop
            continue
          }
          clearTimeout(timeout)
          if (client.signal.aborted) { void response.body?.cancel().catch(() => {}); return }

          if (response.status >= 300 && response.status < 400) {
            void response.body?.cancel().catch(() => {})
            errorResponse(res, 502, 'upstream redirects are not followed')
            return
          }
          if (response.status === 429) {
            saw429 = true
            const wait = retryAfterMs(response.headers.get('retry-after')) ?? Math.max(settings.cooldownMs, MIN_ROUND_GAP_MS)
            if (wait > 0) cooldown.set(account.id, { until: Date.now() + wait, kind: 'rate' })
            void response.body?.cancel().catch(() => {})
            if (postReplay) break attemptsLoop
            continue
          }
          if (!response.ok) {
            // Read a bounded error, not an arbitrarily large or stalled upstream body.
            timeout = setTimeout(() => attempt.abort(), Math.max(1, Math.min(ERROR_TIMEOUT_MS, remaining())))
            timeout.unref?.()
            let text = ''
            try { text = (await readResponseBytes(response, MAX_ERROR_BODY, signal)).toString('utf8') } catch { /* generic failure below */ }
            finally { clearTimeout(timeout) }
            if (client.signal.aborted) return
            const detail = {
              status: response.status,
              headers: responseHeaders(response.headers),
              body: text ? text.split(account.accessKey).join('[redacted]') : '',
            }
            if (response.status < 500) {
              if (res.destroyed) return
              if (detail.body) { res.writeHead(detail.status, detail.headers); res.end(detail.body) }
              else errorResponse(res, detail.status, `upstream returned HTTP ${detail.status}`)
              return
            }
            lastServer = detail
            const wait = Math.min(Math.max(MIN_ROUND_GAP_MS, settings.cooldownMs), SERVER_COOLDOWN_MS)
            cooldown.set(account.id, { until: Date.now() + wait, kind: 'server' })
            // Explicit server rejection before streaming: allow one new generation
            // attempt, preferably with another account. Do not replay a stream.
            if (method === 'POST') {
              if (postReplay) break attemptsLoop
              postReplay = true
            }
            continue
          }
          if (await pipeBack(res, response, client.signal)) state.served += 1
          return
        }

        if (round === rounds || attempts >= MAX_ATTEMPTS || client.signal.aborted || (postReplay && attempts > 1)) break
        const until = Math.min(...accounts.map((account) => cooling(account.id)?.until ?? Date.now()))
        const wait = Math.max(MIN_ROUND_GAP_MS, until - Date.now())
        if (wait > settings.maxRetryIntervalMs || wait >= remaining()) break
        state.waitedRounds += 1
        await sleep(wait, undefined, { signal: client.signal })
      }

      if (client.signal.aborted) return
      if (transportStatus && (method === 'POST' || (!lastServer && !saw429))) {
        errorResponse(res, transportStatus, transportStatus === 504 ? 'upstream response timed out' : 'could not connect to upstream')
      } else if (lastServer) {
        if (lastServer.body) { res.writeHead(lastServer.status, lastServer.headers); res.end(lastServer.body) }
        else errorResponse(res, lastServer.status, `upstream returned HTTP ${lastServer.status}`)
      } else {
        const coolingAccounts = accounts.map((account) => cooling(account.id)).filter(Boolean)
        const serverCooling = coolingAccounts.some((item) => item.kind === 'server')
        const status = !serverCooling && (saw429 || coolingAccounts.some((item) => item.kind === 'rate')) ? 429 : 503
        const next = Math.min(...coolingAccounts.map((item) => item.until - Date.now()))
        const seconds = Number.isFinite(next) ? Math.max(1, Math.ceil(next / 1000)) : 1
        errorResponse(res, status, status === 429 ? 'TokenBank accounts are rate limited' : 'TokenBank upstream is temporarily unavailable', { 'Retry-After': String(seconds) })
      }
    } catch {
      if (!client.signal.aborted) errorResponse(res, 502, 'local gateway could not complete the request')
    } finally {
      res.off('close', onClose)
      state.active -= 1
    }
  }

  function stats(accounts = []) {
    const now = Date.now()
    const entries = accounts.map(({ id }) => [id, cooling(id, now)]).filter(([, item]) => item)
    return {
      served: state.served, switched: state.switched, waitedRounds: state.waitedRounds, lastPicked: state.lastPicked,
      cooldowns: Object.fromEntries(entries.map(([id, item]) => [id, item.until - now])),
    }
  }

  function reset() { cooldown.clear(); state.lastPicked = '' }
  return { handle, stats, reset }
}
