"""
NotificationOrchestrator — the only business-logic layer for email events.

Keeps routers thin: they call one of these functions after a successful
domain operation and let FastAPI BackgroundTasks do the rest.

Event naming matches the email microservice templates:
  asset.assigned   → assigned.html
  asset.returned   → returned.html
  user.created     → welcome.html
"""
from __future__ import annotations

import logging
from typing import Optional

from services.notifications.adapter import get_adapter

logger = logging.getLogger(__name__)


async def notify_asset_assigned(
    *,
    recipient_email: Optional[str],
    recipient_name: str,
    asset_name: str,
    asset_tag: str,
    asset_model: Optional[str] = None,
    serial_number: Optional[str] = None,
    assigned_date: Optional[str] = None,
) -> None:
    """
    Fire asset.assigned email to the new holder.
    No-op if recipient_email is empty or None.
    """
    if not recipient_email or not recipient_email.strip():
        logger.debug(
            "notify_asset_assigned skipped — no email for asset_tag=%s", asset_tag
        )
        return

    adapter = get_adapter()
    await adapter.send_event(
        event_name="asset.assigned",
        recipient_email=recipient_email.strip(),
        data={
            "name": recipient_name,
            "asset_name": asset_name,
            "asset_tag": asset_tag,
            "asset_model": asset_model or "",
            "serial_number": serial_number or "",
            "assigned_date": assigned_date or "",
        },
    )


async def notify_asset_returned(
    *,
    recipient_email: Optional[str],
    recipient_name: str,
    asset_name: str,
    asset_tag: str,
    serial_number: Optional[str] = None,
    returned_date: Optional[str] = None,
) -> None:
    """
    Fire asset.returned email to the former holder.
    No-op if recipient_email is empty or None.
    """
    if not recipient_email or not recipient_email.strip():
        logger.debug(
            "notify_asset_returned skipped — no email for asset_tag=%s", asset_tag
        )
        return

    adapter = get_adapter()
    await adapter.send_event(
        event_name="asset.returned",
        recipient_email=recipient_email.strip(),
        data={
            "name": recipient_name,
            "asset_name": asset_name,
            "asset_tag": asset_tag,
            "serial_number": serial_number or "",
            "returned_date": returned_date or "",
        },
    )


async def notify_user_created(
    *,
    recipient_email: Optional[str],
    recipient_name: str,
) -> None:
    """
    Fire user.created welcome email to a newly provisioned employee.
    No-op if recipient_email is empty or None.
    """
    if not recipient_email or not recipient_email.strip():
        logger.debug(
            "notify_user_created skipped — no email for name=%s", recipient_name
        )
        return

    adapter = get_adapter()
    await adapter.send_event(
        event_name="user.created",
        recipient_email=recipient_email.strip(),
        data={"name": recipient_name},
    )
