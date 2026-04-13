-- 29_employee_directory_view.sql
-- Directory list: employees not currently in the Recycle Bin (open employee entries only).
set search_path = public;

create or replace view v_employee_directory as
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
  'Employees visible in the main directory; excludes rows with an open Recycle Bin entry.';

grant select on v_employee_directory to authenticated;
grant select on v_employee_directory to service_role;
