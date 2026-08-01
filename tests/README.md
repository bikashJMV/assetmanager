# /tests — live auth + e2e tests (root-level, separate from Server/tests unit suite)

Exercises the real auth path from `Notes/auth.implementation.md`:
authNexus credential login → BFF `/api/auth/set-session` (HttpOnly cookie) →
BFF `/api/auth/refresh` (access token + cookie rotation) → Bearer API calls + RBAC matrix.

## Prerequisites

1. Postgres container running (`docker compose up postgres`).
2. AMS server running locally: `cd Server && python -m uvicorn main:app --port 11100`
   (or set `AMS_TEST_SERVER` to wherever it runs).
3. Network access to `auth.rokkalabs.com`.
4. Credentials — read automatically from `Server/.env` (`AUTHNEXUS_ADMIN_USER`,
   `AUTHNEXUS_ADMIN_PASSWORD`). Employee account overrides via env:
   `AMS_EMPLOYEE_USER` (default `EMP-001`), `AMS_EMPLOYEE_PASSWORD` (default = admin password).
   No credentials are hardcoded in test files.

Tests skip cleanly when the server or authNexus is unreachable, or creds are missing.

## Run

```bash
pytest tests/ -v
```

## Files

| File | Covers |
| --- | --- |
| `conftest.py` | env loading, session fixtures (`admin_session`, `employee_session`), BFF login helper |
| `test_authnexus_login.py` | step-1 credential login (valid admin/employee, wrong password rejected) |
| `test_bff_session.py` | set-session cookie, refresh, rotation chain, no-cookie 401, cookie flags |
| `test_endpoint_authz.py` | public endpoints, missing/garbage token 401s, RBAC matrix (admin vs employee) |

## Known findings encoded as failing/xfail tests (2026-07-18)

1. **Refresh-token leak (SECURITY) — FIXED 2026-07-18.** `Server/routers/api_auth.py` now always
   pops `refresh_token` from the JSON body; the rotated token travels only via the HttpOnly cookie.
   `test_refresh_body_must_not_leak_refresh_token` passes and guards the regression.
2. **Cookie flags — FIXED 2026-07-18.** `_set_refresh_cookie` in `Server/routers/api_auth.py` now
   sets `HttpOnly` + `SameSite=lax` + `Max-Age` (7d) + `Secure` (outside local dev, keyed off
   `settings.ENV`). Guarded by `test_refresh_cookie_flags_secure_and_max_age`.
3. **Audience gap — FIXED 2026-07-18.** `verify_bearer_token` (`Server/core/authnexus.py`) now
   accepts BOTH the web client_id and `default_client` (headless) audiences (guide gotcha #1).
   The full RBAC matrix runs for real (no xfail).

## Callback gating (added 2026-07-18)

`Client/src/components/pages/AuthCallback.tsx` no longer redirects to the dashboard on OIDC success
alone. It calls `getSessionEmployee` first — the backend must verify the token AND map it to a
provisioned, active employee. If not, it signs the user out and redirects to
`/login?error=not_authorized`.

## Note on authNexus rate-limiting

authNexus returns 429 on bursts of `/api/login`. `conftest.authnexus_login` backs off (20s, 40s)
and retries, so a full-suite run (several logins) doesn't flake. A full run takes ~90s.
