"""YiStarLine Account · Python 客户端（仅使用标准库，可离线运行）

用法：
    from yistarline_sso import YiStarLineSSO, SSOError

    sso = YiStarLineSSO(app_id="ylc_xxx", app_secret="ylsec_xxx")
    # 1) 跳转到授权页（Web 产品）
    url = sso.authorize_url("http://127.0.0.1:5000/sso/callback", state="nonce")
    # 2) 回调拿到 ticket 后兑换身份
    info = sso.redeem(ticket)
    print(info["user"]["display_name"], info["access_token"])
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlsplit

DEFAULT_PORTS = list(range(8600, 8630))
DEFAULT_BASE = "http://127.0.0.1:8600"


class SSOError(Exception):
    """接口返回的错误（带协议错误码）。"""

    def __init__(self, code: str, message: str, status: int = 0):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def discover(timeout: float = 0.6) -> str:
    """在 8600-8629 上自动发现本机正在运行的服务，返回 base_url。"""
    for port in DEFAULT_PORTS:
        base = f"http://127.0.0.1:{port}"
        try:
            with urllib.request.urlopen(base + "/api/v1/health", timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("app") == "YiStarLine Account":
                    return base
        except (OSError, ValueError, urllib.error.URLError):
            continue
    return DEFAULT_BASE


class YiStarLineSSO:
    def __init__(self, app_id: str, app_secret: str = "", base_url: str = "", timeout: float = 8.0):
        self.app_id = app_id
        self.app_secret = app_secret
        self.base_url = (base_url or discover()).rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------ 底层
    def _request(self, method: str, path: str, payload: dict | None = None,
                 headers: dict | None = None) -> dict:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(self.base_url + path, data=body, method=method)
        request.add_header("Accept", "application/json")
        request.add_header("User-Agent", "yistarline-sso-python/1.0")
        if body is not None:
            request.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            try:
                error = json.loads(raw).get("error", {})
            except ValueError:
                error = {}
            raise SSOError(error.get("code", "http_error"),
                           error.get("message", f"HTTP {exc.code}"), exc.code) from None

    # ------------------------------------------------------------------ 流程
    def authorize_url(self, redirect_uri: str, state: str = "", prompt: str = "") -> str:
        """生成授权页地址；把用户浏览器跳到这里即可开始登录。"""
        query = {
            "app_id": self.app_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        if prompt:
            query["prompt"] = prompt
        return f"{self.base_url}/sso/authorize?{urlencode(query)}"

    def silent_url(self, redirect_uri: str, state: str = "") -> str:
        """静默登录：已授权时直接回调 ticket，否则带 error 回调，不会弹确认页。"""
        return self.authorize_url(redirect_uri, state=state, prompt="none")

    def redeem(self, ticket: str) -> dict:
        """用一次性票据换取用户资料与访问令牌。"""
        return self._request("POST", "/api/v1/ticket/redeem", {
            "app_id": self.app_id,
            "app_secret": self.app_secret,
            "ticket": ticket,
        })

    def userinfo(self, access_token: str) -> dict:
        return self._request("GET", "/api/v1/userinfo",
                             headers={"Authorization": "Bearer " + access_token})

    def login(self, username: str, password: str) -> dict:
        """产品自带登录框时，用账户密码直接换取访问令牌。"""
        return self._request("POST", "/api/v1/auth/login", {
            "app_id": self.app_id,
            "app_secret": self.app_secret,
            "username": username,
            "password": password,
        })

    def logout(self, access_token: str) -> bool:
        result = self._request("POST", "/api/v1/logout", {},
                               headers={"Authorization": "Bearer " + access_token})
        return bool(result.get("ok"))

    def verify(self) -> dict:
        """校验 app_id / app_secret 是否匹配，可用于启动自检。"""
        return self._request("POST", "/api/v1/app/verify", {
            "app_id": self.app_id,
            "app_secret": self.app_secret,
        })

    def health(self) -> dict:
        return self._request("GET", "/api/v1/health")

    # ------------------------------------------------------------------ 工具
    @staticmethod
    def ticket_from_url(url: str) -> tuple[str, str]:
        """从回调地址中解析 (ticket, state)。"""
        query = dict(
            pair.split("=", 1) for pair in urlsplit(url).query.split("&") if "=" in pair
        )
        from urllib.parse import unquote_plus

        return unquote_plus(query.get("ticket", "")), unquote_plus(query.get("state", ""))

    def wait_for_service(self, timeout: float = 20.0) -> str:
        """等待本机服务就绪（产品启动时很有用），返回 base_url。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.health().get("ok"):
                    return self.base_url
            except (SSOError, OSError):
                time.sleep(0.25)
        raise SSOError("service_unavailable", "YiStarLine Account 服务未就绪")
