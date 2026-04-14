"""
Notification adapters for AssetManager.

EmailMicroserviceAdapter  — live HTTP to the email microservice
NoOpNotificationAdapter   — silent no-op used in tests or when NOTIFICATIONS_ENABLED=false

Both implement the same interface so the orchestrator never needs to branch on config.
"""
from __future__ import annotations

import logging

import httpx

from core.settings import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared contract
# ---------------------------------------------------------------------------

class NotificationAdapter:
    """Base interface — subclasses must implement send_event + send_structured_event."""

    async def send_event(self, event_name: str, recipient_email: str, data: dict) -> None:
        raise NotImplementedError

    async def send_structured_event(self, payload: dict) -> None:
        """POST /send/event with the email microservice JSON body (asset.* events)."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Live adapter
# ---------------------------------------------------------------------------

class EmailMicroserviceAdapter(NotificationAdapter):
    """
    Sends a typed event to the email microservice via POST /send/event.

    The email service handles:
      - Template resolution (welcome, assigned, returned …)
      - SMTP delivery

    We are intentionally fire-and-forget from the server perspective:
    failures are logged but do NOT raise (they must never roll back domain ops).
    """

    ENDPOINT = "/send/event"
    TIMEOUT_SECONDS = 8

    async def send_event(self, event_name: str, recipient_email: str, data: dict) -> None:
        url = f"{settings.EMAIL_SERVICE_URL}{self.ENDPOINT}"
        payload = {
            "event_name": event_name,
            "primary_recipient": recipient_email,
            "data": data,
        }
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": settings.BACKEND_API_KEY_EMAIL_NOTIFICATION,
        }
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning(
                    "Email service returned %s for event=%s recipient=%s: %s",
                    resp.status_code,
                    event_name,
                    recipient_email,
                    resp.text[:200],
                )
            else:
                logger.info(
                    "Email dispatched: event=%s recipient=%s status=%s",
                    event_name,
                    recipient_email,
                    resp.status_code,
                )
        except Exception as exc:  # noqa: BLE001
            # Never let email failure surface to the caller — just log it.
            logger.error(
                "Failed to dispatch email event=%s recipient=%s: %s",
                event_name,
                recipient_email,
                exc,
            )

    async def send_structured_event(self, payload: dict) -> None:
        url = f"{settings.EMAIL_SERVICE_URL}{self.ENDPOINT}"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": settings.BACKEND_API_KEY_EMAIL_NOTIFICATION,
        }
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload, headers=headers)
            primary = payload.get("primary_recipient") or {}
            pe = primary.get("email") if isinstance(primary, dict) else primary
            if resp.status_code >= 400:
                logger.warning(
                    "Email service returned %s for event=%s recipient=%s: %s",
                    resp.status_code,
                    payload.get("event_name"),
                    pe,
                    resp.text[:200],
                )
            else:
                logger.info(
                    "Email dispatched: event=%s recipient=%s status=%s",
                    payload.get("event_name"),
                    pe,
                    resp.status_code,
                )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to dispatch structured email event=%s: %s",
                payload.get("event_name"),
                exc,
            )


# ---------------------------------------------------------------------------
# No-op adapter  (testing / NOTIFICATIONS_ENABLED=false)
# ---------------------------------------------------------------------------

class NoOpNotificationAdapter(NotificationAdapter):
    """Silently discards all events — safe for tests and disabled deployments."""

    async def send_event(self, event_name: str, recipient_email: str, data: dict) -> None:
        logger.debug(
            "[NoOp] Would send event=%s to=%s data=%s",
            event_name,
            recipient_email,
            data,
        )

    async def send_structured_event(self, payload: dict) -> None:
        logger.debug("[NoOp] Would send structured event payload=%s", payload)


# ---------------------------------------------------------------------------
# Factory — called once at module import time via orchestrator
# ---------------------------------------------------------------------------

def get_adapter() -> NotificationAdapter:
    """Return the live adapter when enabled, no-op otherwise."""
    url_ok = bool(settings.EMAIL_SERVICE_URL and settings.EMAIL_SERVICE_URL.strip())
    key_ok = bool(
        settings.BACKEND_API_KEY_EMAIL_NOTIFICATION
        and settings.BACKEND_API_KEY_EMAIL_NOTIFICATION.strip()
    )
    if settings.NOTIFICATIONS_ENABLED and url_ok and key_ok:
        return EmailMicroserviceAdapter()
    if settings.NOTIFICATIONS_ENABLED and (not url_ok or not key_ok):
        logger.warning(
            "NOTIFICATIONS_ENABLED=true but EMAIL_SERVICE_URL or BACKEND_API_KEY_EMAIL_NOTIFICATION is "
            "missing/empty — assignment emails are skipped. Set both on the AMS Server .env "
            "(EMAIL_SERVICE_API_KEY is still accepted temporarily as a fallback)."
        )
    return NoOpNotificationAdapter()
