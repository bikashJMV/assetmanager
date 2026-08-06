import { requestBackend } from './utils/authNexus.api'
import { User } from 'oidc-client-ts'
import { userManager } from './utils/authService'

/** Default origin in all QRs unless `VITE_PUBLIC_APP_ORIGIN` is set (staging / fork). */
const VITE_PUBLIC_APP_ORIGIN = import.meta.env.VITE_PUBLIC_APP_ORIGIN || 'http://localhost:11000';

if (!import.meta.env.VITE_PUBLIC_APP_ORIGIN) {
  console.warn("âš ï¸ VITE_PUBLIC_APP_ORIGIN not set. Using fallback.");
}

/**
 * BFF (FastAPI Server) base URL.
 * Reads VITE_API_URL from env; falls back to localhost:8000 for local dev.
 * Trailing slash stripped for safe concatenation.
 */
/** Build headers for calls to the BFF server (includes X-API-Key when configured). */
/** Strip path segments and unsafe patterns from server-provided download names (RFC 5987 / filename=). */
export type SessionEmployee = {
  id: string
  employee_id: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  /** Employee / account active (employment). */
  is_active: boolean
}

export type EmployeeRecord = {
  id: string
  employee_id: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  is_active: boolean
}

export type EmployeeAssetCountMap = Record<string, number>

export type EmployeeAssignedAssetRecord = AssetInventoryRecord & {
  assigned_by_name: string | null
}

export type EmployeeAssetPortfolio = {
  employee: EmployeeRecord
  totalAssignedAssets: number
  assets: EmployeeAssignedAssetRecord[]
}


export type EmployeeListFilters = {
  search?: string
  is_active?: boolean | 'all'
  department?: string
  role?: string
}

export type EmployeePageOptions = {
  offset?: number
  limit?: number
}

export type EmployeePageResult = {
  rows: EmployeeRecord[]
  total: number
}

export type EmployeeRole = 'it_ops' | 'admin' | 'employee'

export type CategoryRecord = {
  id: string
  slug: string
  name: string
}

export type CustomFieldDefinition = {
  id: string
  category_id: string
  field_key: string
  label: string
  data_type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'json'
  is_required: boolean
  sort_order: number
  options: unknown[]
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
  /** Holder employee account active (`employees.is_active`). */
  current_employee_is_active: boolean | null
  current_employee_department: string | null
  created_at: string
  updated_at: string
  /** auth.users id (after migration `13_asset_audit_and_events.sql`) */
  created_by?: string | null
  /** auth.users id (after migration `13_asset_audit_and_events.sql`) */
  updated_by?: string | null
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

export type AssetEventActorSnapshot = {
  actor_id: string | null
  actor_employee_id: string | null
  actor_name: string | null
  actor_department_name: string | null
}

export type AssetAuditActorDisplay = {
  auth_user_id: string | null
  name: string | null
  /** Business employee id (`employees.employee_id`), not UUID. */
  employee_id: string | null
}

export type AssetFieldChangeEntry = {
  field: string
  label: string
  before: unknown
  after: unknown
  truncated?: boolean
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

export type PublicDashboardSummary = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  categoryBreakdown: Array<{ category: string; count: number }>
}

export type OverviewAnalysisMetric = {
  label: string
  count: number
}

export type OverviewAnalysisEmployeeLoad = {
  employee_id: string
  employee_name: string
  /** Text business employee id from inventory view (`current_employee_business_id`). */
  display_employee_id: string | null
  department: string | null
  assigned_assets: number
}

export type OverviewAnalysisSnapshot = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  activeEmployees: number
  statusBreakdown: OverviewAnalysisMetric[]
  categoryBreakdown: OverviewAnalysisMetric[]
  employeeLoad: OverviewAnalysisEmployeeLoad[]
}

