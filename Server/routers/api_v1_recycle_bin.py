from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_privileged
from repositories.asset_repository import AssetRepository
from repositories.db import pool
from repositories.errors import NotFoundError, ValidationError
from services.asset_service import asset_service

router = APIRouter(prefix="/api/v1/recycle-bin", tags=["Recycle Bin (v1)"])


def _json_error(status_code: int, *, message: str, code: str, details: str | None = None) -> JSONResponse:
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


@router.get("")
async def list_recycle_bin(
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: List all entries in the recycle bin (deleted assets/employees).
    Method/Route: GET /api/v1/recycle-bin
    Response: 200 Guideline envelope `{data:[{...}]}`; Errors: 500 envelope.
    Notes: Privileged only.
    """
    try:
        rows = await AssetRepository.list_recycle_bin_entries()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Recycle bin entries retrieved successfully.",
                data=rows,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve recycle bin.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/{entry_id}/restore")
async def restore_recycle_bin_entry(
    entry_id: str,
    request: Request,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Restore a soft-deleted entity (asset or employee) from the recycle bin.
    Method/Route: POST /api/v1/recycle-bin/{entry_id}/restore
    Response: 200 Guideline envelope; Errors: 400/404/500 envelope.
    Notes: Privileged only.
    """
    try:
        from repositories.recycle_bin_repository import RecycleBinRepository
        entry = await RecycleBinRepository.get_entry(entry_id)
        if not entry:
            return _json_error(404, message="Recycle bin entry not found.", code="NOT_FOUND")

        entity_type = entry.get("entity_type")

        if entity_type == "asset":
            request_id = getattr(request.state, "request_id", None)
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")

            result = await asset_service.restore_asset(
                asset_id=entry["entity_id"],
                recycle_bin_id=entry_id,
                actor=employee,
                request_id=request_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=success_response(
                    message="Asset restored successfully.",
                    data=result,
                    status_code=200,
                ),
            )

        elif entity_type == "employee":
            from repositories.employee_repository import EmployeeRepository
            import json as _json
            raw_payload = entry["payload"]
            payload = _json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
            await EmployeeRepository.restore_from_payload(payload)
            await RecycleBinRepository.mark_restored(
                recycle_bin_id=entry_id,
                restored_by_employee_id=employee.id,
            )
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=success_response(
                    message="Employee restored successfully.",
                    data={"employee_id": entry["entity_id"], "recycle_bin_id": entry_id},
                    status_code=200,
                ),
            )

        else:
            return _json_error(400, message=f"Unsupported entity type: {entity_type}", code="UNSUPPORTED_ENTITY_TYPE")

    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except Exception as exc:
        return _json_error(500, message="Failed to restore entry.", code="INTERNAL_ERROR", details=str(exc))


@router.delete("/{entry_id}")
async def delete_recycle_bin_entry_permanent(
    entry_id: str,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Permanently delete an entity from the recycle bin (hard delete, transactional).
    Method/Route: DELETE /api/v1/recycle-bin/{entry_id}
    Response: 200 Guideline envelope; Errors: 404/500 envelope.
    Notes: Privileged only. Both the entity row and the recycle bin row are deleted atomically.
    """
    try:
        from repositories.recycle_bin_repository import RecycleBinRepository
        entry = await RecycleBinRepository.get_entry(entry_id)
        if not entry:
            return _json_error(404, message="Recycle bin entry not found.", code="NOT_FOUND")

        async with pool().acquire() as conn:
            async with conn.transaction():
                if entry["entity_type"] == "asset":
                    await conn.execute(
                        "DELETE FROM assets WHERE id = $1::uuid",
                        entry["entity_id"],
                    )
                elif entry["entity_type"] == "employee":
                    await conn.execute(
                        "DELETE FROM employees WHERE id = $1::uuid",
                        entry["entity_id"],
                    )

                await conn.execute(
                    "DELETE FROM recycle_bin_entries WHERE id = $1::uuid",
                    entry_id,
                )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Entry permanently deleted.",
                data={"entry_id": entry_id},
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to delete entry permanently.", code="INTERNAL_ERROR", details=str(exc))
