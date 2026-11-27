/**
 * dsh-switchboard — Web client half (module-loader bundle).
 *
 * Registers:
 *   - conversation.composer.dock 余额胶囊（有账号时显示，点开账号面板），
 *   - conversation.input.right 「免费模型」入口（没有账号时显示），
 *   - shell.overlay 账号面板：余额 / 每日签到 / 多账号切换与管理 / 添加账号，
 *   - shell.overlay 轻提示，
 *   - settings.section 设置页：网关状态、轮询池、轮询参数、自动签到。
 *
 * All state comes from the host half's POST /dsh-switchboard/api, which is
 * gated on an authenticated DSH browser session. 这个半区不读凭据、不写 settings：
 * 上游 accessKey 只留在宿主进程里，浏览器拿到的是脱敏后的账号视图。
 */
window.__ModuleLoader__.load({
  id: 'dsh-switchboard',
  factory(require) {
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var NS = 'dsh-switchboard'
    var API = '/dsh-switchboard/api'

    var zh = {
      "accountRemoved": "已移除账号",
      "activeBalance": "当前账号余额",
      "activeExpired": "当前账号已过期，请重新登录或切换",
      "addAccount": "+ 添加账号",
      "autoCheckin": "自动签到",
      "autoCheckinHint": "DSH 运行时，每天自动给有效账号签到一次",
      "autoCheckinTitle": "自动签到",
      "back": "返回",
      "balancePartial": "已查到 {known}/{total} 个账号的余额，合计不完整",
      "balanceTotal": "全部账号余额合计",
      "balanceUnavailable": "暂时无法获取余额",
      "captcha": "图形验证码",
      "captchaCode": "请输入图形验证码",
      "captchaRefresh": "看不清？换一张",
      "checkin": "签到",
      "checkinAll": "一键签到",
      "checkinAllBusy": "签到中…",
      "checkinAllDone": "全部已签到",
      "checkinAllGain": "共 +${amount}",
      "checkinAllOk": "{n} 个账号签到成功",
      "checkinAllPart": "{ok} 个成功，{fail} 个失败",
      "checkinBusy": "签到中…",
      "checkinDisabled": "未开放签到",
      "checkinDone": "已签到",
      "checkinFailed": "签到未完成，请稍后重试",
      "checkinNoneNew": "没有新增签到",
      "checkinOk": "签到成功",
      "checkinStreak": "已连签 {n} 天",
      "close": "关闭",
      "code": "验证码",
      "codeSent": "验证码已发送",
      "composerEntry": "TokenBank 账户",
      "cooldown": "冷却时长（秒）",
      "cooldownHint": "上游 429 未提供 Retry-After 时使用，网关保留最短退避。",
      "copied": "已复制",
      "copy": "复制",
      "copyFailed": "无法访问剪贴板，请手动复制",
      "editNicknameTitle": "点击修改昵称，回车保存",
      "email": "邮箱",
      "emailPlaceholder": "请输入完整邮箱，例如 you@example.com",
      "expired": "已过期",
      "freeToken": "免费模型",
      "gatewayAddress": "网关地址",
      "gatewayCooldown": "冷却中",
      "gatewayCooldownEmpty": "没有账号在冷却",
      "gatewayDown": "未监听",
      "gatewayLastPicked": "上次选中",
      "gatewayListening": "运行中",
      "gatewayNone": "暂无",
      "gatewayPool": "轮询池",
      "gatewayReset": "清空冷却与游标",
      "gatewayServed": "已转发",
      "gatewayStatus": "网关状态",
      "gatewaySwitched": "换号",
      "gatewayUpstream": "上游",
      "gatewayWaited": "等待",
      "loading": "加载中…",
      "login": "登录",
      "maxWait": "单轮最大等待（秒）",
      "maxWaitHint": "全员冷却时，一轮最多等待这么久（0–120）。",
      "modelLinked": "已接入 {n} 个模型，点输入框上方的模型选择器即可切换使用",
      "modelSettingsHint": "模型接入与账号池：设置 → 转接台",
      "modelSync": "同步模型到 DSH",
      "more": "更多",
      "nicknameSaved": "昵称已更新",
      "openMailbox": "打开邮箱",
      "openSite": "打开官网",
      "partial": "部分",
      "password": "密码",
      "poolEmpty": "还没有账号，先在 TokenBank 面板里登录一个。",
      "poolHint": "只有勾选的账号会参与网关轮询。取消勾选不影响它作为当前账号使用，也不影响签到。",
      "poolKeyMissing": "缺少可用密钥，请重新登录或同步模型",
      "poolTitle": "轮询池",
      "register": "注册",
      "relogin": "重新登录",
      "removeAccount": "移除账号",
      "requestFailed": "请求失败，请稍后重试",
      "rateLimited": "TokenBank 正在限流这个操作，请等一两分钟再试",
      "retry": "重试",
      "retryRounds": "重试轮数",
      "retryRoundsHint": "一轮试完所有账号后，整体再来几轮（0–10）",
      "save": "保存",
      "saved": "已保存",
      "sendCode": "发送验证码",
      "settingsDesc": "轮询池、轮询参数与网关状态",
      "settingsTitle": "转接台",
      "switched": "已切换账号",
      "tuningHint": "改完对下一个请求就生效，不需要重启。",
      "tuningTitle": "轮询参数",
      "channel": "渠道",
      "accountsCount": "账号 {n} 个",
      "accountAdded": "账号已添加",
      "tokenRefreshed": "令牌已刷新",
      "refreshToken": "刷新令牌",
      "refreshTokenPlaceholder": "粘贴 refresh_token（rt_ 开头）",
      "refreshTokenHint": "星驰登录要过人机验证，插件无法代登录。请在浏览器登录后从 localStorage 复制 refresh_token 粘贴到这里，之后插件会自己续期。",
      "adding": "添加中",
      "saving": "保存中",
      "noBalance": "余额未知",
      "poolOn": "参与签到与轮转",
      "poolOff": "已暂停",
      "modelListUpdated": "模型列表已更新（{n} 个）",
    }

    var en = {
      "accountRemoved": "Account removed",
      "activeBalance": "Current account balance",
      "activeExpired": "Current session expired. Sign in again or switch accounts.",
      "addAccount": "+ Add account",
      "autoCheckin": "Auto check-in",
      "autoCheckinHint": "Check in eligible accounts once a day while DSH is running",
      "autoCheckinTitle": "Auto check-in",
      "back": "Back",
      "balancePartial": "Partial total: balance available for {known}/{total} accounts",
      "balanceTotal": "Total balance across accounts",
      "balanceUnavailable": "Balance unavailable",
      "captcha": "Captcha",
      "captchaCode": "Enter the captcha",
      "captchaRefresh": "Can't read it? Try another",
      "checkin": "Check in",
      "checkinAll": "Check in all",
      "checkinAllBusy": "Checking in…",
      "checkinAllDone": "All checked in",
      "checkinAllGain": "+${amount} total",
      "checkinAllOk": "{n} accounts checked in",
      "checkinAllPart": "{ok} ok, {fail} failed",
      "checkinBusy": "Checking in…",
      "checkinDisabled": "Check-in disabled",
      "checkinDone": "Checked in",
      "checkinFailed": "Check-in did not complete. Try again later.",
      "checkinNoneNew": "No new check-ins",
      "checkinOk": "Checked in",
      "checkinStreak": "{n}-day streak",
      "close": "Close",
      "code": "Verification code",
      "codeSent": "Code sent",
      "composerEntry": "TokenBank account",
      "cooldown": "Cooldown (s)",
      "cooldownHint": "Used when an upstream 429 has no Retry-After. The gateway enforces a minimum delay.",
      "copied": "Copied",
      "copy": "Copy",
      "copyFailed": "Clipboard unavailable. Copy the address manually.",
      "editNicknameTitle": "Click to edit nickname, Enter to save",
      "email": "Email",
      "emailPlaceholder": "Enter the full email address, e.g. you@example.com",
      "expired": "Expired",
      "freeToken": "Free models",
      "gatewayAddress": "Address",
      "gatewayCooldown": "Cooling down",
      "gatewayCooldownEmpty": "No account is cooling down",
      "gatewayDown": "Not listening",
      "gatewayLastPicked": "Last picked",
      "gatewayListening": "Running",
      "gatewayNone": "None",
      "gatewayPool": "Pool",
      "gatewayReset": "Clear cooldowns and cursor",
      "gatewayServed": "Forwarded",
      "gatewayStatus": "Gateway",
      "gatewaySwitched": "Switched",
      "gatewayUpstream": "Upstream",
      "gatewayWaited": "Waited",
      "loading": "Loading…",
      "login": "Sign in",
      "maxWait": "Max wait per round (s)",
      "maxWaitHint": "Maximum wait per retry round when every account is cooling down (0–120).",
      "modelLinked": "Linked {n} models; use the model picker above the input to switch",
      "modelSettingsHint": "To link models or manage the pool, go to Settings → 转接台.",
      "modelSync": "Sync models to DSH",
      "more": "More",
      "nicknameSaved": "Nickname updated",
      "openMailbox": "Open mailbox",
      "openSite": "Open site",
      "partial": "Partial",
      "password": "Password",
      "poolEmpty": "No accounts yet — sign in from the TokenBank panel first.",
      "poolHint": "Only checked accounts take part in gateway round-robin. Unchecking keeps the account usable as the current one and still checks in.",
      "poolKeyMissing": "No ready key. Sign in again or sync models.",
      "poolTitle": "Routing pool",
      "register": "Sign up",
      "relogin": "Sign in again",
      "removeAccount": "Remove account",
      "requestFailed": "Request failed. Try again later.",
      "rateLimited": "TokenBank is rate limiting this action. Wait a minute and try again.",
      "retry": "Retry",
      "retryRounds": "Retry rounds",
      "retryRoundsHint": "After one pass over every account, retry this many more rounds (0–10)",
      "save": "Save",
      "saved": "Saved",
      "sendCode": "Send code",
      "settingsDesc": "Pool, routing tuning and gateway status",
      "settingsTitle": "转接台",
      "switched": "Account switched",
      "tuningHint": "Takes effect on the next request, no restart needed.",
      "tuningTitle": "Routing tuning",
      "channel": "Channel",
      "accountsCount": "{n} account(s)",
      "accountAdded": "Account added",
      "tokenRefreshed": "Token refreshed",
      "refreshToken": "Refresh token",
      "refreshTokenPlaceholder": "Paste the refresh_token (starts with rt_)",
      "refreshTokenHint": "XingChi login requires a human-verification challenge, so the plugin cannot sign in for you. Sign in in a browser, copy refresh_token from localStorage, and paste it here; the plugin renews it afterwards.",
      "adding": "Adding",
      "saving": "Saving",
      "noBalance": "Balance unknown",
      "poolOn": "Checked in and routed",
      "poolOff": "Paused",
      "modelListUpdated": "Model list updated ({n})",
    }

    var pageT = function (key) { return key }

    // 每个渠道自己实现一套 action，互不通用；channel 缺省走 tokenbank。
    var CHANNELS = [
      { id: 'tokenbank', label: 'TokenBank' },
      { id: 'xingchi', label: '星驰' },
    ]

    async function api(action, extra, channel) {
      var target = channel || tbStore.state.channel || 'tokenbank'
      const response = await fetch(API, {
        method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-DSH-Switchboard': '1' },
        body: JSON.stringify(Object.assign({ channel: target }, extra, { action: action })),
        signal: AbortSignal.timeout(action === 'checkin-all' || action === 'auto-checkin-set' ? 120000 : 65000),
      })
      const payload = await response.json().catch(function () { return null })
      if (!response.ok || !payload || payload.ok !== true) {
        // 服务端把可行动的失败（例如门户限流）标了 code；命中时用本地文案，
        // 其余情况原样显示服务端消息，避免把英文内部报文翻错。
        var code = payload && payload.code
        var text = code === 'rate_limited' ? pageT('rateLimited') : (payload && payload.error) || pageT('requestFailed')
        var error = new Error(text)
        error.code = code
        throw error
      }
      return payload
    }

    function TokenBankLogo(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true, style: { display: 'block', flex: 'none' } },
        h('rect', { width: 64, height: 64, rx: 14, fill: '#18243e' }),
        h('path', { d: 'M16 43l8-20 8 12 8-12 8 20', fill: 'none', stroke: '#fff', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('circle', { cx: 32, cy: 17, r: 3.5, fill: '#85ecd3' }))
    }

    var cardStyle = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }
    var inputStyle = {
      height: 30, padding: '0 10px', borderRadius: 7, fontSize: 13,
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
      boxSizing: 'border-box', width: '100%',
    }
    var buttonStyle = {
      height: 30, padding: '0 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
    }
    var primaryButtonStyle = Object.assign({}, buttonStyle, {
      // brand-primary 在深色主题下是近白色（#f9fafb），浅色主题下是近黑色（#0f1115），
      // 所以填充和文字必须成对取主题变量：填充用 button-primary-fill，文字用 label-primary-inverted
      // （浅色 #fff / 深色 #353638）。写死 #fff 会在深色主题下变成白底白字。
      background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #3568cd))',
      borderColor: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #3568cd))',
      color: 'var(--dsw-alias-label-primary-inverted, #ffffff)',
      fontWeight: 600,
    })
    var labelStyle = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
    var errorStyle = {
      fontSize: 12, color: 'var(--dsw-alias-label-error, #d03050)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }

    function Field(props) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: labelStyle }, props.label),
        props.children,
      )
    }

    var notifySeq = 0
    var tbStore = {
      state: { authOpen: false, authMode: 'register', panelView: 'main', signInEmail: '', notify: null, status: null, anchor: null, balanceSeq: 0, channel: 'tokenbank' },
      listeners: [],
      get: function () { return tbStore.state },
      subscribe: function (fn) {
        tbStore.listeners.push(fn)
        return function () { tbStore.listeners = tbStore.listeners.filter(function (l) { return l !== fn }) }
      },
      set: function (patch) {
        // notify 统一盖一个自增序号：同一条文案连续弹两次时，NotifyOverlay 的
        // effect 依赖才认得出「这是新的一条」，否则 6s 计时器不会重置。
        if (patch && patch.notify) {
          notifySeq += 1
          patch = Object.assign({}, patch, { notify: Object.assign({}, patch.notify, { seq: notifySeq }) })
        }
        tbStore.state = Object.assign({}, tbStore.state, patch)
        tbStore.listeners.slice().forEach(function (fn) { fn() })
      },
    }

    /** 换渠道：状态与余额都按渠道隔离，切过去先清空再重拉。 */
    function selectChannel(id) {
      if (!id || id === tbStore.state.channel) return
      statusSync.request = null
      statusSync.at = 0
      balanceSync = null
      tbStore.set({ channel: id, status: null, panelView: 'main', signInEmail: '' })
    }

    /** 让底部余额 pill 重新拉一次合计（面板里签到/切号/移除账号后调用）。 */
    function bumpBalance() {
      tbStore.set({ balanceSeq: (tbStore.state.balanceSeq || 0) + 1 })
    }

    var statusSync = { request: null, at: 0, channel: '' }
    function fetchStatus(force) {
      var channel = tbStore.get().channel || 'tokenbank'
      if (!force && statusSync.request && statusSync.channel === channel) return statusSync.request
      var cached = tbStore.get().status
      if (!force && cached && statusSync.channel === channel && Date.now() - statusSync.at < 1000) return Promise.resolve(cached)
      var request = api('status', null, channel).then(function (data) {
        if (statusSync.request !== request) return tbStore.get().status || data
        statusSync.at = Date.now()
        statusSync.channel = channel
        tbStore.set({ status: data })
        return data
      }).finally(function () { if (statusSync.request === request) statusSync.request = null })
      statusSync.request = request
      statusSync.channel = channel
      return request
    }

    var balanceSync = null
    function fetchBalances(sequence) {
      var channel = tbStore.get().channel || 'tokenbank'
      if (balanceSync && balanceSync.sequence === sequence && balanceSync.channel === channel
        && (!balanceSync.at || Date.now() - balanceSync.at < 1000)) return balanceSync.request
      var entry = { sequence: sequence, channel: channel, at: 0, request: null }
      balanceSync = entry
      // 两个渠道各自命名自己的 action：TokenBank 叫 accounts-balance，星驰叫 balances。
      var action = channel === 'xingchi' ? 'balances' : 'accounts-balance'
      entry.request = api(action, null, channel).finally(function () { entry.at = Date.now() })
      return entry.request
    }

    function notify(kind, title, detail) {
      tbStore.set({ notify: { kind: kind, title: title, detail: detail || '' } })
    }

    /**
     * 两个渠道的签到回执形状不同：TokenBank 给 nano 计价的 totalNano，
     * 星驰给美元浮点的 totalAmount。这里按存在哪个字段换算成展示文案。
     */
    function reportCheckins(result) {
      if (!result || !Array.isArray(result.results) || !result.results.length) return false
      var success = (result.checkedCount || 0) + (result.alreadyCount || 0)
      var failed = result.failedCount || 0
      var title = failed
        ? pageT('checkinAllPart').replace('{ok}', String(success)).replace('{fail}', String(failed))
        : result.checkedCount ? pageT('checkinAllOk').replace('{n}', String(result.checkedCount))
        : success && !result.disabledCount ? pageT('checkinAllDone') : pageT('checkinNoneNew')
      var gained = result.totalNano > 0 ? (result.totalNano / 1e9).toFixed(2)
        : result.totalAmount > 0 ? String(result.totalAmount) : ''
      notify(failed ? 'error' : 'success', title, gained ? pageT('checkinAllGain').replace('{amount}', gained) : '')
      return failed === 0 && success > 0 && !result.disabledCount
    }

    /**
     * 两个渠道的余额计量不同：TokenBank 用 nano 计价的整数，星驰用美元浮点。
     * 所有展示余额的地方都必须过这里，否则星驰的 600 会被当成 nano 除以 1e9 变成 $0.00。
     * 认不出的值返回空串，交给调用方决定显示 '—' 还是整行隐藏。
     */
    function money(channel, value) {
      if (channel === 'xingchi') {
        return typeof value === 'number' && Number.isFinite(value) ? '$' + value.toFixed(2) : ''
      }
      return Number.isSafeInteger(value) ? '$' + (value / 1e9).toFixed(2) : ''
    }

    /**
     * 星驰的 displayName 在同步时就等于 email，标题和副标题都写邮箱会重复两行。
     * 有独立昵称才显示副标题，否则只留一行。
     */
    function accountTitle(account) {
      var name = account && account.displayName
      return name && name !== account.email ? name : (account && account.email) || ''
    }

    function accountSubtitle(account) {
      var name = account && account.displayName
      return name && name !== account.email ? account.email : ''
    }

    function useTbStore() {
      var snap = React.useState(tbStore.get)
      React.useEffect(function () {
        return tbStore.subscribe(function () { snap[1](tbStore.get()) })
      }, [])
      return snap[0]
    }

    function openPanel(event, mode) {
      var rect = event.currentTarget.getBoundingClientRect()
      tbStore.set({ authOpen: true, panelView: 'main', authMode: mode, signInEmail: '', anchor: { right: rect.right, top: rect.top } })
    }

    function BalancePill() {
      var snap = useTbStore()
      var total = React.useState(null)
      var count = (snap.status && snap.status.accounts || []).length
      React.useEffect(function () { fetchStatus().catch(function () {}) }, [snap.channel])
      React.useEffect(function () {
        if (!count) { total[1](null); return }
        var stopped = false
        fetchBalances(snap.balanceSeq).then(function (result) {
          if (stopped) return
          // TokenBank 用 nano 整数，星驰用美元浮点——按渠道选过滤方式，别混着加。
          var amounts = Object.values(result.balances || {}).filter(snap.channel === 'xingchi'
            ? function (value) { return typeof value === 'number' && Number.isFinite(value) }
            : Number.isSafeInteger)
          total[1](amounts.length ? { sum: amounts.reduce(function (sum, value) { return sum + value }, 0), known: amounts.length, total: result.accountCount } : null)
        }).catch(function () { if (!stopped) total[1](null) })
        return function () { stopped = true }
      }, [count, snap.balanceSeq, snap.authOpen, snap.channel])
      if (!count) return null
      var current = total[0]
      var incomplete = current && (current.known < current.total || current.total !== count)
      var value = current
        ? '$ ' + (snap.channel === 'xingchi' ? current.sum : current.sum / 1e9).toFixed(2)
        : '—'
      var label = current ? (incomplete
        ? pageT('balancePartial').replace('{known}', String(current.known)).replace('{total}', String(Math.max(count, current.total)))
        : pageT('balanceTotal')) : pageT('balanceUnavailable')
      return h('button', {
        type: 'button', id: 'tb-balance-pill', title: label, 'aria-label': label + ' ' + value,
        className: snap.authOpen ? 'tb-balance-open' : '', onClick: function (event) { openPanel(event, 'login') },
        style: {
          boxSizing: 'border-box', borderRadius: 'var(--dsw-radius-sm)', color: 'var(--dsw-alias-label-secondary)',
          font: 'inherit', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: '0.35em', padding: '0.2em 0.55em',
        },
      }, value, incomplete ? h('span', { style: labelStyle }, pageT('partial')) : null)
    }

    function ComposerEntry() {
      var snap = useTbStore()
      React.useEffect(function () { fetchStatus().catch(function () {}) }, [])
      if (snap.status && snap.status.accounts.length) return null
      return h('button', {
        type: 'button', id: 'tb-entry-btn', title: pageT('composerEntry'), 'aria-label': pageT('composerEntry'),
        onClick: function (event) { openPanel(event, 'register') },
        style: Object.assign({}, buttonStyle, { fontSize: '0.75em', borderRadius: 'var(--dsw-radius-sm)', whiteSpace: 'nowrap' }),
      }, pageT('freeToken'))
    }

    /** shell.overlay 轻提示:portal 到 document.body,压过设置页抽屉层级。 */
    function NotifyOverlay() {
      var snap = useTbStore()
      // 宿主风格:顶部居中深色胶囊,非阻塞,6s 自动消失,点击关闭
      React.useEffect(function () {
        if (!snap.notify) return
        var timer = window.setTimeout(function () { tbStore.set({ notify: null }) }, 6000)
        return function () { window.clearTimeout(timer) }
      }, [snap.notify && snap.notify.title, snap.notify && snap.notify.seq])
      if (!snap.notify || !ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      var n = snap.notify
      var ok = n.kind === 'success'
      var close = function () { tbStore.set({ notify: null }) }
      return ReactDOM.createPortal(
        h('div', {
          onClick: close,
          style: {
            position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            maxWidth: '86vw', padding: '9px 16px', borderRadius: 10,
            background: 'rgba(30, 30, 32, 0.96)', color: '#f5f5f5',
            border: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            fontSize: 13, lineHeight: 1.5, pointerEvents: 'auto',
          },
        },
          h('span', { style: { flexShrink: 0, display: 'inline-flex' } },
            ok
              ? h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: '#34c759', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                  h('circle', { cx: 12, cy: 12, r: 10 }), h('polyline', { points: '8 12.5 11 15.5 16 9.5' }))
              : h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: '#ffd60a', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                  h('circle', { cx: 12, cy: 12, r: 10 }), h('line', { x1: 12, y1: 7.5, x2: 12, y2: 13 }), h('circle', { cx: 12, cy: 16.5, r: 0.5, fill: '#ffd60a' })),
          ),
          h('span', { style: { fontWeight: 600 } }, n.title),
          n.detail ? h('span', { style: { opacity: 0.75, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, n.detail) : null,
        ),
        document.body,
      )
    }

    function EditableNickname(props) {
      var value = React.useState(props.name || '')
      var editing = React.useState(false)
      var busy = React.useState(false)
      var inputRef = React.useRef(null)
      React.useEffect(function () {
        if (editing[0] && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
      }, [editing[0]])
      var cancel = function () { editing[1](false); value[1](props.name || '') }
      var commit = async function () {
        var next = value[0].trim()
        if (!next || next === (props.name || '')) { cancel(); return }
        busy[1](true)
        try {
          var result = await api('profile-update', { id: props.id, displayName: next })
          await fetchStatus(true).catch(function () {})
          busy[1](false); editing[1](false)
          tbStore.set({ notify: { kind: 'success', title: pageT('nicknameSaved'), detail: result.displayName } })
        } catch (e10) {
          busy[1](false)
          tbStore.set({ notify: { kind: 'error', title: String(e10.message || e10), detail: '' } })
        }
      }
      if (!editing[0]) {
        return h('span', {
          title: pageT('editNicknameTitle'),
          style: {
            fontSize: 13, fontWeight: 600, cursor: 'text', borderRadius: 4,
            borderBottom: '1px dashed var(--dsw-alias-border-l2, #c9ccd1)',
          },
          onClick: function (e) { e.stopPropagation(); value[1](props.name || ''); editing[1](true) },
        }, props.name || props.email || '')
      }
      return h('input', {
        ref: inputRef, value: value[0], maxLength: 64, disabled: busy[0],
        onClick: function (e) { e.stopPropagation() },
        onChange: function (e) { value[1](e.target.value) },
        onKeyDown: function (e) {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') cancel()
        },
        onBlur: function () { if (!busy[0]) commit() },
        style: {
          height: 22, width: 130, fontSize: 13, fontWeight: 600, padding: '0 6px',
          borderRadius: 5, boxSizing: 'border-box', outline: 'none',
          border: '1px solid var(--dsw-alias-brand-primary, #3568cd)', background: 'var(--dsw-alias-bg-base)',
          color: 'var(--dsw-alias-label-primary)',
        },
      })
    }

    // 由邮箱地址推断其服务商网页版收件箱入口(发码后自动跳转用)
    function mailHomeUrl(addr) {
      var domain = String(addr || '').split('@')[1] || ''
      domain = domain.toLowerCase()
      var map = {
        'qq.com': 'https://mail.qq.com', 'foxmail.com': 'https://mail.qq.com',
        '163.com': 'https://mail.163.com', '126.com': 'https://mail.126.com',
        'gmail.com': 'https://mail.google.com', 'googlemail.com': 'https://mail.google.com',
        'outlook.com': 'https://outlook.live.com', 'hotmail.com': 'https://outlook.live.com', 'live.com': 'https://outlook.live.com',
        'icloud.com': 'https://www.icloud.com/mail',
        'sina.com': 'https://mail.sina.com.cn', 'sohu.com': 'https://mail.sohu.com',
        'aliyun.com': 'https://mail.aliyun.com', 'yeah.net': 'https://mail.yeah.net',
        '139.com': 'https://mail.10086.cn',
      }
      return Object.hasOwn(map, domain) ? map[domain] : ''
    }

    /* ── 多账号面板 ─────────────────────────────────────────────────────── */

    var PANEL_WIDTH = 320

    var menuItemStyle = {
      display: 'block', width: '100%', textAlign: 'left', padding: '6px 9px',
      border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer',
      fontSize: 12, color: 'var(--dsw-alias-label-primary)', font: 'inherit',
    }

    /** 账号列表里的一行：点整行切换，⋯ 出菜单（重新登录 / 移除）。 */
    function AccountRow(props) {
      var acc = props.account
      var balance = props.balance
      var menu = React.useState(false)
      var balText = money(props.channel || tbStore.get().channel, balance)
        || (acc.expired ? pageT('expired') : '—')
      return h('div', {
        style: {
          position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 7px', borderRadius: 8,
          cursor: acc.active ? 'default' : 'pointer',
          background: acc.active ? 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))' : 'transparent',
        },
        onClick: function () { if (acc.expired) props.onRelogin(acc.email); else if (!acc.active) props.onSwitch(acc.id) },
        onMouseEnter: function (e) {
          if (!acc.active) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))'
        },
        onMouseLeave: function (e) {
          if (!acc.active) e.currentTarget.style.background = 'transparent'
        },
      },
        h('span', {
          style: {
            width: 7, height: 7, borderRadius: '50%', flex: 'none', boxSizing: 'border-box',
            background: acc.active ? 'var(--dsw-alias-brand-primary, #3568cd)' : 'transparent',
            border: acc.active ? 'none' : '1px solid var(--dsw-alias-border-l2, #c9ccd1)',
          },
        }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {
            style: {
              fontSize: 12.5, fontWeight: acc.active ? 600 : 400, lineHeight: 1.35,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, accountTitle(acc)),
          accountSubtitle(acc) ? h('div', {
            style: {
              fontSize: 10.5, lineHeight: 1.35, color: 'var(--dsw-alias-label-secondary, #888)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, accountSubtitle(acc)) : null,
        ),
        h('span', {
          style: {
            fontSize: 11, flex: 'none', fontVariantNumeric: 'tabular-nums',
            color: acc.expired ? '#d03050' : 'var(--dsw-alias-label-secondary, #888)',
          },
        }, balText),
        h('button', {
          type: 'button', title: pageT('more'), 'aria-label': pageT('more'),
          style: {
            flex: 'none', width: 18, height: 18, padding: 0, border: 'none', borderRadius: 5,
            background: 'transparent', cursor: 'pointer', lineHeight: 1,
            color: 'var(--dsw-alias-label-secondary, #999)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          },
          onClick: function (e) { e.stopPropagation(); menu[1](!menu[0]) },
        }, '⋯'),
        menu[0] ? h('div', {
          style: {
            position: 'absolute', right: 4, top: 26, zIndex: 5, minWidth: 92, padding: 4,
            borderRadius: 8, background: 'var(--dsw-menu-surface-fill)',
            border: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
          },
          onClick: function (e) { e.stopPropagation() },
        },
          h('button', {
            type: 'button', style: menuItemStyle,
            onClick: function (e) { e.stopPropagation(); menu[1](false); props.onRelogin(acc.email) },
          }, pageT('relogin')),
          h('button', {
            type: 'button', style: Object.assign({}, menuItemStyle, { color: '#d03050' }),
            onClick: function (e) { e.stopPropagation(); menu[1](false); props.onRemove(acc.id) },
          }, pageT('removeAccount')),
        ) : null,
      )
    }

    /** 渠道切换 tab：两个渠道的账号体系互不相通，切过去要整块换掉。 */
    function ChannelTabs() {
      var snap = useTbStore()
      var current = snap.channel || 'tokenbank'
      return h('div', {
        role: 'tablist', 'aria-label': pageT('channel'),
        style: { display: 'flex', width: '100%', padding: 3, borderRadius: 999, gap: 2, background: 'var(--dsw-alias-bg-layer-2)' },
      }, CHANNELS.map(function (channel) {
        var on = channel.id === current
        return h('button', {
          key: channel.id, type: 'button', role: 'tab', 'aria-selected': on,
          onClick: function () { selectChannel(channel.id) },
          style: {
            flex: 1, height: 26, border: 'none', borderRadius: 999, cursor: 'pointer', font: 'inherit',
            fontSize: 12.5, fontWeight: on ? 600 : 400,
            background: on ? 'var(--dsw-alias-bg-base)' : 'transparent',
            color: 'var(--dsw-alias-label-primary)',
            boxShadow: on ? 'var(--dsw-elevation-prominent)' : 'none',
          },
        }, channel.label)
      }))
    }

    /** 星驰面板：只认 refresh token 添加账号，余额是美元浮点，签到按账号领。 */
    function XingchiPanel(props) {
      var data = props.data
      var list = (data && data.accounts) || []
      var balances = React.useState({})
      var token = React.useState('')
      var signed = React.useState({})
      var busy = React.useState('')
      var error = React.useState('')
      var lock = React.useRef(false)

      React.useEffect(function () {
        var stopped = false
        fetchBalances(props.sequence).then(function (result) {
          if (!stopped) balances[1](result.balances || {})
        }).catch(function () { if (!stopped) balances[1]({}) })
        return function () { stopped = true }
      }, [props.sequence, list.length, props.channel])

      var run = function (action, operation) {
        if (lock.current) return Promise.resolve()
        lock.current = true
        error[1](''); busy[1](action)
        return Promise.resolve().then(operation).catch(function (err) {
          error[1](err.message || pageT('requestFailed'))
        }).finally(function () { lock.current = false; busy[1]('') })
      }

      var add = function () {
        var value = token[0].trim()
        return run('add', async function () {
          await api('add-account', { refreshToken: value })
          token[1]('')
          notify('success', pageT('accountAdded'))
          await props.onChanged()
        })
      }
      var remove = function (id) {
        return run('remove:' + id, async function () {
          await api('remove-account', { id: id })
          notify('success', pageT('accountRemoved'))
          await props.onChanged()
        })
      }
      var refreshOne = function (id) {
        return run('refresh:' + id, async function () {
          await api('refresh-account', { id: id })
          notify('success', pageT('tokenRefreshed'))
          await props.onChanged()
        })
      }
      var togglePool = function (account) {
        return run('pool:' + account.id, async function () {
          await api('account-pool', { id: account.id, pool: !account.pool })
          await props.onChanged()
        })
      }
      var checkin = function (id) {
        return run('checkin:' + id, async function () {
          var result = await api('checkin-do', { id: id })
          signed[1](Object.assign({}, signed[0], { [id]: true }))
          notify(result.status === 'checked' ? 'success' : 'info', result.status === 'checked'
            ? pageT('checkinOk') + (result.amount > 0 ? ' +' + result.amount : '')
            : pageT('checkinDone'))
          await props.onChanged()
        })
      }
      var checkinAll = function () {
        return run('all', async function () {
          var result = await api('checkin-all')
          reportCheckins(result)
          await props.onChanged()
        })
      }
      var toggleAuto = function () {
        return run('auto', async function () {
          var result = await api('auto-checkin-set', { enabled: !(data.autoCheckin && data.autoCheckin.enabled) })
          reportCheckins(result.run)
          await props.onChanged()
        })
      }
      var syncModels = function () {
        return run('models', async function () {
          var result = await api('model-sync')
          notify('success', pageT('modelListUpdated').replace('{n}', String(result.count || 0)))
        })
      }

      var auto = Boolean(data.autoCheckin && data.autoCheckin.enabled)
      var todayDone = Boolean(data.autoCheckin && data.autoCheckin.todayDone)
      var live = list.filter(function (account) { return !account.expired }).length

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('strong', { style: { fontSize: 15 } }, pageT('accountsCount').replace('{n}', String(list.length))),
          h('a', { href: data.site || 'https://xingchiapi.com', target: '_blank', rel: 'noopener noreferrer',
            style: Object.assign({}, labelStyle, { color: 'inherit' }) }, pageT('openSite'))),
        error[0] ? h('div', { role: 'alert', style: errorStyle }, error[0]) : null,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' } },
          list.length ? list.map(function (account) {
            var amount = balances[0][account.id]
            var done = signed[0][account.id] || (todayDone && account.pool)
            return h('div', {
              key: account.id,
              style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)' },
            },
              h('span', {
                title: account.pool ? pageT('poolOn') : pageT('poolOff'),
                style: { width: 7, height: 7, borderRadius: 999, flex: 'none', cursor: 'pointer',
                  background: account.pool ? 'var(--dsw-alias-brand-primary)' : 'transparent',
                  border: account.pool ? 'none' : '1px solid var(--dsw-alias-border-l2, #c9ccd1)' },
                onClick: function () { togglePool(account) },
              }),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 } },
                h('span', { style: { fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: account.email }, account.email),
                h('span', { style: Object.assign({}, labelStyle, { fontSize: 11 }) },
                  typeof amount === 'number' ? '$' + amount.toFixed(2) : account.expired ? pageT('expired') : account.hasKey ? pageT('noBalance') : pageT('poolKeyMissing'))),
              h('button', { type: 'button', disabled: Boolean(busy[0]) || account.expired || done,
                style: Object.assign({}, buttonStyle, { height: 24, padding: '0 8px', fontSize: 11.5 }), onClick: function () { checkin(account.id) } },
                done ? pageT('checkinDone') : pageT('checkin')),
              h('button', { type: 'button', disabled: Boolean(busy[0]), title: pageT('refreshToken'),
                style: Object.assign({}, buttonStyle, { height: 24, padding: '0 6px', fontSize: 11.5 }), onClick: function () { refreshOne(account.id) } }, '⟳'),
              h('button', { type: 'button', disabled: Boolean(busy[0]), title: pageT('removeAccount'),
                style: Object.assign({}, buttonStyle, { height: 24, padding: '0 6px', fontSize: 11.5, color: 'var(--dsw-alias-state-error-primary, #d03050)' }),
                onClick: function () { remove(account.id) } }, '×'))
          }) : h('span', { style: labelStyle }, pageT('noAccounts'))),
        h('div', { style: { display: 'flex', gap: 6 } },
          h('input', {
            type: 'password', style: Object.assign({}, inputStyle, { flex: 1 }), value: token[0],
            placeholder: pageT('refreshTokenPlaceholder'), autoComplete: 'off',
            onChange: function (event) { token[1](event.target.value) },
            onKeyDown: function (event) { if (event.key === 'Enter' && token[0].trim()) add() },
          }),
          h('button', { type: 'button', disabled: Boolean(busy[0]) || !token[0].trim(), style: buttonStyle, onClick: add },
            busy[0] === 'add' ? pageT('adding') : pageT('addAccount'))),
        h('div', { style: labelStyle }, pageT('refreshTokenHint')),
        h('div', { style: { display: 'flex', gap: 6 } },
          h('button', { type: 'button', disabled: Boolean(busy[0]) || !live, style: Object.assign({}, primaryButtonStyle, { flex: 1 }), onClick: checkinAll },
            busy[0] === 'all' ? pageT('checkinAllBusy') : pageT('checkinAll')),
          h('button', { type: 'button', disabled: Boolean(busy[0]), 'aria-pressed': auto, title: pageT('autoCheckinHint'),
            style: Object.assign({}, buttonStyle, auto ? { borderColor: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-brand-primary)' } : null),
            onClick: toggleAuto }, pageT('autoCheckin'))),
        h('div', { style: { display: 'flex', gap: 6 } },
          h('button', { type: 'button', disabled: Boolean(busy[0]) || !live, style: Object.assign({}, buttonStyle, { flex: 1 }), onClick: syncModels },
            busy[0] === 'models' ? pageT('saving') : pageT('modelSync'))))
    }

    function EntryOverlay() {
      var snap = useTbStore()
      var data = snap.status
      var list = (data && data.accounts) || []
      var active = list.find(function (account) { return account.id === data.activeId })
      var activeId = active && !active.expired && data.loggedIn ? active.id : ''
      var showingForm = snap.panelView === 'add' || data && !list.length
      var balances = React.useState({})
      var signed = React.useState(null)
      var busy = React.useState('')
      var error = React.useState('')
      var lock = React.useRef(false)
      var statusTicket = React.useRef(0)
      var dismiss = function () { tbStore.set({ authOpen: false, panelView: 'main', signInEmail: '' }) }

      var loadStatus = function (force) {
        var ticket = ++statusTicket.current
        error[1]('')
        return fetchStatus(force).catch(function (err) {
          if (ticket === statusTicket.current) error[1](err.message || pageT('requestFailed'))
          return null
        })
      }
      React.useEffect(function () {
        if (!snap.authOpen) return
        loadStatus(false)
        var onKey = function (event) { if (event.key === 'Escape' && !event.defaultPrevented) dismiss() }
        window.addEventListener('keydown', onKey)
        return function () { statusTicket.current += 1; window.removeEventListener('keydown', onKey) }
      }, [snap.authOpen, snap.channel])

      React.useEffect(function () {
        if (!snap.authOpen || !activeId || showingForm) return
        var stopped = false
        var pending = false
        var pull = function () {
          if (pending) return
          pending = true
          api('checkin-status', { id: activeId }).then(function (result) {
            if (!stopped) signed[1]({ id: activeId, value: result.checkin })
          }).catch(function () {}).finally(function () { pending = false })
        }
        pull()
        var timer = window.setInterval(pull, 300000)
        return function () { stopped = true; window.clearInterval(timer) }
      }, [snap.authOpen, activeId, showingForm, snap.balanceSeq])

      React.useEffect(function () {
        if (!snap.authOpen || !list.length || showingForm) return
        var stopped = false
        fetchBalances(snap.balanceSeq).then(function (result) {
          if (!stopped) balances[1](result.balances || {})
        }).catch(function () { if (!stopped) balances[1]({}) })
        return function () { stopped = true }
      }, [snap.authOpen, list.length, showingForm, snap.balanceSeq])
      if (!snap.authOpen) return null

      var refresh = async function (withBalances) {
        var result = await loadStatus(true)
        if (withBalances) bumpBalance()
        return result
      }
      var run = async function (action, operation) {
        if (lock.current) return
        lock.current = true
        error[1](''); busy[1](action)
        try { await operation() }
        catch (err) {
          if (err.code === 'session_expired' || err.code === 'account_changed') await loadStatus(true)
          error[1](err.message || pageT('requestFailed'))
        } finally { lock.current = false; busy[1]('') }
      }
      var doCheckin = function () {
        return run('checkin', async function () {
          var result = await api('checkin-do', { id: activeId })
          var ci = result.checkin
          signed[1]({ id: activeId, value: ci })
          if (result.status === 'checked') {
            var gain = ci.amount_nano_usd > 0 ? ' +$' + (ci.amount_nano_usd / 1e9).toFixed(2) : ''
            var streak = ci.streak > 1 ? ' ' + pageT('checkinStreak').replace('{n}', String(ci.streak)) : ''
            notify('success', pageT('checkinOk') + gain + streak)
          } else if (result.status === 'failed') {
            error[1](pageT('checkinFailed'))
          }
          await refresh(result.status === 'checked')
        })
      }
      var doCheckinAll = function () {
        return run('all', async function () {
          var result = await api('checkin-all')
          reportCheckins(result)
          await refresh(true)
        })
      }
      var doToggleAuto = function () {
        return run('auto', async function () {
          var result = await api('auto-checkin-set', { enabled: !data.autoCheckin.enabled })
          reportCheckins(result.run)
          await refresh(Boolean(result.run))
        })
      }
      var doSwitch = function (id) {
        return run('switch', async function () { await api('switch', { id: id }); await refresh(false); notify('success', pageT('switched')) })
      }
      var doRemove = function (id) {
        return run('remove', async function () { await api('remove', { id: id }); await refresh(true); notify('success', pageT('accountRemoved')) })
      }
      var startAuth = function (mode, email) {
        error[1]('')
        tbStore.set({ panelView: 'add', authMode: mode, signInEmail: email || '' })
      }

      var channel = snap.channel || 'tokenbank'
      var body
      // 星驰只给美元浮点，TokenBank 只给 nano 整数，所以两种都试，谁认得就用谁。
      var rawBalance = balances[0][active && active.id]
      if (rawBalance === undefined || rawBalance === null) rawBalance = data && data.account && data.account.balance_nano_usd
      var ci = signed[0] && signed[0].id === activeId ? signed[0].value : null
      var done = Boolean(ci && ci.checked_today)
      var auto = Boolean(data && data.autoCheckin && data.autoCheckin.enabled)
      var live = list.filter(function (account) { return !account.expired }).length
      if (!data) {
        body = error[0] ? h('button', { type: 'button', style: buttonStyle, onClick: function () { loadStatus(true) } }, pageT('retry'))
          : h('span', { style: labelStyle, role: 'status' }, pageT('loading'))
      } else if (channel === 'xingchi') {
        // 星驰没有注册/登录流程（登录要 Turnstile），加账号靠粘贴 refresh token。
        body = h(XingchiPanel, { data: data, sequence: snap.balanceSeq, channel: channel, onChanged: function () { return refresh(true) } })
      } else if (showingForm) {
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          list.length ? h('button', { type: 'button', style: Object.assign({}, buttonStyle, { alignSelf: 'flex-start' }),
            onClick: function () { tbStore.set({ panelView: 'main', signInEmail: '' }) } }, pageT('back')) : null,
          h(AuthCard, { key: snap.authMode + ':' + snap.signInEmail, mode: snap.authMode, initialEmail: snap.signInEmail,
            setMode: function (mode) { tbStore.set({ authMode: mode }) },
            onAuthed: async function () {
              tbStore.set({ panelView: 'main', signInEmail: '' })
              await refresh(true)
            },
          }))
      } else {
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          active ? h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
            activeId ? h(EditableNickname, { id: active.id, key: active.id, name: (data.user && data.user.display_name) || active.displayName, email: active.email })
              : h('span', { style: labelStyle }, pageT('activeExpired')),
            h('span', { style: Object.assign({}, labelStyle, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }), title: active.email }, active.email)) : null,
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
            h('strong', { style: { fontSize: 18, fontVariantNumeric: 'tabular-nums' }, title: pageT('activeBalance') }, money(channel, rawBalance) || '—'),
            list.length > 1 ? h('button', { type: 'button', disabled: Boolean(busy[0]) || !live, style: buttonStyle, onClick: doCheckinAll },
              busy[0] === 'all' ? pageT('checkinAllBusy') : pageT('checkinAll')) : null),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto', padding: '0 2px' } },
            list.map(function (account) {
              return h(AccountRow, { key: account.id, account: account, balance: balances[0][account.id], channel: channel,
                onSwitch: doSwitch, onRemove: doRemove, onRelogin: function (email) { if (!lock.current) startAuth('login', email) } })
            })),
          h('button', { type: 'button', style: Object.assign({}, buttonStyle, { borderStyle: 'dashed' }), disabled: Boolean(busy[0]),
            onClick: function () { startAuth('register') } }, pageT('addAccount')),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            h('button', { type: 'button', disabled: !activeId || Boolean(busy[0]) || done || Boolean(ci && !ci.enabled),
              style: Object.assign({}, done ? buttonStyle : primaryButtonStyle, { flex: 1 }), onClick: doCheckin },
              busy[0] === 'checkin' ? pageT('checkinBusy') : done ? pageT('checkinDone') : ci && !ci.enabled ? pageT('checkinDisabled') : pageT('checkin')),
            h('button', { type: 'button', disabled: Boolean(busy[0]), 'aria-pressed': auto, title: pageT('autoCheckinHint'),
              style: Object.assign({}, buttonStyle, auto ? { borderColor: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-brand-primary)' } : null),
              onClick: doToggleAuto }, pageT('autoCheckin'))),
          h('div', { style: labelStyle }, pageT('modelSettingsHint')))
      }

      var portal = (data && data.portalUrl) || (data && data.site) || (channel === 'xingchi' ? 'https://xingchiapi.com' : 'https://bank.skillpie.cn')
      var title = channel === 'xingchi' ? '星驰' : '转接台'
      var anchor = snap.anchor || { right: window.innerWidth - 16, top: window.innerHeight - 80 }
      var bottom = Math.max(8, Math.min(window.innerHeight - 128, window.innerHeight - anchor.top + 8))
      var panelStyle = {
        position: 'fixed', width: PANEL_WIDTH, maxWidth: 'calc(100vw - 16px)', right: Math.max(8, window.innerWidth - anchor.right), bottom: bottom,
        maxHeight: Math.max(80, Math.min(520, window.innerHeight - bottom - 8)), overflow: 'auto', boxSizing: 'border-box',
        background: 'var(--dsw-menu-surface-fill, var(--dsw-alias-bg-layer-1))', backdropFilter: 'var(--dsw-menu-backdrop-filter)',
        color: 'var(--dsw-alias-label-primary)', borderRadius: 'var(--dsw-radius-md, 10px)', padding: 14,
        border: '1px solid var(--dsw-alias-border-l1)', boxShadow: 'var(--dsw-elevation-prominent)',
      }
      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 1999 }, onClick: dismiss },
        h('div', { role: 'dialog', 'aria-label': pageT('settingsTitle'), style: panelStyle, onClick: function (event) { event.stopPropagation() } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
            h(TokenBankLogo, { size: 18 }),
            h('a', { href: portal, target: '_blank', rel: 'noopener noreferrer', title: pageT('openSite'),
              style: { fontWeight: 700, color: 'inherit', textDecoration: 'none', flex: 1 } }, title),
            h('button', { type: 'button', style: buttonStyle, onClick: dismiss }, pageT('close'))),
          h('div', { style: { marginBottom: 10 } }, h(ChannelTabs)),
          error[0] ? h('div', { role: 'alert', style: Object.assign({}, errorStyle, { marginBottom: 8 }) }, error[0]) : null,
          body))
    }

    /* ── 设置页:轮询池、轮询参数与网关状态 ─────────────────────────────── */

    var SEC_CARD = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14,
    }
    var SEC_TITLE = { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
    var SEC_HINT = { fontSize: 11.5, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' }
    var SEC_MONO = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12, fontVariantNumeric: 'tabular-nums',
    }

    function SettingsCard(props) {
      return h('section', { style: SEC_CARD },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: SEC_TITLE }, props.title),
          h('span', { style: { flex: 1 } }),
          props.extra || null),
        props.children,
      )
    }

    function SettingsRow(props) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 } },
          h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, props.label),
          props.hint ? h('span', { style: SEC_HINT }, props.hint) : null),
        props.children,
      )
    }

    /**
     * 开关照抄宿主自己的 switch 变量配对：轨道用 border-l3，开态用 brand-primary，
     * 滑块开态用 label-primary-foreground、关态用 switch-thumb。
     * 别给滑块写死 #fff —— brand-primary 在深色主题下是近白，写死白就成了白底白块。
     */
    function Toggle(props) {
      var on = props.checked === true
      var off = props.disabled === true
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': on,
        'aria-label': props.label || undefined,
        disabled: off,
        onClick: props.onChange,
        style: {
          flex: 'none', width: 36, height: 20, borderRadius: 999, padding: 2,
          position: 'relative', boxSizing: 'border-box',
          cursor: off ? 'default' : 'pointer',
          border: 'none',
          background: on
            ? 'var(--dsw-alias-brand-primary, #3568cd)'
            : 'var(--dsw-alias-border-l3, rgba(0,0,0,.12))',
          opacity: off ? 0.5 : 1,
          transition: 'background .15s ease',
        },
      }, h('span', {
        style: {
          display: 'block', width: 16, height: 16, borderRadius: 999,
          background: on
            ? 'var(--dsw-alias-label-primary-foreground, #ffffff)'
            : 'var(--dsw-alias-switch-thumb, #ffffff)',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform .15s ease, background .15s ease',
        },
      }))
    }

    function NumInput(props) {
      return h('input', {
        type: 'number', inputMode: props.step ? 'decimal' : 'numeric', 'aria-label': props.label,
        value: props.value == null ? '' : String(props.value),
        min: props.min, max: props.max, step: props.step || 1,
        disabled: props.disabled === true,
        onChange: function (e) { props.onChange(e && e.target ? e.target.value : '') },
        style: Object.assign({}, inputStyle, { width: 96, flex: 'none', textAlign: 'right' }),
      })
    }

    /**
     * 设置页正文。宿主只给 `{ close }`，导航行/滚动列都由 shell 负责，
     * 这里只画内容。所有数据从 host 现拉，不做跨组件订阅 ——
     * 弹窗改了池子，重开这一页就能看到最新状态。
     */
    function SettingsPage() {
      var snap = useTbStore()
      var settings = React.useState(null)
      var accounts = React.useState([])
      var balances = React.useState({})
      var stats = React.useState(null)
      var form = React.useState(null)
      var flag = React.useState({ busy: false, error: '', ok: false })
      var copied = React.useState(false)
      var operation = React.useRef(false)
      var clipboardTimer = React.useRef(null)
      var viewTicket = React.useRef(0)

      React.useEffect(function () {
        var stopped = false
        api('settings-get').then(function (data) {
          if (stopped) return
          settings[1](data)
          accounts[1](data.accounts)
          form[1](Object.assign({}, data.gateway))
        }).catch(function (err) {
          if (!stopped) flag[1]({ busy: false, error: err.message || pageT('requestFailed'), ok: false })
        })
        return function () { stopped = true; viewTicket.current += 1; window.clearTimeout(clipboardTimer.current) }
      }, [])

      React.useEffect(function () {
        if (!settings[0] || !accounts[0].length) return
        var stopped = false
        fetchBalances(snap.balanceSeq).then(function (data) {
          if (!stopped) balances[1](data.balances || {})
        }).catch(function () { if (!stopped) balances[1]({}) })
        return function () { stopped = true }
      }, [settings[0] !== null, accounts[0].length, snap.balanceSeq])

      React.useEffect(function () {
        var stopped = false
        var timer
        var pull = function () {
          api('gateway-status').then(function (data) {
            if (!stopped) stats[1](data)
          }).catch(function () { if (!stopped) stats[1](null) })
            .finally(function () { if (!stopped) timer = window.setTimeout(pull, 5000) })
        }
        pull()
        return function () { stopped = true; window.clearTimeout(timer) }
      }, [])

      var act = async function (fn, showSaved) {
        if (operation.current) return
        operation.current = true
        var ticket = viewTicket.current
        flag[1]({ busy: true, error: '', ok: false })
        try {
          var update = await fn()
          if (ticket !== viewTicket.current) return
          if (typeof update === 'function') update()
          flag[1]({ busy: false, error: '', ok: showSaved === true })
        } catch (err) {
          if (ticket === viewTicket.current) flag[1]({ busy: false, error: err.message || pageT('requestFailed'), ok: false })
        } finally { operation.current = false }
      }
      var patch = function (next) {
        form[1](function (prev) { return Object.assign({}, prev, next) })
      }
      var saveTuning = function () {
        if (!form[0] || !settings[0]) return
        return act(async function () {
          var payload = {}
          Object.keys(settings[0].gateway).forEach(function (key) {
            if (Number.isFinite(form[0][key]) && form[0][key] !== settings[0].gateway[key]) payload[key] = form[0][key]
          })
          var result = await api('settings-set', { gateway: payload })
          return function () {
            settings[1](function (previous) { return Object.assign({}, previous, { gateway: result.gateway }) })
            form[1](Object.assign({}, result.gateway))
          }
        }, true)
      }
      var togglePool = function (account) {
        return act(async function () {
          var result = await api('account-pool', { id: account.id, pool: account.pool === false })
          return function () {
            accounts[1](function (previous) {
              return previous.map(function (item) { return item.id === result.id ? Object.assign({}, item, { pool: result.pool }) : item })
            })
          }
        })
      }
      var toggleAuto = function () {
        return act(async function () {
          var result = await api('auto-checkin-set', { enabled: !settings[0].autoCheckin.enabled })
          reportCheckins(result.run)
          if (result.run) bumpBalance()
          fetchStatus(true).catch(function () {})
          return function () {
            settings[1](function (previous) { return Object.assign({}, previous, { autoCheckin: result }) })
          }
        }, true)
      }
      var resetGateway = function () {
        return act(async function () {
          await api('gateway-reset')
          var data = await api('gateway-status')
          return function () { stats[1](data) }
        })
      }
      var syncModels = function () {
        return act(async function () {
          var data = await api('model-sync')
          notify('success', pageT('modelLinked').replace('{n}', String(data.count)))
        })
      }
      var copy = async function (text) {
        var ticket = viewTicket.current
        try {
          await navigator.clipboard.writeText(text)
          if (ticket !== viewTicket.current) return
          copied[1](true)
          window.clearTimeout(clipboardTimer.current)
          clipboardTimer.current = window.setTimeout(function () { copied[1](false) }, 1500)
        } catch { if (ticket === viewTicket.current) notify('error', pageT('copyFailed')) }
      }

      var s = settings[0]
      var gw = stats[0]
      var listening = gw ? gw.listening : Boolean(s && s.listening)
      var address = gw ? gw.baseURL : s && 'http://127.0.0.1:' + s.port
      var f = form[0] || {}
      var cooldowns = gw && gw.cooldowns || {}
      var cooling = Object.keys(cooldowns).filter(function (id) { return cooldowns[id] > 0 })
      var nameOf = function (id) {
        var hit = accounts[0].find(function (item) { return item.id === id })
        return hit ? (hit.displayName || hit.email || id) : id
      }
      var actionButton = function (label, handler, disabled) {
        return h('button', { type: 'button', disabled: disabled, onClick: handler, style: buttonStyle }, label)
      }
      var fields = [
        ['requestRetryRounds', 'retryRounds', 'retryRoundsHint', 10, 1],
        ['maxRetryIntervalMs', 'maxWait', 'maxWaitHint', 120, 1000],
        ['cooldownMs', 'cooldown', 'cooldownHint', 600, 1000],
      ]

      return h('div', { style: { display: 'flex', flexDirection: 'column', padding: '2px 2px 8px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
          h(TokenBankLogo, { size: 18 }),
          h('strong', { style: { fontSize: 17, flex: 1 } }, '转接台'),
          s && s.upstream ? h('a', { href: s.upstream, target: '_blank', rel: 'noopener noreferrer',
            style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, pageT('openSite')) : null),
        h('div', { style: Object.assign({}, SEC_HINT, { marginBottom: 14 }) }, pageT('settingsDesc')),
        flag[0].error ? h('div', { role: 'alert', style: Object.assign({}, errorStyle, { marginBottom: 8 }) }, flag[0].error) : null,

        h(SettingsCard, { title: pageT('gatewayStatus'), extra: (s || gw) ? h('span', {
          style: { fontSize: 12, color: listening ? 'var(--dsw-alias-state-success-primary, #228258)' : 'var(--dsw-alias-state-warn-primary, #b97910)' },
        }, listening ? pageT('gatewayListening') : pageT('gatewayDown')) : null },
          h(SettingsRow, { label: pageT('gatewayAddress'), hint: s ? pageT('gatewayUpstream') + ' ' + s.upstream : '' },
            h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } },
              h('span', { style: SEC_MONO }, address || '—'),
              actionButton(copied[0] ? pageT('copied') : pageT('copy'), function () { copy(address) }, !address))),
          h(SettingsRow, { label: pageT('gatewayPool') }, h('span', { style: SEC_MONO }, gw ? gw.poolCount + ' / ' + gw.accounts : '—')),
          h(SettingsRow, { label: pageT('gatewayServed'), hint: gw ? pageT('gatewaySwitched') + ' ' + (gw.switched || 0)
            + ' · ' + pageT('gatewayWaited') + ' ' + (gw.waitedRounds || 0) : '' }, h('span', { style: SEC_MONO }, gw ? String(gw.served || 0) : '—')),
          h(SettingsRow, { label: pageT('gatewayLastPicked') }, h('span', { style: SEC_MONO }, gw && gw.lastPicked ? nameOf(gw.lastPicked) : pageT('gatewayNone'))),
          h(SettingsRow, { label: pageT('gatewayCooldown'), hint: gw && !cooling.length ? pageT('gatewayCooldownEmpty') : '' },
            h('span', { style: Object.assign({}, SEC_MONO, { textAlign: 'right' }) }, cooling.length
              ? cooling.map(function (id) { return nameOf(id) + ' ' + Math.ceil(cooldowns[id] / 1000) + 's' }).join(' · ') : '—')),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 } },
            actionButton(pageT('gatewayReset'), resetGateway, flag[0].busy || !gw || !listening),
            actionButton(pageT('modelSync'), syncModels, flag[0].busy || !gw || !listening || !Array.isArray(gw.pool) || !gw.pool.length))),

        h(SettingsCard, { title: pageT('poolTitle') },
          h('div', { style: SEC_HINT }, pageT('poolHint')),
          !s ? h('div', { style: SEC_HINT }, '—') : !accounts[0].length ? h('div', { style: SEC_HINT }, pageT('poolEmpty')) :
            accounts[0].map(function (account) {
              var missing = gw && Array.isArray(gw.poolMissingKey) && gw.poolMissingKey.includes(account.id)
              var subtitle = accountSubtitle(account)
              var notes = [subtitle, account.expired ? pageT('expired') : '', missing ? pageT('poolKeyMissing') : ''].filter(Boolean)
              return h(SettingsRow, { key: account.id, label: accountTitle(account),
                hint: notes.length ? notes.join(' · ') : undefined },
                h('span', { style: SEC_MONO }, money(snap.channel, balances[0][account.id])),
                h(Toggle, { label: account.email, checked: account.pool !== false, disabled: flag[0].busy, onChange: function () { togglePool(account) } }))
            })),

        h(SettingsCard, { title: pageT('tuningTitle') },
          h('div', { style: SEC_HINT }, pageT('tuningHint')),
          fields.map(function (field) {
            var key = field[0], unit = field[4], label = pageT(field[1])
            return h(SettingsRow, { key: key, label: label, hint: pageT(field[2]) }, h(NumInput, {
              label: label, disabled: !s || flag[0].busy, min: 0, max: field[3], step: unit === 1 ? undefined : 0.001,
              value: Number.isFinite(f[key]) ? f[key] / unit : '',
              onChange: function (v) { patch({ [key]: v === '' ? '' : Number(v) * unit }) },
            }))
          }),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            actionButton(pageT('save'), saveTuning, !s || flag[0].busy),
            flag[0].ok ? h('span', { role: 'status', style: SEC_HINT }, pageT('saved')) : null)),

        h(SettingsCard, { title: pageT('autoCheckinTitle') },
          h(SettingsRow, { label: pageT('autoCheckin'), hint: pageT('autoCheckinHint') },
            h(Toggle, { label: pageT('autoCheckin'), checked: Boolean(s && s.autoCheckin.enabled), disabled: !s || flag[0].busy, onChange: toggleAuto }))),
      )
    }

    function AuthCard(props) {
      var mode = props.mode
      var t = pageT
      var email = React.useState(props.initialEmail || '')
      var fullEmail = email[0].trim()
      var password = React.useState('')
      var displayName = React.useState('')
      var code = React.useState('')
      var captcha = React.useState(null)
      var captchaCode = React.useState('')
      var captchaBusy = React.useState(false)
      var captchaFlight = React.useRef(0)
      var sent = React.useState('')
      var error = React.useState('')
      var busy = React.useState(false)
      var submitting = React.useRef(false)

      var refreshCaptcha = function () {
        var id = ++captchaFlight.current
        captcha[1](null); captchaCode[1](''); captchaBusy[1](true)
        api('captcha').then(function (data) {
          if (captchaFlight.current === id) captcha[1](data)
        }).catch(function (err) {
          if (captchaFlight.current === id) error[1](err.message)
        }).finally(function () { if (captchaFlight.current === id) captchaBusy[1](false) })
      }
      React.useEffect(function () {
        if (mode === 'login') refreshCaptcha()
        return function () { captchaFlight.current += 1 }
      }, [mode])

      var run = async function (fn) {
        if (submitting.current) return
        submitting.current = true
        busy[1](true); error[1]('')
        try { await fn() }
        catch (err) { error[1](err.message || t('requestFailed')) }
        finally { submitting.current = false; busy[1](false) }
      }
      var submit = function (event) {
        event.preventDefault()
        if (mode === 'login' && !captcha[0]) return
        return run(async function () {
          try {
            await api(mode === 'register' ? 'register' : 'login', mode === 'register'
              ? { email: fullEmail, password: password[0], code: code[0], displayName: displayName[0] }
              : { email: fullEmail, password: password[0], captchaId: captcha[0].captchaId, captchaCode: captchaCode[0] })
          } catch (err) {
            if (mode === 'login') refreshCaptcha()
            throw err
          }
          password[1]('')
          await props.onAuthed()
        })
      }
      var mail = sent[0] === fullEmail && mailHomeUrl(fullEmail)
      return h('form', { style: cardStyle, onSubmit: submit },
        h('div', { style: { display: 'flex', gap: '0.5em' } },
          ['register', 'login'].map(function (name) {
            return h('button', { key: name, type: 'button', disabled: busy[0], 'aria-pressed': mode === name,
              style: Object.assign({}, mode === name ? primaryButtonStyle : buttonStyle, { flex: 1 }),
              onClick: function () { props.setMode(name) },
            }, t(name === 'register' ? 'register' : 'login'))
          })),
        h(Field, { label: t('email') },
          h('input', { type: 'email', autoComplete: 'username', style: inputStyle, required: true,
            placeholder: t('emailPlaceholder'), value: email[0],
            onChange: function (event) { email[1](event.target.value) } })),
        h(Field, { label: t('password') }, h('input', { type: 'password', style: inputStyle, required: true, autoComplete: mode === 'register' ? 'new-password' : 'current-password',
          value: password[0], onChange: function (event) { password[1](event.target.value) } })),
        mode === 'register' ? h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'end', gap: '0.5em' } },
            h('div', { style: { flex: 1, minWidth: 0 } }, h(Field, { label: t('code') }, h('input', { style: inputStyle, required: true, autoComplete: 'one-time-code', value: code[0], onChange: function (event) { code[1](event.target.value) } }))),
            h('button', { type: 'button', disabled: busy[0] || !fullEmail, style: buttonStyle, onClick: function () {
              return run(async function () { await api('send-code', { email: fullEmail }); sent[1](fullEmail) })
            } }, t('sendCode'))),
          sent[0] === fullEmail ? h('div', { style: labelStyle }, t('codeSent'), mail ? h('a', { href: mail, target: '_blank', rel: 'noopener noreferrer', style: { color: 'inherit', marginInlineStart: '0.5em' } }, t('openMailbox')) : null) : null)
          : h('div', { style: { display: 'flex', alignItems: 'end', gap: '0.5em' } },
              h('div', { style: { flex: 1, minWidth: 0 } }, h(Field, { label: t('captchaCode') }, h('input', { style: inputStyle, required: true, value: captchaCode[0], onChange: function (event) { captchaCode[1](event.target.value) } }))),
              h('button', { type: 'button', disabled: busy[0] || captchaBusy[0], title: t('captchaRefresh'), 'aria-label': t('captchaRefresh'),
                onClick: refreshCaptcha, style: Object.assign({}, buttonStyle, { padding: '0 0.35em' }) }, captcha[0]
                  ? h('img', { src: captcha[0].image, alt: t('captcha'), style: { height: '100%', width: 'auto', display: 'block' } }) : t('captcha'))),
        error[0] ? h('div', { style: errorStyle, role: 'alert' }, error[0]) : null,
        h('button', { type: 'submit', style: primaryButtonStyle, disabled: busy[0] || mode === 'login' && !captcha[0] }, busy[0] ? t('loading') : t(mode === 'register' ? 'register' : 'login')),
      )
    }

    /* ── plugin entry ───────────────────────────────────────────────────── */

    return {
      name: 'dsh-switchboard',
      inject: ['slots', 'locale'],
      apply: function (ctx) {
        if (typeof document !== 'undefined' && document.head) {
          ctx.effect(function () {
            var style = document.createElement('style')
            style.textContent = '#tb-balance-pill:hover,#tb-balance-pill.tb-balance-open,#tb-entry-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))!important}'
            document.head.appendChild(style)
            return function () { if (style.parentNode) style.parentNode.removeChild(style) }
          }, 'dsh-switchboard: hover')
        }

        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-switchboard: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        // 底部状态栏余额胶囊（已登录时显示）
        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'dsh-switchboard-balance',
            order: 5,
          }, BalancePill)
        })

        // 输入框工具行的「免费模型」入口（未登录时显示）
        ctx.slots.inject('conversation.input.right', function () {
          return ctx.slots.register({
            name: 'conversation.input.right',
            id: 'dsh-switchboard-entry',
            order: 0,
            locale: NS,
          }, ComposerEntry)
        })

        // 同一个槽只 inject 一次：多次 inject 会互相覆盖，两个 overlay 一次注册齐。
        ctx.slots.inject('shell.overlay', function () {
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-switchboard-notify',
            locale: NS,
            inject: function () { return {} },
          }, NotifyOverlay)
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-switchboard-panel',
            locale: NS,
          }, EntryOverlay)
        })

        // 设置页：一个 section + 一个按 id 配对的图标。
        // 旧版 DSH 没有 settings.section 槽，inject 会抛错——捕获后其余功能照常。
        try {
          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'dsh-switchboard',
              order: 50,
              locale: NS,
              label: function () { return pageT('settingsTitle') },
            }, SettingsPage)
          })
          ctx.slots.inject('settings.section.icon', function () {
            return ctx.slots.register({
              name: 'settings.section.icon',
              id: 'dsh-switchboard',
            }, function (props) { return h(TokenBankLogo, { size: (props && props.size) || 16 }) })
          })
        } catch (error) {
          ctx.logger?.warn?.(`dsh-switchboard: settings page unavailable: ${error?.message ?? error}`)
        }

      },
    }
  },
})
