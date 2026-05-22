from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services.pdf_shared import (
    CONTENT_WIDTH, MARGIN_H, MARGIN_V,
    FONT_BOLD, SIZE_TITLE, SIZE_META,
    BRAND_ORANGE, NumberedCanvas, QR_SIZE, build_qr_image,
)


# ── Audit-trail table column widths (must sum to CONTENT_WIDTH) ───────────────
_COL_SNO:     float = 30.0
_COL_TIME:    float = 82.0
_COL_ACTION:  float = 52.0
_COL_BY:      float = 88.0
_COL_FIELD:   float = 68.0
_COL_BEFORE:  float = 68.0
_COL_AFTER:   float = 68.0
_COL_DETAILS: float = (
    CONTENT_WIDTH
    - _COL_SNO - _COL_TIME - _COL_ACTION - _COL_BY
    - _COL_FIELD - _COL_BEFORE - _COL_AFTER
)

# Column indices
_IDX_SNO     = 0
_IDX_TIME    = 1
_IDX_ACTION  = 2
_IDX_BY      = 3
_IDX_FIELD   = 4
_IDX_BEFORE  = 5
_IDX_AFTER   = 6
_IDX_DETAILS = 7


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
    mapping = {
        "asset_created":  "Created",
        "asset_updated":  "Updated",
        "asset_deleted":  "Deleted",
        "asset_restored": "Restored",
        "asset_assigned": "Assigned",
        "asset_returned": "Returned",
        "qr_scanned":     "QR Scanned",
    }
    return mapping.get(normalized, str(event_type or "-") or "-")


