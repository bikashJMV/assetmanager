import asyncio
import base64
import json
import logging
import time
import uuid
from datetime import datetime, timezone

import httpx
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from schemas.envelope import error_envelope, success_envelope

logger = logging.getLogger(__name__)

# Paths that add no value as telemetry events
_TELEMETRY_SKIP_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})

_ERROR_CATEGORY_MAP: dict[int, str] = {
    400: "validation",
    401: "auth",
    403: "forbidden",
    404: "not_found",
    422: "validation",
    429: "rate_limit",
    500: "server_error",
    503: "dependency",
}


def _extract_user_id(request: Request) -> str | None:
    """Decode user_id (sub claim) from Bearer JWT. No verification — logging only."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        parts = auth[7:].split(".")
        if len(parts) != 3:
            return None
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=="))
        return str(payload.get("sub", "")) or None
    except Exception:
        return None


async def _forward_api_event(
    method: str,
    route_pattern: str,
    status_code: int,
    elapsed_ms: float,
    request_id: str,
    base_url: str,
    server_token: str,
    environment: str,
    user_id: str | None,
) -> None:
    """Fire-and-forget: POST one server_api event to TelemetryServer. Never raises."""
    success = status_code < 400
    metadata: dict = {}
    if user_id:
        metadata["user_id"] = user_id
    event = {
        "event_id": request_id,
        "schema_version": 1,
        "source": "server_api",
        "event_name": "api_request",
        "route_pattern": route_pattern,
        "method": method,
        "status_code": status_code,
        "success": success,
        "duration_ms": int(elapsed_ms),
        "error_category": None if success else _ERROR_CATEGORY_MAP.get(status_code, "unknown"),
        "environment": environment,
        "priority": "HIGH" if not success else "LOW",
        "request_id": request_id,
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{base_url}/telemetry/events",
                json={"events": [event]},
                headers={"X-Telemetry-Server-Token": server_token},
            )
    except Exception:
        pass  # Never block or surface errors from telemetry forwarding

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

        # ── TelemetryServer forwarding ────────────────────────────────────────
        if (
            settings.TELEMETRY_ENABLED
            and settings.TELEMETRY_INGEST_SERVER_TOKEN
            and settings.TELEMETRY_SERVER_BASE_URL
            and request.url.path not in _TELEMETRY_SKIP_PATHS
            and not request.url.path.startswith("/telemetry")
        ):
            # Reconstruct route template from matched path params
            # e.g. /assets/abc123 → /assets/{asset_ref}
            path_params: dict = request.scope.get("path_params", {})
            route_pattern = request.url.path
            for key, val in path_params.items():
                route_pattern = route_pattern.replace(str(val), f"{{{key}}}")

            asyncio.create_task(
                _forward_api_event(
                    method=request.method,
                    route_pattern=route_pattern,
                    status_code=response.status_code,
                    elapsed_ms=elapsed_ms,
                    request_id=request_id,
                    base_url=settings.TELEMETRY_SERVER_BASE_URL,
                    server_token=settings.TELEMETRY_INGEST_SERVER_TOKEN,
                    environment=settings.TELEMETRY_ENV,
                    user_id=_extract_user_id(request),
                )
            )
        # ─────────────────────────────────────────────────────────────────────

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
