# Notifications (`services/notifications/`)

This package sits between the AMS Server domain layer and an **external email notification microservice**. The email service is **not** implemented in this repository — AMS only issues HTTP POST requests to it when configured. All calls are fire-and-forget: failures are logged but never raise to callers and never roll back domain operations.

## Files

| File | Role |
| --- | --- |
| `__init__.py` | Package marker |
| `adapter.py` | `NotificationAdapter` interface; `EmailMicroserviceAdapter` (live HTTP); `NoOpNotificationAdapter` (silent no-op); `get_adapter()` factory |
| `orchestrator.py` | Async functions that build event payloads and call `get_adapter()`: `notify_asset_assigned`, `notify_asset_returned`, `notify_user_created`, `notify_force_recall` |

## Adapter (`adapter.py`)

### `EmailMicroserviceAdapter`

Posts to `{EMAIL_SERVICE_URL}/send/event` with:
- Header: `X-API-Key: {BACKEND_API_KEY_EMAIL_NOTIFICATION}`
- Body: JSON event payload
- Timeout: 8 seconds

HTTP 4xx/5xx responses are logged as warnings. Network errors are logged as errors. Neither raises to the caller.

### `NoOpNotificationAdapter`

Logs at `DEBUG` level and discards all events. Used when `NOTIFICATIONS_ENABLED=false` or when URL/key is missing.

### `get_adapter()` factory

Returns `EmailMicroserviceAdapter` only when **all three** conditions hold:
1. `settings.NOTIFICATIONS_ENABLED` is `true`
2. `settings.EMAIL_SERVICE_URL` is non-empty
3. `settings.BACKEND_API_KEY_EMAIL_NOTIFICATION` is non-empty

If `NOTIFICATIONS_ENABLED=true` but URL or key is missing, a **warning** is logged and `NoOpNotificationAdapter` is returned. `EMAIL_SERVICE_API_KEY` is still accepted as a deprecated fallback for `BACKEND_API_KEY_EMAIL_NOTIFICATION` (read in `core/settings.py`).

## Events (`orchestrator.py`)

### `notify_asset_assigned`

Fires `asset.assigned` structured event. Skipped silently if `primary_email` or `admin_email` is empty.

Payload fields: `event_name`, `primary_recipient` (`{email, name, role}`), `admin_email`, `admin_name`, `all_admin_emails` (CC list, deduped), `asset_data` (`{category, model_no, asset_id}`). Optional: `previous_employee_email`, `new_employee_email`.

### `notify_asset_returned`

Fires `asset.returned` with the same envelope as `asset.assigned`. Template selection is done by the email service based on `event_name`.

### `notify_user_created`

Fires `user.created` welcome email via `send_event` (simpler body: `{event_name, primary_recipient, data: {name}}`). Skipped if `recipient_email` is empty.

### `notify_force_recall`

Fires two separate events when an asset is reassigned from one employee to another:
1. `force.recall.old` — to the employee losing the asset
2. `force.recall.new` — to the employee receiving the asset

Either event is silently skipped if the corresponding email is missing.

## CC deduplication

`_dedupe_cc(admin_emails, admin_email, primary_email)` removes the primary recipient from the CC list to avoid duplicate inbox entries. The assigner (`admin_email`) is kept in the CC list.

## Role normalization

`_normalize_role(role)` maps any unrecognized role string to `"employee"`. Valid values: `employee`, `admin`, `it_ops`.

## Server configuration

Set in `Server/.env` (read by `core/settings.py`):

| Variable | Description |
| --- | --- |
| `NOTIFICATIONS_ENABLED` | `true` to dispatch real emails; anything else → no-op |
| `EMAIL_SERVICE_URL` | Base URL of the email microservice (trailing slash stripped) |
| `BACKEND_API_KEY_EMAIL_NOTIFICATION` | `X-API-Key` header value for the email service |
| `EMAIL_SERVICE_API_KEY` | Deprecated fallback for `BACKEND_API_KEY_EMAIL_NOTIFICATION` |

## Known TODOs / limitations

- The email microservice itself is external and not documented here. Template names (`assigned.html`, `returned.html`, `welcome.html`) are resolved on the email service side.
- `notify_user_created` is defined but its call site in the server (e.g. after employee creation) is unclear — needs clarification.

## Related

- [`../README.md`](../README.md) — services index
- [`../../SERVER_README.md`](../../SERVER_README.md) — server env vars and router overview
