import datetime
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel

from core.settings import settings
from core.authz import require_it_ops

router = APIRouter(prefix="/observability/logs", tags=["Observability"])

class LogEntry(BaseModel):
    ts: str
    ts_ns: str
    level: str
    service: str
    message: str

class LogsResponse(BaseModel):
    logs: list[LogEntry]
    next_cursor: Optional[str] = None

@router.get("", response_model=LogsResponse)
async def get_logs(
    limit: int = Query(200, ge=1, le=1000),
    start: Optional[int] = Query(None, description="Nanoseconds"),
    end: Optional[int] = Query(None, description="Nanoseconds"),
    service: str = Query("all", description="'ams-server', 'telemetry-server', or 'all'"),
    level: str = Query("", description="error, warn, info, debug"),
    cursor: str = Query("", description="For forward pagination"),
    _=Depends(require_it_ops)
):
    """
    Purpose: Query Loki and return recent logs for IT Ops troubleshooting.
    Method/Route: GET /observability/logs
    Request: Query `limit`, `start`, `end`, `service`(ams-server|telemetry-server|all), `level`, `cursor`.
    Response: 200 `LogsResponse`; Errors: 503 on Loki connectivity issues, 500 on unexpected failures.
    Notes: IT Ops only (`require_it_ops_access`); `cursor` is a nanosecond timestamp for pagination.
    """
    # Default to last 1 hour if no time bounds are provided
    if not cursor and not start:
        start = int((time.time() - 3600) * 1_000_000_000)
    
    # If cursor is provided, use it as the new start time
    if cursor:
        try:
            # Add 1ns to avoid fetching the exact same log line again
            start = int(cursor) + 1
        except ValueError:
            pass

    if not end:
        end = int(time.time() * 1_000_000_000)

    # Map frontend levels to Loki labels extracted by Alloy
    # Note: Alloy regex captures uppercase, so we match uppercase labels
    LEVEL_MAP = {
        "error": "ERROR",
        "warn": "WARNING",
        "info": "INFO",
        "debug": "DEBUG"
    }
    
    level_selector = ""
    if level:
        loki_level = LEVEL_MAP.get(level.lower())
        if loki_level:
            level_selector = f', level=~"(?i){loki_level}"'

    # Build LogQL query using label selectors (faster than line filtering)
    if service == "ams-server":
        logql = f'{{service="ams-server"{level_selector}}}'
    elif service == "telemetry-server":
        logql = f'{{service="telemetry-server"{level_selector}}}'
    else:
        logql = f'{{service=~"ams-server|telemetry-server"{level_selector}}}'

    direction = "backward"

    loki_url = f"{settings.LOKI_BASE_URL}/loki/api/v1/query_range"
    params = {
        "query": logql,
        "limit": limit,
        "start": start,
        "end": end,
        "direction": direction
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(loki_url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error querying Loki: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error communicating with log backend"
        )
    
    results = data.get("data", {}).get("result", [])
    
    flat_logs = []
    
    for stream in results:
        stream_labels = stream.get("stream", {})
        svc = stream_labels.get("service", "unknown")
        
        for val in stream.get("values", []):
            if len(val) != 2:
                continue
            ts_ns = val[0]
            log_line = val[1]
            
            # Detect log level by scanning keywords
            line_upper = log_line.upper()
            detected_level = "INFO"
            if "ERROR" in line_upper:
                detected_level = "ERROR"
            elif "WARN" in line_upper or "WARNING" in line_upper:
                detected_level = "WARN"
            elif "DEBUG" in line_upper:
                detected_level = "DEBUG"
                
            # Convert nanoseconds to ISO 8601 string
            try:
                ts_sec = int(ts_ns) / 1_000_000_000
                dt = datetime.datetime.fromtimestamp(ts_sec, tz=datetime.timezone.utc)
                iso_str = dt.isoformat()
            except ValueError:
                iso_str = ""
            
            flat_logs.append(LogEntry(
                ts=iso_str,
                ts_ns=str(ts_ns),
                level=detected_level,
                service=svc,
                message=log_line.strip()
            ))
            
    # Show newest logs first (Loki 'backward' direction already returns newest-first,
    # but we still sort to merge multiple streams deterministically).
    flat_logs.sort(key=lambda x: int(x.ts_ns), reverse=True)

    # Next cursor is the timestamp of the newest log line (for forward pagination)
    next_cursor = None
    if flat_logs:
        next_cursor = flat_logs[0].ts_ns

    return LogsResponse(
        logs=flat_logs,
        next_cursor=next_cursor
    )
