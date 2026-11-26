import { normalizeBaseUrl, readResponseBytes, retryAfterMs } from './http.js'

const COOKIE = 'tb_portal_session'
const PORTAL = '/api/portal'
const RESPONSE_LIMIT = 2 * 1024 * 1024
const TIMEOUT_MS = 20_000

export class PortalError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'PortalError'
    this.code = code
    this.status = status
  }
}

async function fetchJson(url, options) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, redirect: 'manual', signal })
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {})
      throw new PortalError('upstream redirect refused', 'upstream_redirect', 502)
    }
    const bytes = await readResponseBytes(response, RESPONSE_LIMIT, signal)
    let payload
    try { payload = JSON.parse(bytes.toString('utf8')) } catch { /* preserve HTTP errors without trusting their body */ }
    if (!response.ok) {
      const error = new PortalError(`upstream returned HTTP ${response.status}`, 'upstream_rejected', response.status)
      error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'))
      throw error
    }
    if (payload === undefined) throw new PortalError('upstream returned an invalid JSON response', 'upstream_response', 502)
    return { payload, response }
  } catch (error) {
    if (error instanceof PortalError) throw error
    if (signal.aborted) throw new PortalError('TokenBank request timed out', 'upstream_timeout', 504)
    throw new PortalError('could not read the TokenBank response', 'upstream_unavailable', 502)
  }
}

async function callRaw(baseUrl, path, { method = 'GET', body, sessionToken } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sessionToken) headers.Cookie = `${COOKIE}=${sessionToken}`
  const { payload, response } = await fetchJson(normalizeBaseUrl(baseUrl) + PORTAL + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) throw new PortalError('TokenBank rejected the request', 'portal_rejected', 422)
    return { data: payload.data, response }
  }
  return { data: payload, response }
}

async function call(baseUrl, path, options) { return (await callRaw(baseUrl, path, options)).data }

function sessionFromResponse(response, expiresMS, now = Date.now()) {
  const millis = Number(expiresMS)
  const supplied = Number.isFinite(millis) && millis > 0 ? (millis >= 1e12 ? millis : now + millis) : 0
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(';')
    const match = /^tb_portal_session=([^\s,;]+)$/.exec(pair.trim())
    if (!match) continue
    let maxAge
    let expires
    for (const part of attributes) {
      const [name, ...rest] = part.trim().split('=')
      const value = rest.join('=')
      if (name.toLowerCase() === 'max-age' && /^-?\d+$/.test(value)) maxAge = Number(value)
      if (name.toLowerCase() === 'expires') expires = Date.parse(value)
    }
    const cookieExpiry = Number.isFinite(maxAge) ? now + Math.max(0, maxAge) * 1000 : Number.isFinite(expires) ? expires : 0
    const expiresAtMS = supplied && cookieExpiry ? Math.min(supplied, cookieExpiry) : supplied || cookieExpiry
    return { sessionToken: match[1], expiresAtMS }
  }
  return { sessionToken: '', expiresAtMS: 0 }
}

export async function registerWithSession(baseUrl, { email, code, password, displayName }) {
  const { data, response } = await callRaw(baseUrl, '/register', {
    method: 'POST', body: { email, code, password, display_name: displayName ?? '' },
  })
  return { user: data?.user, accessKey: data?.access_key, ...sessionFromResponse(response, data?.session_expires_ms) }
}

export async function loginWithSession(baseUrl, { email, password, captchaId, captchaCode }) {
  const { data, response } = await callRaw(baseUrl, '/login', {
    method: 'POST', body: { email, password, captcha_id: captchaId, captcha_code: captchaCode },
  })
  return { user: data?.user, ...sessionFromResponse(response, data?.session_expires_ms) }
}

export const sendCode = (baseUrl, email) => call(baseUrl, '/register/send-code', { method: 'POST', body: { email, purpose: 'register' } })
export const newCaptcha = (baseUrl) => call(baseUrl, '/captcha')
export const me = (baseUrl, sessionToken) => call(baseUrl, '/me', { sessionToken })
export const updateProfile = (baseUrl, sessionToken, displayName) =>
  call(baseUrl, '/me', { method: 'PUT', body: { display_name: displayName }, sessionToken })
export const listAccessKeys = (baseUrl, sessionToken) => call(baseUrl, '/access-keys', { sessionToken })
export const revealAccessKey = (baseUrl, sessionToken, id) => call(baseUrl, `/access-keys/${encodeURIComponent(id)}/key`, { sessionToken })
export const createAccessKey = async (baseUrl, sessionToken, name) => {
  const data = await call(baseUrl, '/access-keys', { method: 'POST', body: { name }, sessionToken })
  return data?.key_value
}

export async function listGatewayModels(baseUrl, accessKey) {
  const { payload } = await fetchJson(normalizeBaseUrl(baseUrl) + '/v1/models', { headers: { Authorization: `Bearer ${accessKey}` } })
  if (!Array.isArray(payload?.data)) throw new PortalError('upstream model catalog is invalid', 'upstream_response', 502)
  return payload.data
}

export async function portalModels(baseUrl, sessionToken) {
  const data = await call(baseUrl, '/models', { sessionToken })
  return Array.isArray(data) ? data : Array.isArray(data?.groups) ? data.groups : []
}

export const checkinStatus = (baseUrl, sessionToken) => call(baseUrl, '/checkin/status', { sessionToken })
export const doCheckin = (baseUrl, sessionToken) => call(baseUrl, '/checkin', { method: 'POST', sessionToken })
