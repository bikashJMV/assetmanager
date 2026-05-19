from __future__ import annotations

from typing import Any, Optional

import asyncpg

from core.asset_db_types import AssetDateCoercionError, normalize_asset_date_fields_inplace
from core.authnexus import EmployeeContext
from repositories.asset_write_repository import AssetWriteRepository
from repositories.errors import NotFoundError, ValidationError
from repositories.recycle_bin_repository import RecycleBinRepository
from services.audit_service import AssetEventType, audit_service
from services.hooks import HookContext, service_hooks


class AssetService:
    """
    Business logic for assets (mutations).

    Confirmed responsibilities:
    - Soft delete / restore / hard delete orchestration (hard delete later).
    - Audit trail written here (asset_logs, asset_events).
    - Hook-ready (email/webhook triggers later without router changes).
    """

    @staticmethod
    async def soft_delete_asset(
        *,
        asset_id: str,
        actor: EmployeeContext,
        reason: str | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        updated = await AssetWriteRepository.mark_soft_deleted(
            asset_id=asset_id,
            deleted_by_employee_id=actor.id,
        )

        label = str(updated.get("asset_tag") or updated.get("serial_number") or asset_id)
        recycle_id = await RecycleBinRepository.insert_entry(
            entity_type="asset",
            entity_id=asset_id,
            label=label,
            payload={"reason": (reason or "").strip() or None},
            deleted_by_employee_id=actor.id,
        )

        await audit_service.write_asset_event(
            asset_id=asset_id,
            event_type=AssetEventType.ASSET_DELETED,
            actor=actor,
            payload={"recycle_bin_id": recycle_id, "reason": (reason or "").strip() or None},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await audit_service.write_asset_log(
            asset_id=asset_id,
            actor=actor,
            note=f"Asset soft-deleted. {('Reason: ' + reason.strip()) if reason and reason.strip() else ''}".strip(),
            metadata={"op": "asset.soft_delete"},
        )

        await service_hooks.on_asset_deleted(
            ctx=HookContext(request_id=request_id, actor_sub=actor.sub, actor_employee_id=actor.employee_id),
            payload={"asset_id": asset_id, "recycle_bin_id": recycle_id},
        )

        return {"asset_id": asset_id, "recycle_bin_id": recycle_id}

    @staticmethod
    async def restore_asset(
        *,
        asset_id: str,
        recycle_bin_id: str,
        actor: EmployeeContext,
        request_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        await AssetWriteRepository.mark_restored(asset_id=asset_id, restored_by_employee_id=actor.id)
        await RecycleBinRepository.mark_restored(recycle_bin_id=recycle_bin_id, restored_by_employee_id=actor.id)

        await audit_service.write_asset_event(
            asset_id=asset_id,
            event_type=AssetEventType.ASSET_RESTORED,
            actor=actor,
            payload={"recycle_bin_id": recycle_bin_id},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await audit_service.write_asset_log(
            asset_id=asset_id,
            actor=actor,
            note="Asset restored from recycle bin.",
            metadata={"op": "asset.restore"},
        )

        return {"asset_id": asset_id, "recycle_bin_id": recycle_bin_id}

    @staticmethod
    async def create_asset(
        *,
        payload: dict[str, Any],
        actor: EmployeeContext,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        event_type: AssetEventType = AssetEventType.ASSET_CREATED,
        qr_reservation_id: Optional[str] = None,
    ) -> dict[str, Any]:
        from repositories.meta_repository import MetaRepository
        from repositories.qr_repository import QrRepository
        from repositories.db import pool
        from repositories.asset_repository import AssetRepository as _AR

        try:
            normalize_asset_date_fields_inplace(payload)
        except AssetDateCoercionError as exc:
            raise ValidationError(str(exc)) from exc

        # ─────────────────────────────────────────────────────────────
        # Meta resolution (shared by both Path A + Path B)
        # ─────────────────────────────────────────────────────────────
        category_id = await MetaRepository.resolve_category(
            slug=payload["category_slug"],
            name=payload.get("category_name")
        )
        manufacturer_id = None
        if payload.get("manufacturer_name"):
            manufacturer_id = await MetaRepository.resolve_manufacturer(payload["manufacturer_name"])
        location_id = None
        if payload.get("location_code"):
            location_id = await MetaRepository.resolve_location(
                code=payload["location_code"],
                name=payload.get("location_name")
            )

        # ─────────────────────────────────────────────────────────────
        # PATH A — QR scan-to-log (atomic TX: generate tag + insert asset + link QR)
        # ─────────────────────────────────────────────────────────────
        if qr_reservation_id:
            for _attempt in range(3):
                try:
                    async with pool().acquire() as conn:
                        async with conn.transaction():
                            # 1. Lock the reservation row; verify it is still unlinked
                            reservation = await conn.fetchrow(
                                """
                                SELECT id, status FROM qr_tag_reservations
                                 WHERE id = $1::uuid AND status = 'unlinked'
                                 FOR UPDATE
                                """,
                                str(qr_reservation_id),
                            )
                            if not reservation:
                                from repositories.errors import NotFoundError
                                raise NotFoundError("QR reservation not found or already linked.")

                            # 2. Resolve alias_code from category, generate asset tag inside TX
                            row = await conn.fetchrow(
                                "SELECT alias_code FROM asset_categories WHERE id = $1::uuid",
                                category_id,
                            )
                            alias_code = row["alias_code"] if row and row["alias_code"] else None
                            if not alias_code:
                                raise ValidationError(f"Category {category_id} has no alias_code mapping.")
                            generated_tag = await conn.fetchval("SELECT fn_next_asset_tag($1)", alias_code)

                            # 3. Insert asset with source='qr_scan' + qr_reservation_id FK
                            asset = await AssetWriteRepository.create_asset(
                                asset_tag=generated_tag,
                                category_id=category_id,
                                manufacturer_id=manufacturer_id,
                                location_id=location_id,
                                model=payload.get("model"),
                                serial_number=payload["serial_number"],
                                status=payload.get("status"),
                                purchase_date=payload.get("purchase_date"),
                                warranty_expiry=payload.get("warranty_expiry"),
                                custom_fields=payload.get("custom_fields"),
                                metadata=payload.get("metadata"),
                                qr_code=payload.get("qr_code"),
                                created_by_employee_id=actor.id,
                                source="qr_scan",
                                qr_reservation_id=str(qr_reservation_id),
                                department_id=payload.get("department_id"),
                                conn=conn,
                            )

                            # 4. Link reservation — writes asset_tag + asset_id, status → linked
                            await QrRepository.link_reservation_in_tx(
                                conn=conn,
                                reservation_id=str(qr_reservation_id),
                                asset_tag=generated_tag,
                                asset_id=asset["id"],
                            )

                            # 5. Audit — asset created
                            await audit_service.write_asset_event(
                                asset_id=asset["id"],
                                event_type=AssetEventType.ASSET_CREATED,
                                actor=actor,
                                payload={
                                    "asset_tag": asset["asset_tag"],
                                    "category_id": category_id,
                                    "source": "qr_scan",
                                    "qr_reservation_id": str(qr_reservation_id),
                                },
                                ip_address=ip_address,
                                user_agent=user_agent,
                                conn=conn,
                            )

                            # 6. Audit — QR reservation linked
                            await audit_service.write_asset_event(
                                asset_id=asset["id"],
                                event_type=AssetEventType.QR_RESERVATION_LINKED,
                                actor=actor,
                                payload={
                                    "qr_reservation_id": str(qr_reservation_id),
                                    "asset_tag": asset["asset_tag"],
                                },
                                ip_address=ip_address,
                                user_agent=user_agent,
                                conn=conn,
                            )

                            # 7. Audit log entry
                            await audit_service.write_asset_log(
                                asset_id=asset["id"],
                                actor=actor,
                                note=payload.get("log_note") or "Asset created via QR scan.",
                                metadata={"op": "asset.create", "source": "qr_scan"},
                                conn=conn,
                            )

                            return asset
                except asyncpg.UniqueViolationError:
                    if _attempt == 2:
                        raise
                    continue

        # ─────────────────────────────────────────────────────────────
        # PATH B — Direct form submit
        # ─────────────────────────────────────────────────────────────
        asset_tag = (payload.get("asset_tag") or "").strip()
        asset: dict[str, Any] | None = None
        for _attempt in range(3):
            if not asset_tag:
                async with pool().acquire() as conn:
                    row = await conn.fetchrow("SELECT alias_code FROM asset_categories WHERE id = $1::uuid", category_id)
                    alias_code = row["alias_code"] if row and row["alias_code"] else None
                    if not alias_code:
                        raise ValidationError(f"Category {category_id} has no alias_code mapping.")
                    asset_tag = await conn.fetchval("SELECT fn_next_asset_tag($1);", alias_code)
            try:
                asset = await AssetWriteRepository.create_asset(
                    asset_tag=asset_tag,
                    category_id=category_id,
                    manufacturer_id=manufacturer_id,
                    location_id=location_id,
                    model=payload.get("model"),
                    serial_number=payload["serial_number"],
                    status=payload.get("status"),
                    purchase_date=payload.get("purchase_date"),
                    warranty_expiry=payload.get("warranty_expiry"),
                    custom_fields=payload.get("custom_fields"),
                    metadata=payload.get("metadata"),
                    qr_code=payload.get("qr_code"),
                    created_by_employee_id=actor.id,
                    department_id=payload.get("department_id"),
                )
                break
            except asyncpg.UniqueViolationError:
                if _attempt == 2:
                    raise
                asset_tag = ""  # force tag regeneration on next attempt
                continue

        await audit_service.write_asset_event(
            asset_id=asset["id"],
            event_type=event_type,
            actor=actor,
            payload={
                "asset_tag": asset["asset_tag"],
                "category_id": category_id,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await audit_service.write_asset_log(
            asset_id=asset["id"],
            actor=actor,
            note=payload.get("log_note") or "Asset created manually.",
            metadata={"op": "asset.create"},
        )

        return asset


    @staticmethod
    async def bulk_insert_assets(
        *,
        rows: list[dict[str, Any]],
        actor: EmployeeContext,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> int:
        import logging
        logger = logging.getLogger(__name__)

        count = 0
        failed_rows: list[str] = []

        for i, row in enumerate(rows):
            try:
                await AssetService.create_asset(
                    payload=row,
                    actor=actor,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    event_type=AssetEventType.BULK_IMPORTED,
                )
                count += 1
            except Exception as exc:
                tag = row.get("asset_tag") or row.get("serial_number") or f"row {i + 1}"
                reason = str(exc)
                failed_rows.append(f"{tag}: {reason}")
                logger.error("[bulk_insert] Row failed — %s: %s", tag, exc, exc_info=True)

        return {"inserted": count, "failed_rows": failed_rows}


    @staticmethod
    async def assign_asset(
        *,
        asset_tag: str,
        employee_id: str,
        actor: EmployeeContext,
        notes: Optional[str] = None,
        assigned_at: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        """Assign asset by tag (delegates to AssignmentService for consistency)."""
        from services.assignment_service import assignment_service
        from datetime import datetime

        dt = None
        if assigned_at:
            try:
                dt = datetime.fromisoformat(assigned_at.replace("Z", "+00:00"))
            except ValueError:
                pass

        return await assignment_service.assign_asset(
            asset_tag=asset_tag,
            business_employee_id=employee_id,
            assigned_at=dt,
            notes=notes,
            source="runtime",
            actor=actor,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    @staticmethod
    async def return_asset(
        *,
        asset_tag: str,
        actor: EmployeeContext,
        notes: Optional[str] = None,
        returned_at: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        """Return asset by tag (delegates to AssignmentService for consistency)."""
        from services.assignment_service import assignment_service
        from datetime import datetime

        dt = None
        if returned_at:
            try:
                dt = datetime.fromisoformat(returned_at.replace("Z", "+00:00"))
            except ValueError:
                pass

        return await assignment_service.return_asset(
            asset_tag=asset_tag,
            returned_at=dt,
            notes=notes,
            source="runtime",
            actor=actor,
            ip_address=ip_address,
            user_agent=user_agent,
        )


asset_service = AssetService()

