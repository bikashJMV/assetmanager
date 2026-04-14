# Notifications Service

This module handles communication between the Asset Manager Server and the external **Email Notification Microservice**. It is designed to act as a resilient abstraction layer so the rest of the backend does not need to worry about the underlying HTTP transport or external email service availability.

## Components

### `orchestrator.py`
The primary business-logic layer for defining email events.
*   Keeps FastAPI routers thin by mapping domain events to expected payload structures.
*   Responsible for resolving event data, normalizing user roles, and de-duplicating CC lists (e.g. preventing the actor/assigner from receiving duplicate CC emails).
*   Configured to format templates for `asset.assigned`, `asset.returned`, and `user.created`.

### `adapter.py`
The transport layer interfacing with the external service.
*   **`EmailMicroserviceAdapter`**: Issues live `POST /send/event` HTTP calls to the external email notification service. It handles exceptions and timeouts, ensuring that network issues log errors but never surface HTTP 500s back to the client or roll back database transactions.
*   **`NoOpNotificationAdapter`**: A silent dummy adapter used for unit testing or when the email microservice is disabled.

## Configuration

The adapter factory dynamically spins up the live adapter or falls back to the `NoOpNotificationAdapter` based on environment variables defined in the central `settings`:
*   `NOTIFICATIONS_ENABLED=true`
*   `EMAIL_SERVICE_URL` and `BACKEND_API_KEY_EMAIL_NOTIFICATION` must be set
