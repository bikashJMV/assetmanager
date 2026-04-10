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


def normalize_role_input(raw: Optional[str]) -> str:
    value = str(raw or 'employee').strip().lower()
    if value not in {'employee', 'admin', 'it_ops'}:
        raise HTTPException(status_code=400, detail='role must be employee, admin, or it_ops')
    return value


def normalize_employee_row(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get('metadata') or {}

    department_name = None
    department = row.get('department') or row.get('departments')
    if isinstance(department, list):
        department = department[0] if department else None
    if isinstance(department, dict):
        department_name = department.get('name')

    direct_role = row.get('role')
    role = direct_role if isinstance(direct_role, str) and direct_role.strip() else (metadata.get('role') if isinstance(metadata, dict) else None)
    normalized_role = normalize_role_input(role if isinstance(role, str) else 'employee')

    return {
        'id': row.get('id'),
        'employee_code': row.get('employee_code'),
        'name': row.get('name'),
        'email': row.get('email'),
        'department_id': row.get('department_id'),
        'department_name': department_name,
        'is_active': row.get('is_active', True),
        'role': normalized_role,
        'metadata': metadata if isinstance(metadata, dict) else {},
        'created_at': row.get('created_at'),
        'updated_at': row.get('updated_at'),
    }


def resolve_department_id(db, department_name: Optional[str]) -> Optional[str]:
    if not department_name:
        return None

    clean_name = department_name.strip()
    if not clean_name:
        return None

    db.table('departments').upsert({'name': clean_name}, on_conflict='name').execute()
    response = db.table('departments').select('id').eq('name', clean_name).limit(1).execute()
    if not response.data:
        return None
    return response.data[0]['id']


@router.get('', response_model=list[EmployeeOut])
def list_employees(
    search: Optional[str] = Query(None, description='Search by employee code, name, or email'),
    is_active: Optional[bool] = Query(None, description='Filter by ERP/HR active status'),
    db=Depends(get_db),
):
    try:
        query = db.table('employees').select(
            'id,employee_code,name,email,department_id,is_active,role,metadata,created_at,updated_at,department:departments(name)'
        ).order('name')

        if search:
            s = sanitize_search(search)
            query = query.or_(f'employee_code.ilike.%{s}%,name.ilike.%{s}%,email.ilike.%{s}%')

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
            'id,employee_code,name,email,department_id,is_active,role,metadata,created_at,updated_at,department:departments(name)'
        ).eq('email', normalized_email).limit(1).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail=f'Employee with email {normalized_email} not found')

        return normalize_employee_row(response.data[0])
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        handle_supabase_error(e)


@router.get('/{employee_code}', response_model=EmployeeOut)
def get_employee(employee_code: str, db=Depends(get_db)):
    try:
        response = db.table('employees').select(
            'id,employee_code,name,email,department_id,is_active,role,metadata,created_at,updated_at,department:departments(name)'
        ).eq('employee_code', employee_code).limit(1).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail=f'Employee {employee_code} not found')

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
        requested_role = normalize_role_input(payload.role)
        if requested_role != 'employee':
            raise HTTPException(status_code=403, detail='Privileged roles must be managed through audited role RPC.')
        metadata = dict(payload.metadata or {})
        metadata['role'] = requested_role

        department_id = str(payload.department_id) if payload.department_id else resolve_department_id(db, payload.department_name)

        upsert_data = {
            'employee_code': payload.employee_code.strip(),
            'name': payload.name.strip(),
            'email': payload.email.strip() if payload.email else None,
            'department_id': department_id,
            'is_active': payload.is_active,
            'role': requested_role,
            'metadata': metadata,
        }

        db.table('employees').upsert(upsert_data, on_conflict='employee_code').execute()

        fetch = db.table('employees').select(
            'id,employee_code,name,email,department_id,is_active,role,metadata,created_at,updated_at,department:departments(name)'
        ).eq('employee_code', payload.employee_code.strip()).limit(1).execute()

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


@router.put('/{employee_code}', response_model=EmployeeOut)
def update_employee(
    employee_code: str,
    payload: EmployeeUpdate,
    db=Depends(get_db),
    _=Depends(require_manage_platform_access),
):
    try:
        exists = db.table('employees').select('id,metadata,role').eq('employee_code', employee_code).limit(1).execute()
        if not exists.data:
            raise HTTPException(status_code=404, detail=f'Employee {employee_code} not found')

        current_metadata = exists.data[0].get('metadata') or {}
        update_data = payload.model_dump(exclude_unset=True, exclude_none=True)

        department_name = update_data.pop('department_name', None)
        if 'department_id' not in update_data and department_name is not None:
            update_data['department_id'] = resolve_department_id(db, department_name)
        elif 'department_id' in update_data:
            update_data['department_id'] = str(update_data['department_id'])

        role = update_data.pop('role', None)
        metadata = update_data.pop('metadata', None)

        if role is not None:
            requested_role = normalize_role_input(str(role))
            if requested_role != 'employee':
                raise HTTPException(status_code=403, detail='Privileged roles must be managed through audited role RPC.')
            update_data['role'] = requested_role

        merged_metadata = dict(current_metadata) if isinstance(current_metadata, dict) else {}
        if isinstance(metadata, dict):
            merged_metadata.update(metadata)
        if role is not None:
            merged_metadata['role'] = 'employee'

        if merged_metadata:
            update_data['metadata'] = merged_metadata

        if 'name' in update_data and isinstance(update_data['name'], str):
            update_data['name'] = update_data['name'].strip()
        if 'email' in update_data and isinstance(update_data['email'], str):
            update_data['email'] = update_data['email'].strip() or None

        if not update_data:
            raise HTTPException(status_code=400, detail='No updatable fields provided')

        db.table('employees').update(update_data).eq('employee_code', employee_code).execute()

        fetch = db.table('employees').select(
            'id,employee_code,name,email,department_id,is_active,role,metadata,created_at,updated_at,department:departments(name)'
        ).eq('employee_code', employee_code).limit(1).execute()

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
                'p_new_role': normalize_role_input(role),
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
