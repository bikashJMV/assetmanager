# AMS Client

React 19 + Vite 7 + TypeScript single-page app for Asset Manager. Dependencies and scripts are defined in `Client/package.json`.

## What this app does

- **Signs in** with **authNexus** (OIDC) using `oidc-client-ts` and `UserManager` in `src/utils/authService.ts` (see also `src/components/pages/AuthCallback.tsx`).
- **Calls the FastAPI BFF** with a bearer access token. Axios is configured in `src/utils/authNexus.api.ts` (base URL from `VITE_API_URL`, default `http://localhost:8000`). Higher-level `apiRequest` lives in `src/api/apiClient.ts`.
- **TanStack React Query** is used for server state in `src/queries/*` (keys and hooks; imports services from `src/services/*` where applicable).
- **IT Ops / Analysis logs** use `src/api/logsApi.ts`, which issues `GET` requests to **`/observability/logs`** on the same API origin (no direct Loki URL in the browser).
- **OpenTelemetry (browser):** `src/otel-telemetry.ts` runs only when `import.meta.env.VITE_OTEL_GRAFANA_ENABLED === 'true'`. Exporter URL defaults to `http://localhost:4318/v1/traces` (see `VITE_OTEL_EXPORTER_ENDPOINT` in `src/vite-env.d.ts`).

## Source-of-truth files

| Area | File(s) |
| --- | --- |
| Routes, auth shell, idle timeout, OTel startup | `src/App.tsx` |
| OIDC UserManager, token storage (access token in `localStorage`, OIDC state in `sessionStorage`) | `src/utils/authService.ts` |
| Axios client, token refresh, `X-API-Key` when configured | `src/utils/authNexus.api.ts` |
| Large legacy/helper API surface, session employee, some QR helpers | `src/api.ts` |
| Typed API + `apiRequest` | `src/api/apiClient.ts`, `src/api/logsApi.ts` |
| REST wrappers for UI | `src/services/assetService.ts`, `assignmentService.ts`, `employeeService.ts`, `metaService.ts`, `authzService.ts` |
| React Query hooks | `src/queries/assets.ts`, `assignments.ts`, `employees.ts`, `meta.ts`, `authz.ts` |
| User-facing error text | `src/utils/errors.ts` |
| Breadcrumb overrides on detail pages | `src/hooks/useBreadcrumbOverride.ts` |
| In-app QR data URLs (prefers `VITE_FRONTEND_URL` then `VITE_PUBLIC_APP_ORIGIN`) | `src/utils/qr.ts` |

## Routes

All routes are defined in `src/App.tsx` inside `<BrowserRouter>`. The `<Routes>` table below matches the file as of this documentation.

### No sidebar (full-screen or callback)

- `/` → `<Navigate to="/dashboard" replace />`
- `/callback` → `AuthCallback`
- `/login` → sign-in screen (inline in `App.tsx`)
- `/scan/:id` → `ScanPage` (public: no `RequireAuth`)

### With top bar and sidebar (when authenticated except where noted)

- `/dashboard` → `Home`
- `/guide` → `Guide`
- `/assets` → `AllAssets`
- `/assets/scan` → `ScanPage` with `protectedRoute` prop
- `/assets/scan/:id` → `ScanPage` with `protectedRoute` prop
- `/assets/:id` → `AssetDetail`
- `/notifications` → `Notifications`
- `/employee/:id` → `EmployeeDetail`

`RequireAuth` (wrapper in `App.tsx`): if no OIDC user or token expired, redirect to `/login?next=…`. If the user is signed in but `getSessionEmployee()` returns no row, `NoEmployeeAccessHandler` is shown (not registered in the directory).

### Privileged (nested under `RequirePrivileged` in `App.tsx`)

`RequirePrivileged` renders children only when `sessionEmployee?.is_active` and `sessionEmployee.role !== 'employee'`. Other users are redirected to `/assets`.

- `/assets/new` → `NewAsset`
- `/employee` → `Employee`
- `/employee/new` → `NewEmployee`
- `/analysis` → `Analysis`
- `/recycle-bin` → `RecycleBin`

