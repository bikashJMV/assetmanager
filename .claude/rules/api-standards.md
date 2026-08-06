---
paths: ["**/api/**", "**/routes/**", "**/controllers/**", "**/services/**", "**/middleware/**", "**/middlewares/**"]
---

# API Standards

Universal backend rules — apply to every project with an API surface, any stack. Distilled from
production feedback; the review gate + DoD enforce them.

## Response envelope (every endpoint, success and error)

```json
{
  "status": "success",
  "status_code": 200,
  "message": "human-readable status",
  "timestamp": "2026-04-22T05:39:44.400383+00:00",
  "data": { }
}
```

Error responses set `status: "error"`, `data: null` (or partial data when meaningful), and add a
typed error object:

```json
{
  "status": "error",
  "status_code": 404,
  "message": "Service not found",
  "timestamp": "2026-04-22T05:39:44.400383+00:00",
  "data": null,
  "error": { "code": "SERVICE_NOT_FOUND", "details": "No service registered with the given name" }
}
```

- `status` is the **string enum `"success" | "error"`** — never a boolean, never other strings.
  (Server helpers: `Server/core/api_response.py` `success_response` / `error_response`; the client
  unwraps in `unwrapEnvelope`, `Client/src/utils/authNexus.api.ts`.)
- `timestamp` is **UTC ISO-8601**. UTC everywhere in the system — storage, logs, APIs; the UI layer
  localises for display. Never store or emit local time.
- `message` is user-facing; `error.details` may carry more, but **never internal stack traces or
  secrets** — log those server-side with a correlation id.

## Routing & versioning

- **Version from day one:** `/api/v1/...`. Never expose unversioned routes in production.
- **Health endpoint required:** `/api/health` returning the envelope with service identity in `data`.
- Every route documents itself: a docstring/annotation stating what it does and returns (feeds
  OpenAPI/Swagger) — this is interface documentation, not a code comment.

## Requests

- **Validate every mutating request body (POST/PUT/PATCH/DELETE) at the boundary, before the service
  layer** — schema validator of the stack (Pydantic v2 / Zod). Sanitize all user input before
  processing or storing.
- **All API traffic passes through middleware** (backend and frontend clients both) — auth, logging,
  correlation ids attach there, not per-route.
- **List endpoints paginate by default** — no unbounded results. Standard params:
  `page`, `limit`, `sort_by`, `order` (asc|desc).
- **Rate-limit public-facing endpoints** (login, signup, OTP, password reset tighter than the rest).

## Error handling in routes (try / catch / finally)

Every route is **exception-safe** — no unhandled exception may ever escape as a raw 500 / stack
trace. Two layers, both required:

1. **Global boundary handler** (FastAPI `exception_handler` / Express error middleware) — the
   catch-all. Anything unhandled becomes the standard envelope with
   `error: { code: "INTERNAL_ERROR" }` + correlation id; full detail logged server-side only.
2. **Route/service-level `try`/`catch`** wherever the operation can fail meaningfully — DB writes,
   external calls, file I/O. Catch **typed** errors and map them to the envelope with a proper
   `status_code` + `error.code`; let truly unexpected ones bubble to layer 1.

`finally` (or the language's resource idiom — Python `with` context managers, TS `try/finally`,
`using`) **releases resources on both paths**: DB sessions/transactions, file handles, locks, temp
files, in-flight timers. Rules for `finally`:

- Cleanup ONLY — never `return`, never swallow the in-flight exception.
- A route that opens anything closes it in `finally`/context manager, success or failure.
- Async: every awaited chain is covered — zero unhandled promise rejections (see code-style).

```python
@router.post("/api/v1/assets")
async def create_asset(body: AssetIn) -> JSONResponse:
    session = db.session()
    try:
        result = await asset_service.create(session, body)
        await session.commit()
        return envelope(status_code=201, message="asset created", data=result)
    except DuplicateAssetError as e:
        await session.rollback()
        return envelope(status_code=409, message=str(e), error={"code": "ASSET_DUPLICATE"})
    finally:
        await session.close()
```

## Configuration & services

- **Validate required env vars at startup** — missing var = exit with a clear error, never a silent
  runtime failure. No hardcoded env values; everything from the config module (which reads `.env`).
- Separate config for local development vs deployment.
- **Every optional service** (email, notification, in-house microservice, …) ships an env flag to
  enable/disable it, nomenclature consistent across the project.
- **Logging is env-conditional per API call** (which endpoint, outcome, status code): development =
  full logs; production = error/warn only.

## Values & constants

- **No magic numbers or strings in logic.** Constants or enums:
  `if role == ROLES.ADMIN`, never `if role == 3`.
- Machine values map to display labels in the UI layer (`in_stock` → **In Stock**) — the API returns
  the machine value.
