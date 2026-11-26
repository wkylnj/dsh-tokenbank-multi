/**
 * 第二轮隔离测试：账号事务、签到、余额、流式转发、面板错误映射。
 * 不访问真实 TokenBank，全部用内存凭据 + 本地 mock 上游。
 */
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '').replace(/\\/g, '/')
const index = await import(`file:///${ROOT}/lib/index.js`)
const store = await import(`file:///${ROOT}/lib/store.js`)
const gatewayMod = await import(`file:///${ROOT}/lib/gateway.js`)
const http = await import(`file:///${ROOT}/lib/http.js`)

let pass = 0
const fails = []
function ok(condition, label, extra) {
  if (condition) { pass += 1; return }
  fails.push(`${label}${extra === undefined ? '' : ' :: ' + JSON.stringify(extra)}`)
}
function eq(actual, expected, label) { ok(Object.is(actual, expected), label, { actual, expected }) }
async function rejects(fn, label, check) {
  try { await fn() } catch (error) { ok(check ? check(error) : true, label, { message: error?.message, code: error?.code }); return }
  ok(false, label, 'expected a rejection')
}

function fakeCredentials(initial = {}) {
  const records = new Map(Object.entries(initial))
  const kv = new Map()
  let chain = Promise.resolve()
  return {
    records, kv,
    async readRecord(key) { return records.get(key) },
    modifyRecord(key, mutate) {
      const run = chain.then(async () => {
        const next = await mutate(records.get(key))
        if (next !== undefined) records.set(key, next)
        return records.get(key)
      })
      chain = run.then(() => undefined, () => undefined)
      return run
    },
    async deleteRecord(key) { records.delete(key) },
    async resolve(ref) { return kv.has(ref) ? { value: kv.get(ref), source: 'record' } : undefined },
    async set(ref, value) { kv.set(ref, value) },
    async unset(ref) { kv.delete(ref) },
  }
}

function fakeSettings(value = {}) {
  const state = { value, revision: 1 }
  return {
    state,
    describe() { return [{ ns: 'llm-pi-ai', revision: state.revision, value: state.value }] },
    async mutate(_ns, ops, revision) {
      if (revision !== state.revision) throw new Error('settings/conflict')
      for (const op of ops) {
        if (op.op === 'unset') continue
        let node = state.value
        for (let i = 0; i < op.path.length - 1; i += 1) {
          if (!node[op.path[i]] || typeof node[op.path[i]] !== 'object') node[op.path[i]] = {}
          node = node[op.path[i]]
        }
        node[op.path[op.path.length - 1]] = op.value
      }
      state.revision += 1
    },
  }
}

function listen(handler) {
  const server = createServer(handler)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    resolve({ server, port, url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) })
  }))
}

/** 用一个本地 HTTP 服务冒充 TokenBank 门户，按路由返回预置响应。 */
function portal(routes) {
  const calls = []
  return listen((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
      calls.push({ method: req.method, path: url.pathname, body, cookie: req.headers.cookie })
      const handler = routes[`${req.method} ${url.pathname}`] ?? routes[url.pathname]
      if (!handler) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"code":"NOT_FOUND"}'); return }
      const result = handler({ url, body, req })
      if (result === undefined) { res.writeHead(500); res.end('{}'); return }
      const { status = 200, payload, headers = {}, cookie } = result
      const finalHeaders = { 'content-type': 'application/json', ...headers }
      if (cookie) finalHeaders['set-cookie'] = cookie
      res.writeHead(status, finalHeaders)
      res.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
    })
  }).then((listener) => ({ ...listener, calls }))
}

function session(expiresMS) {
  return {
    status: 200,
    headers: {},
    cookie: `tb_portal_session=sess-${Math.random().toString(16).slice(2)}; Path=/; HttpOnly; Max-Age=${Math.floor(expiresMS / 1000)}`,
    payload: { code: 0, data: { user: { email: 'a@x.com', display_name: 'A' }, session_expires_ms: expiresMS, access_key: 'sk-a' } },
  }
}

/* ── 登录 / 注册事务 ─────────────────────────────────────────────────── */

