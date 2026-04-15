from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Source = Literal["server_api", "client_data", "client_engagement", "telemetry_internal"]
Priority = Literal["HIGH", "MEDIUM", "LOW"]
ErrorCategory = Literal[
    "validation",
    "auth",
    "forbidden",
    "not_found",
    "dependency",
    "timeout",
    "rate_limit",
    "server_error",
    "unknown",
]


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=8, max_length=128)
    schema_version: int = Field(default=1, ge=1, le=10)
    source: Source
    event_name: str = Field(min_length=1, max_length=120)
    event_domain: str | None = Field(default=None, max_length=80)
    route_pattern: str | None = Field(default=None, max_length=255)
    method: str | None = Field(default=None, max_length=16)
    status_code: int | None = Field(default=None, ge=100, le=599)
    success: bool | None = None
    duration_ms: int | None = Field(default=None, ge=0, le=600000)
    error_category: ErrorCategory | None = None
    operation_name: str | None = Field(default=None, max_length=120)
    table_or_rpc: str | None = Field(default=None, max_length=120)
    actor_role: str | None = Field(default=None, max_length=32)
    session_id: str | None = Field(default=None, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    trace_id: str | None = Field(default=None, max_length=128)
    environment: Literal["prod", "staging", "dev", "local"]
    priority: Priority = "LOW"
    sample_rate: float = Field(default=1.0, gt=0, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    @model_validator(mode="after")
    def validate_source_requirements(self) -> "TelemetryEvent":
        if self.source in ("server_api", "client_data") and self.success is None:
            raise ValueError("success is required for server_api and client_data")
        return self


class IngestBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[TelemetryEvent] = Field(min_length=1, max_length=100)


class IngestResponse(BaseModel):
    accepted: int
    deduped: int
    dropped: int
    queued: int


EventTableSource = Literal["success", "error", "general"]


class EventDeleteTarget(BaseModel):
    """Identifies one row in the union feed (get_events); numeric id is per physical table."""

    model_config = ConfigDict(extra="forbid")

    table_source: EventTableSource
    id: int = Field(gt=0)


class OverviewEventsBulkDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    targets: list[EventDeleteTarget] = Field(min_length=1, max_length=500)


class OverviewEventsBulkDeleteResponse(BaseModel):
    deleted: int
