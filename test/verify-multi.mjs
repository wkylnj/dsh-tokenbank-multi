/**
 * 隔离回归测试：不访问真实 TokenBank、不使用真实账号、不读写真实凭据。
 * 覆盖 http.js / store.js / models.js / gateway.js / index.js（无网络路径）。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '').replace(/\\/g, '/')
const http = await import(`file:///${ROOT}/lib/http.js`)
const store = await import(`file:///${ROOT}/lib/store.js`)
const models = await import(`file:///${ROOT}/lib/models.js`)
const gatewayMod = await import(`file:///${ROOT}/lib/gateway.js`)
const index = await import(`file:///${ROOT}/lib/index.js`)

let pass = 0
const fails = []
function ok(condition, label, extra) {
  if (condition) { pass += 1; return }
  fails.push(`${label}${extra === undefined ? '' : ' :: ' + JSON.stringify(extra)}`)
}
function eq(actual, expected, label) {
  ok(Object.is(actual, expected), label, { actual, expected })
}
async function rejects(fn, label, check) {
  try { await fn() } catch (error) { ok(check ? check(error) : true, label, { message: error?.message }); return }
  ok(false, label, 'expected a rejection')
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function fakeCredentials(initial = {}) {
  const records = new Map(Object.entries(initial))
  const kv = new Map()
  // 宿主契约：modifyRecord 串行执行，回调拿到的是最新值。用一条 Promise 链模拟，
  // 否则并发写会互相覆盖，测出来的差异是替身的缺陷而不是插件的。
  let chain = Promise.resolve()
  return {
    records,
    kv,
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

/* ── http.js ─────────────────────────────────────────────────────────── */

