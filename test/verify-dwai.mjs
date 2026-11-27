// Isolated dwai channel tests: in-memory credentials + mock fetch, no network.
import * as dwApi from '../lib/channels/dwai/api.js'
import { createDwaiChannel } from '../lib/channels/dwai/index.js'
import { createDwaiModels, DWAI_KEY_REF, ensureDwaiToken } from '../lib/channels/dwai/models.js'
import { createDwaiStore, normalizeAccount, publicAccount } from '../lib/channels/dwai/store.js'

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass += 1; return }
  fail += 1
  console.log(`FAIL: ${label}${extra ? ' :: ' + JSON.stringify(extra) : ''}`)
}
function eq(a, b, label) { ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), label, { actual: a, expected: b }) }

function makeCredentials(seed = {}) {
  const records = new Map(Object.entries(seed))
  const kv = new Map()
  let chain = Promise.resolve()
  return {
    records, kv,
    async readRecord(key) { return records.get(key) },
    async modifyRecord(key, mutate) {
      const run = chain.then(async () => {
        const current = records.get(key)
        const next = await mutate(current)
        if (next === undefined) return current
        records.set(key, next)
        return next
      })
      chain = run.then(() => {}, () => {})
      return run
    },
    async deleteRecord(key) { records.delete(key) },
    async resolve(ref) { return kv.has(ref) ? { value: kv.get(ref), source: 'record' } : undefined },
    async set(ref, value) { kv.set(ref, value) },
    async unset(ref) { kv.delete(ref) },
  }
}

const RT_A = 'rt_' + 'a'.repeat(64)
const RT_B = 'rt_' + 'b'.repeat(64)

function mockFetch(routes) {
  const calls = []
  const impl = async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const key = `${init.method || 'GET'} ${path.split('?')[0]}`
    calls.push({ key, url: String(url), headers: init.headers, body: init.body })
    const handler = routes[key]
    if (!handler) return new Response(JSON.stringify({ code: 404, message: 'not found' }), { status: 404 })
    const result = typeof handler === 'function' ? await handler({ url: String(url), init, calls }) : handler
    const status = result.status ?? 200
    const body = result.body !== undefined ? result.body : result
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...(result.headers || {}) },
    })
  }
  return { impl, calls }
}

