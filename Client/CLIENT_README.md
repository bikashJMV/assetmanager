# AMS Client

React 19 + Vite 7 + TypeScript single-page app for Asset Manager.

## What this app does

- Authenticates users with Supabase Auth
- Reads and writes most runtime data directly against Supabase
- Uses RPC-backed flows for assignment, return, role checks, public scan, notifications, and recycle-bin actions
- Optionally exports browser traces to the local Grafana stack via OpenTelemetry (OTLP/HTTP → Alloy → Tempo)
- Calls the main FastAPI server for the IT Ops log viewer (`GET /observability/logs` → Loki)

## Source-of-truth files

- `src/App.tsx` - route tree, auth bootstrap, shell layout, idle timeout, telemetry startup, breadcrumb provider
- `src/api.ts` - primary client integration layer for Supabase and QR helpers
- `src/supabaseClient.ts` - fail-fast Supabase client bootstrap
- `src/utils/errors.ts` - user-facing error message normalization with friendly rewrites
- `src/hooks/useBreadcrumbOverride.ts` - breadcrumb context for detail pages to set readable labels

## Routes

Routes follow [`src/App.tsx`](./src/App.tsx). Unauthenticated users are sent to `/login` (with `next=` return path) for unknown paths.

### Public (no session required)

- `/`
- `/dashboard/home` (same home experience as `/`)
- `/guide`
- `/login`
- `/scan/:id` (public QR scan)

### Protected — any authenticated employee with a linked profile

- `/assets`, `/assets/:id`
- `/assets/scan`, `/assets/scan/:id`
- `/notifications`
- `/404`
- `/employee/:id` (detail; cross-profile access is guarded inside the page)

### Protected — admin or IT Ops only (`RequirePrivileged`)

Other signed-in users are redirected to `/assets`.

- `/assets/new`
- `/employee`, `/employee/new`
- `/analysis` (Overview + Logs tabs; Logs require **IT Ops** role)
- `/recycle-bin`

## Main feature areas

- Enforced nomenclature uniformly highlighting `Asset Tag`, `Category`, and `User`
- Asset list, detail, create, edit, assign, return, QR view, and soft delete
- Employee list, detail, create, edit, role-aware actions, and employee bulk import
- Asset bulk import from spreadsheet on `/assets/new`
- Bulk inventory status update (assign, return, lifecycle) from Excel on `/assets`
- Public QR scan with a tightly-scoped anonymous payload
- Warranty notifications, event-driven emails, and recycle-bin restore flows
- IT Ops observability UI:
  - Overview cards backed by Supabase reads/RPCs
  - Live application logs backed by Loki via the FastAPI server
  - Link-out to Grafana dashboards

## Environment variables

Only `VITE_*` variables are available in browser code.

Create `Client/.env` (start from `Client/.env.example`).

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | `src/supabaseClient.ts` | Required at module load time |
| `VITE_SUPABASE_ANON_KEY` | Yes | `src/supabaseClient.ts` | Required at module load time |
| `VITE_PUBLIC_APP_ORIGIN` | No | `src/api.ts` | Overrides QR scan origin; otherwise code falls back to `https://web-assetmanager.vercel.app` |
| `VITE_API_URL` | No | `src/api.ts`, `src/api/logsApi.ts` | Base URL for the AMS FastAPI server (BFF); defaults to `http://localhost:8000` when unset |
| `VITE_BACKEND_API_KEY` | No | `src/api.ts` | Optional `X-API-Key` for BFF routes that expect `BACKEND_API_KEY` when configured on the server |
| `VITE_OTEL_GRAFANA_ENABLED` | No | `src/otel-telemetry.ts` | Enables OpenTelemetry Web tracing when set to `true` |
| `VITE_OTEL_EXPORTER_ENDPOINT` | No | `src/otel-telemetry.ts` | OTLP/HTTP endpoint (Alloy). Defaults to `http://localhost:4318/v1/traces` |
| `VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS` | No | `src/components/pages/Analysis.tsx` | Link-out URL for the Grafana dashboard button |

## Local development

```bash
cd Client
npm install
npm run dev
```

Available scripts:

| Script | Command |
| --- | --- |
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `lint` | `eslint .` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |

## Dependencies

### Runtime

- `react`
- `react-dom`
- `react-router-dom`
- `@supabase/supabase-js`
- `qrcode`
- `xlsx`

### Dev

- `vite`
- `typescript`
- `tailwindcss`
- `eslint`
- `@vitejs/plugin-react`
- `vitest`

## Implementation notes

- The normal app runtime path is browser -> Supabase, not browser -> FastAPI.
- `src/api.ts` is the right place for new Supabase access patterns.
- The public scan route is a deliberate anonymous exposure contract.
- It now exposes only:
- assigned assets: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`
- unassigned assets: `asset_name`, `status`, `asset_tag`
- Do not expose any additional holder, location, ERP, or custom field data on the anonymous route without an explicit contract change.
- Assignment state transitions prioritize DB RPCs (e.g., `fn_assign_asset`) and bridge through the BFF when invoking external Email Notification logic.
- Generic asset edits must not mutate lifecycle status through `updateAsset()`. In edit mode, `src/components/form/AssetForm.tsx` keeps the status field in the same modal but saves status changes through `setAssetLifecycleStatus()` so history/audit stays correct.
- The Analysis page is the main exception to the "direct to Supabase" pattern: the **Logs** tab fetches from the FastAPI server using the signed-in user's bearer token (`GET /observability/logs`), which in turn queries Loki.
- `src/utils/errors.ts` rewrites raw DB/RPC error messages into user-friendly guidance (e.g. "Employee is not active" → "This employee is currently inactive. Please verify their status before assigning assets."). Add new patterns there when introducing new RPCs.
- Detail pages (asset, employee) use `useSetBreadcrumbOverride()` to push readable labels into the breadcrumb bar instead of showing raw UUIDs or bare IDs. The store resets automatically on route change.
- All Employees (`/employee`) loads from `v_employee_directory` and defaults the employment-status filter to **All** (active and inactive in the directory). Narrow to **Active** or **Inactive** from the filters panel as needed. Employees with an open Recycle Bin row are omitted from that view when the database has migration **45** (`recycle_bin_entries` `SELECT` grant + view). `getEmployeeById` uses the same view, so soft-deleted profiles do not resolve on `/employee/:id`.
- Permanent removal of an employee row is done from the **Recycle Bin** after soft-delete. Migration **46** enforces in `fn_delete_employee_permanent` that an open employee Recycle Bin entry exists before purge (the employee detail page no longer offers a direct permanent delete).
- **Employee lifecycle (product):** Active/Inactive only via **Edit** on All Employees; **soft-delete** sends the row to the bin (off the directory); **restore** and **permanent delete** run only from the Recycle Bin UI (`restoreRecycleBinEntry`, `deleteEmployeePermanently`).

## QR behavior

- Client-generated QR routes point to `/scan/{assetTag}`.
- If you want to scan a dev QR from another device, set `VITE_PUBLIC_APP_ORIGIN` to a reachable LAN URL, restart Vite, and regenerate the QR.
- Stored QR images may be stale if they were generated against a different origin.

## Related docs

- [`../README.md`](../README.md)
- [`../Server/SERVER_README.md`](../Server/SERVER_README.md)
