import re
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from core.auth import require_it_ops_access, require_manage_platform_access
from core.deps import get_db
from core.errors import handle_supabase_error
from schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate
from services.notifications.orchestrator import notify_user_created

router = APIRouter(prefix='/employees', tags=['Employees'])


def sanitize_search(query: str) -> str:
    return re.sub(r'[,()"]', '', query)


def normalize_employee_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': row.get('id'),
        'employee_id': row.get('employee_id'),
        'name': row.get('name'),
        'email': row.get('email'),
        'department': row.get('department'),
        'is_active': row.get('is_active', True),
        'role': row.get('role', 'employee'),
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
    }


@router.get('', response_model=list[EmployeeOut])
def list_employees(
    search: Optional[str] = Query(None, description='Search by employee ID, name, or email'),
    is_active: Optional[bool] = Query(None, description='Filter by active status'),
    db=Depends(get_db),
):
    try:
        query = db.table('employees').select(
            'id,employee_id,name,email,department,is_active,role,created_at,updated_at'
        ).order('name')

        if search:
            s = sanitize_search(search)
            query = query.or_(f'employee_id.ilike.%{s}%,name.ilike.%{s}%,email.ilike.%{s}%')

        if is_active is not None:
            query = query.eq('is_active', is_active)

        response = query.execute()
        return [normalize_employee_row(row) for row in (response.data or [])]
    except Exception as e:
        handle_supabase_error(e)


@router.get('/by-email', response_model=EmployeeOut)
def get_employee_by_email(
    email: str = Query(..., description='Employee email from authenticated session'),
    db=Depends(get_db),
):
    try:
        normalized_email = email.strip()
        if not normalized_email:
            raise HTTPException(status_code=400, detail='email is required')

        response = db.table('employees').select(
            'id,employee_id,name,email,department,is_active,role,created_at,updated_at'
        ).eq('email', normalized_email).limit(1).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail=f'Employee with email {normalized_email} not found')

        return normalize_employee_row(response.data[0])
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        handle_supabase_error(e)


@router.get('/{employee_id}', response_model=EmployeeOut)
def get_employee(employee_id: str, db=Depends(get_db)):
    try:
        response = db.table('employees').select(
            'id,employee_id,name,email,department,is_active,role,created_at,updated_at'
        ).eq('employee_id', employee_id).limit(1).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail=f'Employee {employee_id} not found')

        return normalize_employee_row(response.data[0])
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        handle_supabase_error(e)


@router.post('', response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    _=Depends(require_manage_platform_access),
):
    try:
        upsert_data = {
            'employee_id': payload.employee_id.strip(),
            'name': payload.name.strip(),
            'email': payload.email.strip() if payload.email else None,
            'department': payload.department,
            'is_active': payload.is_active,
            'role': payload.role if hasattr(payload, 'role') else 'employee',
        }

        db.table('employees').upsert(upsert_data, on_conflict='employee_id').execute()

        fetch = db.table('employees').select(
            'id,employee_id,name,email,department,is_active,role,created_at,updated_at'
        ).eq('employee_id', payload.employee_id.strip()).limit(1).execute()

        if not fetch.data:
            raise HTTPException(status_code=500, detail='Failed to create employee')

        created = normalize_employee_row(fetch.data[0])

        # Dispatch welcome email in background — fire-and-forget, never blocks response
        if created.get('email'):
            background_tasks.add_task(
                notify_user_created,
                recipient_email=created['email'],
                recipient_name=created['name'] or payload.name.strip(),
            )

        return created
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        handle_supabase_error(e)


@router.put('/{employee_id}', response_model=EmployeeOut)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db=Depends(get_db),
    _=Depends(require_manage_platform_access),
):
    try:
        exists = db.table('employees').select('id').eq('employee_id', employee_id).limit(1).execute()
        if not exists.data:
            raise HTTPException(status_code=404, detail=f'Employee {employee_id} not found')

        update_data = payload.model_dump(exclude_unset=True, exclude_none=True)

        if 'name' in update_data and isinstance(update_data['name'], str):
            update_data['name'] = update_data['name'].strip()
        if 'email' in update_data and isinstance(update_data['email'], str):
            update_data['email'] = update_data['email'].strip() or None

        if not update_data:
            raise HTTPException(status_code=400, detail='No updatable fields provided')

        db.table('employees').update(update_data).eq('employee_id', employee_id).execute()

        fetch = db.table('employees').select(
            'id,employee_id,name,email,department,is_active,role,created_at,updated_at'
        ).eq('employee_id', employee_id).limit(1).execute()

        if not fetch.data:
            raise HTTPException(status_code=500, detail='Failed to fetch updated employee')

        return normalize_employee_row(fetch.data[0])
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        handle_supabase_error(e)


@router.post('/{employee_id}/role', response_model=dict)
def set_employee_role(
    employee_id: str,
    role: str = Query(..., description='Role to set: employee | admin | it_ops'),
    db=Depends(get_db),
    _=Depends(require_it_ops_access),
):
    try:
        payload = db.rpc(
            'fn_set_employee_role',
            {
                'p_target_employee_id': employee_id,
                'p_new_role': role.lower(),
                'p_metadata': {'source': 'server.employees.set_employee_role'},
            },
        ).execute()
        data = payload.data[0] if isinstance(payload.data, list) and payload.data else payload.data
        if not isinstance(data, dict):
            raise HTTPException(status_code=500, detail='Unexpected role update response')
        if data.get('ok') is not True:
            raise HTTPException(status_code=400, detail=str(data.get('message') or 'Role update failed'))
        return data
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)
