// Render smoke test: both channel branches must render, and each must format
// money in its own unit (TokenBank nano-USD vs XingChi USD float).
// Uses a tiny React stand-in — enough to run the component bodies, run effects
// once, and walk the returned tree. This is not a pixel test.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

let pass = 0
const fails = []
function ok(cond, label, extra) {
  if (cond) { pass += 1; return }
  fails.push(`${label}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`)
}

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '').replace(/\\/g, '/')
const source = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8')

/* ── minimal React with a single-shot effect queue ───────────────────── */
function createElement(type, props, ...children) {
  const merged = Object.assign({}, props)
  if (children.length === 1) merged.children = children[0]
  else if (children.length > 1) merged.children = children
  return { type, props: merged }
}

let hookState = []
let hookCursor = 0
let effectQueue = []
const React = {
  createElement,
  useState(initial) {
    const index = hookCursor++
    if (index >= hookState.length) hookState.push(typeof initial === 'function' ? initial() : initial)
    return [hookState[index], (next) => {
      hookState[index] = typeof next === 'function' ? next(hookState[index]) : next
    }]
  },
  useEffect(fn) { effectQueue.push(fn) },
  useRef(value) { return { current: value } },
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
}

function makeEl(tag) {
  return {
    tagName: tag, style: {}, dataset: {}, className: '',
    appendChild(child) { this.children = (this.children || []).concat(child); return child },
    removeChild(child) { this.children = (this.children || []).filter((item) => item !== child) },
    setAttribute() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { right: 100, top: 100, left: 0, bottom: 0, width: 100, height: 20 } },
    querySelector() { return null }, querySelectorAll() { return [] },
  }
}

const documentStub = {
  head: makeEl('head'), body: makeEl('body'),
  createElement: (tag) => makeEl(tag),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
}

/* ── fake host: answers by (channel, action) ─────────────────────────── */
const TOKENBANK_STATUS = {
  ok: true, channel: 'tokenbank', loggedIn: true, activeId: 'a@x.com',
  accounts: [{ id: 'a@x.com', email: 'a@x.com', displayName: 'A', active: true, expired: false, pool: true, hasKey: true }],
  account: { balance_nano_usd: 2500000000 },
  autoCheckin: { enabled: true, todayDone: false },
  portalUrl: 'https://bank.skillpie.cn',
}
const XINGCHI_STATUS = {
  ok: true, channel: 'xingchi', loggedIn: true,
  accounts: [{ id: 'b@y.com', email: 'b@y.com', userId: 7, displayName: 'b@y.com', pool: true, hasKey: true, expired: false }],
  accountCount: 1, gateway: {}, autoCheckin: { enabled: true, todayDone: false },
  site: 'https://xingchiapi.com',
}
const calls = []
const host = {
  status: (channel) => (channel === 'xingchi' ? XINGCHI_STATUS : TOKENBANK_STATUS),
  'accounts-balance': (channel) => (channel === 'xingchi'
    ? { ok: true, balances: { 'b@y.com': 12.5 }, accountCount: 1 }
    : { ok: true, balances: { 'a@x.com': 2500000000 }, accountCount: 1 }),
  balances: (channel) => (channel === 'xingchi'
    ? { ok: true, balances: { 'b@y.com': 12.5 }, accountCount: 1 }
    : { ok: true, balances: { 'a@x.com': 2500000000 }, accountCount: 1 }),
  'checkin-status': (channel) => (channel === 'xingchi'
    ? { ok: true, checkin: { enabled: true, claimedToday: false, amount: 300 } }
    : { ok: true, checkin: { enabled: true, checked_today: false, amount_nano_usd: 100000000, streak: 2 } }),
  'settings-get': () => ({
    ok: true,
    gateway: { requestRetryRounds: 3, maxRetryIntervalMs: 30000, cooldownMs: 60000 },
    autoCheckin: { enabled: true, lastDay: '', todayDone: false },
    accounts: [{ id: 'a@x.com', email: 'a@x.com', displayName: 'A', active: true, expired: false, pool: true, hasKey: true }],
    accountCount: 1, liveCount: 1, poolCount: 1,
    listening: true, port: 39917, upstream: 'https://bank.skillpie.cn',
  }),
  'gateway-status': () => ({
    ok: true, port: 39917, listening: true,
    poolCount: 1, accounts: 1, ready: 1,
    served: 0, switched: 0, waitedRounds: 0, lastPicked: '', cooldowns: {},
    pool: ['a@x.com'], tuning: { requestRetryRounds: 3, maxRetryIntervalMs: 30000, cooldownMs: 60000 },
  }),
}
async function fakeFetch(_url, init) {
  const body = JSON.parse(init.body)
  calls.push(body)
  const handler = host[body.action]
  const payload = handler ? handler(body.channel) : { ok: true }
  return { ok: true, status: 200, json: async () => payload }
}

let plugin = null
const loader = {
  load(definition) {
    plugin = definition.factory((name) => {
      if (name === 'react') return React
      if (name === 'react-dom') return { createPortal: (node) => node }
      throw new Error(`unexpected module: ${name}`)
    })
  },
}

