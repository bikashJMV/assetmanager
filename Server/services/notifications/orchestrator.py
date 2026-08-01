"""
NotificationOrchestrator — the only business-logic layer for email events.

Keeps routers thin: they call one of these functions after a successful
domain operation and let FastAPI BackgroundTasks do the rest.

Event naming matches the email microservice templates:
  asset.assigned   → assigned.html
  asset.returned   → returned.html
  user.created     → welcome.html

asset.assigned / asset.returned use the structured POST /send/event body
(primary_recipient object, admin_email, all_admin_emails, asset_data, …).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from services.notifications.adapter import get_adapter

logger = logging.getLogger(__name__)

_VALID_ROLES = frozenset({"employee", "admin", "it_ops"})


def _normalize_role(role: Optional[str]) -> str:
    r = (role or "employee").strip().lower()
    return r if r in _VALID_ROLES else "employee"


def _dedupe_cc(admin_emails: list[str], admin_email: str, primary_email: str) -> list[str]:
    """Avoid duplicate inbox lines: drop primary from CC list (keep assigner)."""
    skip = {e.strip().lower() for e in [primary_email] if e and e.strip()}
    out: list[str] = []
    seen: set[str] = set()
    for raw in admin_emails:
        e = (raw or "").strip()
        if not e:
            continue
        key = e.lower()
        if key in skip or key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


async def notify_asset_assigned(
    *,
    primary_email: Optional[str],
    primary_name: str,
    primary_role: Optional[str],
    admin_email: str,
    admin_name: str,
    all_admin_emails: list[str],
    asset_category: str,
    model_no: str,
    asset_id: str,
    previous_employee_email: Optional[str] = None,
    new_employee_email: Optional[str] = None,
) -> None:
    """
    Fire asset.assigned to the email microservice (structured body).
    No-op if primary_email is empty or admin_email is empty (required by API).
    """
    if not primary_email or not primary_email.strip():
        logger.warning("notify_asset_assigned skipped — no primary_email for asset_id=%s", asset_id)
        return
    if not admin_email or not admin_email.strip():
        logger.warning(
            "notify_asset_assigned skipped — no admin_email (assigner) for asset_id=%s",
            asset_id,
        )
        return

    cc = _dedupe_cc(all_admin_emails, admin_email.strip(), primary_email.strip())

    payload: dict[str, Any] = {
        "event_name": "asset.assigned",
        "primary_recipient": {
            "email": primary_email.strip(),
            "name": primary_name or "",
            "role": _normalize_role(primary_role),
        },
        "admin_email": admin_email.strip(),
        "admin_name": admin_name or "",
        "all_admin_emails": cc,
        "asset_data": {
            "category": (asset_category or "").strip() or "—",
            "model_no": (model_no or "").strip() or "—",
            "asset_id": (asset_id or "").strip() or "—",
        },
    }
    if previous_employee_email and previous_employee_email.strip():
        payload["previous_employee_email"] = previous_employee_email.strip()
    if new_employee_email and new_employee_email.strip():
        payload["new_employee_email"] = new_employee_email.strip()

    adapter = get_adapter()
    await adapter.send_structured_event(payload)


async def notify_asset_returned(
    *,
    primary_email: Optional[str],
    primary_name: str,
    primary_role: Optional[str],
    admin_email: str,
    admin_name: str,
    all_admin_emails: list[str],
    asset_category: str,
    model_no: str,
    asset_id: str,
    previous_employee_email: Optional[str] = None,
    new_employee_email: Optional[str] = None,
) -> None:
    """
    Fire asset.returned (same envelope as assigned; templates differ by event_name).
    """
    if not primary_email or not primary_email.strip():
        logger.warning("notify_asset_returned skipped — no primary_email for asset_id=%s", asset_id)
        return
    if not admin_email or not admin_email.strip():
        logger.warning(
            "notify_asset_returned skipped — no admin_email (actor) for asset_id=%s",
            asset_id,
        )
        return

    cc = _dedupe_cc(all_admin_emails, admin_email.strip(), primary_email.strip())

    payload: dict[str, Any] = {
        "event_name": "asset.returned",
        "primary_recipient": {
            "email": primary_email.strip(),
            "name": primary_name or "",
            "role": _normalize_role(primary_role),
        },
        "admin_email": admin_email.strip(),
        "admin_name": admin_name or "",
        "all_admin_emails": cc,
        "asset_data": {
            "category": (asset_category or "").strip() or "—",
            "model_no": (model_no or "").strip() or "—",
            "asset_id": (asset_id or "").strip() or "—",
        },
    }
    if previous_employee_email and previous_employee_email.strip():
        payload["previous_employee_email"] = previous_employee_email.strip()
    if new_employee_email and new_employee_email.strip():
        payload["new_employee_email"] = new_employee_email.strip()

    adapter = get_adapter()
    await adapter.send_structured_event(payload)


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


async def notify_force_recall(
    *,
    old_employee_email: Optional[str],
    old_employee_name: str,
    old_employee_role: Optional[str],
    new_employee_email: Optional[str],
    new_employee_name: str,
    new_employee_role: Optional[str],
    admin_email: str,
    admin_name: str,
    all_admin_emails: list[str],
    asset_category: str,
    model_no: str,
    asset_id: str,
) -> None:
    """
    Fire force.recall.old to the old holder and force.recall.new to the new holder.

    Both calls are fire-and-forget. Either is silently skipped if the
    corresponding email is missing — the domain operation is never affected.
    """
    adapter = get_adapter()

    # ── Event 1: old employee loses the asset ────────────────────────────────
    if old_employee_email and old_employee_email.strip():
        cc_old = _dedupe_cc(all_admin_emails, admin_email.strip(), old_employee_email.strip())
        payload_old: dict[str, Any] = {
            "event_name": "force.recall.old",
            "primary_recipient": {
                "email": old_employee_email.strip(),
                "name": old_employee_name or "",
                "role": _normalize_role(old_employee_role),
            },
            "admin_email": admin_email.strip(),
            "admin_name": admin_name or "",
            "all_admin_emails": cc_old,
            "asset_data": {
                "category": (asset_category or "").strip() or "—",
                "model_no": (model_no or "").strip() or "—",
                "asset_id": (asset_id or "").strip() or "—",
            },
            "previous_employee_email": old_employee_email.strip(),
        }
        await adapter.send_structured_event(payload_old)
    else:
        logger.debug(
            "notify_force_recall: no old_employee_email — force.recall.old skipped for asset=%s",
            asset_id,
        )

    # ── Event 2: new employee receives the asset ──────────────────────────────
    if new_employee_email and new_employee_email.strip():
        cc_new = _dedupe_cc(all_admin_emails, admin_email.strip(), new_employee_email.strip())
        payload_new: dict[str, Any] = {
            "event_name": "force.recall.new",
            "primary_recipient": {
                "email": new_employee_email.strip(),
                "name": new_employee_name or "",
                "role": _normalize_role(new_employee_role),
            },
            "admin_email": admin_email.strip(),
            "admin_name": admin_name or "",
            "all_admin_emails": cc_new,
            "asset_data": {
                "category": (asset_category or "").strip() or "—",
                "model_no": (model_no or "").strip() or "—",
                "asset_id": (asset_id or "").strip() or "—",
            },
            "new_employee_email": new_employee_email.strip(),
        }
        await adapter.send_structured_event(payload_new)
    else:
        logger.debug(
            "notify_force_recall: no new_employee_email — force.recall.new skipped for asset=%s",
            asset_id,
        )
