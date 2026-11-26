/**
 * dsh-tokenbank-multi — Web client half (module-loader bundle).
 *
 * Registers:
 *   - conversation.composer.dock 余额胶囊（已登录时显示，点开账号面板），
 *   - conversation.input.right 「免费模型」入口（未登录时显示），
 *   - shell.overlay 账号面板：余额 / 每日签到 / 多账号切换与管理 / 添加账号，
 *   - shell.overlay 轻提示。
 *
 * All state comes from the host half's POST /dsh-tokenbank-multi/api. 切换账号时
 * host 半把新账号的 accessKey 写进 TOKENBANK_API_KEY 凭据；llm-pi-ai 每个请求流都
 * 重新 credentials.resolve(apiKeyEnv)，所以下一个请求即用新 key，无需重启。
 * 这里不碰 configEditor，也不改 providers 结构。
 */
window.__ModuleLoader__.load({
  id: 'dsh-tokenbank-multi',
  factory(require) {
    var FRIZON_WOFF = 'd09GRgABAAAAAAikAA8AAAAAC9wAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABHUE9TAAAINAAAAG8AAACeKsEklU9TLzIAAAWUAAAAQwAAAGAwcC7YY21hcAAABdgAAABKAAAAXAEHAcdjdnQgAAAHgAAAABoAAAAaAWMGdGZwZ20AAAYkAAABAgAAAXMGWZw3Z2FzcAAACCwAAAAIAAAACAAAABBnbHlmAAABWAAAA44AAAXgzuTX0GhlYWQAAAUcAAAANgAAADYWICZJaGhlYQAABXQAAAAgAAAAJAgmA5tobXR4AAAFVAAAACAAAAAgFfoBRWxvY2EAAAUIAAAAEgAAABIGOQRKbWF4cAAABOgAAAAgAAAAIAIeAupuYW1lAAAHnAAAAHoAAADICesiAXBvc3QAAAgYAAAAEwAAACD/nwAycHJlcAAABygAAABVAAAAchZBl/l4nH2Uy28TVxTGz7ljz/jRQCa2SSqug4Yb20EB5+FMHKQ2iChAK6qyCApYxSCyKNAFsKKPP6AYsSldQCtV6q4uq7YCtU6USkSCmu6MqraAjEBI0CZigcSmmwx8d8ZRjCrF1s/3+JvxPecen/lIUJFILIsFilCGrteIBggfew7XqGtw8xx1UXSi1BKUFhSFJ0rzFCOTjAFonbjYxM1YO5s8Txa2MQbmqZcMrLvDdB/BMhDl3ZspiuBNsA3sBO+CEjgFPgUXwNfgKpgDv4OOco0MbN/RAIM16kXc0wjWXHNoODMy5o5mBzhlFPxIOTlnpFekkqbVy6nkBqEcmx/l8FqKvcj29WW9fy/x3K7yri09eG1B4O2rOsmk8xHb6S47Xc289V6/mkqn92a2HXg7yzYR+12qoEtxmmnvEemWUFuPolqIBj0KUdjvEaFQRo+iWK2gRzH/ggVB4CRicGiYU07KsZT+tEXFO8OXrj3gL1Z+EAvVUvV0FalRhUIVfyC0aHLdKsJaCOsqguwC2U0kshq8WtbQcMJJKduylRI/vrixgjzeNz+JVOus/yBLjK6um8XQgtEmhLQQaqXVgqkFs02IaCEStIdxK9ldO3U/gohrFMcfzCCOqqMN3U/8CNUTYoYWagarPo2JayHEb2AIEuwWbeWyrez/OL94w7uzKBa82eXrK1OCv/WOrfXvIcLo6/0Tuiqx3kFer9ts9c8oJFROWeoC9x+t37o9/ut4nU/z+ytT9frqzDzxZ+ZsezbWe/H/s60JrU6vpbe0YAXpDVxhv23RVoT/NI5QT1Tcn6ih4YJdsBMFg5VhpYqLz/9+zJGb186hI3e531vyPuD0lxdxYvXymWGJBiVI8WftNbYGaK2kjVrYGJTU3cSTbFG3/86BItgHDoET4GNwHlwBVfALqIOOMvzgLwRPgcBjHUa5ThPiPXJoCfgmEUHQA/rBOHgHHAYnwSegAr4C3wP8nm6DjjKGpw8DIUFfZzAwNOj7j4T/yFX/kfAfCf+R8B8J/5HwHwn/kfAfCf+R8B8J/5HwHwn/kb7/SOwYawYPU1If36QkbQJZMAb2ghnwITgHPgeXwXfgZ/Ab8I//J4InQB8/ht0yenhHJ0TBtyyY1da8KCY3FUYmhDuax1dTuccr0wcrs647Wzk4XTnuLpZmtk/mu7vzk9tnSnxMS223TB85k3b353fsH0ufpVelokR2AAAAAQAAAAgASgAFAD4ABAABAAAAAAAKAAACAAJgAAIAAQAAAAAAkwDWAQkBdgGtAf4C8AAAAAEAAAABAACeDqmmXw889QAbA+gAAAAA2YKodQAAAADZkDnt/7b/HAQoA+gAAAAGAAIAAAAAAAAA+gAAAw0ANwKrADcC9gAjAx4ANwMCACMDCAA3AyoAI3icY2BkYGB+8X8qQyyL8/9t/3exaDAARVAABwCtEwbIeJxjYGHqZJzAwMrAwtTFFMHAwOANoRnjGIyAEBUwInMUgIDhAIMjQwjzi/9TGWJZXBlOwNQwfmHaA1LCwAQA8JgLnQB4nGNgYGBiYGBgBmIRIMkIplkYPIA0DwMHUI6FwYnBlcGbwZ8h5P9/oKgjmOcH4f3f+383kFwP1MfDAAJcYJIVyGdhYAcA3O0MyAAAeJxdkD1OxDAQhcc4LOQGSBaSLSsUK6/oqVI4kVCaQCg8DT/SrkT2DkhpaFxwlqEzXS6GYJKNttjGM+/N6POzE4BrEuRt+BbiC5P4+0zgr38gB/nyvEkgnNZV70m8sjhzbKwNd9LpmmRRPwaLOup4v4261u9vW8qKufJgF/FWE3Sh5/MpGCpRHdsd4h1zsomTzZyITNgvhP1MYMAvL527RpO8acNDoMErKj0qY3RFYxto9Mog8tbqmJTrR3+1ZL7gzKs1N5cHSheoVAQY40FZQ0OMKvI7Fp1gPDEEnBrlYvBPTERZVEkM7TwarFGTYY01nBM93527pgsVJzW4+Qck6mvkAAB4nF2MsQ2AMBDEnAREKhoooECE+hmAAcIwDMFeUZpfjS9ooLN88hUQKo6AF1dpDA3UYGFmpCcCUVBbto9SPJmDnZXhNeGfVVr76qRAOu9ryg+O5wvhAAAAABQApwBRAMAAwQAAABT/lQAAArwAFAK8ABQAAHicdYw7CoNAFEWPXxCCC0jlBhRHJCD2giAKFhZWWogIkoCS/fuYTGETbnPu4d0H+LQ4WG6AxQMM24TSfuxQ8TTs3m48sZNhX/uKnpqRTn72LKx82Zk5GKQdnGx8eBOhSEh1Ssl9V5KJVRTaN7KsiXmJyf9/uQDEqRQFAAB4nGNgZgCD/3MYjBiwAAAqgwHRAAABAAH//wAPeJxjYGRgYOBiUGEwYmBycfMJYeDLSSzJY+BjYAGKM/z/zwCSZ8xOLcpj4ACxwJiFgQnIYwRiJgYDsEobhgAgDWT9T///gAEK/s+C0seB+CyYCdLLyMDMwMrADqQZgSQzVDHIZCaoHDOMDwAlnRCbAA=='
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var NS = 'dsh-tokenbank-multi'
    var API = '/dsh-tokenbank-multi/api'

    var zh = {
      freeToken: '免费模型',
      composerEntry: 'TokenBank 账户',
      balanceTotal: '全部账号余额合计',
      openSite: '打开官网',
      close: '关闭',
      back: '返回',
      more: '更多',
      checkin: '签到',
      checkinBusy: '签到中…',
      checkinDone: '已签到',
      checkinOk: '签到成功',
      checkinStreak: '已连签 {n} 天',
      checkinAll: '一键签到',
      checkinAllBusy: '签到中…',
      checkinAllDone: '全部已签到',
      checkinAllOk: '{n} 个账号签到成功',
      checkinAllPart: '{ok} 个成功，{fail} 个失败',
      checkinAllGain: '共 +${amount}',
      autoCheckin: '自动签到',
      autoCheckinHint: '每天首次启动 DSH 时自动给所有账号签到',
      accountRemoved: '已移除账号',
      addAccount: '+ 添加账号',
      addAccountTitle: '添加账号',
      noAccounts: '还没有账号',
      expired: '已过期',
      relogin: '重新登录',
      removeAccount: '移除账号',
      switched: '已切换账号',
      switchKeyFailed: '已切换，但模型密钥写入失败',
      modelLinked: '已接入 {n} 个模型，点输入框上方的模型选择器即可切换使用',
      modelListUpdated: '模型列表已更新：当前 {n} 个可用模型',
      nicknameSaved: '昵称已更新',
      editNicknameTitle: '点击修改昵称，回车保存',
      emailLocal: '账号',
      email: '邮箱',
      password: '密码',
      code: '验证码',
      captcha: '图形验证码',
      captchaCode: '请输入图形验证码',
      captchaRefresh: '看不清？换一张',
      sendCode: '发送验证码',
      codeSent: '验证码已发送',
      codeInvalid: '验证码不正确或已失效',
      register: '注册',
      login: '登录',
      registerTab: '注册',
      loginTab: '登录',
      settingsTitle: 'TokenBank',
      settingsDesc: '轮询池、轮询参数与网关状态',
      gatewayStatus: '网关状态',
      gatewayAddress: '网关地址',
      gatewayListening: '运行中',
      gatewayDown: '未监听',
      gatewayUpstream: '上游',
      gatewayPool: '轮询池',
      gatewayServed: '已转发',
      gatewaySwitched: '换号',
      gatewayWaited: '等待',
      gatewayLastPicked: '上次选中',
      gatewayNone: '暂无',
      gatewayCooldown: '冷却中',
      gatewayCooldownEmpty: '没有账号在冷却',
      gatewayReset: '清空冷却与游标',
      copy: '复制',
      copied: '已复制',
      poolTitle: '轮询池',
      poolHint: '只有勾选的账号会参与网关轮询。取消勾选不影响它作为当前账号使用，也不影响签到。',
      poolEmpty: '还没有账号，先在 TokenBank 面板里登录一个。',
      tuningTitle: '轮询参数',
      tuningHint: '改完对下一个请求就生效，不需要重启。',
      retryRounds: '重试轮数',
      retryRoundsHint: '一轮试完所有账号后，整体再来几轮（0–10）',
      maxWait: '单轮最大等待（秒）',
      maxWaitHint: '全员冷却时最多等这么久再重试，超时就直返 429（0–120）',
      cooldown: '冷却时长（秒）',
      cooldownHint: '上游 429 没给 Retry-After 时，该账号冷却这么久（0–600）',
      autoCheckinTitle: '自动签到',
      save: '保存',
      saved: '已保存',
    }

    var en = {
      freeToken: 'Free models',
      composerEntry: 'TokenBank account',
      balanceTotal: 'Total balance across accounts',
      openSite: 'Open site',
      close: 'Close',
      back: 'Back',
      more: 'More',
      checkin: 'Check in',
      checkinBusy: 'Checking in…',
      checkinDone: 'Checked in',
      checkinOk: 'Checked in',
      checkinStreak: '{n}-day streak',
      checkinAll: 'Check in all',
      checkinAllBusy: 'Checking in…',
      checkinAllDone: 'All checked in',
      checkinAllOk: '{n} accounts checked in',
      checkinAllPart: '{ok} ok, {fail} failed',
      checkinAllGain: '+${amount} total',
      autoCheckin: 'Auto',
      autoCheckinHint: 'Check in all accounts once a day at first launch',
      accountRemoved: 'Account removed',
      addAccount: '+ Add account',
      addAccountTitle: 'Add account',
      noAccounts: 'No accounts yet',
      expired: 'Expired',
      relogin: 'Sign in again',
      removeAccount: 'Remove account',
      switched: 'Account switched',
      switchKeyFailed: 'Switched, but writing the model key failed',
      modelLinked: 'Linked {n} models; use the model picker above the input to switch',
      modelListUpdated: 'Model list updated: {n} available models',
      nicknameSaved: 'Nickname updated',
      editNicknameTitle: 'Click to edit nickname, Enter to save',
      emailLocal: 'Account',
      email: 'Email',
      password: 'Password',
      code: 'Verification code',
      captcha: 'Captcha',
      captchaCode: 'Enter the captcha',
      captchaRefresh: "Can't read it? Try another",
      sendCode: 'Send code',
      codeSent: 'Code sent',
      codeInvalid: 'The code is incorrect or expired',
      register: 'Sign up',
      login: 'Sign in',
      registerTab: 'Sign up',
      loginTab: 'Sign in',
      settingsTitle: 'TokenBank',
      settingsDesc: 'Pool, routing tuning and gateway status',
      gatewayStatus: 'Gateway',
      gatewayAddress: 'Address',
      gatewayListening: 'Running',
      gatewayDown: 'Not listening',
      gatewayUpstream: 'Upstream',
      gatewayPool: 'Pool',
      gatewayServed: 'Forwarded',
      gatewaySwitched: 'Switched',
      gatewayWaited: 'Waited',
      gatewayLastPicked: 'Last picked',
      gatewayNone: 'None',
      gatewayCooldown: 'Cooling down',
      gatewayCooldownEmpty: 'No account is cooling down',
      gatewayReset: 'Clear cooldowns and cursor',
      copy: 'Copy',
      copied: 'Copied',
      poolTitle: 'Routing pool',
      poolHint: 'Only checked accounts take part in gateway round-robin. Unchecking keeps the account usable as the current one and still checks in.',
      poolEmpty: 'No accounts yet — sign in from the TokenBank panel first.',
      tuningTitle: 'Routing tuning',
      tuningHint: 'Takes effect on the next request, no restart needed.',
      retryRounds: 'Retry rounds',
      retryRoundsHint: 'After one pass over every account, retry this many more rounds (0–10)',
      maxWait: 'Max wait per round (s)',
      maxWaitHint: 'When every account is cooling down, wait at most this long before giving up with 429 (0–120)',
      cooldown: 'Cooldown (s)',
      cooldownHint: 'Used when upstream 429 carries no Retry-After (0–600)',
      autoCheckinTitle: 'Auto check-in',
      save: 'Save',
      saved: 'Saved',
    }


    var pageT = function (key) { return key }

    async function api(action, extra) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, extra || {})),
      })
      const payload = await response.json()
      if (!payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || 'request failed')
      }
      return payload
    }

    /** TokenBank 品牌图标:照官方 favicon.svg(web/public/favicon.svg)1:1 重绘。 */
    function TokenBankLogo(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      },
        h('rect', { width: 64, height: 64, rx: 16, fill: '#ff4f1f' }),
        h('g', { fill: '#f5f5f2' },
          h('path', { d: 'M13.3 25.8L32 16.4L50.7 25.8V29.3H13.3Z' }),
          h('rect', { x: 13.3, y: 32.9, width: 12.9, height: 18.2, rx: 2.2 }),
          h('rect', { x: 37.8, y: 32.9, width: 12.9, height: 18.2, rx: 2.2 }),
          h('rect', { x: 13.3, y: 47.1, width: 37.3, height: 4, rx: 2 }),
        ),
      )
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
      background: '#ff4f1f',
      borderColor: '#ff4f1f',
      color: '#ffffff',
      fontWeight: 600,
    })
    var labelStyle = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
    var errorStyle = {
      fontSize: 12, color: 'var(--dsw-alias-label-critical, #d03050)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }

    function Field(props) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: labelStyle }, props.label),
        props.children,
      )
    }

    /* ── model-list integration ─────────────────────────────────────────── */

    var MODEL_NS = 'llm-pi-ai'
    var MODEL_ROUTE = 'tokenbank'
    var KEY_REF = 'TOKENBANK_API_KEY'

    /* ── 模块②③共享:轻量 store + shell.overlay 弹层 ───────────────────── */

    var runtimeCtx = null // apply() 注入,overlay 里 addProviderToModels 用
    var notifySeq = 0
    var tbStore = {
      state: { authOpen: false, authMode: 'register', panelView: 'main', panelSeq: 0, notify: null, loggedIn: null, anchor: null, balanceSeq: 0 },
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

    /** 让底部余额 pill 重新拉一次合计（面板里签到/切号/移除账号后调用）。 */
    function bumpBalance() {
      tbStore.set({ balanceSeq: (tbStore.state.balanceSeq || 0) + 1 })
    }

    /**
     * 共享的 status 拉取。BalancePill 与 ComposerEntry 都常驻，各自 mount 都拉
     * 一次的话启动就是 2~3 次 status，而每次 status 都会 tb.me() 打一次门户。
     * 这里做两级去重：飞行中的请求直接复用，1 秒内的结果直接给缓存。
     */
    var statusSync = { inflight: null, at: 0, data: null }
    function fetchStatus() {
      var now = Date.now()
      if (statusSync.inflight) return statusSync.inflight
      if (statusSync.data && now - statusSync.at < 1000) return Promise.resolve(statusSync.data)
      statusSync.inflight = api('status')
        .then(function (data) {
          statusSync.data = data
          statusSync.at = Date.now()
          tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
          return data
        })
        .then(
          function (data) { statusSync.inflight = null; return data },
          function (error) { statusSync.inflight = null; throw error },
        )
      return statusSync.inflight
    }

    function useTbStore() {
      var snap = React.useState(tbStore.get)
      React.useEffect(function () {
        return tbStore.subscribe(function () { snap[1](tbStore.get()) })
      }, [])
      return snap[0]
    }

    function BalancePill() {
      var snap = useTbStore()
      var st = React.useState(null)
      // 全部账号余额的合计（nano 美元）。null 表示还没拿到或全都没读到。
      var total = React.useState(null)
      var pullTotal = function (stopped) {
        api('accounts-balance').then(function (res) {
          if (stopped()) return
          var map = (res && res.balances) || {}
          var sum = 0
          var any = false
          Object.keys(map).forEach(function (id) {
            var nano = map[id]
            if (typeof nano === 'number') { sum += nano; any = true }
          })
          total[1](any ? sum : null)
        }).catch(function () {})
      }
      React.useEffect(function () {
        var stopped = false
        fetchStatus().then(function (data) {
          if (!stopped) st[1](data)
        }).catch(function () {})
        pullTotal(function () { return stopped })
        return function () { stopped = true }
      }, [])
      // 登录态变化、以及面板里做了会改动余额的操作（balanceSeq）都重拉一次。
      // 早先只依赖 loggedIn/authOpen，导致签到后底部数字不会立刻涨。
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        fetchStatus().then(function (data) { if (!stopped) st[1](data) }).catch(function () {})
        pullTotal(function () { return stopped })
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen, snap.balanceSeq])
      var flash = React.useState(false)
      var prev = React.useRef(false)
      React.useEffect(function () {
        if (!snap.loggedIn) { prev.current = false; return }
        // 仅「从未登录 → 登录」的跃迁触发一次;已标记过(本会话已提示)不再重亮
        if (!prev.current) {
          prev.current = true
          var seen = false
          try { seen = window.sessionStorage.getItem('tb-balance-flash-seen') === '1' } catch (e) {}
          if (!seen) {
            flash[1](true)
            try { window.sessionStorage.setItem('tb-balance-flash-seen', '1') } catch (e) {}
          }
        }
      }, [snap.loggedIn])
      var onClick = function (e) {
        flash[1](false)
        var rect = e && e.currentTarget && e.currentTarget.getBoundingClientRect()
        tbStore.set({
          authOpen: true, authMode: 'login',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      if (!snap.loggedIn) return null
      // 显示全部账号余额合计；单个账号时与原来的当前账号余额等价。
      var bal = typeof total[0] === 'number' ? '$ ' + (total[0] / 1e9).toFixed(2) : null
      var count = st[0] && st[0].accounts ? st[0].accounts.length : 0
      return h('button', {
        type: 'button', id: 'tb-balance-pill',
        title: count > 1 ? pageT('balanceTotal') + ' · ' + count : pageT('composerEntry'),
        className: (flash[0] ? 'tb-balance-flash ' : '') + (snap.authOpen ? 'tb-balance-open' : ''),
        onClick: onClick,
        style: {
          boxSizing: 'border-box', borderRadius: 6, maxWidth: '100%',
          color: 'var(--dsw-alias-label-tertiary, #a0a3a8)', font: 'inherit',
          fontVariantNumeric: 'tabular-nums', lineHeight: 'inherit', whiteSpace: 'nowrap',
          background: 'transparent', border: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          fontSize: 14, cursor: 'pointer',
        },
      },
        bal || '—',
      )
    }

    /** 输入框工具行、模型选择器左侧的紧凑入口按钮。 */
    function ComposerEntry() {
      var snap = useTbStore()
      React.useEffect(function () {
        var stopped = false
        fetchStatus().catch(function () {})
        return function () { stopped = true }
      }, [])
      var onClick = function (e) {
        var rect = e && e.currentTarget && e.currentTarget.getBoundingClientRect()
        tbStore.set({
          authOpen: true, authMode: 'register',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      // 登录态入口整个不渲染(余额在底部状态栏 pill),否则会残留一个空胶囊。
      // 判断所需的 loggedIn 由上面那个 effect 写入 tbStore，这里不再重复拉取：
      // 本组件是常驻的，每次请求 status 都要 tb.me() 打一次门户，多发无益。
      if (snap.loggedIn) return null
      return h('button', {
        type: 'button',
        id: 'tb-entry-btn',
        className: snap.authOpen ? 'tb-entry-open' : '',
        title: pageT('composerEntry'), 'aria-label': pageT('composerEntry'),
        onClick: onClick,
        style: {
          display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative',
          border: 'none', background: 'transparent', padding: 0, boxSizing: 'border-box',
        },
      },
        h('span', { className: 'tb-free-tag', style: { fontSize: 11, lineHeight: '20px', padding: '0 8px', borderRadius: 999, color: '#fff', background: '#ff4f1f', fontWeight: 600, letterSpacing: 0.3 } }, pageT('freeToken')),
      )
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
          await api('profile-update', { displayName: next })
          busy[1](false); editing[1](false)
          tbStore.set({ notify: { kind: 'success', title: pageT('nicknameSaved'), detail: next } })
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
          border: '1px solid #ff4f1f', background: 'var(--dsw-alias-bg-base)',
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
      if (map[domain]) return map[domain]
      return domain ? 'https://mail.' + domain : ''
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
      var balText = typeof balance === 'number'
        ? '$' + (balance / 1e9).toFixed(2)
        : (acc.expired ? pageT('expired') : '—')
      return h('div', {
        style: {
          position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 7px', borderRadius: 8,
          cursor: acc.active ? 'default' : 'pointer',
          background: acc.active ? 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))' : 'transparent',
        },
        onClick: function () { if (!acc.active) props.onSwitch(acc.id) },
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
            background: acc.active ? '#ff4f1f' : 'transparent',
            border: acc.active ? 'none' : '1px solid var(--dsw-alias-border-l2, #c9ccd1)',
          },
        }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {
            style: {
              fontSize: 12.5, fontWeight: acc.active ? 600 : 400, lineHeight: 1.35,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, acc.displayName || acc.email),
          h('div', {
            style: {
              fontSize: 10.5, lineHeight: 1.35, color: 'var(--dsw-alias-label-secondary, #888)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, acc.email),
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
            onClick: function (e) { e.stopPropagation(); menu[1](false); props.onRelogin(acc.id) },
          }, pageT('relogin')),
          h('button', {
            type: 'button', style: Object.assign({}, menuItemStyle, { color: '#d03050' }),
            onClick: function (e) { e.stopPropagation(); menu[1](false); props.onRemove(acc.id) },
          }, pageT('removeAccount')),
        ) : null,
      )
    }

    /**
     * 面板本体（shell.overlay）。两种视图：
     *   main — 昵称/邮箱、余额合计、签到 + 自动签到、账号列表（切换/重新登录/
     *          移除）、底部「添加账号」。账号列表已并入主视图，不再单独一页。
     *   add  — 注册/登录表单（复用 AuthCard）
     * 未登录时无论 view 是什么都直接显示 AuthCard。
     */
    function EntryOverlay() {
      var snap = useTbStore()
      var st = React.useState(null)            // status 载荷
      var checkin = React.useState({ busy: false, done: false, streak: 0 })
      var allCheckin = React.useState({ busy: false, done: false })
      var autoCheckin = React.useState({ enabled: false, todayDone: false, busy: false })
      var balanceGain = React.useState(null)   // 余额旁 +$x 浮现动画
      var balances = React.useState({})        // id → nano | null
      var innerToast = React.useState(null)
      var view = snap.panelView || 'main'

      // 打开时拉 status + 签到状态，之后每 5 分钟刷新签到状态
      // （签到每天只变一次，轮询太勤只会白打门户接口）
      React.useEffect(function () {
        if (!snap.authOpen) return
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data)
          tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        var pull = function () {
          api('checkin-status').then(function (res) {
            var ci = res && res.checkin
            if (stopped || !ci || !ci.enabled) return
            checkin[1]({ busy: false, done: Boolean(ci.checked_today), streak: Number(ci.streak) || 0 })
          }).catch(function () {})
        }
        pull()
        // 签到状态一天最多变一次，60 秒轮询纯属浪费：面板开着时 5 分钟看一眼就够。
        // （这是门户接口，不占 access key 额度，但也别白打。）
        var timer = window.setInterval(pull, 300000)
        return function () { stopped = true; window.clearInterval(timer) }
      }, [snap.authOpen, snap.panelSeq])

      // 主视图也要显示账号列表，所以打开时就拉各账号余额（不必等切到账号页）。
      // 依赖 activeId 是必要的：登录成功后 status 才带回 accounts，靠它触发首次拉取；
      // 但 st[0] 初始为 null，直接跑会白打一次空请求，所以等 status 回来再进。
      React.useEffect(function () {
        if (!snap.authOpen) return
        if (!st[0]) return
        var stopped = false
        api('accounts-balance').then(function (res) {
          if (!stopped && res && res.balances) balances[1](res.balances)
        }).catch(function () {})
        return function () { stopped = true }
      }, [snap.authOpen, snap.panelSeq, st[0] && st[0].activeId])

      // 自动签到开关（持久化在 host 的凭据记录里，重装/重启都保留）
      React.useEffect(function () {
        if (!snap.authOpen) return
        var stopped = false
        api('auto-checkin-get').then(function (res) {
          if (stopped || !res || !res.autoCheckin) return
          autoCheckin[1]({
            enabled: Boolean(res.autoCheckin.enabled),
            todayDone: Boolean(res.autoCheckin.todayDone),
            busy: false,
          })
        }).catch(function () {})
        return function () { stopped = true }
      }, [snap.authOpen, snap.panelSeq])

      if (!snap.authOpen || !runtimeCtx) return null

      var data = st[0]
      var loggedIn = Boolean(data && data.loggedIn)
      var portal = (data && data.portalUrl) || 'https://bank.skillpie.cn'
      var anchor = snap.anchor || { right: window.innerWidth - 16, top: window.innerHeight - 80 }
      var close = function () { tbStore.set({ authOpen: false, panelView: 'main' }) }

      /** 重新拉一次 status（切换/移除/签到后统一走这里）。 */
      var refresh = async function () {
        var fresh = await api('status').catch(function () { return null })
        if (fresh) {
          st[1](fresh)
          tbStore.set({ loggedIn: Boolean(fresh.loggedIn), portalUrl: fresh.portalUrl })
        }
        // 面板里任何会改动余额的动作（签到/一键签到/切号/移除）最后都走这里，
        // 顺手通知底部 pill 重算合计，否则它只在 mount 时算一次，数字会陈旧。
        bumpBalance()
        return fresh
      }

      var toast = function (text, error) { innerToast[1]({ text: text, error: Boolean(error) }) }

      var doCheckin = async function () {
        if (checkin[0].busy) return
        checkin[1](Object.assign({}, checkin[0], { busy: true }))
        try {
          var res = await api('checkin-do')
          var ci = (res && res.checkin) || {}
          checkin[1]({ busy: false, done: Boolean(ci.checked_today), streak: Number(ci.streak) || 0 })
          if (ci.checked_today) {
            var before = data && data.account && typeof data.account.balance_nano_usd === 'number'
              ? data.account.balance_nano_usd : null
            var fresh = await refresh()
            var gain = null
            if (fresh && fresh.account && typeof fresh.account.balance_nano_usd === 'number' && before != null) {
              if (fresh.account.balance_nano_usd > before) {
                gain = ((fresh.account.balance_nano_usd - before) / 1e9).toFixed(2)
              }
            }
            // gain 为 null 表示读不到真实收益（例如 status 没带回余额），
            // 这时不要编一个「+$0.10」出来骗人：动画与文案都不带金额。
            if (gain !== null) {
              balanceGain[1]({ amount: gain, ts: Date.now() })
              window.setTimeout(function () { balanceGain[1](null) }, 8000)
            }
            var streakText = ci.streak > 1 ? ' ' + pageT('checkinStreak').replace('{n}', String(ci.streak)) : ''
            var gainText = gain !== null ? ' +$' + gain : ''
            tbStore.set({ notify: { kind: 'success', title: pageT('checkinOk') + gainText + streakText, detail: '' } })
          }
        } catch (err) {
          checkin[1](Object.assign({}, checkin[0], { busy: false }))
          toast(String(err.message || err), true)
        }
      }

      /** 一键给所有可用账号签到。 */
      var doCheckinAll = async function () {
        if (allCheckin[0].busy) return
        allCheckin[1]({ busy: true, done: false })
        try {
          var res = await api('checkin-all')
          var ok = Number(res && res.checkedCount) || 0
          var fail = Number(res && res.failedCount) || 0
          var already = Number(res && res.alreadyCount) || 0
          var totalNano = Number(res && res.totalNano) || 0
          allCheckin[1]({ busy: false, done: fail === 0 && ok + already > 0 })
          await refresh()
          var freshBal = await api('accounts-balance').catch(function () { return null })
          if (freshBal && freshBal.balances) balances[1](freshBal.balances)
          // 以当前账号的真实状态为准，别用「全部签完」去猜单个账号
          var ci = await api('checkin-status').catch(function () { return null })
          var now = (ci && ci.checkin) || null
          checkin[1]({
            busy: false,
            done: Boolean(now && now.checked_today),
            streak: Number(now && now.streak) || 0,
          })

          var title
          if (fail > 0) {
            title = pageT('checkinAllPart').replace('{ok}', String(ok + already)).replace('{fail}', String(fail))
          } else if (ok === 0) {
            title = pageT('checkinAllDone')
          } else {
            title = pageT('checkinAllOk').replace('{n}', String(ok))
          }
          var detail = totalNano > 0
            ? pageT('checkinAllGain').replace('{amount}', (totalNano / 1e9).toFixed(2))
            : ''
          if (totalNano > 0) {
            balanceGain[1]({ amount: (totalNano / 1e9).toFixed(2), ts: Date.now() })
            window.setTimeout(function () { balanceGain[1](null) }, 8000)
          }
          tbStore.set({ notify: { kind: fail > 0 ? 'error' : 'success', title: title, detail: detail } })
        } catch (err) {
          allCheckin[1]({ busy: false, done: false })
          toast(String(err.message || err), true)
        }
      }

      /** 开关自动签到。打开时 host 会立刻补一次今天的签到。 */
      var doToggleAuto = async function () {
        if (autoCheckin[0].busy) return
        var next = !autoCheckin[0].enabled
        autoCheckin[1]({ enabled: autoCheckin[0].enabled, todayDone: autoCheckin[0].todayDone, busy: true })
        try {
          var res = await api('auto-checkin-set', { enabled: next })
          autoCheckin[1]({
            enabled: Boolean(res && res.enabled),
            todayDone: Boolean(res && res.todayDone),
            busy: false,
          })
          var run = res && res.run
          if (next && run && Array.isArray(run.results) && run.results.length > 0) {
            var ok = Number(run.checkedCount) || 0
            var totalNano = Number(run.totalNano) || 0
            if (totalNano > 0) {
              balanceGain[1]({ amount: (totalNano / 1e9).toFixed(2), ts: Date.now() })
              window.setTimeout(function () { balanceGain[1](null) }, 8000)
            }
            tbStore.set({
              notify: {
                kind: 'success',
                title: ok > 0
                  ? pageT('checkinAllOk').replace('{n}', String(ok))
                  : pageT('checkinAllDone'),
                detail: totalNano > 0
                  ? pageT('checkinAllGain').replace('{amount}', (totalNano / 1e9).toFixed(2))
                  : '',
              },
            })
            await refresh()
            var freshBal = await api('accounts-balance').catch(function () { return null })
            if (freshBal && freshBal.balances) balances[1](freshBal.balances)
            var ci = await api('checkin-status').catch(function () { return null })
            var now = (ci && ci.checkin) || null
            checkin[1]({ busy: false, done: Boolean(now && now.checked_today), streak: Number(now && now.streak) || 0 })
          }
        } catch (err) {
          autoCheckin[1]({ enabled: autoCheckin[0].enabled, todayDone: autoCheckin[0].todayDone, busy: false })
          toast(String(err.message || err), true)
        }
      }

      var doSwitch = async function (id) {
        try {
          var res = await api('switch', { id: id })
          await refresh()
          var freshBal = await api('accounts-balance').catch(function () { return null })
          if (freshBal && freshBal.balances) balances[1](freshBal.balances)
          checkin[1]({ busy: false, done: false, streak: 0 })
          allCheckin[1]({ busy: false, done: false })
          tbStore.set({
            panelView: 'main',
            notify: {
              kind: res && res.keySynced === false ? 'error' : 'success',
              title: res && res.keySynced === false ? pageT('switchKeyFailed') : pageT('switched'),
              detail: '',
            },
          })
        } catch (err) { toast(String(err.message || err), true) }
      }

      var doRemove = async function (id) {
        try {
          await api('remove', { id: id })
          var fresh = await refresh()
          var freshBal = await api('accounts-balance').catch(function () { return null })
          if (freshBal && freshBal.balances) balances[1](freshBal.balances)
          if (!fresh || !fresh.loggedIn) tbStore.set({ panelView: 'main' })
          toast(pageT('accountRemoved'))
        } catch (err) { toast(String(err.message || err), true) }
      }

      var doRelogin = function () {
        tbStore.set({ panelView: 'add', authMode: 'login' })
      }

      /* ── 内容区 ── */
      var body
      if (!loggedIn) {
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h(AuthCard, {
            mode: snap.authMode,
            setMode: function (mode) { tbStore.set({ authMode: mode }) },
            onAuthed: async function () {
              var me = await refresh()
              if (!me || !me.loggedIn) return
              tbStore.set({ panelView: 'main' })
              try {
                var res = await syncModelsFromGateway()
                if (res) {
                  modelSyncState.lastAt = Date.now()
                  modelSyncState.lastCount = res.count
                  tbStore.set({ notify: { kind: 'success', title: pageT('modelLinked').replace('{n}', String(res.count)), detail: '' } })
                }
              } catch (err) { /* 模型接入失败不阻塞登录 */ }
            },
          }),
        )
      } else if (view === 'add') {
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('button', {
              type: 'button', title: pageT('back'), 'aria-label': pageT('back'),
              style: {
                width: 20, height: 20, padding: 0, border: 'none', borderRadius: 5,
                background: 'transparent', cursor: 'pointer',
                color: 'var(--dsw-alias-label-secondary, #999)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              },
              onClick: function () { tbStore.set({ panelView: 'main' }) },
            },
              h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                h('path', { d: 'M15 18l-6-6 6-6' }))),
            h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, pageT('addAccountTitle')),
          ),
          h(AuthCard, {
            mode: snap.authMode,
            setMode: function (mode) { tbStore.set({ authMode: mode }) },
            onAuthed: async function () {
              var me = await refresh()
              if (!me || !me.loggedIn) return
              // 账号列表已并进主视图（5674338），这里回到 main。
              tbStore.set({ panelView: 'main' })
              var freshBal = await api('accounts-balance').catch(function () { return null })
              if (freshBal && freshBal.balances) balances[1](freshBal.balances)
              try {
                var res = await syncModelsFromGateway()
                if (res) {
                  modelSyncState.lastAt = Date.now()
                  modelSyncState.lastCount = res.count
                  tbStore.set({ notify: { kind: 'success', title: pageT('modelLinked').replace('{n}', String(res.count)), detail: '' } })
                }
              } catch (err) { /* 模型接入失败不阻塞登录 */ }
            },
          }),
        )
      } else {
        var balanceText = data && data.account && typeof data.account.balance_nano_usd === 'number'
          ? '$' + (data.account.balance_nano_usd / 1e9).toFixed(2)
          : '—'
        var accountList = (data && data.accounts) || []
        var accountCount = accountList.length
        body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
            h(EditableNickname, {
              name: (data.user && (data.user.display_name || data.user.name)) || '',
              email: data.email || '',
            }),
            h('span', {
              style: {
                fontSize: 11, color: 'var(--dsw-alias-label-secondary, #888)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
              },
            }, data.email || ''),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
            h('div', {
              style: {
                position: 'relative', display: 'inline-block', fontSize: 18, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              },
            },
              balanceText,
              balanceGain[0] ? h('span', {
                key: 'gain-' + balanceGain[0].ts,
                style: {
                  position: 'absolute', left: '100%', top: 0, marginLeft: 6, whiteSpace: 'nowrap',
                  fontSize: 12, fontWeight: 700, color: '#d03050', pointerEvents: 'none',
                  animation: 'tb-balance-gain 1s ease-out both',
                },
              }, '+' + balanceGain[0].amount) : null),
            // 一键签到：多账号时才出现
            accountCount > 1 ? h('button', {
              type: 'button',
              disabled: allCheckin[0].busy,
              title: pageT('checkinAll'),
              style: Object.assign({}, buttonStyle, {
                height: 26, padding: '0 10px', fontSize: 12,
                ...(allCheckin[0].done && !allCheckin[0].busy
                  ? { color: 'var(--dsw-alias-label-secondary, #888)' }
                  : {}),
              }),
              onClick: doCheckinAll,
            }, allCheckin[0].busy
              ? pageT('checkinAllBusy')
              : (allCheckin[0].done ? pageT('checkinAllDone') : pageT('checkinAll'))) : null,
          ),
          // 账号列表：直接铺在主视图里，一行一个，多了就滚
          h('div', {
            style: {
              display: 'flex', flexDirection: 'column', gap: 1,
              maxHeight: 168, overflowY: 'auto', overflowX: 'hidden',
              margin: '0 -4px', padding: '0 4px',
            },
          },
            accountList.length === 0
              ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #888)', padding: '4px 2px' } }, pageT('noAccounts'))
              : accountList.map(function (acc) {
                  return h(AccountRow, {
                    key: acc.id,
                    account: acc,
                    balance: balances[0] ? balances[0][acc.id] : undefined,
                    onSwitch: doSwitch,
                    onRemove: doRemove,
                    onRelogin: doRelogin,
                  })
                }),
            h('button', {
              type: 'button',
              style: Object.assign({}, buttonStyle, {
                height: 26, fontSize: 12, justifyContent: 'center', marginTop: 4,
                borderStyle: 'dashed', color: 'var(--dsw-alias-label-secondary, #888)',
              }),
              onClick: function () { tbStore.set({ panelView: 'add', authMode: 'register' }) },
            }, pageT('addAccount')),
          ),
          // 签到行：当前账号签到（签完变灰）+ 自动签到开关
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
            h('button', {
              type: 'button',
              disabled: checkin[0].done || checkin[0].busy,
              style: Object.assign({}, checkin[0].done ? buttonStyle : primaryButtonStyle, {
                flex: 1, height: 28, padding: '0 12px', fontSize: 12, justifyContent: 'center',
                ...(checkin[0].done ? { color: 'var(--dsw-alias-label-secondary, #888)', cursor: 'default' } : {}),
              }),
              onClick: checkin[0].done ? undefined : doCheckin,
            }, checkin[0].busy ? pageT('checkinBusy') : (checkin[0].done ? pageT('checkinDone') : pageT('checkin'))),
            // 自动签到：每天首次打开 DSH 时后台跑一次（门户接口，不占模型额度）
            h('button', {
              type: 'button',
              disabled: autoCheckin[0].busy,
              title: pageT('autoCheckinHint'),
              style: Object.assign({}, buttonStyle, {
                height: 28, padding: '0 10px', fontSize: 12, gap: 5, flex: 'none',
                ...(autoCheckin[0].enabled
                  ? { borderColor: '#ff4f1f', color: '#ff4f1f' }
                  : {}),
              }),
              onClick: doToggleAuto,
            },
              h('span', {
                style: {
                  width: 6, height: 6, borderRadius: 999, flex: 'none',
                  background: autoCheckin[0].enabled ? '#ff4f1f' : 'var(--dsw-alias-border-l2, #c9ccd1)',
                },
              }),
              pageT('autoCheckin'),
            ),
          ),
          innerToast[0] ? h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
              borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1, #f7f7f8)', fontSize: 12,
            },
          },
            h('span', { style: { color: innerToast[0].error ? '#d03050' : '#22a04a', fontWeight: 700 } },
              innerToast[0].error ? '✕' : '✓'),
            h('span', { style: { flex: 1, wordBreak: 'break-all' } }, innerToast[0].text),
            h('button', {
              type: 'button',
              style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary, #999)', padding: 0, fontSize: 12 },
              onClick: function () { innerToast[1](null) },
            }, pageT('close')),
          ) : null,
        )
      }

      return h('div', { style: { position: 'fixed', inset: 0, zIndex: 1999 } },
        h('div', { style: { position: 'fixed', inset: 0, zIndex: -1 }, onClick: close }),
        h('div', {
          style: {
            position: 'fixed', width: PANEL_WIDTH, maxWidth: 'calc(100vw - 16px)',
            right: Math.max(8, window.innerWidth - anchor.right),
            bottom: Math.max(8, window.innerHeight - anchor.top + 8),
            maxHeight: 520, overflow: 'auto',
            background: 'var(--dsw-menu-surface-fill)',
            backdropFilter: 'var(--dsw-menu-backdrop-filter)',
            WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
            color: 'var(--dsw-alias-label-primary)',
            borderRadius: 'var(--dsw-radius-md, 10px)', padding: 14,
            '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-elevation-prominent)',
            border: '1px solid var(--dsw-alias-border-l1)',
          },
          onClick: function (e) { e.stopPropagation() },
        },
          // 标题行
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
            h(TokenBankLogo, { size: 16 }),
            h('a', {
              href: portal, target: '_blank', rel: 'noopener noreferrer',
              style: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer', textDecoration: 'none' },
              'aria-label': 'TokenBank',
            }, h('span', {
              className: 'tb-wordmark',
              style: {
                fontFamily: "'Frizon','FrizonLocal',sans-serif", fontSize: 17, fontWeight: 400,
                letterSpacing: 0.5, lineHeight: 1, color: '#111111', position: 'relative', top: -1, left: -1,
              },
            }, 'TOKENBANK')),
            h('a', {
              href: portal, target: '_blank', rel: 'noopener noreferrer',
              title: pageT('openSite'), 'aria-label': pageT('openSite'),
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 17, height: 17, borderRadius: 5, marginLeft: -4, position: 'relative', top: 1,
                color: 'var(--dsw-alias-label-secondary, #888)', background: 'transparent',
                border: 'none', outline: 'none', cursor: 'pointer', textDecoration: 'none',
              },
            },
              h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
                h('polyline', { points: '15 3 21 3 21 9' }),
                h('line', { x1: 10, y1: 14, x2: 21, y2: 3 }))),
            h('span', { style: { flex: 1 } }),
          ),
          body,
        ),
      )
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

    function Toggle(props) {
      var on = props.checked === true
      var off = props.disabled === true
      return h('button', {
        type: 'button', role: 'switch', 'aria-checked': on,
        'aria-label': props.label || undefined,
        disabled: off,
        onClick: props.onChange,
        style: {
          flex: 'none', width: 34, height: 20, borderRadius: 999, padding: 0,
          position: 'relative', boxSizing: 'border-box',
          cursor: off ? 'default' : 'pointer',
          border: '1px solid ' + (on ? '#ff4f1f' : 'var(--dsw-alias-border-l2, #c9ccd1)'),
          background: on ? '#ff4f1f' : 'transparent',
          opacity: off ? 0.55 : 1,
          transition: 'background .15s ease, border-color .15s ease',
        },
      }, h('span', {
        style: {
          position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999,
          background: on ? '#ffffff' : 'var(--dsw-alias-label-secondary, #999)',
          transition: 'left .15s ease',
        },
      }))
    }

    function NumInput(props) {
      return h('input', {
        type: 'number', inputMode: 'numeric',
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
    function SettingsPage(props) {
      var close = props && typeof props.close === 'function' ? props.close : function () {}
      var settings = React.useState(null)
      var accounts = React.useState([])
      var balances = React.useState({})
      var stats = React.useState(null)
      var form = React.useState(null)
      var flag = React.useState({ busy: false, error: '', ok: false })
      var copied = React.useState(false)

      var load = function () {
        Promise.all([
          api('settings-get'),
          api('status').catch(function () { return null }),
          api('gateway-status').catch(function () { return null }),
          api('accounts-balance').catch(function () { return null }),
        ]).then(function (res) {
          settings[1](res[0])
          if (res[1]) accounts[1](res[1].accounts || [])
          stats[1](res[2] || null)
          if (res[3] && res[3].balances) balances[1](res[3].balances)
          var g = (res[0] && res[0].gateway) || {}
          form[1]({
            requestRetryRounds: g.requestRetryRounds,
            maxRetryIntervalMs: g.maxRetryIntervalMs,
            cooldownMs: g.cooldownMs,
          })
        }).catch(function (e) {
          flag[1]({ busy: false, error: String((e && e.message) || e), ok: false })
        })
      }
      React.useEffect(function () { load() }, [])

      // 冷却剩余时间会自己走，5s 刷一次状态就够。只读本地，不碰上游。
      // inflight 守卫：请求比间隔慢时不再叠加下一次，避免慢响应把请求堆起来。
      React.useEffect(function () {
        var stopped = false
        var inflight = false
        var id = window.setInterval(function () {
          if (stopped || inflight) return
          inflight = true
          api('gateway-status')
            .then(function (data) { if (!stopped) stats[1](data) })
            .catch(function () {})
            .then(function () { inflight = false })
        }, 5000)
        return function () { stopped = true; window.clearInterval(id) }
      }, [])

      var patch = function (next) {
        form[1](function (prev) { return Object.assign({}, prev || {}, next) })
      }

      var saveTuning = function () {
        var f = form[0]
        if (!f) return
        // 空输入框不能当成 0：Number('') === 0，直接提交会把重试轮数/等待/冷却
        // 全部清成 0，而 cooldownMs=0 正是网关热循环的触发条件。空值一律
        // 回落到上一次已知的合法值（host 端还会再 clamp 一次）。
        var known = (settings[0] && settings[0].gateway) || {}
        var pickNum = function (key) {
          var raw = f[key]
          var n = Number(raw)
          if (raw === '' || raw === null || raw === undefined || !Number.isFinite(n)) {
            return typeof known[key] === 'number' ? known[key] : 0
          }
          return n
        }
        var payload = {
          requestRetryRounds: pickNum('requestRetryRounds'),
          maxRetryIntervalMs: pickNum('maxRetryIntervalMs'),
          cooldownMs: pickNum('cooldownMs'),
        }
        flag[1]({ busy: true, error: '', ok: false })
        api('settings-set', { gateway: payload }).then(function (res) {
          settings[1](function (prev) { return prev ? Object.assign({}, prev, { gateway: res.gateway }) : prev })
          form[1]({
            requestRetryRounds: res.gateway.requestRetryRounds,
            maxRetryIntervalMs: res.gateway.maxRetryIntervalMs,
            cooldownMs: res.gateway.cooldownMs,
          })
          flag[1]({ busy: false, error: '', ok: true })
        }).catch(function (e) {
          flag[1]({ busy: false, error: String((e && e.message) || e), ok: false })
        })
      }

      var togglePool = function (account) {
        var next = account.pool === false
        // 乐观更新：勾选是即时反馈的开关，失败再回滚。
        accounts[1](function (list) {
          return list.map(function (item) {
            return item.id === account.id ? Object.assign({}, item, { pool: next }) : item
          })
        })
        api('account-pool', { id: account.id, pool: next })
          .then(function () { return api('settings-get') })
          .then(function (data) {
            settings[1](data)
            flag[1]({ busy: false, error: '', ok: false })
          })
          .catch(function (e) {
            accounts[1](function (list) {
              return list.map(function (item) {
                return item.id === account.id ? Object.assign({}, item, { pool: !next }) : item
              })
            })
            flag[1]({ busy: false, error: String((e && e.message) || e), ok: false })
          })
      }

      var toggleAuto = function () {
        var s = settings[0]
        var next = !(s && s.autoCheckin && s.autoCheckin.enabled)
        flag[1]({ busy: true, error: '', ok: false })
        api('auto-checkin-set', { enabled: next })
          .then(function () { return api('settings-get') })
          .then(function (data) {
            settings[1](data)
            flag[1]({ busy: false, error: '', ok: true })
          })
          .catch(function (e) { flag[1]({ busy: false, error: String((e && e.message) || e), ok: false }) })
      }

      var resetGateway = function () {
        api('gateway-reset')
          .then(function () { return Promise.all([api('gateway-status'), api('settings-get')]) })
          .then(function (res) {
            stats[1](res[0])
            settings[1](res[1])
            flag[1]({ busy: false, error: '', ok: true })
          })
          .catch(function (e) { flag[1]({ busy: false, error: String((e && e.message) || e), ok: false }) })
      }

      var copy = function (text) {
        var done = function () {
          copied[1](true)
          window.setTimeout(function () { copied[1](false) }, 1500)
        }
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            // 只有真的写进剪贴板才显示「已复制」：早先是先置 true 再写，
            // 权限被拒时界面会骗人说复制成功了。
            navigator.clipboard.writeText(text).then(done).catch(function () {})
            return
          }
        } catch (e) { /* 剪贴板不可用就作罢，地址就显示在旁边 */ }
      }

      var s = settings[0]
      var gw = stats[0] || null
      var port = (s && s.port) || ''
      var address = port ? 'http://127.0.0.1:' + port : ''
      var f = form[0] || (s && s.gateway) || {}
      var cooldowns = (gw && gw.cooldowns) || {}
      var cooling = Object.keys(cooldowns).filter(function (id) { return cooldowns[id] > 0 })
      var nameOf = function (id) {
        var hit = accounts[0].find(function (item) { return item.id === id })
        return hit ? (hit.displayName || hit.email || id) : id
      }
      var balOf = function (id) {
        var nano = balances[0][id]
        return typeof nano === 'number' ? '$' + (nano / 1e9).toFixed(2) : ''
      }
      var secOf = function (ms) { return Math.max(0, Math.round((Number(ms) || 0) / 1000)) }

      return h('div', { style: { display: 'flex', flexDirection: 'column', padding: '2px 2px 8px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
          h(TokenBankLogo, { size: 18 }),
          h('span', {
            className: 'tb-wordmark',
            style: {
              fontFamily: "'Frizon','FrizonLocal',sans-serif", fontSize: 18,
              lineHeight: 1, color: '#111111',
            },
          }, 'TOKENBANK'),
          h('span', { style: { flex: 1 } }),
          s && s.upstream ? h('a', {
            href: s.upstream, target: '_blank', rel: 'noopener noreferrer',
            style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', textDecoration: 'none' },
          }, pageT('openSite')) : null),
        h('div', { style: Object.assign({}, SEC_HINT, { marginBottom: 14 }) }, pageT('settingsDesc')),

        h(SettingsCard, {
          title: pageT('gatewayStatus'),
          extra: s ? h('span', {
            style: {
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              border: '1px solid ' + (s.listening
                ? 'var(--dsw-alias-state-success-primary, #22a04a)'
                : 'var(--dsw-alias-state-warn-primary, #d89614)'),
              color: s.listening
                ? 'var(--dsw-alias-state-success-primary, #22a04a)'
                : 'var(--dsw-alias-state-warn-primary, #d89614)',
            },
          }, s.listening ? pageT('gatewayListening') : pageT('gatewayDown')) : null,
        },
          h(SettingsRow, { label: pageT('gatewayAddress'), hint: s ? pageT('gatewayUpstream') + ' ' + s.upstream : '' },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: SEC_MONO }, address || '—'),
              h('button', {
                type: 'button', disabled: !address,
                onClick: function () { copy(address) },
                style: Object.assign({}, buttonStyle, { height: 24, padding: '0 8px', fontSize: 11.5, flex: 'none' }),
              }, copied[0] ? pageT('copied') : pageT('copy')))),
          h(SettingsRow, { label: pageT('gatewayPool') },
            h('span', { style: SEC_MONO }, (s ? s.poolCount : 0) + ' / ' + (s ? s.liveCount : 0))),
          h(SettingsRow, {
            label: pageT('gatewayServed'),
            hint: gw ? (pageT('gatewaySwitched') + ' ' + (gw.switched || 0) + ' · ' + pageT('gatewayWaited') + ' ' + (gw.waitedRounds || 0)) : '',
          }, h('span', { style: SEC_MONO }, gw && typeof gw.served === 'number' ? String(gw.served) : '0')),
          h(SettingsRow, { label: pageT('gatewayLastPicked') },
            h('span', { style: Object.assign({}, SEC_MONO, { maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) },
              gw && gw.lastPicked ? nameOf(gw.lastPicked) : pageT('gatewayNone'))),
          h(SettingsRow, { label: pageT('gatewayCooldown'), hint: cooling.length ? '' : pageT('gatewayCooldownEmpty') },
            h('span', { style: Object.assign({}, SEC_MONO, { textAlign: 'right' }) }, cooling.length
              ? cooling.map(function (id) { return nameOf(id) + ' ' + secOf(cooldowns[id]) + 's' }).join(' · ')
              : '—')),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 2 } },
            h('button', {
              type: 'button', onClick: resetGateway,
              style: Object.assign({}, buttonStyle, { height: 26, fontSize: 12 }),
            }, pageT('gatewayReset')))),

        h(SettingsCard, { title: pageT('poolTitle') },
          h('div', { style: SEC_HINT }, pageT('poolHint')),
          accounts[0].length === 0
            ? h('div', { style: SEC_HINT }, pageT('poolEmpty'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
              accounts[0].map(function (account) {
                return h('div', {
                  key: account.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                    opacity: account.expired ? 0.5 : 1,
                  },
                },
                  h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
                    h('span', {
                      style: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                    }, account.displayName || account.email),
                    h('span', {
                      style: Object.assign({}, SEC_HINT, { fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                    }, account.email)),
                  balOf(account.id)
                    ? h('span', { style: Object.assign({}, SEC_MONO, { color: 'var(--dsw-alias-label-secondary)' }) }, balOf(account.id))
                    : null,
                  h(Toggle, {
                    checked: account.pool !== false,
                    disabled: account.expired === true,
                    label: account.email,
                    onChange: function () { togglePool(account) },
                  }))
              }))),

        h(SettingsCard, { title: pageT('tuningTitle') },
          h('div', { style: SEC_HINT }, pageT('tuningHint')),
          h(SettingsRow, { label: pageT('retryRounds'), hint: pageT('retryRoundsHint') },
            h(NumInput, {
              value: f.requestRetryRounds, min: 0, max: 10,
              onChange: function (v) { patch({ requestRetryRounds: v === '' ? '' : Number(v) }) },
            })),
          h(SettingsRow, { label: pageT('maxWait'), hint: pageT('maxWaitHint') },
            h(NumInput, {
              value: Math.round((Number(f.maxRetryIntervalMs) || 0) / 1000), min: 0, max: 120,
              onChange: function (v) { patch({ maxRetryIntervalMs: (v === '' ? 0 : Number(v)) * 1000 }) },
            })),
          h(SettingsRow, { label: pageT('cooldown'), hint: pageT('cooldownHint') },
            h(NumInput, {
              value: Math.round((Number(f.cooldownMs) || 0) / 1000), min: 0, max: 600,
              onChange: function (v) { patch({ cooldownMs: (v === '' ? 0 : Number(v)) * 1000 }) },
            })),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 } },
            h('button', {
              type: 'button', disabled: flag[0].busy, onClick: saveTuning,
              style: Object.assign({}, primaryButtonStyle, { height: 28, fontSize: 12.5, opacity: flag[0].busy ? 0.6 : 1 }),
            }, flag[0].busy ? '…' : pageT('save')),
            flag[0].ok && !flag[0].error
              ? h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-state-success-primary, #22a04a)' } }, pageT('saved'))
              : null)),

        h(SettingsCard, { title: pageT('autoCheckinTitle') },
          h(SettingsRow, { label: pageT('autoCheckin'), hint: pageT('autoCheckinHint') },
            h(Toggle, {
              checked: Boolean(s && s.autoCheckin && s.autoCheckin.enabled),
              disabled: flag[0].busy,
              onChange: toggleAuto,
            }))),

        flag[0].error ? h('div', { style: Object.assign({}, errorStyle, { marginTop: 2 }) }, flag[0].error) : null,
      )
    }

    /**
     * 读 llm-pi-ai 命名空间的当前视图。settings.describe().namespaces 运行时是
     * **数组**(每项 { ns, value, revision, … };官方 ui-settings-models 用 Map 按 ns 取),
     * 之前按字符串下标取恒为 undefined → revision 一直是 undefined(等于无条件写)。
     */
    async function readModelNamespaceView(ctx) {
      const describe = await ctx.remote.settings.describe()
      const list = Array.isArray(describe?.namespaces) ? describe.namespaces : []
      const view = list.find(function (v) { return v && v.ns === MODEL_NS })
      return view && typeof view.revision === 'number' ? view : null
    }

    /** 只比较我们自己写入的字段(value 是「解析后」的值,可能带 schema 默认字段,不能整体 JSON 比)。 */
    function sameProviderProfile(a, b) {
      if (!a || !b) return false
      return a.displayName === b.displayName
        && a.apiKeyEnv === b.apiKeyEnv
        && a.api === b.api
        && a.baseURL === b.baseURL
        && JSON.stringify(a.models || []) === JSON.stringify(b.models || [])
        && JSON.stringify(a.retryPolicy || null) === JSON.stringify(b.retryPolicy || null)
    }

    /**
     * 网关 429 的冷却窗口实测 10~26 秒(见 probe-429:单 key 并发 3 时 retry-after=26)。
     * DSH 默认 retryPolicy 是 5 次 / 500ms 起 / 封顶 10s,累计只等约 15.5 秒,
     * 冷却还没走完重试就用尽了 —— 这才是 429 几乎必然失败的根因。
     * 这里把首次退避拉到 15s(覆盖 10~11s 的常规窗口),后续翻倍到 60s 封顶,
     * 第二次重试落在累计 45s 处,足以吃掉 26s 的深冷却。
     * 注意:maxRetries / maxRetryDelayMs 不能放在 provider 顶层(会被 rejectRemovedFields 拒),
     * 必须嵌在 retryPolicy 里,由 dsh-llm-retry 执行。
     */
    var GATEWAY_RETRY_POLICY = {
      mode: 'normal',
      maxRetries: 5,
      retryableCodes: ['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'],
      backoff: { initialDelayMs: 15000, maxDelayMs: 60000, jitterRatio: 0.15 },
    }

    /**
     * Mirror CustomProviderCard: store the credential reference, then set
     * providers.tokenbank fenced on the revision we just read. 与已存 profile
     * 完全一致时跳过 settings 写入(避免每次点击选择器都 bump revision 并触发
     * 一次宿主模型目录刷新)。Returns { ok, changed, count, conflict? }.
     */
    async function addProviderToModels(ctx, baseURL, models) {
      if (!models.accessKey) throw new Error('credentials.set: empty access key (gateway-models response lost the key field?)')
      // typed gateway 契约:credentials/set 就是两个位置参数 (ref, value)
      // (packages/api/remotes/lib/client.js zod: parameter_0=ref, parameter_1=value)
      // 每次都写:credentials 读路径不回传明文,无法 diff;一次写只触发一次目录刷新,代价可接受,
      // 且能自愈被用户在设置页删掉的引用。
      const stored = await ctx.remote.credentials.set(KEY_REF, models.accessKey)
      if (stored && stored.ok === false) throw new Error(stored.error?.message || 'failed to store key')

      const entries = (models.list || []).map(function (item) {
        if (typeof item === 'string') return { id: item }
        const entry = { id: item.id }
        // 别名一律留空 = 显示名与模型 id 一致(用户要求;display_name 不再下发)
        if (Array.isArray(item.input) && item.input.length > 0) entry.input = item.input
        // 推理档位:{off:null,low:'low',high:'high',...} → profile 的 reasoningEfforts
        if (item.reasoningEfforts && Object.keys(item.reasoningEfforts).length > 0) entry.reasoningEfforts = item.reasoningEfforts
        if (item.contextWindow) entry.contextWindow = item.contextWindow
        if (item.maxTokens) entry.maxTokens = item.maxTokens
        return entry
      })
      const profile = {
        displayName: 'TokenBank',
        apiKeyEnv: KEY_REF,
        // 分组渠道协议(claude→anthropic-messages);未知仍按 openai-completions
        api: models.protocol === 'anthropic-messages' || models.protocol === 'openai-responses'
          ? models.protocol
          : 'openai-completions',
        baseURL,
        models: entries,
        // 覆盖 DSH 默认的 15.5s 总退避,详见 GATEWAY_RETRY_POLICY 注释
        retryPolicy: GATEWAY_RETRY_POLICY,
      }
      const existing = await readModelNamespaceView(ctx)
      const current = existing ? existing.value?.providers?.[MODEL_ROUTE] : undefined
      if (sameProviderProfile(current, profile)) return { ok: true, changed: false, count: entries.length }
      const response = await ctx.remote.settings.mutate(MODEL_NS,
        [{ op: 'set', path: ['providers', MODEL_ROUTE], value: profile }], existing ? existing.revision : undefined)
      if (response && response.ok === false) {
        if (response.error?.code === 'settings/conflict') return { ok: false, conflict: true }
        throw new Error(response.error?.message || 'settings write refused')
      }
      return { ok: true, changed: true, count: entries.length }
    }

    /**
     * 拉一次网关模型目录并写入 provider(status → gateway-models → addProviderToModels)。
     * 未登录(status 无 accessKey)返回 null。返回 { count, changed, conflict }。
     * 登录流程、手动「获取模型」、点击选择器三条路径共用。
     */
    async function syncModelsFromGateway() {
      if (!runtimeCtx || !runtimeCtx.remote || !runtimeCtx.remote.settings) return null
      const fresh = await api('status')
      if (!fresh || !fresh.accessKey) return null
      const models = await api('gateway-models', { accessKey: fresh.accessKey })
      const list = Array.isArray(models) ? models : (models?.models || models?.list || [])
      // 关键：provider 的 baseURL 指向**本地网关**而不是门户直连地址。
      // 这样每个推理请求都先到代理，由它按轮询挑 access key，429 自动换号重发。
      // 网关确实不可用时（无头装配、端口被占）才退回直连：那种情况没有轮询/
      // 换号能力，所以只做兜底，不当作正常路径。
      const gw = await api('gateway-status').catch(function () { return null })
      const viaGateway = Boolean(gw && gw.baseURL && gw.listening !== false)
      const target = viaGateway ? gw.baseURL : (fresh.baseURL || fresh.portalUrl || 'https://bank.skillpie.cn')
      const res = await addProviderToModels(runtimeCtx, target,
        { accessKey: fresh.accessKey, list: list, protocol: models && models.protocol })
      return { count: list.length, changed: Boolean(res && res.changed), conflict: Boolean(res && res.conflict), viaGateway: viaGateway }
    }

    /* ── 点击宿主模型选择器 → 节流同步一次 ─────────────────────────────────
     * 宿主 ModelDirectoryResolver 订阅 settings/document-updated 等事件后会
     * catalog.refresh(),菜单打开期间列表会原地补齐,所以点击时拉最新即可取代
     * 后台轮询。节流 30 分钟。
     *
     * 为什么从 5 分钟拉到 30 分钟:网关实测 /v1/models 走 access key 额度,
     * 10 秒滑动窗口只有 4 次,而 LLM 推理用的是同一个桶——插件多调一次,
     * 用户下一条消息就少一次配额,表现就是满屏 429。模型目录一个月也变不了几次,
     * 没必要每 5 分钟去抢一次额度。 */
    var MODEL_TRIGGER_RE = /选择模型|Select model|加载模型|Loading models/
    var MODEL_SYNC_MIN_INTERVAL_MS = 30 * 60 * 1000
    var modelSyncState = { lastAt: 0, lastCount: null, inflight: false }

    function onModelTriggerClick(ev) {
      try {
        var target = ev && ev.target
        var el = target && typeof target.closest === 'function' ? target.closest('button[aria-haspopup="menu"]') : null
        if (!el || !MODEL_TRIGGER_RE.test(el.getAttribute('aria-label') || '')) return
        // 未登录态点击:一个请求都不发(本地登录态由各组件挂载/登录流程写入 tbStore)
        var snap = tbStore.get()
        if (!snap || !snap.loggedIn) return
        var now = Date.now()
        if (modelSyncState.inflight || (modelSyncState.lastAt && now - modelSyncState.lastAt < MODEL_SYNC_MIN_INTERVAL_MS)) return
        modelSyncState.inflight = true
        syncModelsFromGateway().then(function (res) {
          modelSyncState.inflight = false
          if (!res) return // 未登录:不记时间,登录后首次点击照常同步
          modelSyncState.lastAt = Date.now()
          var prev = modelSyncState.lastCount
          modelSyncState.lastCount = res.count
          // 静默刷新;仅模型数量变化时提示(首次由登录流程提示,这里 prev 为 null 不弹)
          if (prev != null && prev !== res.count) {
            tbStore.set({ notify: { kind: 'success', title: pageT('modelListUpdated').replace('{n}', String(res.count)), detail: '' } })
          }
        }).catch(function (e) {
          modelSyncState.inflight = false
          console.warn('[dsh-tokenbank-multi] click sync models failed:', String(e && e.message || e))
        })
      } catch (e) { /* document 监听器内异常不能冒泡到宿主 */ }
    }

    function AuthCard(props) {
      var mode = props.mode
      var setMode = props.setMode
      var onAuthed = props.onAuthed
      var t = pageT

      var email = React.useState('')
      // 注册模式：账号 + 固定域名下拉（与官网注册框一致，后端白名单强制校验）
      var registerEmailDomains = ['qq.com', '163.com', 'gmail.com', 'outlook.com', '126.com']
      var emailLocal = React.useState('')
      var emailDomain = React.useState(registerEmailDomains[0])
      var fullEmail = mode === 'register' ? (emailLocal[0].trim() + '@' + emailDomain[0]) : email[0]
      var password = React.useState('')
      var displayName = React.useState('')
      var code = React.useState('')
      var captchaId = React.useState('')
      var captchaImg = React.useState('')
      var captchaCode = React.useState('')
      var savePassword = React.useState(true)
      var busy = React.useState(false)
      var error = React.useState('')
      var sent = React.useState(false)

      var refreshCaptcha = React.useCallback(function () {
        api('captcha').then(function (data) {
          captchaId[1](data.captchaId || '')
          captchaImg[1](data.image || '')
          captchaCode[1]('')
        }).catch(function (err) { error[1](String(err.message || err)) })
      }, [])

      React.useEffect(function () {
        if (mode === 'login') refreshCaptcha()
        sent[1](false)
      }, [mode, refreshCaptcha])

      var submit = React.useCallback(async function () {
        busy[1](true); error[1]('')
        try {
          if (mode === 'register') {
            await api('register', {
              email: fullEmail, code: code[0], password: password[0],
              displayName: displayName[0], savePassword: savePassword[0],
            })
          } else {
            await api('login', {
              email: email[0], password: password[0],
              captchaId: captchaId[0], captchaCode: captchaCode[0],
              savePassword: savePassword[0],
            })
          }
          await onAuthed()
        } catch (err) {
          var msg = String(err.message || err)
          if (mode === 'register' && /validation/i.test(msg)) msg = t('codeInvalid')
          error[1](msg)
          if (mode === 'login') refreshCaptcha()
        } finally {
          busy[1](false)
        }
      }, [mode, email, emailLocal, emailDomain, password, displayName, code, captchaId, captchaCode, savePassword, onAuthed, refreshCaptcha])

      return h('div', { style: cardStyle },
        h('div', {
          style: {
            display: 'flex', width: '100%', padding: 3, borderRadius: 999, gap: 2, boxSizing: 'border-box',
            background: '#eeeeef',
          },
        },
          h('button', {
            type: 'button',
            style: {
              flex: 1, height: 28, borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: mode === 'register' ? '#ffffff' : 'transparent',
              color: mode === 'register' ? '#1a1a1a' : '#7a7a7a',
              fontWeight: mode === 'register' ? 700 : 400,
              boxShadow: mode === 'register' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            },
            onClick: function () { setMode('register') },
          }, t('registerTab')),
          h('button', {
            type: 'button',
            style: {
              flex: 1, height: 28, borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? '#1a1a1a' : '#7a7a7a',
              fontWeight: mode === 'login' ? 700 : 400,
              boxShadow: mode === 'login' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            },
            onClick: function () { setMode('login') },
          }, t('loginTab')),
        ),
        h(Field, { label: t('email') },
          mode === 'register'
            ? h('div', { style: { display: 'flex', alignItems: 'center', height: 30, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 7, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', boxSizing: 'border-box', width: '100%' } },
                h('input', { style: { flex: '1 1 60%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: 0 }, type: 'text', placeholder: t('emailLocal'), value: emailLocal[0], onChange: function (e) { emailLocal[1](e.target.value) } }),
                h('span', { style: { alignSelf: 'stretch', width: 1, margin: '0 8px', background: 'var(--dsw-alias-border-l1)' } }),
                h('select', { style: { flex: '0 0 auto', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', padding: 0, margin: 0, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }, value: emailDomain[0], onChange: function (e) { emailDomain[1](e.target.value) } },
                  registerEmailDomains.map(function (domain) {
                    return h('option', { key: domain, value: domain }, '@' + domain)
                  })))
            : h('input', { style: inputStyle, type: 'email', value: email[0], onChange: function (e) { email[1](e.target.value) } })),
        h(Field, { label: t('password') },
          h('input', { style: inputStyle, type: 'password', value: password[0], onChange: function (e) { password[1](e.target.value) } })),
        mode === 'register'
          ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
              h('div', { style: { flex: 1 } },
                h(Field, { label: t('code') },
                  h('input', { style: inputStyle, value: code[0], onChange: function (e) { code[1](e.target.value) } }))),
              h('button', {
                type: 'button', style: buttonStyle, disabled: busy[0] || sent[0],
                onClick: async function () {
                  busy[1](true); error[1]('')
                  try {
                    await api('send-code', { email: fullEmail })
                    sent[1](true)
                    var mailUrl = mailHomeUrl(fullEmail)
                    if (mailUrl) api('open-external', { url: mailUrl }).catch(function () {})
                  } catch (err) { error[1](String(err.message || err)) }
                  busy[1](false)
                },
              }, sent[0] ? t('codeSent') : t('sendCode')),
            )
          : h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
              h('div', { style: { flex: 1 } },
                h(Field, { label: t('captchaCode') },
                  h('input', { style: inputStyle, value: captchaCode[0], onChange: function (e) { captchaCode[1](e.target.value) } }))),
              captchaImg[0]
                ? h('img', {
                    src: captchaImg[0], alt: t('captcha'), title: t('captchaRefresh'),
                    onClick: refreshCaptcha,
                    style: { height: 30, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1)' },
                  })
                : null,
            ),
        error[0] ? h('div', { style: errorStyle }, error[0]) : null,
        h('button', {
          type: 'button', style: primaryButtonStyle, disabled: busy[0],
          onClick: submit,
        }, busy[0] ? '…' : (mode === 'register' ? t('register') : t('login'))),
      )
    }

    /* ── plugin entry ───────────────────────────────────────────────────── */

    return {
      name: 'dsh-tokenbank-multi',
      // 'remote' 是宿主服务名（remote.settings / remote.credentials 挂在它下面）；
      // 只写子路径会报 cannot get property "remote" without inject
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.credentials'],
      apply: function (ctx) {
        // Frizon 子集字体（@font-face）；颜色用 currentColor，暗色模式自动反白
        if (typeof document !== 'undefined' && document.head) {
          var wmCss = document.createElement('style')
          wmCss.textContent = "@font-face{font-family:'FrizonLocal';src:url(data:font/woff;base64," + FRIZON_WOFF + ") format('woff')}body[data-ds-dark-theme] .tb-wordmark{color:#ffffff!important}"
          document.head.appendChild(wmCss)
          ctx.effect(function () {
            return function () { if (wmCss.parentNode) wmCss.parentNode.removeChild(wmCss) }
          }, 'dsh-tokenbank-multi: wordmark font')

          var flashCss = document.createElement('style')
          flashCss.textContent = '.tb-balance-flash{color:#ff7a3d!important;box-shadow:inset 0 0 0 1px #ff7a3d}#tb-balance-pill{border-radius:var(--dsw-radius-sm, 8px)}#tb-balance-pill:hover,#tb-balance-pill.tb-balance-open{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.08))!important;color:var(--dsw-alias-label-secondary, #888)!important}'
          document.head.appendChild(flashCss)
          ctx.effect(function () {
            return function () { if (flashCss.parentNode) flashCss.parentNode.removeChild(flashCss) }
          }, 'dsh-tokenbank-multi: balance flash style')

          var entryCss = document.createElement('style')
          entryCss.textContent = '@keyframes tb-balance-gain{0%{opacity:0;transform:translateY(4px)}25%{opacity:1;transform:translateY(0)}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}' + '#tb-entry-btn:not(:has(.tb-free-tag)):hover{background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))!important;margin:1px 0;height:27px!important}.tb-entry-open .tb-entry-chevron{transition:transform .15s ease;transform:rotate(180deg)}'
          document.head.appendChild(entryCss)
          ctx.effect(function () {
            return function () { if (entryCss.parentNode) entryCss.parentNode.removeChild(entryCss) }
          }, 'dsh-tokenbank-multi: entry hover style')
        }

        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-tokenbank-multi: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        runtimeCtx = ctx

        // 点击宿主模型选择器（捕获阶段，先于 React 的 show()）→ 节流同步一次最新模型目录
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('click', onModelTriggerClick, true)
          ctx.effect(function () {
            return function () {
              modelSyncState.inflight = false
              document.removeEventListener('click', onModelTriggerClick, true)
            }
          }, 'dsh-tokenbank-multi: model picker click sync')
        }

        // 底部状态栏余额胶囊（已登录时显示）
        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'dsh-tokenbank-multi-balance',
            order: 5,
          }, BalancePill)
        })

        // 输入框工具行的「免费模型」入口（未登录时显示）
        ctx.slots.inject('conversation.input.right', function () {
          return ctx.slots.register({
            name: 'conversation.input.right',
            id: 'dsh-tokenbank-multi-entry',
            order: 0,
            locale: NS,
          }, ComposerEntry)
        })

        // 同一个槽只 inject 一次：多次 inject 会互相覆盖，两个 overlay 一次注册齐。
        ctx.slots.inject('shell.overlay', function () {
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-multi-notify',
            locale: NS,
            inject: function () { return {} },
          }, NotifyOverlay)
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-tokenbank-multi-panel',
            locale: NS,
          }, EntryOverlay)
        })

        // 设置页：一个 section + 一个按 id 配对的图标。
        // 旧版 DSH 没有 settings.section 槽，inject 会抛错——捕获后其余功能照常。
        try {
          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'dsh-tokenbank-multi',
              order: 50,
              locale: NS,
              label: function () { return pageT('settingsTitle') },
            }, SettingsPage)
          })
          ctx.slots.inject('settings.section.icon', function () {
            return ctx.slots.register({
              name: 'settings.section.icon',
              id: 'dsh-tokenbank-multi',
            }, function (props) { return h(TokenBankLogo, { size: (props && props.size) || 16 }) })
          })
        } catch (error) {
          ctx.logger?.warn?.(`dsh-tokenbank-multi: settings page unavailable: ${error?.message ?? error}`)
        }

        // 调试句柄：无头验证 / 排障用
        if (typeof window !== 'undefined') {
          window.__TB__ = {
            openPanel: function (view) {
              tbStore.set({ authOpen: true, panelView: view || 'main', panelSeq: Date.now() })
            },
            store: tbStore,
          }
        }
      },
    }
  },
})
