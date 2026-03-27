-- 04_rls_policies.sql
-- Row level security policies for AMS

set search_path = public;

alter table departments enable row level security;
alter table manufacturers enable row level security;
alter table locations enable row level security;
alter table asset_categories enable row level security;
alter table employees enable row level security;
alter table assets enable row level security;
alter table custom_field_definitions enable row level security;
alter table asset_components enable row level security;
alter table asset_assignments enable row level security;
alter table asset_logs enable row level security;

-- Role helper: admin is derived from the signed-in employee row metadata.role
-- where auth_user_id links auth.users -> public.employees.
create or replace function fn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from employees e
    where e.auth_user_id = auth.uid()
      and e.is_active = true
      and lower(coalesce(e.metadata ->> 'role', 'employee')) = 'admin'
  );
$$;

revoke all on function fn_is_admin() from public;
grant execute on function fn_is_admin() to authenticated, service_role;

-- Service role: full access on all business tables.
drop policy if exists departments_service_all on departments;
create policy departments_service_all on departments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists manufacturers_service_all on manufacturers;
create policy manufacturers_service_all on manufacturers
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists locations_service_all on locations;
create policy locations_service_all on locations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists asset_categories_service_all on asset_categories;
create policy asset_categories_service_all on asset_categories
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists employees_service_all on employees;
create policy employees_service_all on employees
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists assets_service_all on assets;
create policy assets_service_all on assets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists custom_field_definitions_service_all on custom_field_definitions;
create policy custom_field_definitions_service_all on custom_field_definitions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists asset_components_service_all on asset_components;
create policy asset_components_service_all on asset_components
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists asset_assignments_service_all on asset_assignments;
create policy asset_assignments_service_all on asset_assignments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists asset_logs_service_all on asset_logs;
create policy asset_logs_service_all on asset_logs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Authenticated reads for reference data.
drop policy if exists departments_authenticated_read on departments;
create policy departments_authenticated_read on departments
for select to authenticated
using (true);

drop policy if exists manufacturers_authenticated_read on manufacturers;
create policy manufacturers_authenticated_read on manufacturers
for select to authenticated
using (true);

drop policy if exists locations_authenticated_read on locations;
create policy locations_authenticated_read on locations
for select to authenticated
using (true);

drop policy if exists asset_categories_authenticated_read on asset_categories;
create policy asset_categories_authenticated_read on asset_categories
for select to authenticated
using (true);

drop policy if exists custom_field_definitions_authenticated_read on custom_field_definitions;
create policy custom_field_definitions_authenticated_read on custom_field_definitions
for select to authenticated
using (true);

-- Authenticated users can read assets and assignment state.
drop policy if exists assets_authenticated_read on assets;
create policy assets_authenticated_read on assets
for select to authenticated
using (true);

drop policy if exists asset_components_authenticated_read on asset_components;
create policy asset_components_authenticated_read on asset_components
for select to authenticated
using (true);

drop policy if exists asset_assignments_authenticated_read on asset_assignments;
create policy asset_assignments_authenticated_read on asset_assignments
for select to authenticated
using (true);

drop policy if exists asset_logs_authenticated_read on asset_logs;
create policy asset_logs_authenticated_read on asset_logs
for select to authenticated
using (true);

-- Admin users can manage AMS data from the frontend (via authenticated role + RLS).
drop policy if exists departments_admin_all on departments;
create policy departments_admin_all on departments
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists manufacturers_admin_all on manufacturers;
create policy manufacturers_admin_all on manufacturers
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists locations_admin_all on locations;
create policy locations_admin_all on locations
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists asset_categories_admin_all on asset_categories;
create policy asset_categories_admin_all on asset_categories
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists employees_admin_all on employees;
create policy employees_admin_all on employees
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists assets_admin_all on assets;
create policy assets_admin_all on assets
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists custom_field_definitions_admin_all on custom_field_definitions;
create policy custom_field_definitions_admin_all on custom_field_definitions
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists asset_components_admin_all on asset_components;
create policy asset_components_admin_all on asset_components
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists asset_assignments_admin_all on asset_assignments;
create policy asset_assignments_admin_all on asset_assignments
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

drop policy if exists asset_logs_admin_all on asset_logs;
create policy asset_logs_admin_all on asset_logs
for all to authenticated
using (fn_is_admin())
with check (fn_is_admin());

-- Runtime RPC execute permissions
alter function fn_assign_asset(text, text, timestamptz, text, text) security invoker;
alter function fn_return_asset(text, timestamptz, text, text) security invoker;
alter function fn_create_asset_with_log(text, text, text, text, text, text, text, text, asset_status, date, date, jsonb, jsonb, text, text, text) security invoker;

revoke all on function fn_assign_asset(text, text, timestamptz, text, text) from public;
revoke all on function fn_return_asset(text, timestamptz, text, text) from public;
revoke all on function fn_next_asset_tag() from public;
revoke all on function fn_create_asset_with_log(text, text, text, text, text, text, text, text, asset_status, date, date, jsonb, jsonb, text, text, text) from public;
revoke all on function fn_claim_employee_auth_link() from public;
revoke all on function fn_public_scan_asset(text) from public;
grant execute on function fn_assign_asset(text, text, timestamptz, text, text) to authenticated, service_role;
grant execute on function fn_return_asset(text, timestamptz, text, text) to authenticated, service_role;
grant execute on function fn_next_asset_tag() to authenticated, service_role;
grant execute on function fn_create_asset_with_log(text, text, text, text, text, text, text, text, asset_status, date, date, jsonb, jsonb, text, text, text) to authenticated, service_role;
grant execute on function fn_claim_employee_auth_link() to authenticated, service_role;
grant execute on function fn_public_scan_asset(text) to anon, authenticated, service_role;

-- Employee row access: users can read only their own employee record.
drop policy if exists employees_self_read on employees;
create policy employees_self_read on employees
for select to authenticated
using (auth.uid() = auth_user_id);

drop policy if exists employees_self_update on employees;
