from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def success_response(*, message: str, data: Any, status_code: int = 200) -> dict[str, Any]:
    return {
        "status": "success",
        "status_code": status_code,
        "message": message,
        "timestamp": _now_iso(),
        "data": data,
    }


def error_response(
    *,
    message: str,
    status_code: int,
    error_code: str,
    details: str,
    data: Any = None,
) -> dict[str, Any]:
    return {
        "status": "error",
        "status_code": status_code,
        "message": message,
        "timestamp": _now_iso(),
        "data": data,
        "error": {
            "code": error_code,
            "details": details,
        },
    }

