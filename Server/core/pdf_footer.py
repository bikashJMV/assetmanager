"""Standard footer for every PDF the app generates.

One convention, one implementation: a right-aligned ``AMS / Page X of Y`` on every
page, with ``AMS`` in the brand accent and the page counter in neutral grey. The
total page count is only knowable after the whole document is laid out, so
``FooterCanvas`` buffers page state and stamps the footer in a second pass.

Position is a fixed offset from the page edge (not the document's own margins) so
the footer lands in the same spot across report PDFs and the QR label sheet, which
use different margins.
"""
from __future__ import annotations

from typing import Any

# reportlab ships no type stubs and types-reportlab is not a dependency here.
from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.pdfbase import pdfmetrics  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

BRAND_LABEL = "AMS"
SEPARATOR = " / "
FOOTER_FONT = "Helvetica"
FOOTER_FONT_SIZE = 9
# App icon blue — hsl(217, 91%, 53%), the --primary token and the favicon gradient start.
BRAND_COLOR = colors.HexColor("#1A6EF4")
COUNTER_COLOR = colors.HexColor("#6B7280")
RIGHT_EDGE_OFFSET = 36
BOTTOM_EDGE_OFFSET = 18


def page_label(page_number: int, total_pages: int) -> str:
    """'Page 3 of 12' — the neutral-coloured half of the footer."""
    return f"Page {page_number} of {total_pages}"


def footer_text(page_number: int, total_pages: int) -> str:
    """Full footer string, for tests and any single-colour consumer."""
    return f"{BRAND_LABEL}{SEPARATOR}{page_label(page_number, total_pages)}"


def draw_footer(pdf: Any, page_number: int, total_pages: int, page_size: tuple[float, float] = A4) -> None:
    """Stamp the footer on the current page, right-aligned at the bottom edge.

    Drawn as two runs so the brand and the counter can differ in colour: the
    counter is placed against the right edge, then the brand is right-aligned
    against the counter's measured left edge.
    """
    width, _height = page_size
    tail = f"{SEPARATOR}{page_label(page_number, total_pages)}"
    tail_width = pdfmetrics.stringWidth(tail, FOOTER_FONT, FOOTER_FONT_SIZE)
    right = width - RIGHT_EDGE_OFFSET

    pdf.saveState()
    pdf.setFont(FOOTER_FONT, FOOTER_FONT_SIZE)
    pdf.setFillColor(COUNTER_COLOR)
    pdf.drawRightString(right, BOTTOM_EDGE_OFFSET, tail)
    pdf.setFillColor(BRAND_COLOR)
    pdf.drawRightString(right - tail_width, BOTTOM_EDGE_OFFSET, BRAND_LABEL)
    pdf.restoreState()


class FooterCanvas(canvas.Canvas):  # type: ignore[misc]  # untyped reportlab base class
    """Canvas that stamps the standard footer on every page.

    Two-pass: ``showPage`` buffers the page instead of emitting it, so ``save``
    knows the real total before drawing any footer. Works for platypus documents
    (the template calls ``showPage`` per page) and for hand-drawn canvases (the
    trailing page is flushed in ``save``).
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:  # noqa: A003 - ReportLab API
        # Hand-drawn canvases call save() straight after the last label without a
        # closing showPage; buffer that page too, or it would lose its footer.
        if self._code:
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(total_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, total_pages: int) -> None:
        """Per-page overlay. Subclasses add their own marks, then call super()."""
        draw_footer(self, self.getPageNumber(), total_pages, self._pagesize)
