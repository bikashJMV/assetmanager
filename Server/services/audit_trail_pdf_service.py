from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services.qr_service import qr_service


def _is_plain_object(value: Any) -> bool:
    return value is not None and isinstance(value, dict)


def _format_structured_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or "—"
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "[]" if not value else str(value)
    if _is_plain_object(value):
        code = str(value.get("code") or "").strip()
        name = str(value.get("name") or "").strip()
        ident = str(value.get("id") or "").strip()
        if code or name:
            return " · ".join([part for part in [name, code] if part])
        if ident:
            return ident
        return str(value)
    return str(value)


def _format_change_value(value: Any, truncated: bool = False) -> str:
    base = _format_structured_value(value)
    if truncated and base != "—":
        return f"{base} (truncated)"
    return base


def _format_event_action(event_type: str) -> str:
    normalized = str(event_type or "").strip().lower()
    if normalized == "asset_created":
        return "Created"
    if normalized == "asset_updated":
        return "Updated"
    if normalized == "asset_deleted":
        return "Deleted"
    if normalized == "asset_restored":
        return "Restored"
    if normalized == "asset_assigned":
        return "Assigned"
    if normalized == "asset_returned":
        return "Returned"
    if normalized == "qr_scanned":
        return "QR Scanned"
    return str(event_type or "-") or "-"

