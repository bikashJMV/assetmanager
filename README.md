# Asset Manager

Asset Manager (AMS) is a **Postgres-backed** platform for tracking physical and digital assets. The UI is a **React 19** single-page app (**Vite 7**); **authNexus** (OIDC) handles sign-in; a **FastAPI 0.136** backend serves **`/api/v1/*`** (plus `GET /api/health` and `GET /observability/logs`) with RS256 JWT validation when auth is enabled, role-based access control, and full audit-trail mutations. Optional email notifications POST to an external microservice. A local **Grafana OSS** stack (under `Observability/`) aggregates logs, metrics, and traces.

## Repository layout

| Folder | What it contains |
| --- | --- |
| `Client/` | React + Vite + TypeScript SPA (`Client/package.json`, dev port `5174`) |
| `Server/` | FastAPI app (`Server/main.py`), asyncpg pool, versioned API routers |
| `DB/` | `init.sql` full schema dump + pgAdmin bootstrap files |
| `Observability/` | Loki, Tempo, Prometheus, Grafana, Alloy **configs**; env template — services run via root [`docker-compose.yml`](./docker-compose.yml) |
| `logs/` | Runtime log files tailed by Alloy (`ams_server.log`, `telemetry_server.log`) |
| `Notes/` | Product requirements and authNexus API reference docs |
| `email.service.implementation.readme.md` | Spec for the **external** email notification microservice (not shipped in `Server/`) |

## Architecture

- The **browser calls the FastAPI server** for all application data. Base URL: `VITE_API_URL` (default `http://localhost:8000`). Integration layers: `Client/src/api.ts`, `Client/src/api/apiClient.ts`, `Client/src/utils/authNexus.api.ts`, `Client/src/services/*`, `Client/src/queries/*`.
- **Sign-in** uses OIDC via `oidc-client-ts` (`Client/src/utils/authService.ts`, callback at `Client/src/components/pages/AuthCallback.tsx`). The server validates RS256 access tokens via JWKS when `AUTH_ENABLED=true` (`Server/core/auth_middleware.py`, `Server/core/authnexus.py`). **`POST /api/auth/refresh`** (`Server/routers/api_auth.py`) forwards refresh using the HttpOnly `nexus_refresh_token` cookie so the SPA can obtain new access tokens without silent OIDC renewal.
- **Postgres** is the system of record. The asyncpg pool is created from `DATABASE_URL` or individual `POSTGRES_*` vars (`Server/core/postgres.py`). Business rules live in `Server/repositories/` and `Server/services/`.
- **Database schema:** `DB/init.sql` is a full `pg_dump` of the schema including tables, views, functions, and seed categories. It is the authoritative schema reference.
- **Email notifications:** the AMS server POSTs fire-and-forget events to an external email microservice when `NOTIFICATIONS_ENABLED=true` (`Server/services/notifications/`).
- **Observability:** `RequestIdMiddleware` logs every `request_completed` event with path, status, and elapsed ms. The React client sends OpenTelemetry browser traces when `VITE_OTEL_GRAFANA_ENABLED=true` (`Client/src/otel-telemetry.ts`). Loki is queried server-side at `GET /observability/logs` (IT Ops role only) — the browser never calls Loki directly.

## Core domain rules

- **Roles:** `employee`, `admin`, `it_ops` — enforced in `Server/core/authz.py`. The client treats any role other than `employee` as privileged (`RequirePrivileged` in `Client/src/App.tsx`).
- **Asset status enum:** `in_stock`, `assigned`, `in_repair`, `retired`, `lost`, `disposed` (defined in `DB/init.sql`).
- **Asset tags:** auto-generated as `AST-#####` by `fn_next_asset_tag()` in Postgres when not supplied by the client.
- **Flags:** `employees.is_active` (employment status) and `employees.erp_active` are separate columns with distinct semantics.
- **Soft delete / Recycle Bin:** assets and employees are soft-deleted (`is_deleted = true`) and tracked in `recycle_bin_entries`. The HTTP API for the recycle bin is **`/api/v1/recycle-bin`** — not nested under `/assets`.
- **Public scan:** `/scan/:id` (no auth) and `/assets/scan/:id` (authenticated) both use `Client/src/components/pages/ScanPage.tsx`. The server endpoint is `GET /api/v1/assets/public-scan/{asset_tag}` for anonymous access.

