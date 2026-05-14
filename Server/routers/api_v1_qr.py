from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import JSONResponse, Response
from core.authz import require_privileged
from core.authnexus import EmployeeContext
from services.qr_service import qr_service
from schemas.qr import QrBatchCreateInput
from services.qr_label_pdf_service import qr_label_pdf_service
from core.api_response import success_response, error_response
from repositories.errors import ValidationError, NotFoundError

router = APIRouter(prefix="/api/v1/qr", tags=["QR (v1)"])


def _json_error(status_code: int, *, message: str, code: str, details: str | None = None) -> JSONResponse:
    """Helper to return standardized error responses."""
    return JSONResponse(
        status_code=status_code,
        content=error_response(
            status_code=status_code,
            message=message,
            error_code=code,
            details=details or message,
            data=None,
        ),
    )


@router.post("/batches", status_code=status.HTTP_201_CREATED)
async def create_qr_batch(
    input_data: QrBatchCreateInput,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Create a new batch of QR reservations.
    Method/Route: POST /api/v1/qr/batches
    Request: Body with count, Header with Idempotency-Key.
    Response: 201 envelope with batch + reservations.
    Notes: Privileged only (Admin or IT Ops).
    """
    try:
        batch = await qr_service.create_qr_batch(
            count=input_data.count,
            idempotency_key=idempotency_key,
            actor=employee,
        )
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=success_response(
                message="QR batch created successfully.",
                data=batch,
                status_code=201,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to create QR batch.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/batches")
async def list_qr_batches(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: List QR batches.
    Method/Route: GET /api/v1/qr/batches
    Query: page, limit.
    Response: 200 envelope with paginated list.
    Notes: Privileged only.
    """
    try:
        rows, total = await qr_service.list_batches(page, limit)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="QR batches retrieved successfully.",
                data={
                    "items": rows,
                    "page": page,
                    "limit": limit,
                    "count": len(rows),
                    "total": total,
                },
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to list QR batches.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/batches/{batch_id}")
async def get_qr_batch(
    batch_id: str,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Get details of a specific QR batch.
    Method/Route: GET /api/v1/qr/batches/{batch_id}
    Response: 200 envelope with batch + reservations.
    Notes: Privileged only.
    """
    try:
        batch = await qr_service.get_batch_detail(batch_id)
        if not batch:
            return _json_error(404, message="QR batch not found.", code="NOT_FOUND")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="QR batch details retrieved successfully.",
                data=batch,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to get QR batch details.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/batches/{batch_id}/pdf")
async def download_qr_batch_pdf(
    batch_id: str,
    employee: EmployeeContext = Depends(require_privileged),
) -> Response:
    """
    Purpose: Download a printable PDF of QR labels for a specific batch.
    Method/Route: GET /api/v1/qr/batches/{batch_id}/pdf
    Response: 200 application/pdf
    Notes: Privileged only.
    """
    batch = await qr_service.get_batch_detail(batch_id)
    if not batch:
        return _json_error(404, message="QR batch not found.", code="NOT_FOUND")

    reservations = batch.get("reservations", [])
    tags = [res["asset_tag"] for res in reservations if res.get("asset_tag")]

    empty_notice_headers = {
        "Content-Disposition": f'inline; filename="{qr_label_pdf_service.file_name}"',
        "Cache-Control": "no-store",
        "X-Export-Empty": "1",
        "X-Exported-Asset-Count": "0",
    }

    if not tags:
        pdf_bytes = qr_label_pdf_service.build_empty_notice_pdf(
            "No tags to export",
            "This batch does not contain any valid QR tags.",
        )
        return Response(content=pdf_bytes, media_type="application/pdf", headers=empty_notice_headers)

    batch_code = batch.get("batch_code", "Unknown")
    filename = f"Batch {batch_code} QRs.pdf"

    pdf_bytes = qr_label_pdf_service.build_pdf(tags, title="Bulk QR Generated / Ready to Use")
    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Exported-Asset-Count": str(len(tags)),
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