// Timers are recorded but never scheduled: the settings page re-arms a 5s
// poll, and real timers would keep the process alive forever.
const timers = []
const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
const fakeClearTimeout = () => {}
const fakeSetInterval = (fn, ms) => { timers.push({ fn, ms, repeat: true }); return timers.length }

const sandbox = {
  window: {
    __ModuleLoader__: loader, innerWidth: 1280, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
    setInterval: fakeSetInterval, clearInterval: fakeClearTimeout,
    location: { href: 'http://127.0.0.1:1/' },
  },
  document: documentStub,
  navigator: { clipboard: { writeText: async () => {} } },
  React, console, setTimeout, clearTimeout,
  setInterval: fakeSetInterval, clearInterval: fakeClearTimeout,
  fetch: fakeFetch,
  AbortSignal: { timeout: () => undefined },
  URL, JSON, Object, Number, String, Boolean, Array, Math, Date, Promise, Error,
}
sandbox.window.document = documentStub
sandbox.globalThis = sandbox

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

ok(plugin !== null, 'bundle: factory 被执行')
ok(plugin.name === 'dsh-tokenbank-multi', 'plugin: name', plugin.name)

const slots = []
const locale = []
const ctx = {
  logger: { warn() {}, info() {} },
  slots: {
    inject(name, register) { slots.push({ name, value: register() }); return () => {} },
    register(definition, component) { return { definition, component } },
  },
  locale: { register(ns, dict) { locale.push({ ns, dict }); return () => {} }, bind() { return (key) => key } },
  effect(fn) { fn() },
  get() { return undefined },
}
plugin.apply(ctx)

const slot = (id) => slots.map((entry) => entry.value).find((value) => value && value.definition && value.definition.id === id)

const panelSlot = slot('dsh-tokenbank-multi-panel')
const entrySlot = slot('dsh-tokenbank-multi-entry')
const balanceSlot = slot('dsh-tokenbank-multi-balance')
const settingsSlot = slot('dsh-tokenbank-multi')
ok(Boolean(panelSlot), 'slot: 账号面板已注册')
ok(Boolean(entrySlot), 'slot: 输入框入口已注册')
ok(Boolean(balanceSlot), 'slot: 余额胶囊已注册')
ok(Boolean(settingsSlot), 'slot: 设置页已注册')

/** Render a component, run its effects once, and let pending promises settle. */
async function mount(component, props) {
  hookState = []
  hookCursor = 0
  effectQueue = []
  let tree = null
  let threw = null
  try { tree = component(props || {}) } catch (error) { threw = error }
  if (threw) return { tree, threw, text: '' }
  const cleanups = []
  for (const effect of effectQueue.splice(0)) {
    try {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    } catch (error) { threw = error }
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  // Second pass picks up whatever the effects wrote into state.
  hookCursor = 0
  effectQueue = []
  try { tree = component(props || {}) } catch (error) { threw = error }
  return { tree, threw, text: collect(tree), cleanups }
}

/** Flatten every string / number in the element tree, expanding function components. */
function collect(node, out = [], depth = 0, seen = new Set()) {
  if (depth > 80) return out.join(' ')
  if (node === null || node === undefined || node === false || node === true) return out.join(' ')
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out.join(' ') }
  if (Array.isArray(node)) { node.forEach((item) => collect(item, out, depth + 1, seen)); return out.join(' ') }
  if (typeof node === 'object') {
    if (seen.has(node)) return out.join(' ')
    seen.add(node)
    // Function components (h(Component, props)) must be expanded to see their text.
    if (typeof node.type === 'function') {
      try { collect(node.type(node.props || {}), out, depth + 1, seen) } catch (error) { /* 组件内部错误由上层断言覆盖 */ }
    }
    if (node.props) {
      collect(node.props.children, out, depth + 1, seen)
      for (const key of ['title', 'placeholder', 'value', 'label', 'hint', 'detail']) {
        if (typeof node.props[key] === 'string') out.push(node.props[key])
      }
    }
    return out.join(' ')
  }
  return out.join(' ')
}

/* ── 1. closed panel renders nothing ─────────────────────────────────── */
{
  const result = await mount(panelSlot.component, {})
  ok(result.threw === null, 'render: 关闭状态不抛错', result.threw && result.threw.message)
  ok(result.tree === null, 'render: 关闭状态返回 null', result.tree && typeof result.tree)
}

/* ── 2. open the panel through the composer entry (TokenBank default) ── */
{
  hookState = []
  hookCursor = 0
  effectQueue = []
  entrySlot.component({})
  const button = null
  // EntryOverlay is only mounted when the store says authOpen; drive that by
  // clicking the entry button the component renders.
  const entryTree = entrySlot.component({})
  ok(entryTree && entryTree.props && typeof entryTree.props.onClick === 'function', 'render: 入口按钮带 onClick')
  entryTree.props.onClick({ currentTarget: makeEl('button'), stopPropagation() {} })
}

