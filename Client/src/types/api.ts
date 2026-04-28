export type EmployeeRole = 'it_ops' | 'admin' | 'employee'

export type CategoryRecord = {
  id: string
  slug: string
  name: string
}

export type EmployeeRecord = {
  id: string
  employee_id: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  is_active: boolean
  assigned_asset_count?: number
}

export type EmployeeUpsertInput = {
  id?: string
  employee_id: string
  name: string
  email?: string | null
  department?: string | null
  role?: EmployeeRole
  is_active: boolean
}

export type EmployeePortfolioAsset = {
  id: string
  asset_tag: string | null
  serial_number: string | null
  model: string | null
  status: string
  category_name: string | null
  manufacturer_name: string | null
  assigned_at: string | null
  assigned_by_name: string | null
}

export type EmployeePortfolio = {
  employee: EmployeeRecord
  assets: EmployeePortfolioAsset[]
  total_assigned_assets: number
}

export type AssetFilters = {
  search?: string
  status?: string
  category_slug?: string
  current_employee_id?: string
  exclude_category_slugs?: string[]
}

export type AssetInventoryRecord = {
  id: string
  asset_tag: string | null
  serial_number: string | null
  model: string | null
  status: string
  purchase_date: string | null
  warranty_expiry: string | null
  custom_fields: Record<string, unknown>
  category_id: string
  category_slug: string
  category_name: string
  manufacturer_id: string | null
  manufacturer_name: string | null
  location_id: string | null
  location_code: string | null
  location_name: string | null
  assignment_id: string | null
  assigned_at: string | null
  current_employee_id: string | null
  current_employee_business_id: string | null
  current_employee_name: string | null
  current_employee_email: string | null
  current_employee_is_active: boolean | null
  current_employee_department: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export type PublicScanAsset = {
  category_name: string
  asset_tag: string
  status: string
  is_assigned: boolean
  holder_name?: string | null
  holder_department?: string | null
  holder_email?: string | null
  holder_employee_business_id?: string | null
}

export type AssetAssignmentRecord = {
  id: string
  assigned_at: string
  returned_at: string | null
  source: string
  notes: string | null
  employee: {
    id: string
    employee_id: string
    name: string
    is_active: boolean
    department: string | null
    role: string | null
  } | null
}

export type AssetComponentRecord = {
  id: string
  component_type: string
  model: string | null
  serial_number: string | null
  metadata: Record<string, unknown>
  manufacturer_name: string | null
}

export type AssetLifecycleEvent = {
  id: string
  event_type: string
  actor_id: string | null
  /** Business employee id (`employees.employee_id`) when present in actor snapshot. */
  actor_employee_id: string | null
  actor_name: string | null
  actor_department_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

export type AssetAuditActorDisplay = {
  auth_user_id: string | null
  name: string | null
  employee_id: string | null
}

export type AssetDetailRecord = {
  asset: AssetInventoryRecord
  assignments: AssetAssignmentRecord[]
  components: AssetComponentRecord[]
  lifecycle_events: AssetLifecycleEvent[]
  lifecycle_is_capped: boolean
  audit_actors: {
    created_by: AssetAuditActorDisplay | null
    updated_by: AssetAuditActorDisplay | null
  }
}
