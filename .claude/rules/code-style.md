# Code Style

Persona: **Expert Senior Full-Stack Engineer.** High-density, 0% filler, name the winner. Default
output is **code only** unless prose is asked for.

Rules are **stack-conditional** — a section applies only when that stack is present in the repo. The
`lint-changed` hook surfaces the machine-checkable ones (`any`, `.then()`, component size for
frontend; `ruff` + `mypy --strict` for Python) as you edit — informational only; **lint must be
CLEAN at the review/ship stage** (the verify pipeline), not mid-coding. Don't stop to chase lint
while a unit of work is in flight.

---

## Universal

- **`async/await` only** — never `.then()` / `.catch()` chains.
- **Early returns** over nested `if`/`else`. Guard clauses first.
- **≤ 200 lines** per component / handler / module unit → split past that.
- **No dead code, no debug logging** (`print`, `console.log`) in committed code.
- **Comments: default none.** Add only when the *why* is non-obvious (hidden constraint, subtle
  invariant, specific bug workaround). Never narrate what the code does.
- **API contract — every endpoint/handler response envelope** (full spec: `rules/api-standards.md`):
  ```json
  { "status": true, "status_code": 200, "message": "human-readable status",
    "timestamp": "<UTC ISO-8601>", "data": null }
  ```
  Errors add `"error": { "code", "details" }` with `status: false`, `data: null`.
- **No magic numbers/strings in logic** — constants or enums (`ROLES.ADMIN`, never `3`).
- **UTC timestamps everywhere** — storage, logs, APIs. UI localises for display only.

---

## TypeScript  *(present when tsconfig / *.ts(x) exist)*

- **No `any`.** Use `unknown` + narrowing, or a schema-inferred type. `any` blocks the review.
- **Types derive from schemas, never the reverse** (e.g. `z.infer<typeof Schema>`) so type and
  runtime validation cannot drift.
- **Explicit return types on exported functions.** Internal helpers may infer.
- **No type assertions** (`as X`) without an inline comment explaining why inference can't work.
- Strict mode on. Prefer `const`; no `var`.

## React  *(present when react is a dependency)*

- **Function components + hooks only.** No class components.
- Every component that fetches or derives async data renders **loading + error + empty** states —
  not just the happy path. An empty list, a failed request, and an in-flight request are all designed.
- Co-locate state; lift only when shared. Keep components small (≤200 lines → split).

## Vue  *(present when vue is a dependency)*

- **Vue 3 `<script setup>`** with the Composition API. Typed `defineProps` / `defineEmits`.
- Same loading/error/empty-state requirement as React.

## Frontend architecture  *(any frontend)*

- **All server calls go through a centralized API layer** — no raw `fetch()`/`axios()` inside
  components. React: **TanStack Query** (`useQuery`/`useMutation`) for all server state — it carries
  the loading/error/empty handling consistently.
- **Component-based, reusability first.** Cross-cutting behaviours (filtering, sorting, searching,
  pagination, debounce) are shared components/hooks, built once.
- **Global error component** and a **global toast component** (bottom-right, auto-dismiss ~5 s,
  closable via cross icon) — reused everywhere; no ad-hoc alerts.
- **Dialogs are confirmation-style:** icon-based actions, cross icon to close, background blurred,
  background scroll locked while open.
- **Responsive by design:** mobile, tablet, desktop — considered at planning time, not retrofitted.
- **Display labels/messages from a constants file**, not hardcoded in JSX. Machine values render as
  Title Case labels (`in_stock` → **In Stock**).
- **Respect the app's role hierarchy in the UI** — render only what the role may act on; no dead
  blocks for unauthorized roles.
- **Never expose API keys/tokens in the UI; never store sensitive data in localStorage.**

## Styling

- **Tailwind utilities only.** No ad-hoc CSS files / inline `style=` for anything a utility covers.
  Extract repeated utility runs into a component, not a stylesheet.
- **Color codes come exclusively from the UX4G design system (https://www.ux4g.gov.in/)** — never a
  color that isn't in it. Same hover treatment across the whole project.

---

## Python / FastAPI  *(present when requirements.txt / pyproject.toml / *.py exist)*

- **FastAPI + Pydantic v2.** Every route validates input via a Pydantic model at the boundary;
  responses follow the standard envelope (`rules/api-standards.md`).
- Full type hints; `mypy --strict` clean. No `# type: ignore` without an inline reason.
- **No direct environment reads scattered through code** — centralise config (a settings module /
  `pydantic-settings`); read config from there.
- Typed domain errors over bare string raises; map them to responses at one boundary handler.
- `ruff` clean (lint + import order). Follow the repo's existing formatter.

---

## Naming

| Thing | Convention |
| --- | --- |
| Files / dirs | `kebab-case` (JS/TS) · `snake_case` (Python) |
| Classes / types | `PascalCase` |
| Functions / vars | `camelCase` (JS/TS) · `snake_case` (Python) |
| Constants | `SCREAMING_SNAKE_CASE` |
| DB tables / columns | `snake_case` |

---

## Error handling

Every catch/except either re-throws, logs + returns a typed error response, or logs + emits an error
event. Never swallow silently. Never expose internal error details to clients — return a generic
message + correlation id, log the detail server-side.
