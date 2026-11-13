"""YiStarLine Account —— 本地 SSO 服务入口（Python 标准库，完全离线）。"""
from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app import api as api_mod
    from app import config, security, sso
    from app.store import Store
else:  # pragma: no cover
    from . import api as api_mod
    from . import config, security, sso
    from .store import Store

SECURITY_HEADERS = [
    ("Content-Security-Policy",
     "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
     "script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; "
     "base-uri 'none'; form-action 'self'"),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()"),
]

MAX_BODY = 2 * 1024 * 1024
logger = logging.getLogger("yistarline")


# ---------------------------------------------------------------------- 日志
def setup_logging(console: bool = True) -> None:
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    try:
        handler = logging.FileHandler(config.LOG_PATH, encoding="utf-8")
        handler.setFormatter(fmt)
        logger.addHandler(handler)
    except OSError:
        pass
    if console:
        stream = logging.StreamHandler(sys.stdout)
        stream.setFormatter(fmt)
        logger.addHandler(stream)


# ---------------------------------------------------------------------- 进程工具
def process_alive(pid: int) -> bool:
    if not pid:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, int(pid))
        if not handle:
            return False
        code = ctypes.c_ulong()
        ok = kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return bool(ok) and code.value == 259  # STILL_ACTIVE
    except (OSError, AttributeError, ValueError):
        return False


def find_edge() -> str | None:
    candidates = [
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
        / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
        / "Google/Chrome/Application/chrome.exe",
    ]
    for path in candidates:
        try:
            if path.is_file():
                return str(path)
        except OSError:
            continue
    return None


def open_ui(url: str, app_window: bool = False) -> None:
    """用 Edge/Chrome 的应用窗口打开，形成"桌面软件"观感；否则退回默认浏览器。"""
    if os.name == "nt" and app_window:
        browser = find_edge()
        if browser:
            try:
                subprocess.Popen(
                    [browser, f"--app={url}", "--window-size=1320,880", "--no-first-run",
                     "--no-default-browser-check"],
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    close_fds=True,
                )
                return
            except OSError:
                logger.warning("无法启动 Edge 应用窗口，改用默认浏览器")
    try:
        webbrowser.open(url)
    except Exception:  # pragma: no cover
        logger.warning("无法自动打开浏览器，请手动访问 %s", url)