## Repository guides

- [`Client/CLIENT_README.md`](./Client/CLIENT_README.md) — client routes, env vars, component map, dependencies
- [`Server/SERVER_README.md`](./Server/SERVER_README.md) — API endpoints, env vars, local run, middleware stack
- [`Server/services/README.md`](./Server/services/README.md) — service-layer modules
- [`Server/services/notifications/README.md`](./Server/services/notifications/README.md) — email adapter and orchestrator
- [`DB/README.md`](./DB/README.md) — database schema, setup, and seed data
- [`Observability/OBSERVABILITY_TELEMETRY.md`](./Observability/OBSERVABILITY_TELEMETRY.md) — local observability stack setup and telemetry guide
- [`DOCKER_DEPLOYMENT.md`](./DOCKER_DEPLOYMENT.md) — Docker Compose: ports, env, single-file stack
- [`email.service.implementation.readme.md`](./email.service.implementation.readme.md) — external email microservice contract (Supabase audit, templates)
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

## Local development

### 1. Database

Provision a Postgres 15 instance and apply the schema:

```bash
psql -U postgres -c "CREATE DATABASE assetmanager_db;"
psql -U postgres -d assetmanager_db -f DB/init.sql
```

See [`DB/README.md`](./DB/README.md) for full details.

### 2. Server

```bash
cd Server
cp .env.example .env   # fill in POSTGRES_*, AUTH_*, FRONTEND_URL
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`Server/app.py` re-exports `main.app` for older `uvicorn app:app` invocations.

### 3. Client

```bash
cd Client
cp .env.example .env   # fill in VITE_API_URL, VITE_AUTH_AUTHORITY, VITE_CLIENT_ID, etc.
npm install
npm run dev            # starts on http://localhost:5174
```

### 4. Observability (optional)

Configuration lives under `Observability/` (`Observability/.env` from `.env.observability.example`). With **local Docker**, observability services start together with the app from the repo root compose file (see step 5).

Grafana (typical published port `11200`): `http://localhost:11200` · Prometheus: `http://localhost:9090` · Loki: `http://localhost:3100`

### 5. Docker (full stack)

From `assetmanager/`, root `docker-compose.yml` starts **observability, Postgres, FastAPI, nginx client, and pgAdmin** on one network.

```bash
cd assetmanager
cp Observability/.env.observability.example Observability/.env   # Grafana / Alloy vars
# edit .env with POSTGRES_*, VITE_* , AUTH_*, FRONTEND_URL, ALLOWED_ORIGINS, ports
docker compose up --build -d
```

See [`DOCKER_DEPLOYMENT.md`](./DOCKER_DEPLOYMENT.md) for port mapping and rebuild notes.

## Setup order

1. Provision **Postgres** and apply `DB/init.sql`.
2. Configure **Server** `.env` — database connection, `AUTH_ENABLED`, `AUTH_JWKS_URL`, **`AUTH_ISSUER`** and **`AUTH_AUDIENCE`** (must match access-token `iss` / `aud` from authNexus), `AUTH_PROJECT_ID`, **`AUTH_AUTHORITY`** (required for `POST /api/auth/refresh`), `FRONTEND_URL`, `ALLOWED_ORIGINS`.
3. Configure **Client** `.env` — `VITE_API_URL`, authNexus OIDC vars, optional telemetry.
4. Start the server, then the client.
5. Provision at least one employee row with `role = 'it_ops'` or `'admin'` to access privileged routes.

### Sign-in flow (high level)

```mermaid
flowchart TD
  subgraph client["Client — SPA"]
    A([User starts sign-in]) --> B[Redirect to authNexus OIDC]
    B --> C([User authenticates])
    C --> D[Callback with authorization code]
    D --> E[Exchange for access token]
  end
  subgraph backend["Server — FastAPI"]
    F["GET /api/v1/employees/me\nAuthorization: Bearer …"]
    F --> G[JWKS verify JWT when AUTH_ENABLED]
    G --> H[Resolve employee from token / DB]
    H --> I{Provisioned?}
    I -- Yes --> J[Return employee context]
    I -- No --> K([403 — not provisioned])
  end
  E --> F
  J --> L([200 — session profile])
```

