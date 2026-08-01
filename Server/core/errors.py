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

