# AMS Server

FastAPI backend for Asset Manager. Handles asset inventory, employee management, assignments, QR codes, and observability.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.136 + Uvicorn |
| Database | PostgreSQL via asyncpg (connection pool) |
| Auth | AuthNexus (OIDC/Zitadel) — RS256 JWT via JWKS |
| Logging | Python `logging` → file → Grafana Alloy → Loki |
| Metrics | OpenTelemetry → Prometheus |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | asyncpg connection string |
| `AUTH_ENABLED` | ✅ | `true` in production |
| `AUTH_AUTHORITY` | ✅ | AuthNexus base URL (e.g. `https://auth.example.com`) |
| `AUTH_JWKS_URL` | ✅ | JWKS endpoint for JWT verification |
| `AUTH_CLIENT_ID` | ✅ | OIDC client ID (used in token refresh calls) |
| `AUTH_PROJECT_ID` | ✅ | AuthNexus project ID — validated in every JWT |
| `AUTH_ISSUER` | optional | JWT issuer claim (if enforced) |
| `AUTH_AUDIENCE` | optional | JWT audience claim (if enforced) |
| `AUTH_CLOCK_SKEW_SECONDS` | optional | JWT validation leeway, default `30` |
| `LOKI_BASE_URL` | optional | Loki endpoint for telemetry logs, e.g. `http://loki:3100` |
| `ENVIRONMENT` | optional | `production` enables Secure flag on cookies |

---

## Auth Architecture (BFF Pattern)

The server acts as a **Backend-for-Frontend** for token management. The browser's JavaScript cannot read HttpOnly cookies — the server holds and rotates the refresh token on behalf of the client.

```
Browser                     AMS Server              AuthNexus
   |                             |                       |
   |-- POST /api/auth/set-session (refresh_token in body)
   |                             |-- plants nexus_refresh_token
   |                             |   as HttpOnly cookie  |
   |                             |   path=/api/auth/     |
   |                             |                       |
   |-- POST /api/auth/refresh (cookie sent automatically by browser)
   |                             |-- grant_type=refresh_token -->
   |                             |                       |
   |                             |<-- new access_token + rotated refresh_token
   |                             |-- re-plants rotated cookie
   |<-- access_token in JSON body|                       |
   |                             |                       |
   |-- POST /api/auth/logout     |                       |
   |                             |-- revoke at AuthNexus -->
   |                             |-- delete cookie       |
   |<-- { ok: true }             |                       |
```

### Endpoints

#### `POST /api/auth/set-session`
Called once after OIDC login. Receives `{ refresh_token }` in the JSON body and plants it as an HttpOnly cookie. The client cannot set HttpOnly cookies directly — this endpoint exists solely for that purpose.

- Cookie name: `nexus_refresh_token`
- Cookie path: `/api/auth/` (browser only sends it to auth routes)
- Secure: `true` in production, `false` in development

#### `POST /api/auth/refresh`
BFF bridge for token refresh. The browser sends the cookie automatically (credentials: include). The server:
1. Reads `nexus_refresh_token` from the cookie jar
2. POSTs `grant_type=refresh_token` to AuthNexus
3. If AuthNexus returns a rotated refresh token, re-plants it as a new HttpOnly cookie
4. Returns the new `access_token` + `expires_in` in the JSON response body

Returns `401` if the cookie is missing or expired. Returns `502` if AuthNexus is unreachable.

#### `POST /api/auth/logout`
Revokes the refresh token at AuthNexus and deletes the local cookie. Safe to call even if the cookie is already absent.

---

## Auth Middleware

`core/auth_middleware.py` — runs on every request except exempt paths (`/docs`, `/health`, `/api/auth/refresh`, `/api/auth/set-session`).

1. Extracts `Authorization: Bearer <token>` header
2. Validates JWT via JWKS (`core/authnexus.py → verify_bearer_token`)
3. Extracts role from `nexus_projects[project_id].roles[0]` in JWT claims
4. Resolves employee from local DB (`resolve_employee_for_sub`)
   - If DB role differs from JWT role → syncs DB role (Gap B)
   - If employee has no local row → auto-provisions from AuthNexus profile (Gap A)
5. Attaches `EmployeeContext` to `request.state.employee`

### Role Guards

| Guard | Roles allowed | Used by |
|---|---|---|
| `require_authenticated` | employee, admin, it_ops | Most GET endpoints |
| `require_privileged` | admin, it_ops | Write operations, observability logs |
| `require_admin` | admin only | Employee role management |
| `require_it_ops` | it_ops only | (reserved for future it_ops-exclusive routes) |

Valid roles: `employee`, `admin`, `it_ops`. Any other role is rejected with `403` at login.

---

## Running Locally

```bash
cd Server
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn main:app --reload --port 8000
```

Logs are written to stdout. For Loki integration, run the full Docker stack (`docker compose up`).

---

## Troubleshooting

**`nexus_refresh_token` cookie not found on `/api/auth/refresh`**
- `/api/auth/set-session` was not called after login, or the cookie was blocked
- Check that the frontend calls `set-session` in the `addUserLoaded` event handler
- Check browser DevTools → Application → Cookies for `nexus_refresh_token`

**Role `''` is not permitted**
- The JWT carries no project-level role in `nexus_projects[project_id].roles[]`
- Assign the user a role in AuthNexus for this project

**Employee not found in directory after AuthNexus creation**
- Expected: local row is auto-created the first time `GET /api/v1/employees` is called (Gap A)
- If still missing, check server logs for `[list_employees] Could not auto-provision`
