# Server `services/`

This directory contains application services used by FastAPI **routers** in `routers/`. They orchestrate business rules and call **`repositories/`** for SQL. File names match Python modules in the tree.

## Modules (Python files)

| File | Role (from code structure and imports) |
| --- | --- |
| [`asset_service.py`](./asset_service.py) | Asset create/update, soft delete, and related orchestration; uses write/read repositories and audit as implemented |
| [`assignment_service.py`](./assignment_service.py) | Assign and return flows; uses assignment repositories |
| [`audit_service.py`](./audit_service.py) | Centralized audit log writes when routes/services invoke it |
| [`hooks.py`](./hooks.py) | `ServiceHooks` dataclass: `on_asset_assigned`, `on_asset_returned`, `on_asset_deleted`, `on_employee_created` — default no-op implementations; `service_hooks` singleton for future side effects without router changes |
| [`qr_service.py`](./qr_service.py) | QR PNG bytes and encoding for scan URLs (uses `qrcode` / Pillow) |
| [`qr_label_pdf_service.py`](./qr_label_pdf_service.py) | ReportLab PDF output for bulk QR label sheets |
| [`notifications/`](./notifications/) | Subpackage: `orchestrator.py` (event payloads) + `adapter.py` (HTTP to email microservice). See [`notifications/README.md`](./notifications/README.md) |

## Principles

- **Config:** all env-driven behavior defers to **`core.settings`** (`Settings` instance `settings`).
- **Side effects:** long-running or external I/O (PDF, outbound HTTP) stays here or in `notifications/` so route handlers stay thin.
- **Transactions:** complex flows should keep DB boundaries in **repositories**; services call repositories in the order the domain requires.

## Related

- [`SERVER_README.md`](../SERVER_README.md) — how routers and this layer connect
- [`../repositories/`](../repositories/) — data access
