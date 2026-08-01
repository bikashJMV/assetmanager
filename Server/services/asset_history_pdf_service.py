from io import BytesIO
from typing import Any

# reportlab ships no type stubs and types-reportlab is not a dependency here.
from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.lib.units import mm  # type: ignore[import-untyped]
from reportlab.lib.utils import ImageReader  # type: ignore[import-untyped]
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle  # type: ignore[import-untyped]
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore[import-untyped]
from datetime import datetime

from core.pdf_footer import FooterCanvas  # type: ignore[import-not-found]
from services.qr_service import qr_service  # type: ignore[import-not-found]

class AssetHistoryPDFService:
    """Builds print-ready PDF reports for asset assignment history."""
    
    @staticmethod
    def build_pdf(
        asset: dict[str, Any],
        assignments: list[dict[str, Any]],
        lifecycle_events: list[dict[str, Any]],
    ) -> bytes:
        buffer = BytesIO()
        # Margins are 0.5 inch (36 points)
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            rightMargin=36, 
            leftMargin=36, 
            topMargin=36, 
            bottomMargin=36
        )
        story = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading1'],
            fontSize=20,
            leading=24,
            textColor=colors.HexColor('#2563EB'), # Accent color
            spaceAfter=15
        )
        asset_name = f"{asset.get('manufacturer_name') or ''} {asset.get('model') or ''}".strip() or "-"
        asset_tag = asset.get('asset_tag') or "-"
        category = asset.get('category_name') or "-"
        heading_text = f"Asset history ({asset_name}/{asset_tag}/{category})"
        story.append(Paragraph(heading_text, title_style))
        story.append(Paragraph(f"Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Asset Info
        story.append(Paragraph("Asset Details", styles['Heading2']))
        asset_data = [
            [Paragraph("<b>Asset Tag:</b>", styles['Normal']), Paragraph(str(asset.get('asset_tag') or '-'), styles['Normal'])],
            [Paragraph("<b>Category:</b>", styles['Normal']), Paragraph(str(asset.get('category_name') or '-'), styles['Normal'])],
            [Paragraph("<b>Manufacturer:</b>", styles['Normal']), Paragraph(str(asset.get('manufacturer_name') or '-'), styles['Normal'])],
            [Paragraph("<b>Model:</b>", styles['Normal']), Paragraph(str(asset.get('model') or '-'), styles['Normal'])],
            [Paragraph("<b>Serial Number:</b>", styles['Normal']), Paragraph(str(asset.get('serial_number') or '-'), styles['Normal'])],
            [Paragraph("<b>Status:</b>", styles['Normal']), Paragraph(str(asset.get('status') or '-'), styles['Normal'])],
            [Paragraph("<b>Location:</b>", styles['Normal']), Paragraph(str(asset.get('location_name') or '-'), styles['Normal'])],
        ]
        t = Table(asset_data, colWidths=[120, 400])
        t.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))
        
        # Assignment History
        story.append(Paragraph("Assignment History", styles['Heading2']))
        history_data = [["S.No.", "Employee", "Employee ID", "Assigned At", "Returned At"]]
        for index, entry in enumerate(assignments, start=1):
            emp = entry.get('employee') or {}
            assigned_at = entry.get('assigned_at')
            returned_at = entry.get('returned_at')
            
            # Keep date only (first 10 chars assuming YYYY-MM-DD format)
            assigned_date = assigned_at[:10] if assigned_at and len(assigned_at) >= 10 else (assigned_at or '-')
            returned_date = returned_at[:10] if returned_at and len(returned_at) >= 10 else (returned_at or 'Not yet returned')
            
            history_data.append([
                Paragraph(str(index), styles['Normal']),
                Paragraph(str(emp.get('name') or '-'), styles['Normal']),
                Paragraph(str(emp.get('employee_id') or '-'), styles['Normal']),
                Paragraph(str(assigned_date), styles['Normal']),
                Paragraph(str(returned_date), styles['Normal'])
            ])
            
        t_history = Table(history_data, colWidths=[36, 124, 86, 150, 124])
        t_history.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F3F4F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.black),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 10),
            ('BOTTOMPADDING', (0,0), (-1,0), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,1), (-1,-1), 4),
            ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ]))
        story.append(t_history)

            
        asset_tag = str(asset.get('asset_tag') or '').strip()
        doc.build(story, canvasmaker=lambda *args, **kwargs: _NumberedCanvas(*args, asset_tag=asset_tag, **kwargs))
        buffer.seek(0)
        return buffer.getvalue()

asset_history_pdf_service = AssetHistoryPDFService()


class _NumberedCanvas(FooterCanvas):  # type: ignore[misc]  # base resolves to Any under per-file mypy
    """Standard AMS footer (see core.pdf_footer) plus the per-page asset QR."""

    QR_SIZE = 24 * mm

    def __init__(self, *args: Any, asset_tag: str = "", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._asset_tag = str(asset_tag or "").strip()

    def draw_page_decorations(self, total_pages: int) -> None:
        self._draw_qr()
        super().draw_page_decorations(total_pages)

    def _draw_qr(self) -> None:
        tag = self._asset_tag
        if not tag or tag == "-":
            return
        try:
            png_bytes = qr_service.generate_asset_qr_png_bytes(tag)
            image = ImageReader(BytesIO(png_bytes))
        except Exception:
            return

        page_width, page_height = A4
        x = page_width - 36 - self.QR_SIZE
        y = page_height - 36 - self.QR_SIZE
        self.saveState()
        self.drawImage(image, x, y, self.QR_SIZE, self.QR_SIZE, preserveAspectRatio=True, mask="auto")
        self.restoreState()
