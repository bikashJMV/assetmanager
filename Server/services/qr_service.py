import qrcode
import io
import base64
from core.settings import settings

class QRService:
    """
    Service for generating QR codes for asset scanning.
    """
    @staticmethod
    def build_asset_scan_url(asset_id: str) -> str:
        return f"{settings.FRONTEND_URL}/scan/{asset_id}"

    @staticmethod
    def generate_asset_qr_png_bytes(asset_id: str, *, box_size: int = 10, border: int = 4) -> bytes:
        qr_url = QRService.build_asset_scan_url(asset_id)
        qr = qrcode.QRCode(version=1, box_size=box_size, border=border)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        return buffered.getvalue()

    @staticmethod
    def generate_asset_qr(asset_id: str) -> str:
        """
        Generate a base64 encoded QR code for a given asset ID.
        Points to the frontend scan page.
        """
        b64 = base64.b64encode(QRService.generate_asset_qr_png_bytes(asset_id)).decode("utf-8")

        return f"data:image/png;base64,{b64}"

# Single instance for use
qr_service = QRService()
