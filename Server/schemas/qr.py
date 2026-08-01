from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Optional
from datetime import datetime
import uuid


class QrBatchCreateInput(BaseModel):
    """Input for creating a new QR batch."""
    model_config = ConfigDict(extra="forbid")
    
    count: int = Field(..., ge=1, le=1000, description="Number of tags to reserve (1-1000)")


class QrReservationOut(BaseModel):
    """Output for a QR tag reservation."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    asset_tag: str
    status: str
    consumed_by_asset_id: Optional[uuid.UUID] = None
    consumed_at: Optional[datetime] = None
    created_at: datetime


class QrBatchOut(BaseModel):
    """Output for a QR batch."""
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    batch_code: str
    idempotency_key: str
    requested_count: int
    start_tag: Optional[str] = None
    end_tag: Optional[str] = None
    status: str
    created_by_employee_id: uuid.UUID
    created_at: datetime
    completed_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class QrBatchDetailOut(QrBatchOut):
    """Output for a QR batch with its reservations."""
    reservations: list[QrReservationOut] = Field(default_factory=list)


class QrBatchListOut(BaseModel):
    """Output for a paginated list of QR batches."""
    model_config = ConfigDict(from_attributes=True)
    
    items: list[QrBatchOut]
    page: int
    limit: int
    count: int
    total: int