### Catch-all

- `*` (unknown path) → if `user` is truthy, navigate to `/404`; else to `/login`
- `/404` → `PageNotFound`

## Main feature areas

- Assets: list, create, detail, assign/return, QR, bulk import, history where exposed by the API
- Employees: list, create, detail, bulk import, role management per API
- Public and authenticated scan flows: `ScanPage` + `src/services/assetService.ts` + `src/api.ts`
- Analysis: link out to Grafana when configured; logs tab uses `fetchLokiLogs` → `GET /observability/logs` on the same API host

## Environment variables

Only `VITE_*` keys are exposed to the browser. Create `Client/.env` from `Client/.env.example`. Declared TypeScript types for optional keys are in `src/vite-env.d.ts`.

| Variable | Required for sign-in | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | No | BFF base URL; if unset, `http://localhost:8000` (`authNexus.api.ts`) |
| `VITE_AUTH_AUTHORITY` | Yes | OIDC issuer (authNexus) |
| `VITE_CLIENT_ID` | Yes | OIDC client id |
| `VITE_ORG_ID` | Yes | Organization id (passed through auth config) |
| `VITE_PROJECT_ID` | Yes | Project id; must align with server `AUTH_PROJECT_ID` for JWT checks |
| `VITE_CALLBACK_PATH` | No | Default `/callback` |
| `VITE_LOGOUT_PATH` | No | e.g. `/login` |
| `VITE_BACKEND_API_KEY` | No | Sent as `X-API-Key` if the server enforces `BACKEND_API_KEY` |
| `VITE_FRONTEND_URL` | No | Preferred origin for in-app QR codes (`src/utils/qr.ts`); also referenced in `Client/.env.example` for local dev port |
| `VITE_PUBLIC_APP_ORIGIN` | No | Optional override; used by `src/utils/qr.ts` and by `getScanPageBaseUrl` in `src/api.ts` (that helper only checks this variable) |
| `VITE_OTEL_GRAFANA_ENABLED` | No | Must be the string `true` to start OTel (`otel-telemetry.ts`) |
| `VITE_OTEL_EXPORTER_ENDPOINT` | No | OTLP/HTTP traces endpoint; default `http://localhost:4318/v1/traces` |
| `VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS` | No | Link target on Analysis page |
| `VITE_TELEMETRY_ENABLED`, `VITE_TELEMETRY_INGEST_URL`, `VITE_TELEMETRY_TOKEN_URL` | No | Optional alternate telemetry paths; declared in `vite-env.d.ts` |

`Client/.env.example` includes `LOKI_BASE_URL` for convenience but **the React app does not read it**; Loki is queried only through the server `GET /observability/logs` endpoint.

## Local development

```bash
cd Client
npm install
npm run dev
```

| Script | Command |
| --- | --- |
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `lint` | `eslint .` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |

## Dependencies (from `package.json`)

**Runtime (selection):** `react`, `react-dom`, `react-router-dom`, `oidc-client-ts`, `axios`, `@tanstack/react-query`, `@tanstack/react-virtual`, `qrcode`, `@e965/xlsx`, OpenTelemetry web packages.

**Dev (selection):** `vite`, `typescript`, `tailwindcss`, `eslint`, `@vitejs/plugin-react`, `vitest`, …

## Implementation notes

- **Primary data path:** browser → FastAPI → Postgres (no direct DB from the client).
- Prefer **`src/services/*` + `src/queries/*`** for new features so auth and types stay consistent.
- **`/api/v1/employees/me`** (via `getSessionEmployee` in `api.ts`) gates the app: unprovisioned users see the restricted access screen in `App.tsx`.
- **QR base URL** logic differs slightly between `src/utils/qr.ts` and `src/api.ts`; prefer `utils/qr.ts` for new code or consolidate later.

## Related docs

- [`../README.md`](../README.md)
- [`../Server/SERVER_README.md`](../Server/SERVER_README.md)
