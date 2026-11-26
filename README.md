# TokenBank 多账号 (dsh-tokenbank-multi)

在 DeepSeek Harness 里用 [TokenBank](https://bank.skillpie.cn) 的免费模型，并且**同时管多个账号**——随时切换，切哪个号就用哪个号的额度。

基于官方 [dsh-tokenbank](https://github.com/skillpie/dsh-plugins) 改造，移除了充值、托管、交易入口，只留下真正每天要用的东西。

## 它做什么

- 👥 **多账号**：注册/登录多个 TokenBank 账号，一个面板里切换
- ⚖️ **自动轮询分摊**：内置本地反向代理，每个推理请求按轮询落到不同账号，**429 自动换号重发**，客户端完全无感
- 🔑 **切换即换 Key**：切换账号时把新账号的 accessKey 写进模型分组的凭据引用，**下一次请求就生效**，不用重启 DSH、不用重新拉模型列表
- 📅 **每日签到**：面板里一键签到，余额旁边浮现 `+$0.10`；可开自动签到，每天首次启动 DSH 时自动给所有账号签
- 💰 **余额一览**：输入框下方显示**全部账号余额合计**；账号列表里并行拉每个账号的余额
- ⚙️ **设置页**：`设置 → TokenBank`，看网关状态、勾选参与轮询的账号、调轮询参数、开自动签到
- 🧹 **砍掉噪音**：没有充值档位、没有托管引导、没有词元交易、没有低余额弹窗

## 自动轮询是怎么做的

DSH 的 provider 只有一个 `apiKeyEnv`，一次请求只解析一个 key，`dsh-llm-pi-ai` 也没有暴露请求拦截事件——插件**没有机会**在两次推理之间换 key。所以换 key 的决策必须发生在 DSH 之外：

```
DSH ──▶ http://127.0.0.1:39917 ──▶ https://bank.skillpie.cn
         （插件自带的代理）
```

把 provider 的 `baseURL` 指到本地代理后，每个推理请求都先到我们这里，由代理挑 key。调度逻辑对齐 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)：

| 机制 | 做法 | 为什么 |
|---|---|---|
| 轮询游标 | 记**上一次选中的账号 id**，按 id 排序后取后继 | 候选池会因冷却收缩，用递增下标索引会错位，饿死某些号、锤死另一些 |
| 冷却表 | `账号 id → 截止时间` | 按 id 而非 key，换 key 后冷却仍然有效 |
| 429 处理 | 读 `retry-after` 记冷却，同一轮立刻换下一个号重发 | 客户端拿到的是 200，感知不到限流 |
| `retry-after: 0` | 不写冷却，立刻重试 | 上游明确表示可立即重试时，不该自己加冷却 |
| 全员冷却 | 等**最近解冻**的那个号，最多等 30 秒；超时就把 429 抛给 DSH | 让 `dsh-llm-retry` 接手，比代理自己挂着更省事 |
| 请求体 | 先缓冲再转发 | 换号重发要求 body 可重放 |
| 响应体 | 流式回传 | SSE 被缓冲会让模型输出憋到最后才一次性出现 |
| 客户端断开 | `res.on('close')` 时 abort 上游 | 用户点停止后别继续烧额度 |

网关监听**固定端口 39917**，不是挂在 DSH 的 web 端口上：`baseURL` 是写进 settings 的持久配置，而 DSH 每次启动的 web 端口可能变，端口一变所有请求就全断了。固定端口下插件没起来只是连接被拒，重载插件即恢复。

面板里能看到网关状态（`gateway-status`）：池子里几个号、谁在冷却、累计换过多少次号。

## 为什么切换账号不需要重载插件

`llm-pi-ai` 的 `apiKeyEnv` 只是一个**凭据引用名**，不是值：

```js
// dsh-llm-pi-ai/lib/index.js:3090
const resolveApiKey = async (provider, profile) => {
  const ref = profile.apiKeyEnv            // 只是字符串 'TOKENBANK_API_KEY'
  const hit = await credentials.resolve(ref)  // 值在这里查
  ...
}
```

而它在每个请求流开始时都会重新解析（`streamWithSnapshot`，L2103），`dsh-credentials` 也明确保证：

> a changed credential reaches the next operation without any plugin restart

所以「切换账号」= 把 `TOKENBANK_API_KEY` 的值换成新账号的 accessKey。`providers` 结构一个字节都不动，模型列表不会刷新、不会重复。

## 界面

输入框下方的余额胶囊点开就是面板，三个视图：

| 视图 | 内容 |
|---|---|
| `main` | 昵称（可改）/ 邮箱、余额、**签到** + **自动签到** 开关、**账号列表**、`+ 添加账号` |
| `add` | 注册 / 登录表单（复用原 AuthCard） |

账号列表每行：圆点标当前账号、昵称、邮箱、该账号余额、`⋯` → 重新登录 / 移除账号。未登录时直接显示注册/登录表单。

## 设置页

`设置 → TokenBank`（order 50，排在 Remote 之后）。四张卡：

| 卡片 | 内容 |
|---|---|
| 网关状态 | 代理地址 + 复制、池子 `n/m`、累计已转发、上次选中、冷却中的账号及剩余秒数、清空冷却 |
| 轮询池 | 每个账号一行开关，**取消勾选的账号不参与轮询**（与「当前账号」是两件事：当前账号决定 DSH 用哪个 key，轮询池决定网关用哪些号分摊） |
| 轮询参数 | 重试轮数 `0–10`、单轮最大等待秒 `0–120`、冷却秒 `0–600`，保存后**下一个请求即生效** |
| 自动签到 | 每天首次启动 DSH 时给所有账号签到 |

参数存在 store 的 `gateway` 字段里，网关每次取账号前重读，不需要重启。状态每 5 秒刷新一次，只读本地状态，不打上游。

## 数据存放

单条 credentials 记录 `dsh-tokenbank/accounts`：

```json
{
  "activeId": "2737046142@qq.com",
  "accounts": [
    { "id": "...", "email": "...", "displayName": "...",
      "sessionToken": "...", "expiresAtMS": 123,
      "accessKey": "sk-gl-...", "password": "...", "addedAt": 123, "pool": true }
  ],
  "autoCheckin": { "enabled": false, "lastDay": "" },
  "gateway": { "requestRetryRounds": 3, "maxRetryIntervalMs": 30000, "cooldownMs": 60000 }
}
```

首次启动时若读不到这条记录，会自动把旧版 `dsh-tokenbank/identity` 迁移成单元素数组，并删掉旧记录——不用重新登录。

## 安装

**从本地目录安装**（开发中推荐）：

```sh
git clone https://github.com/wkylnj/dsh-tokenbank-multi.git
dsh plugin --profile desktop add ./dsh-tokenbank-multi
```

装完刷新 GUI。

然后把 profile 里 `tokenbank` provider 的 `baseURL` 指向本地网关（`~/.dsh/profiles/<profile>/cordis.patch.yml`）：

```yaml
tokenbank:
  displayName: TokenBank
  apiKeyEnv: TOKENBANK_API_KEY
  api: anthropic-messages
  baseURL: http://127.0.0.1:39917   # ← 本地网关，不是 bank.skillpie.cn
```

重启 DSH 让配置生效（这个文件只在启动时读一次）。之后所有推理请求都会经过网关，自动在多账号间轮询。

> ⚠️ 本插件与官方 `dsh-tokenbank` **共用同一个 `TOKENBANK_API_KEY` 凭据**。两个都装会互相抢 key，请先禁用旧的 `dsh-tokenbank`。

## 开发

```sh
node --check lib/index.js
node --check lib/client.js   # 或先复制成 .mjs
```

`_tmp/` 目录被 `.gitignore` 排除，用于放临时验证脚本。

## 官网

<https://bank.skillpie.cn>
