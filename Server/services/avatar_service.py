from __future__ import annotations

import base64
import binascii
from typing import Any, Optional

from repositories.avatar_repository import AvatarRepository
from repositories.errors import ValidationError

AVATAR_MAX_BYTES = 50 * 1024
_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}


class AvatarTooLargeError(Exception):
    """Decoded image exceeds AVATAR_MAX_BYTES — maps to HTTP 413."""


def _sniff_mime(data: bytes) -> Optional[str]:
    """Detect the image type from magic bytes; None if not a supported image."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class AvatarService:
    @staticmethod
    async def get(employee_id: str) -> Optional[dict[str, Any]]:
        row = await AvatarRepository.get(employee_id)
        if not row:
            return None
        b64 = base64.b64encode(bytes(row["image_data"])).decode("ascii")
        updated = row.get("updated_at")
        return {
            "image_base64": b64,
            "mime_type": row["mime_type"],
            "updated_at": updated.isoformat() if updated is not None else None,
        }

    @staticmethod
    async def set(employee_id: str, image_base64: str, mime_type: str) -> int:
        """Validate + store an avatar. Returns the stored byte size."""
        mime = (mime_type or "").strip().lower()
        if mime not in _ALLOWED_MIME:
            raise ValidationError("Unsupported image type. Use PNG, JPEG, or WebP.")

        raw = (image_base64 or "").strip()
        if raw.startswith("data:"):  # tolerate a data: URI prefix
            comma = raw.find(",")
            if comma != -1:
                raw = raw[comma + 1 :]
        try:
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            raise ValidationError("Invalid image data.")

        if not data:
            raise ValidationError("Empty image.")
        if len(data) > AVATAR_MAX_BYTES:
            raise AvatarTooLargeError("Profile image must be 50 KB or smaller.")

        sniffed = _sniff_mime(data)
        if sniffed is None or sniffed != mime:
            raise ValidationError("Image content does not match the declared type.")

        await AvatarRepository.upsert(
            employee_id=employee_id, image_data=data, mime_type=mime, byte_size=len(data)
        )
        return len(data)

    @staticmethod
    async def delete(employee_id: str) -> bool:
        return await AvatarRepository.delete(employee_id)


avatar_service = AvatarService()
