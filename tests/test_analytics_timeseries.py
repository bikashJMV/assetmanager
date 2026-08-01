"""Live — analytics time-series endpoint.

Regression: fetch_dicts ISO-stringifies date columns, which made the server raise
`'str' object has no attribute 'year'` (500) during month/year aggregation. The endpoint
must return 200 with the six aggregate blocks and real month/year integers.
"""
from __future__ import annotations

import httpx

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]

_TS = "/api/v1/meta/analytics-timeseries"


def test_analytics_timeseries_ok(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    r = api.get(_TS, headers=bearer(token))
    assert r.status_code == 200, r.text[:300]

    data = r.json()["data"]
    for key in (
        "cumulativeByMonth",
        "acquisitionMatrix",
        "acquisitionByYear",
        "categoryDistribution",
        "warrantyPoints",
        "assignmentsByMonth",
        "generatedAt",
    ):
        assert key in data

    # year aggregation must yield integer years (proves dates stayed native, not str)
    for cell in data["acquisitionByYear"]:
        assert isinstance(cell["year"], int)


def test_analytics_timeseries_requires_auth(api: httpx.Client) -> None:
    assert api.get(_TS).status_code == 401
