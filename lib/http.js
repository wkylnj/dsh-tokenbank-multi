import { timingSafeEqual } from 'node:crypto'

export const DEFAULT_BASE_URL = 'https://bank.skillpie.cn'

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function normalizeBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || /[?#]/.test(raw)) throw new Error('invalid upstream URL')
  const url = new URL(raw.trim())
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('expected HTTPS or loopback HTTP, without credentials')
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export function isJson(headers) {
  const type = headers?.['content-type']
  return typeof type === 'string' && type.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

export function sendJson(res, status, payload, extraHeaders) {
  if (res.destroyed || res.writableEnded) return
  if (res.headersSent) { res.destroy(); return }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders })
  res.end(JSON.stringify(payload))
}

/** Byte-counted, one-shot body read. Keep the socket alive long enough to send 413. */
export function readBody(req, limit, signal) {
  const overflow = () => new HttpError(413, 'request body too large', 'body_too_large')
  if (Number(req.headers?.['content-length']) > limit) return Promise.reject(overflow())
  return new Promise((resolve, reject) => {
    if (signal?.aborted || req.aborted) { reject(signal?.reason ?? new Error('request closed')); return }
    const chunks = []
    let size = 0
    function cleanup() {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onAborted)
      signal?.removeEventListener('abort', onAbort)
    }
    function onError(error) { cleanup(); reject(error) }
    function onAbort() { req.pause(); onError(signal.reason) }
    function onAborted() { onError(new Error('request closed')) }
    function onData(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.byteLength
      if (size > limit) {
        req.pause()
        onError(overflow())
        return
      }
      chunks.push(bytes)
    }
    function onEnd() { cleanup(); resolve(Buffer.concat(chunks, size)) }
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    req.once('aborted', onAborted)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function readResponseBytes(response, limit, signal) {
  signal?.throwIfAborted()
  if (Number(response.headers.get('content-length')) > limit) {
    void response.body?.cancel().catch(() => {})
    throw new Error('upstream response is too large')
  }
  if (response.body === null) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) return Buffer.concat(chunks, size)
      size += value.byteLength
      if (size > limit) throw new Error('upstream response is too large')
      chunks.push(value)
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** HTTP Retry-After: delta-seconds or an HTTP date. Limit retained cooldown state. */
export function retryAfterMs(raw, now = Date.now()) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = raw.trim()
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : /^\w{3},\s/.test(value) ? Date.parse(value) - now : NaN
  if (Number.isNaN(ms)) return null
  return Math.min(24 * 60 * 60_000, Math.max(0, ms))
}

export function hasGatewayToken(headers, token) {
  if (typeof token !== 'string' || !token) return false
  const apiKey = headers?.['x-api-key']
  const authorization = headers?.authorization
  const bearer = typeof authorization === 'string' ? /^Bearer ([^\s,]+)$/i.exec(authorization)?.[1] : undefined
  const expected = Buffer.from(token)
  const same = (candidate) => {
    if (typeof candidate !== 'string' || candidate.length !== token.length) return false
    const bytes = Buffer.from(candidate)
    return bytes.length === expected.length && timingSafeEqual(bytes, expected)
  }
  if (apiKey !== undefined && !same(apiKey)) return false
  if (authorization !== undefined && !same(bearer)) return false
  return apiKey !== undefined || authorization !== undefined
}
