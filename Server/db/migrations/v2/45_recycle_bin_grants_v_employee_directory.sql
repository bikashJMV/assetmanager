-- 45_recycle_bin_grants_v_employee_directory.sql
-- v_employee_directory uses security_invoker (migration 33): the NOT EXISTS subquery on
-- recycle_bin_entries runs with the caller's privileges. Without SELECT on recycle_bin_entries,
-- Postgres treats the subquery as seeing no rows, so NOT EXISTS stays true and soft-deleted
-- employees incorrectly remain visible in the directory.
set search_path = public;

grant select on table recycle_bin_entries to authenticated;
grant select on table recycle_bin_entries to service_role;

-- Re-affirm view definition (unchanged logic) after grant so deployments pick up a single file.
create or replace view v_employee_directory
with (security_invoker = true)
as
select
  e.id,
  e.employee_id,
  e.name,
  e.email,
  e.is_active,
  e.role,
  e.department
from employees e
where not exists (
  select 1
  from recycle_bin_entries r
  where r.entity_type = 'employee'
    and r.entity_id = e.id
    and r.restored_at is null
);

comment on view v_employee_directory is
  'Employees not in the Recycle Bin (open employee entries). security_invoker=true: RLS on '
  'employees applies; callers need SELECT on recycle_bin_entries so the exclusion subquery works.';

grant select on v_employee_directory to authenticated;
grant select on v_employee_directory to service_role;
