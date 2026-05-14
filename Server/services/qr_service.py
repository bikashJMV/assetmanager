from __future__ import annotations

import logging
from io import BytesIO
from typing import Any, Optional

import qrcode

from repositories.qr_repository import QrRepository
from repositories.errors import ValidationError
from core.authnexus import EmployeeContext

logger = logging.getLogger(__name__)


class QrService:
    """
    Business logic for QR batches and reservations.
    Handles validation, idempotency checks, and logging.
    """

    def generate_asset_qr_png_bytes(self, asset_tag: str) -> bytes:
        """
        Generate a PNG QR code image for an asset tag.
        The QR code encodes the public scan URL: {FRONTEND_URL}/scan/{asset_tag}.
        Returns raw PNG bytes suitable for embedding in a PDF.
        """
        from core.settings import settings

        base_url = (settings.FRONTEND_URL or "").rstrip("/")
        scan_url = f"{base_url}/scan/{asset_tag}"

        qr = qrcode.QRCode(
            version=None,          # auto-size
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=1,
        )
        qr.add_data(scan_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buf = BytesIO()
        # Get underlying PIL Image, convert from 1-bit (mode "1") to grayscale
        # to avoid Pillow PNG format warnings for bilevel images.
        # Pass format as positional arg to avoid keyword-arg deprecation notices.
        pil_img = img._img if hasattr(img, "_img") else img
        pil_img.convert("L").save(buf, "PNG")
        buf.seek(0)
        return buf.getvalue()

    async def create_qr_batch(
        self, count: int, idempotency_key: str, actor: EmployeeContext
    ) -> dict[str, Any]:
        """
        Validate and create a new QR batch.
        Log structured fields on new creation.
        """
        # 1. Validate
        if count < 1 or count > 1000:
            raise ValidationError("Count must be between 1 and 1000.")
        if not idempotency_key or not idempotency_key.strip():
            raise ValidationError("Idempotency key is required.")

        # 2. Check if batch exists by idempotency_key (for decision logic)
        existing = await QrRepository.get_batch_by_idempotency_key(idempotency_key)

        # 3. Call create_batch_atomic (handles both new + idempotent replay)
        batch = await QrRepository.create_batch_atomic(
            idempotency_key=idempotency_key,
            count=count,
            created_by_employee_id=actor.id,
        )

        # Ensure reservations are included (if replay didn't include them)
        if "reservations" not in batch:
            reservations = await QrRepository.list_reservations_for_batch(str(batch["id"]))
            batch["reservations"] = reservations

        # 4 & 5. If new (existing was None)
        if not existing:
            # Decision Matrix: asset_id is NOT nullable, so we use logger only.
            logger.info(
                "QR batch generated",
                extra={
                    "batch_id": str(batch["id"]),
                    "batch_code": batch["batch_code"],
                    "count": count,
                    "actor_employee_id": actor.id,
                },
            )

        return batch

    async def get_batch_detail(self, batch_id: str) -> Optional[dict[str, Any]]:
        """Fetch single batch with reservations."""
        batch = await QrRepository.get_batch_by_id(batch_id)
        if not batch:
            return None
            
        reservations = await QrRepository.list_reservations_for_batch(batch_id)
        batch["reservations"] = reservations
        return batch

    async def list_batches(self, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
        """Paginated list of batches."""
        return await QrRepository.list_batches(page, limit)


qr_service = QrService()
