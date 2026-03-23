import type { Session, User } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { supabase } from './supabaseClient'

export type SessionEmployee = {
  id: string
  employee_code: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  is_active: boolean
  metadata: Record<string, unknown>
}

export type EmployeeRecord = {
  id: string
  employee_code: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  is_active: boolean
  metadata: Record<string, unknown>
}

export type EmployeeListFilters = {
  search?: string
  is_active?: boolean | 'all'
  department?: string
  role?: string
}

export type EmployeeRole = 'admin' | 'employee'

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
  current_employee_code: string | null
  current_employee_name: string | null
  current_employee_email: string | null
  current_employee_is_active: boolean | null
  current_employee_department: string | null
  created_at: string
  updated_at: string
}

export type AssetAssignmentRecord = {
  id: string
  assigned_at: string
  returned_at: string | null
  source: string
  notes: string | null
  employee: {
    id: string
    employee_code: string
    name: string
    is_active: boolean
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

export type AssetDetailRecord = {
  asset: AssetInventoryRecord
  assignments: AssetAssignmentRecord[]
  components: AssetComponentRecord[]
}

export type PublicDashboardSummary = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  categoryBreakdown: Array<{ category: string; count: number }>
}

export type AssetFilters = {
  search?: string
  status?: string
  category_slug?: string
  hideHeldByInactive?: boolean
  current_employee_id?: string
}

export type AssignAssetPayload = {
  asset_tag: string
  employee_code: string
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
  manufacturer_name?: string
  model?: string
  serial_number?: string
  location_code?: string
  location_name?: string
  purchase_date?: string
  warranty_expiry?: string
  status?: string
  custom_fields?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

const ERP_ACTIVE_LABEL = 'ERP Active'
const ERP_INACTIVE_LABEL = 'ERP Inactive'

function toCategoryNameFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeLocationCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase()
  if (!trimmed) return null
  const normalized = trimmed.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || null
}

function extractRpcScalarString(data: unknown, keys: string[]): string | null {
  if (typeof data === 'string' && data.trim()) return data.trim()

  if (Array.isArray(data) && data.length > 0) {
    return extractRpcScalarString(data[0], keys)
  }

  if (data && typeof data === 'object') {
    for (const key of keys) {
      const raw = (data as Record<string, unknown>)[key]
      if (typeof raw === 'string' && raw.trim()) return raw.trim()
    }
  }

  return null
}

function extractRpcScalarBoolean(data: unknown, keys: string[]): boolean | null {
  if (typeof data === 'boolean') return data

  if (Array.isArray(data) && data.length > 0) {
    return extractRpcScalarBoolean(data[0], keys)
  }

  if (data && typeof data === 'object') {
    for (const key of keys) {
      const raw = (data as Record<string, unknown>)[key]
      if (typeof raw === 'boolean') return raw
    }
  }

  return null
}

function normalizeRole(
  metadata: Record<string, unknown> | null | undefined,
  directRole?: unknown,
) {
  const roleFromColumn = typeof directRole === 'string' ? directRole.trim() : ''
  if (roleFromColumn) {
    return roleFromColumn.toLowerCase() === 'admin' ? 'admin' : 'employee'
  }

  const roleFromMetadata = typeof metadata?.role === 'string' ? metadata.role.trim() : ''
  if (!roleFromMetadata) return 'employee'
  return roleFromMetadata.toLowerCase() === 'admin' ? 'admin' : 'employee'
}

function normalizeEmployeeRoleInput(value: string | null | undefined): EmployeeRole {
  const normalized = (value || 'employee').trim().toLowerCase()
  if (normalized === 'admin') return 'admin'
  if (normalized === 'employee') return 'employee'
  throw new Error('Role must be either admin or employee')
}

function normalizeEmployeeRow(row: any): EmployeeRecord {
  const metadata = (row?.metadata ?? {}) as Record<string, unknown>
  const departmentValue = row?.department ?? row?.departments ?? null
  const departmentName = Array.isArray(departmentValue)
    ? (typeof departmentValue[0]?.name === 'string' ? departmentValue[0].name : null)
    : typeof departmentValue?.name === 'string'
      ? departmentValue.name
      : null

  return {
    id: String(row.id),
    employee_code: row.employee_code,
    name: row.name,
    email: row.email ?? null,
    department: departmentName,
    role: normalizeRole(metadata, row?.resolved_role ?? row?.role),
    is_active: Boolean(row.is_active),
    metadata,
  }
}

function ensureNoSupabaseError(error: unknown, fallback: string): asserts error is null {
  if (error) {
    const message = typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: string }).message)
      : fallback
    throw new Error(message || fallback)
  }
}

