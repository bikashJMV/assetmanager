from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

from fastapi import Header, HTTPException, status

from core.settings import settings

logger = logging.getLogger("telemetry.auth")


def require_server_or_browser_ingest_token(
    x_telemetry_server_token: str | None = Header(default=None),
    x_telemetry_ingest_token: str | None = Header(default=None),
) -> dict[str, Any]:
    logger.debug("ingest.auth.begin")
    if x_telemetry_server_token and settings.INGEST_SERVER_TOKEN:
        if hmac.compare_digest(x_telemetry_server_token, settings.INGEST_SERVER_TOKEN):
            logger.debug("ingest.auth.server.ok")
            return {"kind": "server", "credential_key": "server"}
    if x_telemetry_ingest_token and settings.INGEST_TOKEN_SECRET:
        payload = _verify_signed_ingest_token(x_telemetry_ingest_token)
        logger.debug("ingest.auth.browser.ok sub=%s", str(payload.get("sub", "browser")))
        return {"kind": "browser", "claims": payload, "credential_key": str(payload.get("sub", "browser"))}
    logger.warning("ingest.auth.failed")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest credentials")


def require_itops_query_key(x_telemetry_query_key: str | None = Header(default=None)) -> None:
    if settings.ITOPS_QUERY_KEY and x_telemetry_query_key and hmac.compare_digest(x_telemetry_query_key, settings.ITOPS_QUERY_KEY):
        logger.debug("query.auth.ok")
        return
    logger.warning("query.auth.failed")
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid query credentials")


def _verify_signed_ingest_token(token: str) -> dict[str, Any]:
    try:
        b64_payload, sig = token.split(".", 1)
        payload_bytes = base64.urlsafe_b64decode(b64_payload + "===")
        payload = json.loads(payload_bytes.decode("utf-8"))
        expected = hmac.new(
            settings.INGEST_TOKEN_SECRET.encode("utf-8"),
            b64_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("signature mismatch")
        aud = str(payload.get("aud", "")).strip()
        if aud != "telemetry_ingest":
            raise ValueError("invalid audience")
        exp = int(payload.get("exp", 0))
        if exp < int(time.time()):
            raise ValueError("token expired")
        env = str(payload.get("environment", "")).strip()
        if env and env != settings.ENV:
            raise ValueError("environment mismatch")
        if not isinstance(payload.get("allowed_sources", []), list):
            raise ValueError("allowed_sources missing")
        return payload
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid ingest token: {exc}") from exc