{
  const upstream = await portal({
    'POST /api/portal/login': () => session(3_600_000),
    'GET /api/portal/me': () => ({ payload: { code: 0, data: { user: { email: 'a@x.com', display_name: 'A' }, account: { balance_nano_usd: 5_000_000_000 } } } }),
    'GET /api/portal/captcha': () => ({ payload: { code: 0, data: { captcha_id: 'c1', image: 'data:image/png;base64,iVBORw0KGgo=' } } }),
    'GET /api/portal/access-keys': () => ({ payload: { code: 0, data: { keys: [{ id: 1, status: 'active' }] } } }),
    'GET /api/portal/access-keys/1/key': () => ({ payload: { code: 0, data: { key: 'sk-from-reveal' } } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()

  const captcha = await controller.dispatch({ action: 'captcha' })
  eq(captcha.ok, true, 'login: 拿到验证码')
  eq(captcha.captchaId, 'c1', 'login: captcha id')
  ok(captcha.image.startsWith('data:image/png;base64,'), 'login: 图片是 data URL')

  const signed = await controller.dispatch({
    action: 'login', email: 'a@x.com', password: 'pw', captchaId: 'c1', captchaCode: 'abcd',
  })
  eq(signed.ok, true, 'login: 成功')
  eq(signed.accounts.length, 1, 'login: 写入一个账号')
  eq(signed.accounts[0].email, 'a@x.com', 'login: 邮箱正确')
  eq(signed.accounts[0].keyReady, true, 'login: 自动补齐访问密钥')

  const latest = await controller.dispatch({ action: 'status' })
  eq(latest.loggedIn, true, 'login: status 显示已登录')
  eq(latest.account.balance_nano_usd, 5_000_000_000, 'login: 读到余额')
  eq(latest.user.display_name, 'A', 'login: 读到昵称')

  const stored = credentials.records.get('dsh-tokenbank/accounts')
  ok(!JSON.stringify(stored).includes('pw'), 'login: 不落盘密码')
  ok(JSON.stringify(stored).includes('sk-from-reveal'), 'login: 落盘访问密钥')
  // 会话令牌需要落盘（否则重启后无法刷新），但绝不能出现在 publicAccount 的公开层。
  const publicView = await controller.dispatch({ action: 'status' })
  ok(!JSON.stringify(publicView).includes('sess-'), 'login: 会话不进入公开字段')
  await upstream.close()
}

// 注册：门户不回 access_key 时也要补齐
{
  const upstream = await portal({
    'POST /api/portal/register': () => ({
      status: 200, cookie: 'tb_portal_session=sess-reg; Path=/; Max-Age=3600',
      payload: { code: 0, data: { user: { email: 'new@x.com', display_name: 'New' }, session_expires_ms: 3_600_000 } },
    }),
    'GET /api/portal/me': () => ({ payload: { code: 0, data: { user: { email: 'new@x.com', display_name: 'New' }, account: { balance_nano_usd: 0 } } } }),
    'GET /api/portal/access-keys': () => ({ payload: { code: 0, data: { keys: [] } } }),
    'POST /api/portal/access-keys': () => ({ payload: { code: 0, data: { key: { id: 9 }, key_value: 'sk-created' } } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  const res = await controller.dispatch({ action: 'register', email: 'new@x.com', password: 'pw', code: '123456', displayName: 'New' })
  eq(res.ok, true, 'register: 成功')
  eq(res.accounts[0].keyReady, true, 'register: 门户不回 key 时自动创建')
  ok(JSON.stringify(credentials.records.get('dsh-tokenbank/accounts')).includes('sk-created'), 'register: 新 key 落盘')
  await upstream.close()
}

// 登录失败：门户 401 不应留下半个账号
{
  const upstream = await portal({
    'POST /api/portal/login': () => ({ status: 401, payload: { code: 401, message: 'bad credentials' } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  await rejects(async () => controller.dispatch({ action: 'login', email: 'a@x.com', password: 'pw', captchaId: 'c', captchaCode: 'x' }),
    'login: 凭据错误时报错', (error) => error.status === 401)
  eq((await controller.dispatch({ action: 'status' })).accounts.length, 0, 'login: 失败后不留账号')
  await upstream.close()
}

/* ── 多账号：切换、移除、池子 ────────────────────────────────────────── */

{
  // 必须用本地 mock 上游：真实域名会让 status 真的发请求，401 会把账号标成过期。
  const upstream = await portal({
    'GET /api/portal/me': () => ({ payload: { code: 0, data: { user: { email: 'a@x.com' }, account: { balance_nano_usd: 1_000_000_000 } } } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  const now = Date.now()
  await credentials.modifyRecord('dsh-tokenbank/accounts', async () => ({
    kind: 'grant',
    payload: {
      version: 2,
      stores: [{
        baseUrl: upstream.url,
        store: {
          activeId: 'a@x.com',
          accounts: [
            { id: 'a@x.com', email: 'a@x.com', displayName: 'A', sessionToken: 'sa', accessKey: 'sk-a', expiresAtMS: now + 3_600_000, pool: true },
            { id: 'b@x.com', email: 'b@x.com', displayName: 'B', sessionToken: 'sb', accessKey: 'sk-b', expiresAtMS: now + 3_600_000, pool: true },
            { id: 'c@x.com', email: 'c@x.com', displayName: 'C', sessionToken: 'sc', accessKey: 'sk-c', expiresAtMS: now - 1000, pool: true },
          ],
          autoCheckin: { enabled: false, lastDay: '' },
          gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 },
        },
      }],
    },
  }))

  const pool = await controller.pool()
  eq(pool.accounts.length, 2, 'pool: 过期账号被排除')
  ok(!pool.accounts.some((item) => item.id === 'c@x.com'), 'pool: 不含过期账号')

  await rejects(async () => controller.dispatch({ action: 'switch', id: 'c@x.com' }), 'switch: 拒绝切到过期账号',
    (error) => error.code === 'session_expired')
  eq((await controller.dispatch({ action: 'status' })).activeId, 'a@x.com', 'switch: 拒绝后 activeId 不变')

  const switched = await controller.dispatch({ action: 'switch', id: 'b@x.com' })
  eq(switched.activeId, 'b@x.com', 'switch: 切换成功')

  const off = await controller.dispatch({ action: 'account-pool', id: 'b@x.com', pool: false })
  eq(off.pool, false, 'pool: 关闭入池')
  eq((await controller.pool()).accounts.length, 1, 'pool: 关闭后池子减少')
  const view = await controller.dispatch({ action: 'gateway-status' })
  eq(view.poolCount, 1, 'gateway-status: poolCount 反映开关')
  ok(!view.pool.includes('b@x.com'), 'gateway-status: pool 列表不含已关闭账号')

  await controller.dispatch({ action: 'remove', id: 'b@x.com' })
  const after = await controller.dispatch({ action: 'status' })
  eq(after.accounts.length, 2, 'remove: 移除一个账号')
  eq(after.activeId, 'a@x.com', 'remove: 自动切到存活账号')

  await rejects(async () => controller.dispatch({ action: 'account-pool', id: 'nope@x.com', pool: true }), 'pool: 未知账号报错',
    (error) => error.code === 'account_not_found')
  await upstream.close()
}

/* ── 签到：去重、失败不记完成 ────────────────────────────────────────── */

{
  let checkinCount = 0
  const upstream = await portal({
    'GET /api/portal/checkin/status': () => ({ payload: { code: 0, data: { enabled: true, checked_today: false, streak: 2, amount_nano_usd: 100_000_000 } } }),
    'POST /api/portal/checkin': () => { checkinCount += 1; return { payload: { code: 0, data: { checked_today: true, streak: 3, amount_nano_usd: 100_000_000 } } } },
    'GET /api/portal/me': () => ({ payload: { code: 0, data: { user: { email: 'a@x.com' }, account: { balance_nano_usd: 1_000_000_000 } } } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  await credentials.modifyRecord('dsh-tokenbank/accounts', async () => ({
    kind: 'grant',
    payload: {
      version: 2,
      stores: [{
        baseUrl: upstream.url,
        store: {
          activeId: 'a@x.com',
          accounts: [{ id: 'a@x.com', email: 'a@x.com', displayName: 'A', sessionToken: 'sa', accessKey: 'sk-a', expiresAtMS: Date.now() + 3_600_000, pool: true }],
          autoCheckin: { enabled: false, lastDay: '' },
          gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 },
        },
      }],
    },
  }))

  const one = await controller.dispatch({ action: 'checkin-do' })
  eq(one.status, 'checked', 'checkin: 首次签到成功')
  eq(checkinCount, 1, 'checkin: 只请求一次')

  const all = await controller.dispatch({ action: 'checkin-all' })
  eq(all.checkedCount + all.alreadyCount, 1, 'checkin-all: 覆盖唯一账号')
  ok(checkinCount <= 2, 'checkin-all: 不重复签到', checkinCount)
  await upstream.close()
}

// 签到失败时不标记今日完成
{
  const upstream = await portal({
    'GET /api/portal/checkin/status': () => ({ payload: { code: 0, data: { enabled: true, checked_today: false, streak: 0, amount_nano_usd: 0 } } }),
    'POST /api/portal/checkin': () => ({ status: 500, payload: { code: 500, message: 'boom' } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  await credentials.modifyRecord('dsh-tokenbank/accounts', async () => ({
    kind: 'grant',
    payload: {
      version: 2,
      stores: [{
        baseUrl: upstream.url,
        store: {
          activeId: 'a@x.com',
          accounts: [{ id: 'a@x.com', email: 'a@x.com', displayName: 'A', sessionToken: 'sa', accessKey: 'sk-a', expiresAtMS: Date.now() + 3_600_000, pool: true }],
          autoCheckin: { enabled: true, lastDay: '' },
          gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 },
        },
      }],
    },
  }))
  const summary = await controller.autoTick()
  ok(summary && summary.failedCount === 1, 'autoCheckin: 失败计数', summary)
  const state = await controller.dispatch({ action: 'settings-get' })
  eq(state.autoCheckin.todayDone, false, 'autoCheckin: 失败不记今日完成')
  await upstream.close()
}

/* ── 余额：部分失败仍给出已知值 ──────────────────────────────────────── */

{
  let n = 0
  const upstream = await portal({
    'GET /api/portal/me': () => {
      n += 1
      if (n === 2) return { status: 500, payload: { code: 500 } }
      return { payload: { code: 0, data: { user: { email: 'a@x.com' }, account: { balance_nano_usd: 2_000_000_000 } } } }
    },
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  await credentials.modifyRecord('dsh-tokenbank/accounts', async () => ({
    kind: 'grant',
    payload: {
      version: 2,
      stores: [{
        baseUrl: upstream.url,
        store: {
          activeId: 'a@x.com',
          accounts: [
            { id: 'a@x.com', email: 'a@x.com', displayName: 'A', sessionToken: 'sa', accessKey: 'sk-a', expiresAtMS: Date.now() + 3_600_000, pool: true },
            { id: 'b@x.com', email: 'b@x.com', displayName: 'B', sessionToken: 'sb', accessKey: 'sk-b', expiresAtMS: Date.now() + 3_600_000, pool: true },
          ],
          autoCheckin: { enabled: false, lastDay: '' },
          gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 },
        },
      }],
    },
  }))
  const result = await controller.dispatch({ action: 'accounts-balance' })
  eq(result.accountCount, 2, 'balance: 账号总数')
  eq(result.knownCount, 1, 'balance: 已知一个')
  eq(Object.values(result.balances).filter((v) => v === null).length, 1, 'balance: 失败账号为 null')
  await upstream.close()
}

/* ── 会话失效：401 标记 authExpired ──────────────────────────────────── */

{
  const upstream = await portal({
    'GET /api/portal/me': () => ({ status: 401, payload: { code: 401 } }),
  })
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: upstream.url,
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()
  await credentials.modifyRecord('dsh-tokenbank/accounts', async () => ({
    kind: 'grant',
    payload: {
      version: 2,
      stores: [{
        baseUrl: upstream.url,
        store: {
          activeId: 'a@x.com',
          accounts: [{ id: 'a@x.com', email: 'a@x.com', displayName: 'A', sessionToken: 'sa', accessKey: 'sk-a', expiresAtMS: Date.now() + 3_600_000, pool: true }],
          autoCheckin: { enabled: false, lastDay: '' },
          gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30_000, cooldownMs: 60_000 },
        },
      }],
    },
  }))
  const status = await controller.dispatch({ action: 'status' })
  eq(status.loggedIn, false, 'session: 401 后判为未登录')
  eq(status.expired, true, 'session: 标记过期')
  eq(status.accounts[0].expired, true, 'session: 账号视图显示过期')
  eq((await controller.pool()).accounts.length, 0, 'session: 失效账号移出池子')
  await upstream.close()
}

/* ── 网关流式转发 ────────────────────────────────────────────────────── */

{
  const seen = []
  const gw = gatewayMod.createGateway({
    getPool: async () => ({ accounts: [{ id: 'a@x.com', accessKey: 'sk-a' }], tuning: { ...gatewayMod.DEFAULT_GATEWAY_SETTINGS } }),
    baseUrl: 'https://bank.skillpie.cn',
    token: 'tb-local-' + 'a'.repeat(64),
    fetchImpl: async (url, init) => {
      seen.push(url)
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: message_start\ndata: {"type":"message_start"}\n\n'))
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'))
            controller.close()
          }, 20)
        },
      })
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req-1' } })
    },
  })
  const listener = await listen((req, res) => { void gw.handle(req, res) })
  const res = await fetch(listener.url + '/v1/messages', {
    method: 'POST', body: '{"stream":true}',
    headers: { 'x-api-key': 'tb-local-' + 'a'.repeat(64), 'content-type': 'application/json' },
  })
  eq(res.status, 200, 'stream: 200')
  eq(res.headers.get('content-type'), 'text/event-stream', 'stream: 保留 content-type')
  eq(res.headers.get('request-id'), 'req-1', 'stream: 保留 request-id')
  eq(res.headers.get('cache-control'), 'no-store', 'stream: 强制 no-store')
  const text = await res.text()
  ok(text.includes('message_start') && text.includes('message_stop'), 'stream: 完整转发', text.slice(0, 60))
  eq(seen.length, 1, 'stream: 一次上游请求')
  await listener.close()
}

/* ── 网关：请求体超限与超大响应 ──────────────────────────────────────── */

{
  const gw = gatewayMod.createGateway({
    getPool: async () => ({ accounts: [{ id: 'a@x.com', accessKey: 'sk-a' }], tuning: { ...gatewayMod.DEFAULT_GATEWAY_SETTINGS } }),
    baseUrl: 'https://bank.skillpie.cn', token: 'tb-local-' + 'b'.repeat(64),
    fetchImpl: async () => new Response('{}', { status: 200 }),
    limits: { maxBody: 128 },
  })
  const listener = await listen((req, res) => { void gw.handle(req, res) })
  const res = await fetch(listener.url + '/v1/messages', {
    method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(1024) }),
    headers: { 'x-api-key': 'tb-local-' + 'b'.repeat(64), 'content-type': 'application/json' },
  })
  eq(res.status, 413, 'gateway: 超限 body 413')
  await listener.close()
}

{
  const gw = gatewayMod.createGateway({
    getPool: async () => ({ accounts: [{ id: 'a@x.com', accessKey: 'sk-a' }], tuning: { ...gatewayMod.DEFAULT_GATEWAY_SETTINGS } }),
    baseUrl: 'https://bank.skillpie.cn', token: 'tb-local-' + 'c'.repeat(64),
    fetchImpl: async () => new Response('x'.repeat(200 * 1024), { status: 500 }),
  })
  const listener = await listen((req, res) => { void gw.handle(req, res) })
  const res = await fetch(listener.url + '/v1/messages', {
    method: 'POST', body: '{}',
    headers: { 'x-api-key': 'tb-local-' + 'c'.repeat(64), 'content-type': 'application/json' },
  })
  eq(res.status, 500, 'gateway: 大错误体仍返回状态码')
  const text = await res.text()
  ok(text.length <= 64 * 1024 + 64, 'gateway: 错误体被截断', text.length)
  await listener.close()
}

/* ── 面板：HttpError 与 PortalError 的状态码映射 ─────────────────────── */

{
  const connection = { browserPeer: { id: 'p' }, admit: () => ({ peer: { id: 'p' } }) }
  const cases = [
    { error: new http.HttpError(409, 'conflict', 'conflict'), status: 409, label: '409' },
    { error: new http.HttpError(500, 'boom', 'boom'), status: 500, label: '500' },
    { error: new Error('unexpected'), status: 500, label: '未知错误 500' },
    { error: new http.HttpError(999, 'x', 'x'), status: 500, label: '越界状态码降级 500' },
    // 普通 Error 上的 status 不可信：只有 HttpError / PortalError 才采信状态码。
    { error: Object.assign(new Error('spoofed'), { status: 409, code: 'conflict' }), status: 500, label: '伪造状态码降级 500' },
  ]
  for (const item of cases) {
    const handler = index.createPanelHandler(connection, async () => { throw item.error })
    const listener = await listen((req, res) => { void handler(req, res) })
    const res = await fetch(listener.url + '/', {
      method: 'POST', body: '{"action":"status"}',
      headers: { 'content-type': 'application/json', 'x-dsh-tokenbank': '1' },
    })
    eq(res.status, item.status, `panel: ${item.label}`)
    const payload = await res.json()
    eq(payload.ok, false, `panel: ${item.label} ok=false`)
    if (item.status === 500) eq(payload.code, 'internal_error', `panel: ${item.label} 不泄露内部错误码`)
    await new Promise((resolve) => listener.server.close(resolve))
  }
}

/* ── 结果 ────────────────────────────────────────────────────────────── */

if (fails.length) {
  console.log(`PASS: ${pass}  FAIL: ${fails.length}`)
  for (const item of fails) console.log('  ✗ ' + item)
  process.exitCode = 1
} else {
  console.log(`PASS: ${pass}  FAIL: 0`)
}
