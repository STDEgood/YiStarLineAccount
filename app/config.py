"""YiStarLine Account —— 全局配置与路径解析。

数据目录固定为:  %USERPROFILE%\\YiStarLineAccount\\data
(可用环境变量 YISTARLINE_HOME 覆盖根目录，仅用于测试/便携部署)
"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path

APP_NAME = "YiStarLine Account"
APP_FULL_NAME = "YiStarLine Account Unified App"
APP_SLUG = "yistarline-account"
APP_MARK = "YAUA"
APP_VERSION = "1.2.0"
PROTOCOL_VERSION = "1"

HOST = "127.0.0.1"
DEFAULT_PORT = 8600
PORT_SCAN = 24

# 票据 / 令牌有效期（秒）
TICKET_TTL = 90
ACCESS_TOKEN_TTL = 30 * 24 * 3600
SESSION_TTL_DAYS = 7
REMEMBER_TTL_DAYS = 30
MAX_LOGIN_FAILURES = 5
LOCK_WINDOW = 15 * 60

DEFAULT_CONFIG = {
    "port": DEFAULT_PORT,
    "session_days": SESSION_TTL_DAYS,
    "remember_days": REMEMBER_TTL_DAYS,
    "allow_register": True,
    "theme": "dark",
    "first_run": True,
}


def user_home() -> Path:
    """读取当前 Windows 用户目录（USERPROFILE），不写死用户名。"""
    for key in ("USERPROFILE", "HOME"):
        value = os.environ.get(key)
        if value:
            return Path(value)
    return Path.home()


def data_root() -> Path:
    override = os.environ.get("YISTARLINE_HOME")
    if override:
        return Path(override).expanduser()
    return user_home() / "YiStarLineAccount"


ROOT = data_root()
APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
WEB_DIR = PROJECT_DIR / "web"
RUN_DIR = PROJECT_DIR / "run"
INTEGRATION_DIR = PROJECT_DIR / "integration"
DOCS_DIR = PROJECT_DIR / "docs"

DATA_DIR = ROOT / "data"
LOG_DIR = ROOT / "logs"
BACKUP_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "accounts.db"
KEY_PATH = DATA_DIR / "secret.key"
CONFIG_PATH = DATA_DIR / "config.json"
RUNTIME_PATH = DATA_DIR / "runtime.json"
LOCK_PATH = DATA_DIR / "server.lock"
LOG_PATH = LOG_DIR / "server.log"

_lock = threading.RLock()
_cached_config: dict | None = None


def ensure_dirs() -> None:
    for path in (ROOT, DATA_DIR, LOG_DIR, BACKUP_DIR, WEB_DIR):
        path.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    global _cached_config
    with _lock:
        if _cached_config is not None:
            return dict(_cached_config)
        cfg = dict(DEFAULT_CONFIG)
        try:
            if CONFIG_PATH.exists():
                raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    for key, value in raw.items():
                        if key in DEFAULT_CONFIG:
                            cfg[key] = value
        except (OSError, ValueError):
            pass
        _cached_config = cfg
        return dict(cfg)


def save_config(cfg: dict) -> dict:
    global _cached_config
    with _lock:
        merged = dict(DEFAULT_CONFIG)
        merged.update({k: v for k, v in cfg.items() if k in DEFAULT_CONFIG})
        ensure_dirs()
        tmp = CONFIG_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, CONFIG_PATH)
        _cached_config = merged
        return dict(merged)


def update_config(**changes) -> dict:
    cfg = load_config()
    cfg.update(changes)
    return save_config(cfg)


def write_runtime(port: int) -> None:
    payload = {
        "app": APP_NAME,
        "version": APP_VERSION,
        "protocol": PROTOCOL_VERSION,
        "host": HOST,
        "port": port,
        "base_url": f"http://{HOST}:{port}",
        "pid": os.getpid(),
        "started_at": int(__import__("time").time()),
    }
    ensure_dirs()
    tmp = RUNTIME_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, RUNTIME_PATH)


def read_runtime() -> dict | None:
    try:
        return json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))
