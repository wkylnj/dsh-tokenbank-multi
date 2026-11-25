# TokenBank 多账号 (dsh-tokenbank-multi)

在 DeepSeek Harness 里用 [TokenBank](https://bank.skillpie.cn) 的免费模型，并且**同时管多个账号**——随时切换，切哪个号就用哪个号的额度。

基于官方 [dsh-tokenbank](https://github.com/skillpie/dsh-plugins) 改造，移除了充值、托管、交易入口，只留下真正每天要用的东西。

## 它做什么

- 👥 **多账号**：注册/登录多个 TokenBank 账号，一个面板里切换
- 🔑 **切换即换 Key**：切换账号时把新账号的 accessKey 写进模型分组的凭据引用，**下一次请求就生效**，不用重启 DSH、不用重新拉模型列表
- 📅 **每日签到**：面板里一键签到，余额旁边浮现 `+$0.10`
- 💰 **余额一览**：当前账号余额显示在输入框下方；账号列表里并行拉每个账号的余额
- 🧹 **砍掉噪音**：没有充值档位、没有托管引导、没有词元交易、没有低余额弹窗

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
| `main` | 昵称（可改）/ 邮箱、余额、**签到** 按钮、**账号 N** 按钮 |
| `accounts` | 账号列表：圆点标当前、余额、`⋯` → 重新登录 / 移除；底部 `+ 添加账号` |
| `add` | 注册 / 登录表单（复用原 AuthCard） |

未登录时直接显示注册/登录表单。

## 数据存放

单条 credentials 记录 `dsh-tokenbank/accounts`：

```json
{
  "activeId": "2737046142@qq.com",
  "accounts": [
    { "id": "...", "email": "...", "displayName": "...",
      "sessionToken": "...", "expiresAtMS": 123,
      "accessKey": "sk-gl-...", "password": "...", "addedAt": 123 }
  ]
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

> ⚠️ 本插件与官方 `dsh-tokenbank` **共用同一个 `TOKENBANK_API_KEY` 凭据**。两个都装会互相抢 key，请先禁用旧的 `dsh-tokenbank`。

## 开发

```sh
node --check lib/index.js
node --check lib/client.js   # 或先复制成 .mjs
```

`_tmp/` 目录被 `.gitignore` 排除，用于放临时验证脚本。

## 官网

<https://bank.skillpie.cn>
