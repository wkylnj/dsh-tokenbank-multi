/**
 * dsh-tokenbank-multi — host half.
 *
 * 在 dsh-tokenbank 基础上改造的多账号版本：删掉充值 / 托管 / 交易，只保留
 * 余额、签到、账号切换与管理。宿主侧负责：
 *
 *   1. POST /dsh-tokenbank-multi/api —— 面板与门户之间的同源代理；
 *   2. 多账号凭据存储（一条 credentials 记录里放账号数组）；
 *   3. 旧版单账号记录 dsh-tokenbank/identity 的一次性迁移。
 *
 * 账号记录 `dsh-tokenbank/accounts` 的 payload 形状：
 *   { activeId: string|null, accounts: Account[] }
 *   Account = { id, email, displayName, sessionToken, expiresAtMS, accessKey?, password?, addedAt }
 *
 * 门户调用全部经 lib/tb.js（纯 fetch 包装），会话令牌就是门户的
 * `tb_portal_session` cookie 值，按账号分别保存。
 */
import { PortalError } from './tb.js'
import * as tb from './tb.js'
import { createServer } from 'node:http'
import { createGateway } from './gateway.js'

export const ROUTE = '/dsh-tokenbank-multi/api'
/**
 * 网关自己监听的固定端口。
 *
 * 为什么不用 DSH 的 webServer 端口：provider 的 baseURL 是写进 settings 的持久
 * 配置，而 DSH 每次启动的 web 端口可能变（61428 只是某一次的值）。一旦端口变
 * 了，provider 就会指向一个没人监听的地址，所有推理请求直接失败。固定端口
 * 让 baseURL 可以长期不变，插件没起来时也只是连接被拒，重载插件即恢复。
 */
export const GATEWAY_PORT = 39917
export const ACCOUNTS_RECORD = 'dsh-tokenbank/accounts'
/** 旧版 dsh-tokenbank 的单账号记录，仅在迁移时读一次。 */
export const LEGACY_IDENTITY_RECORD = 'dsh-tokenbank/identity'
/**
 * 模型分组引用的凭据名。llm-pi-ai 的 provider profile 里 `apiKeyEnv` 只是这个
 * **名字**，值在每次请求流开始时经 credentials.resolve() 读取
 * （dsh-llm-pi-ai/lib/index.js:3090 与 :2103），所以换账号只需改写这里的值，
 * 不需要动 providers 结构，也不需要重启插件。
 */
export const MODEL_KEY_REF = 'TOKENBANK_API_KEY'
const MAX_BODY = 256 * 1024

/** 网关实例引用：apply 里装配，dispatch 里读状态。 */
const gatewayRef = { current: null }

/**
 * 网关可调参数的当前值。`getAccounts` 每次读 store 时刷新它，
 * `getTuning` 把它交给网关 —— 所以设置页写完的**下一个请求**就生效。
 */
const tuningRef = { current: { requestRetryRounds: 3, maxRetryIntervalMs: 30000, cooldownMs: 60000 } }

/** 网关是否真的在监听（端口被占或启动失败时为 false，设置页据此显示徽标）。 */
const gatewayListening = { current: false }

/**
 * 轮询参数的出厂值与 clamp 区间。
 * 上限刻意留得宽松：它们只影响「等多久」，填大了最坏是多等一会儿，
 * 不像 maxRetries 那样会无限重试。
 */
export const DEFAULT_GATEWAY_SETTINGS = {
  requestRetryRounds: 3,
  maxRetryIntervalMs: 30 * 1000,
  cooldownMs: 60 * 1000,
}

const GATEWAY_LIMITS = {
  requestRetryRounds: [0, 10],
  maxRetryIntervalMs: [0, 120 * 1000],
  cooldownMs: [0, 600 * 1000],
}

/** store 里的 gateway 段：缺字段/非法值一律回落到默认，不抛错。 */
export function normalizeGatewaySettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const key of Object.keys(DEFAULT_GATEWAY_SETTINGS)) {
    const [min, max] = GATEWAY_LIMITS[key]
    const value = Number(source[key])
    out[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : DEFAULT_GATEWAY_SETTINGS[key]
  }
  return out
}

