from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from core.auth import require_it_ops_access
from core.settings import settings
from schemas.analysis import AnalysisBulkDeleteRequest, AnalysisEventsResponse

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.get("", response_model=AnalysisEventsResponse, dependencies=[Depends(require_it_ops_access)])
async def analysis_events(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    IT Ops dashboard feed for telemetry/log analysis.

    This endpoint is protected by AMS IT Ops role (bearer JWT).
    It then server-to-server calls TelemetryServer using the dedicated
    TELEMETRY_ITOPS_QUERY_KEY_NEW secret header.
    """

    telemetry_key = settings.TELEMETRY_ITOPS_QUERY_KEY_NEW
    if not telemetry_key:
        raise HTTPException(status_code=503, detail="TELEMETRY_ITOPS_QUERY_KEY_NEW is not configured on AMS Server.")

    telemetry_base = settings.TELEMETRY_SERVER_BASE_URL
    if not telemetry_base:
        raise HTTPException(status_code=503, detail="TELEMETRY_SERVER_BASE_URL is not configured on AMS Server.")

    url = f"{telemetry_base}/telemetry/overview/events"
    params = {"limit": limit, "offset": offset}
    headers = {"X-Telemetry-Query-Key": telemetry_key}

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, params=params, headers=headers)
        except httpx.RequestError as exc:
            # Helps diagnose deployed environments where TELEMETRY_SERVER_BASE_URL
            # points to a non-reachable host (e.g. localhost on Vercel).
            raise HTTPException(
                status_code=503,
                detail=f"Unable to reach TelemetryServer at {telemetry_base}. ({exc.__class__.__name__})",
            ) from exc

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"TelemetryServer error: {resp.text}",
        )

    # TelemetryServer returns: { "events": [...] }
    payload = resp.json()
    return payload


@router.delete("/bulk", dependencies=[Depends(require_it_ops_access)])
async def analysis_bulk_delete(body: AnalysisBulkDeleteRequest):
    """Bulk-delete telemetry rows (proxied to TelemetryServer). IT Ops JWT required."""

    telemetry_key = settings.TELEMETRY_ITOPS_QUERY_KEY_NEW
    if not telemetry_key:
        raise HTTPException(status_code=503, detail="TELEMETRY_ITOPS_QUERY_KEY_NEW is not configured on AMS Server.")

    telemetry_base = settings.TELEMETRY_SERVER_BASE_URL
    if not telemetry_base:
        raise HTTPException(status_code=503, detail="TELEMETRY_SERVER_BASE_URL is not configured on AMS Server.")

    url = f"{telemetry_base}/telemetry/overview/events"
    headers = {"X-Telemetry-Query-Key": telemetry_key}
    payload = body.model_dump()

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.request("DELETE", url, json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Unable to reach TelemetryServer at {telemetry_base}. ({exc.__class__.__name__})",
            ) from exc

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"TelemetryServer error: {resp.text}",
        )

    return resp.json()

