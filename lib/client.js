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
    var FRIZON_WOFF = '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'
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var NS = 'dsh-tokenbank-multi'
    var API = '/dsh-tokenbank-multi/api'

    var zh = {
      freeToken: '免费模型',
      composerEntry: 'TokenBank 账户',
      officialSite: 'TokenBank 官网',
      openSite: '打开官网',
      close: '关闭',
      back: '返回',
      more: '更多',
      reload: '刷新',
      notifyOk: '知道了',
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
      account: '账号',
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
    }

    var en = {
      freeToken: 'Free models',
      composerEntry: 'TokenBank account',
      officialSite: 'TokenBank site',
      openSite: 'Open site',
      close: 'Close',
      back: 'Back',
      more: 'More',
      reload: 'Refresh',
      notifyOk: 'Got it',
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
      account: 'Accounts',
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

    /** nano-USD → "$1.234" (3 decimals is plenty for display). */
    function usd(nano) {
      const value = (Number(nano) || 0) / 1e9
      return '$' + value.toFixed(value >= 100 ? 2 : 3)
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

    function CoinIcon(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M8.5 8.5h7M12 8.5V16M9.5 13.5h5' }),
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
    var tbStore = {
      state: { authOpen: false, authMode: 'register', panelView: 'main', panelSeq: 0, notify: null, loggedIn: null, anchor: null },
      listeners: [],
      get: function () { return tbStore.state },
      subscribe: function (fn) {
        tbStore.listeners.push(fn)
        return function () { tbStore.listeners = tbStore.listeners.filter(function (l) { return l !== fn }) }
      },
      set: function (patch) {
        tbStore.state = Object.assign({}, tbStore.state, patch)
        tbStore.listeners.slice().forEach(function (fn) { fn() })
      },
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
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        api('status').then(function (data) { if (!stopped) st[1](data) }).catch(function () {})
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen])
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
      var data = st[0]
      var bal = data && data.account && typeof data.account.balance_nano_usd === 'number'
        ? '$ ' + (data.account.balance_nano_usd / 1e9).toFixed(2) : null
      return h('button', {
        type: 'button', id: 'tb-balance-pill', title: pageT('composerEntry'),
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
        api('status').then(function (data) {
          if (!stopped) tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      var onClick = function (e) {
        var rect = e && e.currentTarget && e.currentTarget.getBoundingClientRect()
        tbStore.set({
          authOpen: true, authMode: 'register',
          anchor: rect ? { right: rect.right, top: rect.top } : null,
        })
      }
      var st = React.useState(null)
      React.useEffect(function () {
        var stopped = false
        api('status').then(function (data) {
          if (stopped) return
          st[1](data); tbStore.set({ loggedIn: Boolean(data.loggedIn), portalUrl: data.portalUrl })
        }).catch(function () {})
        return function () { stopped = true }
      }, [])
      // 登录态变化(弹窗登录/退出)时刷新展示
      React.useEffect(function () {
        var stopped = false
        if (!snap.loggedIn) return
        api('status').then(function (data) {
          if (!stopped) st[1](data)
        }).catch(function () {})
        return function () { stopped = true }
      }, [snap.loggedIn, snap.authOpen])
      // 登录态入口整个不渲染(余额在底部状态栏 pill),否则会残留一个空胶囊
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
     * 面板本体（shell.overlay）。三种视图：
     *   main     — 昵称/邮箱、余额、签到 + 账号两个按钮
     *   accounts — 账号列表（切换 / 重新登录 / 移除）+ 添加账号
     *   add      — 注册/登录表单（复用 AuthCard）
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

      // 打开时拉 status + 签到状态，之后每 60s 刷新签到状态
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

      // 主视图也要显示账号列表，所以打开时就拉各账号余额（不必等切到账号页）
      React.useEffect(function () {
        if (!snap.authOpen) return
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
      var back = function () { tbStore.set({ panelView: loggedIn ? 'main' : 'main' }) }

      /** 重新拉一次 status（切换/移除/签到后统一走这里）。 */
      var refresh = async function () {
        var fresh = await api('status').catch(function () { return null })
        if (fresh) {
          st[1](fresh)
          tbStore.set({ loggedIn: Boolean(fresh.loggedIn), portalUrl: fresh.portalUrl })
        }
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
            balanceGain[1]({ amount: gain || '0.10', ts: Date.now() })
            window.setTimeout(function () { balanceGain[1](null) }, 8000)
            var streakText = ci.streak > 1 ? ' ' + pageT('checkinStreak').replace('{n}', String(ci.streak)) : ''
            tbStore.set({ notify: { kind: 'success', title: pageT('checkinOk') + ' +$' + (gain || '0.10') + streakText, detail: '' } })
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
              tbStore.set({ panelView: 'accounts' })
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
      const res = await addProviderToModels(runtimeCtx, fresh.baseURL || fresh.portalUrl || 'https://bank.skillpie.cn',
        { accessKey: fresh.accessKey, list: list, protocol: models && models.protocol })
      return { count: list.length, changed: Boolean(res && res.changed), conflict: Boolean(res && res.conflict) }
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
          console.warn('[dsh-tokenbank] click sync models failed:', String(e && e.message || e))
        })
      } catch (e) { /* document 监听器内异常不能冒泡到宿主 */ }
    }

    /** 退出登录:从模型列表移除 TokenBank provider(尽力而为,失败不阻塞登出)。 */
    async function removeProviderFromModels(ctx) {
      try {
        const existing = await readModelNamespaceView(ctx)
        const revision = existing ? existing.revision : undefined
        const response = await ctx.remote.settings.mutate(MODEL_NS,
          [{ op: 'unset', path: ['providers', MODEL_ROUTE] }], revision)
        if (response && response.ok === false) {
          // 目标不存在(settings/target-missing 之类)视为已删除
          console.warn('[dsh-tokenbank] remove provider:', response.error?.code || response.error?.message)
        }
      } catch (e) {
        console.warn('[dsh-tokenbank] remove provider failed:', String(e && e.message || e))
      }
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
