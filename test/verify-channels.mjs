// Gateway channel isolation: one server, several channels, tokens must not cross.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createGateway } from '../lib/gateway.js'

let pass = 0
let fail = 0
function ok(cond, label, extra) {
  if (cond) { pass += 1; return }
  fail += 1
  console.log(`FAIL: ${label}${extra ? ' :: ' + JSON.stringify(extra) : ''}`)
}
function eq(a, b, label) { ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), label, { actual: a, expected: b }) }

const TOKEN_TB = 'tb-local-' + 'a'.repeat(64)
const TOKEN_XC = 'tb-local-' + 'b'.repeat(64)

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        // Node on Windows aborts at exit when keep-alive sockets are still open,
        // so drop them explicitly before closing.
        close: () => new Promise((done) => {
          server.closeAllConnections?.()
          server.close(done)
        }),
      })
    })
  })
}

function pool(accounts) {
  return async () => ({ accounts, tuning: { requestRetryRounds: 0, maxRetryIntervalMs: 0, cooldownMs: 0 } })
}

// Two channels with distinct upstreams, tokens and route sets.
const seen = []
const fetchImpl = async (url, init) => {
  const target = String(url)
  seen.push({ url: target, ua: init.headers.get('user-agent'), auth: init.headers.get('authorization'), apiKey: init.headers.get('x-api-key') })
  if (target.startsWith('https://tb.example')) {
    return new Response(JSON.stringify({ data: [{ id: 'tb-model' }], object: 'list' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (target.startsWith('https://xc.example')) {
    return new Response(JSON.stringify({ data: [{ id: 'xc-model' }], object: 'list' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response('nope', { status: 500 })
}

const gw = createGateway({
  channels: [
    {
      id: 'tokenbank', label: 'TokenBank', token: TOKEN_TB, baseUrl: 'https://tb.example',
      routes: ['models', 'anthropic', 'chat', 'responses'], getPool: pool([{ id: 'tb-1', accessKey: 'sk-tb' }]),
    },
    {
      id: 'xingchi', label: '星驰', token: TOKEN_XC, baseUrl: 'https://xc.example', ua: 'DeepSeek-Harness/0.2.2',
      routes: ['models', 'responses'], getPool: pool([{ id: 'xc-1', accessKey: 'sk-xc' }]),
    },
  ],
  authority: undefined,
  fetchImpl,
})

const listener = await listen((req, res) => { void gw.handle(req, res).catch(() => { res.statusCode = 502; res.end() }) })

const call = (path, token, init = {}) => fetch(listener.url + path, {
  ...init,
  headers: { 'x-api-key': token, 'content-type': 'application/json', ...(init.headers || {}) },
})
// Force a fresh socket per request so no keep-alive handle survives the close.
const callFresh = (path, token, init = {}) => call(path, token, { ...init, headers: { connection: 'close', ...(init.headers || {}) } })

// [1] each token reaches only its own upstream
{
  seen.length = 0
  const a = await call('/v1/models', TOKEN_TB)
  eq(a.status, 200, 'tokenbank: models 200')
  eq((await a.json()).data[0].id, 'tb-model', 'tokenbank: own upstream')
  eq(seen[0].url, 'https://tb.example/v1/models', 'tokenbank: routed to tb upstream')
  eq(seen[0].auth, 'Bearer sk-tb', 'tokenbank: spends its own key')

  seen.length = 0
  const b = await call('/v1/models', TOKEN_XC)
  eq(b.status, 200, 'xingchi: models 200')
  eq((await b.json()).data[0].id, 'xc-model', 'xingchi: own upstream')
  eq(seen[0].url, 'https://xc.example/v1/models', 'xingchi: routed to xc upstream')
  eq(seen[0].auth, 'Bearer sk-xc', 'xingchi: spends its own key')
  eq(seen[0].ua, 'DeepSeek-Harness/0.2.2', 'xingchi: pinned User-Agent')
}

// [2] TokenBank keeps the client UA (no override)
{
  seen.length = 0
  await call('/v1/models', TOKEN_TB)
  eq(seen[0].ua, null, 'tokenbank: no UA override')
}

// [3] route subsets are enforced per channel
{
  const anthro = await call('/v1/messages', TOKEN_XC, {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-6.1-sol', max_tokens: 1, messages: [] }),
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
  })
  eq(anthro.status, 404, 'xingchi: /v1/messages refused')
  const text = await anthro.text()
  ok(text.includes('does not serve'), 'xingchi: refusal explains the channel', text)

  const chat = await call('/v1/chat/completions', TOKEN_XC, {
    method: 'POST', body: JSON.stringify({ model: 'x', messages: [] }),
  })
  eq(chat.status, 404, 'xingchi: /v1/chat/completions refused')

  const tbAnthropic = await call('/v1/messages', TOKEN_TB, {
    method: 'POST',
    body: JSON.stringify({ model: 'glm', max_tokens: 1, messages: [] }),
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
  })
  // The mock upstream answers the model list body for any path, so a 200 here
  // proves the route was accepted rather than refused by the channel gate.
  ok(tbAnthropic.status !== 404, 'tokenbank: /v1/messages accepted')
}

// [4] an unknown token is rejected outright
{
  const bad = await call('/v1/models', 'tb-local-' + 'c'.repeat(64))
  eq(bad.status, 401, 'unknown token: 401')
}

// [5] the two channels keep independent cooldowns and counters
{
  const xcStats = gw.stats([{ id: 'xc-1' }], 'xingchi')
  const tbStats = gw.stats([{ id: 'tb-1' }], 'tokenbank')
  eq(xcStats.served > 0, true, 'xingchi: served counted')
  eq(tbStats.served > 0, true, 'tokenbank: served counted')
  eq(JSON.stringify(xcStats.cooldowns), '{}', 'xingchi: no cooldown')
  eq(JSON.stringify(tbStats.cooldowns), '{}', 'tokenbank: no cooldown')

  gw.reset('xingchi')
  eq(gw.stats([{ id: 'xc-1' }], 'xingchi').lastPicked, '', 'xingchi: reset clears its own state')
  eq(gw.stats([{ id: 'tb-1' }], 'tokenbank').served > 0, true, 'tokenbank: reset of another channel does not clear counters')
}

// [6] legacy single-channel construction still works
{
  const legacy = createGateway({
    getPool: pool([{ id: 'legacy-1', accessKey: 'sk-legacy' }]),
    baseUrl: 'https://tb.example', token: TOKEN_TB, fetchImpl,
  })
  const legacyListener = await listen((req, res) => { void legacy.handle(req, res).catch(() => { res.statusCode = 502; res.end() }) })
  const res = await fetch(legacyListener.url + '/v1/models', { headers: { 'x-api-key': TOKEN_TB } })
  eq(res.status, 200, 'legacy: single-channel still serves')
  eq(legacy.stats([{ id: 'legacy-1' }]).served > 0, true, 'legacy: stats default to tokenbank')
  await legacyListener.close()
}

await listener.close()
console.log(`PASS: ${pass}  FAIL: ${fail}`)
if (fail) process.exitCode = 1
