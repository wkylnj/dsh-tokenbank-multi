import { HttpError, readResponseBytes, retryAfterMs } from '../../http.js'

const SITE = 'https://xingchiapi.com'
const API = `${SITE}/api/v1`
export const XINGCHI_GATEWAY = 'https://api.xingchiapi.com'
const RESPONSE_LIMIT = 2 * 1024 * 1024
const TIMEOUT_MS = 20_000

/**
 * Extends HttpError so the shared panel handler recognises it: an upstream 401
 * must reach the panel as 401, not be flattened into an opaque 500.
 */
export class XingchiError extends HttpError {
  constructor(message, code, status, reason) {
    super(status, message, code)
    this.name = 'XingchiError'
    this.reason = reason
  }
}

/**
 * XingChi is a sub2api instance: user endpoints take a JWT Bearer token, the
 * model gateway takes an `sk-` API key. The two are not interchangeable.
 */
async function request(url, { method = 'GET', body, token } = {}) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const response = await fetch(url, {
      method, headers, redirect: 'manual', signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {})
      throw new XingchiError('upstream redirect refused', 'upstream_redirect', 502)
    }
    const bytes = await readResponseBytes(response, RESPONSE_LIMIT, signal)
    let payload
    try { payload = JSON.parse(bytes.toString('utf8')) } catch { /* keep HTTP status below */ }
    if (!response.ok) {
      const message = typeof payload?.message === 'string' ? payload.message : `upstream returned HTTP ${response.status}`
      const error = new XingchiError(message, payload?.reason ?? payload?.code ?? 'upstream_rejected', response.status, payload?.reason)
      error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'))
      throw error
    }
    if (payload === undefined) throw new XingchiError('upstream returned an invalid JSON response', 'upstream_response', 502)
    return payload
  } catch (error) {
    if (error instanceof XingchiError) throw error
    if (signal.aborted) throw new XingchiError('XingChi request timed out', 'upstream_timeout', 504)
    throw new XingchiError('could not read the XingChi response', 'upstream_unavailable', 502)
  }
}

/** Every sub2api response wraps its body in `{ code, message, data }`. */
function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) {
      throw new XingchiError(
        typeof payload.message === 'string' ? payload.message : 'XingChi rejected the request',
        payload.reason ?? 'rejected', 422, payload.reason,
      )
    }
    return payload.data
  }
  return payload
}

/**
 * Rotate a refresh token. The old token is consumed immediately, so the caller
 * must persist the returned pair before doing anything else.
 */
export async function refreshToken(refresh) {
  const data = unwrap(await request(`${API}/auth/refresh`, { method: 'POST', body: { refresh_token: refresh } }))
  if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') {
    throw new XingchiError('XingChi returned an incomplete token pair', 'upstream_response', 502)
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number.isFinite(data.expires_in) ? data.expires_in : 86400,
  }
}

export async function profile(accessToken) {
  const data = unwrap(await request(`${API}/user/profile`, { token: accessToken }))
  return {
    id: data?.id,
    email: typeof data?.email === 'string' ? data.email : '',
    balance: Number.isFinite(data?.balance) ? data.balance : 0,
    status: typeof data?.status === 'string' ? data.status : '',
    concurrency: Number.isFinite(data?.concurrency) ? data.concurrency : 0,
  }
}

export async function checkinStatus(accessToken) {
  const data = unwrap(await request(`${API}/user/checkin`, { token: accessToken }))
  return {
    enabled: data?.enabled !== false,
    amount: Number.isFinite(data?.amount) ? data.amount : 0,
    claimedToday: data?.claimed_today === true,
    today: typeof data?.today === 'string' ? data.today : '',
    lastCheckinDate: typeof data?.last_checkin_date === 'string' ? data.last_checkin_date : '',
    totalCount: Number.isFinite(data?.total_count) ? data.total_count : 0,
    totalAmount: Number.isFinite(data?.total_amount) ? data.total_amount : 0,
    nextClaimAt: typeof data?.next_claim_at === 'string' ? data.next_claim_at : '',
  }
}

/** Returns `{ claimed, amount, alreadyClaimed }`; a repeat claim is not an error. */
export async function claimCheckin(accessToken) {
  try {
    const data = unwrap(await request(`${API}/user/checkin`, { method: 'POST', body: {}, token: accessToken }))
    return { claimed: true, amount: Number.isFinite(data?.amount) ? data.amount : 0, alreadyClaimed: false }
  } catch (error) {
    if (error instanceof XingchiError && (error.status === 409 || error.reason === 'CHECKIN_ALREADY_CLAIMED')) {
      return { claimed: false, amount: 0, alreadyClaimed: true }
    }
    throw error
  }
}

export async function listKeys(accessToken) {
  const data = unwrap(await request(`${API}/keys`, { token: accessToken }))
  const items = Array.isArray(data?.items) ? data.items : []
  return items.map((item) => ({
    id: item?.id,
    name: typeof item?.name === 'string' ? item.name : '',
    // sub2api returns the plaintext key on every list call, unlike TokenBank.
    key: typeof item?.key === 'string' ? item.key : '',
    status: typeof item?.status === 'string' ? item.status : '',
    groupId: item?.group_id ?? null,
    groupName: typeof item?.group?.name === 'string' ? item.group.name : '',
    groupPlatform: typeof item?.group?.platform === 'string' ? item.group.platform : '',
  }))
}

/** Groups this account may put a key into. */
export async function listGroups(accessToken) {
  const data = unwrap(await request(`${API}/groups/available`, { token: accessToken }))
  const items = Array.isArray(data) ? data : []
  return items
    .filter((item) => Number.isFinite(item?.id) && item?.status === 'active')
    .map((item) => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : '',
      platform: typeof item.platform === 'string' ? item.platform : '',
    }))
}

/**
 * Create a key when the account has none. Returns the plaintext value.
 * `groupId` matters: a key that belongs to no group is rejected by the gateway
 * with 403 "API Key is not assigned to any group", so callers should pass one.
 */
export async function createKey(accessToken, name, groupId) {
  const body = { name: String(name || 'dsh').slice(0, 64) }
  if (Number.isFinite(groupId)) body.group_id = groupId
  const data = unwrap(await request(`${API}/keys`, { method: 'POST', token: accessToken, body }))
  return {
    id: data?.id ?? null,
    key: typeof data?.key === 'string' ? data.key : '',
    name: data?.name ?? '',
    groupId: data?.group_id ?? null,
  }
}

/** Attach an existing key to a group; sub2api returns the plaintext key again. */
export async function assignGroup(accessToken, keyId, groupId) {
  const data = unwrap(await request(`${API}/keys/${keyId}`, {
    method: 'PUT', token: accessToken, body: { group_id: groupId },
  }))
  return {
    id: data?.id ?? keyId,
    key: typeof data?.key === 'string' ? data.key : '',
    groupId: data?.group_id ?? null,
  }
}

/** Model list lives on the gateway origin and takes the `sk-` key, not the JWT. */
export async function listModels(apiKey) {
  const payload = await request(`${XINGCHI_GATEWAY}/v1/models`, { token: apiKey })
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
  return items
    .filter((item) => typeof item?.id === 'string' && item.id)
    .map((item) => ({
      id: item.id,
      displayName: typeof item.display_name === 'string' ? item.display_name : '',
      ownedBy: typeof item.owned_by === 'string' ? item.owned_by : '',
    }))
}

export const SITE_URL = SITE
