"""HTTP API：账户中心、SSO 授权、对外 /api/v1 接口与内置示例产品。"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import parse_qsl, quote, urlencode, urlsplit

from . import config, security, sso
from .sso import SSOError, app_public, public_user
from .store import Store, now

JSON_CT = "application/json; charset=utf-8"
RUN_KEY = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
AUTOSTART_VALUE = "YiStarLineAccount"
COOKIE = "yl_session"
DEMO_COOKIE = "yl_demo_token"
DEVICE_COOKIE = "yl_device"
DEVICE_TTL = 90 * 86400

# 开发者模式需要逐条同意的协议（顺序与前端一致）
DEVELOPER_AGREEMENTS = ("item1", "item2", "item3", "item4", "item5")

# YiStarLine Protect：官方合规检查（开发者申报 + 自动校验），不是知识测验
PROTECT_VALID_DAYS = 365
PROTECT_ITEMS = (
    {"id": "data.minimal", "group": "data", "required": True},
    {"id": "data.no_share", "group": "data", "required": True},
    {"id": "data.retention", "group": "data", "required": True},
    {"id": "privacy.policy", "group": "privacy", "required": True},
    {"id": "security.redirect", "group": "security", "required": True},
    {"id": "security.secret", "group": "security", "required": True},
    {"id": "security.log", "group": "security", "required": True},
    {"id": "lifecycle.delete", "group": "lifecycle", "required": True},
    {"id": "support.contact", "group": "lifecycle", "required": True},
)

# 服务端渲染页面使用的少量文案（按 Accept-Language 选择）
MESSAGES = {
    "app_not_found": {
        "zh": ("应用不存在", "该产品尚未在此设备注册接入，请先在“开发者”页面创建应用。"),
        "en": ("Application not found", "This product is not registered on this device. Create an application on the Developers page first."),
        "ja": ("アプリが見つかりません", "この製品はこの端末に登録されていません。まず開発者ページでアプリケーションを作成してください。"),
    },
    "invalid_redirect": {
        "zh": ("回调地址不合法", "回调地址不在该应用的白名单内。"),
        "en": ("Invalid redirect URI", "The redirect URI is not in this application's whitelist."),
        "ja": ("リダイレクト URI が不正です", "リダイレクト URI がアプリケーションの許可リストにありません。"),
    },
    "demo_ok": {
        "zh": ("登录成功", "正在把登录结果交还给示例产品，窗口即将自动关闭。"),
        "en": ("Signed in", "Handing the result back to the demo product. This window closes automatically."),
        "ja": ("サインインしました", "結果をデモ製品に返しています。このウィンドウは自動的に閉じます。"),
    },
    "demo_failed": {
        "zh": ("登录未完成", ""),
        "en": ("Sign-in incomplete", ""),
        "ja": ("サインイン未完了", ""),
    },
    "demo_canceled": {
        "zh": ("已取消授权", "你没有授权这个示例产品。"),
        "en": ("Authorization cancelled", "You did not authorize this demo product."),
        "ja": ("認可をキャンセルしました", "このデモ製品を認可しませんでした。"),
    },
    "demo_no_app": {
        "zh": ("示例应用尚未初始化", "请重启 YiStarLine Account 服务。"),
        "en": ("Demo application not initialised", "Please restart the YiStarLine Account service."),
        "ja": ("デモアプリが初期化されていません", "YiStarLine Account サービスを再起動してください。"),
    },
    "demo_no_ticket": {
        "zh": ("缺少授权票据", "请重新从示例产品发起登录。"),
        "en": ("Missing ticket", "Start the sign-in again from the demo product."),
        "ja": ("チケットがありません", "デモ製品から再度サインインしてください。"),
    },
    "close_hint": {
        "zh": "如果没有自动关闭，请手动关闭此窗口。",
        "en": "If the window does not close by itself, close it manually.",
        "ja": "自動で閉じない場合は手動で閉じてください。",
    },
}


def detect_lang(accept_language: str) -> str:
    value = (accept_language or "").lower()
    for part in value.split(","):
        tag = part.split(";")[0].strip()
        if tag.startswith("zh"):
            return "zh"
        if tag.startswith("ja"):
            return "ja"
        if tag.startswith("en"):
            return "en"
    return "zh"


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class Reply:
    def __init__(self, status: int = 200, body: bytes = b"", content_type: str = JSON_CT,
                 headers: list[tuple[str, str]] | None = None):
        self.status = status
        self.body = body
        self.content_type = content_type
        self.headers = list(headers or [])


def json_reply(payload, status: int = 200, headers: list[tuple[str, str]] | None = None) -> Reply:
    return Reply(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), JSON_CT, headers)


def html_reply(markup: str, status: int = 200, headers: list[tuple[str, str]] | None = None) -> Reply:
    return Reply(status, markup.encode("utf-8"), "text/html; charset=utf-8", headers)


def redirect(location: str, headers: list[tuple[str, str]] | None = None) -> Reply:
    extra = list(headers or [])
    extra.append(("Location", location))
    return Reply(302, b"", "text/plain; charset=utf-8", extra)


class Request:
    """一次 HTTP 请求的不可变快照。"""

    def __init__(self, method: str, path: str, query: dict, headers: dict, cookies: dict,
                 body: bytes, ip: str):
        self.method = method.upper()
        self.path = path
        self.query = query
        self.headers = headers
        self.cookies = cookies
        self.body = body or b""
        self.ip = ip
        self._json = None
        self.user = None
        self.session = None
        self.session_token = ""

    @property
    def ua(self) -> str:
        return self.headers.get("user-agent", "")

    def json(self) -> dict:
        if self._json is None:
            if not self.body:
                self._json = {}
            else:
                try:
                    parsed = json.loads(self.body.decode("utf-8"))
                    self._json = parsed if isinstance(parsed, dict) else {}
                except (ValueError, UnicodeDecodeError):
                    raise ApiError(400, "invalid_json", "请求内容不是合法的 JSON")
        return self._json

    def arg(self, name: str, default: str = "") -> str:
        value = self.query.get(name)
        return default if value is None else value


def _str(data: dict, key: str, default: str = "") -> str:
    value = data.get(key, default)
    if value is None:
        return default
    if not isinstance(value, str):
        return str(value)
    return value


def _bool(data: dict, key: str, default: bool = False) -> bool:
    value = data.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def _parse_redirect_list(value) -> list[str]:
    if isinstance(value, str):
        raw = re.split(r"[\r\n,]+", value)
    elif isinstance(value, (list, tuple)):
        raw = [str(item) for item in value]
    else:
        raw = []
    uris: list[str] = []
    for item in raw:
        text = item.strip()
        if not text:
            continue
        if len(uris) >= 10:
            raise ApiError(400, "too_many_redirects", "回调地址最多 10 条")
        if "{port}" in text:
            base = text.replace("{port}", "8600")
            security.validate_redirect_uri(base)
        else:
            security.validate_redirect_uri(text)
        if text not in uris:
            uris.append(text)
    if not uris:
        raise ApiError(400, "missing_redirect", "请至少填写一个回调地址")
    return uris


class Api:
    def __init__(self, store: Store, engine: sso.SSOEngine, cfg: dict, base_url: str,
                 started_at: float, on_shutdown=None):
        self.store = store
        self.engine = engine
        self.cfg = cfg
        self.base_url = base_url.rstrip("/")
        self.started_at = started_at
        self.on_shutdown = on_shutdown
        self._routes: list[tuple[str, re.Pattern, object]] = []
        self._register_routes()

    # ------------------------------------------------------------------ 路由表
    def _route(self, method: str, pattern: str, handler) -> None:
        self._routes.append((method, re.compile(pattern), handler))

    def _register_routes(self) -> None:
        r = self._route
        r("GET", r"^/api/public/config$", self.public_config)
        r("GET", r"^/api/public/accounts$", self.public_accounts)
        r("GET", r"^/api/auth/session$", self.session_info)
        r("POST", r"^/api/auth/register$", self.register)
        r("POST", r"^/api/auth/login$", self.login)
        r("POST", r"^/api/auth/quick$", self.quick_login)
        r("POST", r"^/api/auth/logout$", self.logout)
        r("POST", r"^/api/auth/password$", self.change_password)
        r("POST", r"^/api/auth/recovery$", self.recovery_probe)
        r("POST", r"^/api/auth/reset$", self.recovery_reset)
        r("POST", r"^/api/auth/recovery/regenerate$", self.recovery_regenerate)
        r("PATCH", r"^/api/me$", self.update_me)
        r("GET", r"^/api/sessions$", self.list_sessions)
        r("POST", r"^/api/sessions/revoke$", self.revoke_session)
        r("POST", r"^/api/sessions/revoke-others$", self.revoke_other_sessions)
        r("GET", r"^/api/grants$", self.list_grants)
        r("POST", r"^/api/grants/revoke$", self.revoke_grant)
        r("GET", r"^/api/tokens$", self.list_tokens)
        r("POST", r"^/api/tokens/revoke$", self.revoke_token)
        r("POST", r"^/api/products/logout$", self.product_logout)
        r("POST", r"^/api/developer/unlock$", self.developer_unlock)
        r("POST", r"^/api/developer/lock$", self.developer_lock)
        r("GET", r"^/api/apps$", self.list_apps)
        r("POST", r"^/api/apps$", self.create_app)
        r("PATCH", r"^/api/apps/([\w\-]+)$", self.update_app)
        r("DELETE", r"^/api/apps/([\w\-]+)$", self.delete_app)
        r("POST", r"^/api/apps/([\w\-]+)/secret$", self.rotate_secret)
        r("GET", r"^/api/apps/([\w\-]+)/protect$", self.protect_state)
        r("POST", r"^/api/apps/([\w\-]+)/protect/verify$", self.protect_verify)
        r("POST", r"^/api/apps/([\w\-]+)/protect/revoke$", self.protect_revoke)
        r("GET", r"^/api/activity$", self.list_activity)
        r("DELETE", r"^/api/activity$", self.clear_activity)
        r("GET", r"^/api/system$", self.system_info)
        r("POST", r"^/api/system/autostart$", self.set_autostart)
        r("POST", r"^/api/system/backup$", self.make_backup)
        r("POST", r"^/api/system/open$", self.open_folder)
        r("POST", r"^/api/system/shutdown$", self.shutdown)
        r("POST", r"^/api/account/delete$", self.delete_account)
        # SSO
        r("GET", r"^/sso/authorize$", self.authorize)
        r("POST", r"^/api/sso/consent$", self.consent_info)
        r("POST", r"^/api/sso/approve$", self.approve)
        r("POST", r"^/api/sso/deny$", self.deny)
        # 对外协议 /api/v1
        r("GET", r"^/api/v1/health$", self.v1_health)
        r("POST", r"^/api/v1/auth/login$", self.v1_login)
        r("POST", r"^/api/v1/ticket/redeem$", self.v1_redeem)
        r("GET", r"^/api/v1/userinfo$", self.v1_userinfo)
        r("POST", r"^/api/v1/logout$", self.v1_logout)
        r("POST", r"^/api/v1/app/verify$", self.v1_app_verify)
        r("GET", r"^/api/v1/apps/lookup$", self.v1_app_lookup)
        # 示例产品
        r("GET", r"^/demo/callback$", self.demo_callback)
        r("GET", r"^/demo/api/me$", self.demo_me)
        r("POST", r"^/demo/api/login$", self.demo_login)
        r("POST", r"^/demo/api/logout$", self.demo_logout)

    # ------------------------------------------------------------------ 分发
    def handle(self, req: Request) -> Reply:
        try:
            self._attach_session(req)
            self._check_csrf(req)
            for method, pattern, handler in self._routes:
                if method != req.method and not (method == "GET" and req.method == "HEAD"):
                    continue
                match = pattern.match(req.path)
                if match:
                    return handler(req, *match.groups())
            if req.path.startswith("/api/"):
                raise ApiError(404, "not_found", "接口不存在")
            raise ApiError(404, "not_found", "页面不存在")
        except ApiError as exc:
            return self._error(exc.status, exc.code, exc.message, req)
        except SSOError as exc:
            return self._error(exc.status, exc.code, exc.message, req)
        except security.ValidationError as exc:
            return self._error(400, exc.code, exc.message, req)
        except Exception as exc:  # pragma: no cover - 兜底
            import traceback

            traceback.print_exc()
            return self._error(500, "server_error", f"服务内部错误：{exc}", req)

    def _error(self, status: int, code: str, message: str, req: Request) -> Reply:
        payload = {"error": {"code": code, "message": message}, "ok": False}
        headers = [("Cache-Control", "no-store")]
        if req.path.startswith("/api/v1/"):
            headers.extend(self._cors(req))
        return json_reply(payload, status, headers)

    def _cors(self, req: Request) -> list[tuple[str, str]]:
        origin = req.headers.get("origin", "")
        return [
            ("Access-Control-Allow-Origin", origin or "*"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type, Authorization"),
            ("Access-Control-Max-Age", "600"),
            ("Vary", "Origin"),
        ]

    def preflight(self, req: Request) -> Reply:
        return Reply(200, b"", "text/plain; charset=utf-8",
                     self._cors(req) + [("Cache-Control", "no-store")])

    # ------------------------------------------------------------------ 会话 / CSRF
    def _attach_session(self, req: Request) -> None:
        token = req.cookies.get(COOKIE, "")
        req.session_token = token
        if not token:
            return
        row = self.store.session_by_token(token)
        if not row:
            return
        req.session = row
        req.user = self.store.get_user(row["user_id"])
        if req.user and req.user.get("status") == "active":
            self.store.touch_session(row["id"], row["last_seen_at"])
        else:
            req.user = None

    def _allowed_origins(self) -> set[str]:
        port = urlsplit(self.base_url).port
        origins = {self.base_url}
        for host in ("127.0.0.1", "localhost"):
            if port:
                origins.add(f"http://{host}:{port}")
        return origins

    def _check_csrf(self, req: Request) -> None:
        if req.method in ("GET", "HEAD", "OPTIONS"):
            return
        if not req.path.startswith("/api/") or req.path.startswith("/api/v1/"):
            return
        if req.headers.get("x-yl-client") != config.APP_SLUG:
            raise ApiError(403, "csrf_blocked", "缺少请求标识，已被安全策略拒绝")
        origin = req.headers.get("origin")
        if origin and origin.rstrip("/") not in self._allowed_origins():
            raise ApiError(403, "bad_origin", "请求来源不被信任")

    def require_user(self, req: Request) -> dict:
        if not req.user:
            raise ApiError(401, "unauthenticated", "登录状态已失效，请重新登录")
        return req.user

    def _require_recent(self, req: Request) -> None:
        """敏感操作要求会话建立不超过 2 小时。"""
        if not req.session:
            raise ApiError(401, "unauthenticated", "请先登录")
        if now() - int(req.session["created_at"]) > 2 * 3600:
            raise ApiError(401, "reauth_required", "为安全起见，请重新登录后再执行该操作")

    def _cookie(self, name: str, value: str, max_age: int) -> tuple[str, str]:
        parts = [f"{name}={value}", "Path=/", "HttpOnly", "SameSite=Lax"]
        parts.append(f"Max-Age={max_age}" if max_age > 0 else "Max-Age=0")
        return ("Set-Cookie", "; ".join(parts))

    def _issue_session(self, user: dict, req: Request, remember: bool) -> tuple[str, dict]:
        days = int(self.cfg.get("remember_days", 30)) if remember else int(self.cfg.get("session_days", 7))
        ttl = max(3600, days * 86400)
        token, row = self.store.create_session(user["id"], ttl, req.ua, req.ip, remember)
        self.store.touch_login(user["id"])
        return token, row

    def _issue_device(self, user: dict, req: Request) -> list[tuple[str, str]]:
        """记住本设备，用于登录页的一键快捷登录。"""
        token, _row = self.store.create_device(user["id"], DEVICE_TTL, req.ua)
        return [self._cookie(DEVICE_COOKIE, token, DEVICE_TTL)]

    # ------------------------------------------------------------------ 公共 / 会话信息
    def public_config(self, req: Request) -> Reply:
        has_users = self.store.count_users() > 0
        demo_app_id = self.store.meta_get("demo_app_id")
        return json_reply(
            {
                "ok": True,
                "name": config.APP_NAME,
                "full_name": config.APP_FULL_NAME,
                "mark": config.APP_MARK,
                "version": config.APP_VERSION,
                "protocol": config.PROTOCOL_VERSION,
                "has_users": has_users,
                "allow_register": bool(self.cfg.get("allow_register", True)),
                "demo_app_id": demo_app_id,
                "base_url": self.base_url,
            },
            headers=[("Cache-Control", "no-store")],
        )

    def public_accounts(self, req: Request) -> Reply:
        """登录页的本地账户选择列表 + 当前设备可快捷登录的账户。"""
        items = [
            {
                "username": row["username"],
                "display_name": row["display_name"] or row["username"],
                "last_login_at": int(row["last_login_at"] or 0),
            }
            for row in self.store.list_accounts()
        ]
        device = self.store.device_by_token(req.cookies.get(DEVICE_COOKIE, ""))
        device_username = None
        if device:
            owner = self.store.get_user(device["user_id"])
            if owner and owner.get("status") == "active":
                device_username = owner["username"]
        return json_reply(
            {"ok": True, "items": items, "device_username": device_username},
            headers=[("Cache-Control", "no-store")],
        )

    def session_info(self, req: Request) -> Reply:
        payload = {
            "ok": True,
            "user": public_user(req.user) if req.user else None,
            "recovery_codes_left": self.store.count_recovery_codes(req.user["id"]) if req.user else 0,
            "developer": self.store.is_developer(req.user["id"]) if req.user else False,
        }
        if req.user and req.session:
            payload["session"] = {
                "id": req.session["id"],
                "created_at": int(req.session["created_at"]),
                "expires_at": int(req.session["expires_at"]),
                "remember": bool(req.session["remember"]),
            }
        return json_reply(payload, headers=[("Cache-Control", "no-store")])

    # ------------------------------------------------------------------ 注册 / 登录
    def register(self, req: Request) -> Reply:
        if not self.cfg.get("allow_register", True):
            raise ApiError(403, "register_disabled", "当前已关闭注册")
        data = req.json()
        username = security.validate_username(_str(data, "username"))
        password = security.validate_password(_str(data, "password"))
        display_name = security.validate_display_name(_str(data, "display_name")) or username
        email = security.validate_email(_str(data, "email"))
        user = self.store.create_user(username, display_name, password, email)
        codes = self.store.create_recovery_codes(user["id"])
        token, session_row = self._issue_session(user, req, True)
        self.store.audit("register", user["id"], user["username"], ip=req.ip, ua=req.ua)
        headers = [self._cookie(COOKIE, token, int(session_row["expires_at"]) - now())]
        headers.extend(self._issue_device(user, req))
        return json_reply(
            {
                "ok": True,
                "user": public_user(user),
                "recovery_codes": codes,
                "session": {"id": session_row["id"], "expires_at": int(session_row["expires_at"])},
            },
            201,
            headers,
        )

    def login(self, req: Request) -> Reply:
        data = req.json()
        username = _str(data, "username").strip()
        password = _str(data, "password")
        remember = _bool(data, "remember", True)
        if not username or not password:
            raise ApiError(400, "missing_fields", "请输入用户名和密码")

        key = "login:" + username.lower()
        state = self.store.attempt_state(key)
        if state.get("locked_until", 0) > now():
            wait = int(state["locked_until"] - now())
            raise ApiError(429, "too_many_attempts", f"尝试次数过多，请 {max(1, wait)} 秒后再试")

        user = self.store.get_user_by_username(username)
        if not user or not self.store.check_password(user, password):
            if not user:
                security.dummy_verify()
            outcome = self.store.register_failure(key, config.MAX_LOGIN_FAILURES, config.LOCK_WINDOW)
            self.store.audit(
                "login_failed", user["id"] if user else None, username, ip=req.ip, ua=req.ua,
                detail=f"×{outcome['count']}",
            )
            if outcome.get("locked_until", 0) > now():
                wait = int(outcome["locked_until"] - now())
                raise ApiError(429, "too_many_attempts", f"密码错误次数过多，已临时锁定 {wait} 秒")
            raise ApiError(401, "invalid_credentials", "用户名或密码不正确")

        if user.get("status") != "active":
            raise ApiError(403, "user_disabled", "该账户已被停用")

        self.store.reset_attempts(key)
        token, session_row = self._issue_session(user, req, remember)
        self.store.audit("login", user["id"], user["username"], ip=req.ip, ua=req.ua)
        headers = [self._cookie(COOKIE, token, int(session_row["expires_at"]) - now())]
        if remember:
            headers.extend(self._issue_device(user, req))
        return json_reply(
            {
                "ok": True,
                "user": public_user(user),
                "session": {"id": session_row["id"], "expires_at": int(session_row["expires_at"])},
                "recovery_codes_left": self.store.count_recovery_codes(user["id"]),
            },
            headers=headers,
        )

    def quick_login(self, req: Request) -> Reply:
        """本机受信设备的一键快捷登录（Windows / Android 登录页）。"""
        device = self.store.device_by_token(req.cookies.get(DEVICE_COOKIE, ""))
        if not device:
            raise ApiError(401, "device_untrusted", "此设备没有可用的快捷登录凭据，请使用密码登录")
        user = self.store.get_user(device["user_id"])
        if not user or user.get("status") != "active":
            raise ApiError(401, "device_untrusted", "账户不可用，请使用密码登录")
        self.store.touch_device(device["id"])
        token, session_row = self._issue_session(user, req, True)
        self.store.audit("quick_login", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply(
            {
                "ok": True,
                "user": public_user(user),
                "session": {"id": session_row["id"], "expires_at": int(session_row["expires_at"])},
                "recovery_codes_left": self.store.count_recovery_codes(user["id"]),
            },
            headers=[self._cookie(COOKIE, token, int(session_row["expires_at"]) - now())],
        )

    def logout(self, req: Request) -> Reply:
        if req.session:
            self.store.revoke_session(req.user["id"], req.session["id"])
            self.store.audit("logout", req.user["id"], req.user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": True}, headers=[self._cookie(COOKIE, "", 0)])

    # ------------------------------------------------------------------ 密码 / 恢复
    def change_password(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        current = _str(data, "current")
        new = security.validate_password(_str(data, "password"))
        if not self.store.check_password(user, current):
            raise ApiError(400, "invalid_password", "当前密码不正确")
        if current == new:
            raise ApiError(400, "same_password", "新密码不能与当前密码相同")
        self.store.set_password(user["id"], new)
        revoked = self.store.revoke_other_sessions(user["id"], req.session["id"])
        self.store.audit(
            "password_changed", user["id"], user["username"], ip=req.ip, ua=req.ua,
            detail=f"×{revoked}",
        )
        return json_reply({"ok": True, "revoked_others": revoked})

    def recovery_probe(self, req: Request) -> Reply:
        data = req.json()
        username = _str(data, "username").strip()
        key = "recovery:" + username.lower()
        state = self.store.attempt_state(key)
        if state.get("locked_until", 0) > now():
            raise ApiError(429, "too_many_attempts", "尝试次数过多，请稍后再试")
        user = self.store.get_user_by_username(username)
        codes_left = self.store.count_recovery_codes(user["id"]) if user else 0
        return json_reply(
            {"ok": True, "exists": bool(user), "codes_left": codes_left, "has_recovery": codes_left > 0}
        )

    def recovery_reset(self, req: Request) -> Reply:
        data = req.json()
        username = _str(data, "username").strip()
        code = _str(data, "code")
        new = security.validate_password(_str(data, "password"))
        key = "reset:" + username.lower()
        state = self.store.attempt_state(key)
        if state.get("locked_until", 0) > now():
            raise ApiError(429, "too_many_attempts", "尝试次数过多，请稍后再试")
        user = self.store.get_user_by_username(username)
        if not user or not self.store.consume_recovery_code(user["id"], code):
            self.store.register_failure(key, config.MAX_LOGIN_FAILURES, config.LOCK_WINDOW)
            self.store.audit("recovery_failed", user["id"] if user else None, username, ip=req.ip, ua=req.ua)
            raise ApiError(400, "invalid_code", "用户名或恢复码不正确")
        self.store.set_password(user["id"], new)
        self.store.revoke_all_sessions(user["id"])
        self.store.revoke_devices_for_user(user["id"])
        self.store.audit(
            "recovery_used", user["id"], user["username"], ip=req.ip, ua=req.ua,
            detail=f"×{self.store.count_recovery_codes(user['id'])}",
        )
        return json_reply(
            {"ok": True, "username": user["username"],
             "codes_left": self.store.count_recovery_codes(user["id"])}
        )

    def recovery_regenerate(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        if not self.store.check_password(user, _str(data, "password")):
            raise ApiError(400, "invalid_password", "密码不正确")
        codes = self.store.create_recovery_codes(user["id"])
        self.store.audit("recovery_regenerated", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "recovery_codes": codes})

    def update_me(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        display_name = security.validate_display_name(_str(data, "display_name")) or user["display_name"]
        email = security.validate_email(_str(data, "email"))
        updated = self.store.update_profile(user["id"], display_name, email)
        self.store.audit("profile_updated", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "user": public_user(updated)})

    # ------------------------------------------------------------------ 会话管理
    def list_sessions(self, req: Request) -> Reply:
        user = self.require_user(req)
        rows = self.store.list_sessions(user["id"])
        current_id = req.session["id"] if req.session else ""
        items = [
            {
                "id": row["id"],
                "created_at": int(row["created_at"]),
                "last_seen_at": int(row["last_seen_at"]),
                "expires_at": int(row["expires_at"]),
                "ua": row["ua"],
                "ip": row["ip"],
                "remember": bool(row["remember"]),
                "current": row["id"] == current_id,
            }
            for row in rows
        ]
        return json_reply({"ok": True, "items": items})

    def revoke_session(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        session_id = _str(data, "id")
        ok = self.store.revoke_session(user["id"], session_id)
        if ok:
            self.store.audit("session_revoked", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": ok})

    def revoke_other_sessions(self, req: Request) -> Reply:
        user = self.require_user(req)
        count = self.store.revoke_other_sessions(user["id"], req.session["id"])
        self.store.audit(
            "sessions_revoked", user["id"], user["username"], ip=req.ip, ua=req.ua, detail=f"×{count}"
        )
        return json_reply({"ok": True, "revoked": count})

    # ------------------------------------------------------------------ 授权 / 令牌
    def list_grants(self, req: Request) -> Reply:
        user = self.require_user(req)
        grants = self.store.list_grants(user["id"])
        tokens = self.store.list_tokens(user["id"])
        return json_reply(
            {
                "ok": True,
                "items": [
                    {
                        "app_id": row["app_id"],
                        "app_name": row.get("app_name") or "已删除的应用",
                        "scopes": row["scopes"],
                        "created_at": int(row["created_at"]),
                    }
                    for row in grants
                ],
                "tokens": [
                    {
                        "id": row["id"],
                        "app_id": row["app_id"],
                        "app_name": row.get("app_name") or "已删除的应用",
                        "created_at": int(row["created_at"]),
                        "expires_at": int(row["expires_at"]),
                        "last_used_at": int(row["last_used_at"] or 0),
                        "ua": row["ua"],
                    }
                    for row in tokens
                ],
            }
        )

    def revoke_grant(self, req: Request) -> Reply:
        user = self.require_user(req)
        app_id = _str(req.json(), "app_id")
        app = self.store.get_app(app_id) or {}
        ok = self.store.revoke_grant(user["id"], app_id)
        self.store.audit(
            "grant_revoked", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua,
            detail=app.get("name", ""),
        )
        return json_reply({"ok": ok})

    def list_tokens(self, req: Request) -> Reply:
        user = self.require_user(req)
        rows = self.store.list_tokens(user["id"])
        return json_reply(
            {
                "ok": True,
                "items": [
                    {
                        "id": row["id"],
                        "app_id": row["app_id"],
                        "app_name": row.get("app_name") or "已删除的应用",
                        "created_at": int(row["created_at"]),
                        "expires_at": int(row["expires_at"]),
                        "last_used_at": int(row["last_used_at"] or 0),
                    }
                    for row in rows
                ],
            }
        )

    def revoke_token(self, req: Request) -> Reply:
        user = self.require_user(req)
        token_id = _str(req.json(), "id")
        ok = self.store.revoke_token(user["id"], token_id)
        self.store.audit("token_revoked", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": ok})

    def product_logout(self, req: Request) -> Reply:
        """退出某个软件：作废它的全部令牌并撤销记住的授权。"""
        user = self.require_user(req)
        app_id = _str(req.json(), "app_id")
        app = self.store.get_app(app_id) or {}
        tokens = self.store.revoke_tokens_for_app(user["id"], app_id)
        self.store.revoke_grant(user["id"], app_id)
        self.store.audit(
            "product_logout", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua,
            detail=app.get("name", ""),
        )
        return json_reply({"ok": True, "tokens": tokens})

    # ------------------------------------------------------------------ 开发者模式
    def developer_unlock(self, req: Request) -> Reply:
        user = self.require_user(req)
        accepted = req.json().get("accepted")
        if not isinstance(accepted, list):
            accepted = []
        missing = [key for key in DEVELOPER_AGREEMENTS if key not in accepted]
        if missing:
            raise ApiError(400, "agreement_required", "请勾选全部开发协议后再解锁")
        self.store.set_developer(user["id"], True)
        self.store.audit(
            "developer_unlocked", user["id"], user["username"], ip=req.ip, ua=req.ua,
            detail=", ".join(accepted),
        )
        return json_reply({"ok": True, "developer": True})

    def developer_lock(self, req: Request) -> Reply:
        user = self.require_user(req)
        self.store.set_developer(user["id"], False)
        self.store.audit("developer_locked", user["id"], user["username"], ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "developer": False})

    # ------------------------------------------------------------------ 应用管理
    def _app_public(self, app: dict) -> dict:
        """应用的可公开身份：应用码、发布者、认证状态。"""
        verified_at = int(app.get("verified_at") or 0)
        expires = int(app.get("verify_expires_at") or 0)
        verified = bool(verified_at) and (not expires or expires > now())
        return {
            "app_id": app["app_id"],
            "public_code": app.get("public_code") or "",
            "name": app["name"],
            "description": app.get("description") or "",
            "publisher": app.get("publisher_name") or "",
            "redirect_uris": app["redirect_uris"],
            "scopes": app["scopes"],
            "is_demo": bool(app["is_demo"]),
            "created_at": int(app["created_at"]),
            "last_used_at": int(app["last_used_at"] or 0),
            "protect": {
                "verified": verified,
                "level": app.get("verify_level") or "",
                "verified_at": verified_at,
                "expires_at": expires,
                "certificate_id": app.get("certificate_id") or "",
            },
            "secret_hint": "ylsec_••••••••" + app["secret_hash"][-4:],
        }

    def list_apps(self, req: Request) -> Reply:
        self.require_user(req)
        items = [self._app_public(app) for app in self.store.list_apps()]
        return json_reply({"ok": True, "items": items})

    def create_app(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        name = _str(data, "name").strip() or "未命名产品"
        if len(name) > 40:
            raise ApiError(400, "invalid_name", "产品名称不能超过 40 个字符")
        uris = _parse_redirect_list(data.get("redirect_uris"))
        description = _str(data, "description").strip()[:200]
        app, secret = self.store.create_app(
            name, uris, ["profile"], description,
            publisher_id=user["id"], publisher_name=user["display_name"] or user["username"],
        )
        self.store.audit(
            "app_created", user["id"], user["username"], app["app_id"], ip=req.ip, ua=req.ua,
            detail=name,
        )
        return json_reply(
            {"ok": True, "app": self._app_public(app), "app_secret": secret},
            201,
        )

    def update_app(self, req: Request, app_id: str) -> Reply:
        user = self.require_user(req)
        app = self.store.get_app(app_id)
        if not app:
            raise ApiError(404, "not_found", "应用不存在")
        data = req.json()
        name = _str(data, "name").strip() or app["name"]
        uris = _parse_redirect_list(data.get("redirect_uris", app["redirect_uris"]))
        description = _str(data, "description", app["description"]).strip()[:200]
        updated = self.store.update_app(app_id, name, uris, description)
        self.store.audit("app_updated", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "app": {"name": updated["name"], "redirect_uris": updated["redirect_uris"]}})

    def delete_app(self, req: Request, app_id: str) -> Reply:
        user = self.require_user(req)
        app = self.store.get_app(app_id)
        if not app:
            raise ApiError(404, "not_found", "应用不存在")
        if app["is_demo"]:
            raise ApiError(400, "protected_app", "内置示例应用不可删除")
        self.store.delete_app(app_id)
        self.store.audit(
            "app_deleted", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua, detail=app["name"]
        )
        return json_reply({"ok": True})

    def rotate_secret(self, req: Request, app_id: str) -> Reply:
        user = self.require_user(req)
        if not self.store.get_app(app_id):
            raise ApiError(404, "not_found", "应用不存在")
        secret = self.store.rotate_app_secret(app_id)
        self.store.audit("app_secret_rotated", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "app_secret": secret})

    # ------------------------------------------------------------------ YiStarLine Protect
    def protect_state(self, req: Request, app_id: str) -> Reply:
        self.require_user(req)
        app = self.store.get_app(app_id)
        if not app:
            raise ApiError(404, "not_found", "应用不存在")
        info = self._app_public(app)
        auto = self._protect_auto_checks(app)
        return json_reply(
            {
                "ok": True,
                "app": {"app_id": info["app_id"], "name": info["name"], "public_code": info["public_code"]},
                "protect": info["protect"],
                "items": [dict(item) for item in PROTECT_ITEMS],
                "checks": auto,
                "redirect_uris": app["redirect_uris"],
                "privacy_url": (app.get("verify_claims") or {}).get("privacy_url", "")
                if isinstance(app.get("verify_claims"), dict) else "",
            }
        )

    def _protect_auto_checks(self, app: dict) -> list[dict]:
        """系统能自己验证的部分：回调地址、https、发布者、描述。"""
        uris = app.get("redirect_uris") or []
        secure = bool(uris) and all(
            (uri.startswith("https://") or uri.startswith("http://127.0.0.1") or uri.startswith("http://localhost"))
            for uri in uris
        )
        return [
            {"id": "check.redirect", "ok": bool(uris), "detail": f"{len(uris)}"},
            {"id": "check.secure_redirect", "ok": secure, "detail": ""},
            {"id": "check.publisher", "ok": bool(app.get("publisher_name")), "detail": app.get("publisher_name") or ""},
            {"id": "check.described", "ok": len((app.get("description") or "").strip()) >= 6, "detail": ""},
        ]

    def protect_verify(self, req: Request, app_id: str) -> Reply:
        user = self.require_user(req)
        app = self.store.get_app(app_id)
        if not app:
            raise ApiError(404, "not_found", "应用不存在")
        data = req.json()
        accepted = data.get("accepted") or []
        if not isinstance(accepted, list):
            raise ApiError(400, "invalid_claims", "声明格式不正确")
        accepted = {str(item) for item in accepted}
        missing = [item["id"] for item in PROTECT_ITEMS if item["required"] and item["id"] not in accepted]
        if missing:
            raise ApiError(
                400, "compliance_incomplete",
                f"还有 {len(missing)} 条合规声明未确认",
            )
        checks = self._protect_auto_checks(app)
        failed = [check["id"] for check in checks if not check["ok"]]
        if failed:
            raise ApiError(400, "check_failed", "自动校验未通过：" + ", ".join(failed))
        privacy_url = _str(data, "privacy_url").strip()[:300]
        if privacy_url and not (privacy_url.startswith("https://") or privacy_url.startswith("http://")):
            raise ApiError(400, "invalid_privacy_url", "隐私政策链接必须是完整的 http(s) 地址")
        expires = now() + PROTECT_VALID_DAYS * 86400
        certificate = "YLP-CERT-" + security.new_secret(8).replace("-", "").replace("_", "")[:10].upper()
        claims = {"accepted": sorted(accepted), "privacy_url": privacy_url, "checks": [c["id"] for c in checks]}
        self.store.set_app_verified(app_id, "compliant", certificate, expires, claims)
        self.store.audit(
            "app_verified", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua,
            detail=f"{certificate} ({len(accepted)} claims)",
        )
        refreshed = self.store.get_app(app_id) or app
        return json_reply({"ok": True, "protect": self._app_public(refreshed)["protect"]})

    def protect_revoke(self, req: Request, app_id: str) -> Reply:
        user = self.require_user(req)
        if not self.store.get_app(app_id):
            raise ApiError(404, "not_found", "应用不存在")
        self.store.clear_app_verified(app_id)
        self.store.audit("app_unverified", user["id"], user["username"], app_id, ip=req.ip, ua=req.ua)
        return json_reply({"ok": True, "protect": {"verified": False}})

    # ------------------------------------------------------------------ 审计
    def list_activity(self, req: Request) -> Reply:
        user = self.require_user(req)
        try:
            limit = int(req.arg("limit", "60"))
        except ValueError:
            limit = 60
        scope = req.arg("scope", "me")
        rows = self.store.list_audit(None if scope == "all" else user["id"], limit)
        items = [
            {
                "id": row["id"],
                "ts": int(row["ts"]),
                "event": row["event"],
                "username": row["username"] or "",
                "app_id": row["app_id"] or "",
                "ip": row["ip"] or "",
                "detail": row["detail"] or "",
            }
            for row in rows
        ]
        return json_reply({"ok": True, "items": items})

    def clear_activity(self, req: Request) -> Reply:
        user = self.require_user(req)
        count = self.store.clear_audit()
        self.store.audit(
            "audit_cleared", user["id"], user["username"], ip=req.ip, ua=req.ua,
            detail=f"×{count}",
        )
        return json_reply({"ok": True, "cleared": count})

    # ------------------------------------------------------------------ 系统
    def system_info(self, req: Request) -> Reply:
        self.require_user(req)
        stats = self.store.stats()
        db_bytes = stats["db_bytes"]
        return json_reply(
            {
                "ok": True,
                "name": config.APP_NAME,
                "version": config.APP_VERSION,
                "protocol": config.PROTOCOL_VERSION,
                "base_url": self.base_url,
                "data_dir": str(config.DATA_DIR),
                "log_dir": str(config.LOG_DIR),
                "db_bytes": db_bytes,
                "users": stats["users"],
                "apps": stats["apps"],
                "audit_count": stats["audit"],
                "started_at": int(self.started_at),
                "uptime": int(time.time() - self.started_at),
                "autostart": self.autostart_enabled(),
                "python": sys.version.split()[0],
                "os": f"{os.name}",
                "pid": os.getpid(),
            }
        )

    def _run_quiet(self, args: list[str]) -> tuple[int, str]:
        try:
            proc = subprocess.run(
                args,
                capture_output=True,
                text=True,
                errors="ignore",
                timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            return proc.returncode, (proc.stdout or "") + (proc.stderr or "")
        except (OSError, subprocess.SubprocessError) as exc:
            return 1, str(exc)

    def autostart_enabled(self) -> bool:
        code, _out = self._run_quiet(["reg", "query", RUN_KEY, "/v", AUTOSTART_VALUE])
        return code == 0

    def set_autostart(self, req: Request) -> Reply:
        user = self.require_user(req)
        enabled = _bool(req.json(), "enabled")
        vbs = config.RUN_DIR / "start-service.vbs"
        if enabled:
            if not vbs.exists():
                raise ApiError(400, "missing_script", "缺少启动脚本，无法设置开机启动")
            command = f'wscript.exe "{vbs}"'
            code, out = self._run_quiet(
                ["reg", "add", RUN_KEY, "/v", AUTOSTART_VALUE, "/t", "REG_SZ", "/d", command, "/f"]
            )
        else:
            code, out = self._run_quiet(["reg", "delete", RUN_KEY, "/v", AUTOSTART_VALUE, "/f"])
            if code != 0:
                code = 0
        if code != 0:
            raise ApiError(500, "autostart_failed", f"写入开机启动项失败：{out.strip()[:120]}")
        self.store.audit(
            "autostart", user["id"], user["username"], ip=req.ip, ua=req.ua,
            detail="ON" if enabled else "OFF",
        )
        return json_reply({"ok": True, "enabled": self.autostart_enabled()})

    def make_backup(self, req: Request) -> Reply:
        user = self.require_user(req)
        target = self.store.backup_to(config.BACKUP_DIR)
        self.store.audit("backup", user["id"], user["username"], ip=req.ip, ua=req.ua, detail=target.name)
        return json_reply({"ok": True, "path": str(target), "dir": str(target.parent)})

    def open_folder(self, req: Request) -> Reply:
        self.require_user(req)
        target = _str(req.json(), "target", "data")
        mapping = {"data": config.DATA_DIR, "logs": config.LOG_DIR, "backups": config.BACKUP_DIR,
                   "root": config.ROOT}
        path = mapping.get(target)
        if not path:
            raise ApiError(400, "invalid_target", "未知的目录")
        path.mkdir(parents=True, exist_ok=True)
        try:
            if os.name == "nt":
                os.startfile(str(path))  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["xdg-open", str(path)])
        except OSError as exc:
            raise ApiError(500, "open_failed", f"无法打开目录：{exc}")
        return json_reply({"ok": True, "path": str(path)})

    def shutdown(self, req: Request) -> Reply:
        user = self.require_user(req)
        self.store.audit("shutdown", user["id"], user["username"], ip=req.ip, ua=req.ua)
        if self.on_shutdown:
            threading.Thread(target=self.on_shutdown, daemon=True).start()
        return json_reply({"ok": True})

    def delete_account(self, req: Request) -> Reply:
        user = self.require_user(req)
        self._require_recent(req)
        if not self.store.check_password(user, _str(req.json(), "password")):
            raise ApiError(400, "invalid_password", "密码不正确")
        self.store.audit("account_deleted", user["id"], user["username"], ip=req.ip, ua=req.ua)
        self.store.delete_user(user["id"])
        return json_reply({"ok": True}, headers=[self._cookie(COOKIE, "", 0)])

    # ------------------------------------------------------------------ SSO 授权
    def authorize(self, req: Request) -> Reply:
        # 兼容旧版参数：client_id / redirect / nonce
        app_id = req.arg("app_id") or req.arg("client_id")
        code = (req.arg("code") or req.arg("public_code") or "").strip().upper()
        redirect_uri = req.arg("redirect_uri") or req.arg("redirect")
        state = req.arg("state") or req.arg("nonce")
        prompt = req.arg("prompt", "")
        popup = req.arg("popup", "")
        app = self.store.get_app(app_id)
        if not app and code:
            app = self.store.get_app_by_code(code)
            if app:
                app_id = app["app_id"]
        if not app:
            if code:
                # 未在本机登记的应用码：直接弹出首次授权确认页，用户不需要手输
                return self._spa_redirect("/authorize", {
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "state": state,
                    "name": req.arg("name"),
                    "publisher": req.arg("publisher"),
                    "popup": popup,
                })
            return self._sso_message(req, "app_not_found")
        target = self.engine.match_redirect(app, redirect_uri) if redirect_uri else self.engine.default_redirect(app)
        if not target:
            return self._sso_message(req, "invalid_redirect")

        def bail(code: str, message: str) -> Reply:
            return redirect(self.engine.build_redirect(target, {"error": code, "error_description": message, "state": state}))

        def authorize_path() -> str:
            params = {
                "app_id": app["app_id"], "redirect_uri": target, "state": state,
                "popup": popup, "prompt": prompt,
            }
            return "/sso/authorize?" + urlencode({k: v for k, v in params.items() if v})

        if not req.user:
            if prompt == "none":
                return bail("login_required", "尚未登录 YiStarLine Account")
            return self._spa_redirect("/login", {"next": authorize_path(), "popup": popup, "app": app["name"]})
        if prompt == "login":
            return self._spa_redirect("/login", {"next": authorize_path(), "reauth": "1", "popup": popup})

        granted = self.store.has_grant(req.user["id"], app["app_id"])
        if prompt == "none":
            if not granted:
                return bail("consent_required", "尚未授权该产品")
            ticket, resolved = self.engine.issue_ticket(app, req.user["id"], target)
            self.store.audit(
                "sso_silent", req.user["id"], req.user["username"], app["app_id"], ip=req.ip, ua=req.ua,
                detail=app["name"],
            )
            return redirect(self.engine.build_redirect(resolved, {"ticket": ticket, "state": state}))
        # 旧版静默行为：prompt=auto 且已授权时直接返回票据
        if prompt == "auto" and granted:
            ticket, resolved = self.engine.issue_ticket(app, req.user["id"], target)
            self.store.audit(
                "sso_authorized", req.user["id"], req.user["username"], app["app_id"], ip=req.ip, ua=req.ua,
                detail=app["name"],
            )
            return redirect(self.engine.build_redirect(resolved, {"ticket": ticket, "state": state}))
        # 默认：每次都展示确认授权页（类似 Microsoft / GitHub / Google 的授权确认）
        return self._spa_redirect("/authorize", {
            "app_id": app["app_id"], "redirect_uri": target, "state": state, "popup": popup,
        })

    def _spa_redirect(self, route: str, params: dict) -> Reply:
        query = urlencode({k: v for k, v in params.items() if v not in (None, "")})
        return redirect(f"{self.base_url}/#{route}?{query}")

    def _lang(self, req: Request) -> str:
        return detect_lang(req.headers.get("accept-language", ""))

    def _sso_message(self, req: Request, key: str) -> Reply:
        lang = self._lang(req)
        entry = MESSAGES.get(key, {})
        title, body = entry.get(lang) or entry.get("zh") or ("Error", "")
        return html_reply(
            f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · {config.APP_NAME}</title>
<link rel="stylesheet" href="/styles.css"></head>
<body class="sso-message-body"><div class="sso-message">
<div class="brand-mark">YS</div><h1>{title}</h1><p>{body}</p>
<p class="muted">{MESSAGES["close_hint"].get(lang, MESSAGES["close_hint"]["zh"])}</p></div></body></html>""",
            400,
        )

    @staticmethod
    def _local_redirect_ok(uri: str) -> bool:
        if not uri:
            return False
        low = uri.lower()
        if low.startswith("https://"):
            return True
        return low.startswith("http://127.0.0.1") or low.startswith("http://localhost") or low.startswith("http://[::1]")

    def consent_info(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        app_id = _str(data, "app_id")
        code = _str(data, "code").strip().upper()
        app = self.store.get_app(app_id) if app_id else self.store.get_app_by_code(code)
        if not app and code:
            redirect_uri = _str(data, "redirect_uri")
            if not self._local_redirect_ok(redirect_uri):
                raise ApiError(400, "invalid_redirect", "首次授权只接受 HTTPS 或本机回环地址")
            host = urlsplit(redirect_uri).netloc
            return json_reply(
                {
                    "ok": True,
                    "pending": True,
                    "app": {
                        "app_id": "",
                        "public_code": code,
                        "name": _str(data, "name").strip()[:40] or "未命名应用",
                        "publisher": _str(data, "publisher").strip()[:40],
                        "description": "",
                        "redirect_uris": [redirect_uri],
                        "scopes": ["profile"],
                        "host": host,
                        "trust": "pending",
                        "protect": {"verified": False, "level": "", "certificate_id": "", "verified_at": 0, "expires_at": 0},
                    },
                    "granted": False,
                    "user": public_user(user),
                    "state": _str(data, "state"),
                }
            )
        if not app:
            raise ApiError(400, "invalid_app", "应用不存在或已被删除")
        target = self.engine.match_redirect(app, _str(data, "redirect_uri"))
        if not target:
            raise ApiError(400, "invalid_redirect", "回调地址不在白名单内")
        host = urlsplit(target).netloc
        return json_reply(
            {
                "ok": True,
                "app": {**app_public(app), "host": host},
                "granted": self.store.has_grant(user["id"], app["app_id"]),
                "user": public_user(user),
                "state": _str(data, "state"),
            }
        )

    def approve(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        app_id = _str(data, "app_id")
        code = _str(data, "code").strip().upper()
        app = self.store.get_app(app_id) if app_id else self.store.get_app_by_code(code)
        if not app and code:
            redirect_uri = _str(data, "redirect_uri")
            if not self._local_redirect_ok(redirect_uri):
                raise ApiError(400, "invalid_redirect", "首次授权只接受 HTTPS 或本机回环地址")
            app = self.store.create_imported_app(
                code,
                _str(data, "name").strip() or "未命名应用",
                _str(data, "publisher").strip(),
                redirect_uri,
            )
            self.store.audit(
                "app_imported", user["id"], user["username"], app["app_id"], ip=req.ip, ua=req.ua,
                detail=code,
            )
        if not app:
            raise ApiError(400, "invalid_app", "应用不存在或已被删除")
        target = self.engine.match_redirect(app, _str(data, "redirect_uri"))
        if not target:
            raise ApiError(400, "invalid_redirect", "回调地址不在白名单内")
        state = _str(data, "state")
        remember = _bool(data, "remember", True)
        if remember:
            self.store.grant(user["id"], app["app_id"], app.get("scopes", ["profile"]))
        ticket, resolved = self.engine.issue_ticket(app, user["id"], target)
        self.store.audit(
            "sso_authorized", user["id"], user["username"], app["app_id"], ip=req.ip, ua=req.ua,
            detail=app["name"],
        )
        return json_reply({"ok": True, "redirect": self.engine.build_redirect(resolved, {"ticket": ticket, "state": state})})

    def deny(self, req: Request) -> Reply:
        user = self.require_user(req)
        data = req.json()
        app = self.store.get_app(_str(data, "app_id")) or {}
        target = self.engine.match_redirect(app, _str(data, "redirect_uri")) if app else None
        if not target:
            return json_reply({"ok": True, "redirect": ""})
        self.store.audit("sso_denied", user["id"], user["username"], app["app_id"], ip=req.ip, ua=req.ua)
        return json_reply(
            {
                "ok": True,
                "redirect": self.engine.build_redirect(
                    target, {"error": "access_denied", "error_description": "用户拒绝了授权", "state": _str(data, "state")}
                ),
            }
        )

    # ------------------------------------------------------------------ /api/v1
    def v1_health(self, req: Request) -> Reply:
        return json_reply(
            {"ok": True, "app": config.APP_NAME, "full_name": config.APP_FULL_NAME,
             "mark": config.APP_MARK, "version": config.APP_VERSION,
             "protocol": config.PROTOCOL_VERSION, "time": now()},
            headers=self._cors(req) + [("Cache-Control", "no-store")],
        )

    @staticmethod
    def _client_credentials(data: dict) -> tuple[str, str]:
        """兼容 client_id / client_secret 旧参数名。"""
        app_id = _str(data, "app_id") or _str(data, "client_id")
        secret = _str(data, "app_secret") or _str(data, "client_secret")
        return app_id, secret

    def v1_login(self, req: Request) -> Reply:
        data = req.json()
        app_id, secret = self._client_credentials(data)
        payload = self.engine.password_login(
            app_id, secret, _str(data, "username"), _str(data, "password"), req.ua,
        )
        return json_reply({"ok": True, **payload}, headers=self._cors(req))

    def v1_redeem(self, req: Request) -> Reply:
        data = req.json()
        app_id, secret = self._client_credentials(data)
        ticket = _str(data, "ticket") or _str(data, "code")
        payload = self.engine.redeem(app_id, secret, ticket, req.ua)
        return json_reply({"ok": True, **payload}, headers=self._cors(req))

    def _bearer(self, req: Request) -> str:
        header = req.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            return header[7:].strip()
        return req.headers.get("x-access-token", "").strip()

    def v1_userinfo(self, req: Request) -> Reply:
        payload = self.engine.userinfo(self._bearer(req))
        return json_reply({"ok": True, **payload}, headers=self._cors(req))

    def v1_logout(self, req: Request) -> Reply:
        ok = self.engine.revoke_token(self._bearer(req))
        return json_reply({"ok": ok}, headers=self._cors(req))

    def v1_app_verify(self, req: Request) -> Reply:
        data = req.json()
        app_id, secret = self._client_credentials(data)
        app = self.engine.authenticate_app(app_id, secret)
        return json_reply({"ok": True, "app": app_public(app)}, headers=self._cors(req))

    def v1_app_lookup(self, req: Request) -> Reply:
        """按应用码查询应用的公开身份（发布者 / 认证状态），供其它账户系统识别。"""
        code = req.arg("code") or req.arg("public_code")
        app = self.store.get_app_by_code(code)
        if not app:
            raise ApiError(404, "app_not_found", "没有找到该应用码对应的应用")
        info = app_public(app)
        return json_reply(
            {
                "ok": True,
                "app": {
                    "public_code": info.get("public_code", ""),
                    "app_id": info.get("app_id", ""),
                    "name": info.get("name", ""),
                    "description": info.get("description", ""),
                    "publisher": info.get("publisher", ""),
                    "scopes": info.get("scopes", []),
                    "created_at": int(app["created_at"]),
                },
                "protect": info.get("protect", {}),
            },
            headers=self._cors(req),
        )

    # ------------------------------------------------------------------ 示例产品
    def _demo_app(self) -> dict | None:
        return self.store.get_app(self.store.meta_get("demo_app_id"))

    def demo_callback(self, req: Request) -> Reply:
        ticket = req.arg("ticket")
        state = req.arg("state")
        error = req.arg("error")
        lang = self._lang(req)
        app = self._demo_app()
        if not app:
            return html_reply(self._demo_callback_page(False, state, lang, "demo_no_app"), 200)
        if error:
            return html_reply(self._demo_callback_page(False, state, lang, "demo_canceled"), 200)
        if not ticket:
            received = ", ".join(f"{k}={v}" for k, v in (req.query or {}).items()) or "无参数"
            return html_reply(
                self._demo_callback_page(False, state, lang, "demo_no_ticket", f"收到的参数：{received}"), 200
            )
        try:
            secret = self.store.meta_get("demo_app_secret")
            payload = self.engine.redeem(app["app_id"], secret, ticket, req.ua)
            cookie = self._cookie(DEMO_COOKIE, payload["access_token"], config.ACCESS_TOKEN_TTL)
            return html_reply(self._demo_callback_page(True, state, lang, "demo_ok"), 200, [cookie])
        except (SSOError, ApiError) as exc:
            return html_reply(
                self._demo_callback_page(False, state, lang, "demo_failed",
                                         getattr(exc, "message", str(exc))), 200
            )

    @staticmethod
    def _demo_callback_page(ok: bool, state: str, lang: str, key: str, detail: str = "") -> str:
        title, body = MESSAGES[key].get(lang) or MESSAGES[key]["zh"]
        body = body or detail
        if detail and detail not in (body or ""):
            body = f"{body} · {detail}"
        hint = MESSAGES["close_hint"].get(lang, MESSAGES["close_hint"]["zh"])
        return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="/styles.css"></head>
<body class="sso-message-body"><div class="sso-message">
<div class="brand-mark">YS</div>
<h1>{title}</h1>
<p>{body}</p>
<p class="muted">{hint}</p></div>
<script src="/demo-callback.js" data-ok="{1 if ok else 0}" data-state="{state}"></script>
</body></html>"""

    def demo_me(self, req: Request) -> Reply:
        token = req.cookies.get(DEMO_COOKIE, "")
        if not token:
            raise ApiError(401, "unauthenticated", "示例产品尚未登录")
        payload = self.engine.userinfo(token)
        return json_reply({"ok": True, **payload})

    def demo_login(self, req: Request) -> Reply:
        """示例产品自带登录框：演示 /api/v1/auth/login 的服务端调用方式。"""
        app = self._demo_app()
        if not app:
            raise ApiError(503, "demo_unavailable", "示例应用尚未初始化")
        data = req.json()
        payload = self.engine.password_login(
            app["app_id"],
            self.store.meta_get("demo_app_secret"),
            _str(data, "username"),
            _str(data, "password"),
            req.ua,
        )
        return json_reply(
            {"ok": True, "user": payload["user"]},
            headers=[self._cookie(DEMO_COOKIE, payload["access_token"], config.ACCESS_TOKEN_TTL)],
        )

    def demo_logout(self, req: Request) -> Reply:
        token = req.cookies.get(DEMO_COOKIE, "")
        if token:
            self.engine.revoke_token(token)
        return json_reply({"ok": True}, headers=[self._cookie(DEMO_COOKIE, "", 0)])


def seed_demo_app(store: Store) -> dict:
    """确保内置演示应用存在，返回 {app_id, secret}。"""
    app_id = store.meta_get("demo_app_id")
    app = store.get_app(app_id) if app_id else None
    if app:
        return {"app_id": app["app_id"], "secret": store.meta_get("demo_app_secret")}
    app, secret = store.create_app(
        name="示例产品 · YiStarLine Notes",
        redirect_uris=["http://127.0.0.1:{port}/demo/callback"],
        scopes=["profile"],
        description="内置演示产品，用于验证“一键快速登录”完整链路",
        is_demo=True,
    )
    store.meta_set("demo_app_id", app["app_id"])
    store.meta_set("demo_app_secret", secret)
    return {"app_id": app["app_id"], "secret": secret}
