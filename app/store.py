"""SQLite 数据层：账户、会话、应用、授权、票据、令牌、审计。"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from . import security

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL,
    username_lower  TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    email           TEXT NOT NULL DEFAULT '',
    pw_hash         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    last_login_at   INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    ua           TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT '',
    remember     INTEGER NOT NULL DEFAULT 0,
    revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS recovery_codes (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS apps (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    app_id        TEXT NOT NULL UNIQUE,
    secret_hash   TEXT NOT NULL,
    redirect_uris TEXT NOT NULL DEFAULT '[]',
    scopes        TEXT NOT NULL DEFAULT '["profile"]',
    description   TEXT NOT NULL DEFAULT '',
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_used_at  INTEGER,
    public_code   TEXT,
    publisher_id  TEXT,
    publisher_name TEXT NOT NULL DEFAULT '',
    verified_at   INTEGER,
    verify_level  TEXT,
    verify_expires_at INTEGER,
    certificate_id TEXT,
    verify_claims TEXT,
    trust         TEXT NOT NULL DEFAULT 'managed' 
);

CREATE TABLE IF NOT EXISTS grants (
    user_id    TEXT NOT NULL,
    app_id     TEXT NOT NULL,
    scopes     TEXT NOT NULL DEFAULT '["profile"]',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, app_id)
);

CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at   INTEGER NOT NULL,
    revoked_at   INTEGER,
    ua           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS tickets (
    id           TEXT PRIMARY KEY,
    ticket_hash  TEXT NOT NULL UNIQUE,
    app_id       TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scopes       TEXT NOT NULL DEFAULT '["profile"]',
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    used_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_app ON tickets(app_id);

CREATE TABLE IF NOT EXISTS tokens (
    id           TEXT PRIMARY KEY,
    token_hash   TEXT NOT NULL UNIQUE,
    user_id      TEXT NOT NULL,
    app_id       TEXT NOT NULL,
    scopes       TEXT NOT NULL DEFAULT '["profile"]',
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    revoked_at   INTEGER,
    last_used_at INTEGER,
    ua           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS audit (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       INTEGER NOT NULL,
    event    TEXT NOT NULL,
    user_id  TEXT,
    username TEXT,
    app_id   TEXT,
    ip       TEXT,
    ua       TEXT,
    detail   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);

CREATE TABLE IF NOT EXISTS attempts (
    key          TEXT PRIMARY KEY,
    count        INTEGER NOT NULL,
    first_at     INTEGER NOT NULL,
    locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def now() -> int:
    return int(time.time())


def new_id() -> str:
    return uuid.uuid4().hex


def _json(value, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


class Store:
    def __init__(self, db_path: Path, pepper: bytes):
        self._lock = threading.RLock()
        self._pepper = pepper
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            str(self.path), check_same_thread=False, isolation_level=None, timeout=20
        )
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA busy_timeout=20000")
        with self._lock:
            self.conn.executescript(SCHEMA)
            self._migrate()

    def _migrate(self) -> None:
        """向后兼容旧版数据库结构。"""
        try:
            columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(users)")}
        except sqlite3.Error:
            return
        if "developer_unlocked" not in columns:
            try:
                self.conn.execute(
                    "ALTER TABLE users ADD COLUMN developer_unlocked INTEGER NOT NULL DEFAULT 0"
                )
            except sqlite3.Error:
                pass

        # 应用身份与 YiStarLine Protect 认证字段
        try:
            app_columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(apps)")}
        except sqlite3.Error:
            return
        additions = {
            "public_code": "TEXT",
            "publisher_id": "TEXT",
            "publisher_name": "TEXT NOT NULL DEFAULT ''",
            "verified_at": "INTEGER",
            "verify_level": "TEXT",
            "verify_expires_at": "INTEGER",
            "certificate_id": "TEXT",
            "verify_claims": "TEXT",
            "trust": "TEXT NOT NULL DEFAULT 'managed'",
        }
        for column, ddl in additions.items():
            if column not in app_columns:
                try:
                    self.conn.execute(f"ALTER TABLE apps ADD COLUMN {column} {ddl}")
                except sqlite3.Error:
                    pass
        # 给历史应用补发应用码
        for row in self._all("SELECT app_id FROM apps WHERE public_code IS NULL"):
            try:
                self.conn.execute(
                    "UPDATE apps SET public_code=? WHERE app_id=?",
                    (self._unique_public_code(), row["app_id"]),
                )
            except sqlite3.Error:
                pass

    # ------------------------------------------------------------------ 基础
    def close(self) -> None:
        with self._lock:
            try:
                self.conn.close()
            except sqlite3.Error:
                pass

    def _one(self, sql: str, params: tuple = ()) -> dict | None:
        with self._lock:
            row = self.conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def _all(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def _exec(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            return self.conn.execute(sql, params)

    def meta_get(self, key: str, default: str = "") -> str:
        row = self._one("SELECT value FROM meta WHERE key=?", (key,))
        return row["value"] if row else default

    def meta_set(self, key: str, value: str) -> None:
        self._exec(
            "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )

    # ------------------------------------------------------------------ 用户
    def create_user(self, username: str, display_name: str, password: str, email: str = "") -> dict:
        ts = now()
        user_id = new_id()
        pw_hash = security.hash_password(password, self._pepper, username)
        try:
            self._exec(
                "INSERT INTO users(id, username, username_lower, display_name, email, pw_hash, created_at, updated_at)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (user_id, username, username.lower(), display_name or username, email, pw_hash, ts, ts),
            )
        except sqlite3.IntegrityError:
            raise security.ValidationError("username_taken", "该用户名已被注册")
        return self.get_user(user_id) or {}

    def get_user(self, user_id: str) -> dict | None:
        return self._one("SELECT * FROM users WHERE id=?", (user_id,))

    def get_user_by_username(self, username: str) -> dict | None:
        return self._one("SELECT * FROM users WHERE username_lower=?", ((username or "").lower(),))

    def count_users(self) -> int:
        row = self._one("SELECT COUNT(*) AS c FROM users")
        return int(row["c"]) if row else 0

    def list_accounts(self, limit: int = 8) -> list[dict]:
        """登录页的本地账户列表（只暴露展示所需字段）。"""
        return self._all(
            "SELECT username, display_name, last_login_at, created_at FROM users"
            " WHERE status='active' ORDER BY last_login_at DESC, created_at ASC LIMIT ?",
            (max(1, min(int(limit), 20)),),
        )

    def update_profile(self, user_id: str, display_name: str, email: str) -> dict | None:
        self._exec(
            "UPDATE users SET display_name=?, email=?, updated_at=? WHERE id=?",
            (display_name, email, now(), user_id),
        )
        return self.get_user(user_id)

    def set_password(self, user_id: str, password: str) -> None:
        user = self.get_user(user_id)
        if not user:
            raise security.ValidationError("not_found", "账户不存在")
        pw_hash = security.hash_password(password, self._pepper, user["username"])
        self._exec(
            "UPDATE users SET pw_hash=?, updated_at=? WHERE id=?", (pw_hash, now(), user_id)
        )

    def check_password(self, user: dict, password: str) -> bool:
        return security.verify_password(password, user["pw_hash"], self._pepper, user["username"])

    def touch_login(self, user_id: str) -> None:
        self._exec("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", (now(), now(), user_id))

    def set_developer(self, user_id: str, unlocked: bool) -> None:
        self._exec(
            "UPDATE users SET developer_unlocked=?, updated_at=? WHERE id=?",
            (1 if unlocked else 0, now(), user_id),
        )

    def is_developer(self, user_id: str) -> bool:
        row = self._one("SELECT developer_unlocked FROM users WHERE id=?", (user_id,))
        return bool(row and row["developer_unlocked"])

    def delete_user(self, user_id: str) -> None:
        with self._lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                for table in ("sessions", "recovery_codes", "tokens", "grants", "tickets", "devices"):
                    self.conn.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
                self.conn.execute("DELETE FROM users WHERE id=?", (user_id,))
                self.conn.execute("COMMIT")
            except sqlite3.Error:
                self.conn.execute("ROLLBACK")
                raise

    # ------------------------------------------------------------------ 恢复码
    def create_recovery_codes(self, user_id: str, count: int = 10) -> list[str]:
        codes: list[str] = []
        ts = now()
        with self._lock:
            self.conn.execute("DELETE FROM recovery_codes WHERE user_id=?", (user_id,))
            for _ in range(count):
                code = security.random_recovery_code()
                codes.append(code)
                self.conn.execute(
                    "INSERT INTO recovery_codes(id, user_id, code_hash, created_at) VALUES(?,?,?,?)",
                    (new_id(), user_id, security.hmac_hex(self._pepper, security.normalize_recovery_code(code)), ts),
                )
        return codes

    def count_recovery_codes(self, user_id: str) -> int:
        row = self._one(
            "SELECT COUNT(*) AS c FROM recovery_codes WHERE user_id=? AND used_at IS NULL", (user_id,)
        )
        return int(row["c"]) if row else 0

    def consume_recovery_code(self, user_id: str, code: str) -> bool:
        digest = security.hmac_hex(self._pepper, security.normalize_recovery_code(code))
        cur = self._exec(
            "UPDATE recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL",
            (now(), user_id, digest),
        )
        return cur.rowcount == 1

    # ------------------------------------------------------------------ 会话
    def create_session(
        self, user_id: str, ttl_seconds: int, ua: str = "", ip: str = "", remember: bool = False
    ) -> tuple[str, dict]:
        token = "yls_" + security.new_secret(32)
        ts = now()
        session_id = new_id()
        self._exec(
            "INSERT INTO sessions(id, user_id, token_hash, created_at, last_seen_at, expires_at, ua, ip, remember)"
            " VALUES(?,?,?,?,?,?,?,?,?)",
            (
                session_id,
                user_id,
                security.hash_token(token),
                ts,
                ts,
                ts + ttl_seconds,
                ua[:300],
                ip,
                1 if remember else 0,
            ),
        )
        return token, self.get_session(session_id) or {}

    def get_session(self, session_id: str) -> dict | None:
        return self._one("SELECT * FROM sessions WHERE id=?", (session_id,))

    def session_by_token(self, token: str) -> dict | None:
        if not token:
            return None
        row = self._one(
            "SELECT s.*, u.username, u.display_name, u.email, u.status, u.created_at AS user_created_at"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token_hash=?",
            (security.hash_token(token),),
        )
        if not row:
            return None
        if row["revoked_at"] or row["expires_at"] <= now() or row["status"] != "active":
            return None
        return row

    def touch_session(self, session_id: str, last_seen_at: int) -> None:
        if now() - int(last_seen_at) >= 60:
            self._exec("UPDATE sessions SET last_seen_at=? WHERE id=?", (now(), session_id))

    def list_sessions(self, user_id: str) -> list[dict]:
        return self._all(
            "SELECT * FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?"
            " ORDER BY last_seen_at DESC",
            (user_id, now()),
        )

    def revoke_session(self, user_id: str, session_id: str) -> bool:
        cur = self._exec(
            "UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
            (now(), session_id, user_id),
        )
        return cur.rowcount == 1

    def revoke_other_sessions(self, user_id: str, keep_id: str) -> int:
        cur = self._exec(
            "UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL",
            (now(), user_id, keep_id),
        )
        return cur.rowcount

    def revoke_all_sessions(self, user_id: str) -> int:
        cur = self._exec(
            "UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (now(), user_id)
        )
        return cur.rowcount

    def count_active_sessions(self, user_id: str) -> int:
        row = self._one(
            "SELECT COUNT(*) AS c FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?",
            (user_id, now()),
        )
        return int(row["c"]) if row else 0

    # ------------------------------------------------------------------ 应用
    def create_app(
        self,
        name: str,
        redirect_uris: list[str],
        scopes: list[str] | None = None,
        description: str = "",
        is_demo: bool = False,
        publisher_id: str = "",
        publisher_name: str = "",
    ) -> tuple[dict, str]:
        app_id = "ylc_" + security.new_secret(12).replace("-", "").replace("_", "")[:16]
        secret = "ylsec_" + security.new_secret(28)
        internal_id = new_id()
        ts = now()
        secret_hash = security.hmac_hex(self._pepper, secret)
        public_code = self._unique_public_code()
        self._exec(
            "INSERT INTO apps(id, name, app_id, secret_hash, redirect_uris, scopes, description, is_demo,"
            " created_at, public_code, publisher_id, publisher_name)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                internal_id,
                name,
                app_id,
                secret_hash,
                json.dumps(redirect_uris, ensure_ascii=False),
                json.dumps(scopes or ["profile"]),
                description,
                1 if is_demo else 0,
                ts,
                public_code,
                publisher_id,
                publisher_name,
            ),
        )
        return self.get_app(app_id) or {}, secret

    def _unique_public_code(self) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(20):
            raw = "".join(secrets.choice(alphabet) for _ in range(12))
            code = "YLP-" + "-".join(raw[i:i + 4] for i in range(0, 12, 4))
            exists = self._one("SELECT 1 AS x FROM apps WHERE public_code=?", (code,))
            if not exists:
                return code
        return "YLP-" + new_id()[:12].upper()

    def create_imported_app(self, public_code: str, name: str, publisher: str,
                            redirect_uri: str) -> dict:
        """首次授权导入的应用：无共享密钥，凭本机用户确认。"""
        app_id = "ylc_" + security.new_secret(12).replace("-", "").replace("_", "")[:16]
        self._exec(
            "INSERT INTO apps(id, name, app_id, secret_hash, redirect_uris, scopes, description,"
            " is_demo, created_at, public_code, publisher_name, trust)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                new_id(),
                name[:40] or "未命名应用",
                app_id,
                "",
                json.dumps([redirect_uri], ensure_ascii=False),
                json.dumps(["profile"]),
                "",
                0,
                now(),
                public_code,
                (publisher or "")[:40],
                "imported",
            ),
        )
        return self.get_app(app_id) or {}

    def get_app_by_code(self, code: str) -> dict | None:
        cleaned = (code or "").strip().upper()
        if not cleaned:
            return None
        row = self._one("SELECT * FROM apps WHERE public_code=?", (cleaned,))
        if not row:
            return None
        row["redirect_uris"] = _json(row["redirect_uris"], [])
        row["scopes"] = _json(row["scopes"], ["profile"])
        return row

    def set_app_verified(self, app_id: str, level: str, certificate_id: str, expires_at: int,
                         claims: dict | None = None) -> None:
        self._exec(
            "UPDATE apps SET verified_at=?, verify_level=?, verify_expires_at=?, certificate_id=?,"
            " verify_claims=? WHERE app_id=?",
            (now(), level, expires_at, certificate_id, json.dumps(claims or {}, ensure_ascii=False), app_id),
        )

    def clear_app_verified(self, app_id: str) -> None:
        self._exec(
            "UPDATE apps SET verified_at=NULL, verify_level=NULL, verify_expires_at=NULL, certificate_id=NULL, verify_claims=NULL"
            " WHERE app_id=?",
            (app_id,),
        )

    def get_app(self, app_id: str) -> dict | None:
        row = self._one("SELECT * FROM apps WHERE app_id=?", (app_id,))
        if not row:
            return None
        row["redirect_uris"] = _json(row["redirect_uris"], [])
        row["scopes"] = _json(row["scopes"], ["profile"])
        row["verify_claims"] = _json(row.get("verify_claims"), {})
        return row

    def list_apps(self) -> list[dict]:
        rows = self._all("SELECT * FROM apps ORDER BY created_at ASC")
        for row in rows:
            row["redirect_uris"] = _json(row["redirect_uris"], [])
            row["scopes"] = _json(row["scopes"], ["profile"])
            row["verify_claims"] = _json(row.get("verify_claims"), {})
        return rows

    def verify_app_secret(self, app: dict, secret: str) -> bool:
        if not app or not secret:
            return False
        import hmac as _hmac

        return _hmac.compare_digest(app["secret_hash"], security.hmac_hex(self._pepper, secret))

    def rotate_app_secret(self, app_id: str) -> str | None:
        if not self.get_app(app_id):
            return None
        secret = "ylsec_" + security.new_secret(28)
        self._exec(
            "UPDATE apps SET secret_hash=? WHERE app_id=?",
            (security.hmac_hex(self._pepper, secret), app_id),
        )
        return secret

    def update_app(self, app_id: str, name: str, redirect_uris: list[str], description: str = "") -> dict | None:
        self._exec(
            "UPDATE apps SET name=?, redirect_uris=?, description=? WHERE app_id=?",
            (name, json.dumps(redirect_uris, ensure_ascii=False), description, app_id),
        )
        return self.get_app(app_id)

    def delete_app(self, app_id: str) -> None:
        with self._lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                for table in ("grants", "tickets", "tokens"):
                    self.conn.execute(f"DELETE FROM {table} WHERE app_id=?", (app_id,))
                self.conn.execute("DELETE FROM apps WHERE app_id=?", (app_id,))
                self.conn.execute("COMMIT")
            except sqlite3.Error:
                self.conn.execute("ROLLBACK")
                raise

    def touch_app(self, app_id: str) -> None:
        self._exec("UPDATE apps SET last_used_at=? WHERE app_id=?", (now(), app_id))

    # ------------------------------------------------------------------ 受信设备（快捷登录）
    def create_device(self, user_id: str, ttl_seconds: int, ua: str = "") -> tuple[str, dict]:
        token = "yld_" + security.new_secret(32)
        ts = now()
        device_id = new_id()
        self._exec(
            "INSERT INTO devices(id, user_id, token_hash, created_at, last_used_at, expires_at, ua)"
            " VALUES(?,?,?,?,?,?,?)",
            (device_id, user_id, security.hash_token(token), ts, ts, ts + ttl_seconds, ua[:300]),
        )
        return token, self._one("SELECT * FROM devices WHERE id=?", (device_id,)) or {}

    def device_by_token(self, token: str) -> dict | None:
        if not token:
            return None
        row = self._one("SELECT * FROM devices WHERE token_hash=?", (security.hash_token(token),))
        if not row:
            return None
        if row["revoked_at"] or row["expires_at"] <= now():
            return None
        return row

    def touch_device(self, device_id: str) -> None:
        self._exec("UPDATE devices SET last_used_at=? WHERE id=?", (now(), device_id))

    def revoke_devices_for_user(self, user_id: str) -> int:
        cur = self._exec(
            "UPDATE devices SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (now(), user_id)
        )
        return cur.rowcount

    def list_devices(self, user_id: str) -> list[dict]:
        return self._all(
            "SELECT * FROM devices WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_used_at DESC",
            (user_id, now()),
        )

    # ------------------------------------------------------------------ 授权
    def grant(self, user_id: str, app_id: str, scopes: list[str]) -> None:
        self._exec(
            "INSERT INTO grants(user_id, app_id, scopes, created_at) VALUES(?,?,?,?)"
            " ON CONFLICT(user_id, app_id) DO UPDATE SET scopes=excluded.scopes",
            (user_id, app_id, json.dumps(scopes), now()),
        )

    def has_grant(self, user_id: str, app_id: str) -> bool:
        return self._one("SELECT 1 AS ok FROM grants WHERE user_id=? AND app_id=?", (user_id, app_id)) is not None

    def list_grants(self, user_id: str) -> list[dict]:
        rows = self._all(
            "SELECT g.*, a.name AS app_name, a.description AS app_description"
            " FROM grants g LEFT JOIN apps a ON a.app_id = g.app_id"
            " WHERE g.user_id=? ORDER BY g.created_at DESC",
            (user_id,),
        )
        for row in rows:
            row["scopes"] = _json(row["scopes"], ["profile"])
        return rows

    def revoke_grant(self, user_id: str, app_id: str) -> bool:
        cur = self._exec("DELETE FROM grants WHERE user_id=? AND app_id=?", (user_id, app_id))
        self._exec(
            "UPDATE tokens SET revoked_at=? WHERE user_id=? AND app_id=? AND revoked_at IS NULL",
            (now(), user_id, app_id),
        )
        return cur.rowcount == 1

    # ------------------------------------------------------------------ 票据
    def create_ticket(self, app_id: str, user_id: str, redirect_uri: str, scopes: list[str]) -> tuple[str, dict]:
        ticket = "ylt_" + security.new_secret(32)
        ts = now()
        ticket_id = new_id()
        self._exec(
            "INSERT INTO tickets(id, ticket_hash, app_id, user_id, redirect_uri, scopes, created_at, expires_at)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (ticket_id, security.hash_token(ticket), app_id, user_id, redirect_uri, json.dumps(scopes), ts, ts + 90),
        )
        return ticket, self._one("SELECT * FROM tickets WHERE id=?", (ticket_id,)) or {}

    def consume_ticket(self, app_id: str, ticket: str) -> dict | None:
        ts = now()
        digest = security.hash_token(ticket)
        cur = self._exec(
            "UPDATE tickets SET used_at=? WHERE ticket_hash=? AND app_id=? AND used_at IS NULL AND expires_at>?",
            (ts, digest, app_id, ts),
        )
        if cur.rowcount != 1:
            return None
        return self._one("SELECT * FROM tickets WHERE ticket_hash=?", (digest,))

    # ------------------------------------------------------------------ 令牌
    def create_access_token(
        self, user_id: str, app_id: str, scopes: list[str], ttl: int, ua: str = ""
    ) -> tuple[str, dict]:
        token = "yla_" + security.new_secret(32)
        ts = now()
        token_id = new_id()
        self._exec(
            "INSERT INTO tokens(id, token_hash, user_id, app_id, scopes, created_at, expires_at, ua)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (token_id, security.hash_token(token), user_id, app_id, json.dumps(scopes), ts, ts + ttl, ua[:300]),
        )
        self.touch_app(app_id)
        return token, self._one("SELECT * FROM tokens WHERE id=?", (token_id,)) or {}

    def token_by_value(self, token: str) -> dict | None:
        if not token:
            return None
        row = self._one("SELECT * FROM tokens WHERE token_hash=?", (security.hash_token(token),))
        if not row:
            return None
        if row["revoked_at"] or row["expires_at"] <= now():
            return None
        return row

    def touch_token(self, token_id: str) -> None:
        self._exec("UPDATE tokens SET last_used_at=? WHERE id=?", (now(), token_id))

    def list_tokens(self, user_id: str) -> list[dict]:
        rows = self._all(
            "SELECT t.*, a.name AS app_name FROM tokens t LEFT JOIN apps a ON a.app_id=t.app_id"
            " WHERE t.user_id=? AND t.revoked_at IS NULL AND t.expires_at>? ORDER BY t.created_at DESC",
            (user_id, now()),
        )
        for row in rows:
            row["scopes"] = _json(row["scopes"], ["profile"])
        return rows

    def revoke_token(self, user_id: str, token_id: str) -> bool:
        cur = self._exec(
            "UPDATE tokens SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
            (now(), token_id, user_id),
        )
        return cur.rowcount == 1

    def revoke_token_by_id(self, token_id: str) -> None:
        self._exec("UPDATE tokens SET revoked_at=? WHERE id=?", (now(), token_id))

    def revoke_tokens_for_app(self, user_id: str, app_id: str) -> int:
        cur = self._exec(
            "UPDATE tokens SET revoked_at=? WHERE user_id=? AND app_id=? AND revoked_at IS NULL",
            (now(), user_id, app_id),
        )
        return cur.rowcount

    # ------------------------------------------------------------------ 审计
    def audit(
        self,
        event: str,
        user_id: str | None = None,
        username: str | None = None,
        app_id: str | None = None,
        ip: str = "",
        ua: str = "",
        detail: str = "",
    ) -> None:
        self._exec(
            "INSERT INTO audit(ts, event, user_id, username, app_id, ip, ua, detail) VALUES(?,?,?,?,?,?,?,?)",
            (now(), event, user_id, username, app_id, ip, ua[:300], detail[:500]),
        )
        row = self._one("SELECT COUNT(*) AS c FROM audit")
        if row and int(row["c"]) > 3000:
            self._exec(
                "DELETE FROM audit WHERE id IN (SELECT id FROM audit ORDER BY id ASC LIMIT 500)"
            )

    def list_audit(self, user_id: str | None = None, limit: int = 60) -> list[dict]:
        limit = max(1, min(int(limit), 300))
        if user_id:
            return self._all(
                "SELECT * FROM audit WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit)
            )
        return self._all("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))

    def clear_audit(self) -> int:
        cur = self._exec("DELETE FROM audit")
        return cur.rowcount

    def count_audit(self, user_id: str | None = None) -> int:
        if user_id:
            row = self._one("SELECT COUNT(*) AS c FROM audit WHERE user_id=?", (user_id,))
        else:
            row = self._one("SELECT COUNT(*) AS c FROM audit")
        return int(row["c"]) if row else 0

    # ------------------------------------------------------------------ 限流
    def attempt_state(self, key: str) -> dict:
        row = self._one("SELECT * FROM attempts WHERE key=?", (key,))
        if not row:
            return {"count": 0, "first_at": 0, "locked_until": 0}
        if row["locked_until"] and row["locked_until"] <= now():
            self._exec("DELETE FROM attempts WHERE key=?", (key,))
            return {"count": 0, "first_at": 0, "locked_until": 0}
        return row

    def register_failure(self, key: str, max_failures: int, window: int) -> dict:
        ts = now()
        with self._lock:
            row = self._one("SELECT * FROM attempts WHERE key=?", (key,))
            if not row or (row["first_at"] and ts - row["first_at"] > window):
                self._exec(
                    "INSERT INTO attempts(key, count, first_at, locked_until) VALUES(?,?,?,0)"
                    " ON CONFLICT(key) DO UPDATE SET count=1, first_at=excluded.first_at, locked_until=0",
                    (key, 1, ts),
                )
                return {"count": 1, "locked_until": 0}
            count = int(row["count"]) + 1
            locked_until = 0
            if count >= max_failures:
                over = count - max_failures
                locked_until = ts + min(900, 30 * (2 ** min(over, 5)))
            self._exec(
                "UPDATE attempts SET count=?, locked_until=? WHERE key=?", (count, locked_until, key)
            )
            return {"count": count, "locked_until": locked_until}

    def reset_attempts(self, key: str) -> None:
        self._exec("DELETE FROM attempts WHERE key=?", (key,))

    # ------------------------------------------------------------------ 维护
    def purge_expired(self) -> None:
        ts = now()
        with self._lock:
            self.conn.execute("DELETE FROM tickets WHERE expires_at < ?", (ts - 86400,))
            self.conn.execute(
                "DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
                (ts - 7 * 86400, ts - 7 * 86400),
            )
            self.conn.execute(
                "DELETE FROM tokens WHERE (expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?))",
                (ts - 7 * 86400, ts - 7 * 86400),
            )
            self.conn.execute("DELETE FROM attempts WHERE first_at < ? AND locked_until < ?", (ts - 86400, ts))

    def stats(self) -> dict:
        app_count = self._one("SELECT COUNT(*) AS c FROM apps")
        return {
            "users": self.count_users(),
            "apps": int(app_count["c"]) if app_count else 0,
            "audit": self.count_audit(),
            "db_bytes": self.path.stat().st_size if self.path.exists() else 0,
        }

    def backup_to(self, target_dir: Path) -> Path:
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        target = target_dir / f"accounts-{stamp}.db"
        with self._lock:
            safe = str(target).replace("'", "''")
            self.conn.execute(f"VACUUM INTO '{safe}'")
        key_src = self.path.parent / "secret.key"
        if key_src.exists():
            (target_dir / f"secret-{stamp}.key").write_bytes(key_src.read_bytes())
        return target