export type WarrantyNotification = {
  notification_id: string
  asset_id: string
  asset_tag: string | null
  model: string | null
  category_name: string | null
  current_employee_id: string | null
  current_employee_name: string | null
  warranty_expiry: string
  days_remaining: number
  severity: 'expired' | 'due_soon'
  message: string
}

export type WelcomeNotification = {
  show_alert: boolean
  title: string
  message: string
}

export type AssetFilters = {
  search?: string
  status?: string
  category_slug?: string
  current_employee_id?: string
  exclude_category_slugs?: string[]
}

export type AssetPageOptions = {
  offset?: number
  limit?: number
}

export type AssetPageResult = {
  rows: AssetInventoryRecord[]
  total: number
}

export type AssignAssetPayload = {
  asset_tag: string
  employee_id: string
  assigned_at?: string
  notes?: string
}

export type ReturnAssetPayload = {
  asset_tag: string
  returned_at?: string
  notes?: string
}

export type AssetWriteInput = {
  asset_tag?: string
  category_slug: string
  /** Display name for new categories (e.g. Other flow). Defaults to title-case from slug. */
  category_name?: string
  manufacturer_name?: string
  model?: string
  /** Required for create; optional on partial update via `Partial<AssetWriteInput>`. */
  serial_number: string
  location_code?: string
  location_name?: string
  purchase_date?: string
  warranty_expiry?: string
  status?: string
  custom_fields?: Record<string, unknown>
  metadata?: Record<string, unknown>
  qr_reservation_id?: string
}


const ERP_ACTIVE_LABEL = 'ERP Active'
const ERP_INACTIVE_LABEL = 'ERP Inactive'

/** Aligns with DB slug normalization in `fn_create_asset_with_log`. */
export function slugifyCategoryLabel(input: string): string {
  const raw = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return raw
}

export async function getSession(): Promise<User | null> {
  const user = await userManager.getUser()
  return user && !user.expired ? user : null
}


const AUTH_DERIVED_CACHE_TTL_MS = 10_000


type CachedAuthValue<T> = {
  key: string
  value?: T
  promise?: Promise<T>
  expiresAt: number
}

let sessionEmployeeCache: CachedAuthValue<SessionEmployee | null> | null = null


function buildAuthCacheKey(user?: { profile: { sub: string; email?: string } } | null): string {
  if (!user?.profile.sub) return 'anonymous'
  return `${user.profile.sub}:${user.profile.email ?? ''}`
}

function readCachedAuthValue<T>(cache: CachedAuthValue<T> | null, key: string): T | Promise<T> | null {
  if (!cache || cache.key !== key || cache.expiresAt <= Date.now()) return null
  if ('value' in cache) return cache.value as T
  if (cache.promise) return cache.promise
  return null
}

function resetAuthDerivedCache() {
  sessionEmployeeCache = null
}


export async function signOut() {
  resetAuthDerivedCache()
  await userManager.signoutRedirect()
}

async function getActiveAdminAccessState(): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await getSessionEmployee()
  if (profile && profile.is_active && (profile.role === 'admin' || profile.role === 'it_ops')) {
    return { allowed: true }
  }
  return {
    allowed: false,
    reason: 'Signed-in account must be linked to an active admin/IT Ops employee record.'
  }
}

export async function hasActiveAdminAccess(): Promise<boolean> {
  const state = await getActiveAdminAccessState()
  return state.allowed
}

/** Soft check for UI (does not throw on transient RPC errors). */


async function loadSessionEmployeeForUser(): Promise<SessionEmployee | null> {
  try {
    return await requestBackend<SessionEmployee>({
      url: '/api/v1/employees/me',
      method: 'GET'
    })
  } catch (err) {
    console.error('[api] loadSessionEmployeeForUser failed:', err)
    return null
  }
}