const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-tokenbank-multi',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      const raw = input.baseUrl
      if (raw !== undefined) {
        if (typeof raw !== 'string' || !raw.trim()) {
          issues.push(issue('expected a non-empty string', 'baseUrl'))
        } else {
          try {
            const url = new URL(raw.trim())
            if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
            value.baseUrl = raw.trim().replace(/\/+$/, '')
          } catch {
            issues.push(issue('expected an absolute http(s) URL', 'baseUrl'))
          }
        }
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/* ── account store ───────────────────────────────────────────────────── */

const emptyStore = () => ({
  activeId: null,
  accounts: [],
  // 自动签到：enabled 开启后由后台定时器每天跑一次；lastDay 记录最近成功跑过的本地日期
  autoCheckin: { enabled: false, lastDay: '' },
  // 网关可调参数，设置页读写
  gateway: { ...DEFAULT_GATEWAY_SETTINGS },
})

/** 本地日期 YYYY-MM-DD（按宿主时区，签到是按自然日去重的）。 */
function localDayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function normalizeAutoCheckin(raw) {
  if (!raw || typeof raw !== 'object') return { enabled: false, lastDay: '' }
  return {
    enabled: raw.enabled === true,
    lastDay: typeof raw.lastDay === 'string' ? raw.lastDay : '',
  }
}

/** 账号最小完整性：有邮箱、有会话令牌。 */
function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null
  const email = String(raw.email ?? '').trim()
  const sessionToken = String(raw.sessionToken ?? '')
  if (!email || !sessionToken) return null
  return {
    id: String(raw.id ?? email) || email,
    email,
    displayName: String(raw.displayName ?? ''),
    sessionToken,
    expiresAtMS: Number(raw.expiresAtMS ?? 0) || 0,
    accessKey: String(raw.accessKey ?? ''),
    ...(raw.password ? { password: String(raw.password) } : {}),
    addedAt: Number(raw.addedAt ?? Date.now()) || Date.now(),
    // 是否参与网关轮询。缺字段视为 true：老数据加进来就自动进池，
    // 用户不用去设置页逐个勾一遍。
    pool: raw.pool !== false,
  }
}

async function readStore(ctx) {
  const credentials = await ctx.get('credentials')
  const record = await credentials.readRecord(ACCOUNTS_RECORD)
  const payload = record?.payload
  if (payload && Array.isArray(payload.accounts)) {
    const accounts = payload.accounts.map(normalizeAccount).filter(Boolean)
    const activeId = accounts.some((a) => a.id === payload.activeId) ? payload.activeId : (accounts[0]?.id ?? null)
    return {
      activeId,
      accounts,
      autoCheckin: normalizeAutoCheckin(payload.autoCheckin),
      gateway: normalizeGatewaySettings(payload.gateway),
    }
  }
  // 迁移：旧版单账号记录 → 账号列表（只做一次，成功后删掉旧记录）
  const legacy = await credentials.readRecord(LEGACY_IDENTITY_RECORD)
  const old = normalizeAccount(legacy?.payload)
  if (old) {
    const migrated = {
      activeId: old.id,
      accounts: [old],
      autoCheckin: { enabled: false, lastDay: '' },
      gateway: { ...DEFAULT_GATEWAY_SETTINGS },
    }
    await writeStore(ctx, migrated)
    try {
      await credentials.deleteRecord(LEGACY_IDENTITY_RECORD)
    } catch { /* 旧记录删不掉也不影响使用 */ }
    return migrated
  }
  return emptyStore()
}

async function writeStore(ctx, store) {
  const credentials = await ctx.get('credentials')
  const payload = {
    activeId: store.activeId ?? null,
    accounts: (store.accounts || []).map((account) => ({
      id: account.id,
      email: account.email,
      displayName: account.displayName ?? '',
      sessionToken: account.sessionToken,
      expiresAtMS: account.expiresAtMS ?? 0,
      accessKey: account.accessKey ?? '',
      ...(account.password ? { password: account.password } : {}),
      addedAt: account.addedAt ?? Date.now(),
      pool: account.pool !== false,
    })),
    autoCheckin: normalizeAutoCheckin(store.autoCheckin),
    gateway: normalizeGatewaySettings(store.gateway),
  }
  await credentials.modifyRecord(ACCOUNTS_RECORD, () => ({ kind: 'grant', payload }))
}

/** 会话令牌仍在有效期内？（只看本地时钟；服务端 401 由各 action 处理） */
function accountLive(account) {
  return Boolean(account?.sessionToken) && (!account.expiresAtMS || account.expiresAtMS > Date.now())
}

/** 下发给客户端的账号摘要：不含任何令牌。 */
function publicAccount(account, activeId) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName || '',
    active: account.id === activeId,
    expired: !accountLive(account),
    hasPassword: Boolean(account.password),
    addedAt: account.addedAt,
    pool: account.pool !== false,
  }
}

/** 按邮箱 upsert 账号并置为当前账号。 */
function upsertAccount(store, account) {
  const index = store.accounts.findIndex((item) => item.id === account.id || item.email === account.email)
  const merged = index >= 0
    ? { ...store.accounts[index], ...account, addedAt: store.accounts[index].addedAt }
    : { ...account, addedAt: Date.now() }
  const accounts = index >= 0
    ? store.accounts.map((item, i) => (i === index ? merged : item))
    : store.accounts.concat(merged)
  return { activeId: merged.id, accounts }
}

/* ── dispatch ────────────────────────────────────────────────────────── */

/**
 * 把 accessKey 写进模型分组引用的凭据。返回是否成功。
 *
 * 这是多账号切换的核心：`apiKeyEnv` 在 llm-pi-ai 里只是个 ref 名字，真正的值
 * 每次请求都从 credentials 重新解析，所以写这里就等于「换号」，且下一次请求
 * 立即生效（见 dsh-llm-pi-ai/lib/index.js 的 resolveApiKey / streamWithSnapshot）。
 */
