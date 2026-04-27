from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final

_ASSET_DATE_KEYS: Final[tuple[str, ...]] = ("purchase_date", "warranty_expiry")


class AssetDateCoercionError(ValueError):
    """Invalid value for an asset DATE column before asyncpg bind."""


def coerce_optional_date(value: Any, *, field_name: str = "date") -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return date.fromisoformat(s[:10])
        except ValueError as exc:
            raise AssetDateCoercionError(f"Invalid {field_name}: {value!r}") from exc
    raise AssetDateCoercionError(
        f"Invalid {field_name}: expected date, datetime, str, or null; got {type(value).__name__}"
    )


def normalize_asset_date_fields_inplace(payload: dict[str, Any]) -> None:
    """Ensure DATE-bound keys are ``datetime.date`` or ``None`` for asyncpg."""
    for key in _ASSET_DATE_KEYS:
        if key not in payload:
            continue
        payload[key] = coerce_optional_date(payload[key], field_name=key)