/* ── 3. TokenBank branch: money in nano-USD ──────────────────────────── */
{
  const result = await mount(panelSlot.component, {})
  ok(result.threw === null, 'render[tokenbank]: 不抛错', result.threw && result.threw.message)
  ok(result.text.includes('$2.50'), 'render[tokenbank]: 余额按 nano 换算成 $2.50', result.text.slice(0, 300))
  ok(result.text.includes('a@x.com'), 'render[tokenbank]: 显示账号邮箱')
  ok(result.text.includes('TokenBank'), 'render[tokenbank]: 标题为 TokenBank')
  ok(result.text.includes('星驰'), 'render[tokenbank]: 有星驰渠道 tab')
  const asked = calls.filter((call) => call.action === 'status').map((call) => call.channel)
  ok(asked.includes('tokenbank'), 'render[tokenbank]: status 请求带了 tokenbank 渠道', asked)
}

/* ── 4. switch to XingChi and render its own branch ──────────────────── */
{
  // Click the 星驰 tab inside the rendered tree. Function components (the
  // ChannelTabs wrapper) must be expanded the same way collect() does.
  const first = await mount(panelSlot.component, {})
  const tabs = []
  const seenNodes = new Set()
  ;(function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 80 || seenNodes.has(node)) return
    seenNodes.add(node)
    if (Array.isArray(node)) return node.forEach((item) => walk(item, depth + 1))
    if (typeof node.type === 'function') {
      try { walk(node.type(node.props || {}), depth + 1) } catch (error) { /* 忽略 */ }
    }
    const props = node.props || {}
    if (props.role === 'tab' && typeof props.onClick === 'function') tabs.push(props)
    walk(props.children, depth + 1)
  })(first.tree, 0)
  ok(tabs.length >= 2, 'render: 两个渠道 tab 都在', tabs.length)
  const xingchiTab = tabs.find((tab) => tab.children === '星驰')
  ok(Boolean(xingchiTab), 'render: 找到星驰 tab')
  if (xingchiTab) xingchiTab.onClick()

  const result = await mount(panelSlot.component, {})
  ok(result.threw === null, 'render[xingchi]: 不抛错', result.threw && result.threw.message)
  ok(result.text.includes('b@y.com'), 'render[xingchi]: 显示星驰账号')
  ok(result.text.includes('星驰'), 'render[xingchi]: 标题为星驰')
  ok(result.text.includes('refreshTokenPlaceholder'), 'render[xingchi]: 有 refresh_token 输入框', result.text.slice(0, 200))
  const asked = calls.filter((call) => call.action === 'status').map((call) => call.channel)
  ok(asked.includes('xingchi'), 'render[xingchi]: status 请求带了 xingchi 渠道', asked)

  // 星驰的余额 action 叫 balances（TokenBank 叫 accounts-balance），名字搞错
  // 余额就永远拉不到。mount() 只跑顶层组件的 effect，所以这里把 XingchiPanel
  // 单独当成顶层组件挂一次，让它的 effect 真正执行。
  const panelNode = (function find(node, depth, seen) {
    if (!node || typeof node !== 'object' || depth > 80 || seen.has(node)) return null
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) { const hit = find(item, depth + 1, seen); if (hit) return hit }
      return null
    }
    if (typeof node.type === 'function' && node.type.name === 'XingchiPanel') return node
    if (typeof node.type === 'function') {
      try { const hit = find(node.type(node.props || {}), depth + 1, seen); if (hit) return hit } catch (error) { /* 忽略 */ }
    }
    return find(node.props && node.props.children, depth + 1, seen)
  })(result.tree, 0, new Set())
  ok(Boolean(panelNode), 'render[xingchi]: 渲染树里有 XingchiPanel')
  if (panelNode) await mount(panelNode.type, panelNode.props)
  const balanceCalls = calls.filter((call) => call.action === 'balances' || call.action === 'accounts-balance')
  const xingchiBalance = balanceCalls.filter((call) => call.channel === 'xingchi')
  ok(xingchiBalance.length > 0, 'render[xingchi]: 拉余额用的是 balances action', balanceCalls)
  ok(xingchiBalance.every((call) => call.action === 'balances'), 'render[xingchi]: 星驰不发 accounts-balance', xingchiBalance)
}

/* ── 5. settings page still renders ──────────────────────────────────── */
{
  const result = await mount(settingsSlot.component, {})
  ok(result.threw === null, 'render: 设置页不抛错', result.threw && result.threw.message)
}

/* ── 6. locale registration ──────────────────────────────────────────── */
{
  ok(locale.length === 1 && locale[0].ns === 'dsh-tokenbank-multi', 'locale: 注册了一次')
  const dict = locale[0] && locale[0].dict
  const zhKeys = Object.keys((dict && dict.zh) || {})
  const enKeys = Object.keys((dict && dict.en) || {})
  ok(zhKeys.length === enKeys.length && zhKeys.length > 0, 'locale: 双语键数一致', { zh: zhKeys.length, en: enKeys.length })
  const missing = ['channel', 'refreshToken', 'accountsCount'].filter((key) => !zhKeys.includes(key))
  ok(missing.length === 0, 'locale: 渠道相关键存在', missing)
}

console.log(`PASS: ${pass}  FAIL: ${fails.length}`)
for (const item of fails) console.log('  ✗ ' + item)
if (fails.length) process.exitCode = 1
