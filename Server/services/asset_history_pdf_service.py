from io import BytesIO
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from services.pdf_shared import (
    CONTENT_WIDTH, MARGIN_H, MARGIN_V,
    FONT_BOLD, SIZE_TITLE, SIZE_META,
    BRAND_ORANGE, NumberedCanvas, QR_SIZE, build_qr_image,
)

# ── Asset-details table column widths ─────────────────────────────────────────
_COL_DETAIL_LABEL: float = 130.0
_COL_DETAIL_VALUE: float = CONTENT_WIDTH - _COL_DETAIL_LABEL

# ── Assignment-history table column widths (must sum to CONTENT_WIDTH) ────────
_COL_HIST_SNO:      float = 30.0
_COL_HIST_EMP:      float = 145.0
_COL_HIST_EMPID:    float = 90.0
_COL_HIST_ASSIGNED: float = 110.0
_COL_HIST_RETURNED: float = CONTENT_WIDTH - _COL_HIST_SNO - _COL_HIST_EMP - _COL_HIST_EMPID - _COL_HIST_ASSIGNED

# Column indices in the assignment-history table
_IDX_HIST_SNO      = 0
_IDX_HIST_EMP      = 1
_IDX_HIST_EMPID    = 2
_IDX_HIST_ASSIGNED = 3
_IDX_HIST_RETURNED = 4


class AssetHistoryPDFService:
    """Builds print-ready PDF reports for asset assignment history."""

    @staticmethod
    def build_pdf(asset: dict, assignments: list[dict], lifecycle_events: list[dict]) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=MARGIN_H,
            leftMargin=MARGIN_H,
            topMargin=MARGIN_V,
            bottomMargin=MARGIN_V,
        )
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "HistoryTitle",
            parent=styles["Heading1"],
            fontSize=SIZE_TITLE,
            leading=SIZE_TITLE + 4,
            textColor=BRAND_ORANGE,
            spaceAfter=4,
        )
        meta_style = ParagraphStyle(
            "HistoryMeta",
            parent=styles["Normal"],
            fontSize=SIZE_META,
            leading=SIZE_META + 3,
            textColor=colors.HexColor("#374151"),
            spaceAfter=3,
        )
        cell_style = ParagraphStyle(
            "HistoryCell",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
        )

        asset_name = f"{asset.get('manufacturer_name') or ''} {asset.get('model') or ''}".strip() or "-"
        asset_tag  = str(asset.get("asset_tag") or "-")
        category   = str(asset.get("category_name") or "-")
        generated_at = datetime.utcnow().strftime("%Y-%m-%d")

        story = []

        # ── Header: title/meta left, QR right ────────────────────────────────
        qr_img = build_qr_image(asset_tag, size=QR_SIZE)
        qr_col_w = QR_SIZE + 6 if qr_img else 0
        text_col_w = CONTENT_WIDTH - qr_col_w

        text_block: list = [
            Paragraph("Asset Manager / Asset History", title_style),
            Paragraph(f"Created On: {generated_at}", meta_style),
        ]

        if qr_img:
            header_table = Table(
                [[text_block, qr_img]],
                colWidths=[text_col_w, qr_col_w],
            )
            header_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN",  (1, 0), (1,  0),  "RIGHT"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING",   (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
            ]))
            story.append(header_table)
        else:
            for item in text_block:
                story.append(item)

        story.append(Spacer(1, 16))

        # ── Asset Details block ───────────────────────────────────────────────
        story.append(Paragraph("Asset Details", styles["Heading2"]))

        def _cell(text: str) -> Paragraph:
            return Paragraph(str(text), cell_style)

        detail_rows = [
            [_cell("<b>Asset Tag</b>"),      _cell(str(asset.get("asset_tag")          or "-"))],
            [_cell("<b>Category</b>"),        _cell(str(asset.get("category_name")      or "-"))],
            [_cell("<b>Manufacturer</b>"),    _cell(str(asset.get("manufacturer_name")  or "-"))],
            [_cell("<b>Model</b>"),           _cell(str(asset.get("model")              or "-"))],
            [_cell("<b>Serial Number</b>"),   _cell(str(asset.get("serial_number")      or "-"))],
            [_cell("<b>Location</b>"),        _cell(str(asset.get("location_name")      or "-"))],
        ]
        detail_table = Table(detail_rows, colWidths=[_COL_DETAIL_LABEL, _COL_DETAIL_VALUE])
        detail_table.setStyle(TableStyle([
            ("ALIGN",         (0, 0), (0, -1), "LEFT"),
            ("ALIGN",         (1, 0), (1, -1), "LEFT"),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(detail_table)
        story.append(Spacer(1, 20))

        # ── Assignment History table ──────────────────────────────────────────
        story.append(Paragraph("Assignment History", styles["Heading2"]))

        history_rows: list[list] = [
            [
                Paragraph("<b>S No.</b>",         cell_style),
                Paragraph("<b>Employee</b>",      cell_style),
                Paragraph("<b>Employee ID</b>",   cell_style),
                Paragraph("<b>Assigned At</b>",   cell_style),
                Paragraph("<b>Returned At</b>",   cell_style),
            ]
        ]
        for idx, entry in enumerate(assignments, start=1):
            emp         = entry.get("employee") or {}
            assigned_at = entry.get("assigned_at") or ""
            returned_at = entry.get("returned_at") or ""
            assigned_date = assigned_at[:10] if len(assigned_at) >= 10 else (assigned_at or "-")
            returned_date = returned_at[:10] if len(returned_at) >= 10 else (returned_at or "Not yet returned")
            history_rows.append([
                Paragraph(str(idx),                           cell_style),
                Paragraph(str(emp.get("name")        or "-"), cell_style),
                Paragraph(str(emp.get("employee_id") or "-"), cell_style),
                Paragraph(assigned_date,                      cell_style),
                Paragraph(returned_date,                      cell_style),
            ])

        history_table = Table(
            history_rows,
            colWidths=[
                _COL_HIST_SNO,
                _COL_HIST_EMP,
                _COL_HIST_EMPID,
                _COL_HIST_ASSIGNED,
                _COL_HIST_RETURNED,
            ],
        )
        history_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#F3F4F6")),
            ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
            ("FONTSIZE",      (0, 0), (-1, 0),  9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, 0),  6),
            ("BOTTOMPADDING", (0, 0), (-1, 0),  6),
            ("TOPPADDING",    (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
            ("ALIGN", (_IDX_HIST_SNO,      0), (_IDX_HIST_SNO,      -1), "CENTER"),
            ("ALIGN", (_IDX_HIST_EMP,      0), (_IDX_HIST_EMP,      -1), "LEFT"),
            ("ALIGN", (_IDX_HIST_EMPID,    0), (_IDX_HIST_EMPID,    -1), "LEFT"),
            ("ALIGN", (_IDX_HIST_ASSIGNED, 0), (_IDX_HIST_ASSIGNED, -1), "RIGHT"),
            ("ALIGN", (_IDX_HIST_RETURNED, 0), (_IDX_HIST_RETURNED, -1), "RIGHT"),
        ]))
        story.append(history_table)

        asset_tag_str = str(asset.get("asset_tag") or "").strip()
        doc.build(
            story,
            canvasmaker=lambda *a, **kw: NumberedCanvas(*a, asset_tag=asset_tag_str, **kw),
        )
        buffer.seek(0)
        return buffer.getvalue()


asset_history_pdf_service = AssetHistoryPDFService()
