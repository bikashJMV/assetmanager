from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class AssignAssetRequest(BaseModel):
    asset_tag: str = Field(..., min_length=1)
    employee_code: str = Field(..., min_length=1)
    assigned_at: Optional[datetime] = None
    notes: Optional[str] = None
    source: str = "runtime"


class ReturnAssetRequest(BaseModel):
    asset_tag: str = Field(..., min_length=1)
    returned_at: Optional[datetime] = None
    notes: Optional[str] = None
    source: str = "runtime"


class AssignmentRPCResult(BaseModel):
    ok: bool
    assignment_id: Optional[str] = None
    asset_id: Optional[str] = None
    asset_tag: Optional[str] = None
    employee_id: Optional[str] = None
    employee_code: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
