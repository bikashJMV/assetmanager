# Notifications (`services/notifications/`)

This package sits between **Asset Manager Server** domain code and an **external Email Notification microservice**. The email service is **not** implemented in this repository; AMS only issues HTTP requests to it when configured.

## Files

| File | Role |
| --- | --- |
| [`__init__.py`](./__init__.py) | Package marker |
| [`orchestrator.py`](./orchestrator.py) | Async functions that build payloads and call `get_adapter()` — `notify_asset_assigned`, `notify_asset_returned`, `notify_user_created`, `notify_force_recall` — and role normalization (`_VALID_ROLES`: `employee`, `admin`, `it_ops`) |
| [`adapter.py`](./adapter.py) | `NotificationAdapter` interface: `send_event`, `send_structured_event`; implementations `EmailMicroserviceAdapter`, `NoOpNotificationAdapter`; factory `get_adapter()` |

## Transport (`adapter.py`)

- **`EmailMicroserviceAdapter`:** `POST {EMAIL_SERVICE_URL}/send/event` with `httpx`, header `X-API-Key: BACKEND_API_KEY_EMAIL_NOTIFICATION` (or legacy `EMAIL_SERVICE_API_KEY` read in `core.settings` for migration). Failures are logged; they do not raise to callers (must not roll back DB work).
- **`NoOpNotificationAdapter`:** logs at debug and does nothing — used when notifications are disabled or URL/key missing.

## `get_adapter()` selection (`adapter.py`)

Returns **`EmailMicroserviceAdapter`** only when **all** hold:

- `settings.NOTIFICATIONS_ENABLED` is true  
- `settings.EMAIL_SERVICE_URL` is non-empty after strip  
- `settings.BACKEND_API_KEY_EMAIL_NOTIFICATION` is non-empty (or legacy key from env as loaded in `settings`)

Otherwise returns **`NoOpNotificationAdapter`**. If `NOTIFICATIONS_ENABLED` is true but URL or key is missing, a **warning** is logged.

## Events (`orchestrator.py` docstring and function bodies)

Structured events use **`send_structured_event`** with a JSON body including `event_name` and, for assign/return/recall, `primary_recipient`, `admin_email`, `asset_data`, etc.:

- **`asset.assigned`**, **`asset.returned`** — same envelope; templates differ on the email service side
- **`user.created`** — `send_event("user.created", …)` with `data: { name }` (not the full structured body used for asset events)
- **`force.recall.old`**, **`force.recall.new`** — `notify_force_recall` issues two separate structured events when the corresponding email addresses are present

## Server configuration (see `core/settings.py`)

- `NOTIFICATIONS_ENABLED` — `true` / `false` (string compared case-insensitively)
- `EMAIL_SERVICE_URL` — base URL, trailing slashes stripped in adapter URL join
- `BACKEND_API_KEY_EMAIL_NOTIFICATION` — preferred; `EMAIL_SERVICE_API_KEY` is still read as a fallback in `core/settings.py` for the same purpose

## Related

- [`../README.md`](../README.md) — services index
- [`../../SERVER_README.md`](../../SERVER_README.md) — top-level server env and router overview
