-- 43_fix_assets_rls_remove_circular_dependency.sql
--
-- Fix the assets_authenticated_read RLS policy to remove circular dependency.
--
-- Problem: Migration 40's policy checked for assignments with a JOIN on employees,
-- but that JOIN was also subject to employees_self_read RLS, creating a circular
-- dependency where the policy couldn't see employee records to check assignments.
--
-- Solution: Simplify the policy to allow reading all non-deleted assets.
-- The v_asset_inventory view (with security_invoker=true from migration 33) handles
-- employee scoping through its LEFT JOIN on employees + client-side filtering by
-- current_employee_id (fixed in migration 42 to use ca.employee_id).

set search_path = public;

DROP POLICY IF EXISTS assets_authenticated_read ON assets;

CREATE POLICY assets_authenticated_read ON assets
FOR SELECT TO authenticated
USING (
  coalesce(is_deleted, false) = false
);

COMMENT ON POLICY assets_authenticated_read ON assets IS
  'Allow authenticated users to read non-deleted assets. '
  'Employee scoping is handled by v_asset_inventory (security_invoker) + client filters.';