function isMissingRpcError(error: unknown, functionName: string): boolean {
  if (!error || typeof error !== 'object') return false

  const code = typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: unknown }).code)
    : ''
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? String((error as { message?: unknown }).message).toLowerCase()
    : ''

  return (
    code === 'PGRST202' ||
    message.includes('could not find the function') ||
    message.includes(functionName.toLowerCase())
  )
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  ensureNoSupabaseError(error, 'Unable to get session')
  return data.session
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => {
    data.subscription.unsubscribe()
  }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        prompt: 'select_account',
      },
    },
  })
  ensureNoSupabaseError(error, 'Unable to start Google sign-in')
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  ensureNoSupabaseError(error, 'Unable to sign out')
}

async function claimCurrentEmployeeAuthLink(): Promise<string | null> {
  const session = await getSession()
  if (!session?.user?.email) return null

  const { data, error } = await supabase.rpc('fn_claim_employee_auth_link')
  if (error) {
    if (!isMissingRpcError(error, 'fn_claim_employee_auth_link')) {
      ensureNoSupabaseError(error, 'Unable to verify employee profile link')
    }
    return null
  }

  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') return null

  if ((payload as { ok?: boolean }).ok === false) {
    const message = (payload as { message?: unknown }).message
    return typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Signed-in account is not linked to an employee profile.'
  }

  return null
}

async function getActiveAdminAccessState(): Promise<{ allowed: boolean; reason?: string }> {
  const session = await getSession()
  if (!session?.user) {
    return { allowed: false, reason: 'You are not signed in.' }
  }

  const profile = await getSessionEmployee(session.user)
  if (profile && profile.role === 'admin' && profile.is_active) {
    return { allowed: true }
  }

  const linkIssue = await claimCurrentEmployeeAuthLink()
  const { data, error } = await supabase.rpc('fn_is_admin')
  if (error && !isMissingRpcError(error, 'fn_is_admin')) {
    ensureNoSupabaseError(error, 'Unable to verify admin access')
  }

  const allowed = error ? false : (extractRpcScalarBoolean(data, ['fn_is_admin']) ?? false)
  if (allowed) {
    return { allowed: true }
  }

  if (linkIssue) {
    return { allowed: false, reason: linkIssue }
  }

  return {
    allowed: false,
    reason: 'Signed-in account must be linked to an active admin employee record.',
  }
}

export async function hasActiveAdminAccess(): Promise<boolean> {
  const state = await getActiveAdminAccessState()
  return state.allowed
}

async function assertActiveAdminAccess() {
  const state = await getActiveAdminAccessState()
  if (!state.allowed) {
    throw new Error(state.reason || 'Signed-in account must be linked to an active admin employee record.')
  }
}

export async function getSessionEmployee(user?: User | null): Promise<SessionEmployee | null> {
  const activeUser = user ?? (await getSession())?.user
  if (!activeUser) return null

  const columns = 'id,employee_code,name,email,is_active,metadata,resolved_role:metadata->>role,department:departments(name)'
  let data: any = null

  // Primary lookup by auth_user_id is more reliable than email matching.
  const byAuthId = await supabase
    .from('employees')
    .select(columns)
    .eq('auth_user_id', activeUser.id)
    .limit(1)
    .maybeSingle()
  ensureNoSupabaseError(byAuthId.error, 'Unable to load employee profile')
  data = byAuthId.data

  // Fallback: case-insensitive email lookup for legacy rows missing auth_user_id link.
  if (!data && activeUser.email?.trim()) {
    const byEmail = await supabase
      .from('employees')
      .select(columns)
      .ilike('email', activeUser.email.trim())
      .limit(1)
      .maybeSingle()
    ensureNoSupabaseError(byEmail.error, 'Unable to load employee profile')
    data = byEmail.data
  }

  if (!data) return null

  const normalized = normalizeEmployeeRow(data)
  return {
    ...normalized,
    department: normalized.department,
  }
}

