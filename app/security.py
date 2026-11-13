"""密码学与校验工具（仅使用 Python 标准库）。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import time
from pathlib import Path

SCRYPT_N = 1 << 15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_MAXMEM = 96 * 1024 * 1024
DKLEN = 32
MIN_PASSWORD = 8
MAX_PASSWORD = 200
MIN_USERNAME = 3
MAX_USERNAME = 24

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


class ValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def new_secret(nbytes: int = 32) -> str:
    return b64e(secrets.token_bytes(nbytes))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hmac_hex(pepper: bytes, message: str) -> str:
    return hmac.new(pepper, message.encode("utf-8"), hashlib.sha256).hexdigest()


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=DKLEN, maxmem=SCRYPT_MAXMEM
    )


def hash_password(password: str, pepper: bytes, username: str = "") -> str:
    """scrypt 派生 + 服务端 pepper；返回自描述字符串。"""
    salt = secrets.token_bytes(16)
    material = (username.lower() + "\x00" + password) if username else password
    digest = _scrypt(material, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    digest = hmac.new(pepper, digest, hashlib.sha256).digest()
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64e(salt)}${b64e(digest)}"


def verify_password(password: str, stored: str, pepper: bytes, username: str = "") -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = b64d(salt_b64)
        expected = b64d(digest_b64)
        material = (username.lower() + "\x00" + password) if username else password
        actual = _scrypt(material, salt, int(n), int(r), int(p))
        actual = hmac.new(pepper, actual, hashlib.sha256).digest()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def dummy_verify() -> None:
    """未知用户名时消耗等量时间，弱化计时侧信道。"""
    try:
        _scrypt("dummy-password", b"\x00" * 16, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    except (ValueError, MemoryError):
        pass


STRENGTH_LABELS = ["太短", "很弱", "较弱", "一般", "良好", "很强"]


def password_strength(password: str) -> dict:
    pw = password or ""
    score = 0
    if len(pw) >= MIN_PASSWORD:
        score += 1
    if len(pw) >= 12:
        score += 1
    if len(pw) >= 16:
        score += 1
    classes = 0
    for pattern in (r"[a-z]", r"[A-Z]", r"[0-9]", r"[^A-Za-z0-9]"):
        if re.search(pattern, pw):
            classes += 1
    if classes >= 2:
        score += 1
    if classes >= 3:
        score += 1
    if re.search(r"(.)\1{2,}", pw) or re.search(r"(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)", pw.lower()):
        score -= 1
    score = max(0, min(5, score))
    return {
        "score": score,
        "label": STRENGTH_LABELS[score],
        "length": len(pw),
        "valid": len(pw) >= MIN_PASSWORD,
    }


def validate_username(username: str) -> str:
    value = (username or "").strip()
    if not USERNAME_RE.match(value):
        raise ValidationError(
            "invalid_username",
            f"用户名需为 {MIN_USERNAME}-{MAX_USERNAME} 位，以字母或数字开头，可含字母、数字、下划线、点、连字符",
        )
    return value


def validate_password(password: str) -> str:
    if not isinstance(password, str):
        raise ValidationError("invalid_password", "密码格式不正确")
    if len(password) < MIN_PASSWORD:
        raise ValidationError("weak_password", f"密码至少需要 {MIN_PASSWORD} 位字符")
    if len(password) > MAX_PASSWORD:
        raise ValidationError("weak_password", f"密码不能超过 {MAX_PASSWORD} 位字符")
    if password.strip() == "":
        raise ValidationError("weak_password", "密码不能为空白字符")
    return password


def validate_display_name(name: str) -> str:
    value = (name or "").strip()
    if not value:
        return ""
    if len(value) > 32:
        raise ValidationError("invalid_display_name", "昵称不能超过 32 个字符")
    if any(ch in value for ch in "\r\n\t"):
        raise ValidationError("invalid_display_name", "昵称不能包含换行或制表符")
    return value


def validate_email(email: str) -> str:
    value = (email or "").strip()
    if not value:
        return ""
    if len(value) > 120 or not EMAIL_RE.match(value):
        raise ValidationError("invalid_email", "邮箱格式不正确")
    return value


def is_loopback_url(url: str) -> bool:
    from urllib.parse import urlsplit

    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https"):
        return False
    host = (parts.hostname or "").lower()
    return host in LOOPBACK_HOSTS


def validate_redirect_uri(uri: str) -> str:
    from urllib.parse import urlsplit

    value = (uri or "").strip()
    if not value or len(value) > 500:
        raise ValidationError("invalid_redirect", "回调地址不合法")
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https"):
        raise ValidationError("invalid_redirect", "回调地址必须以 http:// 或 https:// 开头")
    if not parts.hostname:
        raise ValidationError("invalid_redirect", "回调地址缺少主机名")
    if parts.fragment:
        raise ValidationError("invalid_redirect", "回调地址不能带 # 片段")
    return value


def random_recovery_code() -> str:
    """20 位 Crockford Base32，分组显示；约 100 bit 熵。"""
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    raw = secrets.token_bytes(13)
    num = int.from_bytes(raw, "big")
    chars = []
    for _ in range(20):
        chars.append(alphabet[num & 31])
        num >>= 5
    text = "".join(reversed(chars))
    return "-".join(text[i : i + 5] for i in range(0, 20, 5))


def normalize_recovery_code(code: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z]", "", (code or "")).upper()
    cleaned = cleaned.replace("O", "0").replace("I", "1").replace("L", "1").replace("U", "V")
    return cleaned


def now() -> int:
    return int(time.time())


def load_or_create_key(path: Path) -> bytes:
    if path.exists():
        try:
            raw = path.read_bytes()
            if len(raw) >= 32:
                return raw[:32]
        except OSError:
            pass
    key = secrets.token_bytes(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".key.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(key)
    os.replace(tmp, path)
    _harden_key(path)
    return key


def _harden_key(path: Path) -> None:
    """尽力收紧密钥文件权限（失败不影响运行）。"""
    if os.name != "nt":
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return
    try:
        import subprocess

        user = os.environ.get("USERNAME") or ""
        if not user:
            return
        subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:F"],
            capture_output=True,
            timeout=10,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        pass
