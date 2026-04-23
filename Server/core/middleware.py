import asyncio
import base64
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from schemas.envelope import error_envelope, success_envelope

logger = logging.getLogger(__name__)

_ERROR_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def _http_error_code(status: int) -> str:
    return _ERROR_CODE_MAP.get(status, "UNKNOWN_ERROR")


def _success_message(method: str, status: int) -> str:
    if status == 201:
        return "Created successfully."
    if status == 204:
        return "Deleted successfully."
    if method == "PUT" or method == "PATCH":
        return "Updated successfully."
    return "Request successful."


def _extract_error_message(body: dict | list | str) -> str:
    if isinstance(body, dict):
        return str(body.get("detail") or body.get("message") or "Request failed.")
    return str(body) if body else "Request failed."


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request_id to every request and log it with basic timing."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        from core.settings import settings  # local import avoids circular dep at module load

        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        response.headers["x-request-id"] = request_id

        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "elapsed_ms": elapsed_ms,
            },
        )

        return response


class EnvelopeMiddleware(BaseHTTPMiddleware):
    """
    Wrap JSON responses in the standard API envelope when:
      - path starts with /v2/  (path is rewritten to strip /v2)
      - client sends header  X-Response-Envelope: true
    v1 routes remain completely untouched.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        envelope_mode = self._detect_envelope_mode(request)
        request.state.envelope_mode = envelope_mode

        response = await call_next(request)

        if not envelope_mode:
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        body_bytes = b""
        async for chunk in response.body_iterator:
            body_bytes += chunk if isinstance(chunk, bytes) else chunk.encode()

        request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))

        try:
            data = json.loads(body_bytes)
        except (json.JSONDecodeError, ValueError):
            return Response(
                content=body_bytes,
                status_code=response.status_code,
                media_type=content_type,
            )

        if response.status_code >= 400:
            wrapped = error_envelope(
                status_code=response.status_code,
                message=_extract_error_message(data),
                error_code=_http_error_code(response.status_code),
                request_id=request_id,
            )
        else:
            wrapped = success_envelope(
                data=data,
                status_code=response.status_code,
                message=_success_message(request.method, response.status_code),
                request_id=request_id,
            )

        resp_bytes = json.dumps(wrapped, default=str).encode("utf-8")
        return Response(
            content=resp_bytes,
            status_code=response.status_code,
            media_type="application/json",
            headers={"x-request-id": request_id},
        )

    @staticmethod
    def _detect_envelope_mode(request: Request) -> bool:
        if request.headers.get("x-response-envelope", "").strip().lower() == "true":
            return True

        path: str = request.scope.get("path", "")
        if path.startswith("/v2/") or path == "/v2":
            request.scope["path"] = path[3:] or "/"
            return True

        return False
