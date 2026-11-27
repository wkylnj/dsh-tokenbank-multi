import { HttpError, readResponseBytes, retryAfterMs } from '../../http.js'

// dwai 把前端和 API 都放在同一个域名下（dwai.cloud 本身不解析）。
const SITE = 'https://api.dwai.cloud'
const API = `${SITE}/api/v1`
export const DWAI_GATEWAY = SITE
const RESPONSE_LIMIT = 2 * 1024 * 1024
const TIMEOUT_MS = 20_000

/**
 * 继承 HttpError，共享面板处理器才会采信它的状态码：上游 401 必须原样到面板，
 * 不能被压成 500 的脱敏文案。
 */
export class DwaiError extends HttpError {
  constructor(message, code, status, reason) {
    super(status, message, code)
    this.name = 'DwaiError'
    this.reason = reason
  }
}

/** dwai 也是 sub2api：用户接口收 JWT，模型网关收 `sk-` key，两者不通用。 */
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
      throw new DwaiError('upstream redirect refused', 'upstream_redirect', 502)
    }
    const bytes = await readResponseBytes(response, RESPONSE_LIMIT, signal)
    let payload
    try { payload = JSON.parse(bytes.toString('utf8')) } catch { /* 保留 HTTP 状态码 */ }
    if (!response.ok) {
      // 网关的错误体是 { error: { message, code } }，门户的是 { code, message, reason }。
      const nested = payload?.error && typeof payload.error === 'object' ? payload.error : null
      const message = typeof nested?.message === 'string' ? nested.message
        : typeof payload?.message === 'string' ? payload.message
          : `upstream returned HTTP ${response.status}`
      const code = nested?.code ?? payload?.reason ?? payload?.code ?? 'upstream_rejected'
      const error = new DwaiError(message, code, response.status, payload?.reason)
      error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'))
      throw error
    }
    if (payload === undefined) throw new DwaiError('upstream returned an invalid JSON response', 'upstream_response', 502)
    return payload
  } catch (error) {
    if (error instanceof DwaiError) throw error
    if (signal.aborted) throw new DwaiError('dwai request timed out', 'upstream_timeout', 504)
    throw new DwaiError('could not read the dwai response', 'upstream_unavailable', 502)
  }
}

/** 门户接口统一包在 `{ code, message, data }` 里。 */
function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) {
      throw new DwaiError(
        typeof payload.message === 'string' ? payload.message : 'dwai rejected the request',
        payload.reason ?? 'rejected', 422, payload.reason,
      )
    }
    return payload.data
  }
  return payload
}

/**
 * 轮换 refresh token。旧 token 立刻作废，调用方必须在做别的请求之前把新的
 * 一对落盘，否则这个账号就彻底登出了。
 */
export async function refreshToken(refresh) {
  const data = unwrap(await request(`${API}/auth/refresh`, { method: 'POST', body: { refresh_token: refresh } }))
  if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') {
    throw new DwaiError('dwai returned an incomplete token pair', 'upstream_response', 502)
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
    // dwai 的余额是美元浮点，不是 TokenBank 那种纳美元整数。
    balance: Number.isFinite(data?.balance) ? data.balance : 0,
    status: typeof data?.status === 'string' ? data.status : '',
    concurrency: Number.isFinite(data?.concurrency) ? data.concurrency : 0,
  }
}

/**
 * 签到总览。与星驰的字段名完全不同：这里是 checked_in / today_amount /
 * total_days / streak_days，领取要带上具体日期。
 */
export async function checkinStatus(accessToken) {
  const data = unwrap(await request(`${API}/user/checkin`, { token: accessToken }))
  return {
    enabled: data?.enabled !== false,
    eligible: data?.eligible !== false,
    claimedToday: data?.checked_in === true,
    canCheckin: data?.can_checkin === true,
    today: typeof data?.today === 'string' ? data.today : '',
    todayAmount: Number.isFinite(data?.today_amount) ? data.today_amount : 0,
    minAmount: Number.isFinite(data?.min_amount) ? data.min_amount : 0,
    maxAmount: Number.isFinite(data?.max_amount) ? data.max_amount : 0,
    totalDays: Number.isFinite(data?.total_days) ? data.total_days : 0,
    totalAmount: Number.isFinite(data?.total_amount) ? data.total_amount : 0,
    streakDays: Number.isFinite(data?.streak_days) ? data.streak_days : 0,
    streakInterval: Number.isFinite(data?.streak_interval) ? data.streak_interval : 0,
    nextResetAt: typeof data?.next_reset_at === 'string' ? data.next_reset_at : '',
  }
}

/**
 * 领取签到。`day` 必须是 YYYY-MM-DD，通常是总览里的 `today`。
 * 重复领取不是错误：上游会回 already_checked_in，这里折算成 alreadyClaimed。
 */
export async function claimCheckin(accessToken, day) {
  try {
    const data = unwrap(await request(`${API}/user/checkin`, {
      method: 'POST', token: accessToken, body: { day },
    }))
    return {
      claimed: data?.already_checked_in !== true,
      amount: Number.isFinite(data?.amount) ? data.amount : 0,
      alreadyClaimed: data?.already_checked_in === true,
      source: typeof data?.source === 'string' ? data.source : '',
    }
  } catch (error) {
    if (error instanceof DwaiError && (error.status === 409 || /already/i.test(String(error.reason ?? '')))) {
      return { claimed: false, amount: 0, alreadyClaimed: true, source: '' }
    }
    throw error
  }
}

/** dwai 的 key 列表分页，返回体是 { items, total, page, page_size, pages }。 */
export async function listKeys(accessToken) {
  const data = unwrap(await request(`${API}/keys?page=1&page_size=100`, { token: accessToken }))
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  return items.map((item) => ({
    id: item?.id,
    name: typeof item?.name === 'string' ? item.name : '',
    // sub2api 每次列表都回明文 key，不像 TokenBank 只给一次。
    key: typeof item?.key === 'string' ? item.key : '',
    status: typeof item?.status === 'string' ? item.status : '',
    groupId: item?.group_id ?? null,
    groupName: typeof item?.group?.name === 'string' ? item.group.name : '',
    groupPlatform: typeof item?.group?.platform === 'string' ? item.group.platform : '',
  }))
}

/** 这个账号可以放 key 的分组。 */
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
 * 建 key。`groupId` 很重要：dwai 会拒绝没有分组的 key（网关 403
 * GROUP_DELETED / 未分配分组），所以调用方必须显式给一个。
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

/** 把已有 key 挂到分组上；sub2api 会把明文 key 再回一遍。 */
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

/**
 * 模型列表在网关域名上，用 `sk-` key 而不是 JWT。
 * dwai 不校验客户端 UA，所以这里不需要像星驰那样伪装 User-Agent。
 */
export async function listModels(apiKey) {
  const payload = await request(`${DWAI_GATEWAY}/v1/models`, { token: apiKey })
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
