/**
 * TokenBank 多账号网关 —— 本地反向代理。
 *
 * 借鉴 CLIProxyAPI（sdk/cliproxy/auth 下的 selector / conductor）的调度模型：
 * 请求先到本地代理，代理持有一池 access key，按轮询挑一个发出去；上游回 429
 * 就把这个 key 放进冷却表，同一轮里立刻换下一个 key 重发，客户端完全无感。
 *
 * 为什么必须做成代理：DSH 的 provider 只有一个 apiKeyEnv，一次请求只解析
 * 一个 key，dsh-llm-pi-ai 也没有暴露请求拦截事件（全文只有 internal/config
 * 与 loader/volatile-update 两个可挂载点），插件无法在两次推理之间换 key。
 * 把 baseURL 指到本地代理后，换 key 的决策就落在我们自己手里。
 *
 * 转发规则：
 *   POST {baseURL}/v1/messages  →  https://bank.skillpie.cn/v1/messages
 *   GET  {baseURL}/v1/models    →  https://bank.skillpie.cn/v1/models
 * 请求体先缓冲（JSON，需要可重放才能换 key 重发），响应体流式回传
 * （SSE 不能被缓冲，否则模型输出会憋到最后才一次性出现）。
 */

import { Readable } from 'node:stream'

/** 请求体上限：长上下文请求可以到几十 MB，256KB 远远不够。 */
const MAX_BODY = 64 * 1024 * 1024

/** 上游没给 retry-after 时的兜底冷却时间（对齐 CPA 的 60 秒传统冷却）。 */
const DEFAULT_COOLDOWN_MS = 60 * 1000

/**
 * 两轮之间最多等这么久。超过就直接把 429 抛给 DSH，让 dsh-llm-retry 接手。
 * 对齐 CPA 的 routing.retry.max-retry-interval 默认值 30 秒。
 */
const MAX_RETRY_INTERVAL_MS = 30 * 1000

/**
 * 首轮之外再试几轮。对齐 CPA 的 routing.retry.request-retry 默认值 3：
 * 每轮都会把「上一轮冷却掉的号」重新纳入候选，所以轮次比账号数更有意义。
 */
const REQUEST_RETRY_ROUNDS = 3

/**
 * 三个可调参数的出厂值。设置页改的是 store 里的 `gateway` 段，
 * host 通过 `getTuning` 每请求注入一次；这里保留常量是为了让不传
 * `getTuning` 的测试与旧调用点行为完全不变。
 */
export const DEFAULT_TUNING = {
  requestRetryRounds: REQUEST_RETRY_ROUNDS,
  maxRetryIntervalMs: MAX_RETRY_INTERVAL_MS,
  cooldownMs: DEFAULT_COOLDOWN_MS,
}

/** 逐跳头，不能原样转发。 */
const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** 每个网关实例一份状态，避免多个实例互相污染冷却表。 */
function newState() {
  return {
    /**
     * 上一次选中账号的 id。刻意存 id 而不是下标：候选池会因为冷却/已试过
     * 而收缩，用单调递增的下标去索引收缩后的数组会静默错位，导致某些号
     * 被反复选中、另一些永远轮不到（CPA 的 RoundRobinSelector 注释里写
     * 的正是这个坑）。
     */
    lastPicked: '',
    /** 账号 id → 冷却截止时间戳。按 id 而不是 accessKey：换 key 后冷却仍然有效。 */
    cooldown: new Map(),
    /** 累计转发成功的请求数。 */
    served: 0,
    /** 累计因为 429/网络错误换号的次数。 */
    switched: 0,
    /** 累计因为全员冷却而等待后重试的轮数。 */
    waitedRounds: 0,
  }
}

/** 这个账号还要冷却多久（毫秒），0 表示可用。过期的顺手清掉。 */
function coolingMs(state, id) {
  const until = state.cooldown.get(id)
  if (until === undefined) return 0
  const left = until - Date.now()
  if (left <= 0) {
    state.cooldown.delete(id)
    return 0
  }
  return left
}

/** 池子里最早解冻的账号还要等多久；全员可用时返回 0。 */
function minCooldown(state, accounts) {
  let best = Number.POSITIVE_INFINITY
  for (const account of accounts) {
    const left = coolingMs(state, account.id)
    if (left > 0 && left < best) best = left
  }
  return Number.isFinite(best) ? best : 0
}

/** 在按 id 升序排好的数组里找第一个 id 大于 lastId 的位置。 */
function successorIndex(sorted, lastId) {
  if (lastId === '') return 0
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid].id <= lastId) low = mid + 1
    else high = mid
  }
  return low >= sorted.length ? 0 : low
}

/**
 * 按轮询挑一个可用账号。
 * @param accounts 候选池
 * @param skip 本轮已经试过的账号 id
 */
