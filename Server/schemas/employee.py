from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Any, Literal
from datetime import datetime
import uuid


class EmployeeBase(BaseModel):
    employee_code: str
    name: str
    email: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    is_active: bool = True
    role: Literal['admin', 'employee'] = 'employee'
    metadata: dict[str, Any] = Field(default_factory=dict)


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee profile."""
    pass


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[Literal['admin', 'employee']] = None
    metadata: Optional[dict[str, Any]] = None


class EmployeeOut(BaseModel):
    id: uuid.UUID
    employee_code: str
    name: str
    email: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    is_active: bool
    role: Literal['admin', 'employee'] = 'employee'
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
