"""Pure aggregation for the admin analytics report (six-chart document layout).

Kept DB-free on purpose: the router fetches raw rows, this module shapes them into
the response payload. That keeps the aggregation unit-testable without a database
(mirrors the existing overview-analysis pattern) and, at the app's asset volume,
Python-side bucketing is cheaper than six separate GROUP BY round-trips.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Final, TypedDict

_MONTHS_PER_YEAR: Final[int] = 12
_UNCATEGORIZED: Final[str] = "Uncategorized"


class AssetRow(TypedDict):
    purchase_date: date | None
    warranty_expiry: date | None
    category_name: str | None


class AssignmentRow(TypedDict):
    assigned_at: datetime | None


class MonthPoint(TypedDict):
    month: str
    total: int


class MonthCount(TypedDict):
    month: str
    count: int


class MatrixCell(TypedDict):
    year: int
    month: int
    count: int


class YearCount(TypedDict):
    year: int
    count: int


class LabelCount(TypedDict):
    label: str
    count: int


class WarrantyPoint(TypedDict):
    ageDays: int
    warrantyDays: int


class AnalyticsTimeseries(TypedDict):
    cumulativeByMonth: list[MonthPoint]
    acquisitionMatrix: list[MatrixCell]
    acquisitionByYear: list[YearCount]
    categoryDistribution: list[LabelCount]
    warrantyPoints: list[WarrantyPoint]
    assignmentsByMonth: list[MonthCount]
    generatedAt: str


def _month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def _cumulative_by_month(assets: list[AssetRow]) -> list[MonthPoint]:
    per_month: dict[str, int] = defaultdict(int)
    for row in assets:
        pd = row["purchase_date"]
        if pd is not None:
            per_month[_month_key(pd)] += 1

    running = 0
    out: list[MonthPoint] = []
    for key in sorted(per_month):
        running += per_month[key]
        out.append({"month": key, "total": running})
    return out


def _acquisition_matrix(assets: list[AssetRow]) -> list[MatrixCell]:
    per_cell: dict[tuple[int, int], int] = defaultdict(int)
    for row in assets:
        pd = row["purchase_date"]
        if pd is not None:
            per_cell[(pd.year, pd.month)] += 1

    return [
        {"year": year, "month": month, "count": per_cell[(year, month)]}
        for (year, month) in sorted(per_cell)
    ]


def _acquisition_by_year(assets: list[AssetRow]) -> list[YearCount]:
    per_year: dict[int, int] = defaultdict(int)
    for row in assets:
        pd = row["purchase_date"]
        if pd is not None:
            per_year[pd.year] += 1

    return [{"year": year, "count": per_year[year]} for year in sorted(per_year)]


def _category_distribution(assets: list[AssetRow]) -> list[LabelCount]:
    per_category: dict[str, int] = defaultdict(int)
    for row in assets:
        label = (row["category_name"] or _UNCATEGORIZED).strip() or _UNCATEGORIZED
        per_category[label] += 1

    ordered = sorted(per_category.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"label": label, "count": count} for label, count in ordered]


def _warranty_points(assets: list[AssetRow], today: date) -> list[WarrantyPoint]:
    out: list[WarrantyPoint] = []
    for row in assets:
        pd = row["purchase_date"]
        we = row["warranty_expiry"]
        if pd is None or we is None:
            continue

        warranty_days = (we - pd).days
        if warranty_days < 0:
            continue

        out.append({"ageDays": max((today - pd).days, 0), "warrantyDays": warranty_days})
    return out


def _assignments_by_month(assignments: list[AssignmentRow]) -> list[MonthCount]:
    per_month: dict[str, int] = defaultdict(int)
    for row in assignments:
        at = row["assigned_at"]
        if at is not None:
            per_month[_month_key(at.date())] += 1

    return [{"month": key, "count": per_month[key]} for key in sorted(per_month)]


def build_analytics_timeseries(
    assets: list[AssetRow],
    assignments: list[AssignmentRow],
    now: datetime,
) -> AnalyticsTimeseries:
    """Shape raw asset + assignment rows into the six-chart report payload.

    `now` is injected (never read from the clock here) so the aggregation is
    deterministic and testable. Callers pass a timezone-aware UTC datetime.
    """
    return {
        "cumulativeByMonth": _cumulative_by_month(assets),
        "acquisitionMatrix": _acquisition_matrix(assets),
        "acquisitionByYear": _acquisition_by_year(assets),
        "categoryDistribution": _category_distribution(assets),
        "warrantyPoints": _warranty_points(assets, now.date()),
        "assignmentsByMonth": _assignments_by_month(assignments),
        "generatedAt": now.isoformat(),
    }