eq(http.normalizeBaseUrl('https://bank.skillpie.cn/'), 'https://bank.skillpie.cn', 'normalize: 去掉尾部斜杠')
eq(http.normalizeBaseUrl('https://example.com/sub/'), 'https://example.com/sub', 'normalize: 保留路径')
eq(http.normalizeBaseUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080', 'normalize: 环回 http 允许')
eq(http.normalizeBaseUrl('http://localhost:9000'), 'http://localhost:9000', 'normalize: localhost 允许')
for (const bad of ['http://example.com', 'https://u:p@example.com', 'https://x.cn/?a=1', 'https://x.cn/#h', '', 'ftp://x.cn']) {
  await rejects(async () => http.normalizeBaseUrl(bad), `normalize 拒绝 ${JSON.stringify(bad)}`)
}

eq(http.retryAfterMs('3'), 3000, 'retryAfter: 秒')
eq(http.retryAfterMs('0'), 0, 'retryAfter: 0')
eq(http.retryAfterMs('abc'), null, 'retryAfter: 非法值')
eq(http.retryAfterMs(''), null, 'retryAfter: 空')
ok(http.retryAfterMs('999999') === 86_400_000, 'retryAfter: 上限 24h', http.retryAfterMs('999999'))
ok(http.isJson({ 'content-type': 'application/json; charset=utf-8' }), 'isJson: 带 charset')
ok(!http.isJson({ 'content-type': 'text/plain' }), 'isJson: 拒绝 text/plain')
ok(!http.isJson({}), 'isJson: 无 header')

const token = 'tb-local-' + 'a'.repeat(64)
ok(http.hasGatewayToken({ 'x-api-key': token }, token), 'token: x-api-key')
ok(http.hasGatewayToken({ authorization: `Bearer ${token}` }, token), 'token: bearer')
ok(!http.hasGatewayToken({ 'x-api-key': token.slice(0, -1) }, token), 'token: 长度不同拒绝')
ok(!http.hasGatewayToken({ 'x-api-key': token.slice(0, -1) + 'b' }, token), 'token: 同长不同值拒绝')
ok(!http.hasGatewayToken({}, token), 'token: 缺失拒绝')
ok(!http.hasGatewayToken({ 'x-api-key': token, authorization: `Bearer ${'c'.repeat(70)}` }, token), 'token: 两者都给时必须都对')
ok(!http.hasGatewayToken({ 'x-api-key': token }, ''), 'token: 空 token 拒绝')

/* ── store.js ────────────────────────────────────────────────────────── */

eq(store.normalizeGatewaySettings({}).requestRetryRounds, 3, 'settings: 缺省回退')
eq(store.normalizeGatewaySettings({ requestRetryRounds: 99 }).requestRetryRounds, 10, 'settings: 上限 clamp')
eq(store.normalizeGatewaySettings({ requestRetryRounds: -5 }).requestRetryRounds, 0, 'settings: 下限 clamp')
eq(store.normalizeGatewaySettings({ cooldownMs: 999_999 }).cooldownMs, 600_000, 'settings: 冷却上限')
eq(store.normalizeGatewaySettings({ maxRetryIntervalMs: Number.NaN }).maxRetryIntervalMs, 30_000, 'settings: NaN 回退')
eq(store.normalizeGatewaySettings({ cooldownMs: '500' }).cooldownMs, 60_000, 'settings: 字符串不采信')

ok(store.normalizeAccount({ email: 'a@x.com' }) === null, 'account: 无 token 丢弃')
ok(store.normalizeAccount({ sessionToken: 's' }) === null, 'account: 无邮箱丢弃')
const acc = store.normalizeAccount({ email: ' a@x.com ', sessionToken: 's', extra: 'ignored' })
eq(acc.id, 'a@x.com', 'account: id 回退邮箱')
eq(acc.pool, true, 'account: 缺省入池')
eq(acc.authExpired, false, 'account: 缺省未过期')
ok(store.normalizeAccount({ email: 'a@x.com', sessionToken: 's', pool: false }).pool === false, 'account: pool false 保留')
ok(!store.normalizeAccount({ email: 'a@x.com', sessionToken: 's' }).password, 'account: 不保留密码')

ok(store.accountLive({ sessionToken: 's' }), 'live: 无过期时间算存活')
ok(!store.accountLive({ sessionToken: 's', authExpired: true }), 'live: authExpired 算失效')
ok(!store.accountLive({ sessionToken: 's', expiresAtMS: Date.now() - 1000 }), 'live: 已过期')
ok(store.accountLive({ sessionToken: 's', expiresAtMS: Date.now() + 60_000 }), 'live: 未过期')

const pub = store.publicAccount({ id: 'a', email: 'a@x.com', displayName: 'n', sessionToken: 'SECRET', accessKey: 'sk', pool: true, addedAt: 1 }, 'a')
ok(!('sessionToken' in pub) && !('accessKey' in pub), 'publicAccount: 不泄露令牌', pub)
eq(pub.active, true, 'publicAccount: active 标记')

// 迁移：旧单账号记录 → 新版本，且清掉密码
{
  const credentials = fakeCredentials({
    'dsh-tokenbank/identity': { kind: 'grant', payload: { id: 'old@x.com', email: 'old@x.com', displayName: 'Old', sessionToken: 'sess', password: 'PLAINTEXT' } },
  })
  const scoped = store.createAccountStore(credentials, 'https://bank.skillpie.cn')
  await scoped.initialize()
  const migrated = await scoped.read()
  eq(migrated.accounts.length, 1, 'migrate: 旧账号迁入')
  eq(migrated.activeId, 'old@x.com', 'migrate: 保持 activeId')
  ok(!Object.hasOwn(credentials.records.get('dsh-tokenbank/identity').payload, 'password'), 'migrate: 旧记录密码被擦除')
  const encoded = credentials.records.get('dsh-tokenbank/accounts')
  eq(encoded.payload.version, 2, 'migrate: 记录版本 2')
  ok(!JSON.stringify(encoded).includes('PLAINTEXT'), 'migrate: 新记录不含密码')
}

// 作用域隔离：不同上游互不可见
{
  const credentials = fakeCredentials()
  const a = store.createAccountStore(credentials, 'https://bank.skillpie.cn')
  const b = store.createAccountStore(credentials, 'https://other.example.cn')
  await a.update((s) => ({ ...s, activeId: 'a@x.com', accounts: [store.normalizeAccount({ email: 'a@x.com', sessionToken: 'sa' })] }))
  eq((await b.read()).accounts.length, 0, 'scope: 另一上游看不到')
  eq((await a.read()).accounts.length, 1, 'scope: 本上游可见')
  await b.update((s) => ({ ...s, accounts: [store.normalizeAccount({ email: 'b@y.com', sessionToken: 'sb' })] }))
  const record = credentials.records.get('dsh-tokenbank/accounts')
  eq(record.payload.stores.length, 2, 'scope: 两条独立 store')
  eq((await a.read()).accounts[0].email, 'a@x.com', 'scope: 写入 B 不影响 A')
  eq((await b.read()).accounts[0].email, 'b@y.com', 'scope: B 看到自己的账号')
}

// update 使用最新值（并发安全）
{
  const credentials = fakeCredentials()
  const scoped = store.createAccountStore(credentials, 'https://bank.skillpie.cn')
  await scoped.update((s) => ({ ...s, accounts: [store.normalizeAccount({ email: 'a@x.com', sessionToken: 'sa' })] }))
  const [first, second] = await Promise.all([
    scoped.update((s) => ({ ...s, gateway: { ...s.gateway, cooldownMs: 111 } })),
    scoped.update((s) => ({ ...s, autoCheckin: { ...s.autoCheckin, enabled: true } })),
  ])
  const final = await scoped.read()
  eq(final.gateway.cooldownMs, 111, 'update: 并发写不丢 gateway')
  eq(final.autoCheckin.enabled, true, 'update: 并发写不丢 autoCheckin')
  ok(first && second, 'update: 两次都返回最新快照')
}

// upsertAccount 保留 pool / addedAt，并清空当日签到
{
  const base = { activeId: 'a@x.com', accounts: [{ ...store.normalizeAccount({ email: 'a@x.com', sessionToken: 'old' }), pool: false, addedAt: 42 }], autoCheckin: { enabled: true, lastDay: '2026-01-01' }, gateway: { ...gatewayMod.DEFAULT_GATEWAY_SETTINGS } }
  const next = store.upsertAccount(base, store.normalizeAccount({ email: 'A@x.com', sessionToken: 'new', displayName: 'N' }))
  eq(next.accounts.length, 1, 'upsert: 同账号不重复')
  eq(next.accounts[0].sessionToken, 'new', 'upsert: 更新会话')
  eq(next.accounts[0].pool, false, 'upsert: 保留 pool')
  eq(next.accounts[0].addedAt, 42, 'upsert: 保留 addedAt')
  eq(next.autoCheckin.lastDay, '', 'upsert: 清空签到日')
  eq(next.activeId, next.accounts[0].id, 'upsert: 设为当前')
}

/* ── models.js ───────────────────────────────────────────────────────── */

{
  const credentials = fakeCredentials()
  const first = await models.ensureGatewayCredential(credentials)
  ok(/^tb-local-[a-f0-9]{64}$/.test(first), 'gatewayKey: 格式正确', first.slice(0, 12))
  eq(credentials.kv.get(models.GATEWAY_KEY_REF), first, 'gatewayKey: 写入专用 ref')
  ok(!credentials.kv.has('TOKENBANK_API_KEY'), 'gatewayKey: 不碰旧 ref')
  const second = await models.ensureGatewayCredential(credentials)
  eq(second, first, 'gatewayKey: 幂等')
}

// migrate：只迁移自己拥有的 provider
{
  const localUrl = 'http://127.0.0.1:39917'
  const credentials = fakeCredentials()
  const owned = fakeSettings({ providers: { tokenbank: { apiKeyEnv: 'TOKENBANK_API_KEY', baseURL: 'https://bank.skillpie.cn', displayName: 'TokenBank', api: 'anthropic-messages', retryPolicy: { maxRetries: 5 }, models: [{ id: 'm1' }] } } })
  const manager = models.createModelManager({ settings: owned, credentials, baseUrl: 'https://bank.skillpie.cn', localUrl, isListening: () => true })
  eq(await manager.migrate(), true, 'migrate: 旧配置被迁移')
  const profile = owned.state.value.providers.tokenbank
  eq(profile.apiKeyEnv, models.GATEWAY_KEY_REF, 'migrate: 指向本地网关凭据')
  eq(profile.baseURL, localUrl, 'migrate: 指向本地网关')
  eq(profile.displayName, 'TokenBank', 'migrate: 保留显示名')
  eq(profile.retryPolicy.maxRetries, 5, 'migrate: 保留用户 retryPolicy')
  eq(profile.models.length, 1, 'migrate: 保留已列模型')

  const foreign = fakeSettings({ providers: { tokenbank: { apiKeyEnv: 'OTHER_KEY', baseURL: 'https://elsewhere.example.cn' } } })
  const other = models.createModelManager({ settings: foreign, credentials: fakeCredentials(), baseUrl: 'https://bank.skillpie.cn', localUrl, isListening: () => true })
  eq(await other.migrate(), false, 'migrate: 他人配置不动')
  eq(foreign.state.value.providers.tokenbank.apiKeyEnv, 'OTHER_KEY', 'migrate: 他人配置保持原样')

  const offline = models.createModelManager({ settings: fakeSettings({ providers: {} }), credentials: fakeCredentials(), baseUrl: 'https://bank.skillpie.cn', localUrl, isListening: () => false })
  eq(await offline.migrate(), false, 'migrate: 网关未监听时不动配置')
}

// synchronize：网关未监听 → gateway_down
{
  const manager = models.createModelManager({ settings: fakeSettings({ providers: {} }), credentials: fakeCredentials(), baseUrl: 'https://bank.skillpie.cn', localUrl: 'http://127.0.0.1:39917', isListening: () => false })
  await rejects(async () => manager.synchronize({ id: 'a', accessKey: 'sk' }, async () => true), 'sync: 未监听拒绝',
    (error) => error.code === 'gateway_down' && error.status === 503)
}

// synchronize：provider 被他人配置 → provider_conflict
{
  const settings = fakeSettings({ providers: { tokenbank: { apiKeyEnv: 'OTHER_KEY', baseURL: 'https://elsewhere.example.cn' } } })
  const manager = models.createModelManager({ settings, credentials: fakeCredentials(), baseUrl: 'https://bank.skillpie.cn', localUrl: 'http://127.0.0.1:39917', isListening: () => true })
  await rejects(async () => manager.synchronize({ id: 'a', accessKey: 'sk' }, async () => true), 'sync: provider 冲突拒绝',
    (error) => error.code === 'provider_conflict')
}

/* ── gateway.js ──────────────────────────────────────────────────────── */

const GATEWAY_TOKEN = 'tb-local-' + 'f'.repeat(64)
const POOL = [{ id: 'a@x.com', accessKey: 'sk-a' }, { id: 'b@x.com', accessKey: 'sk-b' }]

async function gatewayServer({ fetchImpl, pool = POOL, tuning = {}, limits = {} }) {
  const gw = gatewayMod.createGateway({
    getPool: async () => ({ accounts: pool, tuning: { ...gatewayMod.DEFAULT_GATEWAY_SETTINGS, ...tuning } }),
    baseUrl: 'https://bank.skillpie.cn', token: GATEWAY_TOKEN, fetchImpl, limits,
  })
  const listener = await listen((req, res) => { void gw.handle(req, res).catch(() => { res.statusCode = 502; res.end() }) })
  const call = (path, init = {}) => fetch(listener.url + path, {
    ...init,
    headers: { 'x-api-key': GATEWAY_TOKEN, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
  })
  return { ...listener, call, gw }
}

{
  const g = await gatewayServer({ fetchImpl: async () => new Response('{}', { status: 200 }) })
  eq((await fetch(g.url + '/v1/models')).status, 401, 'gateway: 无令牌 401')
  eq((await fetch(g.url + '/v1/models', { headers: { origin: 'http://evil.test', 'x-api-key': GATEWAY_TOKEN } })).status, 403, 'gateway: 带 Origin 403')
  eq((await g.call('/v1/unknown')).status, 404, 'gateway: 未知路由 404')
  eq((await g.call('/v1/models?limit=abc')).status, 404, 'gateway: 非法 query 404')
  eq((await g.call('/v1/messages', { method: 'POST', body: '{"x":1}', headers: { 'content-type': 'text/plain' } })).status, 415, 'gateway: 非 JSON 415')
  eq((await g.call('/v1/models', { method: 'DELETE' })).status, 404, 'gateway: 方法不允许 404')
  await g.close()
}

// 模型列表：转发并注入账号 key
{
  const seen = []
  const g = await gatewayServer({
    fetchImpl: async (url, init) => {
      seen.push({ url, auth: init.headers.get('authorization'), apiKey: init.headers.get('x-api-key') })
      return new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const res = await g.call('/v1/models?limit=1000')
  eq(res.status, 200, 'gateway: 模型列表 200')
  eq((await res.json()).data[0].id, 'm1', 'gateway: 模型列表原样返回')
  eq(seen.length, 1, 'gateway: 只请求一次上游')
  eq(seen[0].url, 'https://bank.skillpie.cn/v1/models?limit=1000', 'gateway: 规范化为 /v1/models')
  eq(seen[0].auth, 'Bearer sk-a', 'gateway: 注入账号 key')
  await g.close()
}

// Anthropic 请求：x-api-key + 保留 anthropic-version，不透传客户端凭据
{
  const seen = []
  const g = await gatewayServer({
    fetchImpl: async (_url, init) => {
      seen.push(init.headers)
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const res = await g.call('/v1/messages', {
    method: 'POST', body: '{"model":"glm-5.3-flash"}',
    headers: { 'anthropic-version': '2023-06-01' },
  })
  eq(res.status, 200, 'gateway: messages 200')
  ok(seen.length === 1, 'gateway: messages 到达上游一次', seen.length)
  if (seen.length === 1) {
    eq(seen[0].get('x-api-key'), 'sk-a', 'gateway: anthropic 用 x-api-key')
    eq(seen[0].get('anthropic-version'), '2023-06-01', 'gateway: 保留 anthropic-version')
    eq(seen[0].get('authorization'), null, 'gateway: 不转发客户端 authorization')
  }
  // 客户端自带 authorization 与网关令牌冲突时必须拒绝，避免两套凭据混淆
  const spoofed = await g.call('/v1/messages', {
    method: 'POST', body: '{"model":"x"}', headers: { authorization: 'Bearer CLIENT-SECRET' },
  })
  eq(spoofed.status, 401, 'gateway: 自带 authorization 的请求被拒')
  await g.close()
}

// 429 换号 + 冷却
{
  const calls = []
  const g = await gatewayServer({
    fetchImpl: async (_url, init) => {
      const key = init.headers.get('x-api-key')
      calls.push(key)
      if (key === 'sk-a') return new Response('{"error":"rate"}', { status: 429, headers: { 'retry-after': '2' } })
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{"model":"x"}' })
  eq(res.status, 200, 'gateway: 429 后换号成功')
  eq(calls.length, 2, 'gateway: 恰好两次请求')
  eq(calls[0], 'sk-a', 'gateway: 先试第一个')
  eq(calls[1], 'sk-b', 'gateway: 换到第二个')
  const stats = g.gw.stats(POOL)
  ok(stats.cooldowns['a@x.com'] > 0, 'gateway: 记录冷却', stats.cooldowns)
  eq(stats.switched, 1, 'gateway: 统计换号次数')
  await g.close()
}

// 全 429 → 429 + Retry-After
{
  const g = await gatewayServer({
    fetchImpl: async () => new Response('{"error":"rate"}', { status: 429, headers: { 'retry-after': '1' } }),
    tuning: { requestRetryRounds: 0 },
  })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{}' })
  eq(res.status, 429, 'gateway: 全 429 返回 429')
  ok(Number(res.headers.get('retry-after')) >= 1, 'gateway: 带 Retry-After', res.headers.get('retry-after'))
  await g.close()
}

// 全 5xx → 原样透传最后的状态码与 body，不伪造 429
{
  let n = 0
  const g = await gatewayServer({
    fetchImpl: async () => { n += 1; return new Response(`boom-${n}`, { status: 502 }) },
    tuning: { requestRetryRounds: 0 },
  })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{}' })
  eq(res.status, 502, 'gateway: 5xx 保持 502')
  eq(await res.text(), 'boom-2', 'gateway: 透传最后一次 body')
  eq(n, 2, 'gateway: 两个账号各试一次')
  await g.close()
}

// POST 传输错误不重放
{
  let n = 0
  const g = await gatewayServer({ fetchImpl: async () => { n += 1; throw new Error('ECONNREFUSED') } })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{}' })
  eq(res.status, 502, 'gateway: POST 传输错误 502')
  eq(n, 1, 'gateway: POST 不重放')
  await g.close()
}

// 4xx（非 429）直接透传，不换号
{
  let n = 0
  const g = await gatewayServer({ fetchImpl: async () => { n += 1; return new Response('{"error":"billing"}', { status: 402 }) } })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{}' })
  eq(res.status, 402, 'gateway: 402 原样返回')
  eq(n, 1, 'gateway: 402 不换号')
  await g.close()
}

// 空池 → 503
{
  const g = await gatewayServer({ fetchImpl: async () => new Response('{}', { status: 200 }), pool: [] })
  eq((await g.call('/v1/models')).status, 503, 'gateway: 空池 503')
  await g.close()
}

// 池内缺 accessKey 的账号被忽略
{
  const seen = []
  const g = await gatewayServer({
    pool: [{ id: 'a@x.com', accessKey: '' }, { id: 'b@x.com', accessKey: 'sk-b' }],
    fetchImpl: async (_url, init) => { seen.push(init.headers.get('authorization')); return new Response('{}', { status: 200 }) },
  })
  eq((await g.call('/v1/models')).status, 200, 'gateway: 跳过无 key 账号')
  eq(seen[0], 'Bearer sk-b', 'gateway: 只用有 key 的账号')
  await g.close()
}

// 并发上限
{
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const g = await gatewayServer({
    limits: { maxConcurrent: 1 },
    fetchImpl: async () => { await gate; return new Response('{}', { status: 200 }) },
  })
  const first = g.call('/v1/models')
  await new Promise((resolve) => setTimeout(resolve, 60))
  const second = await g.call('/v1/models')
  eq(second.status, 503, 'gateway: 超出并发 503')
  release()
  eq((await first).status, 200, 'gateway: 首个请求仍成功')
  await g.close()
}

// 错误 body 中的密钥被抹掉
{
  const g = await gatewayServer({
    tuning: { requestRetryRounds: 0 },
    fetchImpl: async (_url, init) => new Response(`invalid key ${init.headers.get('x-api-key')}`, { status: 401 }),
  })
  const res = await g.call('/v1/messages', { method: 'POST', body: '{}' })
  const text = await res.text()
  eq(res.status, 401, 'gateway: 401 透传')
  ok(!text.includes('sk-a'), 'gateway: 错误体不泄露 key', text)
  ok(text.includes('[redacted]'), 'gateway: 错误体标注 redacted', text)
  await g.close()
}

/* ── index.js：无网络路径 ────────────────────────────────────────────── */

eq(index.Config['~standard'].validate(null).value.baseUrl, undefined, 'Config: null 通过')
ok(index.Config['~standard'].validate({ baseUrl: 'http://example.com' }).issues, 'Config: 非环回 http 拒绝')
eq(index.Config['~standard'].validate({ baseUrl: 'https://bank.skillpie.cn/' }).value.baseUrl, 'https://bank.skillpie.cn', 'Config: 规范化')
ok(index.Config['~standard'].validate([1]).issues, 'Config: 数组拒绝')

{
  const credentials = fakeCredentials()
  const controller = index.createController({
    credentials, settings: fakeSettings({ providers: {} }), baseUrl: 'https://bank.skillpie.cn',
    localUrl: 'http://127.0.0.1:39917', isListening: () => false, getGateway: () => null,
  })
  await controller.initializeStore()

  const empty = await controller.dispatch({ action: 'status' })
  eq(empty.ok, true, 'dispatch: 空库 status ok')
  eq(empty.loggedIn, false, 'dispatch: 空库未登录')
  eq(empty.accounts.length, 0, 'dispatch: 空库无账号')

  const settingsView = await controller.dispatch({ action: 'settings-get' })
  eq(settingsView.port, index.GATEWAY_PORT, 'dispatch: settings-get 端口')
  eq(settingsView.listening, false, 'dispatch: settings-get 未监听')
  eq(settingsView.poolCount, 0, 'dispatch: settings-get 池子为空')

  await rejects(async () => controller.dispatch({ action: 'switch', id: 'nope@x.com' }), 'dispatch: 切到不存在的账号报错',
    (error) => error.status === 404 && error.code === 'account_not_found')
  await rejects(async () => controller.dispatch({ action: 'checkin-do' }), 'dispatch: 未登录签到报错',
    (error) => error.code === 'session_expired')
  await rejects(async () => controller.dispatch({ action: 'model-sync' }), 'dispatch: 网关未监听时 model-sync 拒绝',
    (error) => error.code === 'gateway_down')
  await rejects(async () => controller.dispatch({ action: 'nope' }), 'dispatch: 未知 action 报错',
    (error) => error.status === 400 && error.code === 'unknown_action')
  await rejects(async () => controller.dispatch({ action: 'settings-set', gateway: 'nope' }), 'dispatch: settings-set 类型校验',
    (error) => error.code === 'invalid_input')
  await rejects(async () => controller.dispatch({ action: 'send-code', email: 'bad' }), 'dispatch: 非法邮箱拒绝',
    (error) => error.code === 'invalid_input')
  await rejects(async () => controller.dispatch({ action: 'login', email: 'a@x.com', password: '' }), 'dispatch: 空密码拒绝',
    (error) => error.code === 'invalid_input')

  const set = await controller.dispatch({ action: 'settings-set', gateway: { cooldownMs: 5000, bogus: 1 } })
  eq(set.gateway.cooldownMs, 5000, 'dispatch: settings-set 生效')
  ok(!('bogus' in set.gateway), 'dispatch: settings-set 忽略未知键')
  eq((await controller.pool()).accounts.length, 0, 'dispatch: pool 为空')
}

// 面板处理器：鉴权与请求形状
{
  const connection = {
    browserPeer: { id: 'peer-1' },
    admit({ headers }) {
      if (headers['x-test-reject'] === '1') return { rejection: 403 }
      if (headers['x-test-other'] === '1') return { peer: { id: 'peer-2' } }
      return { peer: { id: 'peer-1' } }
    },
  }
  const seen = []
  const handler = index.createPanelHandler(connection, async (body) => { seen.push(body); return { ok: true, echo: body.action } })
  const listener = await listen((req, res) => { void handler(req, res) })

  const post = (body, headers = {}) => fetch(listener.url + '/', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-dsh-switchboard': '1', ...headers },
  })

  eq((await post({ action: 'status' })).status, 200, 'panel: 正常请求 200')
  eq((await post({ action: 'status' }, { 'x-test-reject': '1' })).status, 403, 'panel: 宿主拒绝时 403')
  eq((await post({ action: 'status' }, { 'x-test-other': '1' })).status, 403, 'panel: 非浏览器 Peer 403')
  eq((await fetch(listener.url + '/', { headers: { 'x-dsh-switchboard': '1' } })).status, 405, 'panel: GET 405')
  eq((await post({ action: 'status' }, { 'x-dsh-switchboard': '' })).status, 403, 'panel: 缺自定义头 403')
  eq((await post({ action: 'status' }, { origin: 'http://evil.test' })).status, 403, 'panel: 跨源 403')
  eq((await post({ action: 'status' }, { 'sec-fetch-site': 'cross-site' })).status, 403, 'panel: 跨站 sec-fetch-site 403')
  eq((await post({ action: 'status' }, { 'content-type': 'text/plain' })).status, 415, 'panel: 非 JSON 415')
  eq((await post('not json')).status, 400, 'panel: 非法 JSON 400')
  eq((await post('[1,2]')).status, 400, 'panel: 数组 body 400')
  eq((await post({ action: 'status' }, { 'content-encoding': 'gzip' })).status, 415, 'panel: 压缩体 415')
  const big = { action: 'status', pad: 'x'.repeat(300 * 1024) }
  eq((await post(big)).status, 413, 'panel: 超大 body 413')

  eq(seen.length, 1, 'panel: 只有合法请求进入 dispatch')
  await new Promise((resolve) => listener.server.close(resolve))
}

// dispatch 抛错时的状态码映射
{
  const connection = { browserPeer: { id: 'p' }, admit: () => ({ peer: { id: 'p' } }) }
  const handler = index.createPanelHandler(connection, async () => {
    const error = new Error('nope')
    error.status = 409
    error.code = 'conflict'
    throw error
  })
  const listener = await listen((req, res) => { void handler(req, res) })
  const res = await fetch(listener.url + '/', {
    method: 'POST', body: '{"action":"status"}',
    headers: { 'content-type': 'application/json', 'x-dsh-switchboard': '1' },
  })
  eq(res.status, 500, 'panel: 非受控错误 500')
  eq((await res.json()).ok, false, 'panel: 错误响应 ok=false')
  await new Promise((resolve) => listener.server.close(resolve))
}

/* ── locale 一致性 ───────────────────────────────────────────────────── */

{
  const zh = JSON.parse(await readFile(`${ROOT}/locale/zh.json`, 'utf8'))
  const en = JSON.parse(await readFile(`${ROOT}/locale/en.json`, 'utf8'))
  const client = await readFile(`${ROOT}/lib/client.js`, 'utf8')
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  eq(JSON.stringify(zhKeys), JSON.stringify(enKeys), 'locale: 双语键一致')
  eq(zhKeys.length, 102, 'locale: 键数量为 102', zhKeys.length)
  // 去掉内嵌字典本身，再看剩余的 UI 代码是否引用到每个键
  const dictStart = client.indexOf('var zh = {')
  const dictEnd = client.indexOf('var pageT')
  ok(dictStart > 0 && dictEnd > dictStart, 'locale: 能找到内嵌字典边界', { dictStart, dictEnd })
  const ui = client.slice(0, dictStart) + client.slice(dictEnd)
  const missing = zhKeys.filter((key) => !new RegExp(`['"\`]${key}['"\`]`).test(ui))
  eq(missing.length, 0, 'locale: 每个键都在 UI 代码中被引用', missing)
  const inlineZh = client.slice(dictStart, client.indexOf('var en = {'))
  const inlineEn = client.slice(client.indexOf('var en = {'), dictEnd)
  const zhInlineMissing = zhKeys.filter((key) => !new RegExp(`["']${key}["']\\s*:`).test(inlineZh))
  const enInlineMissing = enKeys.filter((key) => !new RegExp(`["']${key}["']\\s*:`).test(inlineEn))
  eq(zhInlineMissing.length, 0, 'locale: 内嵌 zh 字典完整', zhInlineMissing)
  eq(enInlineMissing.length, 0, 'locale: 内嵌 en 字典完整', enInlineMissing)
  ok(!client.includes('FRIZON'), 'locale: 已移除内嵌字体')
  ok(!client.includes('#ff4f1f'), 'locale: 已移除旧品牌色')
  ok(!client.includes('__TB__'), 'locale: 无全局调试句柄')
}

/* ── 结果 ────────────────────────────────────────────────────────────── */

if (fails.length) {
  console.log(`PASS: ${pass}  FAIL: ${fails.length}`)
  for (const item of fails) console.log('  ✗ ' + item)
  process.exitCode = 1
} else {
  console.log(`PASS: ${pass}  FAIL: 0`)
}
