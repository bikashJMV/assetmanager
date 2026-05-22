"""Shared PDF rendering primitives — used by asset history and audit trail exports."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Image

from services.qr_service import qr_service

# ── Layout ────────────────────────────────────────────────────────────────────
PAGE_WIDTH, PAGE_HEIGHT = A4          # 595.28 × 841.89 pt
MARGIN_H: float = 36.0               # left & right margin
MARGIN_V: float = 36.0               # top & bottom margin
CONTENT_WIDTH: float = PAGE_WIDTH - 2 * MARGIN_H   # ~523.28 pt

# ── Brand ─────────────────────────────────────────────────────────────────────
BRAND_ORANGE = colors.HexColor("#f97316")
_PAGE_NUM_PREFIX = "ASM"

# ── Typography ────────────────────────────────────────────────────────────────
FONT_NORMAL = "Helvetica"
FONT_BOLD   = "Helvetica-Bold"
SIZE_TITLE  = 18
SIZE_META   = 10
SIZE_CELL   =  9
SIZE_PAGE_NUM = 9

# ── QR ───────────────────────────────────────────────────────────────────────
QR_SIZE: float = 24 * mm


def render_page_number(c: canvas.Canvas, page_num: int) -> None:
    """Draw 'ASM' (brand orange) + '/N' (black) bottom-right, 9 pt, no border."""
    suffix = f"/{page_num}"
    prefix_w = stringWidth(_PAGE_NUM_PREFIX, FONT_BOLD, SIZE_PAGE_NUM)
    suffix_w = stringWidth(suffix, FONT_BOLD, SIZE_PAGE_NUM)
    x = PAGE_WIDTH - MARGIN_H - prefix_w - suffix_w
    y = MARGIN_V / 2

    c.saveState()
    c.setFont(FONT_BOLD, SIZE_PAGE_NUM)
    c.setFillColor(BRAND_ORANGE)
    c.drawString(x, y, _PAGE_NUM_PREFIX)
    c.setFillColor(colors.black)
    c.drawString(x + prefix_w, y, suffix)
    c.restoreState()


def build_qr_image(asset_tag: str, size: float = QR_SIZE) -> Image | None:
    """Return a ReportLab Image flowable for the asset QR code, or None on failure."""
    if not asset_tag or asset_tag == "-":
        return None
    try:
        png_bytes = qr_service.generate_asset_qr_png_bytes(asset_tag)
        img = Image(BytesIO(png_bytes), width=size, height=size)
        img.hAlign = "RIGHT"
        return img
    except Exception:
        return None


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas: collects page states, then draws page number on save."""

    def __init__(self, *args: Any, asset_tag: str = "", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []
        self._asset_tag = str(asset_tag or "").strip()

    def showPage(self) -> None:  # noqa: N802 – ReportLab API name
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:  # noqa: A003 – ReportLab API name
        for page_num, state in enumerate(self._saved_page_states, start=1):
            self.__dict__.update(state)
            render_page_number(self, page_num)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)
