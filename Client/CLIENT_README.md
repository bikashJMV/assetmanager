# AMS Client

React 19 + Vite 7 + TypeScript single-page app for Asset Manager.

## What this app does

- Authenticates users with Supabase Auth
- Reads and writes most runtime data directly against Supabase
- Uses RPC-backed flows for assignment, return, role checks, public scan, notifications, and recycle-bin actions
- Provides optional browser telemetry shipping to `TelemetryServer/`
- Calls the main FastAPI server for the IT Ops analysis page and telemetry ingest-token issuance

## Source-of-truth files

- `src/App.tsx` - route tree, auth bootstrap, shell layout, idle timeout, telemetry startup, breadcrumb provider
- `src/api.ts` - primary client integration layer for Supabase and QR helpers
- `src/telemetry.ts` - optional client telemetry buffer and flush logic
- `src/supabaseClient.ts` - fail-fast Supabase client bootstrap
- `src/utils/errors.ts` - user-facing error message normalization with friendly rewrites
- `src/hooks/useBreadcrumbOverride.ts` - breadcrumb context for detail pages to set readable labels

## Routes

### Public

- `/`
- `/dashboard/home`
- `/guide`
- `/login`
- `/scan/:id`

### Protected

- `/assets`
- `/assets/new`
- `/assets/:id`
- `/assets/scan`
- `/assets/scan/:id`
- `/employee`
- `/employee/new`
- `/employee/:id`
- `/analysis`
- `/notifications`
- `/recycle-bin`

## Main feature areas

- Asset list, detail, create, edit, assign, return, QR view, and soft delete
- Employee list, detail, create, edit, role-aware actions, and employee bulk import
- Asset bulk import from spreadsheet on `/assets/new`
- Bulk inventory status update (assign, return, lifecycle) from Excel on `/assets`
- Public QR scan with a tightly-scoped anonymous payload
- Warranty notifications and recycle-bin restore flows
- IT Ops telemetry analysis UI backed by the FastAPI server

## Environment variables

Only `VITE_*` variables are available in browser code.

Create `Client/.env` (start from `Client/.env.example`).

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | `src/supabaseClient.ts` | Required at module load time |
| `VITE_SUPABASE_ANON_KEY` | Yes | `src/supabaseClient.ts` | Required at module load time |
| `VITE_PUBLIC_APP_ORIGIN` | No | `src/api.ts` | Overrides QR scan origin; otherwise code falls back to `https://web-assetmanager.vercel.app` |
| `VITE_TELEMETRY_ENABLED` | No | `src/telemetry.ts` | Enables browser telemetry when set to `true` |
| `VITE_TELEMETRY_INGEST_URL` | When telemetry enabled | `src/telemetry.ts` | Full `TelemetryServer` ingest URL |
| `VITE_TELEMETRY_TOKEN_URL` | When telemetry enabled | `src/telemetry.ts` | Full main-server `POST /telemetry/ingest-token` URL; code defaults to `/telemetry/ingest-token` |
| `VITE_API_URL` | No | `src/components/pages/Analysis.tsx` | Base URL for the main FastAPI server; defaults there to `http://localhost:8000` |

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

## Implementation notes

- The normal app runtime path is browser -> Supabase, not browser -> FastAPI.
- `src/api.ts` is the right place for new Supabase access patterns.
- The public scan route is a deliberate anonymous exposure contract.
- It now exposes only:
- assigned assets: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`
- unassigned assets: `asset_name`, `status`, `asset_tag`
- Do not expose any additional holder, location, ERP, or custom field data on the anonymous route without an explicit contract change.
- Assignment state transitions belong to DB RPCs, not ad hoc client mutations.
- Generic asset edits must not mutate lifecycle status through `updateAsset()`. In edit mode, `src/components/form/AssetForm.tsx` keeps the status field in the same modal but saves status changes through `setAssetLifecycleStatus()` so history/audit stays correct.
- The analysis page is the main exception to the "direct to Supabase" pattern; it fetches from the FastAPI server using the signed-in user's bearer token.
- `src/utils/errors.ts` rewrites raw DB/RPC error messages into user-friendly guidance (e.g. "Employee is not active" → "This employee is currently inactive. Please verify their status before assigning assets."). Add new patterns there when introducing new RPCs.
- Detail pages (asset, employee) use `useSetBreadcrumbOverride()` to push readable labels into the breadcrumb bar instead of showing raw UUIDs or bare IDs. The store resets automatically on route change.
- All Employees (`/employee`) loads from `v_employee_directory` and defaults the employment-status filter to **Active**. Use **All** or **Inactive** to include employees who are inactive but not in the Recycle Bin. Employees with an open Recycle Bin row are omitted from that view when the database has migration **45** (`recycle_bin_entries` `SELECT` grant + view). `getEmployeeById` uses the same view, so soft-deleted profiles do not resolve on `/employee/:id`.

## QR behavior

- Client-generated QR routes point to `/scan/{assetTag}`.
- If you want to scan a dev QR from another device, set `VITE_PUBLIC_APP_ORIGIN` to a reachable LAN URL, restart Vite, and regenerate the QR.
- Stored QR images may be stale if they were generated against a different origin.

## Related docs

- [`../README.md`](../README.md)
- [`../Server/SERVER_README.md`](../Server/SERVER_README.md)
- [`../TelemetryServer/TELEMETRY_SERVER_README.md`](../TelemetryServer/TELEMETRY_SERVER_README.md)
