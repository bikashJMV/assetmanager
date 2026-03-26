# [Asset Manager](https://web-assetmanager.vercel.app)

Centralized platform for tracking, managing, and auditing digital and physical assets — with ERP-aware employee profiles, RPC-driven assignment lifecycle, and QR-based asset scanning.

> [!NOTE]
> 🚧 **Under Development** — This project is actively being built. Features, APIs, and database schemas may change.

## Repository layout

```
assetmanager/
├── Client/   — React 19 + Vite + TypeScript frontend
└── Server/   — FastAPI backend (Supabase service-role, QR generation)
```

## Request flow

```mermaid
flowchart TD
    Browser["🌐 Browser (React Client)"]

    Browser -->|"Google OAuth redirect"| SupaAuth["Supabase Auth"]
    SupaAuth -->|"Session token"| Browser

    Browser -->|"Read/Write data\n(anon key + RLS)"| SupaDB["Supabase PostgREST\n(tables, views)"]
    Browser -->|"fn_assign_asset\nfn_return_asset\nfn_is_admin_or_it_ops\nfn_set_employee_role\nfn_public_scan_asset\netc."| SupaRPC["Supabase RPC\n(PostgreSQL functions)"]
    Browser -->|"INSERT/UPDATE events\n(dashboard counters)"| SupaRT["Supabase Realtime"]

    Browser -. "NOT called at runtime" .-> Server["FastAPI Server\n(Vercel Python)"]
    Server -->|"service-role key\nbypasses RLS"| SupaDB

    Server -->|"Generates QR PNG\nstored via fn_create_asset_with_log"| SupaRPC

    subgraph Supabase
        SupaAuth
        SupaDB
        SupaRPC
        SupaRT
    end
```

## Roles & database

Employees have a canonical `employees.role`: `employee`, `admin`, or `it_ops` (highest). RLS and RPCs enforce permissions; privileged role changes go through audited SQL (`fn_set_employee_role` / legacy wrapper). Apply migrations through `08_it_ops_rbac.sql` after the earlier V2 files — see [Server/db/migrations/v2/README.md](./Server/db/migrations/v2/README.md).

## Detailed documentation

- [`Client/CLIENT_README.md`](./Client/CLIENT_README.md) — full client reference (routing, pages, components, API layer, styles, deployment)
- [`Server/SERVER_README.md`](./Server/SERVER_README.md) — full server reference (routers, schemas, settings, auth, DB migrations, deployment)

## Quick start

```bash
# Client
cd Client && npm install && npm run dev

# Server
cd Server && pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Deployment

Two separate Vercel projects — `Client/` and `Server/`. Each has its own `vercel.json` and environment variables. See the individual READMEs for exact env var checklists.

### Production URLs (example)

These are the live deployments for this fork; replace with your own domains if you self-host.

| Surface | URL | Notes |
| --- | --- | --- |
| Frontend (Vite) | `https://web-assetmanager.vercel.app` | Set as `FRONTEND_URL` on the server and in Supabase Auth redirect allowlist |
| Backend (FastAPI) | `https://assetmanager-backend.vercel.app` | API root; Swagger UI is at `/docs` — do **not** use `/docs` as the API base URL |

### Environment alignment

- **Client Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` only (see [Client/CLIENT_README.md](./Client/CLIENT_README.md)).
- **Server Vercel:** `SUPABASE_URL`, `SUPABASE_KEY` (service role), `FRONTEND_URL` (must match the deployed client origin), `ALLOWED_ORIGINS` (comma-separated, include the client origin), `ENV=production`, and a non-empty `BACKEND_API_KEY` for internet-facing APIs (see [Server/SERVER_README.md](./Server/SERVER_README.md)).
- **Supabase:** Under Authentication → URL configuration, add the production site URL and redirect URLs for your client origin (e.g. `https://web-assetmanager.vercel.app` and `https://web-assetmanager.vercel.app/**` as needed).
