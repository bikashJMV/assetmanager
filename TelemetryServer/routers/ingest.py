from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from core.auth import require_server_or_browser_ingest_token
from core.ratelimit import InMemoryRateLimiter
from core.redaction import sanitize_metadata
from core.settings import settings
from models.schemas import IngestBatchRequest, IngestResponse, TelemetryEvent
from services.metrics import metrics
from services.storage import storage

router = APIRouter()
_queue = None
_rate_limiter = InMemoryRateLimiter(settings.RATE_LIMIT_PER_MINUTE, settings.RATE_LIMIT_BURST)
logger = logging.getLogger("telemetry.ingest")


def set_queue(queue) -> None:
    global _queue
    _queue = queue
    logger.info("ingest.queue.set")


def _bucket_hash(value: str) -> float:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]
    return int(digest, 16) / 0xFFFFFFFF


def _should_sample(event: TelemetryEvent) -> bool:
    if event.priority == "HIGH" or event.success is False:
        return True
    if event.source == "server_api" and (event.route_pattern or "") in settings.CRITICAL_SERVER_ROUTES:
        return True
    if event.source == "client_data" and (event.table_or_rpc or "") in settings.CRITICAL_CLIENT_OPERATIONS:
        return True
    if event.source == "server_api":
        threshold = settings.SAMPLE_SERVER_SUCCESS
    elif event.source == "client_data":
        threshold = settings.SAMPLE_CLIENT_DATA_SUCCESS
    else:
        threshold = settings.SAMPLE_CLIENT_ENGAGEMENT
    key = f"{event.session_id or ''}:{event.event_name}:{event.event_id}"
    return _bucket_hash(key) <= threshold


def _enforce_limits(raw: dict) -> None:
    encoded = json.dumps(raw, ensure_ascii=True)
    if len(encoded.encode("utf-8")) > settings.EVENT_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Event payload too large")


def _enforce_claims(event: TelemetryEvent, auth_ctx: dict[str, Any]) -> None:
    if auth_ctx.get("kind") != "browser":
        return
    claims = auth_ctx.get("claims", {})
    allowed_sources = claims.get("allowed_sources", [])
    if event.source not in allowed_sources:
        logger.warning("ingest.claims.source_forbidden source=%s", event.source)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Source not allowed by ingest token")
    token_env = str(claims.get("environment", "")).strip()
    if token_env and event.environment != token_env:
        logger.warning("ingest.claims.env_mismatch token_env=%s event_env=%s", token_env, event.environment)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Environment mismatch for ingest token")


def _enforce_rate_limit(auth_ctx: dict[str, Any], source: str) -> None:
    key = f"{auth_ctx.get('credential_key', 'unknown')}:{source}"
    if not _rate_limiter.allow(key):
        metrics.incr("rate_limit_reject")
        logger.warning("ingest.rate_limited key=%s", key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": "5"},
        )


@router.post("/events", response_model=IngestResponse)
async def ingest_events(payload: IngestBatchRequest, auth_ctx: dict[str, Any] = Depends(require_server_or_browser_ingest_token)):
    if _queue is None:
        raise HTTPException(status_code=503, detail="Queue is not ready")
    logger.info("ingest.request.begin events=%s auth_kind=%s", len(payload.events), auth_ctx.get("kind"))
    if len(payload.events) > settings.EVENT_MAX_BATCH:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Batch too large")
    batch_bytes = len(payload.model_dump_json().encode("utf-8"))
    if batch_bytes > settings.INGEST_MAX_BATCH_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Batch payload too large")

    accepted = 0
    deduped = 0
    dropped = 0
    queued = 0

    for event in payload.events:
        logger.debug("ingest.event.begin event_id=%s source=%s priority=%s", event.event_id, event.source, event.priority)
        _enforce_rate_limit(auth_ctx, event.source)
        _enforce_claims(event, auth_ctx)
        raw = event.model_dump(mode="json")
        _enforce_limits(raw)
        event.metadata = sanitize_metadata(event.metadata)
        if not _should_sample(event):
            dropped += 1
            metrics.incr("sampled_out")
            logger.debug("ingest.event.sampled_out event_id=%s", event.event_id)
            continue
        reserved = await storage.reserve_event_key(event.source, event.event_id)
        if not reserved:
            deduped += 1
            metrics.incr("deduped_pre_queue")
            logger.debug("ingest.event.deduped event_id=%s", event.event_id)
            continue
        ok = await _queue.enqueue(event)
        if not ok:
            dropped += 1
            await storage.release_event_key(event.source, event.event_id)
            await storage.insert_dead_letter(
                stage="queue_overflow",
                reason="queue rejected event",
                payload=json.dumps(raw, ensure_ascii=True),
                source=event.source,
                event_id=event.event_id,
                schema_version=event.schema_version,
            )
            logger.warning("ingest.event.queue_reject event_id=%s", event.event_id)
            continue
        queued += 1
        accepted += 1
        logger.debug("ingest.event.queued event_id=%s", event.event_id)

    logger.info("ingest.request.end accepted=%s deduped=%s dropped=%s queued=%s", accepted, deduped, dropped, queued)
    return IngestResponse(accepted=accepted, deduped=deduped, dropped=dropped, queued=queued)


@router.post("/events/single", response_model=IngestResponse)
async def ingest_single(event: TelemetryEvent, auth_ctx: dict[str, Any] = Depends(require_server_or_browser_ingest_token)):
    event.created_at = event.created_at or datetime.now(timezone.utc)
    return await ingest_events(IngestBatchRequest(events=[event]), auth_ctx=auth_ctx)
