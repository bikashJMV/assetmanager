# Asset Management System

Internal IT asset manager for JMV: track assets (QR-tagged), assign/return to employees, warranty
notifications, analytics, recycle bin, bulk import/export. Users: employees (view own), admins,
IT-ops. Stack: React 19 + Vite + TypeScript + Tailwind (custom token theme) client; FastAPI + asyncpg
(raw SQL) server; Postgres 15; OIDC via AuthNexus/ZITADEL with a BFF HttpOnly-cookie refresh-token
flow; nginx (inside client image) reverse-proxies `/api/` and `/nexus-proxy/`; Loki/Tempo/Prometheus/
Grafana observability. Target: 500 active users.

## Workflow (Karpathy loop — spec first, then small verified steps)

1. Vague idea → `/idea-refine` or `/interview-me` to sharpen it.
2. `/spec` → `/spec-review` → `/spec-tasks` — the spec is the contract; no code before it.
3. `/loop` — Writer/Verifier passes, ONE acceptance criterion per iteration, each with its own
   `verify` command. Keep the agent on a short leash: small diffs, tests in the same diff.
4. Ship: verify pipeline green → human types `approve-ship` → commit to feature branch → **no PR
   required**; one human review, then human merges (target branch: `dev`).

## Current Focus

<!-- Keep ONE active item; move finished items to PROGRESS.md. Backlog: .claude/context/roadmap.md -->

- [ ] Network drop/restore UX: persistent warning toast on `offline`, auto-dismiss + "Back online"
      toast on restore (debounced ~2-3s, verified via `/api/health` ping), TanStack Query
      `onlineManager` wired so paused queries resume on reconnect. Verify: vitest unit for the
      `useOnlineStatus` hook + manual `context.setOffline` check; toasts must use semantic theme
      tokens (dark-mode safe), not hardcoded colors.

## Architecture notes

- `.claude/context/architecture.md` — stack map, layering, data flow, known duplications
- `.claude/context/auth-bff.md` — OIDC + BFF refresh-token flow (protected paths — human-owned)
- `.claude/context/roadmap.md` — full improvement backlog (scalability, UI redesign, e2e, edge cases)

Key invariants:
- API envelope: `{status: "success"|"error", status_code, message, timestamp, data, error?}` —
  helpers in `Server/core/api_response.py`; client unwraps in `Client/src/utils/authNexus.api.ts`.
- New client data code goes through `src/services/*` + `src/queries/*` (TanStack Query) — never add
  to legacy `src/api.ts` (being migrated away from).
- Styling: Tailwind utilities + semantic CSS tokens (`styles/theme.css`, `styles/global.css`);
  dark mode via `[data-theme]` — never hardcode light/dark colors.
- Roles: `employee | admin | it_ops`; guards client-side in `App.tsx`, server-side in
  `Server/core/authz.py`.

## Rules

Delivery flow, code style, and git conventions live in `.claude/rules/` (injected every session by
the session-start hook). Project config: `.claude/config.json` (profile: personal, human checkpoint:
`approve-ship`, no PR required). Never commit without the human typing `approve-ship`.
