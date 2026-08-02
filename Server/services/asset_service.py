from __future__ import annotations

import re
from typing import Any, Optional

from core.asset_db_types import AssetDateCoercionError, normalize_asset_date_fields_inplace
from core.authnexus import EmployeeContext
from repositories.asset_write_repository import AssetWriteRepository
from repositories.errors import ValidationError
from services.audit_service import AssetEventType, audit_service


class AssetService:
    """
    Business logic for assets (mutations).

    Confirmed responsibilities:
    - Audit trail written here (asset_logs, asset_events).
    - Hook-ready (email/webhook triggers later without router changes).
    """

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
        # PATH A — QR scan-to-log (atomic TX: consume reservation + insert asset)
        # ─────────────────────────────────────────────────────────────
        if qr_reservation_id:
            async with pool().acquire() as conn:
                async with conn.transaction():
                    # 1. Atomically consume reservation (throws if already consumed/missing)
                    reservation = await QrRepository.consume_reservation_in_tx(
                        conn=conn,
                        reservation_id=str(qr_reservation_id),
                    )
                    
                    # 2. Use the reserved tag (override any client-supplied tag)
                    reserved_tag = reservation["asset_tag"]
                    
                    # 3. Insert asset with source='qr_scan' + qr_reservation_id FK
                    asset = await AssetWriteRepository.create_asset(
                        asset_tag=reserved_tag,
                        category_id=category_id,
                        manufacturer_id=manufacturer_id,
                        location_id=location_id,
                        model=payload.get("model"),
                        serial_number=payload["serial_number"],
                        status=payload.get("status") or "in_stock",
                        purchase_date=payload.get("purchase_date"),
                        warranty_expiry=payload.get("warranty_expiry"),
                        custom_fields=payload.get("custom_fields"),
                        metadata=payload.get("metadata"),
                        qr_code=payload.get("qr_code"),
                        created_by_employee_id=actor.id,
                        source="qr_scan",
                        qr_reservation_id=str(qr_reservation_id),
                        conn=conn,
                    )
                    
                    # 4. Update reservation's consumed_by_asset_id to actual asset id
                    await conn.execute(
                        """
                        update qr_tag_reservations
                           set consumed_by_asset_id = $2::uuid
                         where id = $1::uuid
                        """,
                        str(qr_reservation_id),
                        asset["id"],
                    )
                    
                    # 5. Audit — asset created (same event as Path B)
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
                    
                    # 6. Audit — reservation consumed (Path A specific event)
                    await audit_service.write_asset_event(
                        asset_id=asset["id"],
                        event_type=AssetEventType.QR_RESERVATION_CONSUMED,
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

        # ─────────────────────────────────────────────────────────────
        # PATH B — Direct form submit (EXISTING FLOW, BYTE-IDENTICAL)
        # ─────────────────────────────────────────────────────────────
        manual_tag = (payload.get("asset_tag") or "").strip()
        if manual_tag and re.search(r"-0{4,}$", manual_tag):
            raise ValidationError("Asset tag sequence cannot be all zeros.")
        asset_tag = manual_tag or await _AR.get_next_asset_tag(category_id)

        asset = await AssetWriteRepository.create_asset(
            asset_tag=asset_tag,
            category_id=category_id,
            manufacturer_id=manufacturer_id,
            location_id=location_id,
            model=payload.get("model"),
            serial_number=payload["serial_number"],
            status=payload.get("status") or "in_stock",
            purchase_date=payload.get("purchase_date"),
            warranty_expiry=payload.get("warranty_expiry"),
            custom_fields=payload.get("custom_fields"),
            metadata=payload.get("metadata"),
            qr_code=payload.get("qr_code"),
            created_by_employee_id=actor.id,
            # source defaults to 'direct' in repo; explicit for clarity
        )

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

        for row in rows:
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
                tag = row.get("asset_tag") or row.get("serial_number") or "unknown"
                failed_rows.append(f"{tag}: {exc}")
                logger.error("[bulk_insert] Row failed — %s: %s", tag, exc, exc_info=True)

        if count == 0 and failed_rows:
            # All rows failed — surface the first real error to the router
            raise ValidationError(
                f"All {len(failed_rows)} row(s) failed. First error: {failed_rows[0]}"
            )

        return count


asset_service = AssetService()

