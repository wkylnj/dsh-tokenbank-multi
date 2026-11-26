# TokenBank 多账号 (dsh-tokenbank-multi)

在 DeepSeek Harness 里用 [TokenBank](https://bank.skillpie.cn) 的免费模型，并且**同时管多个账号**——随时切换，切哪个号就用哪个号的额度。

基于官方 [dsh-tokenbank](https://github.com/skillpie/dsh-plugins) 改造，移除了充值、托管、交易入口，只留下真正每天要用的东西。

## 它做什么

- 👥 **多账号**：注册/登录多个 TokenBank 账号，一个面板里切换
- ⚖️ **自动轮询分摊**：内置本地网关，每个推理请求按轮询落到不同账号，**429 自动换号重发**，客户端完全无感
- 📅 **每日签到**：面板里一键签到，余额旁边浮现本次收益；可开自动签到，每天首次启动 DSH 时自动给所有账号签
- 💰 **余额一览**：输入框下方显示**全部账号余额合计**；账号列表里并行拉每个账号的余额
- ⚙️ **设置页**：`设置 → TokenBank Multi`，看网关状态、勾选参与轮询的账号、调轮询参数、开自动签到
- 🧹 **砍掉噪音**：没有充值档位、没有托管引导、没有词元交易、没有低余额弹窗

## 自动轮询是怎么做的

DSH 的 provider 只有一个 `apiKeyEnv`，一次请求只解析一个 key，`dsh-llm-pi-ai` 也没有暴露可以按请求拦截的事件——插件**没有机会**在两次推理之间换 key。所以换 key 的决策必须发生在 DSH 之外：

```
DSH ──▶ http://127.0.0.1:39917 ──▶ https://bank.skillpie.cn
         （插件自带的网关）
```

网关拿的是**插件自己生成的本地凭据**（`TOKENBANK_MULTI_GATEWAY_KEY`，形如 `tb-local-…`），不是任何一个上游账号的 accessKey——上游密钥只留在宿主进程里，不会发给浏览器，也不会写进模型配置。

| 机制 | 做法 | 为什么 |
|---|---|---|
| 轮询游标 | 记**上一次选中的账号 id**，按 id 排序后取后继 | 候选池会因冷却收缩，用递增下标索引会错位，饿死某些号、锤死另一些 |
| 冷却表 | `账号 id → 截止时间` | 按 id 而非 key，换 key 后冷却仍然有效 |
| 429 处理 | 读 `retry-after` 记冷却，同一轮立刻换下一个号重发 | 客户端拿到的是 200，感知不到限流 |
| `retry-after: 0` | 不写冷却，立刻重试 | 上游明确表示可立即重试时，不该自己加冷却 |
| 5xx 处理 | 换号重试一次，冷却 10 秒 | 渠道抖动，换个号往往就好了 |
| 全员冷却 | 等**最近解冻**的那个号，最多等设定上限；超时就把 429 抛给 DSH | 让 `dsh-llm-retry` 接手，比网关自己挂着更省事 |
| 请求体 | 先缓冲再转发（上限 32 MiB） | 换号重发要求 body 可重放；传输层错误不自动重放 POST |
| 响应体 | 流式回传 | SSE 被缓冲会让模型输出憋到最后才一次性出现 |
| 客户端断开 | `res.on('close')` 时 abort 上游 | 用户点停止后别继续烧额度 |

网关监听**固定端口 39917**，不是挂在 DSH 的 web 端口上：`baseURL` 是写进 settings 的持久配置，而 DSH 每次启动的 web 端口可能变，端口一变所有请求就全断了。固定端口下插件没起来只是连接被拒，重载插件即恢复。

网关只监听 `127.0.0.1`，只放行固定的一组路径（`/v1/messages`、`/v1/messages/count_tokens`、`/v1/models`、`/models`、`/chat/completions`、`/responses`），并且要求带本地令牌；浏览器来源的请求直接拒绝。

## 数据存放

一条 credentials 记录 `dsh-tokenbank/accounts`，按上游地址分作用域（`version: 2`）：

```json
{
  "version": 2,
  "stores": [
    {
      "baseUrl": "https://bank.skillpie.cn",
      "store": {
        "activeId": "someone@example.com",
        "accounts": [
          { "id": "...", "email": "...", "displayName": "...",
            "sessionToken": "...", "expiresAtMS": 123,
            "accessKey": "sk-gl-...", "addedAt": 123, "pool": true }
        ],
        "autoCheckin": { "enabled": false, "lastDay": "" },
        "gateway": { "requestRetryRounds": 3, "maxRetryIntervalMs": 30000, "cooldownMs": 60000 }
      }
    }
  ]
}
```

**不保存账号密码**：登录只用于换取会话令牌，密码用完即弃。旧版本存下的密码字段会在迁移时删除。

首次启动时若读不到这条记录，会自动把旧版 `dsh-tokenbank/identity` 迁移成单元素数组，并删掉旧记录——不用重新登录。

## 安装

```sh
git clone https://github.com/wkylnj/dsh-tokenbank-multi.git
dsh plugin --profile desktop add ./dsh-tokenbank-multi
```

装完刷新 GUI。**不需要手改 `cordis.patch.yml`**：插件启动、网关开始监听后，会把已有的 `tokenbank` provider 指向本地网关，并且只改必须的字段（`apiKeyEnv` / `baseURL` / 模型列表），`displayName`、`retryPolicy`、你手动加过的模型都会保留。网关没监听时它不会改动配置，也不会偷偷把你改回直连。

> ⚠️ 本插件使用独立的 `TOKENBANK_MULTI_GATEWAY_KEY` 凭据，不会再改写官方 `dsh-tokenbank` 用的 `TOKENBANK_API_KEY`。两个都装时，请让 `tokenbank` provider 只被其中一个接管。

## 界面

输入框下方的余额胶囊点开就是面板，两个视图：

| 视图 | 内容 |
|---|---|
| `main` | 昵称（可改）/ 邮箱、余额、**签到** + **自动签到** 开关、**账号列表**、`+ 添加账号` |
| `add` | 注册 / 登录表单 |

账号列表每行：圆点标当前账号、昵称、邮箱、该账号余额、`⋯` → 重新登录 / 移除账号。未登录时直接显示注册/登录表单。

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
- 面板返回里不含 `sessionToken` / `accessKey` / 密码；上游错误报文不外泄，500 一律脱敏成通用文案。
- 网关的令牌与上游 accessKey 分离，前端拿不到任何上游密钥。

## 开发

```sh
node --check lib/index.js
node --check lib/client.js   # 或先复制成 .mjs
```

`_tmp/` 目录被 `.gitignore` 排除，用于放临时验证脚本。

## 许可

MIT。上游 [skillpie/dsh-plugins](https://github.com/skillpie/dsh-plugins) 声明其插件均以 MIT 发布。

## 官网

<https://bank.skillpie.cn>