def _format_time_date(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip()
        if not raw:
            return "-"
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return raw
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _format_actor(event: dict[str, Any]) -> str:
    name        = str(event.get("actor_name")            or "").strip()
    employee_id = str(event.get("actor_employee_id")     or "").strip()
    dept        = str(event.get("actor_department_name") or "").strip()

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
    asset_tag:  str
    category:   str
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
            rightMargin=MARGIN_H,
            leftMargin=MARGIN_H,
            topMargin=MARGIN_V,
            bottomMargin=MARGIN_V,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "AuditTrailTitle",
            parent=styles["Heading1"],
            fontSize=SIZE_TITLE,
            leading=SIZE_TITLE + 4,
            textColor=BRAND_ORANGE,
            spaceAfter=4,
        )
        sub_title_style = ParagraphStyle(
            "AuditTrailSubTitle",
            parent=styles["Normal"],
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceAfter=4,
        )
        meta_style = ParagraphStyle(
            "AuditTrailMeta",
            parent=styles["Normal"],
            fontSize=SIZE_META,
            leading=SIZE_META + 3,
            textColor=colors.HexColor("#374151"),
            spaceAfter=3,
        )
        cell_style = ParagraphStyle(
            "AuditTrailCell",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.black,
        )
        cell_muted = ParagraphStyle(
            "AuditTrailCellMuted",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#4B5563"),
        )

        story: list[Any] = []

        # ── Header: title/meta left, QR right ────────────────────────────────
        qr_img = build_qr_image(header.asset_tag, size=QR_SIZE)
        qr_col_w = QR_SIZE + 6 if qr_img else 0
        text_col_w = CONTENT_WIDTH - qr_col_w

        text_block: list[Any] = [
            Paragraph("Asset Manager / Audit Trail", title_style),
            Paragraph(
                f"Asset: {header.asset_name} / {header.asset_tag} / {header.category}",
                sub_title_style,
            ),
            Paragraph(f"Created by: {header.created_by}", meta_style),
            Paragraph(f"Created on: {header.generated_at}", meta_style),
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

        story.append(Spacer(1, 12))

        def _h(text: str) -> Paragraph:
            return Paragraph(f"<b>{text}</b>", cell_style)

        table_data: list[list[Any]] = [[
            _h("S No."), _h("Time / Date"), _h("Action"),
            _h("By"), _h("Field"), _h("Before"), _h("After"), _h("Details"),
        ]]

        if not lifecycle_events:
            table_data.append([
                Paragraph("1", cell_muted),
                Paragraph("-", cell_muted),
                Paragraph("-", cell_muted),
                Paragraph("-", cell_muted),
                Paragraph("—", cell_style),
                Paragraph("—", cell_muted),
                Paragraph("—", cell_muted),
                Paragraph("No audit trail events found for this asset.", cell_muted),
            ])
        else:
            serial = 1
            for event in lifecycle_events:
                when    = _format_time_date(event.get("created_at"))
                action  = _format_event_action(str(event.get("event_type") or ""))
                by      = _format_actor(event)
                details = AuditTrailPDFService._event_summary(event)

                for row_idx, row in enumerate(AuditTrailPDFService._event_table_rows(event)):
                    first = row_idx == 0
                    table_data.append([
                        Paragraph(str(serial),            cell_muted),
                        Paragraph(when    if first else "", cell_muted),
                        Paragraph(action  if first else "", cell_muted),
                        Paragraph(by      if first else "", cell_muted),
                        Paragraph(row.field_label,         cell_style),
                        Paragraph(row.before_value,        cell_muted),
                        Paragraph(row.after_value,         cell_muted),
                        Paragraph(details if first else "", cell_muted),
                    ])
                    serial += 1

        table = Table(
            table_data,
            colWidths=[
                _COL_SNO, _COL_TIME, _COL_ACTION, _COL_BY,
                _COL_FIELD, _COL_BEFORE, _COL_AFTER, _COL_DETAILS,
            ],
            repeatRows=1,
        )
        table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#F3F4F6")),
            ("FONTNAME",      (0, 0), (-1, 0),  FONT_BOLD),
            ("FONTSIZE",      (0, 0), (-1, 0),  9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, 0),  6),
            ("BOTTOMPADDING", (0, 0), (-1, 0),  6),
            ("TOPPADDING",    (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
            # Column alignment
            ("ALIGN", (_IDX_SNO,     0), (_IDX_SNO,     -1), "CENTER"),
            ("ALIGN", (_IDX_TIME,    0), (_IDX_TIME,    -1), "RIGHT"),
            ("ALIGN", (_IDX_ACTION,  0), (_IDX_ACTION,  -1), "CENTER"),
            ("ALIGN", (_IDX_BY,      0), (_IDX_BY,      -1), "LEFT"),
            ("ALIGN", (_IDX_FIELD,   0), (_IDX_FIELD,   -1), "LEFT"),
            ("ALIGN", (_IDX_BEFORE,  0), (_IDX_BEFORE,  -1), "LEFT"),
            ("ALIGN", (_IDX_AFTER,   0), (_IDX_AFTER,   -1), "LEFT"),
            ("ALIGN", (_IDX_DETAILS, 0), (_IDX_DETAILS, -1), "LEFT"),
        ]))
        story.append(table)

        doc.build(
            story,
            canvasmaker=lambda *a, **kw: NumberedCanvas(*a, asset_tag=header.asset_tag, **kw),
        )
        buffer.seek(0)
        return buffer.getvalue()

    @dataclass(frozen=True)
    class _ChangeRow:
        field_label:  str
        before_value: str
        after_value:  str

    @staticmethod
    def _event_table_rows(event: dict[str, Any]) -> list["AuditTrailPDFService._ChangeRow"]:
        _empty = [AuditTrailPDFService._ChangeRow(field_label="—", before_value="—", after_value="—")]
        if str(event.get("event_type") or "") != "asset_updated":
            return _empty
        payload     = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        raw_changes = payload.get("changes")
        if not isinstance(raw_changes, list):
            return _empty
        rows: list[AuditTrailPDFService._ChangeRow] = []
        for item in raw_changes:
            if not isinstance(item, dict):
                continue
            field = str(item.get("field") or "")
            if not field or (field.startswith("metadata.") and field != "metadata.notes"):
                continue
            truncated = item.get("truncated") is True
            rows.append(AuditTrailPDFService._ChangeRow(
                field_label  = str(item.get("label") or "").strip() or field,
                before_value = _format_change_value(item.get("before"), truncated=truncated),
                after_value  = _format_change_value(item.get("after"),  truncated=truncated),
            ))
        return rows or _empty

    @staticmethod
    def _event_summary(event: dict[str, Any]) -> str:
        payload    = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        asset_tag  = str(payload.get("asset_tag") or "").strip()
        event_type = str(event.get("event_type") or "")
        if event_type == "asset_created":
            cat = str(payload.get("category_slug") or "").strip()
            return (
                f"New asset {asset_tag} · category {cat}" if cat and asset_tag
                else f"New asset {asset_tag}" if asset_tag
                else "Asset created"
            )
        if event_type == "asset_updated":
            return f"Updated asset {asset_tag}" if asset_tag else "Asset details updated"
        if event_type == "asset_deleted":
            return f"Moved to recycle bin · {asset_tag}" if asset_tag else "Asset deleted"
        if event_type == "asset_restored":
            return f"Restored from recycle bin · {asset_tag}" if asset_tag else "Asset restored"
        if event_type == "asset_assigned":
            code      = str(payload.get("employee_id")          or "").strip()
            prev_code = str(payload.get("previous_employee_id") or "").strip()
            if code and prev_code:
                return f"Reassigned to employee {code} from {prev_code}"
            if code and asset_tag:
                return f"Assigned to employee {code} · asset {asset_tag}"
            return f"Assigned to employee {code}" if code else f"Assigned · {asset_tag}" if asset_tag else "Assigned to employee"
        if event_type == "asset_returned":
            return f"Returned / unassigned · {asset_tag}" if asset_tag else "Returned / unassigned"
        if event_type == "qr_scanned":
            return f"QR code scanned · {asset_tag}" if asset_tag else "QR code scanned (public)"
        return event_type or "-"


audit_trail_pdf_service = AuditTrailPDFService()
