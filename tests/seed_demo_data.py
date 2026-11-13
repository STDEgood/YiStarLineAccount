#!/usr/bin/env python3
"""生成一份用于界面演示/截图的数据（仅开发自检使用）。

用法:
    python tests/seed_demo_data.py --base http://127.0.0.1:8621 --out tests/.seed.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from selftest import Client  # noqa: E402

EDGE_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")
FIREFOX_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) "
              "Gecko/20100101 Firefox/133.0")
BACKEND_UA = "python-urllib/3.13 (product-backend)"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8621")
    parser.add_argument("--out", default="tests/.seed.json")
    parser.add_argument("--user", default="yistar")
    parser.add_argument("--password", default="StarLine!2026")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    client = Client(base)
    client.cookies = {}

    reg = client.post("/api/auth/register", {
        "username": args.user,
        "display_name": "Ystar",
        "password": args.password,
        "email": "ystar@yistarline.local",
    }, headers={"User-Agent": EDGE_UA})
    if reg.status not in (200, 201):
        login = client.post("/api/auth/login", {"username": args.user, "password": args.password},
                            headers={"User-Agent": EDGE_UA})
        if login.status != 200:
            print(f"无法创建或登录演示账户: {login.status} {login.text[:200]}")
            return 1
    cookie = client.cookies.get("yl_session", "")

    config = client.get("/api/public/config").json()
    demo_app_id = config.get("demo_app_id", "")

    apps = {}
    for name, redirect, desc in (
        ("YiStarLine Notes", f"{base}/demo/callback", "本地笔记应用 · 内置示例"),
        ("个人博客后台", "http://127.0.0.1:5173/sso/callback", "Hexo 博客管理面板"),
        ("音乐播放器", "http://127.0.0.1:8080/auth/yistarline", "桌面音乐播放器"),
    ):
        created = client.post("/api/apps", {
            "name": name, "description": desc, "redirect_uris": redirect,
        })
        if created.status == 201:
            body = created.json()
            apps[name] = {"app_id": body["app"]["app_id"],
                          "secret": body["app_secret"], "redirect": redirect}

    # 授权两个产品并各兑换一次令牌，让审计与令牌列表更真实
    for name in ("YiStarLine Notes", "个人博客后台"):
        info = apps.get(name)
        if not info:
            continue
        approved = client.post("/api/sso/approve", {
            "app_id": info["app_id"], "redirect_uri": info["redirect"],
            "state": "seed", "remember": True,
        })
        redirect_url = approved.json().get("redirect", "")
        from urllib.parse import parse_qs, urlsplit
        ticket = parse_qs(urlsplit(redirect_url).query).get("ticket", [""])[0]
        backend = Client(base)
        backend.post("/api/v1/ticket/redeem", {
            "app_id": info["app_id"], "app_secret": info["secret"], "ticket": ticket,
        }, headers={"User-Agent": BACKEND_UA})

    # 第二个设备会话（Firefox）
    second = Client(base)
    second.post("/api/auth/login", {
        "username": args.user, "password": args.password, "remember": False,
    }, headers={"User-Agent": FIREFOX_UA})

    # 一次失败的登录，让审计记录更完整
    Client(base).post("/api/auth/login", {
        "username": args.user, "password": "not-the-password",
    }, headers={"User-Agent": BACKEND_UA})

    # 第二个账户，用于展示登录页的账户选择与密码步骤
    second = Client(base)
    second_reg = second.post("/api/auth/register", {
        "username": "studio",
        "display_name": "Studio",
        "password": args.password,
    }, headers={"User-Agent": FIREFOX_UA})
    print("second account:", second_reg.status)

    payload = {
        "base": base,
        "cookie": cookie,
        "device": client.cookies.get("yl_device", ""),
        "user": args.user,
        "password": args.password,
        "apps": apps,
        "demo_app_id": demo_app_id,
    }
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "user": args.user, "apps": list(apps), "out": args.out},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
