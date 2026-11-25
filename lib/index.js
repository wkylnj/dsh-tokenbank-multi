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

export const ROUTE = '/dsh-tokenbank-multi/api'
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
  }
}

async function readStore(ctx) {
  const credentials = await ctx.get('credentials')
  const record = await credentials.readRecord(ACCOUNTS_RECORD)
  const payload = record?.payload
  if (payload && Array.isArray(payload.accounts)) {
    const accounts = payload.accounts.map(normalizeAccount).filter(Boolean)
    const activeId = accounts.some((a) => a.id === payload.activeId) ? payload.activeId : (accounts[0]?.id ?? null)
    return { activeId, accounts, autoCheckin: normalizeAutoCheckin(payload.autoCheckin) }
  }
  // 迁移：旧版单账号记录 → 账号列表（只做一次，成功后删掉旧记录）
  const legacy = await credentials.readRecord(LEGACY_IDENTITY_RECORD)
  const old = normalizeAccount(legacy?.payload)
  if (old) {
    const migrated = { activeId: old.id, accounts: [old], autoCheckin: { enabled: false, lastDay: '' } }
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
    })),
    autoCheckin: normalizeAutoCheckin(store.autoCheckin),
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
    case 'accounts':
      return {
        ok: true,
        activeId: store.activeId,
        accounts: store.accounts.map((item) => publicAccount(item, store.activeId)),
      }
    case 'switch': {
      const id = String(body.id ?? '')
      const target = store.accounts.find((item) => item.id === id)
      if (!target) throw new PortalError('account not found')
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
      // 新账号成为当前账号，密钥同步落到模型分组引用的凭据上。
      let keySynced = false
      if (next.activeId === account.id && account.accessKey) {
        keySynced = await syncModelKey(ctx, account.accessKey)
      }
      return {
        ok: true,
        user: data.user,
        accessKey: data.accessKey,
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
    case 'me': {
      const account = await requireLive()
      return { ok: true, data: await tb.me(baseUrl, account.sessionToken) }
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
      const next = { ...store, autoCheckin: { enabled, lastDay: store.autoCheckin.lastDay } }
      await writeStore(ctx, next)
      // 打开开关且今天还没跑过 → 立刻补一次，不用等定时器
      let immediate = null
      let lastDay = next.autoCheckin.lastDay
      if (enabled && lastDay !== today) {
        immediate = await runCheckinAll(baseUrl, next)
        if (immediate.results.length > 0) {
          lastDay = today
          await writeStore(ctx, {
            ...next,
            autoCheckin: { enabled, lastDay: today },
          })
        }
      }
      return {
        ok: true,
        enabled,
        lastDay,
        todayDone: lastDay === today,
        run: immediate,
      }
    }
    case 'gateway-models': {
      const key = typeof body.accessKey === 'string' && body.accessKey ? body.accessKey : (active?.accessKey ?? '')
      if (!key) throw new PortalError('no access key available')
      const force = body.force === true
      if (body.noPortal === true) {
        return { ok: true, models: await gatewayModels(baseUrl, key, { force }), accessKey: key }
      }
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
    case 'open-external': {
      // 用系统默认浏览器打开外部链接（仅 http/https；发码后跳邮箱用）
      const url = String((body.body ?? body).url ?? '')
      if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) urls allowed')
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : 'cmd'
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      const { execFile } = await import('node:child_process')
      await new Promise((resolve, reject) => {
        execFile(opener, args, (err) => (err ? reject(err) : resolve()))
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

    ctx.effect(() => () => {}, 'dsh-tokenbank-multi: lifetime')

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
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        reject(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

export { readStore, writeStore, accountLive, publicAccount, normalizeAccount, dispatch as __dispatchForTests }