async function syncModelKey(ctx, accessKey) {
  if (!accessKey) return false
  try {
    const credentials = await ctx.get('credentials')
    await credentials.set(MODEL_KEY_REF, accessKey)
    return true
  } catch (error) {
    ctx.logger?.warn?.(`dsh-tokenbank-multi: failed to sync model key: ${error?.message ?? error}`)
    return false
  }
}

/**
 * 确保账号有一把可用的 accessKey。
 *
 * 新注册/新登录的账号在门户里**默认没有任何访问密钥**（网页端要手动点「创建」）。
 * 这里替用户完成：先列出现有的，有就回读明文；一把都没有就现建一把。
 * 返回 `{ accessKey, created }`，失败返回 `{ accessKey: '' }`。
 */
async function ensureAccessKey(ctx, baseUrl, account) {
  const sessionToken = account?.sessionToken
  if (!sessionToken) return { accessKey: '' }
  try {
    const keys = (await tb.listAccessKeys(baseUrl, sessionToken))?.keys ?? []
    const active = keys.find((k) => k && k.id != null && (k.status ?? 'active') === 'active')
    if (active && active.id != null) {
      const revealed = await tb.revealAccessKey(baseUrl, sessionToken, active.id)
      if (revealed?.key) return { accessKey: String(revealed.key), created: false }
    }
    // 一把可用的都没有 → 就地创建一把
    const made = await tb.createAccessKey(baseUrl, sessionToken, account.email || 'dsh')
    if (made?.keyValue) return { accessKey: String(made.keyValue), created: true }
  } catch (error) {
    ctx.logger?.warn?.(`dsh-tokenbank-multi: ensureAccessKey failed: ${error?.message ?? error}`)
  }
  return { accessKey: '' }
}

/**
 * 给所有可用账号签到，返回汇总。
 *
 * 逐个账号**先查状态再决定签不签**：已经签过的直接跳过，避免把「今天本来就有钱」
 * 误算成签到收益，也少打一次 POST。串行是为了不触发门户限流。
 */
async function runCheckinAll(baseUrl, store) {
  const live = (store?.accounts || []).filter((item) => accountLive(item))
  const results = []
  for (const item of live) {
    const row = { id: item.id, email: item.email, displayName: item.displayName }
    try {
      const before = await tb.checkinStatus(baseUrl, item.sessionToken)
      if (before?.enabled === false) {
        results.push({ ...row, status: 'disabled', streak: Number(before?.streak) || 0, amount: 0 })
        continue
      }
      if (before?.checked_today) {
        results.push({ ...row, status: 'already', streak: Number(before?.streak) || 0, amount: 0 })
        continue
      }
      const ci = await tb.doCheckin(baseUrl, item.sessionToken)
      results.push({
        ...row,
        status: ci?.checked_today ? 'checked' : 'failed',
        streak: Number(ci?.streak) || 0,
        amount: Number(ci?.amount_nano_usd) || 0,
      })
    } catch (error) {
      results.push({ ...row, status: 'error', streak: 0, amount: 0, error: String(error?.message || error) })
    }
  }
  const checked = results.filter((item) => item.status === 'checked')
  return {
    results,
    checkedCount: checked.length,
    alreadyCount: results.filter((item) => item.status === 'already').length,
    failedCount: results.filter((item) => item.status === 'error' || item.status === 'failed').length,
    totalNano: checked.reduce((sum, item) => sum + item.amount, 0),
  }
}

/** 自动签到的后台心跳：开启 + 今天没跑过 → 跑一次并记下日期。 */
async function autoCheckinTick(ctx, baseUrl) {
  const store = await readStore(ctx)
  const flag = normalizeAutoCheckin(store.autoCheckin)
  if (!flag.enabled) return null
  const today = localDayKey()
  if (flag.lastDay === today) return null
  if (!store.accounts.some((item) => accountLive(item))) return null
  const summary = await runCheckinAll(baseUrl, store)
  if (summary.results.length === 0) return null
  // 只要跑过就记日期：哪怕全部 already，今天也不必再试。
  await writeStore(ctx, {
    ...store,
    autoCheckin: { enabled: true, lastDay: today },
  })
  if (summary.checkedCount > 0) {
    ctx.logger?.info?.(
      `dsh-tokenbank-multi: auto check-in ${summary.checkedCount} account(s), +$${(summary.totalNano / 1e9).toFixed(2)}`,
    )
  }
  return summary
}

/**
 * `/v1/models` 是插件唯一会消耗 access key 额度的接口——门户 `/api/portal/*`
 * 实测不限流（连打 8 次全 200），而 `/v1/*` 是 **10 秒滑动窗口 4 次**，
 * 超出返回 429 + retry-after。
 *
 * 致命之处在于：LLM 推理请求吃的是**同一个额度桶**。插件每多发一次
 * `/v1/models`，用户下一条消息就少一次配额，于是表现为「老是 429」。
 * 所以这里加三层保护：结果缓存、最小请求间隔、429 冷却。
 */
const GATEWAY_CACHE_TTL_MS = 10 * 60 * 1000
const GATEWAY_MIN_GAP_MS = 60 * 1000
/** accessKey -> { at, models } */
const gatewayCache = new Map()
/** accessKey -> 上次真实发请求的时间戳 */
const gatewayLastAt = new Map()
/** accessKey -> 冷却截止时间戳（429 后） */
const gatewayCooldown = new Map()