def _format_time_date(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip()
        if not raw:
            return "-"
        dt = None
        # Most common API shapes: ISO-8601 with/without timezone, and `...Z`
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            dt = None
        if dt is None:
            return raw

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def _format_actor(event: dict[str, Any]) -> str:
    name = str(event.get("actor_name") or "").strip()
    employee_id = str(event.get("actor_employee_id") or "").strip()
    dept = str(event.get("actor_department_name") or "").strip()

    if name or employee_id:
        head = name or "—"
        if employee_id:
            head = f"{head} · {employee_id}"
        if dept:
            head = f"{head} · {dept}"
        return head

    actor_id = str(event.get("actor_id") or "").strip()
    if actor_id:
        ref = f"{actor_id[:8]}…" if len(actor_id) > 10 else actor_id
        return f"Unknown user · Auth ref {ref}"

    return "System / public"


@dataclass(frozen=True)
class AuditTrailPdfAssetHeader:
    asset_name: str
    asset_tag: str
    category: str
    created_by: str
    generated_at: str


class AuditTrailPDFService:
    file_name_prefix = "Audit Trail"

    @staticmethod
    def build_pdf(*, header: AuditTrailPdfAssetHeader, lifecycle_events: list[dict[str, Any]]) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "AuditTrailTitle",
            parent=styles["Heading1"],
            fontSize=18,
            leading=22,
            textColor=colors.black,
            spaceAfter=10,
        )
        meta_style = ParagraphStyle(
            "AuditTrailMeta",
            parent=styles["Normal"],
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#374151"),
            spaceAfter=6,
        )
        cell_style = ParagraphStyle(
            "AuditTrailCell",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.black,
        )
        cell_muted_style = ParagraphStyle(
            "AuditTrailCellMuted",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#4B5563"),
        )

        header_title = f"Audit Trail ({header.asset_name}/{header.asset_tag}/{header.category})"

        story: list[Any] = []

        story.append(Paragraph(header_title, title_style))
        story.append(Paragraph(f"Created by {header.created_by}", meta_style))
        story.append(Paragraph(f"Generated on {header.generated_at}", meta_style))
        story.append(Spacer(1, 10))

        table_data: list[list[Any]] = []
        table_data.append(
            [
                Paragraph("<b>S.No.</b>", cell_style),
                Paragraph("<b>Time/Date</b>", cell_style),
                Paragraph("<b>Action</b>", cell_style),
                Paragraph("<b>By</b>", cell_style),
                Paragraph("<b>Field</b>", cell_style),
                Paragraph("<b>Before</b>", cell_style),
                Paragraph("<b>After</b>", cell_style),
                Paragraph("<b>Details</b>", cell_style),
            ]
        )

        if not lifecycle_events:
            table_data.append(
                [
                    Paragraph("1", cell_muted_style),
                    Paragraph("-", cell_muted_style),
                    Paragraph("-", cell_muted_style),
                    Paragraph("-", cell_muted_style),
                    Paragraph("—", cell_style),
                    Paragraph("—", cell_muted_style),
                    Paragraph("—", cell_muted_style),
                    Paragraph("No audit trail events found for this asset.", cell_muted_style),
                ]
            )
        else:
            serial = 1
            for event in lifecycle_events:
                when = _format_time_date(event.get("created_at"))
                action = _format_event_action(str(event.get("event_type") or ""))
                by = _format_actor(event)
                details = AuditTrailPDFService._event_summary(event)

                rows = AuditTrailPDFService._event_table_rows(event)
                for row_index, row in enumerate(rows):
                    is_first = row_index == 0
                    table_data.append(
                        [
                            Paragraph(str(serial), cell_muted_style),
                            Paragraph(when if is_first else "", cell_muted_style),
                            Paragraph(action if is_first else "", cell_muted_style),
                            Paragraph(by if is_first else "", cell_muted_style),
                            Paragraph(row.field_label, cell_style),
                            Paragraph(row.before_value, cell_muted_style),
                            Paragraph(row.after_value, cell_muted_style),
                            Paragraph(details if is_first else "", cell_muted_style),
                        ]
                    )
                    serial += 1

        table = Table(
            table_data,
            colWidths=[30, 86, 52, 86, 68, 70, 70, 92],
            repeatRows=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, 0), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                    ("TOPPADDING", (0, 1), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ]
            )
        )
        story.append(table)

        doc.build(story, canvasmaker=lambda *args, **kwargs: _NumberedCanvas(*args, asset_tag=header.asset_tag, **kwargs))
        buffer.seek(0)
        return buffer.getvalue()

    @dataclass(frozen=True)
    class _ChangeRow:
        field_label: str
        before_value: str
        after_value: str

    @staticmethod
    def _event_table_rows(event: dict[str, Any]) -> list["_ChangeRow"]:
        event_type = str(event.get("event_type") or "")
        if event_type != "asset_updated":
            return [AuditTrailPDFService._ChangeRow(field_label="—", before_value="—", after_value="—")]

        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        raw_changes = payload.get("changes")
        if not isinstance(raw_changes, list):
            return [AuditTrailPDFService._ChangeRow(field_label="—", before_value="—", after_value="—")]

        rows: list[AuditTrailPDFService._ChangeRow] = []
        for item in raw_changes:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or "")
            if not field:
                continue
            if field.startswith("metadata.") and field != "metadata.notes":
                continue
            label = str(item.get("label") or "").strip() or field
            truncated = item.get("truncated") is True
            before_val = _format_change_value(item.get("before"), truncated=truncated)
            after_val = _format_change_value(item.get("after"), truncated=truncated)
            rows.append(AuditTrailPDFService._ChangeRow(field_label=label, before_value=before_val, after_value=after_val))

        return rows or [AuditTrailPDFService._ChangeRow(field_label="—", before_value="—", after_value="—")]

    @staticmethod
    def _event_summary(event: dict[str, Any]) -> str:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        asset_tag = str(payload.get("asset_tag") or "").strip()
        event_type = str(event.get("event_type") or "")
        if event_type == "asset_created":
            cat = str(payload.get("category_slug") or "").strip()
            if cat and asset_tag:
                return f"New asset {asset_tag} · category {cat}"
            if asset_tag:
                return f"New asset {asset_tag}"
            return "Asset created"
        if event_type == "asset_updated":
            return f"Updated asset {asset_tag}" if asset_tag else "Asset details updated"
        if event_type == "asset_deleted":
            return f"Moved to recycle bin · {asset_tag}" if asset_tag else "Asset deleted"
        if event_type == "asset_restored":
            return f"Restored from recycle bin · {asset_tag}" if asset_tag else "Asset restored"
        if event_type == "asset_assigned":
            code = str(payload.get("employee_id") or "").strip()
            prev_code = str(payload.get("previous_employee_id") or "").strip()
            if code and prev_code:
                return f"Reassigned to employee {code} from {prev_code}"
            if code and asset_tag:
                return f"Assigned to employee {code} · asset {asset_tag}"
            if code:
                return f"Assigned to employee {code}"
            return f"Assigned · {asset_tag}" if asset_tag else "Assigned to employee"
        if event_type == "asset_returned":
            return f"Returned / unassigned · {asset_tag}" if asset_tag else "Returned / unassigned"
        if event_type == "qr_scanned":
            return f"QR code scanned · {asset_tag}" if asset_tag else "QR code scanned (public)"
        return event_type or "-"


audit_trail_pdf_service = AuditTrailPDFService()


class _NumberedCanvas(canvas.Canvas):
    """
    Canvas that renders "Page X of Y" in the footer.
    Uses a two-pass approach by storing page states, then writing totals on save.
    """

    QR_SIZE = 24 * mm

    def __init__(self, *args: Any, asset_tag: str = "", **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []
        self._asset_tag = str(asset_tag or "").strip()

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:  # noqa: A003 - ReportLab API
        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(total_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _draw_page_number(self, total_pages: int) -> None:
        self._draw_qr()

        page_num = self.getPageNumber()
        label = f"Page {page_num} of {total_pages}"
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#6B7280"))
        width, _height = A4
        self.drawRightString(width - 36, 18, label)
        self.restoreState()

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
