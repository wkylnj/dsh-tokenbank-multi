// Isolated XingChi channel tests: in-memory credentials + mock fetch, no network.
import assert from 'node:assert/strict'
import * as xcApi from '../lib/channels/xingchi/api.js'
import { createXingchiChannel } from '../lib/channels/xingchi/index.js'
import { createXingchiStore, normalizeAccount } from '../lib/channels/xingchi/store.js'

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

// [1] api.js unwrap + error mapping
{
  const { impl } = mockFetch({
    'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'at1', refresh_token: 'rt_new', expires_in: 86400 } },
  })
  globalThis.fetch = impl
  const pair = await xcApi.refreshToken(RT_A)
  eq(pair.accessToken, 'at1', 'refresh: access token')
  eq(pair.refreshToken, 'rt_new', 'refresh: rotated token')
  eq(pair.expiresIn, 86400, 'refresh: expires_in')

  const bad = mockFetch({ 'POST /api/v1/auth/refresh': { status: 401, body: { code: 401, message: 'invalid refresh token', reason: 'REFRESH_TOKEN_INVALID' } } })
  globalThis.fetch = bad.impl
  let threw = null
  try { await xcApi.refreshToken(RT_A) } catch (error) { threw = error }
  eq(threw?.status, 401, 'refresh: 401 surfaces status')
  eq(threw?.reason, 'REFRESH_TOKEN_INVALID', 'refresh: reason preserved')

  const incomplete = mockFetch({ 'POST /api/v1/auth/refresh': { code: 0, data: { access_token: 'only' } } })
  globalThis.fetch = incomplete.impl
  threw = null
  try { await xcApi.refreshToken(RT_A) } catch (error) { threw = error }
  eq(threw?.code, 'upstream_response', 'refresh: incomplete pair rejected')
}

// [2] checkin: claim once, repeat is not an error
{
  const { impl, calls } = mockFetch({
    'GET /api/v1/user/checkin': { code: 0, data: { enabled: true, amount: 300, claimed_today: true, today: '2026-11-27', total_count: 4, total_amount: 1200 } },
    'POST /api/v1/user/checkin': { code: 0, data: { status: 'ok', amount: 300 } },
  })
  globalThis.fetch = impl
  const status = await xcApi.checkinStatus('at')
  eq(status.enabled, true, 'checkin: enabled')
  eq(status.claimedToday, true, 'checkin: claimed_today')
  eq(status.totalAmount, 1200, 'checkin: total_amount')
  const claim = await xcApi.claimCheckin('at')
  eq(claim.claimed, true, 'checkin: claimed')
  eq(claim.amount, 300, 'checkin: amount')

  const dup = mockFetch({ 'POST /api/v1/user/checkin': { status: 409, body: { code: 409, message: 'already checked in today', reason: 'CHECKIN_ALREADY_CLAIMED' } } })
  globalThis.fetch = dup.impl
  const again = await xcApi.claimCheckin('at')
  eq(again.claimed, false, 'checkin: repeat not claimed')
  eq(again.alreadyClaimed, true, 'checkin: repeat flagged')
}

// [3] keys: plaintext readable, create when missing
{
  const { impl } = mockFetch({
    'GET /api/v1/keys': { code: 0, data: { items: [{ id: 63426, key: 'sk-abc', status: 'active', name: 'astra', group: { name: 'GPT公益', platform: 'openai' } }], total: 1 } },
  })
  globalThis.fetch = impl
  const keys = await xcApi.listKeys('at')
  eq(keys.length, 1, 'keys: one item')
  eq(keys[0].key, 'sk-abc', 'keys: plaintext key readable')
  eq(keys[0].groupPlatform, 'openai', 'keys: group platform')
}

// [4] store: rotating refresh token must persist before reuse
{
  const credentials = makeCredentials()
  const store = createXingchiStore(credentials)
  await store.write({ version: 1, accounts: [normalizeAccount({ email: 'a@x.com', refreshToken: RT_A, accessToken: 'old', tokenExpiresAt: 1 })], gateway: {}, autoCheckin: { enabled: true, lastDay: '' } })
  const read = await store.read()
  eq(read.accounts.length, 1, 'store: account persisted')
  eq(read.accounts[0].refreshToken, RT_A, 'store: refresh token kept')
  eq(read.accounts[0].password, undefined, 'store: no password field')

  await store.update((next) => ({
    ...next, accounts: next.accounts.map((item) => ({ ...item, refreshToken: RT_B, accessToken: 'new' })),
  }))
  const after = await store.read()
  eq(after.accounts[0].refreshToken, RT_B, 'store: rotated token persisted')

  eq(normalizeAccount({ email: '', refreshToken: RT_A }), null, 'store: email required')
  eq(normalizeAccount({ email: 'a@x.com', refreshToken: '' }), null, 'store: refresh token required')
  eq(normalizeAccount({ email: 'a@x.com', refreshToken: RT_A }).pool, true, 'store: pool defaults true')
}

