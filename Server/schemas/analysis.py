from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TelemetryEventOut(BaseModel):
    """
    Shape produced by TelemetryServer GET /telemetry/overview/events.

    Note: fields are intentionally optional because the union feed combines
    different event types (success/error/general) where some HTTP-related
    columns are NULL.
    """

    model_config = ConfigDict(extra="allow")

    table_source: str
    id: Optional[int] = None

    source: str
    event_id: str
    event_name: str
    environment: Optional[str] = None
    priority: Optional[str] = None

    event_domain: Optional[str] = None
    route_pattern: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[int] = None
    error_category: Optional[str] = None

    operation_name: Optional[str] = None
    table_or_rpc: Optional[str] = None

    actor_role: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    trace_id: Optional[str] = None

    sample_rate: Optional[float] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    created_at: Optional[datetime] = None


class AnalysisEventsResponse(BaseModel):
    events: list[TelemetryEventOut]

