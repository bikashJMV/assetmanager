from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    detail: str = Field(..., description="Human-readable error explanation")


class ResponseMeta(BaseModel):
    request_id: str = Field(..., description="Unique request trace identifier")
    timestamp: str = Field(..., description="ISO-8601 UTC response timestamp")
    count: int = Field(0, description="Number of records in data (0 for errors)")
    total: Optional[int] = Field(None, description="Total matching records (paginated endpoints)")
    page: Optional[int] = Field(None, description="Current page number (paginated endpoints)")
    page_size: Optional[int] = Field(None, description="Items per page (paginated endpoints)")


class ApiEnvelope(BaseModel):
    status_code: int
    status: bool
    message: str
    data: Any = None
    error: Optional[ErrorDetail] = None
    meta: ResponseMeta


def _compute_count(data: Any) -> int:
    if data is None:
        return 0
    if isinstance(data, list):
        return len(data)
    return 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def success_envelope(
    data: Any,
    *,
    message: str = "OK",
    status_code: int = 200,
    request_id: Optional[str] = None,
    total: Optional[int] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> dict[str, Any]:
    return ApiEnvelope(
        status_code=status_code,
        status=True,
        message=message,
        data=data,
        error=None,
        meta=ResponseMeta(
            request_id=request_id or str(uuid.uuid4()),
            timestamp=_now_iso(),
            count=_compute_count(data),
            total=total,
            page=page,
            page_size=page_size,
        ),
    ).model_dump(exclude_none=True)


def error_envelope(
    *,
    status_code: int,
    message: str,
    error_code: str = "UNKNOWN_ERROR",
    detail: Optional[str] = None,
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    return ApiEnvelope(
        status_code=status_code,
        status=False,
        message=message,
        data=None,
        error=ErrorDetail(code=error_code, detail=detail or message),
        meta=ResponseMeta(
            request_id=request_id or str(uuid.uuid4()),
            timestamp=_now_iso(),
            count=0,
        ),
    ).model_dump(exclude_none=True)
