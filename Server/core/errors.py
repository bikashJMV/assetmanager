import logging
from typing import Any, Optional

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

from core.settings import settings

logger = logging.getLogger(__name__)

LOCAL_ENVS = {"local", "dev", "development", "test"}


def _is_local_env() -> bool:
    return settings.ENV.strip().lower() in LOCAL_ENVS


def _extract_error_field(err: Any, name: str) -> Optional[Any]:
    value = getattr(err, name, None)
    if value is not None:
        return value
    if isinstance(err, dict):
        return err.get(name)
    return None


def _error_message(err: Exception) -> str:
    explicit = _extract_error_field(err, "message")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    return str(err).strip() or "Database operation failed."


async def custom_http_exception_handler(request: Request, exc: HTTPException):
    """
    Return HTTPException payload as-is to preserve explicit status codes.
    """
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


async def generic_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unexpected internal errors.
    """
    logger.error("Unhandled exception: %s", str(exc), exc_info=True)
    detail = str(exc) if _is_local_env() else "An internal server error occurred."
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail},
    )


def _map_status_code(raw_status: Any) -> Optional[int]:
    try:
        status_code = int(raw_status)
    except (TypeError, ValueError):
        return None

    if status_code in {400, 401, 403, 404, 409, 422, 429}:
        return status_code
    return None


def handle_supabase_error(e: Exception):
    """
    Map Supabase/PostgREST exceptions to stable HTTP responses.
    """
    if isinstance(e, HTTPException):
        raise e

    code = str(_extract_error_field(e, "code") or "").strip()
    message = _error_message(e)
    lower_msg = message.lower()
    mapped_status = _map_status_code(_extract_error_field(e, "status_code"))
    detail = message if _is_local_env() else "Database operation failed."

    logger.error(
        "Supabase error mapped",
        extra={"supabase_code": code or None, "supabase_message": message},
        exc_info=True,
    )

    if mapped_status is not None:
        if mapped_status == 409:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resource already exists.")
        raise HTTPException(status_code=mapped_status, detail=detail)

    if code in {"23505"} or "duplicate key" in lower_msg:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resource already exists.")

    if code in {"23503", "23514", "22P02"} or "foreign key" in lower_msg or "invalid input" in lower_msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    if code in {"PGRST116"} or "not found" in lower_msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found.")

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=detail if _is_local_env() else "Database operation failed.",
    )
