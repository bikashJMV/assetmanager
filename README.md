# Asset Manager

Asset Manager is a Supabase-centered asset tracking platform for physical and digital assets.

The repo currently contains:

- `Client/` - React 19 + Vite 7 + TypeScript SPA
- `Server/` - FastAPI backend for trusted HTTP operations
- `TelemetryServer/` - optional FastAPI service for telemetry ingest and query
- `Server/db/migrations/v2/` - canonical AMS schema, RLS, views, RPCs, and audit logic
- `TelemetryServer/db/migrations/` - telemetry schema bootstrap
- `Telemetry.plan.md` - telemetry rollout notes
- `Context.md` - working context and safety rules for AI/code changes

## Architecture

- The browser talks directly to Supabase for most runtime reads and writes.
- Business rules live primarily in SQL, RLS, views, and RPC functions under `Server/db/migrations/v2/`.
- `Server/` is a secondary trusted layer that uses the Supabase service-role key.
- `TelemetryServer/` is optional and isolated from the main app database.

## Core domain rules

- Canonical employee role is `employees.role`: `employee`, `admin`, `it_ops`.
- `it_ops` is the highest role.
- `employees.is_active` and `employees.erp_active` are different flags and must not be treated as the same thing.
- Assignment and return flows belong to DB RPCs: `fn_assign_asset` and `fn_return_asset`.
- Lifecycle status changes (in_stock, in_repair, retired, lost, disposed) belong to `fn_set_asset_lifecycle_status`.
- Public QR scan uses `fn_public_scan_asset` and exposes a tightly-scoped anonymous payload.
- Assets and employees use soft delete and recycle-bin workflows.

## Repository guides

- [`Client/CLIENT_README.md`](./Client/CLIENT_README.md)
- [`Server/SERVER_README.md`](./Server/SERVER_README.md)
- [`Server/db/migrations/v2/README.md`](./Server/db/migrations/v2/README.md)
- [`TelemetryServer/TELEMETRY_SERVER_README.md`](./TelemetryServer/TELEMETRY_SERVER_README.md)
- [`TelemetryServer/db/migrations/README.md`](./TelemetryServer/db/migrations/README.md)
- [`Telemetry.plan.md`](./Telemetry.plan.md)
- [`Notes/Android-Supabase-Auth-Setup.md`](./Notes/Android-Supabase-Auth-Setup.md)

## Local development

### Client

Create `Client/.env` (start from `Client/.env.example`), then run:

```bash
cd Client
npm install
npm run dev
```

### Server

Create `Server/.env` (start from `Server/.env.example`), then run:

```bash
cd Server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### TelemetryServer (optional)

Apply `TelemetryServer/db/migrations/001_telemetry_schema.sql` to a dedicated telemetry database first, then run:

```bash
cd TelemetryServer
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

## Setup order

1. Configure the client Supabase variables in `Client/.env`.
2. Create `Server/.env` with the required backend variables.
3. Apply AMS migrations in `Server/db/migrations/v2/` in order.
4. Start the client and server.
5. If telemetry is enabled, apply the telemetry migration, configure both services, and start `TelemetryServer/`.

## Notes

- The current client code defaults QR links to `https://web-assetmanager.vercel.app` unless `VITE_PUBLIC_APP_ORIGIN` overrides it.
- The FastAPI server must have `FRONTEND_URL` aligned with the frontend origin for server-generated QR codes.
- Anonymous QR scan now exposes only:
- assigned assets: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`
- unassigned assets: `asset_name`, `status`, `asset_tag`
- The public QR page always keeps the sign-in redirect action and "Powered by Asset Manager" footer.
- Treat the migration SQL as the source of truth when docs and assumptions differ.
