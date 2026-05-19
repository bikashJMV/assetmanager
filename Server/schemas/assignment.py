from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class AssignAssetRequest(BaseModel):
    asset_tag: str = Field(..., min_length=1)
    employee_id: str = Field(..., min_length=1)
    assigned_at: Optional[datetime] = None
    notes: Optional[str] = None
    source: str = "runtime"
    force_dept_move: bool = False


class AssignValidateRequest(BaseModel):
    asset_tag: str = Field(..., min_length=1)
    employee_id: str = Field(..., min_length=1)


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
    id: Optional[str] = None
    employee_id: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    
    # Department Validation Fields
    dept_mismatch: bool = False
    asset_dept_id: Optional[str] = None
    asset_dept_name: Optional[str] = None
    employee_dept_id: Optional[str] = None
    employee_dept_name: Optional[str] = None
