#!/usr/bin/env python3
"""YiStarLine Account · 端到端自检脚本

用法:
    python tests/selftest.py                  # 自动探测本机服务端口
    python tests/selftest.py --base http://127.0.0.1:8600
    python tests/selftest.py --keep           # 保留测试账户，便于在界面里查看

覆盖：注册 / 登录 / 会话 / 应用注册 / SSO 授权与票据 / 票据兑换 /
访问令牌 / 静默登录 / 示例产品链路 / 修改密码 / 失败锁定 / 恢复码重置 /
审计日志 / 令牌作废 / 账户删除。结束时自动清理测试账户。
"""
from __future__ import annotations

import argparse
import http.client
import json
import random
import string
import sys
from urllib.parse import parse_qs, urlencode, urlsplit

PASSED: list[str] = []
FAILED: list[str] = []
GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"


class Resp:
    def __init__(self, status: int, headers: list[tuple[str, str]], body: bytes):
        self.status = status
        self.headers = headers
        self.body = body

    def header(self, name: str) -> str:
        name = name.lower()
        for key, value in reversed(self.headers):
            if key.lower() == name:
                return value
        return ""

    def json(self) -> dict:
        try:
            data = json.loads(self.body.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except (ValueError, UnicodeDecodeError):
            return {}

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", "replace")


class Client:
    """极简 HTTP 客户端：手动维护 Cookie，不自动跟随重定向。"""

    def __init__(self, base: str, csrf: bool = True):
        parts = urlsplit(base)
        self.host = parts.hostname or "127.0.0.1"
        self.port = parts.port or 80
        self.base = f"{parts.scheme}://{self.host}:{self.port}"
        self.csrf = csrf
        self.cookies: dict[str, str] = {}

    def request(self, method: str, path: str, payload=None, headers=None,
                host: str | None = None) -> Resp:
        conn = http.client.HTTPConnection(self.host, self.port, timeout=20)
        hdrs = dict(headers or {})
        if self.csrf and method not in ("GET", "HEAD"):
            hdrs.setdefault("X-YL-Client", "yistarline-account")
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            hdrs.setdefault("Content-Type", "application/json")
        if self.cookies:
            hdrs.setdefault("Cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        if host:
            hdrs["Host"] = host
        conn.request(method, path, body=body, headers=hdrs)
        raw = conn.getresponse()
        data = raw.read()
        resp = Resp(raw.status, raw.getheaders(), data)
        for key, value in resp.headers:
            if key.lower() != "set-cookie":
                continue
            pair = value.split(";")[0].strip()
            if "=" not in pair:
                continue
            name, _, val = pair.partition("=")
            if "max-age=0" in value.lower() or val == "":
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = val
        conn.close()
        return resp

    def get(self, path: str, **kwargs) -> Resp:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, payload=None, **kwargs) -> Resp:
        return self.request("POST", path, payload, **kwargs)

    def patch(self, path: str, payload=None, **kwargs) -> Resp:
        return self.request("PATCH", path, payload, **kwargs)

    def delete(self, path: str, **kwargs) -> Resp:
        return self.request("DELETE", path, **kwargs)


def check(name: str, condition: bool, detail: str = "") -> bool:
    if condition:
        PASSED.append(name)
        print(f"  {GREEN}PASS{RESET}  {name}")
    else:
        FAILED.append(name)
        print(f"  {RED}FAIL{RESET}  {name}" + (f"  ({detail})" if detail else ""))
    return condition


def rand_name(prefix: str) -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"{prefix}{suffix}"


def query_of(url: str) -> dict:
    if not url:
        return {}
    query = parse_qs(urlsplit(url).query)
    return {key: values[0] for key, values in query.items() if values}


def discover_base() -> str:
    for port in range(8600, 8630):
        try:
            client = Client(f"http://127.0.0.1:{port}")
            resp = client.get("/api/v1/health")
            if resp.status == 200 and resp.json().get("app") == "YiStarLine Account":
                return client.base
        except OSError:
            continue
    return "http://127.0.0.1:8600"


def main() -> int:
    parser = argparse.ArgumentParser(description="YiStarLine Account 端到端自检")
    parser.add_argument("--base", default="", help="服务地址，默认自动探测 8600-8629")
    parser.add_argument("--keep", action="store_true", help="保留测试账户，便于在界面里查看")
    args = parser.parse_args()

    base = (args.base or discover_base()).rstrip("/")
    print(f"\nYiStarLine Account 自检 · 目标 {base}\n")
    client = Client(base)
    other = Client(base)

    user = rand_name("selftest_")
    password = "Str0ng!Passw0rd#2024"
    password2 = "N3w!Passw0rd#2025"
    password3 = "Reset!Passw0rd#2026"

    # ------------------------------------------------------------ 1
    print("[1] 服务与基础防护")
    health = client.get("/api/v1/health")
    check("健康检查返回 200", health.status == 200, f"status={health.status}")
    check("应用名正确", health.json().get("app") == "YiStarLine Account")

    config = client.get("/api/public/config")
    check("公共配置可读", config.status == 200 and config.json().get("ok") is True)
    demo_app_id = config.json().get("demo_app_id", "")
    check("内置示例应用已注册", bool(demo_app_id), demo_app_id)

    blocked = client.request("POST", "/api/auth/login", {"username": "x", "password": "y"},
                             headers={"X-YL-Client": ""})
    check("缺少请求标识时拒绝写入", blocked.status == 403, f"status={blocked.status}")

    host_resp = Client(base).request("GET", "/api/v1/health", host="evil.example.com")
    check("非法 Host 头被拒绝", host_resp.status == 403, f"status={host_resp.status}")

    token_resp = client.get("/api/system")
    check("未登录不能读取系统信息", token_resp.status == 401, f"status={token_resp.status}")

    # ------------------------------------------------------------ 2
    print("\n[2] 注册与登录")
    reg = client.post("/api/auth/register", {
        "username": user, "display_name": "自检账户", "password": password,
    })
    reg_json = reg.json()
    check("注册成功", reg.status == 201, f"status={reg.status} body={reg.text[:160]}")
    recovery_codes = reg_json.get("recovery_codes") or []
    check("返回 10 个恢复码", len(recovery_codes) == 10, str(len(recovery_codes)))
    check("注册后自动登录", bool(client.cookies.get("yl_session")))

    dup = other.post("/api/auth/register", {"username": user, "password": password})
    check("重复用户名被拒绝",
          dup.status == 400 and dup.json().get("error", {}).get("code") == "username_taken",
          f"status={dup.status}")

    weak = other.post("/api/auth/register", {"username": rand_name("weak_"), "password": "123"})
    check("弱密码被拒绝", weak.status == 400, f"status={weak.status}")

    session = client.get("/api/auth/session")
    check("会话包含当前用户", session.json().get("user", {}).get("username") == user)

    # 本机账户列表与受信设备快捷登录
    accounts = client.get("/api/public/accounts")
    account_items = accounts.json().get("items", [])
    check("账户列表包含已注册账户",
          any(item.get("username") == user for item in account_items),
          str(account_items)[:120])
    check("本设备被标记为可快捷登录", accounts.json().get("device_username") == user)

    anonymous = Client(base)
    denied = anonymous.post("/api/auth/quick", {})
    check("无受信设备时拒绝快捷登录",
          denied.status == 401 and denied.json().get("error", {}).get("code") == "device_untrusted",
          f"status={denied.status}")

    quick_client = Client(base)
    device_token = client.cookies.get("yl_device", "")
    check("注册后下发受信设备凭据", bool(device_token))
    quick_client.cookies = {"yl_device": device_token}
    quick_resp = quick_client.post("/api/auth/quick", {})
    check("受信设备可一键快捷登录",
          quick_resp.status == 200 and quick_resp.json().get("user", {}).get("username") == user,
          f"status={quick_resp.status} {quick_resp.text[:120]}")

    # ------------------------------------------------------------ 3
    print("\n[3] 应用注册与 SSO 授权")
    redirect_uri = f"{base}/cb-check"
    created = client.post("/api/apps", {
        "name": "自检产品", "description": "selftest", "redirect_uris": redirect_uri,
    })
    app = created.json().get("app") or {}
    app_id = app.get("app_id", "")
    app_secret = created.json().get("app_secret", "")
    check("创建接入应用", created.status == 201 and app_id.startswith("ylc_"), f"status={created.status}")
    check("返回应用密钥", app_secret.startswith("ylsec_"))

    # YiStarLine Protect：应用码、发布者、认证答题
    public_code = app.get("public_code", "")
    check("应用分配应用码", public_code.startswith("YLP-") and len(public_code) == 18, public_code)
    check("应用记录发布者", bool(app.get("publisher")), str(app.get("publisher")))
    check("新应用默认未认证", app.get("protect", {}).get("verified") is False)

    lookup = Client(base).get("/api/v1/apps/lookup?code=" + public_code)
    lookup_json = lookup.json().get("app") or {}
    check("外部可按应用码识别应用",
          lookup.status == 200 and lookup_json.get("name") == "自检产品",
          f"status={lookup.status}")
    check("外部可见发布者与认证状态",
          lookup_json.get("publisher") == app.get("publisher")
          and lookup.json().get("protect", {}).get("verified") is False)

    review = client.get(f"/api/apps/{app_id}/protect")
    items = review.json().get("items") or []
    checks = review.json().get("checks") or []
    check("获取 Protect 合规声明", review.status == 200 and len(items) >= 8, str(len(items)))
    check("自动校验项齐全", len(checks) >= 3, str(len(checks)))

    empty = client.post(f"/api/apps/{app_id}/protect/verify", {"accepted": []})
    check("未确认声明无法通过",
          empty.status == 400 and empty.json().get("error", {}).get("code") == "compliance_incomplete",
          f"status={empty.status}")

    all_ids = [item["id"] for item in items]
    passed = client.post(f"/api/apps/{app_id}/protect/verify", {
        "accepted": all_ids, "privacy_url": "https://example.com/privacy",
    })
    protect = passed.json().get("protect") or {}
    check("确认全部声明后通过认证", passed.status == 200 and protect.get("verified") is True,
          f"status={passed.status} {passed.text[:120]}")
    check("认证带证书编号", str(protect.get("certificate_id", "")).startswith("YLP-CERT-"))

    # 首次授权：未登记的应用码直接弹确认页，无需手输
    new_code = "YLP-TEST-9K7M-4Q2X"
    redirect_first = f"{base}/first-use"
    first = client.get("/sso/authorize?" + urlencode({
        "code": new_code, "redirect_uri": redirect_first, "state": "s1",
        "name": "首次授权产品", "publisher": "外部开发者",
    }))
    location = first.header("Location") or ""
    check("未知应用码进入首次授权页",
          first.status == 302 and "/#/authorize" in location and "code=" in location,
          location[:120])

    pending = client.post("/api/sso/consent", {
        "code": new_code, "name": "首次授权产品", "publisher": "外部开发者",
        "redirect_uri": redirect_first, "state": "s1",
    })
    check("首次授权返回待登记应用",
          pending.status == 200 and pending.json().get("pending") is True,
          f"status={pending.status}")

    approved = client.post("/api/sso/approve", {
        "code": new_code, "name": "首次授权产品", "publisher": "外部开发者",
        "redirect_uri": redirect_first, "state": "s1",
    })
    target = approved.json().get("redirect", "")
    check("确认后签发票据", approved.status == 200 and "ticket=ylt_" in target, target[:100])

    ticket = ""
    if "ticket=" in target:
        ticket = target.split("ticket=")[1].split("&")[0]
    redeemed_first = Client(base).post("/api/v1/ticket/redeem", {
        "client_id": new_code, "ticket": ticket,
    })
    check("导入应用无需密钥即可兑换",
          redeemed_first.status == 200 and redeemed_first.json().get("access_token", "").startswith("yla_"),
          f"status={redeemed_first.status} {redeemed_first.text[:100]}")

    again = client.get("/sso/authorize?" + urlencode({
        "code": new_code, "redirect_uri": redirect_first, "state": "s2",
    }))
    check("再次授权走普通确认页",
          again.status == 302 and "app_id=" in (again.header("Location") or ""),
          (again.header("Location") or "")[:100])

    after = Client(base).get("/api/v1/apps/lookup?code=" + public_code).json()
    check("认证状态对外可见", after.get("protect", {}).get("verified") is True)

    first = client.get("/sso/authorize?" + urlencode({
        "app_id": app_id, "redirect_uri": redirect_uri, "state": "xyz",
    }))
    check("首次授权跳转到确认页",
          first.status == 302 and "/#/authorize" in first.header("Location"),
          first.header("Location")[:120])

    consent = client.post("/api/sso/consent",
                          {"app_id": app_id, "redirect_uri": redirect_uri, "state": "xyz"})
    check("确认页可读取应用信息",
          consent.status == 200 and consent.json().get("app", {}).get("name") == "自检产品")
    check("首次授权标记为未授权", consent.json().get("granted") is False)

    approved = client.post("/api/sso/approve",
                           {"app_id": app_id, "redirect_uri": redirect_uri,
                            "state": "xyz", "remember": True})
    approved_json = approved.json()
    check("授权通过并返回回调地址",
          approved.status == 200 and bool(approved_json.get("redirect")))
    params = query_of(approved_json.get("redirect", ""))
    ticket = params.get("ticket", "")
    check("回调携带一次性票据", ticket.startswith("ylt_"), ticket[:12])
    check("回调回传 state", params.get("state") == "xyz", str(params))

    redeemed = other.post("/api/v1/ticket/redeem",
                          {"app_id": app_id, "app_secret": app_secret, "ticket": ticket})
    redeemed_json = redeemed.json()
    access_token = redeemed_json.get("access_token", "")
    check("票据兑换成功", redeemed.status == 200 and access_token.startswith("yla_"),
          f"status={redeemed.status} {redeemed.text[:120]}")
    check("兑换返回用户资料", redeemed_json.get("user", {}).get("username") == user)
    check("兑换返回应用信息", redeemed_json.get("app", {}).get("app_id") == app_id)

    replay = other.post("/api/v1/ticket/redeem",
                        {"app_id": app_id, "app_secret": app_secret, "ticket": ticket})
    check("票据不可重复使用",
          replay.status == 400 and replay.json().get("error", {}).get("code") == "invalid_ticket",
          f"status={replay.status}")

    wrong_secret = other.post("/api/v1/ticket/redeem",
                              {"app_id": app_id, "app_secret": "ylsec_wrong", "ticket": ticket})
    check("错误应用密钥被拒绝", wrong_secret.status == 401, f"status={wrong_secret.status}")

    info = other.get("/api/v1/userinfo", headers={"Authorization": f"Bearer {access_token}"})
    check("访问令牌可读取用户",
          info.status == 200 and info.json().get("user", {}).get("username") == user,
          f"status={info.status}")
    bad_token = other.get("/api/v1/userinfo", headers={"Authorization": "Bearer yla_invalid"})
    check("无效令牌被拒绝", bad_token.status == 401, f"status={bad_token.status}")

    silent = client.get("/sso/authorize?" + urlencode({
        "app_id": app_id, "redirect_uri": redirect_uri, "state": "s1", "prompt": "none",
    }))
    check("已授权产品可静默登录",
          silent.status == 302 and query_of(silent.header("Location")).get("ticket", "").startswith("ylt_"),
          silent.header("Location")[:120])

    anon_silent = Client(base).get("/sso/authorize?" + urlencode({
        "app_id": app_id, "redirect_uri": redirect_uri, "state": "s2", "prompt": "none",
    }))
    check("未登录时静默登录返回 login_required",
          query_of(anon_silent.header("Location")).get("error") == "login_required",
          str(query_of(anon_silent.header("Location"))))

    evil = client.get("/sso/authorize?" + urlencode({
        "app_id": app_id, "redirect_uri": "http://evil.example.com/cb", "state": "s3",
    }))
    check("非白名单回调被拒绝", evil.status == 400, f"status={evil.status}")

    grants = client.get("/api/grants")
    check("授权列表包含该产品",
          any(item.get("app_id") == app_id for item in grants.json().get("items", [])))
    tokens = client.get("/api/tokens")
    token_items = tokens.json().get("items", [])
    check("令牌列表包含该访问令牌", any(item.get("app_id") == app_id for item in token_items))

    # ------------------------------------------------------------ 4
    print("\n[4] 内置示例产品链路")
    demo_redirect = f"{base}/demo/callback"
    demo_approved = client.post("/api/sso/approve", {
        "app_id": demo_app_id, "redirect_uri": demo_redirect,
        "state": "demo-state", "remember": True,
    })
    demo_ticket = query_of(demo_approved.json().get("redirect", "")).get("ticket", "")
    check("示例应用获取到票据", demo_ticket.startswith("ylt_"), demo_ticket[:12])
    callback = client.get("/demo/callback?" + urlencode({"ticket": demo_ticket, "state": "demo-state"}))
    check("示例回调完成兑换", callback.status == 200 and "登录成功" in callback.text,
          f"status={callback.status}")
    demo_me = client.get("/demo/api/me")
    check("示例产品读取到登录用户",
          demo_me.status == 200 and demo_me.json().get("user", {}).get("username") == user,
          f"status={demo_me.status}")
    check("示例产品页面可访问", client.get("/demo/").status == 200)

    # ------------------------------------------------------------ 5
    print("\n[5] 开发者模式（协议解锁）")
    partial = client.post("/api/developer/unlock", {"accepted": ["item1", "item2"]})
    check("缺少协议时拒绝解锁",
          partial.status == 400 and partial.json().get("error", {}).get("code") == "agreement_required",
          f"status={partial.status}")
    session_before = client.get("/api/auth/session").json()
    check("默认不显示开发者入口", session_before.get("developer") is False)
    all_items = ["item1", "item2", "item3", "item4", "item5"]
    unlocked = client.post("/api/developer/unlock", {"accepted": all_items})
    check("全部勾选后解锁", unlocked.status == 200 and unlocked.json().get("developer") is True,
          f"status={unlocked.status} {unlocked.text[:120]}")
    check("会话返回开发者标记", client.get("/api/auth/session").json().get("developer") is True)
    locked = client.post("/api/developer/lock", {})
    check("可关闭开发者模式", locked.status == 200 and locked.json().get("developer") is False)
    client.post("/api/developer/unlock", {"accepted": all_items})

    # ------------------------------------------------------------ 6
    print("\n[6] 密码、失败锁定与恢复码")
    wrong = other.post("/api/auth/login", {"username": user, "password": "bad-password"})
    check("错误密码被拒绝", wrong.status == 401, f"status={wrong.status}")

    changed = client.post("/api/auth/password", {"current": password, "password": password2})
    check("修改密码成功", changed.status == 200, f"status={changed.status} {changed.text[:120]}")
    check("旧密码已失效",
          other.post("/api/auth/login", {"username": user, "password": password}).status == 401)

    lock_client = Client(base)
    lock_user = rand_name("lock_")
    lock_reg = lock_client.post("/api/auth/register", {"username": lock_user, "password": password})
    check("创建锁定测试账户", lock_reg.status == 201, f"status={lock_reg.status}")
    for _ in range(6):
        other.post("/api/auth/login", {"username": lock_user, "password": "wrong-password"})
    locked = other.post("/api/auth/login", {"username": lock_user, "password": "wrong-password"})
    check("连续失败触发临时锁定", locked.status == 429, f"status={locked.status}")
    lock_cleanup = lock_client.post("/api/account/delete", {"password": password})
    check("锁定不影响已登录会话", lock_cleanup.status == 200, f"status={lock_cleanup.status}")

    reset = other.post("/api/auth/reset", {
        "username": user, "code": recovery_codes[0], "password": password3,
    })
    check("恢复码重置密码成功", reset.status == 200, f"status={reset.status} {reset.text[:120]}")
    reuse = other.post("/api/auth/reset", {
        "username": user, "code": recovery_codes[0], "password": "Another!Passw0rd#2027",
    })
    check("恢复码不可复用", reuse.status == 400, f"status={reuse.status}")
    check("重置后旧会话已失效", client.get("/api/auth/session").json().get("user") is None)

    relogin = client.post("/api/auth/login", {"username": user, "password": password3, "remember": True})
    check("新密码可以登录", relogin.status == 200, f"status={relogin.status}")

    logout_client = Client(base)
    logout_client.post("/api/auth/login", {"username": user, "password": password3})
    check("退出登录成功", logout_client.post("/api/auth/logout", {}).status == 200)
    check("退出后会话失效", logout_client.get("/api/auth/session").json().get("user") is None)

    # ------------------------------------------------------------ 7
    print("\n[7] 审计日志、令牌作废与账户删除")
    activity = client.get("/api/activity?limit=80")
    events = [item.get("event") for item in activity.json().get("items", [])]
    check("记录了登录事件", "login" in events or "login_failed" in events, str(events[:6]))
    check("记录了授权事件", "sso_authorized" in events, str(events[:6]))
    check("记录了票据兑换事件", "ticket_redeemed" in events, str(events[:6]))

    if args.keep:
        print(f"\n保留测试账户：{user} / {password3}")
    else:
        first_token = next((t.get("id") for t in token_items if t.get("app_id") == app_id), "")
        revoke = client.post("/api/tokens/revoke", {"id": first_token})
        check("作废访问令牌", revoke.status == 200, f"status={revoke.status}")
        revoked_info = other.get("/api/v1/userinfo",
                                 headers={"Authorization": f"Bearer {access_token}"})
        check("作废后令牌立即失效", revoked_info.status == 401, f"status={revoked_info.status}")

        product_out = client.post("/api/products/logout", {"app_id": app_id})
        check("退出已登录软件", product_out.status == 200, f"status={product_out.status}")
        grants_after = client.get("/api/grants").json().get("items", [])
        check("退出后撤销该软件授权",
              not any(item.get("app_id") == app_id for item in grants_after))

        second = Client(base)
        second_user = rand_name("selftest2_")
        second.post("/api/auth/register", {"username": second_user, "password": password})
        deleted = second.post("/api/account/delete", {"password": password})
        check("删除账户成功", deleted.status == 200, f"status={deleted.status} {deleted.text[:120]}")
        check("删除后会话失效", second.get("/api/auth/session").json().get("user") is None)
        check("删除后无法登录",
              Client(base).post("/api/auth/login",
                                {"username": second_user, "password": password}).status == 401)

        cleanup = client.post("/api/account/delete", {"password": password3})
        check("清理自检账户", cleanup.status == 200, f"status={cleanup.status}")

    print("\n" + "-" * 60)
    print(f"通过 {len(PASSED)} 项 · 失败 {len(FAILED)} 项")
    if FAILED:
        print("失败项：")
        for item in FAILED:
            print(f"  - {item}")
        return 1
    print("全部通过 ✔")
    return 0


if __name__ == "__main__":
    sys.exit(main())
