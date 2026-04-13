from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Any, Literal
from datetime import datetime
import uuid


class EmployeeBase(BaseModel):
    employee_id: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True
    role: str = 'employee'


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee profile."""
    pass


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None


class EmployeeOut(BaseModel):
    id: uuid.UUID
    employee_id: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    is_active: bool
    role: str = 'employee'
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