export async function getSessionEmployee(user?: User | null): Promise<SessionEmployee | null> {
  const activeUser = user ?? (await getSession())
  if (!activeUser) {
    sessionEmployeeCache = {
      key: 'anonymous',
      value: null,
      expiresAt: Date.now() + AUTH_DERIVED_CACHE_TTL_MS,
    }
    return null
  }

  const cacheKey = buildAuthCacheKey(activeUser)
  const cached = readCachedAuthValue(sessionEmployeeCache, cacheKey)
  if (cached) {
    return await cached
  }

  const loadProfile = loadSessionEmployeeForUser()
  sessionEmployeeCache = {
    key: cacheKey,
    promise: loadProfile,
    expiresAt: Date.now() + AUTH_DERIVED_CACHE_TTL_MS,
  }

  try {
    const profile = await loadProfile
    if (sessionEmployeeCache?.key === cacheKey) {
      sessionEmployeeCache = {
        key: cacheKey,
        value: profile,
        expiresAt: Date.now() + AUTH_DERIVED_CACHE_TTL_MS,
      }
    }
    return profile
  } catch (error) {
    if (sessionEmployeeCache?.key === cacheKey) {
      sessionEmployeeCache = null
    }
    throw error
  }
}

export async function listDepartments(): Promise<string[]> {
  return await requestBackend<string[]>({
    url: '/api/v1/meta/departments',
    method: 'GET'
  })
}



export async function listEmployees(filters: EmployeeListFilters = {}): Promise<EmployeeRecord[]> {
  const res = await listEmployeesPage(filters, { limit: 1000 })
  return res.rows
}

export async function listEmployeesPage(
  filters: EmployeeListFilters = {},
  options: EmployeePageOptions = {}
): Promise<EmployeePageResult> {
  const res = await requestBackend<{
    items: EmployeeRecord[]
    page: number
    limit: number
    count: number
    total: number
  }>({
    url: '/api/v1/employees',
    method: 'GET',
    params: {
      page: Math.floor((options.offset ?? 0) / (options.limit ?? 50)) + 1,
      limit: options.limit ?? 50,
      search: filters.search,
      status: filters.is_active === true ? 'true' : filters.is_active === false ? 'false' : 'all',
      department: filters.department,
      role: filters.role
    }
  })

  return {
    rows: res.items,
    total: res.total
  }
}

export async function getEmployeeById(employeeId: string): Promise<EmployeeRecord> {
  return await requestBackend<EmployeeRecord>({
    url: `/api/v1/employees/${employeeId}`,
    method: 'GET'
  })
}

