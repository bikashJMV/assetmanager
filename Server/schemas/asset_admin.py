from __future__ import annotations

from pydantic import BaseModel


class SoftDeleteAssetRequest(BaseModel):
    note: str | None = None

