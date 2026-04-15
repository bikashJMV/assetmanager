from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.auth import require_itops_query_key
from core.settings import settings
from models.schemas import OverviewEventsBulkDeleteRequest, OverviewEventsBulkDeleteResponse
from services.metrics import metrics
from services.storage import storage

router = APIRouter()
_queue = None
logger = logging.getLogger("telemetry.query")


def set_queue(queue) -> None:
    global _queue
    _queue = queue
    logger.info("query.queue.set")


def _window_hours(window: str) -> int:
    m = {"15m": 1, "1h": 1, "24h": 24, "7d": 168}
    return m.get(window, 1)


@router.get("/overview", dependencies=[Depends(require_itops_query_key)])
async def overview(window: str = Query(default="1h"), environment: str | None = Query(default=None)):
    logger.info("query.overview window=%s env=%s", window, environment)
    data = await storage.overview(window_hours=_window_hours(window), env=environment)
    await storage.audit_access("/overview", environment, window, 1)
    return data


@router.get("/overview/events", dependencies=[Depends(require_itops_query_key)])
async def overview_events(
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
):
    logger.info("query.events limit=%s offset=%s", limit, offset)
    events = await storage.get_events(limit=limit, offset=offset)
    await storage.audit_access("/overview/events", None, "n/a", len(events))
    return {"events": events}


@router.delete(
    "/overview/events",
    response_model=OverviewEventsBulkDeleteResponse,
    dependencies=[Depends(require_itops_query_key)],
)
async def overview_events_delete(payload: OverviewEventsBulkDeleteRequest):
    logger.info("query.events.delete targets=%s", len(payload.targets))
    pairs = [(t.table_source, t.id) for t in payload.targets]
    try:
        deleted = await storage.delete_event_rows(pairs)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await storage.audit_access("/overview/events", None, "delete", deleted)
    return OverviewEventsBulkDeleteResponse(deleted=deleted)


@router.get("/alerts", dependencies=[Depends(require_itops_query_key)])
async def alerts():
    logger.info("query.alerts")
    await storage.audit_access("/alerts", None, "n/a", 0)
    return {"active_alerts": []}


@router.get("/health")
async def health():
    snap = metrics.snapshot()
    db_ok = await storage.db_health()
    queue_state = _queue.snapshot() if _queue is not None else {"high": 0, "medium": 0, "low": 0, "total": 0}
    logger.debug("query.health ok=%s queue_total=%s", db_ok, queue_state.get("total"))
    return {"ok": db_ok, "env": settings.ENV, "metrics": snap, "queue": queue_state}


@router.get("/metrics")
async def internal_metrics():
    return metrics.snapshot()


@router.post("/retention/run", dependencies=[Depends(require_itops_query_key)])
async def run_retention():
    logger.info("query.retention.run")
    deleted = await storage.cleanup_retention()
    await storage.audit_access("/retention/run", None, "n/a", sum(deleted.values()))
    return {"ok": True, "deleted": deleted}
