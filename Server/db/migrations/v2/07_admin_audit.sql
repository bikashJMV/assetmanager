-- 07_admin_audit.sql
-- Admin privilege toggle workflow with immutable audit trail.
set search_path = public;
do $$ begin if not exists (
  select 1
  from pg_type
  where typname = 'admin_audit_action'
) then create type admin_audit_action as enum ('GRANT_ADMIN', 'REVOKE_ADMIN');
end if;
end $$;
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references employees(id) on delete restrict,
  target_user_id uuid not null references employees(id) on delete restrict,
  action admin_audit_action not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_admin_audit_log_admin_id on admin_audit_log(admin_id);
create index if not exists ix_admin_audit_log_target_user_id on admin_audit_log(target_user_id);
create index if not exists ix_admin_audit_log_created_at on admin_audit_log(created_at desc);
create or replace function fn_set_employee_admin_status(
    p_target_employee_id uuid,
    p_is_admin boolean,
    p_metadata jsonb default '{}'::jsonb
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_actor_employee_id uuid;
v_target_metadata jsonb;
v_target_role text;
v_target_is_active boolean;
v_current_admin_count integer := 0;
v_new_role text := case
  when p_is_admin then 'admin'
  else 'employee'
end;
v_action admin_audit_action := case
  when p_is_admin then 'GRANT_ADMIN'
  else 'REVOKE_ADMIN'
end;
begin if auth.uid() is null then return jsonb_build_object('ok', false, 'message', 'Not authenticated');
end if;
if not fn_is_admin() then return jsonb_build_object(
  'ok',
  false,
  'message',
  'Only admins can change admin privileges'
);
end if;
select e.id into v_actor_employee_id
from employees e
where e.auth_user_id = auth.uid()
limit 1;
if v_actor_employee_id is null then return jsonb_build_object(
  'ok',
  false,
  'message',
  'Actor employee profile not found'
);
end if;
select e.metadata,
  e.is_active into v_target_metadata,
  v_target_is_active
from employees e
where e.id = p_target_employee_id for
update;
if v_target_metadata is null then return jsonb_build_object(
  'ok',
  false,
  'message',
  'Target employee not found'
);
end if;
-- Critical guardrail: prevent self-modification to preserve control integrity.
if v_actor_employee_id = p_target_employee_id then return jsonb_build_object(
  'ok',
  false,
  'message',
  'You cannot change your own admin privileges'
);
end if;
v_target_role := lower(
  coalesce(v_target_metadata->>'role', 'employee')
);
if v_target_role = v_new_role then return jsonb_build_object(
  'ok',
  true,
  'message',
  'No role change needed',
  'role',
  v_new_role
);
end if;
-- Critical guardrail: prevent lockout by revoking the last active admin.
if p_is_admin = false
and v_target_role = 'admin'
and coalesce(v_target_is_active, false) then
select count(*) into v_current_admin_count
from employees e
where e.is_active = true
  and lower(coalesce(e.metadata->>'role', 'employee')) = 'admin';
if v_current_admin_count <= 1 then return jsonb_build_object(
  'ok',
  false,
  'message',
  'Cannot revoke admin from the last active admin user'
);
end if;
end if;
update employees
set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{role}',
    to_jsonb(v_new_role),
    true
  ),
  updated_at = now()
where id = p_target_employee_id;
insert into admin_audit_log (admin_id, target_user_id, action, metadata)
values (
    v_actor_employee_id,
    p_target_employee_id,
    v_action,
    jsonb_build_object(
      'source',
      'fn_set_employee_admin_status',
      'by_auth_uid',
      auth.uid()
    ) || coalesce(p_metadata, '{}'::jsonb)
  );
return jsonb_build_object(
  'ok',
  true,
  'message',
  'Admin role updated successfully',
  'role',
  v_new_role
);
end;
$$;
revoke all on function fn_set_employee_admin_status(uuid, boolean, jsonb)
from public;
grant execute on function fn_set_employee_admin_status(uuid, boolean, jsonb) to authenticated,
  service_role;
alter table admin_audit_log enable row level security;
drop policy if exists admin_audit_log_service_all on admin_audit_log;
create policy admin_audit_log_service_all on admin_audit_log for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists admin_audit_log_admin_read on admin_audit_log;
create policy admin_audit_log_admin_read on admin_audit_log for
select to authenticated using (fn_is_admin());