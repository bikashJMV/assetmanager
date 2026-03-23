import qrcode
import io
import base64
from core.settings import settings

class QRService:
    """
    Service for generating QR codes for asset scanning.
    """
    @staticmethod
    def generate_asset_qr(asset_id: str) -> str:
        """
        Generate a base64 encoded QR code for a given asset ID.
        Points to the frontend scan page.
        """
        qr_url = f"{settings.FRONTEND_URL}/scan/{asset_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return f"data:image/png;base64,{b64}"

# Single instance for use
qr_service = QRService()
