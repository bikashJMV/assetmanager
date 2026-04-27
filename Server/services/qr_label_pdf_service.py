from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from services.qr_service import qr_service


class QRLabelPDFService:
    """Builds print-ready QR label PDFs for assets."""

    file_name = "Asset manager QRs.pdf"
    label_size = 24 * mm
    page_margin_x = 10 * mm
    page_margin_y = 10 * mm
    label_gap = 1.5 * mm
    qr_box_size = 19.4 * mm
    qr_box_padding = 0.7 * mm
    text_gap = 0.2 * mm
    text_bottom_padding = 0.7 * mm
    outer_border_width = 0.35
    inner_border_width = 0.3
    max_font_size = 7.5
    min_font_size = 5.0

    def build_empty_notice_pdf(self, title: str, body: str) -> bytes:
        """Single-page PDF when there are no labels to print (empty selection or nothing printable)."""
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
        pdf.setTitle("Asset Manager — Export notice")
        page_width, page_height = A4
        self._draw_header(pdf, page_width, page_height)

        margin_x = self.page_margin_x
        max_text_width = page_width - (2 * margin_x)
        y = page_height - self.page_margin_y - 28 * mm

        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawCentredString(page_width / 2.0, y, title)
        y -= 12 * mm

        pdf.setFont("Helvetica", 11)
        for line in self._wrap_paragraph(body, "Helvetica", 11, max_text_width):
            if y < self.page_margin_y + 24 * mm:
                break
            pdf.drawString(margin_x, y, line)
            y -= 5 * mm

        pdf.save()
        return buffer.getvalue()

    def _wrap_paragraph(self, text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
        words = text.split()
        if not words:
            return [text] if text.strip() else [""]
        lines: list[str] = []
        current: list[str] = []
        for word in words:
            trial = " ".join(current + [word])
            if stringWidth(trial, font_name, font_size) <= max_width:
                current.append(word)
            else:
                if current:
                    lines.append(" ".join(current))
                current = [word]
        if current:
            lines.append(" ".join(current))

        out: list[str] = []
        for line in lines:
            if stringWidth(line, font_name, font_size) <= max_width:
                out.append(line)
                continue
            chunk = ""
            for ch in line:
                trial = chunk + ch
                if stringWidth(trial, font_name, font_size) <= max_width:
                    chunk = trial
                else:
                    if chunk:
                        out.append(chunk)
                    chunk = ch
            if chunk:
                out.append(chunk)
        return out if out else [text[:120]]

    def build_pdf(self, asset_tags: list[str]) -> bytes:
        cleaned_tags = [tag.strip() for tag in asset_tags if isinstance(tag, str) and tag.strip()]
        if not cleaned_tags:
            raise ValueError("At least one asset tag is required to export QR labels.")

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
        pdf.setTitle("Asset Manager QRs")
        page_width, page_height = A4
        header_height = 15 * mm
        available_height = page_height - (2 * self.page_margin_y) - header_height
        
        columns = max(
            1,
            int((page_width - (2 * self.page_margin_x) + self.label_gap) // (self.label_size + self.label_gap)),
        )
        rows = max(
            1,
            int((available_height + self.label_gap) // (self.label_size + self.label_gap)),
        )
        labels_per_page = columns * rows

        self._draw_header(pdf, page_width, page_height)

        for index, asset_tag in enumerate(cleaned_tags):
            if index > 0 and index % labels_per_page == 0:
                pdf.showPage()
                self._draw_header(pdf, page_width, page_height)

            page_index = index % labels_per_page
            row = page_index // columns
            column = page_index % columns

            x = self.page_margin_x + column * (self.label_size + self.label_gap)
            y = page_height - self.page_margin_y - header_height - self.label_size - row * (self.label_size + self.label_gap)
            self._draw_label(pdf, x, y, asset_tag)

        pdf.save()
        return buffer.getvalue()

    def _draw_header(self, pdf: canvas.Canvas, page_width: float, page_height: float) -> None:
        pdf.saveState()
        pdf.setFont("Helvetica-Bold", 16)
        pdf.setFillColorRGB(0, 0, 0)
        y = page_height - self.page_margin_y
        pdf.drawCentredString(page_width / 2.0, y - 5, "Asset Manager Directory — QR Codes")
        pdf.setLineWidth(1)
        pdf.line(self.page_margin_x, y - 10, page_width - self.page_margin_x, y - 10)
        pdf.restoreState()

    def _draw_label(self, pdf: canvas.Canvas, x: float, y: float, asset_tag: str) -> None:
        pdf.saveState()
        pdf.setStrokeColorRGB(0, 0, 0)
        pdf.setFillColorRGB(1, 1, 1)
        pdf.setLineWidth(self.outer_border_width)
        pdf.rect(x, y, self.label_size, self.label_size, stroke=1, fill=1)

        qr_box_x = x + ((self.label_size - self.qr_box_size) / 2)
        qr_box_y = y + self.text_bottom_padding + self._tag_area_height() + self.text_gap

        qr_size = self.qr_box_size - (2 * self.qr_box_padding)
        qr_image = ImageReader(BytesIO(qr_service.generate_asset_qr_png_bytes(asset_tag)))
        pdf.drawImage(
            qr_image,
            qr_box_x + self.qr_box_padding,
            qr_box_y + self.qr_box_padding,
            qr_size,
            qr_size,
            preserveAspectRatio=True,
            mask="auto",
        )

        pdf.setFillColorRGB(0, 0, 0)
        font_size = self._fit_font_size(asset_tag, self.label_size - (1.2 * mm))
        pdf.setFont("Helvetica-Bold", font_size)
        text_y = y + self.text_bottom_padding
        pdf.drawCentredString(x + (self.label_size / 2), text_y, asset_tag)
        pdf.restoreState()

    def _fit_font_size(self, asset_tag: str, max_width: float) -> float:
        """
        Largest font size (in points) that fits asset_tag within max_width.
        Both max_width and stringWidth() use ReportLab points.
        """
        font_size = self.max_font_size
        while font_size > self.min_font_size:
            width = stringWidth(asset_tag, "Helvetica-Bold", font_size)
            if width <= max_width:
                return font_size
            font_size -= 0.2
        return self.min_font_size

    def _tag_area_height(self) -> float:
        """Height reserved for the asset tag text line, in ReportLab points (via mm)."""
        return 3.5 * mm


qr_label_pdf_service = QRLabelPDFService()
