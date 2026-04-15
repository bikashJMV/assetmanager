# Asset Manager

Asset Manager is a Supabase-centered asset tracking platform for physical and digital assets. It provides end-to-end lifecycle management with role-based access control, event-driven email notifications, and comprehensive telemetry.

The repo currently contains:

- `Client/` - React 19 + Vite 7 + TypeScript SPA
- `Server/` - FastAPI backend for trusted HTTP operations and email notification orchestration
- `TelemetryServer/` - optional FastAPI service for telemetry ingest and query (the Client exposes `/analysis` for IT Ops when telemetry is wired; see [`Client/CLIENT_README.md`](./Client/CLIENT_README.md))
- `Server/db/migrations/v2/` - canonical AMS schema, RLS, views, RPCs, and audit logic
- `TelemetryServer/db/migrations/` - telemetry schema bootstrap
- `Telemetry.plan.md` - telemetry rollout notes
- `Context.md` - working context and safety rules for AI/code changes

## Architecture

- The browser talks directly to Supabase for most runtime reads and writes.
- Business rules live primarily in SQL, RLS, views, and RPC functions under `Server/db/migrations/v2/`.
- `Server/` is a secondary trusted layer that uses the Supabase service-role key. It also acts as an orchestrator proxying event payloads to the Email Notification Microservice.
- The external `Email Notification Microservice` acts as a dedicated dispatch system handling automated CC-enabled receipts.
- `TelemetryServer/` is a modular and isolated service for collecting platform usage metrics.

## Core domain rules

- **Nomenclature**: The platform standardizes labels across the UI and data to **Asset Tag** (identifier), **Category**, and **User** (assignment holder).
- **Roles**: Canonical employee role is `employees.role`: `employee`, `admin`, `it_ops`. `it_ops` holds the highest tier.
- **Flags**: `employees.is_active` and `employees.erp_active` are distinct flags requiring disparate handling.
- **Assignments**: Assignment and return streams are exclusively powered by DB RPCs: `fn_assign_asset` and `fn_return_asset`.
- **Lifecycle**: Post-assignment lifecycle states (`in_stock`, `in_repair`, `retired`, `lost`, `disposed`) are governed by `fn_set_asset_lifecycle_status`.
- **Public Scan**: QR-based scans utilize `fn_public_scan_asset` fetching tightly-scoped anonymous records without leaking internal status logs.
- **Recycle Bin**: Asset Manager delegates deletions to soft-delete mechanisms. The `v_employee_directory` dynamically conceals binned employees. Permanent purge necessitates validation on bin history (`fn_delete_employee_permanent_requires_recycle_bin`).

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
2. Create `Server/.env` ensuring all environment properties including telemetry and email settings are provisioned.
3. Apply AMS migrations in the order listed in [`Server/db/migrations/v2/README.md`](./Server/db/migrations/v2/README.md) (through **`52_*`** for bulk-import audit actors and BFF assign/return identity).
4. Start the client and server.
5. If telemetry flows are requisite, initialize the telemetry schema, bind `.env` configurations, and spin up `TelemetryServer/`.

## Notes

- The Client currently assumes `https://web-assetmanager.vercel.app` natively for QR scaffolding unless overridden by `VITE_PUBLIC_APP_ORIGIN`.
- The FastAPI server must have `FRONTEND_URL` corresponding with the Client host for accurate code deployments.
- Anonymous QR scan limits expose strictly to:
  - assigned assets: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`
  - unassigned assets: `asset_name`, `status`, `asset_tag`
- Treat the PostgreSQL (`Server/db/migrations/v2/`) RPC schema as your single source of truth when architecture assumptions or documents differ.