export async function searchAssignableEmployees(
  query: string,
  options: { limit?: number } = {},
): Promise<EmployeeRecord[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const res = await listEmployeesPage(
    { search: trimmed, is_active: true },
    { offset: 0, limit: Math.max(1, options.limit ?? 8) }
  )

  return res.rows.filter((row: EmployeeRecord) => row.employee_id.trim().length > 0)
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

/** Bulk import only: insert a new row; does not update existing `employee_id`. */


/** Single-transaction bulk insert (migration 30). Any failure rolls back all rows. */




/** Active employee IDs among the given list â€” bulk import must reject the file if any match. */
/** Emails that already exist on an employee row â€” bulk import should list every conflicting row in the file. */
/** IDs that exist and are soft-deleted (bulk import should reject until restored from Recycle Bin).
 * NOTE: Soft-delete has been removed, this function returns empty set for compatibility.
 */
export async function listCategories(): Promise<CategoryRecord[]> {
  return await requestBackend<CategoryRecord[]>({
    url: '/api/v1/meta/categories',
    method: 'GET'
  })
}


export async function getCustomFieldDefinitions(categorySlug: string): Promise<CustomFieldDefinition[]> {
  return await requestBackend<CustomFieldDefinition[]>({
    url: `/api/v1/meta/categories/${categorySlug}/fields`,
    method: 'GET'
  })
}

export async function createAsset(payload: AssetWriteInput) {
  return await requestBackend<AssetInventoryRecord>({
    url: '/api/v1/assets',
    method: 'POST',
    data: payload
  })
}

export async function bulkInsertAssets(rows: AssetWriteInput[]): Promise<{ inserted: number }> {
  return await requestBackend<{ inserted: number }>({
    url: '/api/v1/assets/bulk',
    method: 'POST',
    data: rows
  })
}


export async function updateAsset(assetTag: string, payload: Partial<AssetWriteInput>) {
  return await requestBackend({
    url: `/api/v1/assets/tag/${assetTag}`,
    method: 'PATCH',
    data: payload
  })
}



export async function getAssetsPage(
  filters: AssetFilters = {},
  options: AssetPageOptions = {}
): Promise<AssetPageResult> {
  const res = await requestBackend<{
    items: AssetInventoryRecord[]
    page: number
    limit: number
    count: number
    total: number
  }>({
    url: '/api/v1/assets',
    method: 'GET',
    params: {
      page: Math.floor((options.offset ?? 0) / (options.limit ?? 50)) + 1,
      limit: options.limit ?? 50,
      search: filters.search,

      status: filters.status,
      category_slug: filters.category_slug,
      exclude_category_slugs: filters.exclude_category_slugs,
      employee_id: filters.current_employee_id
    }
  })

  return {
    rows: res.items,
    total: res.total
  }
}

export async function getAsset(assetTag: string): Promise<AssetInventoryRecord> {
  return await requestBackend<AssetInventoryRecord>({
    url: `/api/v1/assets/tag/${assetTag}`,
    method: 'GET'
  })
}

export async function getAssetDetail(assetTag: string): Promise<AssetDetailRecord> {
  const res = await requestBackend<{
    asset: AssetInventoryRecord
    components: unknown[]
    assignments: unknown[]
    events: unknown[]
  }>({
    url: `/api/v1/assets/${assetTag}/detail`,
    method: 'GET'
  })

  return {
    asset: res.asset,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: (res.components || []).map((c: any) => ({
      id: c.id,
      component_type: c.component_type,
      model: c.model ?? null,
      serial_number: c.serial_number ?? null,
      metadata: (c.metadata as Record<string, unknown>) ?? {},
      manufacturer_name: c.manufacturer_name ?? null
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: (res.assignments || []).map((a: any) => ({
      id: a.id,
      assigned_at: a.assigned_at,
      returned_at: a.returned_at ?? null,
      source: a.source,
      notes: a.notes ?? null,
      employee: a.employee_name ? {
        id: '',
        employee_id: '',
        name: a.employee_name,
        is_active: true,
        department: null,
        role: null
      } : null
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lifecycle_events: (res.events || []).map((e: any) => ({
      id: e.id,
      event_type: e.event_type || 'system_event',
      actor_id: null,
      actor_employee_id: null,
      actor_name: null,
      actor_department_name: null,
      payload: (e.metadata as Record<string, unknown>) ?? {},
      created_at: e.created_at
    })),
    lifecycle_is_capped: false,
    audit_actors: {
      created_by: null,
      updated_by: null
    }
  }
}

export async function assignAsset(payload: AssignAssetPayload) {
  return await requestBackend({
    url: '/api/v1/assignments/assign',
    method: 'POST',
    data: {
      asset_tag: payload.asset_tag,
      employee_id: payload.employee_id,
      assigned_at: payload.assigned_at,
      notes: payload.notes
    }
  })
}

export async function returnAsset(payload: ReturnAssetPayload) {
  return await requestBackend({
    url: '/api/v1/assignments/return',
    method: 'POST',
    data: {
      asset_tag: payload.asset_tag,
      returned_at: payload.returned_at,
      notes: payload.notes
    }
  })
}

export async function setAssetLifecycleStatus(
  assetTag: string,
  newStatus: string,
  notes?: string,
  source: string = 'runtime',
): Promise<Record<string, unknown>> {
  return await requestBackend<Record<string, unknown>>({
    url: `/api/v1/assets/${assetTag}/status`,
    method: 'PATCH',
    data: { status: newStatus, notes, source }
  })
}

export async function resolveEmployeeIdForAssign(
  identifier: string,
): Promise<string> {
  const trimmed = identifier.trim()
  if (!trimmed) throw new Error('Employee identifier is empty')

  if (trimmed.includes('@')) {
    const res = await requestBackend<EmployeeRecord>({
      url: '/api/v1/employees/by-email',
      method: 'GET',
      params: { email: trimmed }
    })
    return res.id
  }

  return trimmed
}

export async function listWarrantyNotifications(limit = 100): Promise<WarrantyNotification[]> {
  return await requestBackend<WarrantyNotification[]>({
    url: '/api/v1/meta/warranty-notifications',
    method: 'GET',
    params: { limit }
  })
}


export async function getWelcomeNotification(): Promise<WelcomeNotification | null> {
  try {
    return await requestBackend<WelcomeNotification>({
      url: '/api/v1/meta/welcome-notification',
      method: 'GET'
    })
  } catch {
    return null
  }
}

/** Result of fetching the QR label PDF from the BFF; UI opens a tab or offers an explicit download. */
export type FetchedQrLabelsPdf = {
  pdfBlob: Blob
  fileName: string
  /** Server set when the PDF is a notice (no labels) rather than label sheets. */
  emptyExport: boolean
}

export type FetchedAuditTrailPdf = {
  pdfBlob: Blob
  fileName: string
}


/** Soft-delete: moves employee to Recycle Bin; main directory hides them until restore. Not for Active/Inactive (use employee upsert / is_active). */


/**
 * Origin embedded in asset QR codes (`/scan/{tag}`).
 * even when the admin UI runs on localhost. Override with `VITE_PUBLIC_APP_ORIGIN` for staging/forks.
 */
export function getScanPageBaseUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_APP_ORIGIN
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/\/$/, '')
    if (trimmed && /^https?:\/\//i.test(trimmed)) {
      return trimmed
    }
  }
  return VITE_PUBLIC_APP_ORIGIN
}

export async function scanAsset(assetTag: string) {
  const [asset, sessionEmp] = await Promise.all([getAsset(assetTag), getSessionEmployee()])
  const isPrivileged = Boolean(sessionEmp?.is_active && sessionEmp?.role !== 'employee')
  // is_own_asset: true for admin/IT Ops, or if the asset is assigned to the signed-in employee.
  // false means employee is viewing an asset not assigned to them â€” caller shows limited view via ScanPage.
  const isOwnAsset =
    isPrivileged ||
    Boolean(sessionEmp?.id && asset.current_employee_id === sessionEmp.id)

  return {
    asset_tag: asset.asset_tag,
    is_own_asset: isOwnAsset,
    is_privileged: isPrivileged,
    category: asset.category_name,
    manufacturer: asset.manufacturer_name,
    model: asset.model,
    status: asset.status,
    location: asset.location_name,
    holder: asset.current_employee_name,
    holder_erp_status: asset.current_employee_id
      ? (asset.current_employee_is_active ? ERP_ACTIVE_LABEL : ERP_INACTIVE_LABEL)
      : 'N/A',
    custom_fields: asset.custom_fields,
  }
}



export async function getPublicDashboardSummary(): Promise<PublicDashboardSummary> {
  return await requestBackend<PublicDashboardSummary>({
    url: '/api/v1/meta/public-dashboard',
    method: 'GET'
  })
}

/** Payload from `fn_public_scan_asset` (anonymous QR): tightly-scoped public scan details. */
export type PublicScanAsset = {
  kind?: string
  category_name: string
  asset_tag: string
  status: string
  is_assigned: boolean
  holder_name?: string | null
  holder_department?: string | null
  holder_email?: string | null
  holder_employee_business_id?: string | null
}

export { ERP_ACTIVE_LABEL, ERP_INACTIVE_LABEL }