// [5] channel: add account, rotate, checkin, pool
{
  let refreshCount = 0
  const routes = {
    'POST /api/v1/auth/refresh': () => {
      refreshCount += 1
      return { code: 0, data: { access_token: `at${refreshCount}`, refresh_token: `rt_${String(refreshCount).padStart(64, '0')}`, expires_in: 86400 } }
    },
    'GET /api/v1/user/profile': { code: 0, data: { id: 62459, email: 'wangkaiyu066@gmail.com', balance: 887.9650941, status: 'active' } },
    'GET /api/v1/keys': { code: 0, data: { items: [{ id: 63458, key: 'sk-xc-key', status: 'active', name: 'astra', group: { name: 'GPT公益', platform: 'openai' } }], total: 1 } },
    'GET /api/v1/user/checkin': { code: 0, data: { enabled: true, amount: 300, claimed_today: false, today: '2026-11-27', total_count: 0, total_amount: 0 } },
    'POST /api/v1/user/checkin': { code: 0, data: { status: 'ok', amount: 300 } },
    'GET /v1/models': { data: [{ id: 'gpt-6.1-sol', object: 'model', display_name: 'GPT-6.1 Sol', owned_by: 'openai' }], object: 'list' },
  }
  const { impl, calls } = mockFetch(routes)
  globalThis.fetch = impl
  const credentials = makeCredentials()
  const channel = createXingchiChannel({ credentials })

  const added = await channel.addAccount({ refreshToken: RT_A })
  eq(added.account.email, 'wangkaiyu066@gmail.com', 'channel: account email')
  eq(added.account.apiKey, 'sk-xc-key', 'channel: adopted key')
  eq(added.balance, 887.9650941, 'channel: balance read')

  const st = await channel.status()
  eq(st.accountCount, 1, 'channel: one account')
  eq(st.loggedIn, true, 'channel: logged in')

  const bal = await channel.dispatch({ action: 'balances' })
  eq(bal.balances['wangkaiyu066@gmail.com'], 887.9650941, 'channel: balances by email')

  const pool = await channel.pool()
  eq(pool.accounts.length, 1, 'channel: pool has one account')
  eq(pool.accounts[0].accessKey, 'sk-xc-key', 'channel: pool uses api key')

  const checkin = await channel.checkinAll()
  eq(checkin.checkedCount, 1, 'channel: one check-in')
  eq(checkin.totalAmount, 300, 'channel: check-in total')

  // Rotate: the old refresh token must be replaced in storage.
  const rotated = await channel.rotate('wangkaiyu066@gmail.com', { force: true })
  eq(rotated.accessToken, 'at2', 'channel: rotation issued new access token')
  const stored = await channel.store.read()
  eq(stored.accounts[0].refreshToken, `rt_${String(2).padStart(64, '0')}`, 'channel: rotated refresh token stored')

  // A second add with the same email replaces rather than duplicates.
  await channel.addAccount({ refreshToken: RT_B })
  const finalStore = await channel.store.read()
  eq(finalStore.accounts.length, 1, 'channel: re-add replaces same email')
}

// [6] channel: reject malformed refresh token without touching the network
{
  const credentials = makeCredentials()
  const channel = createXingchiChannel({ credentials })
  let threw = null
  try { await channel.addAccount({ refreshToken: 'not-a-token' }) } catch (error) { threw = error }
  eq(threw?.status, 400, 'channel: malformed rt rejected')
  eq(threw?.code, 'invalid_input', 'channel: malformed rt code')
}

// [7] gateway descriptor: own token, upstream, UA and route subset
{
  const credentials = makeCredentials()
  const channel = createXingchiChannel({ credentials })
  const descriptor = channel.gatewayFor('tb-local-' + 'f'.repeat(64))
  eq(descriptor.baseUrl, 'https://api.xingchiapi.com', 'gateway: xingchi upstream')
  eq(descriptor.ua, 'DeepSeek-Harness/0.2.2', 'gateway: versioned UA')
  eq(descriptor.routes, ['models', 'responses'], 'gateway: responses only')
  ok(!descriptor.routes.includes('anthropic'), 'gateway: no anthropic route')
  ok(!descriptor.routes.includes('chat'), 'gateway: no chat route')
}

// [8] unknown action rejected
{
  const credentials = makeCredentials()
  const channel = createXingchiChannel({ credentials })
  let threw = null
  try { await channel.dispatch({ action: 'nope' }) } catch (error) { threw = error }
  eq(threw?.status, 400, 'channel: unknown action 400')
}

console.log(`PASS: ${pass}  FAIL: ${fail}`)
if (fail) process.exitCode = 1
