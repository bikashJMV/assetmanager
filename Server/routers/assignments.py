from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import get_db
from core.errors import handle_supabase_error
from schemas.assignment import AssignAssetRequest, AssignmentRPCResult, ReturnAssetRequest

router = APIRouter(prefix="/assignments", tags=["Assignments"])


@router.post("/assign", response_model=AssignmentRPCResult, status_code=status.HTTP_200_OK)
def assign_asset(payload: AssignAssetRequest, db=Depends(get_db)):
    """
    Runtime assignment flow must go through DB RPC `fn_assign_asset`.
    Business rules are centralized in SQL for DRY/KISS consistency.
    """
    try:
        response = db.rpc(
            "fn_assign_asset",
            {
                "p_asset_tag": payload.asset_tag,
                "p_employee_code": payload.employee_code,
                "p_assigned_at": payload.assigned_at.isoformat() if payload.assigned_at else None,
                "p_source": payload.source,
                "p_notes": payload.notes,
            },
        ).execute()

        data = response.data or {}
        if not data or data.get("ok") is not True:
            message = (data or {}).get("message", "Assignment failed")
            raise HTTPException(status_code=400, detail=message)

        return data
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.post("/return", response_model=AssignmentRPCResult, status_code=status.HTTP_200_OK)
def return_asset(payload: ReturnAssetRequest, db=Depends(get_db)):
    """
    Runtime return flow must go through DB RPC `fn_return_asset`.
    Business rules are centralized in SQL for DRY/KISS consistency.
    """
    try:
        response = db.rpc(
            "fn_return_asset",
            {
                "p_asset_tag": payload.asset_tag,
                "p_returned_at": payload.returned_at.isoformat() if payload.returned_at else None,
                "p_source": payload.source,
                "p_notes": payload.notes,
            },
        ).execute()

        data = response.data or {}
        if not data or data.get("ok") is not True:
            message = (data or {}).get("message", "Return failed")
            raise HTTPException(status_code=400, detail=message)

        return data
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)
