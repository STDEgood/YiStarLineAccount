# YiStarLine Account · 产品接入指南

本指南面向要把自己的产品（桌面程序、Web 应用、命令行工具）接入 **YiStarLine Account** 的开发者。
整套协议完全运行在本机回环地址上，不需要联网，也不依赖任何第三方身份服务。

- 服务地址：`http://127.0.0.1:8600`（端口被占用时会自动顺延，可用 `/api/v1/health` 探测）
- 协议版本：`v1`
- 认证模型：**一次性票据（ticket）** + **应用密钥（app_secret）** + **访问令牌（access_token）**

---

## 1. 接入前准备

1. 安装并启动 YiStarLine Account（桌面客户端 `YiStarLine Account.exe`，或 `run/start-app.vbs`）。
2. 创建本机账户并登录。
3. 打开 **开发者** 页面，创建应用：
   - **产品名称**：显示在授权页上的名字。
   - **回调地址**：授权成功后票据回传的地址，必须与请求中的 `redirect_uri` **完全一致**（支持 `{port}` 占位符，例如 `http://127.0.0.1:{port}/sso/callback`）。
4. 保存创建时返回的 **应用 ID**（`ylc_…`）与 **应用密钥**（`ylsec_…`）。
   > 应用密钥只在创建或轮换时完整显示一次，服务端只保存摘要；丢失只能轮换。

---

## 2. 登录流程

```
产品前端                      YiStarLine Account                   产品后端
   │                                  │                                │
   │ 1. 打开 /sso/authorize           │                                │
   │   app_id + redirect_uri + state  │                                │
   ├─────────────────────────────────>│                                │
   │                                  │ 2. 校验应用与回调白名单         │
   │                                  │    已登录 → 直接签发票据        │
   │                                  │    未登录 → 显示登录/确认页     │
   │ 3. 302 到 redirect_uri?ticket=…  │                                │
   │<─────────────────────────────────┤                                │
   │                                                                   │
   │ 4. 把 ticket 交给自己的后端                                       │
   ├──────────────────────────────────────────────────────────────────>│
   │                                  │ 5. POST /api/v1/ticket/redeem   │
   │                                  │    app_id + app_secret + ticket │
   │                                  │<───────────────────────────────┤
   │                                  │ 6. 返回 user + access_token     │
   │                                  ├───────────────────────────────>│
   │ 7. 产品建立自己的会话，登录完成                                   │
   │<──────────────────────────────────────────────────────────────────┤
```

票据（ticket）的三个约束：

| 约束 | 说明 |
| --- | --- |
| 一次性 | 兑换成功后立即失效，重复兑换返回 `invalid_ticket` |
| 90 秒有效 | 超时后需要重新发起授权 |
| 绑定回调地址 | 只能回传到应用白名单中的地址 |

> **每次授权都会确认**：默认情况下即使用户已经授权过该产品，也会展示一次与 Microsoft / GitHub / Google
> 类似的确认页（可勾选「记住此应用」）。产品若希望完全静默，请显式传 `prompt=none`。

---

## 3. 前端：发起授权

### 3.1 使用浏览器 SDK（推荐）

把 `YiStarLineAccount\web\yl-sso.js` 复制到你的项目，或直接引用本机服务上的 `/yl-sso.js`。

```html
<script src="/yl-sso.js"></script>
<button id="yl-login">使用 YiStarLine 登录</button>

<script>
  document.getElementById('yl-login').onclick = async () => {
    const { ticket, state } = await YLAccount.login({
      appId: 'ylc_你的应用ID',
      redirectUri: location.origin + '/sso/callback',
    });
    // 交给自己的后端兑换，前端不要接触 app_secret
    await fetch('/api/sso/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, state }),
    });
    location.reload();
  };
</script>
```

回调页 `/sso/callback` 只需要一行：

```html
<script src="/yl-sso.js"></script>
<script>YLAccount.handleCallback();</script>
```

`YLAccount.login()` 会打开一个授权窗口，用户完成授权后由回调页通过 `postMessage` 把票据交回，Promise 才 resolve。

SDK 其它能力：

| 方法 | 说明 |
| --- | --- |
| `YLAccount.configure({ baseUrl })` | 手动指定服务地址（默认自动探测 8600–8629） |
| `YLAccount.discover()` | 自动发现本机服务，返回 base URL |
| `YLAccount.silentLogin(options)` | 静默登录（`prompt=none`），未授权时抛错 |
| `YLAccount.handleCallback()` | 回调页解析并回传票据 |
| `YLAccount.userinfo(token)` | 用访问令牌读取用户（一般放在后端） |

### 3.2 不使用 SDK：自己拼 URL

```js
const params = new URLSearchParams({
  app_id: 'ylc_你的应用ID',
  redirect_uri: 'http://127.0.0.1:5173/sso/callback',
  state: crypto.randomUUID(),
});
window.open(`http://127.0.0.1:8600/sso/authorize?${params}`, '_blank', 'width=460,height=660');
```

桌面程序可以把授权窗口嵌入 WebView / WebBrowser2 / Electron 窗口，回调地址填自己的本地 HTTP 服务。

---

## 4. 后端：兑换票据

### 4.1 Python（标准库）

```python
# integration/python/yistarline_sso.py
from yistarline_sso import YiStarLineSSO

