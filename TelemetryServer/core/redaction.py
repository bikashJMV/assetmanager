from __future__ import annotations

import re
from typing import Any

SENSITIVE_KEYS = {
    "authorization",
    "auth",
    "token",
    "cookie",
    "email",
    "employee_code",
    "asset_tag",
    "serial_number",
    "password",
    "raw_ip",
    "user_agent",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


def _sanitize_scalar(value: Any) -> Any:
    if isinstance(value, str):
        value = EMAIL_RE.sub("[REDACTED_EMAIL]", value)
        value = JWT_RE.sub("[REDACTED_TOKEN]", value)
    return value


def sanitize_metadata(value: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    if depth > 4:
        return {"_truncated": True}

    out: dict[str, Any] = {}
    for key, raw in value.items():
        k = key.strip().lower()
        if k in SENSITIVE_KEYS:
            out[key] = "[REDACTED]"
            continue
        if isinstance(raw, dict):
            out[key] = sanitize_metadata(raw, depth + 1)
            continue
        if isinstance(raw, list):
            out[key] = [_sanitize_scalar(v) for v in raw[:50]]
            continue
        out[key] = _sanitize_scalar(raw)
    return out