async function resolveDepartmentIdByName(name: string): Promise<string | null> {
  const cleaned = name.trim()
  if (!cleaned) return null

  const { data, error } = await supabase
    .from('departments')
    .select('id')
    .eq('name', cleaned)
    .limit(1)
    .maybeSingle()

  ensureNoSupabaseError(error, 'Unable to resolve department filter')
  return data?.id ?? null
}

export async function listDepartments(): Promise<string[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('name')
    .eq('is_active', true)
    .order('name', { ascending: true })

  ensureNoSupabaseError(error, 'Unable to load departments')

  const names = (data ?? [])
    .map((row: any) => (typeof row?.name === 'string' ? row.name.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(names))
}

export async function listEmployees(filters: EmployeeListFilters = {}): Promise<EmployeeRecord[]> {
  let query = supabase
    .from('employees')
    .select('id,employee_code,name,email,is_active,metadata,department:departments(name)')
    .order('name', { ascending: true })

  if (filters.search?.trim()) {
    const s = filters.search.trim()
    query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,employee_code.ilike.%${s}%`)
  }

  if (filters.is_active !== undefined && filters.is_active !== 'all') {
    query = query.eq('is_active', filters.is_active)
  }

  if (filters.department?.trim()) {
    const departmentId = await resolveDepartmentIdByName(filters.department)
    if (!departmentId) return []
    query = query.eq('department_id', departmentId)
  }

  const { data, error } = await query
  ensureNoSupabaseError(error, 'Unable to load employees')

  let rows = (data ?? []).map(normalizeEmployeeRow)

  if (filters.role?.trim()) {
    const targetRole = filters.role.trim().toLowerCase()
    rows = rows.filter((row) => row.role === targetRole)
  }

  return rows
}

async function getOrCreateDepartmentId(name: string | null | undefined): Promise<string | null> {
  if (!name || !name.trim()) return null

  const trimmed = name.trim()
  const upsert = await supabase
    .from('departments')
    .upsert({ name: trimmed }, { onConflict: 'name' })
  ensureNoSupabaseError(upsert.error, 'Unable to upsert department')

  const { data, error } = await supabase
    .from('departments')
    .select('id')
    .eq('name', trimmed)
    .limit(1)
    .single()

  ensureNoSupabaseError(error, 'Unable to resolve department')
  return data.id
}

export type EmployeeUpsertInput = {
  id?: string
  employee_code: string
  name: string
  email?: string | null
  department?: string | null
  role?: EmployeeRole
  is_active: boolean
}

export async function upsertEmployee(input: EmployeeUpsertInput) {
  await assertActiveAdminAccess()
  const departmentId = await getOrCreateDepartmentId(input.department)
  const employeeCode = input.employee_code.trim()

  const existingResponse = await supabase
    .from('employees')
    .select('metadata')
    .eq('employee_code', employeeCode)
    .limit(1)
    .maybeSingle()
  ensureNoSupabaseError(existingResponse.error, 'Unable to load existing employee profile')

  const existingMetadata =
    existingResponse.data?.metadata && typeof existingResponse.data.metadata === 'object'
      ? (existingResponse.data.metadata as Record<string, unknown>)
      : {}

  const payload: Record<string, unknown> = {
    employee_code: employeeCode,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    department_id: departmentId,
    is_active: input.is_active,
    metadata: {
      ...existingMetadata,
      role: normalizeEmployeeRoleInput(input.role),
    },
  }

  if (input.id) payload.id = input.id

  const { error } = await supabase.from('employees').upsert(payload, { onConflict: 'employee_code' })
  ensureNoSupabaseError(error, 'Unable to save employee')
}

export async function setEmployeeAdminStatus(
  targetEmployee: Pick<EmployeeRecord, 'id' | 'employee_code'>,
  makeAdmin: boolean,
) {
  await assertActiveAdminAccess()

  const { data, error } = await supabase.rpc('fn_set_employee_admin_status', {
    p_target_employee_id: targetEmployee.id,
    p_is_admin: makeAdmin,
    p_metadata: {
      source: 'employee-page',
      target_employee_code: targetEmployee.employee_code,
    },
  })
  ensureNoSupabaseError(error, 'Unable to update admin privileges')

  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response while updating admin privileges')
  }

  if ((payload as { ok?: boolean }).ok === false) {
    const message = (payload as { message?: unknown }).message
    throw new Error(typeof message === 'string' && message.trim() ? message.trim() : 'Unable to update admin privileges')
  }
}

export async function listCategories(): Promise<CategoryRecord[]> {
  const { data, error } = await supabase
    .from('asset_categories')
    .select('id,slug,name')
    .order('name', { ascending: true })

  ensureNoSupabaseError(error, 'Unable to load categories')
  return (data ?? []) as CategoryRecord[]
}

async function resolveCategoryId(categorySlug: string): Promise<string> {
  const slug = categorySlug.trim().toLowerCase()
  const { data, error } = await supabase
    .from('asset_categories')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  ensureNoSupabaseError(error, 'Unable to resolve category')

  if (data?.id) return data.id

  const name = slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  const upsert = await supabase
    .from('asset_categories')
    .upsert({ slug, name }, { onConflict: 'slug' })
  ensureNoSupabaseError(upsert.error, 'Unable to upsert category')

  const post = await supabase
    .from('asset_categories')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .single()

  ensureNoSupabaseError(post.error, 'Unable to resolve category id')
  return post.data.id
}

async function getOrCreateManufacturerId(name: string | null | undefined): Promise<string | null> {
  if (!name || !name.trim()) return null
  const trimmed = name.trim()

  const upsert = await supabase
    .from('manufacturers')
    .upsert({ name: trimmed }, { onConflict: 'name' })
  ensureNoSupabaseError(upsert.error, 'Unable to upsert manufacturer')

  const { data, error } = await supabase
    .from('manufacturers')
    .select('id')
    .eq('name', trimmed)
    .limit(1)
    .single()

  ensureNoSupabaseError(error, 'Unable to resolve manufacturer')
  return data.id
}

async function getOrCreateLocationId(code: string | null | undefined, name: string | null | undefined): Promise<string | null> {
  const locationCode = code?.trim().toUpperCase() || (name ? name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-') : null)
  if (!locationCode) return null

  const locationName = name?.trim() || locationCode

  const upsert = await supabase
    .from('locations')
    .upsert({ code: locationCode, name: locationName }, { onConflict: 'code' })
  ensureNoSupabaseError(upsert.error, 'Unable to upsert location')

  const { data, error } = await supabase
    .from('locations')
    .select('id')
    .eq('code', locationCode)
    .limit(1)
    .single()

  ensureNoSupabaseError(error, 'Unable to resolve location')
  return data.id
}

export async function getCustomFieldDefinitions(categorySlug: string): Promise<CustomFieldDefinition[]> {
  const categoryId = await resolveCategoryId(categorySlug)

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select('id,category_id,field_key,label,data_type,is_required,sort_order,options')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true })

  ensureNoSupabaseError(error, 'Unable to load custom field definitions')
  return (data ?? []) as CustomFieldDefinition[]
}

export async function createAsset(payload: AssetWriteInput) {
  await assertActiveAdminAccess()
  const categorySlug = payload.category_slug.trim().toLowerCase()
  if (!categorySlug) {
    throw new Error('Category is required')
  }

  let assetTag = payload.asset_tag?.trim()
  if (!assetTag) {
    const nextTagRes = await supabase.rpc('fn_next_asset_tag')
    ensureNoSupabaseError(nextTagRes.error, 'Unable to generate asset tag')
    assetTag = extractRpcScalarString(nextTagRes.data, ['fn_next_asset_tag', 'next_asset_tag']) ?? undefined
    if (!assetTag) {
      throw new Error('Unable to generate asset tag')
    }
  }

  const qrCode = await buildAssetQrDataUri(assetTag)

  const { data, error } = await supabase.rpc('fn_create_asset_with_log', {
    p_asset_tag: assetTag,
    p_category_slug: categorySlug,
    p_category_name: toCategoryNameFromSlug(categorySlug),
    p_manufacturer_name: payload.manufacturer_name?.trim() || null,
    p_model: payload.model?.trim() || null,
    p_serial_number: payload.serial_number?.trim() || null,
    p_location_code: normalizeLocationCode(payload.location_code),
    p_location_name: payload.location_name?.trim() || null,
    p_status: payload.status || null,
    p_purchase_date: payload.purchase_date || null,
    p_warranty_expiry: payload.warranty_expiry || null,
    p_custom_fields: payload.custom_fields || {},
    p_metadata: payload.metadata || {},
    p_log_note: 'Auto-generated on asset creation',
    p_qr_code: qrCode,
    p_actor_employee_code: null,
  })
  ensureNoSupabaseError(error, 'Unable to create asset')

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.ok) {
    throw new Error(result?.message || 'Unable to create asset')
  }

  const createdAssetTag = extractRpcScalarString(result, ['asset_tag']) || assetTag
  return getAsset(createdAssetTag)
}

export async function updateAsset(assetTag: string, payload: Partial<AssetWriteInput>) {
  await assertActiveAdminAccess()
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id')
    .eq('asset_tag', assetTag)
    .limit(1)
    .single()
  ensureNoSupabaseError(assetError, 'Asset not found')

  const patch: Record<string, unknown> = {}

  if (payload.category_slug) patch.category_id = await resolveCategoryId(payload.category_slug)
  if (payload.manufacturer_name !== undefined) patch.manufacturer_id = await getOrCreateManufacturerId(payload.manufacturer_name)
  if (payload.location_code !== undefined || payload.location_name !== undefined) {
    patch.location_id = await getOrCreateLocationId(payload.location_code, payload.location_name)
  }
  if (payload.model !== undefined) patch.model = payload.model?.trim() || null
  if (payload.serial_number !== undefined) patch.serial_number = payload.serial_number?.trim() || null
  if (payload.purchase_date !== undefined) patch.purchase_date = payload.purchase_date || null
  if (payload.warranty_expiry !== undefined) patch.warranty_expiry = payload.warranty_expiry || null
  if (payload.status !== undefined) patch.status = payload.status || null
  if (payload.custom_fields !== undefined) patch.custom_fields = payload.custom_fields
  if (payload.metadata !== undefined) patch.metadata = payload.metadata

  const { error } = await supabase.from('assets').update(patch).eq('id', asset.id)
  ensureNoSupabaseError(error, 'Unable to update asset')

  return getAsset(assetTag)
}

export async function getAssets(filters: AssetFilters = {}): Promise<AssetInventoryRecord[]> {
  let query = supabase
    .from('v_asset_inventory')
    .select('*')
    .order('updated_at', { ascending: false })

  if (filters.status?.trim()) {
    query = query.eq('status', filters.status.trim())
  }

  if (filters.category_slug?.trim()) {
    query = query.eq('category_slug', filters.category_slug.trim().toLowerCase())
  }

  if (filters.search?.trim()) {
    const s = filters.search.trim()
    query = query.or(
      `asset_tag.ilike.%${s}%,model.ilike.%${s}%,manufacturer_name.ilike.%${s}%,current_employee_name.ilike.%${s}%`
    )
  }

  if (filters.hideHeldByInactive) {
    query = query.or('assignment_id.is.null,current_employee_is_active.eq.true')
  }

  if (filters.current_employee_id?.trim()) {
    query = query.eq('current_employee_id', filters.current_employee_id.trim())
  }

  const { data, error } = await query
  ensureNoSupabaseError(error, 'Unable to fetch assets')
  return (data ?? []) as AssetInventoryRecord[]
}

export async function getAsset(assetTag: string): Promise<AssetInventoryRecord> {
  const { data, error } = await supabase
    .from('v_asset_inventory')
    .select('*')
    .eq('asset_tag', assetTag)
    .limit(1)
    .single()

  ensureNoSupabaseError(error, 'Asset not found')
  return data as AssetInventoryRecord
}

export async function getAssetDetail(assetTag: string): Promise<AssetDetailRecord> {
  const asset = await getAsset(assetTag)

  const [componentsResponse, assignmentsResponse] = await Promise.all([
    supabase
      .from('asset_components')
      .select('id,component_type,model,serial_number,metadata,manufacturer:manufacturers(name)')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('asset_assignments')
      .select('id,assigned_at,returned_at,source,notes,employee:employees(id,employee_code,name,is_active)')
      .eq('asset_id', asset.id)
      .order('assigned_at', { ascending: false }),
  ])

  ensureNoSupabaseError(componentsResponse.error, 'Unable to load components')
  ensureNoSupabaseError(assignmentsResponse.error, 'Unable to load assignments')

  const components: AssetComponentRecord[] = (componentsResponse.data ?? []).map((row: any) => {
    const manufacturer = Array.isArray(row.manufacturer) ? row.manufacturer[0] : row.manufacturer
    return {
      id: row.id,
      component_type: row.component_type,
      model: row.model,
      serial_number: row.serial_number,
      metadata: row.metadata ?? {},
      manufacturer_name: manufacturer?.name ?? null,
    }
  })

  const assignments: AssetAssignmentRecord[] = (assignmentsResponse.data ?? []).map((row: any) => {
    const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee
    return {
      id: row.id,
      assigned_at: row.assigned_at,
      returned_at: row.returned_at,
      source: row.source,
      notes: row.notes,
      employee: employee
        ? {
          id: employee.id,
          employee_code: employee.employee_code,
          name: employee.name,
          is_active: Boolean(employee.is_active),
        }
        : null,
    }
  })

  return { asset, assignments, components }
}

export async function assignAsset(payload: AssignAssetPayload) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_assign_asset', {
    p_asset_tag: payload.asset_tag,
    p_employee_code: payload.employee_code,
    p_assigned_at: payload.assigned_at || null,
    p_source: 'runtime',
    p_notes: payload.notes || null,
  })

  ensureNoSupabaseError(error, 'Unable to assign asset')
  if (!data?.ok) throw new Error(data?.message || 'Unable to assign asset')
  return data
}

export async function returnAsset(payload: ReturnAssetPayload) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_return_asset', {
    p_asset_tag: payload.asset_tag,
    p_returned_at: payload.returned_at || null,
    p_source: 'runtime',
    p_notes: payload.notes || null,
  })

  ensureNoSupabaseError(error, 'Unable to return asset')
  if (!data?.ok) throw new Error(data?.message || 'Unable to return asset')
  return data
}

export async function getCurrentEmployeeAssets(user?: User | null) {
  const sessionEmployee = await getSessionEmployee(user)
  if (!sessionEmployee) return { sessionEmployee: null, assets: [] as AssetInventoryRecord[] }

  const { data, error } = await supabase
    .from('v_asset_inventory')
    .select('*')
    .eq('current_employee_id', sessionEmployee.id)
    .order('updated_at', { ascending: false })

  ensureNoSupabaseError(error, 'Unable to load employee assets')
  return { sessionEmployee, assets: (data ?? []) as AssetInventoryRecord[] }
}

export async function getLogForAsset(assetTag: string) {
  const asset = await getAssetIdentityByTag(assetTag)

  const { data, error } = await supabase
    .from('asset_logs')
    .select('id,note,qr_code,created_at')
    .eq('asset_id', asset.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  ensureNoSupabaseError(error, 'Unable to fetch QR log')
  if (!data) throw new Error('No QR found for this asset')
  return data
}

export async function getQrDataUriForAssetTag(assetTag: string): Promise<string> {
  const normalizedTag = assetTag.trim()
  if (!normalizedTag) {
    throw new Error('Asset tag is required to generate QR')
  }

  const asset = await getAssetIdentityByTag(normalizedTag)

  const { data, error } = await supabase
    .from('asset_logs')
    .select('qr_code,created_at')
    .eq('asset_id', asset.id)
    .not('qr_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  ensureNoSupabaseError(error, 'Unable to fetch QR log')

  const storedQr = (data ?? []).find(
    (row: any) => typeof row?.qr_code === 'string' && row.qr_code.trim().length > 0
  )?.qr_code

  if (storedQr) return storedQr.trim()
  return buildAssetQrDataUri(asset.asset_tag || normalizedTag)
}

export async function createLog(assetTag: string, note: string) {
  const asset = await getAssetIdentityByTag(assetTag)
  return createLogForAsset(asset.id, asset.asset_tag, note)
}

async function getAssetIdentityByTag(assetTag: string): Promise<{ id: string; asset_tag: string }> {
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id,asset_tag')
    .eq('asset_tag', assetTag)
    .limit(1)
    .single()

  ensureNoSupabaseError(assetError, 'Asset not found')
  return asset
}

async function createLogForAsset(assetId: string, assetTag: string, note: string) {
  const qrCode = await buildAssetQrDataUri(assetTag)
  const { data, error } = await supabase
    .from('asset_logs')
    .insert({ asset_id: assetId, note, qr_code: qrCode })
    .select('id,note,qr_code,created_at')
    .single()

  ensureNoSupabaseError(error, 'Unable to create asset log')
  return data
}

async function buildAssetQrDataUri(assetTag: string): Promise<string> {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const scanUrl = `${baseOrigin}/assets/scan/${encodeURIComponent(assetTag)}`
  return QRCode.toDataURL(scanUrl, { margin: 2, width: 320 })
}

export async function scanAsset(assetTag: string) {
  const asset = await getAsset(assetTag)

  return {
    asset_tag: asset.asset_tag,
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

export async function getDashboardStats() {
  const [assetsRes, assignmentsRes, employeesRes] = await Promise.all([
    supabase.from('assets').select('id,status', { count: 'exact' }),
    supabase.from('asset_assignments').select('id,returned_at', { count: 'exact' }).is('returned_at', null),
    supabase.from('employees').select('id,is_active', { count: 'exact' }),
  ])

  ensureNoSupabaseError(assetsRes.error, 'Unable to load dashboard assets stats')
  ensureNoSupabaseError(assignmentsRes.error, 'Unable to load dashboard assignment stats')
  ensureNoSupabaseError(employeesRes.error, 'Unable to load dashboard employee stats')

  const totalAssets = assetsRes.count ?? 0
  const assignedAssets = assignmentsRes.count ?? 0
  const activeEmployees = (employeesRes.data ?? []).filter((row: any) => row.is_active).length
  const totalEmployees = employeesRes.count ?? 0

  return {
    totalAssets,
    assignedAssets,
    inStockAssets: Math.max(totalAssets - assignedAssets, 0),
    activeEmployees,
    totalEmployees,
  }
}

export async function getPublicDashboardSummary(): Promise<PublicDashboardSummary> {
  const [assetsRes, assignmentsRes, categoryRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id,asset_tag,status', { count: 'exact' })
      .not('asset_tag', 'is', null)
      .neq('asset_tag', ''),
    supabase.from('asset_assignments').select('id,returned_at', { count: 'exact' }).is('returned_at', null),
    supabase
      .from('assets')
      .select('asset_tag,category:asset_categories(name)')
      .not('asset_tag', 'is', null)
      .neq('asset_tag', ''),
  ])

  ensureNoSupabaseError(assetsRes.error, 'Unable to load public assets stats')
  ensureNoSupabaseError(assignmentsRes.error, 'Unable to load public assignment stats')
  ensureNoSupabaseError(categoryRes.error, 'Unable to load category breakdown')

  const breakdownMap = new Map<string, number>()
  for (const row of categoryRes.data ?? []) {
    const category = Array.isArray((row as any).category) ? (row as any).category[0] : (row as any).category
    const categoryName = typeof category?.name === 'string' && category.name.trim() ? category.name.trim() : 'Uncategorized'
    breakdownMap.set(categoryName, (breakdownMap.get(categoryName) ?? 0) + 1)
  }

  const categoryBreakdown = Array.from(breakdownMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const totalAssets = assetsRes.count ?? 0
  const assignedAssets = Math.min(assignmentsRes.count ?? 0, totalAssets)

  return {
    totalAssets,
    assignedAssets,
    inStockAssets: Math.max(totalAssets - assignedAssets, 0),
    categoryBreakdown,
  }
}

export function subscribeDashboardRealtime(onChange: () => void) {
  const channel = supabase
    .channel('dashboard-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_assignments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_logs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_components' }, onChange)
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function getPublicScanAsset(assetTag: string) {
  const normalizedTag = assetTag.trim()
  if (!normalizedTag) {
    throw new Error('Asset not found')
  }

  const { data, error } = await supabase.rpc('fn_public_scan_asset', {
    p_asset_tag: normalizedTag,
  })
  ensureNoSupabaseError(error, 'Unable to scan asset')

  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') {
    throw new Error('Asset not found')
  }

  return payload
}

export { ERP_ACTIVE_LABEL, ERP_INACTIVE_LABEL }
