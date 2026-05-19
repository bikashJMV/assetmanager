from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.authnexus import EmployeeContext
from repositories.assignment_write_repository import AssignmentWriteRepository
from repositories.db import pool
from repositories.employee_repository import EmployeeRepository
from repositories.errors import ConflictError
from services.audit_service import AssetEventType, audit_service
from services.hooks import HookContext, service_hooks
from services.notifications.orchestrator import (
    notify_asset_assigned,
    notify_asset_returned,
)

logger = logging.getLogger(__name__)


async def _fetch_notification_context(actor_id: str) -> tuple[str | None, list[str]]:
    """
    Fetch actor email + all admin/it_ops emails in parallel.
    Returns (actor_email, all_admin_emails).
    Both are safe to call even if actor_id is empty — returns (None, []).
    """
    actor_email, all_admin_emails = await asyncio.gather(
        EmployeeRepository.get_email_by_id(actor_id),
        EmployeeRepository.get_admin_emails(),
    )
    return actor_email, all_admin_emails


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: Optional[datetime]) -> datetime:
    if value is None:
        return _now_utc()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class AssignmentService:
    """
    Business logic for assignments (mutations).

    Confirmed responsibilities:
    - Transactional assign/return flows (one connection, one transaction).
    - Audit trail written here (asset_logs, asset_events).
    - Hook-ready (email/webhook triggers later without router changes).
    """

    @staticmethod
    async def assign_asset(
        *,
        asset_tag: str,
        business_employee_id: str,
        assigned_at: Optional[datetime],
        notes: Optional[str],
        source: str,
        actor: EmployeeContext,
        force_dept_move: bool = False,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        at = _normalize_dt(assigned_at)

        hook_payload: dict[str, Any] = {
            "asset_tag": (asset_tag or "").strip(),
            "employee_id": (business_employee_id or "").strip().upper(),
        }

        async with pool().acquire() as conn:
            async with conn.transaction():
                asset_row = await AssignmentWriteRepository.get_asset_inventory_row_by_tag(conn, asset_tag)
                asset_id = str(asset_row["asset_id"])

                await AssignmentWriteRepository.lock_asset_row(conn, asset_id)

                employee_row = await AssignmentWriteRepository.get_employee_by_business_employee_id(
                    conn, business_employee_id
                )
                new_holder_uuid = str(employee_row["id"])
                new_business_id = str(employee_row.get("employee_id") or "")

                # --- Department Mismatch / Validation Logic ---
                asset_dept_id = asset_row.get("asset_department_id")
                employee_dept_id = employee_row.get("department_id")
                _dept_auto_set: bool = False
                _new_dept_name: str | None = None

                if asset_dept_id is None and employee_dept_id is not None:
                    # Case A: asset has no dept → auto-set to employee's dept
                    await conn.execute(
                        "UPDATE assets SET department_id = $1::uuid WHERE id = $2::uuid",
                        employee_dept_id, asset_id
                    )
                    await _write_dept_log(
                        conn,
                        asset_id=asset_id,
                        from_dept_id=None,
                        to_dept_id=employee_dept_id,
                        actor_id=actor.id,
                        reason="auto-set on first assignment"
                    )
                    await audit_service.write_asset_event(
                        asset_id=asset_id,
                        event_type=AssetEventType.ASSET_DEPT_AUTO_UPDATED,
                        actor=actor,
                        payload={
                            "asset_tag": asset_row.get("asset_tag"),
                            "from_dept_id": None,
                            "to_dept_id": employee_dept_id,
                            "reason": "auto-set on first assignment",
                        },
                        ip_address=ip_address,
                        user_agent=user_agent,
                        conn=conn,
                    )
                    _dept_auto_set = True
                    _new_dept_name = str(employee_row.get("department_name") or "")
                elif asset_dept_id == employee_dept_id:
                    # Case B: depts match → proceed directly without any changes
                    pass
                elif asset_dept_id != employee_dept_id and not force_dept_move:
                    # Case C: mismatch and force_dept_move is False → write audit trail and return
                    await audit_service.write_asset_event(
                        asset_id=asset_id,
                        event_type=AssetEventType.ASSET_ASSIGNMENT_BLOCKED,
                        actor=actor,
                        payload={
                            "asset_tag": asset_row.get("asset_tag"),
                            "asset_dept_id": str(asset_dept_id),
                            "asset_dept_name": asset_row.get("asset_department_name"),
                            "employee_dept_id": str(employee_dept_id),
                            "employee_dept_name": employee_row.get("department_name"),
                            "reason": "dept_mismatch",
                        },
                        ip_address=ip_address,
                        user_agent=user_agent,
                        conn=conn,
                    )
                    return {
                        "ok": False,
                        "dept_mismatch": True,
                        "asset_dept_id": asset_dept_id,
                        "asset_dept_name": asset_row.get("asset_department_name"),
                        "employee_dept_id": employee_dept_id,
                        "employee_dept_name": employee_row.get("department_name"),
                        "message": f"Department mismatch: asset belongs to {asset_row.get('asset_department_name') or 'N/A'}, employee belongs to {employee_row.get('department_name') or 'N/A'}.",
                    }
                elif asset_dept_id != employee_dept_id and force_dept_move:
                    # Case D: mismatch and force_dept_move is True -> update dept and proceed
                    await conn.execute(
                        "UPDATE assets SET department_id = $1::uuid WHERE id = $2::uuid",
                        employee_dept_id, asset_id
                    )
                    await _write_dept_log(
                        conn,
                        asset_id=asset_id,
                        from_dept_id=asset_dept_id,
                        to_dept_id=employee_dept_id,
                        actor_id=actor.id,
                        reason="dept-move on assignment"
                    )
                    await audit_service.write_asset_event(
                        asset_id=asset_id,
                        event_type=AssetEventType.ASSET_DEPT_AUTO_UPDATED,
                        actor=actor,
                        payload={
                            "asset_tag": asset_row.get("asset_tag"),
                            "from_dept_id": asset_dept_id,
                            "to_dept_id": employee_dept_id,
                            "reason": "dept-move on assignment",
                        },
                        ip_address=ip_address,
                        user_agent=user_agent,
                        conn=conn,
                    )

                current_employee_id = asset_row.get("current_employee_id")
                current_assignment_id = asset_row.get("assignment_id")

                # --- Idempotent no-op: already assigned to same employee ---
                if current_employee_id and str(current_employee_id) == new_holder_uuid:
                    await audit_service.write_asset_event(
                        asset_id=asset_id,
                        event_type=AssetEventType.ASSET_ASSIGNED,
                        actor=actor,
                        payload={
                            "assignment_id": current_assignment_id,
                            "employee_row_id": new_holder_uuid,
                            "employee_id": new_business_id,
                            "employee_name": employee_row.get("name"),
                            "asset_tag": asset_row.get("asset_tag"),
                            "idempotent": True,
                        },
                        ip_address=ip_address,
                        user_agent=user_agent,
                        conn=conn,
                    )
                    await audit_service.write_asset_log(
                        asset_id=asset_id,
                        actor=actor,
                        note=f"Assignment no-op: already held by {new_business_id}.",
                        metadata={"op": "assignment.assign", "idempotent": True},
                        conn=conn,
                    )

                    hook_payload.update(
                        {
                            "assignment_id": current_assignment_id,
                            "asset_id": asset_id,
                            "status": "assigned",
                            "idempotent": True,
                        }
                    )

                    result = {
                        "ok": True,
                        "assignment_id": current_assignment_id,
                        "asset_id": asset_id,
                        "asset_tag": asset_row.get("asset_tag"),
                        "id": new_holder_uuid,
                        "employee_id": new_business_id,
                        "status": "assigned",
                        "message": "Asset already assigned to same employee",
                        "dept_auto_set": _dept_auto_set,
                        "new_dept_name": _new_dept_name,
                    }
                else:
                    previous_holder = None
                    previous_employee_id = None

                    if current_employee_id and current_assignment_id:
                        previous_holder = {
                            "employee_id": asset_row.get("current_employee_business_id"),
                            "name": asset_row.get("current_employee_name"),
                            "email": asset_row.get("current_employee_email"),
                        }
                        previous_employee_id = str(current_employee_id)

                        await AssignmentWriteRepository.close_open_assignment(
                            conn,
                            asset_id=asset_id,
                            returned_at=at,
                            source=source,
                            note_append="Auto-closed by reassignment",
                        )

                    new_assignment_id = await AssignmentWriteRepository.insert_assignment(
                        conn,
                        asset_id=asset_id,
                        employee_id=new_holder_uuid,
                        assigned_at=at,
                        source=source or "runtime",
                        notes=notes,
                    )

                    await audit_service.write_asset_event(
                        asset_id=asset_id,
                        event_type=AssetEventType.ASSET_ASSIGNED,
                        actor=actor,
                        payload={
                            "assignment_id": new_assignment_id,
                            "employee_row_id": new_holder_uuid,
                            "employee_id": new_business_id,
                            "employee_name": employee_row.get("name"),
                            "asset_tag": asset_row.get("asset_tag"),
                            "previous_employee_row_id": previous_employee_id,
                            "previous_employee_id": asset_row.get("current_employee_business_id"),
                            "notes": notes,
                        },
                        ip_address=ip_address,
                        user_agent=user_agent,
                        conn=conn,
                    )
                    await audit_service.write_asset_log(
                        asset_id=asset_id,
                        actor=actor,
                        note=(
                            f"Asset reassigned to {new_business_id} from {asset_row.get('current_employee_business_id')}."
                            if previous_employee_id
                            else f"Asset assigned to {new_business_id}."
                        ) + (f" Notes: {notes.strip()}" if notes and notes.strip() else ""),
                        metadata={
                            "op": "assignment.assign",
                            "employee_id": new_business_id,
                            "employee_row_id": new_holder_uuid,
                        },
                        conn=conn,
                    )

                    hook_payload.update(
                        {
                            "assignment_id": new_assignment_id,
                            "asset_id": asset_id,
                            "status": "assigned",
                            "previous_holder": previous_holder,
                        }
                    )

                    result = {
                        "ok": True,
                        "assignment_id": new_assignment_id,
                        "asset_id": asset_id,
                        "asset_tag": asset_row.get("asset_tag"),
                        "id": new_holder_uuid,
                        "employee_id": new_business_id,
                        "status": "assigned",
                        "message": "Asset assigned successfully",
                        "dept_auto_set": _dept_auto_set,
                        "new_dept_name": _new_dept_name,
                    }

        await service_hooks.on_asset_assigned(
            ctx=HookContext(
                request_id=request_id, actor_sub=actor.sub, actor_employee_id=actor.employee_id
            ),
            payload=hook_payload,
        )

        # ── Email notification (fire-and-forget) ─────────────────────────────
        # Idempotent no-ops never trigger an email.
        if not hook_payload.get("idempotent"):
            try:
                actor_email, all_admin_emails = await _fetch_notification_context(actor.id)
                previous_holder = hook_payload.get("previous_holder")

                logger.info(
                    "[notify] assign_asset: asset_tag=%s actor_email=%s employee_email=%s "
                    "is_reassign=%s admin_count=%d",
                    asset_tag,
                    actor_email,
                    employee_row.get("email"),
                    previous_holder is not None,
                    len(all_admin_emails),
                )

                if previous_holder is not None:
                    # Reassignment: old employee had the asset
                    notify_tasks = [
                        notify_asset_assigned(
                            primary_email=employee_row.get("email"),
                            primary_name=str(employee_row.get("name") or ""),
                            primary_role=str(employee_row.get("role") or "employee"),
                            admin_email=actor_email or "",
                            admin_name=actor.name,
                            all_admin_emails=all_admin_emails,
                            asset_category=str(asset_row.get("category_name") or ""),
                            model_no=str(asset_row.get("model") or ""),
                            asset_id=str(asset_row.get("asset_tag") or ""),
                        )
                    ]
                    if previous_holder.get("email"):
                        notify_tasks.append(
                            notify_asset_returned(
                                primary_email=previous_holder["email"],
                                primary_name=str(previous_holder.get("name") or ""),
                                primary_role="employee",
                                admin_email=actor_email or "",
                                admin_name=actor.name,
                                all_admin_emails=all_admin_emails,
                                asset_category=str(asset_row.get("category_name") or ""),
                                model_no=str(asset_row.get("model") or ""),
                                asset_id=str(asset_row.get("asset_tag") or ""),
                            )
                        )
                    await asyncio.gather(*notify_tasks)
                else:
                    # Fresh assignment: no previous holder
                    await notify_asset_assigned(
                        primary_email=employee_row.get("email"),
                        primary_name=str(employee_row.get("name") or ""),
                        primary_role=str(employee_row.get("role") or "employee"),
                        admin_email=actor_email or "",
                        admin_name=actor.name,
                        all_admin_emails=all_admin_emails,
                        asset_category=str(asset_row.get("category_name") or ""),
                        model_no=str(asset_row.get("model") or ""),
                        asset_id=str(asset_row.get("asset_tag") or ""),
                    )
            except Exception as exc:
                logger.error(
                    "assign_asset notification error (domain op succeeded): asset_tag=%s error=%s",
                    asset_tag,
                    exc,
                )

        return result

    @staticmethod
    async def return_asset(
        *,
        asset_tag: str,
        returned_at: Optional[datetime],
        notes: Optional[str],
        source: str,
        actor: EmployeeContext,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        at = _normalize_dt(returned_at)

        async with pool().acquire() as conn:
            async with conn.transaction():
                asset_row = await AssignmentWriteRepository.get_asset_inventory_row_by_tag(conn, asset_tag)
                asset_id = str(asset_row["asset_id"])
                await AssignmentWriteRepository.lock_asset_row(conn, asset_id)

                assignment_id = await AssignmentWriteRepository.return_open_assignment(
                    conn,
                    asset_id=asset_id,
                    returned_at=at,
                    source=source,
                    notes=notes,
                )

                if not assignment_id:
                    raise ConflictError("No open assignment found to return")

                await audit_service.write_asset_event(
                    asset_id=asset_id,
                        event_type=AssetEventType.ASSET_RETURNED,
                    actor=actor,
                    payload={
                        "assignment_id": assignment_id,
                        "asset_id": asset_id,
                        "asset_tag": asset_row.get("asset_tag"),
                        "previous_employee_id": asset_row.get("current_employee_business_id"),
                        "previous_employee_name": asset_row.get("current_employee_name"),
                    },
                    ip_address=ip_address,
                    user_agent=user_agent,
                    conn=conn,
                )
                await audit_service.write_asset_log(
                    asset_id=asset_id,
                    actor=actor,
                    note=(
                        f"Asset returned."
                        + (f" Notes: {notes.strip()}" if notes and notes.strip() else "")
                    ).strip(),
                    metadata={"op": "assignment.return"},
                    conn=conn,
                )

        await service_hooks.on_asset_returned(
            ctx=HookContext(
                request_id=request_id, actor_sub=actor.sub, actor_employee_id=actor.employee_id
            ),
            payload={
                "assignment_id": assignment_id,
                "asset_id": asset_id,
                "asset_tag": asset_row.get("asset_tag"),
                "status": "in_stock",
            },
        )

        # ── Email notification (fire-and-forget) ─────────────────────────────
        try:
            actor_email, all_admin_emails = await _fetch_notification_context(actor.id)

            logger.info(
                "[notify] return_asset: asset_tag=%s actor_email=%s employee_email=%s admin_count=%d",
                asset_tag,
                actor_email,
                asset_row.get("current_employee_email"),
                len(all_admin_emails),
            )

            if asset_row.get("current_employee_email"):
                await notify_asset_returned(
                    primary_email=asset_row["current_employee_email"],
                    primary_name=str(asset_row.get("current_employee_name") or ""),
                    primary_role="employee",
                    admin_email=actor_email or "",
                    admin_name=actor.name,
                    all_admin_emails=all_admin_emails,
                    asset_category=str(asset_row.get("category_name") or ""),
                    model_no=str(asset_row.get("model") or ""),
                    asset_id=str(asset_row.get("asset_tag") or ""),
                )
        except Exception as exc:
            logger.error(
                "return_asset notification error (domain op succeeded): asset_tag=%s error=%s",
                asset_tag,
                exc,
            )

        return {
            "ok": True,
            "assignment_id": assignment_id,
            "asset_id": asset_id,
            "asset_tag": asset_row.get("asset_tag"),
            "status": "in_stock",
            "message": "Asset returned successfully",
        }


async def _write_dept_log(
    conn: Any,
    *,
    asset_id: str,
    from_dept_id: str | None,
    to_dept_id: str | None,
    actor_id: str,
    reason: str,
) -> None:
    await conn.execute(
        """
        insert into asset_department_log
            (asset_id, from_dept_id, to_dept_id, changed_by, reason)
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
        """,
        asset_id,
        from_dept_id,
        to_dept_id,
        actor_id,
        reason,
    )


assignment_service = AssignmentService()