# ---------------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = f"YiStarLineAccount/{config.APP_VERSION}"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------ 基础
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def log_error(self, fmt: str, *args) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch()

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch()

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch()

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch()

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch()

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._dispatch()

    # ------------------------------------------------------------ 分发
    def _dispatch(self) -> None:
        started = time.perf_counter()
        try:
            parsed = urlsplit(self.path)
            path = unquote(parsed.path) or "/"
            if len(path) > 1 and path.endswith("/") and not path.startswith("/demo/"):
                path = path.rstrip("/") or "/"
            query = dict(parse_qsl(parsed.query, keep_blank_values=True))

            if not self._host_allowed():
                self._send(403, b"Invalid Host", "text/plain; charset=utf-8")
                return

            is_api = (
                path.startswith("/api/")
                or path.startswith("/sso/")
                or path.startswith("/demo/api/")
                or path == "/demo/callback"
            )
            if is_api:
                self._handle_api(path, query)
            else:
                self._handle_static(path)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:  # pragma: no cover
            logger.error("请求处理失败:\n%s", traceback.format_exc())
            try:
                self._send(500, b'{"ok":false,"error":{"code":"server_error"}}',
                           "application/json; charset=utf-8")
            except Exception:
                pass
        finally:
            elapsed = (time.perf_counter() - started) * 1000
            if elapsed > 400 or self.command not in ("GET", "HEAD"):
                logger.info("%s %s %.1fms", self.command, self.path, elapsed)

    def _host_allowed(self) -> bool:
        host = (self.headers.get("Host") or "").strip().lower()
        port = self.server.server_address[1]
        allowed = {
            f"127.0.0.1:{port}", f"localhost:{port}", "127.0.0.1", "localhost",
            f"[::1]:{port}", "[::1]",
        }
        return host in allowed

    def _read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return b""
        if length > MAX_BODY:
            raise api_mod.ApiError(413, "payload_too_large", "请求内容过大")
        return self.rfile.read(length)

    def _cookies(self) -> dict:
        raw = self.headers.get("Cookie") or ""
        jar = SimpleCookie()
        try:
            jar.load(raw)
        except Exception:
            return {}
        return {key: morsel.value for key, morsel in jar.items()}

    def _handle_api(self, path: str, query: dict) -> None:
        try:
            body = self._read_body()
        except api_mod.ApiError as exc:
            self._send(exc.status, json.dumps({"ok": False, "error": {"code": exc.code, "message": exc.message}},
                                             ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")
            return
        req = api_mod.Request(
            method=self.command,
            path=path,
            query=query,
            headers={k.lower(): v for k, v in self.headers.items()},
            cookies=self._cookies(),
            body=body,
            ip=self.client_address[0] if self.client_address else "",
        )
        api: api_mod.Api = self.server.api  # type: ignore[attr-defined]
        if self.command == "OPTIONS" and path.startswith("/api/v1/"):
            reply = api.preflight(req)
        else:
            reply = api.handle(req)
        headers = list(reply.headers)
        if path.startswith("/api/") or path.startswith("/sso/"):
            headers.append(("Cache-Control", "no-store"))
        self._send(reply.status, reply.body, reply.content_type, headers)

    def _handle_static(self, path: str) -> None:
        web_dir: Path = self.server.web_dir  # type: ignore[attr-defined]
        if path in ("/", ""):
            path = "/index.html"
        if path.rstrip("/") == "/demo":
            path = "/demo/index.html"
        if path == "/favicon.ico":
            path = "/favicon.svg"
        relative = path.lstrip("/")
        target = (web_dir / relative).resolve()
        try:
            target.relative_to(web_dir.resolve())
        except ValueError:
            self._send(403, b"forbidden", "text/plain; charset=utf-8")
            return
        if not target.is_file():
            if "." not in Path(relative).name:
                target = web_dir / "index.html"
            else:
                self._send(404, "找不到该资源 · Not Found".encode("utf-8"), "text/plain; charset=utf-8")
                return
        try:
            data = target.read_bytes()
            stat = target.stat()
        except OSError:
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if target.suffix == ".js":
            ctype = "text/javascript; charset=utf-8"
        elif target.suffix in (".css",):
            ctype = "text/css; charset=utf-8"
        elif target.suffix in (".svg",):
            ctype = "image/svg+xml"
        elif target.suffix in (".html",):
            ctype = "text/html; charset=utf-8"
        elif target.suffix in (".md", ".txt"):
            ctype = "text/plain; charset=utf-8"
        etag = f'W/"{int(stat.st_mtime)}-{stat.st_size}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self._common_headers()
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        cache = "no-cache" if target.suffix == ".html" else "public, max-age=120"
        self._send(200, data, ctype, [("ETag", etag), ("Cache-Control", cache)])

    def _common_headers(self) -> None:
        for key, value in SECURITY_HEADERS:
            self.send_header(key, value)

    def _send(self, status: int, body: bytes, content_type: str,
              headers: list[tuple[str, str]] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in headers or []:
            self.send_header(key, value)
        self._common_headers()
        self.end_headers()
        if self.command != "HEAD" and body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler, api, web_dir: Path):
        self.api = api
        self.web_dir = web_dir
        self.started_at = time.time()
        super().__init__(address, handler)

    def handle_error(self, request, client_address):  # noqa: D102
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        logger.error("连接处理异常: %s", exc)


# ---------------------------------------------------------------------- 启动
def pid_lock_acquire() -> bool:
    config.LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    if config.LOCK_PATH.exists():
        try:
            payload = json.loads(config.LOCK_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            payload = {}
        pid = int(payload.get("pid") or 0)
        if pid and process_alive(pid):
            return False
        try:
            config.LOCK_PATH.unlink()
        except OSError:
            return False
    try:
        fd = os.open(str(config.LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"pid": os.getpid(), "ts": int(time.time())}, handle)
        return True
    except FileExistsError:
        return False


def pid_lock_release() -> None:
    try:
        config.LOCK_PATH.unlink()
    except OSError:
        pass


def pick_port(preferred: int) -> int | None:
    for offset in range(config.PORT_SCAN):
        candidate = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((config.HOST, candidate))
            except OSError:
                continue
            return candidate
    return None


def purge_loop(store: Store, stop: threading.Event) -> None:
    while not stop.wait(900):
        try:
            store.purge_expired()
        except Exception:  # pragma: no cover
            logger.warning("清理过期数据失败")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="YiStarLine Account 本地离线 SSO 服务")
    parser.add_argument("--port", type=int, default=0, help="监听端口（默认读取配置）")
    parser.add_argument("--open", action="store_true", help="启动后打开管理界面")
    parser.add_argument("--app-window", action="store_true", help="以浏览器应用窗口打开界面")
    parser.add_argument("--console", action="store_true", help="在控制台输出日志")
    parser.add_argument("--quiet", action="store_true", help="不输出启动横幅")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config.ensure_dirs()
    setup_logging(console=not args.quiet)

    cfg = config.load_config()
    preferred = args.port or int(cfg.get("port") or config.DEFAULT_PORT)

    if not pid_lock_acquire():
        runtime = config.read_runtime() or {}
        url = runtime.get("base_url") or f"http://{config.HOST}:{preferred}"
        logger.info("YiStarLine Account 已在运行：%s", url)
        if args.open:
            open_ui(url, args.app_window)
        print(f"YiStarLine Account 已在运行：{url}")
        return 0

    exit_code = 0
    httpd = None
    stop_event = threading.Event()
    try:
        port = pick_port(preferred)
        if not port:
            logger.error("端口 %s 起连续 %s 个端口均被占用，无法启动", preferred, config.PORT_SCAN)
            return 2
        if port != preferred:
            logger.warning("端口 %s 被占用，已改用 %s", preferred, port)

        pepper = security.load_or_create_key(config.KEY_PATH)
        store = Store(config.DB_PATH, pepper)
        api_mod.seed_demo_app(store)
        base_url = f"http://{config.HOST}:{port}"
        engine = sso.SSOEngine(store, lambda: base_url)

        def request_shutdown() -> None:
            if httpd is not None:
                logger.info("收到关闭请求，服务即将停止")
                stop_event.set()
                threading.Thread(target=httpd.shutdown, daemon=True).start()

        api = api_mod.Api(
            store=store,
            engine=engine,
            cfg=cfg,
            base_url=base_url,
            started_at=time.time(),
            on_shutdown=request_shutdown,
        )
        httpd = Server((config.HOST, port), Handler, api, config.WEB_DIR)
        config.write_runtime(port)
        config.save_config({**cfg, "port": port})

        threading.Thread(target=purge_loop, args=(store, stop_event), daemon=True).start()

        def handle_signal(signum, _frame):  # noqa: ANN001
            logger.info("收到信号 %s，正在关闭…", signum)
            stop_event.set()
            threading.Thread(target=httpd.shutdown, daemon=True).start()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, handle_signal)
            except (ValueError, OSError):
                pass

        if not args.quiet:
            banner = (
                "\n"
                f"  {config.APP_NAME}  v{config.APP_VERSION}\n"
                "  离线单点登录 · 数据仅保存在本机\n"
                "  " + "-" * 46 + "\n"
                f"   管理界面 : {base_url}\n"
                f"   数据目录 : {config.DATA_DIR}\n"
                f"   接口版本 : v{config.PROTOCOL_VERSION}   (按 Ctrl+C 停止)\n"
            )
            print(banner, flush=True)

        logger.info("服务已启动 %s  pid=%s", base_url, os.getpid())

        if args.open:
            threading.Timer(0.8, open_ui, args=(base_url, args.app_window)).start()

        httpd.serve_forever(poll_interval=0.4)
    except OSError as exc:
        logger.error("启动失败：%s", exc)
        exit_code = 3
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        if httpd is not None:
            try:
                httpd.server_close()
            except Exception:
                pass
        try:
            config.RUNTIME_PATH.unlink(missing_ok=True)
        except OSError:
            pass
        pid_lock_release()
        logger.info("服务已停止")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
