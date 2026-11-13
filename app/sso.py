"""SSO 引擎：应用校验、授权票据签发、票据兑换、访问令牌。"""
from __future__ import annotations

import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from . import config, security
from .store import Store


class SSOError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def public_user(user: dict) -> dict:
    if not user:
        return {}
    return {
        "id": user.get("id", ""),
        "username": user.get("username", ""),
        "display_name": user.get("display_name", "") or user.get("username", ""),
        "email": user.get("email", "") or "",
        "created_at": int(user.get("created_at") or 0),
    }


def app_public(app: dict) -> dict:
    if not app:
        return {}
    now_ts = int(time.time())
    verified_at = int(app.get("verified_at") or 0)
    expires = int(app.get("verify_expires_at") or 0)
    return {
        "app_id": app.get("app_id", ""),
        "public_code": app.get("public_code") or "",
        "name": app.get("name", ""),
        "description": app.get("description", ""),
        "publisher": app.get("publisher_name") or "",
        "redirect_uris": app.get("redirect_uris", []),
        "scopes": app.get("scopes", []),
        "trust": app.get("trust") or "managed",
        "protect": {
            "verified": bool(verified_at) and (not expires or expires > now_ts),
            "level": app.get("verify_level") or "",
            "certificate_id": app.get("certificate_id") or "",
            "verified_at": verified_at,
            "expires_at": expires,
        },
    }


class SSOEngine:
    def __init__(self, store: Store, base_url_provider):
        self.store = store
        self._base_url = base_url_provider
        self.port = urlsplit(self._base_url()).port or config.DEFAULT_PORT

    def refresh_port(self, base_url: str) -> None:
        self._base_url = lambda: base_url
        self.port = urlsplit(base_url).port or config.DEFAULT_PORT

    # ------------------------------------------------------------ 回调地址
    def expand_redirect(self, uri: str) -> str:
        return (uri or "").replace("{port}", str(self.port))

    def match_redirect(self, app: dict, redirect_uri: str) -> str | None:
        candidate = (redirect_uri or "").strip()
        if not candidate:
            return None
        for allowed in app.get("redirect_uris", []):
            if self.expand_redirect(allowed) == candidate:
                return candidate
        return None

    def default_redirect(self, app: dict) -> str | None:
        uris = app.get("redirect_uris") or []
        return self.expand_redirect(uris[0]) if uris else None

    @staticmethod
    def build_redirect(redirect_uri: str, params: dict) -> str:
        parts = urlsplit(redirect_uri)
        query = parse_qsl(parts.query, keep_blank_values=True)
        for key, value in params.items():
            if value is None:
                continue
            query.append((key, str(value)))
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    # ------------------------------------------------------------ 应用认证
    def authenticate_app(self, app_id: str, secret: str) -> dict:
        key = (app_id or "").strip()
        app = self.store.get_app(key) or self.store.get_app_by_code(key)
        if not app:
            raise SSOError("invalid_client", "应用 ID 或应用密钥不正确", 401)
        if (app.get("trust") or "managed") == "imported":
            # 由应用码首次授权导入的应用没有共享密钥，凭本机用户确认即可
            return app
        if not self.store.verify_app_secret(app, secret or ""):
            raise SSOError("invalid_client", "应用 ID 或应用密钥不正确", 401)
        return app

    def require_app(self, app_id: str) -> dict:
        app = self.store.get_app((app_id or "").strip())
        if not app:
            raise SSOError("invalid_app", "应用不存在或已被删除", 400)
        return app

    # ------------------------------------------------------------ 票据
    def issue_ticket(
        self, app: dict, user_id: str, redirect_uri: str, scopes: list[str] | None = None
    ) -> tuple[str, str]:
        resolved = self.match_redirect(app, redirect_uri)
        if not resolved:
            raise SSOError("invalid_redirect", "回调地址不在该应用的白名单内")
        use_scopes = scopes if scopes is not None else app.get("scopes", ["profile"])
        ticket, _row = self.store.create_ticket(app["app_id"], user_id, resolved, use_scopes)
        return ticket, resolved

    def authorize_url(self, app: dict, redirect_uri: str, state: str = "", prompt: str = "") -> str:
        params = {
            "app_id": app["app_id"],
            "redirect_uri": redirect_uri,
            "state": state or "",
            "prompt": prompt or "",
        }
        base = self._base_url().rstrip("/")
        return f"{base}/sso/authorize?{urlencode({k: v for k, v in params.items() if v})}"

    def redeem(self, app_id: str, secret: str, ticket: str, ua: str = "") -> dict:
        app = self.authenticate_app(app_id, secret)
        if not ticket:
            raise SSOError("invalid_ticket", "缺少授权票据", 400)
        row = self.store.consume_ticket(app["app_id"], ticket)
        if not row:
            raise SSOError("invalid_ticket", "授权票据无效、已使用或已过期", 400)
        user = self.store.get_user(row["user_id"])
        if not user or user.get("status") != "active":
            raise SSOError("user_unavailable", "账户不存在或已停用", 400)
        token, token_row = self.store.create_access_token(
            user["id"], app["app_id"], app["scopes"], config.ACCESS_TOKEN_TTL, ua
        )
        self.store.audit(
            "ticket_redeemed", user["id"], user["username"], app["app_id"], detail=app["name"]
        )
        return {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": config.ACCESS_TOKEN_TTL,
            "expires_at": token_row["expires_at"],
            "scope": " ".join(row["scopes"]),
            "user": public_user(user),
            "app": app_public(app),
        }

    # ------------------------------------------------------------ 令牌
    def userinfo(self, token: str) -> dict:
        row = self.store.token_by_value(token)
        if not row:
            raise SSOError("invalid_token", "访问令牌无效或已过期", 401)
        user = self.store.get_user(row["user_id"])
        if not user or user.get("status") != "active":
            raise SSOError("invalid_token", "账户不存在或已停用", 401)
        self.store.touch_token(row["id"])
        app = self.store.get_app(row["app_id"]) or {}
        return {
            "user": public_user(user),
            "app": app_public(app),
            "scope": " ".join(row["scopes"]),
            "issued_at": int(row["created_at"]),
            "expires_at": int(row["expires_at"]),
        }

    def revoke_token(self, token: str) -> bool:
        row = self.store.token_by_value(token)
        if not row:
            return False
        self.store.revoke_token_by_id(row["id"])
        return True

    # ------------------------------------------------------------ 密码登录（用于产品自带登录框）
    def password_login(self, app_id: str, secret: str, username: str, password: str, ua: str = "") -> dict:
        app = self.authenticate_app(app_id, secret)
        user = self.store.get_user_by_username(username)
        if not user or not self.store.check_password(user, password):
            if not user:
                security.dummy_verify()
            raise SSOError("invalid_credentials", "用户名或密码不正确", 401)
        if user.get("status") != "active":
            raise SSOError("user_unavailable", "账户已被停用", 403)
        token, token_row = self.store.create_access_token(
            user["id"], app["app_id"], app["scopes"], config.ACCESS_TOKEN_TTL, ua
        )
        self.store.touch_login(user["id"])
        self.store.audit("product_login", user["id"], user["username"], app["app_id"], detail=app["name"])
        return {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": config.ACCESS_TOKEN_TTL,
            "expires_at": token_row["expires_at"],
            "scope": " ".join(app["scopes"]),
            "user": public_user(user),
            "app": app_public(app),
        }