/**
 * 取网关模型列表，尽量不发网络请求。
 * @returns {Promise<Array<{id: string}>>}
 */
async function gatewayModels(baseUrl, key, options = {}) {
  const force = options.force === true
  const now = Date.now()
  const cached = gatewayCache.get(key)
  const until = gatewayCooldown.get(key) ?? 0
  // 冷却期内一律不碰网络：宁可给出陈旧结果，也不要再吃一次 429。
  if (!force && until > now) {
    if (cached) return cached.models
    const wait = Math.ceil((until - now) / 1000)
    throw new PortalError(`网关限流中，请 ${wait}s 后再试`, 'rate_limited', 429)
  }
  if (!force && cached && now - cached.at < GATEWAY_CACHE_TTL_MS) return cached.models
  // 缓存已过期但仍想用旧的顶着：距离上次真实请求不足最小间隔就继续用旧的。
  if (!force && cached && now - (gatewayLastAt.get(key) ?? 0) < GATEWAY_MIN_GAP_MS) return cached.models
  try {
    const models = await tb.listGatewayModels(baseUrl, key)
    const stamp = Date.now()
    gatewayCache.set(key, { at: stamp, models })
    gatewayLastAt.set(key, stamp)
    gatewayCooldown.delete(key)
    return models
  } catch (error) {
    if (error instanceof PortalError && error.status === 429) {
      const wait = Number(error.retryAfter) || 10
      gatewayCooldown.set(key, Date.now() + wait * 1000)
      if (cached) return cached.models
    }
    throw error
  }
}

