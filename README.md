# Asset Management System (AMS)

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
    Browser -->|"fn_assign_asset\nfn_return_asset\nfn_is_admin\nfn_public_scan_asset\netc."| SupaRPC["Supabase RPC\n(PostgreSQL functions)"]
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