function pickAccount(state, accounts, skip) {
  const available = accounts
    .filter((account) => !skip.has(account.id) && coolingMs(state, account.id) === 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (available.length === 0) return null
  const index = successorIndex(available, state.lastPicked)
  const picked = available[index]
  state.lastPicked = picked.id
  return picked
}

/** 构造发往上游的请求头：复制必要字段，替换 x-api-key。 */
function forwardHeaders(incoming, accessKey) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming ?? {})) {
    if (value === undefined) continue
    const key = name.toLowerCase()
    if (HOP_BY_HOP.has(key)) continue
    // 认证由我们接管，绝不透传客户端带来的 key。
    if (key === 'x-api-key' || key === 'authorization' || key === 'content-length') continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }
  headers.set('x-api-key', accessKey)
  return headers
}

/** 把上游响应流式写回客户端。 */
function pipeBack(res, response) {
  const headers = {}
  for (const [name, value] of response.headers.entries()) {
    // fetch 已经解压过 body，这几个头必须丢掉，否则客户端会二次解码或截断。
    if (name === 'content-encoding' || name === 'content-length' || name === 'transfer-encoding') continue
    if (name === 'connection') continue
    headers[name] = value
  }
  res.writeHead(response.status, headers)
  if (response.body === null) {
    res.end()
    return Promise.resolve()
  }
  return new Promise((done) => {
    const stream = Readable.fromWeb(response.body)
    stream.on('error', () => {
      if (!res.writableEnded) res.destroy()
      done()
    })
    stream.on('end', done)
    res.on('close', () => {
      stream.destroy()
      done()
    })
    stream.pipe(res)
  })
}

/** 回一个 JSON 错误，可带额外响应头（比如 Retry-After）。 */
function sendJson(res, status, payload, extraHeaders) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end()
    return
  }
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (extraHeaders !== undefined) Object.assign(headers, extraHeaders)
  res.writeHead(status, headers)
  res.end(JSON.stringify(payload))
}

