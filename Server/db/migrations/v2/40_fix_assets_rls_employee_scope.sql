-- 40_fix_assets_rls_employee_scope.sql
-- Migration 33 set v_asset_inventory to security_invoker=true expecting the
-- assets_authenticated_read RLS policy to scope employees to their own assets.
-- However the policy was left as `using (true)` (all authenticated users see
-- all assets). This migration tightens it so:
--
--   • admin / it_ops  → all non-deleted assets  (unchanged)
--   • employee role   → only assets with an open assignment to them

set search_path = public;

drop policy if exists assets_authenticated_read on assets;

create policy assets_authenticated_read on assets
for select to authenticated
using (
  -- admins and IT ops see everything
  fn_is_admin_or_it_ops()
  or
  -- employees see only assets currently assigned to them
  exists (
    select 1
    from asset_assignments aa
    join employees e on e.id = aa.employee_id
    where aa.asset_id    = assets.id
      and aa.returned_at is null
      and e.auth_user_id = auth.uid()
  )
);