sso = YiStarLineSSO(app_id="ylc_xxx", app_secret="ylsec_xxx")
info = sso.redeem(ticket)
user = info["user"]              # 昵称 / 用户名 / 邮箱
token = info["access_token"]     # 30 天有效，可作废
```

### 4.2 Node.js

```js
const { YiStarLineSSO } = require('./integration/node/yistarline-sso');
const sso = new YiStarLineSSO({ appId: 'ylc_xxx', appSecret: process.env.YL_APP_SECRET });
const { user, access_token } = await sso.redeem(ticket);
```

### 4.3 C# / .NET

```csharp
var sso = new YiStarLineSso("ylc_xxx", "ylsec_xxx");
JsonElement result = await sso.RedeemAsync(ticket);
string name = result.GetProperty("user").GetProperty("display_name").GetString();
```

### 4.4 直接调 HTTP

```bash
curl -X POST http://127.0.0.1:8600/api/v1/ticket/redeem \
  -H "Content-Type: application/json" \
  -d '{"app_id":"ylc_xxx","app_secret":"ylsec_xxx","ticket":"ylt_xxx"}'
```

成功响应：

```json
{
  "ok": true,
  "access_token": "yla_…",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "expires_at": 1794484765,
  "scope": "profile",
  "user": {
    "id": "b9d1…",
    "username": "yistar",
    "display_name": "Ystar",
    "email": "ystar@example.com",
    "created_at": 1794400000
  },
  "app": { "app_id": "ylc_xxx", "name": "YiStarLine Notes" }
}
```

---

## 5. 接口参考

所有接口仅在本机回环地址可用。

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | 无 | 健康检查，返回应用名与版本 |
| GET | `/sso/authorize` | 浏览器会话 | 发起授权，302 回回调地址并携带 `ticket` |
| GET | `/sso/authorize?prompt=none` | 浏览器会话 | 静默登录，未登录/未授权时带 `error` 回调 |
| POST | `/api/sso/approve` | 浏览器会话 | 确认授权（授权页调用） |
| POST | `/api/v1/ticket/redeem` | 应用密钥 | 票据换用户资料与访问令牌 |
| GET | `/api/v1/userinfo` | 访问令牌 | 读取令牌对应的用户 |
| POST | `/api/v1/auth/login` | 应用密钥 | 用户名密码直接登录 |
| POST | `/api/v1/app/verify` | 应用密钥 | 校验应用 ID 与密钥 |
| POST | `/api/v1/logout` | 访问令牌 | 作废访问令牌 |

### 5.1 静默登录

```bash
# 已登录且已授权：302 → http://…/callback?ticket=ylt_…&state=…
# 未登录：            302 → http://…/callback?error=login_required&state=…
# 已登录但未授权：     302 → http://…/callback?error=consent_required&state=…
curl -i "http://127.0.0.1:8600/sso/authorize?app_id=ylc_xxx&redirect_uri=…&prompt=none&state=s1"
```

产品可以在启动时先在隐藏窗口里请求一次静默登录，成功即完成「免密进入」，失败再显示自己的登录页。

旧版产品若依赖「已授权就直接放行」的旧行为，可传 `prompt=auto`：已授权时不弹确认页，直接回调票据。

### 5.2 用户名密码登录

适用于产品希望保留自己的登录表单：

```json
POST /api/v1/auth/login
{
  "app_id": "ylc_xxx",
  "app_secret": "ylsec_xxx",
  "username": "yistar",
  "password": "……"
}
```

返回结构同票据兑换（含 `user` 与 `access_token`）。

### 5.3 读取用户

```bash
curl http://127.0.0.1:8600/api/v1/userinfo -H "Authorization: Bearer yla_xxx"
```

---

## 6. 错误码

错误响应统一为：

```json
{ "ok": false, "error": { "code": "invalid_ticket", "message": "票据无效、已使用或已过期" } }
```

| 错误码 | HTTP | 含义与处理 |
| --- | --- | --- |
| `login_required` | 302 | 用户未登录，需先打开登录页 |
| `consent_required` | 302 | 尚未授权该产品，需走一次确认 |
| `invalid_redirect` | 400 | 回调地址不在白名单 |
| `invalid_client` | 401 | 应用 ID 或密钥错误 |
| `invalid_ticket` | 400 | 票据无效 / 已用 / 过期（90 秒） |
| `invalid_token` | 401 | 访问令牌无效或过期 |
| `access_denied` | 302 | 用户拒绝授权 |
| `unauthenticated` | 401 | 缺少有效凭据 |
| `too_many_attempts` | 429 | 登录失败次数过多，临时锁定 |

---

## 7. 安全清单

- [x] `app_secret` 只保存在后端或本地程序，绝不下发到网页。
- [x] 发起授权时生成随机 `state`，回调时比对，防止登录 CSRF。
- [x] 回调地址必须与应用白名单完全一致，不支持通配符。
- [x] 票据只兑换一次；失败时重新发起授权，不要缓存票据。
- [x] 访问令牌保存在服务端会话或 HttpOnly Cookie，不写入 localStorage。
- [x] 令牌泄露时，用户在「已授权应用」页面作废即可立即失效。
- [x] 产品侧建立自己的会话，不要直接把 `access_token` 当作长期登录凭据下发。

---

## 8. 常见问题

**授权窗口提示「应用不存在」**
检查 `app_id` 是否与开发者页面显示的一致，应用是否已被删除。

**回调返回 400 / `invalid_redirect`**
`redirect_uri` 必须与白名单完全一致，包括协议、端口与路径。

**兑换返回 `invalid_ticket`**
票据 90 秒过期且只能兑换一次，不要重复兑换或延迟处理。

**浏览器出现跨域错误**
浏览器端只用弹窗流程；`/api/v1/*` 请在后端调用（这些接口虽返回 CORS 头，但不应携带密钥从浏览器直连）。

**端口不是 8600**
服务在端口被占用时会自动顺延。可用 `GET /api/v1/health` 依次探测 8600–8629，或读取
`%USERPROFILE%\YiStarLineAccount\data\runtime.json` 中的 `base_url`。

---

## 8. 应用身份与 YiStarLine Protect

每个应用创建时都会分配一个**应用码**：`YLP-XXXX-XXXX-XXXX`。应用码 + 发布者 + 认证状态构成应用的公开身份，
其它系统即使不持有应用密钥也能识别它：

```bash
curl "http://127.0.0.1:8600/api/v1/apps/lookup?code=YLP-7K2M-9QRT-4WXZ"
```

```json
{
  "ok": true,
  "app": {
    "public_code": "YLP-7K2M-9QRT-4WXZ",
    "app_id": "ylc_example123456",
    "name": "音乐播放器",
    "publisher": "Ystar",
    "scopes": ["profile"],
    "created_at": 1730000000
  },
  "protect": {
    "verified": true,
    "level": "verified",
    "certificate_id": "YLP-CERT-AB12CD34EF",
    "expires_at": 1760000000
  }
}
```

**YiStarLine Protect** 是官方安全认证：开发者页里每个应用的按钮默认是「未认证」，点击后进入答题页，
5 道安全题答对至少 4 道即可通过，证书有效期 1 年；授权确认页会向用户展示认证徽章与发布者。

认证**不会**改变任何权限或令牌行为，它只回答三个问题：这个应用是谁发布的、是否通过官方安全检查、证书是否仍在有效期内。

---

### 首次授权（应用码，无需预先登记）

产品第一次在别人机器上运行时，本机还没有这个应用。用应用码发起授权即可，用户不需要手输任何码：

```
https://…/#/sso/authorize?code=YLP-7K2M-9QRT-4WXZ
  &redirect_uri=http://127.0.0.1:5173/sso/callback
  &name=音乐播放器&publisher=Ystar&state=xyz
```

- 不认识该应用码时，YAUA 直接弹出「首次使用此应用」确认页：应用名、发布者、应用码、回调域名与将获得的权限
- 用户点「允许」后，本机自动登记该应用（标记为 `imported`），并签发票据
- 兑换时**不需要应用密钥**，用 `client_id` 传应用码即可：

```json
POST /api/v1/ticket/redeem
{ "client_id": "YLP-7K2M-9QRT-4WXZ", "ticket": "ylt_..." }
```

安全边界：首次登记是「用户确认 + 仅接受 HTTPS 或本机回环地址」的信任模式；
已登记应用仍按原有回调白名单校验；令牌 30 天有效、可按应用撤销。

## 9. 随程序分发的文件
| 文件 | 用途 |
| --- | --- |
| `web/yl-sso.js` | 浏览器 SDK |
| `integration/python/yistarline_sso.py` | Python 客户端 |
| `integration/node/yistarline-sso.js` | Node.js 客户端 |
| `integration/csharp/YiStarLineSso.cs` | C# 客户端 |
| `web/demo/` | 可运行的示例产品（`http://127.0.0.1:8600/demo/`） |

---

## 10. 兼容旧版接入

协议 v1 保持向后兼容，以下别名与新行为可以同时使用：

| 旧写法 | 等价新写法 | 适用位置 |
| --- | --- | --- |
| `client_id` | `app_id` | `/sso/authorize`、`/api/v1/*` |
| `client_secret` | `app_secret` | `/api/v1/ticket/redeem`、`/api/v1/auth/login` |
| `redirect` | `redirect_uri` | `/sso/authorize` |
| `nonce` | `state` | `/sso/authorize` |
| `code` | `ticket` | `/api/v1/ticket/redeem` |
| `prompt=auto` | — | 旧行为：已授权时静默放行，不弹确认页 |

错误响应结构、票据格式（`ylt_`）、令牌格式（`yla_`）与既有错误码均未变化；
`/api/v1/health` 新增 `full_name`、`mark` 字段，旧客户端可忽略。
