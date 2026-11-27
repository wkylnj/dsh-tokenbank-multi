# 多渠道中转站轮转管理 (dsh-tokenbank-multi)

在 DeepSeek Harness 里同时接入多个中转站，**一个本地网关、一个面板**统一管理。每个渠道独立实现，互不影响：

| 渠道 | 状态 | 能力 |
|---|---|---|
| [TokenBank](https://bank.skillpie.cn) | 完整 | 注册/登录、多账号轮询、签到、余额、模型同步 |
| [星驰](https://xingchiapi.com) | 完整 | 多账号、每日签到、余额、模型同步（登录需人机验证，靠粘贴 `refresh_token` 接入） |

基于官方 [dsh-tokenbank](https://github.com/skillpie/dsh-plugins) 改造而来。

## 它做什么

- 🔀 **多渠道隔离**：每个渠道有自己的凭据、账号池、冷却表、轮询游标，互不污染
- 👥 **多账号**：同一渠道下多个账号，一个面板里切换
- ⚖️ **自动轮询分摊**：内置本地网关，每个推理请求按轮询落到不同账号，**429 自动换号重发**，客户端完全无感
- 📅 **每日签到**：面板里一键签到，也可开自动签到，每天首次启动 DSH 时自动给所有账号签
- 💰 **余额一览**：输入框下方显示当前渠道的余额合计
- ⚙️ **设置页**：`设置 → TokenBank Multi`，看网关状态、勾选参与轮询的账号、调轮询参数、开自动签到
- 🧹 **砍掉噪音**：没有充值档位、没有托管引导、没有词元交易、没有低余额弹窗

## 架构：一个网关，多个渠道

DSH 的 provider 只有一个 `apiKeyEnv`，一次请求只解析一个 key，`dsh-llm-pi-ai` 也没有暴露可以按请求拦截的事件——插件**没有机会**在两次推理之间换 key。所以换 key 的决策必须发生在 DSH 之外：

```
DSH ──▶ http://127.0.0.1:39917 ──▶ TokenBank / 星驰 / …
         （插件自带的网关，一个端口）
```

网关靠**每渠道一个本地令牌**分流：令牌 → 渠道，渠道自己决定上游地址、出站 UA、可用路由和账号池。网关代码里不含任何渠道名，加渠道只加 `lib/channels/<id>/` 一个目录。

| 机制 | 做法 | 为什么 |
|---|---|---|
| 令牌分流 | 每个渠道一个 `tb-local-…` 令牌 | 上游密钥只留在宿主进程里，不发给浏览器、不写进模型配置 |
| 路由能力 | 渠道声明 `routes`（`models`/`anthropic`/`chat`/`responses`） | 星驰只服务 Responses，`/v1/messages` 会被它 403，提前拒掉比透传更清楚 |
| 出站 UA | 每渠道可钉死 `user-agent` | 部分中转站按客户端白名单放行，且只该影响该渠道 |
| 轮询游标 | 记**上一次选中的账号 id**，按 id 排序后取后继 | 候选池会因冷却收缩，用递增下标索引会错位，饿死某些号、锤死另一些 |
| 冷却表 | `账号 id → {截止时间, 类型}` | 按 id 而非 key，换 key 后冷却仍然有效；`rate` 与 `server` 分开计 |
| 429 处理 | 读 `retry-after` 记冷却，同一轮立刻换下一个号重发 | 客户端拿到的是 200，感知不到限流 |
| `retry-after: 0` | 不写冷却，立刻重试 | 上游明确表示可立即重试时，不该自己加冷却 |
| 5xx 处理 | 换号重试一次，冷却 10 秒 | 渠道抖动，换个号往往就好了 |
| 全员冷却 | 等**最近解冻**的那个号，最多等设定上限；超时就把 429 抛给 DSH | 让 `dsh-llm-retry` 接手，比网关自己挂着更省事 |
| 请求体 | 先缓冲再转发（上限 32 MiB） | 换号重发要求 body 可重放；传输层错误不自动重放 POST |
| 响应体 | 流式回传 | SSE 被缓冲会让模型输出憋到最后才一次性出现 |
| 客户端断开 | `res.on('close')` 时 abort 上游 | 用户点停止后别继续烧额度 |

网关监听**固定端口 39917**，不是挂在 DSH 的 web 端口上：`baseURL` 是写进 settings 的持久配置，而 DSH 每次启动的 web 端口可能变，端口一变所有请求就全断了。固定端口下插件没起来只是连接被拒，重载插件即恢复。

网关只监听 `127.0.0.1`，只放行固定的一组路径（`/v1/messages`、`/v1/messages/count_tokens`、`/v1/models`、`/models`、`/chat/completions`、`/responses`），并且要求带本地令牌；浏览器来源的请求直接拒绝。

## 渠道：TokenBank

```sh
# 数据落在 credentials 记录 dsh-tokenbank/accounts，按上游地址分作用域（version 2）
```

| 项 | 说明 |
|---|---|
| 接入方式 | 面板里注册 / 登录（邮箱 + 密码 + 图形验证码） |
| 会话 | `tb_portal_session` Cookie，过期后用保存的会话重新换 accessKey |
| 签到 | `POST /api/portal/checkin`，每人每天一次 |
| 余额 | `balance_nano_usd`（纳美元整数），面板显示时除以 1e9 |
| accessKey | 创建时只返回一次明文；插件会自动建一把并回读保存 |
| 轮询 | 多账号按 id 轮转，429/5xx 换号 |

**不保存账号密码**：登录只用于换取会话令牌，密码用完即弃。旧版本存下的密码字段会在迁移时删除。

首次启动时若读不到记录，会自动把旧版 `dsh-tokenbank/identity` 迁移成单元素数组，并删掉旧记录——不用重新登录。

## 渠道：星驰

星驰的登录/注册要过 Google Turnstile 人机验证，**插件无法代你登录**。接入方式是粘贴 `refresh_token`：

1. 浏览器登录 <https://xingchiapi.com>
2. F12 → Console → `localStorage.getItem('refresh_token')`
3. 把 `rt_…`（67 字符）粘进面板输入框

| 项 | 说明 |
|---|---|
| 会话 | JWT `access_token`（24h）+ 一次性轮换的 `refresh_token` |
| 刷新 | 距过期不足 30 分钟自动刷新；**旧的 rt 一刷新就失效**，必须存最新值 |
| 签到 | `GET/POST /api/v1/user/checkin`，每天一次；重复签到返回 409，插件视为「今日已签」 |
| 余额 | `balance` 美元浮点 |
| API Key | `GET /api/v1/keys` 明文可读回，没有就自动建一把 |
| 协议 | 只服务 `/v1/responses`（`/v1/chat/completions` 站点已停用，`/v1/messages` 按 key 分组门禁） |
| 出站 UA | 钉死 `DeepSeek-Harness/<版本>`，通过它的客户端白名单（不冒充别的工具） |
| 轮询 | 单账号时等价于不轮转；多账号时按同一套机制轮转 |

## 安装

```sh
git clone https://github.com/wkylnj/dsh-tokenbank-multi.git
dsh plugin --profile desktop add ./dsh-tokenbank-multi
```

装完刷新 GUI。**不需要手改 `cordis.patch.yml`**：插件启动、网关开始监听后，会把已有的 `tokenbank` / `xingchi` provider 指向本地网关，并且只改必须的字段（`apiKeyEnv` / `baseURL` / 模型列表），`displayName`、`retryPolicy`、你手动加过的模型都会保留。网关没监听时它不会改动配置，也不会偷偷把你改回直连。

> ⚠️ 本插件使用独立的 `TOKENBANK_MULTI_GATEWAY_KEY` / `XINGCHI_MULTI_GATEWAY_KEY` 凭据，不会再改写官方 `dsh-tokenbank` 用的 `TOKENBANK_API_KEY`。两个都装时，请让对应 provider 只被其中一个接管。

## 界面

输入框下方的余额胶囊点开就是面板。顶部是渠道 tab（TokenBank / 星驰），下面按渠道渲染不同内容：

| 渠道 | 视图 | 内容 |
|---|---|---|
| TokenBank | `main` | 昵称（可改）/ 邮箱、余额、**签到** + **自动签到** 开关、**账号列表**、`+ 添加账号` |
| TokenBank | `add` | 注册 / 登录表单 |
| 星驰 | — | 账号列表（池子开关 / 签到 / 刷新令牌 / 移除）、粘贴 `refresh_token` 添加账号、全部签到、同步模型 |

账号列表每行：圆点标当前账号、昵称、邮箱、该账号余额、`⋯` → 重新登录 / 移除账号。

## 设置页

`设置 → TokenBank Multi`（order 50）。四张卡：

| 卡片 | 内容 |
|---|---|
| 网关状态 | 网关地址 + 复制、池子 `n/m`、累计已转发、上次选中、冷却中的账号及剩余秒数、清空冷却、同步模型 |
| 轮询池 | 每个账号一行开关，**取消勾选的账号不参与轮询**（与「当前账号」是两件事：当前账号只影响面板显示，轮询池决定网关用哪些号分摊） |
| 轮询参数 | 重试轮数 `0–10`、单轮最大等待秒 `0–120`、冷却秒 `0–600`，保存后**下一个请求即生效** |
| 自动签到 | 每天首次启动 DSH 时给所有账号签到 |

参数存在 store 的 `gateway` 字段里，网关每次取账号前重读，不需要重启。状态每 5 秒刷新一次，只读本地状态，不打上游。

## 安全说明

- 面板接口挂在 DSH 自己的 Web 服务器上，先过宿主鉴权（只接受已登录的浏览器会话），再校验同源、`X-DSH-TokenBank` 头与 JSON 类型。
- 面板返回里不含 `sessionToken` / `accessKey` / `refresh_token` / 密码；上游错误报文不外泄，500 一律脱敏成通用文案。
- 网关的令牌与上游密钥分离，前端拿不到任何上游密钥。

## 开发

```sh
npm test                      # 324 项：单元 + 流程 + 渠道隔离 + 渲染
node --check lib/index.js
node --check lib/client.js    # 或先复制成 .mjs
```

目录结构：

```
lib/
  core/registry.js        渠道注册与 action 分发
  gateway.js              多渠道网关（令牌 → 渠道）
  http.js                 URL 校验、有界读写、令牌比对
  index.js                插件入口、面板路由、定时器
  client.js               Web 面板
  channels/
    tokenbank/            复用根目录 store.js / models.js / tb.js
    xingchi/              api.js store.js models.js index.js
test/                     全部为隔离测试，不访问真实上游
```

`_secrets/` 与 `_tmp/` 被 `.gitignore` 排除。

## 许可

MIT。上游 [skillpie/dsh-plugins](https://github.com/skillpie/dsh-plugins) 声明其插件均以 MIT 发布。

## 官网

- TokenBank: <https://bank.skillpie.cn>
- 星驰: <https://xingchiapi.com>