async function dispatch(ctx, cfg, body) {
  const baseUrl = cfg.baseUrl
  const action = typeof body?.action === 'string' ? body.action : ''

  const store = await readStore(ctx)
  const active = store.accounts.find((item) => item.id === store.activeId) ?? null
  const requireLive = async () => {
    if (!accountLive(active)) throw new PortalError('not logged in')
    return active
  }
  /** 账号信息变了之后回写（刷新 accessKey / 令牌过期等）。 */
  const patchActive = async (patch) => {
    if (!active) return
    await writeStore(ctx, {
      ...store,
      activeId: store.activeId,
      accounts: store.accounts.map((item) => (item.id === active.id ? { ...item, ...patch } : item)),
    })
  }

  switch (action) {
    case 'status': {
      const accounts = store.accounts.map((item) => publicAccount(item, store.activeId))
      const base = {
        ok: true,
        portalUrl: baseUrl,
        baseURL: baseUrl,
        activeId: store.activeId,
        accounts,
        autoCheckin: {
          enabled: store.autoCheckin.enabled,
          lastDay: store.autoCheckin.lastDay,
          todayDone: store.autoCheckin.lastDay === localDayKey(),
        },
      }
      if (!accountLive(active)) {
        return { ...base, loggedIn: false, ...(active ? { expired: true } : {}) }
      }
      try {
        const data = await tb.me(baseUrl, active.sessionToken)
        let accessKey = active.accessKey
        let keyCreated = false
        // 存量账号或新账号可能一把 key 都没有：回读现有的，没有就现建一把。
        if (!accessKey) {
          const ensured = await ensureAccessKey(ctx, baseUrl, active)
          if (ensured.accessKey) {
            accessKey = ensured.accessKey
            keyCreated = ensured.created === true
            await patchActive({ accessKey })
          }
        }
        return {
          ...base,
          loggedIn: true,
          email: active.email,
          user: data.user,
          account: data.account,
          accessKey,
          keyCreated,
        }
      } catch (error) {
        if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
          return { ...base, loggedIn: false, expired: true }
        }
        throw error
      }
    }
    case 'switch': {
      const id = String(body.id ?? '')
      const target = store.accounts.find((item) => item.id === id)
      if (!target) throw new PortalError('account not found')
      // 过期账号切过去只会让模型分组拿着一个刷不出来的 key，直接拒绝更清楚。
      // （会话过期需要用户「重新登录」，不是切换能解决的。）
      if (!accountLive(target)) {
        throw new PortalError('account session expired, please sign in again', 'session_expired', 401)
      }
      // 切到一个没有 key 的账号时顺手补建，否则切过去模型分组会拿不到密钥。
      let key = target.accessKey
      let keyCreated = false
      if (!key) {
        const ensured = await ensureAccessKey(ctx, baseUrl, target)
        if (ensured.accessKey) {
          key = ensured.accessKey
          keyCreated = ensured.created === true
          await writeStore(ctx, {
            ...store,
            activeId: id,
            accounts: store.accounts.map((item) => (item.id === id ? { ...item, accessKey: key } : item)),
          })
        }
      } else {
        await writeStore(ctx, { ...store, activeId: id })
      }
      // 关键：把当前账号的 accessKey 写进模型分组引用的凭据。
      // llm-pi-ai 每个请求流都重新 credentials.resolve(apiKeyEnv)，所以下一次请求
      // 就换成新账号的 key，不需要动 providers 结构、不需要重启插件。
      let keySynced = false
      if (key) keySynced = await syncModelKey(ctx, key)
      return { ok: true, activeId: id, keySynced, keyCreated }
    }
    case 'remove': {
      const id = String(body.id ?? '')
      const accounts = store.accounts.filter((item) => item.id !== id)
      const activeId = store.activeId === id ? (accounts[0]?.id ?? null) : store.activeId
      await writeStore(ctx, { ...store, activeId, accounts })
      // 移除的是当前账号时，密钥要跟着落到新的当前账号上，否则模型请求仍用已删账号的 key。
      let keySynced = false
      if (store.activeId === id) {
        const nextActive = accounts.find((item) => item.id === activeId)
        let key = nextActive?.accessKey ?? ''
        if (nextActive && !key) {
          const ensured = await ensureAccessKey(ctx, baseUrl, nextActive)
          if (ensured.accessKey) {
            key = ensured.accessKey
            await writeStore(ctx, {
              ...store,
              activeId,
              accounts: accounts.map((item) => (item.id === activeId ? { ...item, accessKey: key } : item)),
            })
          }
        }
        if (key) keySynced = await syncModelKey(ctx, key)
      }
      return { ok: true, activeId, removed: store.accounts.length !== accounts.length, keySynced }
    }
    case 'accounts-balance': {
      // 并行读每个账号的余额：不切换当前账号，只各自调一次 /me。
      // 过期账号直接返回 null，不浪费请求。
      const entries = await Promise.all(store.accounts.map(async (item) => {
        if (!accountLive(item)) return [item.id, null]
        try {
          const data = await tb.me(baseUrl, item.sessionToken)
          const nano = data?.account?.balance_nano_usd
          return [item.id, typeof nano === 'number' ? nano : null]
        } catch {
          return [item.id, null]
        }
      }))
      return { ok: true, balances: Object.fromEntries(entries) }
    }
    case 'send-code':
      await tb.sendCode(baseUrl, String(body.email ?? ''))
      return { ok: true, sent: true }
    case 'captcha': {
      const data = await tb.newCaptcha(baseUrl)
      return { ok: true, captchaId: data.captcha_id, image: data.image }
    }
    case 'register': {
      const data = await tb.registerWithSession(baseUrl, {
        email: body.email, code: body.code, password: body.password,
        displayName: body.displayName,
      })
      if (!data.sessionToken) throw new PortalError('register succeeded but no session cookie returned')
      const account = normalizeAccount({
        id: String(body.email ?? '').trim(),
        email: String(body.email ?? '').trim(),
        displayName: String(body.displayName ?? '').trim() || String(data.user?.display_name ?? ''),
        sessionToken: data.sessionToken,
        expiresAtMS: Date.now() + data.sessionExpiresMS,
        accessKey: data.accessKey ?? '',
        ...(body.savePassword ? { password: String(body.password ?? '') } : {}),
      })
      const next = upsertAccount(store, account)
      await writeStore(ctx, next)
      // 门户不一定会随注册一起下发 access_key（login 也遇到过），所以这里
      // 与 login/switch 一致，走一次 ensureAccessKey：有 key 就回读，没有就现建。
      let key = account.accessKey
      let keyCreated = false
      if (!key) {
        const ensured = await ensureAccessKey(ctx, baseUrl, account)
        if (ensured.accessKey) {
          key = ensured.accessKey
          keyCreated = ensured.created === true
          await writeStore(ctx, {
            ...next,
            accounts: next.accounts.map((item) => (item.id === account.id ? { ...item, accessKey: key } : item)),
          })
        }
      }
      // 新账号成为当前账号，密钥同步落到模型分组引用的凭据上。
      let keySynced = false
      if (next.activeId === account.id && key) {
        keySynced = await syncModelKey(ctx, key)
      }
      return {
        ok: true,
        user: data.user,
        accessKey: key,
        keyCreated,
        activeId: next.activeId,
        keySynced,
        accounts: next.accounts.map((item) => publicAccount(item, next.activeId)),
      }
    }
    case 'login': {
      const data = await tb.loginWithSession(baseUrl, {
        email: body.email, password: body.password,
        captchaId: body.captchaId, captchaCode: body.captchaCode,
      })
      if (!data.sessionToken) throw new PortalError('login succeeded but no session cookie returned')
      const email = String(body.email ?? '').trim()
      const existing = store.accounts.find((item) => item.id === email || item.email === email)
      const account = normalizeAccount({
        id: email,
        email,
        displayName: String(data.user?.display_name ?? '') || existing?.displayName || '',
        sessionToken: data.sessionToken,
        expiresAtMS: Date.now() + data.sessionExpiresMS,
        accessKey: existing?.accessKey ?? '',
        ...(body.savePassword ? { password: String(body.password ?? '') } : {}),
      })
      const next = upsertAccount(store, account)
      await writeStore(ctx, next)
      // 新账号成为当前账号，密钥同步落到模型分组引用的凭据上。
      // 新账号在门户里通常一把 key 都没有，ensureAccessKey 会顺手建一把。
      let keySynced = false
      let accessKey = account.accessKey
      let created = false
      if (next.activeId === account.id) {
        if (!accessKey) {
          const ensured = await ensureAccessKey(ctx, baseUrl, account)
          accessKey = ensured.accessKey
          created = ensured.created === true
          if (accessKey) {
            await writeStore(ctx, {
              ...next,
              activeId: next.activeId,
              accounts: next.accounts.map((item) => (item.id === account.id ? { ...item, accessKey } : item)),
            })
          }
        }
        if (accessKey) keySynced = await syncModelKey(ctx, accessKey)
      }
      return {
        ok: true,
        user: data.user,
        accessKey,
        keyCreated: created,
        activeId: next.activeId,
        keySynced,
        accounts: next.accounts.map((item) => publicAccount(item, next.activeId)),
      }
    }
    case 'profile-update': {
      const account = await requireLive()
      const displayName = String(body.displayName ?? '').trim()
      const data = await tb.updateProfile(baseUrl, account.sessionToken, displayName)
      await patchActive({ displayName })
      return { ok: true, user: data.user, displayName }
    }
    case 'checkin-status': {
      const account = await requireLive()
      return { ok: true, checkin: await tb.checkinStatus(baseUrl, account.sessionToken) }
    }
    case 'checkin-do': {
      const account = await requireLive()
      return { ok: true, checkin: await tb.doCheckin(baseUrl, account.sessionToken) }
    }
    case 'checkin-all': {
      const summary = await runCheckinAll(baseUrl, store)
      if (summary.results.length === 0) throw new PortalError('no available account')
      return { ok: true, ...summary }
    }
    case 'auto-checkin-get': {
      return {
        ok: true,
        autoCheckin: {
          enabled: store.autoCheckin.enabled,
          lastDay: store.autoCheckin.lastDay,
          todayDone: store.autoCheckin.lastDay === localDayKey(),
        },
        accountCount: store.accounts.filter((item) => accountLive(item)).length,
      }
    }
    case 'auto-checkin-set': {
      const enabled = body.enabled === true
      const today = localDayKey()
      // 先只改开关、保留 lastDay。若接下来要立刻补签，补完再写一次日期，
      // 这样正常路径只有一次 writeStore（早先是无论有没有补签都写两次）。
      let lastDay = store.autoCheckin.lastDay
      const next = { ...store, autoCheckin: { enabled, lastDay } }
      // 打开开关且今天还没跑过 → 立刻补一次，不用等定时器
      let immediate = null
      if (enabled && lastDay !== today) {
        immediate = await runCheckinAll(baseUrl, next)
        if (immediate.results.length > 0) lastDay = today
      }
      await writeStore(ctx, { ...next, autoCheckin: { enabled, lastDay } })
      return {
        ok: true,
        enabled,
        lastDay,
        todayDone: lastDay === today,
        run: immediate,
      }
    }
    case 'settings-get': {
      // 设置页首屏：一次拿齐轮询参数、签到开关、池子规模与监听状态。
      return {
        ok: true,
        gateway: normalizeGatewaySettings(store.gateway),
        autoCheckin: {
          enabled: store.autoCheckin.enabled,
          lastDay: store.autoCheckin.lastDay,
          todayDone: store.autoCheckin.lastDay === localDayKey(),
        },
        accountCount: store.accounts.length,
        liveCount: store.accounts.filter((item) => accountLive(item)).length,
        poolCount: store.accounts.filter((item) => accountLive(item) && item.pool !== false).length,
        listening: gatewayListening.current,
        port: GATEWAY_PORT,
        upstream: baseUrl,
      }
    }
    case 'settings-set': {
      // 只写 gateway 段：clamp 由 normalizeGatewaySettings 统一负责，
      // 非法输入回落到默认而不是报错（设置页因此永远能显示一个可用值）。
      const gateway = normalizeGatewaySettings({ ...store.gateway, ...(body.gateway || {}) })
      await writeStore(ctx, { ...store, gateway })
      // 立刻生效：网关每个请求都读 tuningRef
      tuningRef.current = gateway
      return { ok: true, gateway }
    }
    case 'account-pool': {
      const id = String(body.id ?? '')
      const target = store.accounts.find((item) => item.id === id)
      if (!target) throw new PortalError(`unknown account: ${id || '(empty)'}`)
      const pool = body.pool !== false
      await writeStore(ctx, {
        ...store,
        accounts: store.accounts.map((item) => (item.id === id ? { ...item, pool } : item)),
      })
      return { ok: true, id, pool }
    }
    case 'gateway-models': {
      const key = typeof body.accessKey === 'string' && body.accessKey ? body.accessKey : (active?.accessKey ?? '')
      if (!key) throw new PortalError('no access key available')
      const force = body.force === true
      // 能力元数据（input / reasoning_efforts / 窗口）来自门户 /models —— 不限流，随便调。
      // /v1/models 只用来做「网关真的能调」的过滤，必须走缓存，绝不能一次请求调两遍。
      let list = null
      let groupProtocol = ''
      try {
        const groups = (await tb.portalModels(baseUrl, active?.sessionToken ?? '')) || []
        const flat = []
        for (const group of groups) {
          // 分组的上游协议（claude→anthropic-messages）；取第一个有值的
          if (!groupProtocol && group.protocol) groupProtocol = group.protocol
          for (const model of group.models || []) {
            if (flat.some((m) => m.id === model.id)) continue
            flat.push({
              id: model.id,
              name: model.display_name || model.name || model.id,
              input: model.input,
              reasoningEfforts: model.reasoning_efforts || null,
              contextWindow: model.context_window || undefined,
              maxTokens: model.max_tokens || undefined,
            })
          }
        }
        if (flat.length > 0) list = flat
      } catch { /* 门户目录失败就退回纯网关列表 */ }
      // 只保留网关实际可调的模型：/v1/models 由有可用上游凭证的分组聚合而来，
      // 门户目录会把无凭证分组的模型也列出来，直接加进模型列表只会调用报错。
      // 一次网络请求，结果同时服务「兜底列表」和「可调过滤」两个用途。
      if (list === null) {
        list = await gatewayModels(baseUrl, key, { force })
        return { ok: true, models: list, accessKey: key }
      }
      try {
        const callable = new Set((await gatewayModels(baseUrl, key, { force })).map((m) => m.id))
        if (callable.size > 0) list = list.filter((m) => callable.has(m.id))
      } catch { /* 网关限流/失败时不过滤，退回门户目录 */ }
      return { ok: true, models: list, protocol: groupProtocol || undefined, accessKey: key }
    }
    case 'gateway-status': {
      // 面板/设置页用：网关挂在哪、池子里有几个号、谁在冷却、累计换过多少次号。
      // accounts/ready 保持旧语义（live / live+已存 key）。
      //
      // pool* 的语义要与网关真实行为一致：网关的 getAccounts 对「没有存 key」
      // 的账号会现场 ensureAccessKey 补建，所以这些账号其实也在轮询里。早先
      // 这里按 withKey 过滤，导致没存 key 的账号不在面板池子里却仍被使用。
      const live = store.accounts.filter((item) => accountLive(item))
      const withKey = live.filter((item) => Boolean(item.accessKey))
      const inPool = live.filter((item) => item.pool !== false)
      const baseURL = `http://127.0.0.1:${GATEWAY_PORT}`
      return {
        ok: true,
        proxyUrl: baseURL,
        baseURL,
        port: GATEWAY_PORT,
        upstream: baseUrl,
        accounts: live.length,
        ready: withKey.length,
        pool: inPool.map((item) => item.id),
        poolCount: inPool.length,
        // 池子里还有多少号没存 key（网关会现建，这里只是给面板一个提示）
        poolMissingKey: inPool.filter((item) => !item.accessKey).map((item) => item.id),
        listening: gatewayListening.current,
        tuning: normalizeGatewaySettings(store.gateway),
        ...(gatewayRef.current ? gatewayRef.current.stats(inPool.map((item) => ({ id: item.id, accessKey: item.accessKey }))) : {}),
      }
    }
    case 'gateway-reset': {
      gatewayRef.current?.reset()
      return { ok: true }
    }
    case 'open-external': {
      // 用系统默认浏览器打开外部链接（仅 http/https；发码后跳邮箱用）。
      // 安全要点：绝不经过 shell。早先 win32 走 `cmd /c start "" <url>`，而
      // cmd.exe 会重新解析参数里的 `&`，一个 `https://x.example&calc` 就能
      // 执行任意命令。现在改为直接 execFile 一个可执行文件、URL 作为单个
      // argv 传入，并用 new URL() 严格校验后再比对字符串，双重保险。
      const raw = String((body.body ?? body).url ?? '')
      let parsed
      try {
        parsed = new URL(raw)
      } catch {
        throw new Error('only absolute http(s) urls allowed')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('only http(s) urls allowed')
      }
      const url = parsed.href
      // 即便已经过 new URL()，仍拒绝会被任何命令行解释器当作元字符的字符，
      // 避免将来换实现（例如又绕回 cmd）时重新引入注入面。
      if (/[&|<>^"`\r\n\t]/.test(url)) throw new Error('url contains forbidden characters')
      const { execFile } = await import('node:child_process')
      const isWindows = process.platform === 'win32'
      // explorer.exe 接受 URL 作为单个参数，且完全不经过 shell 解析。
      // 它常以退出码 1 结束（即使成功打开了浏览器），所以 win32 不看退出码。
      const opener = isWindows ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
      await new Promise((resolve, reject) => {
        execFile(opener, [url], { windowsHide: true }, (err) => {
          if (err && !isWindows) reject(err)
          else resolve()
        })
      })
      return { ok: true }
    }
    default:
      throw new PortalError(`unknown action: ${action || '(empty)'}`)
  }
}

/* ── Cordis plugin entry ─────────────────────────────────────────────── */

export default {
  name: 'dsh-tokenbank-multi',
  Config,
  inject: [],
  apply(ctx, config = null) {
    const cfg = { baseUrl: config?.baseUrl || 'https://bank.skillpie.cn' }

    // 自动签到心跳。只用门户接口（/api/portal/*，不限流），不碰 /v1/*，
    // 所以不会跟 LLM 推理抢 access key 的额度。
    // 每 30 分钟看一眼：今天签过就直接返回，开销近似一次内存读取。
    ctx.effect(() => {
      let interval = null
      const tick = () => {
        autoCheckinTick(ctx, cfg.baseUrl).catch((error) => {
          ctx.logger?.warn?.(`dsh-tokenbank-multi: auto check-in failed: ${error?.message ?? error}`)
        })
      }
      // 首次延迟 60s，避开 DSH 启动瞬间的请求高峰。
      const kickoff = setTimeout(() => {
        tick()
        interval = setInterval(tick, 30 * 60 * 1000)
      }, 60 * 1000)
      return () => {
        clearTimeout(kickoff)
        if (interval) clearInterval(interval)
      }
    }, 'dsh-tokenbank-multi: auto check-in timer')

    // 多账号轮询网关：独立监听固定端口。
    // 不挂 webServer 是因为 baseURL 要写进 provider 持久配置，端口必须稳定。
    ctx.effect(() => {
      const gateway = createGateway({
        prefix: '',
        logger: ctx.logger,
        getBaseUrl: () => cfg.baseUrl,
        // 每个请求读一次：设置页改完的下一请求就生效，不用重载插件。
        getTuning: () => tuningRef.current,
        // 只把「会话还有效、在轮询池里、且拿得到 accessKey」的账号交给代理。
        getAccounts: async () => {
          const store = await readStore(ctx)
          // 顺手刷新 tuning：这样即使没人调 settings-get，参数也是最新的。
          tuningRef.current = normalizeGatewaySettings(store.gateway)
          const pool = []
          for (const account of store.accounts) {
            if (account.pool === false) continue
            if (!accountLive(account)) continue
            let accessKey = account.accessKey
            if (!accessKey) {
              const ensured = await ensureAccessKey(ctx, cfg.baseUrl, account)
              accessKey = ensured.accessKey
            }
            if (accessKey) pool.push({ id: account.id, accessKey })
          }
          return pool
        },
      })
      gatewayRef.current = gateway

      let server = null
      try {
        server = createServer((req, res) => {
          gateway.handle(req, res).catch((error) => {
            ctx.logger?.warn?.(`dsh-tokenbank-multi: gateway handler failed: ${error?.message ?? error}`)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: { type: 'proxy_error', message: String(error?.message ?? error) } }))
            } else if (!res.writableEnded) {
              res.destroy()
            }
          })
        })
        server.on('error', (error) => {
          gatewayListening.current = false
          ctx.logger?.warn?.(`dsh-tokenbank-multi: gateway port ${GATEWAY_PORT} unavailable: ${error?.message ?? error}`)
        })
        server.listen(GATEWAY_PORT, '127.0.0.1', () => {
          gatewayListening.current = true
          ctx.logger?.info?.(`dsh-tokenbank-multi: gateway listening on http://127.0.0.1:${GATEWAY_PORT}`)
        })
      } catch (error) {
        gatewayListening.current = false
        ctx.logger?.warn?.(`dsh-tokenbank-multi: cannot start gateway: ${error?.message ?? error}`)
      }

      return () => {
        gatewayRef.current = null
        gatewayListening.current = false
        if (server === null) return
        try {
          // 先掐掉 keep-alive 连接再 close：否则已建立的空闲连接会让旧 server
          // 继续占着 39917，插件热重载时新实例可能 EADDRINUSE。
          if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
          server.close()
        } catch { /* 关掉即可，失败无所谓 */ }
      }
    }, 'dsh-tokenbank-multi: gateway proxy')

    // 面板的 HTTP 载体（无头装配下缺席也不影响其余功能）。
    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }
          // 仅同源：带账号凭据的写操作绝不能被跨源调用。
          const origin = req.headers?.origin
          if (typeof origin === 'string' && origin !== '') {
            let sameOrigin = false
            try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
            if (!sameOrigin) {
              send(403, { ok: false, error: 'cross-origin request refused' })
              return
            }
          }
          if (req.method !== 'POST') {
            send(200, { ok: true, service: 'dsh-tokenbank-multi', route: ROUTE })
            return
          }
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
            return
          }
          try {
            send(200, await dispatch(ctx, cfg, body))
          } catch (error) {
            // 门户的业务拒绝原因（熔断器/门禁）在 error.data 里，一并回传，
            // 否则用户只能看到一句 "Access is forbidden"。
            const detail = error?.data && typeof error.data === 'object'
              ? ' (' + Object.entries(error.data).map(([key, value]) => key + '=' + value).join(', ') + ')'
              : ''
            send(200, { ok: false, error: (error?.message ?? String(error)) + detail, data: error?.data })
          }
        },
      }), 'dsh-tokenbank-multi: http api')
    })
  },
}

/** Read a small JSON request body. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    let settled = false
    const fail = (message) => {
      if (settled) return
      settled = true
      reject(new Error(message))
    }
    req.on('data', (chunk) => {
      // 超限后不再累积：destroy() 到 'end'/'error' 之间仍可能来数据。
      if (settled) return
      data += chunk
      if (data.length > MAX_BODY) {
        data = ''
        req.destroy()
        fail('request body too large')
      }
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (!data.trim()) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

export { readStore, writeStore, accountLive, publicAccount, normalizeAccount, dispatch as __dispatchForTests }