## Key environment variables (summary)

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` or `POSTGRES_*` | Server | Postgres connection |
| `AUTH_ENABLED` | Server | Enable JWT validation (default `false`) |
| `AUTH_JWKS_URL` | Server | Required when `AUTH_ENABLED=true` |
| `AUTH_ISSUER` / `AUTH_AUDIENCE` | Server | Optional but recommended when validating JWTs; `AUTH_AUDIENCE` must match the access token `aud` or APIs return 401 (`Audience doesn't match`) |
| `AUTH_AUTHORITY` | Server | authNexus base URL; used by `POST /api/auth/refresh` |
| `AUTH_PROJECT_ID` | Server | JWT project scope check |
| `FRONTEND_URL` | Server | Base URL embedded in QR code PDFs |
| `ALLOWED_ORIGINS` | Server | CORS allowed origins (comma-separated) |
| `NOTIFICATIONS_ENABLED` | Server | Enable email microservice calls |
| `OTEL_GRAFANA_ENABLED` | Server | Expose `/metrics` for Prometheus |
| `LOKI_BASE_URL` | Server | Loki URL for `GET /observability/logs` |
| `VITE_API_URL` | Client | FastAPI server base URL |
| `VITE_AUTH_AUTHORITY` | Client | OIDC issuer URL |
| `VITE_CLIENT_ID` | Client | OIDC client ID |
| `VITE_PROJECT_ID` | Client | Must match server `AUTH_PROJECT_ID` |
| `VITE_OTEL_GRAFANA_ENABLED` | Client | Enable browser OTel traces |

## Database Maintenance & Backups

To back up your data from the Docker container, use the following commands:

### Full Backup (Schema + Data)
```bash
docker exec -t ams-postgres-docker pg_dump -U assetmanager_user -d assetmanager_db > database_dump.sql
```

### Schema Only
```bash
docker exec -t ams-postgres-docker pg_dump -U assetmanager_user -d assetmanager_db -s > schema_only.sql
```

### Restore Backup
```bash
cat database_dump.sql | docker exec -i ams-postgres-docker psql -U assetmanager_user -d assetmanager_db
```

## Notes

### Reverse proxy and hostname

If nginx uses a **`default_server`** that `return 404` for unknown `server_name`, browsing by **raw IP** on port 80 can 404 by design. Use the **configured hostname** (for example `ams.rokkalabs.com`) so the server block that proxies to the client matches.

### JWT 401 after sign-in (`Audience doesn't match`)

The access token’s **`aud`** claim must match server **`AUTH_AUDIENCE`** (and typically **`iss`** matches **`AUTH_ISSUER`** when set). If authNexus issues `aud: default_client` but the API expects a project API audience, align IdP application settings or set `AUTH_AUDIENCE` to the value your tokens actually carry.

### Port reference (common defaults)

| Context | Client UI | API | Grafana (host) |
| --- | --- | --- | --- |
| Local dev | `5174` (Vite) | `8000` | `11200` if compose publishes it |
| Docker (see `.env`) | `11000` | `11100` | `11200` |

- **QR link origin:** `Client/src/utils/qr.ts` builds scan URLs using `FRONTEND_URL` → `VITE_PUBLIC_APP_ORIGIN` → a hardcoded production fallback. `getScanPageBaseUrl` in `Client/src/api.ts` only checks `VITE_PUBLIC_APP_ORIGIN`; keep both env values consistent.
- **CORS:** `Server/main.py` reads `settings.ALLOWED_ORIGINS` and always appends `http://localhost:11000` if not already present. For Vite on `5174`, add `http://localhost:5174` to `ALLOWED_ORIGINS` when testing cross-origin to `localhost:8000`.
- **Request tracing:** every response carries `x-request-id` (set by `RequestIdMiddleware`). Send `X-Request-Id` on requests to correlate with server logs.
- **Prometheus metrics:** exposed at `GET /metrics` only when `OTEL_GRAFANA_ENABLED=true` on the server.
- **`app.py`:** legacy compatibility shim — re-exports `main.app` so `uvicorn app:app` still works.
