"""Unit tests for asset DATE coercion before asyncpg (no DB)."""

from datetime import date, datetime

import pytest

from core.asset_db_types import (
    AssetDateCoercionError,
    coerce_optional_date,
    normalize_asset_date_fields_inplace,
)


def test_coerce_none_and_empty_string():
    assert coerce_optional_date(None) is None
    assert coerce_optional_date("") is None


def test_coerce_date_unchanged():
    d = date(2011, 11, 5)
    assert coerce_optional_date(d) is d


def test_coerce_datetime_to_date():
    dt = datetime(2011, 11, 5, 14, 30, 0)
    assert coerce_optional_date(dt) == date(2011, 11, 5)


def test_coerce_iso_date_string():
    assert coerce_optional_date("2011-11-05") == date(2011, 11, 5)


def test_coerce_iso_datetime_string_takes_calendar_part():
    assert coerce_optional_date("2011-11-05T14:30:00") == date(2011, 11, 5)


def test_coerce_whitespace_string():
    assert coerce_optional_date("  2011-11-05  ") == date(2011, 11, 5)


def test_coerce_invalid_string_raises():
    with pytest.raises(AssetDateCoercionError, match="purchase_date"):
        coerce_optional_date("not-a-date", field_name="purchase_date")


def test_coerce_bad_type_raises():
    with pytest.raises(AssetDateCoercionError):
        coerce_optional_date(12345)


def test_normalize_inplace_string_and_preserve_missing_keys():
    payload = {"purchase_date": "2000-01-22", "serial_number": "X"}
    normalize_asset_date_fields_inplace(payload)
    assert payload["purchase_date"] == date(2000, 1, 22)
    assert payload["serial_number"] == "X"
    assert "warranty_expiry" not in payload


def test_normalize_inplace_datetime_object():
    payload = {"warranty_expiry": datetime(2025, 1, 1, 12, 0, 0)}
    normalize_asset_date_fields_inplace(payload)
    assert payload["warranty_expiry"] == date(2025, 1, 1)


def test_normalize_both_keys():
    payload = {"purchase_date": "2011-11-05", "warranty_expiry": None}
    normalize_asset_date_fields_inplace(payload)
    assert payload["purchase_date"] == date(2011, 11, 5)
    assert payload["warranty_expiry"] is None
