from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Optional
from datetime import date, datetime
import uuid


class AssetBase(BaseModel):
    asset_tag: Optional[str] = None
    category_slug: Optional[str] = None
    category_name: Optional[str] = None
    manufacturer_name: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    status: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    assignment_id: Optional[uuid.UUID] = None
    assigned_at: Optional[datetime] = None
    current_employee_id: Optional[uuid.UUID] = None
    current_employee_code: Optional[str] = None
    current_employee_name: Optional[str] = None
    current_employee_email: Optional[str] = None
    current_employee_is_active: Optional[bool] = None
    current_employee_erp_active: Optional[bool] = None
    current_employee_department: Optional[str] = None
    latest_qr_code: Optional[str] = None


class AssetCreate(BaseModel):
    asset_tag: Optional[str] = None
    category_slug: str
    manufacturer_name: Optional[str] = None
    model: Optional[str] = None
    serial_number: str  # Now required
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    status: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    category_slug: Optional[str] = None
    manufacturer_name: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    status: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    custom_fields: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None


class AssetQrLabelsExportRequest(BaseModel):
    asset_tags: list[str] = Field(default_factory=list)


class AssetOut(AssetBase):
    id: uuid.UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