// [1] api.js: token rotation, profile and error mapping
{
  const { impl } = mockFetch({
    'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'at1', refresh_token: 'rt_new', expires_in: 86400 } },
  })
  globalThis.fetch = impl
  const pair = await dwApi.refreshToken(RT_A)
  eq(pair.accessToken, 'at1', 'refresh: access token')
  eq(pair.refreshToken, 'rt_new', 'refresh: rotated token')
  eq(pair.expiresIn, 86400, 'refresh: expires_in')

  const bad = mockFetch({ 'POST /api/v1/auth/refresh': { status: 401, body: { code: 401, message: 'invalid refresh token', reason: 'REFRESH_TOKEN_INVALID' } } })
  globalThis.fetch = bad.impl
  let threw = null
  try { await dwApi.refreshToken(RT_A) } catch (error) { threw = error }
  eq(threw?.status, 401, 'refresh: 401 surfaces status')
  eq(threw?.reason, 'REFRESH_TOKEN_INVALID', 'refresh: reason preserved')

  const incomplete = mockFetch({ 'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'only' } } })
  globalThis.fetch = incomplete.impl
  threw = null
  try { await dwApi.refreshToken(RT_A) } catch (error) { threw = error }
  eq(threw?.code, 'upstream_response', 'refresh: incomplete pair rejected')

  // The gateway wraps its errors in { error: { message, code } }; both shapes must map.
  const gateway = mockFetch({ 'GET /api/v1/user/profile': { status: 403, body: { error: { message: 'group deleted', code: 'GROUP_DELETED' } } } })
  globalThis.fetch = gateway.impl
  threw = null
  try { await dwApi.profile('at') } catch (error) { threw = error }
  eq(threw?.message, 'group deleted', 'error: gateway envelope message')
  eq(threw?.code, 'GROUP_DELETED', 'error: gateway envelope code')
  eq(threw?.status, 403, 'error: gateway envelope status')
}

// [2] profile: balance is a USD float, not nano
{
  const { impl } = mockFetch({
    'GET /api/v1/user/profile': { code: 0, data: { id: 255, email: '2827392881@qq.com', balance: 4.64748624, status: 'active', concurrency: 5 } },
  })
  globalThis.fetch = impl
  const info = await dwApi.profile('at')
  eq(info.balance, 4.64748624, 'profile: float balance kept')
  eq(info.email, '2827392881@qq.com', 'profile: email')
  eq(info.id, 255, 'profile: user id')
}

// [3] checkin: overview fields differ from XingChi, claim needs a day
{
  const { impl, calls } = mockFetch({
    'GET /api/v1/user/checkin': { code: 0, data: { today: '2026-11-28', enabled: true, eligible: true, checked_in: false, can_checkin: true, today_amount: 0, min_amount: 0.02, max_amount: 0.09, total_days: 1, streak_days: 1, total_amount: 0.02260044, streak_interval: 7 } },
    'POST /api/v1/user/checkin': { code: 0, data: { date: '2026-11-28', amount: 0.06026329, source: 'website', already_checked_in: false, bonus: null } },
  })
  globalThis.fetch = impl
  const status = await dwApi.checkinStatus('at')
  eq(status.enabled, true, 'checkin: enabled')
  eq(status.claimedToday, false, 'checkin: checked_in maps to claimedToday')
  eq(status.today, '2026-11-28', 'checkin: today kept')
  eq(status.totalDays, 1, 'checkin: total_days')
  eq(status.streakInterval, 7, 'checkin: streak_interval')

  const claim = await dwApi.claimCheckin('at', status.today)
  eq(claim.claimed, true, 'checkin: claimed')
  eq(claim.amount, 0.06026329, 'checkin: float amount')
  eq(claim.source, 'website', 'checkin: source')
  const post = calls.find((call) => call.key === 'POST /api/v1/user/checkin')
  eq(JSON.parse(post.body).day, '2026-11-28', 'checkin: claim sends the day')

  // A repeat claim is not an error.
  const dup = mockFetch({ 'POST /api/v1/user/checkin': { status: 409, body: { code: 409, message: 'already checked in today' } } })
  globalThis.fetch = dup.impl
  const again = await dwApi.claimCheckin('at', '2026-11-28')
  eq(again.claimed, false, 'checkin: repeat not claimed')
  eq(again.alreadyClaimed, true, 'checkin: repeat flagged')
}

// [4] keys and groups: paged list, plaintext, create with a group
{
  const { impl, calls } = mockFetch({
    'GET /api/v1/keys': { code: 0, data: { items: [{ id: 389, key: 'sk-wkylnj', name: 'glm', group_id: 47, status: 'active' }], total: 1, page: 1, page_size: 100, pages: 1 } },
    'GET /api/v1/groups/available': { code: 0, data: [{ id: 2, name: 'codex-plus', platform: 'openai', status: 'active' }, { id: 84, name: 'kiro', platform: 'anthropic', status: 'active' }, { id: 99, name: 'gone', platform: 'openai', status: 'disabled' }] },
    'POST /api/v1/keys': { code: 0, data: { id: 936, key: 'sk-fresh', name: 'dsh', group_id: 2 } },
    'PUT /api/v1/keys/389': { code: 0, data: { id: 389, key: 'sk-wkylnj', group_id: 2 } },
  })
  globalThis.fetch = impl
  const keys = await dwApi.listKeys('at')
  eq(keys.length, 1, 'keys: one item')
  eq(keys[0].key, 'sk-wkylnj', 'keys: plaintext key readable')
  eq(keys[0].groupId, 47, 'keys: group id')
  ok(calls.some((call) => call.url.includes('page=1')), 'keys: paged request')

  const groups = await dwApi.listGroups('at')
  eq(groups.length, 2, 'groups: inactive filtered out')
  eq(groups[0].id, 2, 'groups: first id')

  const created = await dwApi.createKey('at', 'dsh', 2)
  eq(created.key, 'sk-fresh', 'keys: created key')
  eq(created.groupId, 2, 'keys: created group')
  const post = calls.find((call) => call.key === 'POST /api/v1/keys')
  eq(JSON.parse(post.body).group_id, 2, 'keys: create sends group_id')

  const attached = await dwApi.assignGroup('at', 389, 2)
  eq(attached.groupId, 2, 'keys: assign group result')
  const put = calls.find((call) => call.key === 'PUT /api/v1/keys/389')
  eq(JSON.parse(put.body).group_id, 2, 'keys: PUT sends group_id')
}

// [5] listModels talks to the gateway host with the sk- key and no UA spoofing
{
  const { impl, calls } = mockFetch({
    'GET /v1/models': { data: [{ id: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', owned_by: 'openai' }, { id: 'gpt-6-sol' }], object: 'list' },
  })
  globalThis.fetch = impl
  const models = await dwApi.listModels('sk-x')
  eq(models.length, 2, 'models: two items')
  eq(models[0].id, 'gpt-6.1-sol', 'models: id')
  eq(models[0].displayName, 'GPT-6.1 Sol', 'models: display name')
  const call = calls[0]
  ok(call.url.startsWith('https://api.dwai.cloud/v1/models'), 'models: gateway host')
  eq(call.headers.Authorization, 'Bearer sk-x', 'models: bearer key')
  ok(!('User-Agent' in call.headers), 'models: no UA spoofing')
}

// [6] store: account shape, public projection, serialized updates
{
  const credentials = makeCredentials()
  const store = createDwaiStore(credentials)
  eq((await store.read()).accounts.length, 0, 'store: empty by default')

  const account = normalizeAccount({ email: 'a@qq.com', refreshToken: RT_A, userId: 255, apiKey: 'sk-a', keyId: 389, groupId: 2 })
  eq(account.id, 'a@qq.com', 'store: id is the email')
  eq(account.pool, true, 'store: pool defaults to true')
  eq(account.groupId, 2, 'store: group id kept')
  eq(normalizeAccount({ email: 'a@qq.com' }), null, 'store: refresh token required')
  eq(normalizeAccount({ refreshToken: RT_A }), null, 'store: email required')

  const publicView = publicAccount(account)
  eq(publicView.hasKey, true, 'store: public hasKey')
  ok(!('refreshToken' in publicView) && !('accessToken' in publicView), 'store: public hides tokens')

  await store.update((current) => ({ ...current, accounts: [account] }))
  // Two concurrent updates must both land (the fake serializes like the host does).
  await Promise.all([
    store.update((current) => ({ ...current, gateway: { ...current.gateway, cooldownMs: 1234 } })),
    store.update((current) => ({ ...current, autoCheckin: { ...current.autoCheckin, lastDay: '2026-11-28' } })),
  ])
  const final = await store.read()
  eq(final.accounts.length, 1, 'store: account persisted')
  eq(final.gateway.cooldownMs, 1234, 'store: concurrent gateway update kept')
  eq(final.autoCheckin.lastDay, '2026-11-28', 'store: concurrent checkin update kept')
}

// [7] channel: add an account end to end
{
  const credentials = makeCredentials()
  const channel = createDwaiChannel({ credentials })
  let rotated = 0
  const routes = {
    'POST /api/v1/auth/refresh': () => {
      rotated += 1
      return { code: 0, data: { access_token: `at${rotated}`, refresh_token: `rt_${String(rotated).padStart(64, '0')}`, expires_in: 86400 } }
    },
    'GET /api/v1/user/profile': { code: 0, data: { id: 255, email: 'a@qq.com', balance: 12.5, status: 'active' } },
    'GET /api/v1/groups/available': { code: 0, data: [{ id: 2, name: 'codex-plus', platform: 'openai', status: 'active' }, { id: 84, name: 'kiro', platform: 'anthropic', status: 'active' }] },
    'GET /api/v1/keys': { code: 0, data: { items: [], total: 0 } },
    'POST /api/v1/keys': { code: 0, data: { id: 936, key: 'sk-fresh', name: 'dsh', group_id: 2 } },
    'GET /api/v1/user/checkin': { code: 0, data: { today: '2026-11-28', enabled: true, eligible: true, checked_in: false, can_checkin: true, total_days: 1, streak_days: 1, total_amount: 0 } },
    'POST /api/v1/user/checkin': { code: 0, data: { date: '2026-11-28', amount: 0.06, source: 'website', already_checked_in: false } },
  }
  const { impl, calls } = mockFetch(routes)
  globalThis.fetch = impl

  const added = await channel.addAccount({ refreshToken: RT_A })
  eq(added.account.email, 'a@qq.com', 'channel: account added')
  eq(added.account.apiKey, 'sk-fresh', 'channel: key adopted')
  eq(added.account.groupId, 2, 'channel: default group is codex-plus')
  const post = calls.find((call) => call.key === 'POST /api/v1/keys')
  eq(JSON.parse(post.body).group_id, 2, 'channel: created key carries the default group')

  const stored = await channel.store.read()
  eq(stored.accounts[0].refreshToken, `rt_${String(1).padStart(64, '0')}`, 'channel: rotated refresh token stored')

  const status = await channel.dispatch({ action: 'status' })
  eq(status.channel, 'dwai', 'channel: status channel')
  eq(status.accounts.length, 1, 'channel: status accounts')
  eq(status.activeId, 'a@qq.com', 'channel: status activeId for the shared panel')
  ok(!('refreshToken' in status.accounts[0]), 'channel: status hides tokens')

  const balances = await channel.dispatch({ action: 'balances' })
  eq(balances.balances['a@qq.com'], 12.5, 'channel: float balance')

  const pool = await channel.pool()
  eq(pool.accounts.length, 1, 'channel: pool has the account')
  eq(pool.accounts[0].accessKey, 'sk-fresh', 'channel: pool uses the api key')

  const checkin = await channel.checkinAll()
  eq(checkin.checkedCount, 1, 'channel: check-in counted')
  eq(checkin.totalAmount, 0.06, 'channel: float check-in total')

  // Rotation must replace the stored token pair.
  const rotatedAccount = await channel.rotate('a@qq.com', { force: true })
  eq(rotatedAccount.accessToken, 'at2', 'channel: rotation issued new access token')
  eq((await channel.store.read()).accounts[0].refreshToken, `rt_${String(2).padStart(64, '0')}`, 'channel: rotation persisted')

  // Re-adding the same email replaces rather than duplicates.
  await channel.addAccount({ refreshToken: RT_B })
  eq((await channel.store.read()).accounts.length, 1, 'channel: re-add replaces same email')
}

// [8] channel: reject a malformed refresh token without touching the network
{
  const credentials = makeCredentials()
  const channel = createDwaiChannel({ credentials })
  let threw = null
  try { await channel.addAccount({ refreshToken: 'not-a-token' }) } catch (error) { threw = error }
  eq(threw?.status, 400, 'channel: malformed rt rejected')
  eq(threw?.code, 'invalid_input', 'channel: malformed rt code')
}

// [9] channel: existing key without a group gets one attached
{
  const credentials = makeCredentials()
  const channel = createDwaiChannel({ credentials })
  let assigned = false
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'at1', refresh_token: RT_B, expires_in: 86400 } },
    'GET /api/v1/user/profile': { code: 0, data: { id: 1, email: 'b@qq.com', balance: 0, status: 'active' } },
    'GET /api/v1/groups/available': { code: 0, data: [{ id: 9, name: 'codex-pro', platform: 'openai', status: 'active' }] },
    'GET /api/v1/keys': () => ({ code: 0, data: { items: [{ id: 7, key: 'sk-old', status: 'active', group_id: assigned ? 9 : null }] } }),
    'PUT /api/v1/keys/7': () => { assigned = true; return { code: 0, data: { id: 7, key: 'sk-old', group_id: 9 } } },
  })
  globalThis.fetch = impl
  const added = await channel.addAccount({ refreshToken: RT_A })
  eq(added.account.apiKey, 'sk-old', 'group: existing key adopted')
  eq(added.account.groupId, 9, 'group: fallback group when the default is missing')
  const put = calls.find((call) => call.key === 'PUT /api/v1/keys/7')
  eq(JSON.parse(put.body).group_id, 9, 'group: PUT carries the chosen group')
}

// [10] panel contract: settings-get and gateway-status for the shared settings page
{
  const credentials = makeCredentials()
  const channel = createDwaiChannel({
    credentials, isListening: () => true, getGateway: () => null, localUrl: 'http://127.0.0.1:39917', port: 39917,
  })
  const { impl } = mockFetch({
    'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'at1', refresh_token: RT_B, expires_in: 86400 } },
    'GET /api/v1/user/profile': { code: 0, data: { id: 1, email: 'a@qq.com', balance: 12.5, status: 'active' } },
    'GET /api/v1/groups/available': { code: 0, data: [{ id: 2, name: 'codex-plus', platform: 'openai', status: 'active' }] },
    'GET /api/v1/keys': { code: 0, data: { items: [{ id: 1, key: 'sk-a', status: 'active', group_id: 2 }] } },
  })
  globalThis.fetch = impl
  await channel.addAccount({ refreshToken: RT_A })

  const settings = await channel.dispatch({ action: 'settings-get' })
  eq(settings.ok, true, 'panel: settings-get ok')
  ok(Array.isArray(settings.accounts), 'panel: settings-get returns accounts array')
  eq(settings.accounts.length, 1, 'panel: settings-get account count')
  ok(settings.gateway && typeof settings.gateway === 'object', 'panel: settings-get returns gateway object')
  eq(settings.listening, true, 'panel: settings-get listening')
  eq(settings.port, 39917, 'panel: settings-get port')
  eq(settings.poolCount, 1, 'panel: settings-get pool count')

  const gatewayStatus = await channel.dispatch({ action: 'gateway-status' })
  eq(gatewayStatus.ok, true, 'panel: gateway-status ok')
  eq(gatewayStatus.ready, 1, 'panel: gateway-status ready')
  eq(gatewayStatus.poolCount, 1, 'panel: gateway-status pool count')
  ok(gatewayStatus.tuning && typeof gatewayStatus.tuning === 'object', 'panel: gateway-status tuning')

  const groups = await channel.dispatch({ action: 'groups', id: 'a@qq.com' })
  eq(groups.groups.length, 1, 'panel: groups action')
}

// [11] error mapping: missing account stays a 404, a dead token becomes 409
{
  const credentials = makeCredentials({
    'dsh-tokenbank-multi/dwai': {
      kind: 'grant',
      payload: { version: 1, accounts: [{ id: 'a@qq.com', email: 'a@qq.com', refreshToken: RT_A, accessToken: '', tokenExpiresAt: 0 }] },
    },
  })
  const channel = createDwaiChannel({ credentials })
  let threw = null
  try { await channel.dispatch({ action: 'checkin-status', id: 'nobody@qq.com' }) } catch (error) { threw = error }
  eq(threw?.status, 404, 'error: missing account 404')
  eq(threw?.code, 'account_not_found', 'error: missing account code')

  const dead = mockFetch({ 'POST /api/v1/auth/refresh': { status: 401, body: { code: 401, message: 'invalid refresh token', reason: 'REFRESH_TOKEN_INVALID' } } })
  globalThis.fetch = dead.impl
  threw = null
  try { await channel.dispatch({ action: 'checkin-status', id: 'a@qq.com' }) } catch (error) { threw = error }
  eq(threw?.status, 409, 'error: dead refresh token becomes 409')
  eq(threw?.code, 'session_expired', 'error: dead refresh token code')
}

// [12] unknown action rejected
{
  const channel = createDwaiChannel({ credentials: makeCredentials() })
  let threw = null
  try { await channel.dispatch({ action: 'nope' }) } catch (error) { threw = error }
  eq(threw?.status, 400, 'channel: unknown action 400')
}

// [13] gateway descriptor: own token, own upstream, chat+responses, no UA override
{
  const channel = createDwaiChannel({ credentials: makeCredentials() })
  const descriptor = channel.gatewayFor('tb-local-' + 'f'.repeat(64))
  eq(descriptor.baseUrl, 'https://api.dwai.cloud', 'gateway: dwai upstream')
  eq(descriptor.routes, ['models', 'chat', 'responses'], 'gateway: chat and responses')
  ok(!descriptor.routes.includes('anthropic'), 'gateway: no anthropic route')
  ok(!descriptor.ua, 'gateway: no UA override')
}

// [14] model config: own route, gateway credential, direct provider taken over
{
  const settings = {
    describe: () => [{
      ns: 'llm-pi-ai',
      revision: 1,
      value: {
        providers: {
          dwai: { apiKeyEnv: 'DWAI_API_KEY', baseURL: 'https://api.dwai.cloud/v1', models: [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }] },
          other: { apiKeyEnv: 'OTHER_KEY', baseURL: 'https://other.example/v1' },
        },
      },
    }],
    mutate: async (ns, ops) => { mutations.push(ops) },
  }
  const mutations = []
  const models = createDwaiModels({ settings, localUrl: 'http://127.0.0.1:39917', isListening: () => true })
  const result = await models.synchronize([{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-sol' }])
  eq(result.route, 'switchboard-dwai', 'models: own route')
  eq(result.count, 2, 'models: two models written')
  const write = mutations.find((ops) => ops.some((op) => op.op === 'set' && op.path[1] === 'switchboard-dwai'))
  const value = write.find((op) => op.op === 'set' && op.path.length === 2).value
  eq(value.apiKeyEnv, DWAI_KEY_REF, 'models: gateway credential')
  eq(value.baseURL, 'http://127.0.0.1:39917', 'models: local gateway url')
  eq(value.api, 'openai-responses', 'models: responses protocol')
  eq(value.displayName, '转接台 · dwai', 'models: display name')
  eq(value.models[0].name, 'GPT-6.1 Sol', 'models: user options carried over')
  ok(mutations.some((ops) => ops.some((op) => op.op === 'unset' && op.path[1] === 'dwai')), 'models: direct provider dropped')

  const offline = createDwaiModels({ settings, localUrl: 'http://127.0.0.1:39917', isListening: () => false })
  let threw = null
  try { await offline.synchronize([{ id: 'x' }]) } catch (error) { threw = error }
  eq(threw?.code, 'gateway_down', 'models: offline rejects')
}

// [15] model config: refuse to overwrite a provider someone else repointed
{
  const settings = {
    describe: () => [{
      ns: 'llm-pi-ai',
      revision: 1,
      value: { providers: { 'switchboard-dwai': { apiKeyEnv: 'SOMEONE_ELSE', baseURL: 'https://elsewhere.example/v1' } } },
    }],
    mutate: async () => { throw new Error('should not be called') },
  }
  const models = createDwaiModels({ settings, localUrl: 'http://127.0.0.1:39917', isListening: () => true })
  let threw = null
  try { await models.synchronize([{ id: 'x' }]) } catch (error) { threw = error }
  eq(threw?.status, 409, 'models: conflict rejected')
  eq(threw?.code, 'provider_conflict', 'models: conflict code')
}

// [16] gateway token: generated once, stored under its own ref
{
  const credentials = makeCredentials()
  const first = await ensureDwaiToken(credentials)
  ok(/^tb-local-[a-f0-9]{64}$/.test(first), 'token: shape')
  eq(credentials.kv.get(DWAI_KEY_REF), first, 'token: stored under its own ref')
  const second = await ensureDwaiToken(credentials)
  eq(second, first, 'token: stable across restarts')
  ok(!credentials.kv.has('TOKENBANK_MULTI_GATEWAY_KEY'), 'token: does not touch other channels')
}

console.log(`PASS: ${pass}  FAIL: ${fail}`)
if (fail) process.exitCode = 1
