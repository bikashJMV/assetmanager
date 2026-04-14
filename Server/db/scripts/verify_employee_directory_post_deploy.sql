-- verify_employee_directory_post_deploy.sql
-- Post-deploy checks for: soft-deleted employees hidden from v_employee_directory (migrations 33 + 45 + 47).
-- Run in Supabase SQL Editor (or psql) as a role that can read catalog + public schema.
-- Replace placeholders in section 4 after a controlled soft-delete test.

set search_path = public;

-- 1) Table privileges: authenticated + service_role must have SELECT on recycle_bin_entries
--    (migration 45). Empty result here means NOT EXISTS in v_employee_directory cannot see bin rows.
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'recycle_bin_entries'
  and grantee in ('authenticated', 'service_role')
order by grantee, privilege_type;

-- 1b) RLS + policies on recycle_bin_entries (migration 47). If rls_enabled is true, policy_name must be set.
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  pol.polname as policy_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy pol on pol.polrelid = c.oid
where n.nspname = 'public'
  and c.relname = 'recycle_bin_entries';

-- 2) View exists
select schemaname, viewname
from pg_views
where schemaname = 'public'
  and viewname = 'v_employee_directory';

-- 3) Quick count sanity (adjust if you expect zero employees)
select count(*)::bigint as directory_row_count from v_employee_directory;

-- 4) Spot-check after soft-delete (replace UUIDs):
--    a) Find an open employee bin row from a test delete:
-- select id, entity_type, entity_id, restored_at from recycle_bin_entries
-- where entity_type = 'employee' and restored_at is null limit 5;
--
--    b) For a given entity_id from (a), directory must NOT list that employee:
-- select id, employee_id, name from v_employee_directory where id = '<entity_id>'::uuid;
--    Expected: 0 rows.
--
--    c) Inactive but NOT in bin: pick employees.is_active = false with no open employee bin row;
--       that id SHOULD still appear in v_employee_directory (if RLS allows your session to see the row).
