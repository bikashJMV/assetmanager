from datetime import datetime
from typing import Any, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AssetLogBase(BaseModel):
    asset_id: uuid.UUID
    asset_tag: Optional[str] = None
    note: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssetLogCreate(BaseModel):
    """
    Backward-compatible log create payload.
    Accepts one of: asset_ref, asset_tag, or asset_id.
    """

    asset_ref: Optional[str] = None
    asset_tag: Optional[str] = None
    asset_id: Optional[str] = None
    actor_employee_business_id: Optional[str] = None
    note: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_asset_reference(self):
        if not any([self.asset_ref, self.asset_tag, self.asset_id]):
            raise ValueError("Provide one of asset_ref, asset_tag, or asset_id.")
        return self

    def resolved_asset_ref(self) -> str:
        return (self.asset_ref or self.asset_tag or self.asset_id or "").strip()


class AssetLogOut(AssetLogBase):
    id: uuid.UUID
    actor_employee_id: Optional[uuid.UUID] = None
    actor_employee_business_id: Optional[str] = None
    actor_employee_name: Optional[str] = None
    qr_code: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
