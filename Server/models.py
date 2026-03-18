from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import uuid

class Asset(BaseModel):
    id: Optional[uuid.UUID] = None
    asset_id: str
    asset_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    processor: Optional[str] = None
    ram: Optional[str] = None
    storage: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    assigned_to: Optional[str] = None
    employee_email: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    condition: Optional[str] = None
    last_updated: Optional[date] = None
    notes: Optional[str] = None

class AssetLogCreate(BaseModel):
    asset_id: str
    note: Optional[str] = None

class AssetLog(BaseModel):
    id: uuid.UUID
    asset_id: str
    note: Optional[str] = None
    qr_code: Optional[str] = None
    created_at: Optional[datetime] = None
