-- 47_recycle_bin_entries_rls_and_idempotent_soft_delete_employee.sql
-- Fixes two production issues:
--  (1) If recycle_bin_entries has RLS enabled (e.g. Supabase default) without a SELECT policy,
--      authenticated users cannot see bin rows in subqueries. Then v_employee_directory's
--      NOT EXISTS (migration 33/45) never matches → soft-deleted employees stay on All Employees.
--  (2) fn_soft_delete_employee could insert duplicate open bin rows for the same employee.

set search_path = public;

-- ---------------------------------------------------------------------------
-- A) RLS: allow authenticated SELECT so v_employee_directory exclusion works
-- ---------------------------------------------------------------------------
alter table public.recycle_bin_entries enable row level security;

drop policy if exists recycle_bin_entries_authenticated_select on public.recycle_bin_entries;

create policy recycle_bin_entries_authenticated_select
  on public.recycle_bin_entries
  for select
  to authenticated
  using (true);

comment on policy recycle_bin_entries_authenticated_select on public.recycle_bin_entries is
  'Lets callers evaluate NOT EXISTS in v_employee_directory; pair with GRANT from migration 45.';

-- service_role bypasses RLS on Supabase; no policy needed for inserts via security definer RPCs.

-- ---------------------------------------------------------------------------
-- B) Idempotent soft-delete (no duplicate open bin entries)
-- ---------------------------------------------------------------------------
create or replace function fn_soft_delete_employee(
  p_employee_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_employee employees%rowtype;
  v_entry_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Not authenticated');
  end if;

  if not fn_is_admin_or_it_ops() then
    return jsonb_build_object('ok', false, 'message', 'Admin or IT Ops role required');
  end if;

  select e.id into v_actor_id
  from employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
  limit 1;

  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'message', 'Actor employee profile not found');
  end if;

  select * into v_employee
  from employees e
  where e.id = p_employee_id
  for update;

  if v_employee.id is null then
    return jsonb_build_object('ok', false, 'message', 'Employee not found');
  end if;

  if v_employee.id = v_actor_id then
    return jsonb_build_object('ok', false, 'message', 'You cannot delete your own profile');
  end if;

  if exists (
    select 1
    from recycle_bin_entries r
    where r.entity_type = 'employee'
      and r.entity_id = v_employee.id
      and r.restored_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'message', 'Employee is already in the Recycle Bin'
    );
  end if;

  update employees
  set is_active = false,
      updated_at = now()
  where id = v_employee.id;

  insert into recycle_bin_entries (
    entity_type,
    entity_id,
    label,
    payload,
    deleted_by_employee_id
  ) values (
    'employee',
    v_employee.id,
    coalesce(v_employee.employee_id, 'Employee'),
    jsonb_build_object(
      'employee_id', v_employee.employee_id,
      'name', v_employee.name,
      'email', v_employee.email,
      'note', nullif(trim(coalesce(p_note, '')), '')
    ),
    v_actor_id
  )
  returning id into v_entry_id;

  return jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'message', 'Employee moved to recycle bin');
end;
$$;

revoke all on function fn_soft_delete_employee(uuid, text) from public;
grant execute on function fn_soft_delete_employee(uuid, text) to authenticated, service_role;
