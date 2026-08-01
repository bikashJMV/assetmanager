# Architecture map

## Client (`Client/`) — React 19 + Vite 7 + TS + Tailwind 3.4

- Routing: `src/App.tsx` — all pages `React.lazy`; guards `RequireAuth` / `RequirePrivileged`
  (admin|it_ops) / `RequireItOps` around route groups.
- **Two data layers exist (migration in progress):**
  - LEGACY: `src/api.ts` (~1200 lines, monolith) — do not extend.
  - CURRENT: `src/api/apiClient.ts` → `src/services/*` → `src/queries/*` (TanStack Query 5,
    `assetQueryKeys`-style key factories). All new data code goes here.
- Transport: single axios instance in `src/utils/authNexus.api.ts` — Bearer injection, proactive +
  reactive (401) token refresh with mutex queue, envelope unwrap (`unwrapEnvelope`), error
  normalization (`toErrorMessage`, `getErrorStatusCode`). Blob/PDF downloads bypass the envelope.
- State: no Redux/Zustand. Server state = TanStack Query; UI state = local; breadcrumbs via
  `useSyncExternalStore` store (`useBreadcrumbOverride`).
- Styling: semantic CSS custom-property tokens (`styles/theme.css` colors, `styles/global.css`
  density/font/component classes) + Tailwind utilities. Theme/density/font switched via
  `[data-theme]`/`[data-density]`/`[data-font]` attributes (`utils/theme.ts`), persisted in
  localStorage, cross-tab synced. NEVER hardcode light/dark colors.
- Toasts: in-house `ToastProvider` + `useToast` — variants success|error|warning|info;
  error/warning persistent (`duration: 0`), success/info auto-dismiss 4200ms.
- Virtualization: `@tanstack/react-virtual` (currently only `LogViewer`).
- Build: Vite `manualChunks` splits react/qr/xlsx/vendor/otel; OTel web SDK traces fetch/XHR.

## Server (`Server/`) — FastAPI + asyncpg (raw SQL, NO ORM)

- Layering: `routers/` (HTTP, thin) → `services/` (business logic) → `repositories/` (raw SQL,
  read/write split) → Postgres. Schemas in `schemas/` (Pydantic v2).
- Middleware order (outermost first): CORS → Envelope → Auth → RequestId.
- `core/postgres.py`: single asyncpg pool (defaults min 1 / max 10 — see roadmap, too small for
  500 users). JSON/UUID/Decimal coercion helpers in `repositories/db.py`.
- Workhorse read model: view `v_asset_inventory` (6-table join) — powers list/detail/export/stats.
- No migration tooling — schema from `DB/init.sql` dump at container init. Adopt Alembic before
  schema changes.
- Envelope helpers: `core/api_response.py` (`success_response` / `error_response`).

## Known duplications (do not add to; remove as touched)

- Assign/return endpoints exist in BOTH `routers/api_v1_assets.py` and `api_v1_assignments.py`.
- Legacy auth stack `core/auth.py` duplicates active `core/authnexus.py` + `core/auth_middleware.py`.
- Client: `getAsset`/`getAssetDetail`/`scanAsset`/`softDeleteAsset` in both `api.ts` and
  `assetService.ts`; two auth-callback components (only `AuthCallback.tsx` is routed);
  `User.Signin.tsx` unused by router; two pagination components.

## Deploy

docker compose single stack: postgres, server (uvicorn, currently single worker), client
(nginx serves SPA + proxies `/api/` → server:8000 and `/nexus-proxy/` → auth.rokkalabs.com),
pgadmin, Loki/Tempo/Prometheus/Grafana/Alloy. TLS terminated outside compose.
