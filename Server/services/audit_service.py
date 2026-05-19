from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Optional

import asyncpg

from core.authnexus import EmployeeContext
from repositories.audit_repository import AuditRepository


class AssetEventType(str, Enum):
    ASSET_CREATED = "asset_created"
    ASSET_UPDATED = "asset_updated"
    ASSET_ASSIGNED = "asset_assigned"
    ASSET_RETURNED = "asset_returned"
    QR_SCANNED = "qr_scanned"
    ASSET_DELETED = "asset_deleted"
    ASSET_RESTORED = "asset_restored"
    BULK_IMPORTED = "bulk_imported"
    QR_BATCH_GENERATED = "qr_batch_generated"
    QR_RESERVATION_CONSUMED = "qr_reservation_consumed"
    QR_RESERVATION_LINKED = "qr_reservation_linked"
    ASSET_DEPT_AUTO_UPDATED = "asset_dept_auto_updated"
    ASSET_ASSIGNMENT_BLOCKED = "asset_assignment_blocked"


@dataclass(frozen=True)
class ActorSnapshot:
    actor_sub: str
    actor_employee_id: str
    actor_name: str
    actor_department: Optional[str]

    @staticmethod
    def from_employee(employee: EmployeeContext) -> "ActorSnapshot":
        return ActorSnapshot(
            actor_sub=employee.sub,
            actor_employee_id=employee.employee_id,
            actor_name=employee.name,
            actor_department=employee.department,
        )


class AuditService:
    """
    Service-layer audit writer.

    - Builds actor snapshot in Python (per migration plan).
    - Writes append-only logs/events (asset_logs, asset_events).
    """

    @staticmethod
    async def write_asset_log(
        *,
        asset_id: str,
        actor: Optional[EmployeeContext],
        note: Optional[str],
        qr_code: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        conn: asyncpg.Connection | None = None,
    ) -> None:
        await AuditRepository.insert_asset_log(
            asset_id=asset_id,
            actor_employee_id=actor.id if actor else None,
            note=note,
            qr_code=qr_code,
            metadata=metadata or {},
            conn=conn,
        )

    @staticmethod
    async def write_asset_event(
        *,
        asset_id: str,
        event_type: AssetEventType,
        actor: Optional[EmployeeContext],
        payload: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        conn: asyncpg.Connection | None = None,
    ) -> None:
        merged: dict[str, Any] = {}
        if payload:
            merged.update(payload)
        if actor:
            merged["actor_snapshot"] = asdict(ActorSnapshot.from_employee(actor))

        await AuditRepository.insert_asset_event(
            asset_id=asset_id,
            event_type=str(event_type.value),
            actor_id=actor.sub if actor else None,
            payload=merged,
            ip_address=ip_address,
            user_agent=user_agent,
            conn=conn,
        )


audit_service = AuditService()
