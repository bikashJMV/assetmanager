"""
Break-glass promotion of employees to admin or IT Ops by email.

Requires ROLE_BOOTSTRAP_SECRET and Supabase service role (SUPABASE_KEY).
Expects employees.email and employees.role on public.employees; service role bypasses RLS for updates.
"""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from core.auth import require_role_bootstrap_secret
from core.deps import get_db
from core.errors import handle_supabase_error

router = APIRouter(prefix="/internal", tags=["Internal"])


class BootstrapRoleBody(BaseModel):
    email: EmailStr
    role: Literal["admin", "it_ops"]


def _escape_ilike_exact(value: str) -> str:
    """Escape % and \\ for use as a literal pattern in PostgREST ilike."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.post(
    "/bootstrap-role",
    dependencies=[Depends(require_role_bootstrap_secret)],
    include_in_schema=False,
    response_model=dict[str, Any],
)
def bootstrap_employee_role(payload: BootstrapRoleBody, db=Depends(get_db)):
    """
    Set employees.role to admin or it_ops for the row matching email (case-insensitive).
    """
    email_raw = str(payload.email).strip()
    if not email_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email is required")

    pattern = _escape_ilike_exact(email_raw)

    try:
        found = (
            db.table("employees")
            .select("id,employee_id,email,role,is_active")
            .ilike("email", pattern)
            .limit(2)
            .execute()
        )
    except Exception as e:
        handle_supabase_error(e)

    rows = found.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Multiple employees match this email; resolve duplicates in the database.",
        )

    row = rows[0]
    if not row.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee is inactive; activate the record before promoting role.",
        )

    new_role = payload.role
    emp_id = row.get("id")
    if not emp_id:
        raise HTTPException(status_code=500, detail="Invalid employee record.")

    try:
        # postgrest-py: avoid update().select().eq() — some versions expose no .select on the update builder.
        db.table("employees").update({"role": new_role}).eq("id", emp_id).execute()
    except Exception as e:
        handle_supabase_error(e)

    out = {**row, "role": new_role}

    return {
        "ok": True,
        "message": "Role updated.",
        "employee": {
            "id": out.get("id"),
            "employee_id": out.get("employee_id"),
            "email": out.get("email"),
            "role": out.get("role"),
            "is_active": out.get("is_active"),
        },
    }
