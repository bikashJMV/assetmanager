from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from core.auth import get_auth_user_id_from_bearer, require_manage_platform_access
from core.deps import get_db
from core.errors import handle_supabase_error
from schemas.assignment import AssignAssetRequest, AssignmentRPCResult, ReturnAssetRequest
from services.notifications.orchestrator import notify_asset_assigned, notify_asset_returned

router = APIRouter(prefix="/assignments", tags=["Assignments"])


def _get_open_assignment_holder(db, asset_tag: str) -> dict | None:
    """
    Return {employee_id, name, email, asset_model, serial_number} for the
    currently open (unreturned) assignment of this asset, or None if unassigned.

    Called BEFORE fn_assign_asset so we can capture the previous holder for
    reassignment (A → B) notifications.
    """
    try:
        tag = (asset_tag or "").strip()
        if not tag:
            return None
        asset_resp = (
            db.table("assets")
            .select("id")
            .eq("asset_tag", tag)
            .limit(1)
            .execute()
        )
        asset_rows = asset_resp.data or []
        if not asset_rows:
            return None
        asset_id = asset_rows[0].get("id")
        if not asset_id:
            return None

        resp = (
            db.table("asset_assignments")
            .select(
                "id, employee:employees(employee_id, name, email, role),"
                " asset:assets(model, serial_number)"
            )
            .eq("asset_id", asset_id)
            .is_("returned_at", "null")
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        row = rows[0]
        emp = row.get("employee") or {}
        if isinstance(emp, list):
            emp = emp[0] if emp else {}
        asset_meta = row.get("asset") or {}
        if isinstance(asset_meta, list):
            asset_meta = asset_meta[0] if asset_meta else {}
        return {
            "employee_id": emp.get("employee_id", ""),
            "name": emp.get("name", ""),
            "email": emp.get("email") or "",
            "role": emp.get("role") or "employee",
            "asset_model": asset_meta.get("model") or "",
            "serial_number": asset_meta.get("serial_number") or "",
        }
    except Exception:
        # Non-fatal: if lookup fails we simply skip the previous-holder email.
        return None


def _get_asset_for_email(db, asset_tag: str) -> dict:
    """category_name, model, asset_tag for the email microservice asset_data block."""
    try:
        resp = (
            db.table("v_asset_inventory")
            .select("category_name, model, asset_tag")
            .eq("asset_tag", (asset_tag or "").strip())
            .limit(1)
            .execute()
        )
        row = (resp.data or [{}])[0]
        return {
            "category": row.get("category_name") or "",
            "model_no": row.get("model") or "",
            "asset_id": row.get("asset_tag") or (asset_tag or "").strip(),
        }
    except Exception:
        tag = (asset_tag or "").strip()
        return {"category": "", "model_no": "", "asset_id": tag}


def _get_employee_profile(db, employee_id: str) -> dict:
    """Return {name, email, role} for an employee_id (code)."""
    try:
        resp = (
            db.table("employees")
            .select("name, email, role")
            .eq("employee_id", employee_id.upper().strip())
            .limit(1)
            .execute()
        )
        row = (resp.data or [{}])[0]
        return {
            "name": row.get("name") or "",
            "email": row.get("email") or "",
            "role": row.get("role") or "employee",
        }
    except Exception:
        return {"name": "", "email": "", "role": "employee"}


def _get_actor_assigner(db, actor_auth_uid: str) -> dict:
    """Employee row for the JWT actor (assigner), or empty dict."""
    try:
        resp = (
            db.table("employees")
            .select("name, email")
            .eq("auth_user_id", actor_auth_uid)
            .limit(1)
            .execute()
        )
        row = (resp.data or [{}])[0]
        return {
            "name": row.get("name") or "",
            "email": row.get("email") or "",
        }
    except Exception:
        return {"name": "", "email": ""}


def _list_admin_cc_emails(db) -> list[str]:
    """
    Emails for CC: active employees with role admin or it_ops.
    """
    try:
        resp = (
            db.table("employees")
            .select("email")
            .eq("is_active", True)
            .in_("role", ["admin", "it_ops"])
            .execute()
        )
        out: list[str] = []
        seen: set[str] = set()
        for row in resp.data or []:
            raw = (row.get("email") or "").strip()
            if not raw:
                continue
            key = raw.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(raw)
        return out
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/assign", response_model=AssignmentRPCResult, status_code=status.HTTP_200_OK)
def assign_asset(
    payload: AssignAssetRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    actor_auth_uid: str = Depends(get_auth_user_id_from_bearer),
    _=Depends(require_manage_platform_access),
):
    """
    Runtime assignment flow via DB RPC fn_assign_asset.

    Notification logic:
      - Standard assign (was unassigned): asset.assigned → new holder
      - Reassign (A → B): asset.returned → A, then asset.assigned → B
    """
    try:
        # ── 1. Capture previous holder BEFORE the RPC mutates state ──────────
        previous_holder = _get_open_assignment_holder(db, payload.asset_tag)

        # ── 2. Execute domain operation ───────────────────────────────────────
        response = db.rpc(
            "fn_assign_asset",
            {
                "p_asset_tag": payload.asset_tag,
                "p_employee_id": payload.employee_id,
                "p_assigned_at": payload.assigned_at.isoformat() if payload.assigned_at else None,
                "p_source": payload.source,
                "p_notes": payload.notes,
                # Service-role client has no JWT in Postgres; pass actor for lifecycle audit BY column.
                "p_actor_auth_uid": actor_auth_uid,
            },
        ).execute()

        data = response.data or {}
        if not data or data.get("ok") is not True:
            message = (data or {}).get("message", "Assignment failed")
            raise HTTPException(status_code=400, detail=message)

        # ── 3. Fetch contacts + asset row for structured email payload ─────────
        new_holder = _get_employee_profile(db, payload.employee_id)
        asset_email = _get_asset_for_email(db, payload.asset_tag)
        assigner = _get_actor_assigner(db, actor_auth_uid)
        admin_cc = _list_admin_cc_emails(db)

        # ── 4. Schedule notification(s) as background tasks ──────────────────
        is_reassign = (
            previous_holder is not None
            and previous_holder.get("employee_id", "").upper()
            != payload.employee_id.upper().strip()
        )

        if is_reassign and previous_holder:
            # Fire returned email to old holder FIRST (order matters per plan)
            background_tasks.add_task(
                notify_asset_returned,
                primary_email=previous_holder["email"],
                primary_name=previous_holder["name"],
                primary_role=previous_holder.get("role"),
                admin_email=assigner["email"],
                admin_name=assigner["name"],
                all_admin_emails=admin_cc,
                asset_category=asset_email["category"],
                model_no=asset_email["model_no"],
                asset_id=asset_email["asset_id"],
            )

        # Always fire assigned email (structured body → email microservice)
        background_tasks.add_task(
            notify_asset_assigned,
            primary_email=new_holder["email"],
            primary_name=new_holder["name"],
            primary_role=new_holder.get("role"),
            admin_email=assigner["email"],
            admin_name=assigner["name"],
            all_admin_emails=admin_cc,
            asset_category=asset_email["category"],
            model_no=asset_email["model_no"],
            asset_id=asset_email["asset_id"],
            previous_employee_email=previous_holder["email"] if is_reassign and previous_holder else None,
            new_employee_email=new_holder["email"] if is_reassign else None,
        )

        return data
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.post("/return", response_model=AssignmentRPCResult, status_code=status.HTTP_200_OK)
def return_asset(
    payload: ReturnAssetRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    actor_auth_uid: str = Depends(get_auth_user_id_from_bearer),
    _=Depends(require_manage_platform_access),
):
    """
    Runtime return flow via DB RPC fn_return_asset.

    Notification logic:
      - asset.returned → the employee who held the asset
    """
    try:
        # ── 1. Capture holder BEFORE the RPC closes the assignment ────────────
        previous_holder = _get_open_assignment_holder(db, payload.asset_tag)

        # ── 2. Execute domain operation ───────────────────────────────────────
        response = db.rpc(
            "fn_return_asset",
            {
                "p_asset_tag": payload.asset_tag,
                "p_returned_at": payload.returned_at.isoformat() if payload.returned_at else None,
                "p_source": payload.source,
                "p_notes": payload.notes,
                "p_actor_auth_uid": actor_auth_uid,
            },
        ).execute()

        data = response.data or {}
        if not data or data.get("ok") is not True:
            message = (data or {}).get("message", "Return failed")
            raise HTTPException(status_code=400, detail=message)

        # ── 3. Schedule returned notification ─────────────────────────────────
        if previous_holder:
            asset_email = _get_asset_for_email(db, payload.asset_tag)
            assigner = _get_actor_assigner(db, actor_auth_uid)
            admin_cc = _list_admin_cc_emails(db)
            background_tasks.add_task(
                notify_asset_returned,
                primary_email=previous_holder["email"],
                primary_name=previous_holder["name"],
                primary_role=previous_holder.get("role"),
                admin_email=assigner["email"],
                admin_name=assigner["name"],
                all_admin_emails=admin_cc,
                asset_category=asset_email["category"],
                model_no=asset_email["model_no"],
                asset_id=asset_email["asset_id"],
            )

        return data
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)
