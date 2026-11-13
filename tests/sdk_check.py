#!/usr/bin/env python3
"""SDK 冒烟测试：验证 integration/python 下的客户端能完成完整链路。

用法: python tests/sdk_check.py --base http://127.0.0.1:8600 --seed tests/.seed.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))
sys.path.insert(0, str(ROOT / "integration" / "python"))

from selftest import Client  # noqa: E402
from yistarline_sso import SSOError, YiStarLineSSO  # noqa: E402

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name}  {detail}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8600")
    parser.add_argument("--seed", default=str(ROOT / "tests" / ".seed.json"))
    args = parser.parse_args()

    base = args.base.rstrip("/")
    seed = json.loads(Path(args.seed).read_text(encoding="utf-8"))
    app = seed["apps"]["YiStarLine Notes"]

    print(f"\nSDK 冒烟测试 · {base}\n")
    browser = Client(base)
    browser.cookies = {"yl_session": seed["cookie"]}

    approved = browser.post("/api/sso/approve", {
        "app_id": app["app_id"],
        "redirect_uri": app["redirect"],
        "state": "sdk-check",
        "remember": True,
    })
    redirect_url = approved.json().get("redirect", "")
    ticket = parse_qs(urlsplit(redirect_url).query).get("ticket", [""])[0]
    check("获取一次性票据", ticket.startswith("ylt_"), redirect_url[:100])

    sso = YiStarLineSSO(app["app_id"], app["secret"], base)
    health = sso.health()
    check("health()", health.get("ok") is True and health.get("app") == "YiStarLine Account")

    verified = sso.verify()
    check("verify()", verified.get("app", {}).get("app_id") == app["app_id"])

    auth_url = sso.authorize_url("http://127.0.0.1:5173/sso/callback", state="n1")
    check("authorize_url()", "app_id=" in auth_url and "state=n1" in auth_url)
    silent_url = sso.silent_url("http://127.0.0.1:5173/sso/callback")
    check("silent_url() 带 prompt=none", "prompt=none" in silent_url)

    info = sso.redeem(ticket)
    token = info.get("access_token", "")
    check("redeem() 返回用户", info.get("user", {}).get("username") == seed["user"])
    check("redeem() 返回令牌", token.startswith("yla_"))

    me = sso.userinfo(token)
    check("userinfo()", me.get("user", {}).get("username") == seed["user"])

    try:
        sso.redeem(ticket)
        check("票据不可重复兑换", False, "第二次兑换居然成功了")
    except SSOError as exc:
        check("票据不可重复兑换", exc.code == "invalid_ticket", exc.code)

    check("logout()", sso.logout(token) is True)
    try:
        sso.userinfo(token)
        check("令牌作废后失效", False, "作废后仍可读取")
    except SSOError as exc:
        check("令牌作废后失效", exc.code == "invalid_token", exc.code)

    login = sso.login(seed["user"], seed["password"])
    check("login() 密码登录", login.get("user", {}).get("username") == seed["user"], str(login)[:120])
    sso.logout(login["access_token"])

    ticket2, state2 = YiStarLineSSO.ticket_from_url("http://x/cb?ticket=ylt_abc&state=zz")
    check("ticket_from_url()", ticket2 == "ylt_abc" and state2 == "zz")

    print(f"\n通过 {len(PASSED)} 项 · 失败 {len(FAILED)} 项")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