/** 读完请求体，超过上限就掐断。 */
function readAll(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 解析上游给的 retry-after。
 * - 缺省 / 非数字 → 用兜底冷却（`fallbackMs`，默认 60 秒，设置页可改）
 * - 0 → 不冷却（上游明确表示可以立刻重试，抑制默认冷却；CPA 同语义）
 * - 正数 → 秒
 */
function cooldownFromHeader(response, fallbackMs = DEFAULT_COOLDOWN_MS) {
  const raw = response.headers.get('retry-after')
  if (raw === null) return fallbackMs
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return fallbackMs
  if (seconds === 0) return 0
  return seconds * 1000
}

/**
 * 建一个网关实例。
 * @param options.getAccounts 返回当前可用账号池（至少含 id 与 accessKey）
 * @param options.getBaseUrl 返回上游地址，如 https://bank.skillpie.cn
 * @param options.prefix 本代理挂载的路径前缀，用来剥掉本地路径
 * @param options.logger Cordis logger，可空
 * @param options.fetchImpl 测试注入用的 fetch 替身，省略即用全局 fetch
 * @param options.maxRetryIntervalMs 轮次间最大等待，省略用默认 30 秒
 * @param options.requestRetryRounds 首轮之外再试几轮，省略用默认 3
 * @param options.getTuning 运行时可调参数源；每请求读一次，返回的字段覆盖上面两个默认与默认冷却
 */
export function createGateway(options) {
  const { getAccounts, getBaseUrl, prefix, logger } = options
  const doFetch = options.fetchImpl ?? fetch
  const maxRetryIntervalMs = options.maxRetryIntervalMs ?? MAX_RETRY_INTERVAL_MS
  const requestRetryRounds = options.requestRetryRounds ?? REQUEST_RETRY_ROUNDS
  const state = newState()

  /**
   * 每次请求解析一次可调参数。`getTuning` 缺席或字段缺失时回退到创建参数，
   * 这样旧调用点（含全部网关测试）行为不变。
   */
  function resolveTuning() {
    let live = null
    if (typeof options.getTuning === 'function') {
      try {
        live = options.getTuning()
      } catch {
        live = null
      }
    }
    const pick = (value, fallback) => (Number.isFinite(value) && value >= 0 ? value : fallback)
    return {
      requestRetryRounds: pick(live?.requestRetryRounds, requestRetryRounds),
      maxRetryIntervalMs: pick(live?.maxRetryIntervalMs, maxRetryIntervalMs),
      cooldownMs: pick(live?.cooldownMs, DEFAULT_COOLDOWN_MS),
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://local')
    // 剥掉本地前缀，剩下的原样拼到上游地址后面。
    const rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length) || '/'
      : url.pathname
    const upstream = getBaseUrl().replace(/\/+$/, '') + rest + (url.search || '')
    const method = req.method || 'GET'

    let body
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await readAll(req)
      } catch (error) {
        sendJson(res, 413, { error: { type: 'proxy_error', message: String(error?.message ?? error) } })
        return
      }
    }

    // 客户端断开（用户点了停止）时，把上游请求也掐掉，别让它继续烧额度。
    const controller = new AbortController()
    const onClose = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.on('close', onClose)

    try {
      const accounts = await getAccounts()
      if (accounts.length === 0) {
        sendJson(res, 503, {
          error: { type: 'proxy_error', message: 'no available tokenbank account with an access key' },
        })
        return
      }

      // 参数在 getAccounts 之后读：host 的 getAccounts 会顺手刷新 tuning，
      // 所以设置页改完的下一请求就在这里生效（不用重启插件）。
      const tuning = resolveTuning()

      // 首轮 + 若干补充轮。每轮重新建 attempted 集合：上一轮被冷却的号在
      // 等待解冻后可以重新参与，这正是 CPA conductor 的轮次语义。
      for (let round = 0; round <= tuning.requestRetryRounds; round += 1) {
        const attempted = new Set()

        for (;;) {
          const account = pickAccount(state, accounts, attempted)
          if (account === null) break

          let response
          try {
            response = await doFetch(upstream, {
              method,
              headers: forwardHeaders(req.headers, account.accessKey),
              body: body === undefined ? undefined : body,
              signal: controller.signal,
            })
          } catch (error) {
            if (controller.signal.aborted) return
            // 网络层失败也算这个号暂时不可用，本轮换下一个。
            logger?.warn?.(`dsh-tokenbank-multi: ${account.id} network error: ${error?.message ?? error}`)
            attempted.add(account.id)
            state.switched += 1
            continue
          }

          if (response.status === 429) {
            const cool = cooldownFromHeader(response, tuning.cooldownMs)
            if (cool > 0) state.cooldown.set(account.id, Date.now() + cool)
            attempted.add(account.id)
            state.switched += 1
            logger?.info?.(
              `dsh-tokenbank-multi: ${account.id} hit 429, ` +
                (cool > 0 ? `cooling ${Math.round(cool / 1000)}s, switching account` : 'retry immediately allowed'),
            )
            try {
              await response.body?.cancel()
            } catch {
              /* 丢弃被限流响应的 body，失败无所谓 */
            }
            continue
          }

          state.served += 1
          await pipeBack(res, response)
          return
        }

        // 本轮把能试的都试完了。
        // - 有号在冷却且等待在预算内 → 等最近解冻的那个，再开一轮
        // - 没有冷却但确实失败过（retry-after: 0 或网络错误）→ 立刻开下一轮
        // - 其它情况（没人失败过）→ 收场
        if (round === tuning.requestRetryRounds) break
        if (attempted.size === 0) break
        const wait = minCooldown(state, accounts)
        if (wait > 0) {
          if (wait > tuning.maxRetryIntervalMs) break
          state.waitedRounds += 1
          logger?.info?.(
            `dsh-tokenbank-multi: all accounts cooling, waiting ${Math.round(wait / 1000)}s before round ${round + 1}`,
          )
          await sleep(wait + 50)
          if (controller.signal.aborted) return
        }
      }

      // 交给 DSH 的 retryPolicy 接手：带上 Retry-After，它会在 maxDelayMs
      // 范围内按这个值等待，比我们自己挂在这里更省事。
      const left = minCooldown(state, accounts)
      const retryAfter = Math.max(1, Math.ceil((left > 0 ? left : 1000) / 1000))
      sendJson(
        res,
        429,
        {
          error: {
            type: 'rate_limit_error',
            message: `all ${accounts.length} tokenbank account(s) are rate-limited; retry in ${retryAfter}s`,
          },
        },
        { 'Retry-After': String(retryAfter) },
      )
    } catch (error) {
      logger?.warn?.(`dsh-tokenbank-multi: gateway failed: ${error?.message ?? error}`)
      if (!res.headersSent) {
        sendJson(res, 502, { error: { type: 'proxy_error', message: String(error?.message ?? error) } })
      } else if (!res.writableEnded) {
        res.destroy()
      }
    } finally {
      res.off('close', onClose)
    }
  }

  /** 面板用：看当前池子状态和每个号的剩余冷却。 */
  function stats(accounts) {
    const cooldowns = {}
    for (const account of accounts ?? []) {
      const left = coolingMs(state, account.id)
      if (left > 0) cooldowns[account.id] = left
    }
    return {
      served: state.served,
      switched: state.switched,
      waitedRounds: state.waitedRounds,
      lastPicked: state.lastPicked,
      cooldowns,
    }
  }

  /** 清空冷却与轮询位置（切账号/改配置后调用）。 */
  function reset() {
    state.cooldown.clear()
    state.lastPicked = ''
  }

  return { handle, stats, reset }
}
