# Server `services/`

Application service layer used by FastAPI routers in `routers/`. Services orchestrate business rules, call `repositories/` for SQL, and trigger side effects (audit logs, email notifications, hooks). Route handlers stay thin — they validate input, call a service, and return the response.

## Modules

| File | Role |
| --- | --- |
| `asset_service.py` | `AssetService`: create asset (with meta entity resolution), bulk insert, assign/return delegation to `AssignmentService` |
| `assignment_service.py` | `AssignmentService`: transactional assign and return flows with row-level locking, audit trail, and fire-and-forget email notifications |
| `audit_service.py` | `AuditService`: writes append-only `asset_logs` and `asset_events` rows via `AuditRepository`; builds `ActorSnapshot` from `EmployeeContext` |
| `hooks.py` | `ServiceHooks` no-op facade with `on_asset_assigned`, `on_asset_returned`, `on_asset_deleted`, `on_employee_created`; `service_hooks` singleton for future side effects without router changes |
| `qr_service.py` | `QRService`: generates QR PNG bytes and base64 data URIs pointing to `{FRONTEND_URL}/scan/{asset_id}` |
| `qr_label_pdf_service.py` | `QRLabelPDFService`: builds print-ready A4 QR label PDFs using ReportLab; auto-fits asset tag text; handles empty-selection notice PDFs |
| `notifications/` | Email notification subpackage — see [`notifications/README.md`](./notifications/README.md) |

## `asset_service.py` — `AssetService`

Key methods:

- `create_asset(payload, actor, ...)` — resolves category, manufacturer, and location via `MetaRepository`; auto-generates asset tag if absent; writes `asset_created` audit event.
- `bulk_insert_assets(rows, actor, ...)` — calls `create_asset` per row inside a batch transaction; any row failure rolls back the batch and returns failed-row details.
- `assign_asset` / `return_asset` — thin wrappers that delegate to `AssignmentService`.

## `assignment_service.py` — `AssignmentService`

Key methods:

- `assign_asset(asset_tag, business_employee_id, ...)` — acquires a single asyncpg connection, opens a transaction, locks the asset row, closes any open assignment (force-recall), inserts a new `asset_assignments` row, writes audit trail, then fires email notifications (fire-and-forget). Idempotent when assigning to the current holder.
- `return_asset(asset_tag, ...)` — same transactional pattern; closes the open assignment, writes audit trail, fires `asset.returned` email.

Email notifications are sent **after** the transaction commits and never roll back domain operations on failure.

## `audit_service.py` — `AuditService`

- `write_asset_log(asset_id, actor, note, ...)` — inserts into `asset_logs` (human-readable note + metadata JSON).
- `write_asset_event(asset_id, event_type, actor, payload, ...)` — inserts into `asset_events` with an `actor_snapshot` (sub, employee_id, name, department) embedded in the payload JSON.

`AssetEventType` enum values include historical `asset_deleted` and `asset_restored` values so existing audit rows remain displayable.

## `qr_service.py` — `QRService`

- `build_asset_scan_url(asset_id)` — returns `{FRONTEND_URL}/scan/{asset_id}`.
- `generate_asset_qr_png_bytes(asset_id)` — returns raw PNG bytes using the `qrcode` library.
- `generate_asset_qr(asset_id)` — returns a `data:image/png;base64,...` string.

## `qr_label_pdf_service.py` — `QRLabelPDFService`

- `build_pdf(asset_tags)` — generates an A4 PDF with 24mm × 24mm QR labels arranged in a grid. Each label contains the QR image and the asset tag text (font size auto-fitted between 5pt and 7.5pt). Multiple pages are created automatically.
- `build_empty_notice_pdf(title, body)` — single-page notice PDF returned when no printable tags are found (server sets `X-Export-Empty: 1` response header).

## `hooks.py` — `ServiceHooks`

No-op facade. All methods (`on_asset_assigned`, `on_asset_returned`, `on_asset_deleted`, `on_employee_created`) accept a `HookContext` and a payload dict and return immediately. The `service_hooks` singleton can be replaced with a real implementation (webhooks, event bus) without changing any router or service code.

## Principles

- **Config:** all env-driven behavior defers to `core.settings.settings`.
- **Side effects:** long-running or external I/O (PDF generation, outbound HTTP) stays in services or `notifications/` so route handlers stay thin.
- **Transactions:** DB boundaries are kept in repositories; services call repositories in the order the domain requires and pass the connection when needed to keep operations within a single transaction.
- **Audit trail:** every mutation writes both a human-readable `asset_logs` entry and a structured `asset_events` entry.

## Related

- [`SERVER_README.md`](../SERVER_README.md) — how routers and this layer connect
- [`notifications/README.md`](./notifications/README.md) — email adapter and orchestrator
- [`../repositories/`](../repositories/) — data access layer
