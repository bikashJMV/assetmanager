import type { Session, User } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { supabase } from './supabaseClient'

/** Production deploy origin embedded in QRs when `npm run build` runs (override with `VITE_PUBLIC_APP_ORIGIN`). */
const PRODUCTION_QR_APP_ORIGIN = 'https://web-assetmanager.vercel.app'

export type SessionEmployee = {
  id: string
  employee_code: string
  name: string
  email: string | null
  department: string | null
  role: EmployeeRole
  /** Employee / account active (employment). */
  is_active: boolean
  /** ERP / platform entitlement; independent of `is_active`. */
  erp_active: boolean
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
  erp_active: boolean
  metadata: Record<string, unknown>
}

export type RecycleBinEntry = {
  entry_id: string
  entity_type: 'asset' | 'employee'
  entity_id: string
  label: string
  payload: Record<string, unknown>
  deleted_at: string
  deleted_by_employee_id: string
  deleted_by_employee_code: string | null
  deleted_by_employee_name: string | null
}

export type EmployeeListFilters = {
  search?: string
  is_active?: boolean | 'all'
  erp_active?: boolean | 'all'
  department?: string
  role?: string
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
  current_employee_code: string | null
  current_employee_name: string | null
  current_employee_email: string | null
  /** Holder employee account active (`employees.is_active`). */
  current_employee_is_active: boolean | null
  /** Holder ERP entitlement (`employees.erp_active`). */
  current_employee_erp_active: boolean | null
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
    employee_code: string
    name: string
    is_active: boolean
    erp_active: boolean
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
  /** When actor_id matches employees.auth_user_id */
  actor_employee_id: string | null
  actor_name: string | null
  actor_employee_code: string | null
  actor_department_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

export type AssetEventActorSnapshot = {
  actor_id: string | null
  actor_employee_id: string | null
  actor_employee_code: string | null
  actor_name: string | null
  actor_department_name: string | null
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
}

export type PublicDashboardSummary = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  categoryBreakdown: Array<{ category: string; count: number }>
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
  /** Display name for new categories (e.g. Other flow). Defaults to title-case from slug. */
  category_name?: string
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

/** Aligns with DB slug normalization in `fn_create_asset_with_log`. */
export function slugifyCategoryLabel(input: string): string {
  const raw = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return raw
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

/** Supabase may return JSONB RPC results as an object, a one-element array, or a JSON string. */
function extractRpcJsonbObject(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return extractRpcJsonbObject(JSON.parse(data) as unknown)
    } catch {
      return null
    }
  }
  if (Array.isArray(data) && data.length > 0) {
    return extractRpcJsonbObject(data[0])
  }
  if (typeof data === 'object') {
    let row = data as Record<string, unknown>
    const keys = Object.keys(row)
    if (keys.length === 1) {
      const inner = row[keys[0]]
      if (
        inner &&
        typeof inner === 'object' &&
        !Array.isArray(inner) &&
        ('ok' in inner || 'message' in inner)
      ) {
        row = inner as Record<string, unknown>
      }
    }
    return row
  }
  return null
}

function rpcPayloadOk(row: Record<string, unknown> | null): boolean {
  if (!row) return false
  const v = row.ok
  return v === true || v === 'true' || v === 1
}

function normalizeRole(
  metadata: Record<string, unknown> | null | undefined,
  directRole?: unknown,
): EmployeeRole {
  const roleFromColumn = typeof directRole === 'string' ? directRole.trim() : ''
  if (roleFromColumn) {
    const normalized = roleFromColumn.toLowerCase()
    if (normalized === 'it_ops') return 'it_ops'
    if (normalized === 'admin') return 'admin'
    return 'employee'
  }

  const roleFromMetadata = typeof metadata?.role === 'string' ? metadata.role.trim() : ''
  if (!roleFromMetadata) return 'employee'
  const normalized = roleFromMetadata.toLowerCase()
  if (normalized === 'it_ops') return 'it_ops'
  if (normalized === 'admin') return 'admin'
  return 'employee'
}

function normalizeEmployeeRoleInput(value: string | null | undefined): EmployeeRole {
  const normalized = (value || 'employee').trim().toLowerCase()
  if (normalized === 'it_ops') return 'it_ops'
  if (normalized === 'admin') return 'admin'
  if (normalized === 'employee') return 'employee'
  throw new Error('Role must be employee, admin, or it_ops')
}

function normalizeEmployeeRow(row: Record<string, unknown>): EmployeeRecord {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const departmentValue: unknown = row.department ?? row.departments ?? null
  const departmentName = Array.isArray(departmentValue)
    ? (typeof departmentValue[0] === 'object' &&
        departmentValue[0] !== null &&
        'name' in departmentValue[0] &&
        typeof (departmentValue[0] as { name: unknown }).name === 'string'
      ? (departmentValue[0] as { name: string }).name
      : null)
    : departmentValue !== null &&
        typeof departmentValue === 'object' &&
        'name' in departmentValue &&
        typeof (departmentValue as { name: unknown }).name === 'string'
      ? (departmentValue as { name: string }).name
      : null

  return {
    id: String(row.id ?? ''),
    employee_code: String(row.employee_code ?? ''),
    name: String(row.name ?? ''),
    email: typeof row.email === 'string' ? row.email : null,
    department: departmentName,
    role: normalizeRole(metadata, row.resolved_role ?? row.role),
    is_active: Boolean(row.is_active),
    // When `erp_active` is absent (pre-migration row shape), mirror employment flag like DB backfill.
    erp_active: row.erp_active === undefined ? Boolean(row.is_active) : Boolean(row.erp_active),
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

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const code = typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: unknown }).code)
    : ''
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? String((error as { message?: unknown }).message).toLowerCase()
    : ''
  const hint = tableName.toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes(hint) ||
    message.includes('could not find the table')
  )
}

function isMissingColumnError(error: unknown, tableName: string, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const code = typeof (error as { code?: unknown }).code === 'string'
    ? String((error as { code?: unknown }).code)
    : ''
  const message = typeof (error as { message?: unknown }).message === 'string'
    ? String((error as { message?: unknown }).message).toLowerCase()
    : ''
  const needle = `column ${tableName.toLowerCase()}.${columnName.toLowerCase()}`
  return code === '42703' || message.includes(needle) || message.includes(`${columnName.toLowerCase()} does not exist`)
}

const ASSET_DETAIL_LIFECYCLE_LIMIT = 100

function parseActorSnapshot(payload: Record<string, unknown>): AssetEventActorSnapshot | null {
  const raw = payload.actor_snapshot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  return {
    actor_id: typeof s.actor_id === 'string' ? s.actor_id : null,
    actor_employee_id: typeof s.actor_employee_id === 'string' ? s.actor_employee_id : null,
    actor_employee_code: typeof s.actor_employee_code === 'string' ? s.actor_employee_code : null,
    actor_name: typeof s.actor_name === 'string' ? s.actor_name : null,
    actor_department_name: typeof s.actor_department_name === 'string' ? s.actor_department_name : null,
  }
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

export async function signInWithGoogle(nextPath?: string) {
  const normalizedNextPath =
    typeof nextPath === 'string' && nextPath.trim() && nextPath.trim().startsWith('/')
      ? nextPath.trim()
      : '/'

  const redirectTo = `${window.location.origin}${normalizedNextPath}`

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
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
  if (profile && profile.role !== 'employee' && profile.is_active) {
    return { allowed: true }
  }

  const linkIssue = await claimCurrentEmployeeAuthLink()
  const { data, error } = await supabase.rpc('fn_is_admin_or_it_ops')
  if (error && !isMissingRpcError(error, 'fn_is_admin_or_it_ops')) {
    ensureNoSupabaseError(error, 'Unable to verify access')
  }

  const allowed = error ? false : (extractRpcScalarBoolean(data, ['fn_is_admin_or_it_ops']) ?? false)
  if (allowed) {
    return { allowed: true }
  }

  if (linkIssue) {
    return { allowed: false, reason: linkIssue }
  }

  return {
    allowed: false,
    reason: 'Signed-in account must be linked to an active admin/IT Ops employee record.',
  }
}

export async function hasActiveAdminAccess(): Promise<boolean> {
  const state = await getActiveAdminAccessState()
  return state.allowed
}

async function assertActiveAdminAccess() {
  const state = await getActiveAdminAccessState()
  if (!state.allowed) {
    throw new Error(state.reason || 'Signed-in account must be linked to an active admin/IT Ops employee record.')
  }
}

/** Soft check for UI (does not throw on transient RPC errors). */
export async function hasActiveItOpsAccess(): Promise<boolean> {
  try {
    const profile = await getSessionEmployee()
    if (profile?.is_active && profile.role === 'it_ops') return true
    const { data, error } = await supabase.rpc('fn_is_it_ops')
    if (error) return false
    return extractRpcScalarBoolean(data, ['fn_is_it_ops']) ?? false
  } catch {
    return false
  }
}

async function assertActiveItOpsAccess() {
  const profile = await getSessionEmployee()
  if (profile?.is_active && profile.role === 'it_ops') return
  const { data, error } = await supabase.rpc('fn_is_it_ops')
  if (error && !isMissingRpcError(error, 'fn_is_it_ops')) {
    ensureNoSupabaseError(error, 'Unable to verify IT Ops access')
  }
  const allowed = error ? false : (extractRpcScalarBoolean(data, ['fn_is_it_ops']) ?? false)
  if (!allowed) {
    throw new Error('Signed-in account must be linked to an active IT Ops employee record.')
  }
}

export async function getSessionEmployee(user?: User | null): Promise<SessionEmployee | null> {
  const activeUser = user ?? (await getSession())?.user
  if (!activeUser) return null

  const columns = 'id,employee_code,name,email,is_active,erp_active,role,metadata,department:departments(name)'
  let data: Record<string, unknown> | null = null

  // Primary lookup by auth_user_id is more reliable than email matching.
  let byAuthId = await supabase
    .from('employees')
    .select(columns)
    .eq('auth_user_id', activeUser.id)
    .eq('is_deleted', false)
    .limit(1)
    .maybeSingle()
  if (isMissingColumnError(byAuthId.error, 'employees', 'is_deleted')) {
    byAuthId = await supabase
      .from('employees')
      .select(columns)
      .eq('auth_user_id', activeUser.id)
      .limit(1)
      .maybeSingle()
  }
  ensureNoSupabaseError(byAuthId.error, 'Unable to load employee profile')
  data = byAuthId.data

  // Fallback: case-insensitive email lookup for legacy rows missing auth_user_id link.
  if (!data && activeUser.email?.trim()) {
    let byEmail = await supabase
      .from('employees')
      .select(columns)
      .ilike('email', activeUser.email.trim())
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle()
    if (isMissingColumnError(byEmail.error, 'employees', 'is_deleted')) {
      byEmail = await supabase
        .from('employees')
        .select(columns)
        .ilike('email', activeUser.email.trim())
        .limit(1)
        .maybeSingle()
    }
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
    .map((row) => (typeof row?.name === 'string' ? row.name.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(names))
}

const EMPLOYEE_LIST_SELECT_WITH_ERP =
  'id,employee_code,name,email,is_active,erp_active,role,metadata,department:departments(name)'
const EMPLOYEE_LIST_SELECT_WITHOUT_ERP =
  'id,employee_code,name,email,is_active,role,metadata,department:departments(name)'

async function runEmployeeListQuery(
  filters: EmployeeListFilters,
  options: { includeErpColumn: boolean; includeDeletedGuard: boolean },
) {
  const selectCols = options.includeErpColumn ? EMPLOYEE_LIST_SELECT_WITH_ERP : EMPLOYEE_LIST_SELECT_WITHOUT_ERP
  let q = supabase.from('employees').select(selectCols).order('name', { ascending: true })

  if (options.includeDeletedGuard) {
    q = q.eq('is_deleted', false)
  }

  if (filters.search?.trim()) {
    const s = filters.search.trim()
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,employee_code.ilike.%${s}%`)
  }

  if (filters.is_active !== undefined && filters.is_active !== 'all') {
    q = q.eq('is_active', filters.is_active)
  }

  if (options.includeErpColumn && filters.erp_active !== undefined && filters.erp_active !== 'all') {
    q = q.eq('erp_active', filters.erp_active)
  }

  if (filters.department?.trim()) {
    const departmentId = await resolveDepartmentIdByName(filters.department)
    if (!departmentId) return { data: [], error: null }
    q = q.eq('department_id', departmentId)
  }

  return q
}

export async function listEmployees(filters: EmployeeListFilters = {}): Promise<EmployeeRecord[]> {
  let { data, error } = await runEmployeeListQuery(filters, { includeErpColumn: true, includeDeletedGuard: true })

  if (error && isMissingColumnError(error, 'employees', 'erp_active')) {
    const retry = await runEmployeeListQuery(filters, { includeErpColumn: false, includeDeletedGuard: true })
    data = retry.data
    error = retry.error
  }

  if (error && isMissingColumnError(error, 'employees', 'is_deleted')) {
    const fallback = await runEmployeeListQuery(filters, { includeErpColumn: true, includeDeletedGuard: false })
    data = fallback.data
    error = fallback.error
    if (error && isMissingColumnError(error, 'employees', 'erp_active')) {
      const retry = await runEmployeeListQuery(filters, { includeErpColumn: false, includeDeletedGuard: false })
      data = retry.data
      error = retry.error
    }
  }

  ensureNoSupabaseError(error, 'Unable to load employees')

  let rows = (data ?? []).map((r) => normalizeEmployeeRow(r as unknown as Record<string, unknown>))

  if (filters.erp_active !== undefined && filters.erp_active !== 'all') {
    rows = rows.filter((row) => row.erp_active === filters.erp_active)
  }

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
  erp_active: boolean
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
    erp_active: input.erp_active,
    metadata: existingMetadata,
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

export async function setEmployeeRole(
  targetEmployee: Pick<EmployeeRecord, 'id' | 'employee_code'>,
  role: EmployeeRole,
) {
  await assertActiveItOpsAccess()
  const normalizedRole = normalizeEmployeeRoleInput(role)

  const { data, error } = await supabase.rpc('fn_set_employee_role', {
    p_target_employee_id: targetEmployee.id,
    p_new_role: normalizedRole,
    p_metadata: {
      source: 'employee-page',
      target_employee_code: targetEmployee.employee_code,
    },
  })
  ensureNoSupabaseError(error, 'Unable to update employee role')

  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response while updating employee role')
  }

  if ((payload as { ok?: boolean }).ok === false) {
    const message = (payload as { message?: unknown }).message
    throw new Error(typeof message === 'string' && message.trim() ? message.trim() : 'Unable to update employee role')
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

  const categoryDisplayName = payload.category_name?.trim() || toCategoryNameFromSlug(categorySlug)

  const { data, error } = await supabase.rpc('fn_create_asset_with_log', {
    p_asset_tag: assetTag,
    p_category_slug: categorySlug,
    p_category_name: categoryDisplayName,
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
    .eq('is_deleted', false)
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

  // PostgREST: use `is.true` for booleans (see postgrest.org horizontal filtering). `eq.true` can miss rows on some stacks.
  if (filters.hideHeldByInactive) {
    query = query.or('assignment_id.is.null,current_employee_erp_active.is.true')
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

  const [componentsResponse, assignmentsResponse, eventsResponse] = await Promise.all([
    supabase
      .from('asset_components')
      .select('id,component_type,model,serial_number,metadata,manufacturer:manufacturers(name)')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('asset_assignments')
      .select('id,assigned_at,returned_at,source,notes,employee:employees(id,employee_code,name,is_active,erp_active)')
      .eq('asset_id', asset.id)
      .order('assigned_at', { ascending: false }),
    supabase
      .from('asset_events')
      .select('id,event_type,actor_id,payload,created_at')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false })
      .limit(ASSET_DETAIL_LIFECYCLE_LIMIT),
  ])

  ensureNoSupabaseError(componentsResponse.error, 'Unable to load components')
  ensureNoSupabaseError(assignmentsResponse.error, 'Unable to load assignments')

  const components: AssetComponentRecord[] = (componentsResponse.data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const manufacturer = Array.isArray(r.manufacturer) ? r.manufacturer[0] : r.manufacturer
    const m = manufacturer && typeof manufacturer === 'object' && !Array.isArray(manufacturer) && 'name' in manufacturer
      ? (manufacturer as { name?: unknown }).name
      : null
    return {
      id: String(r.id ?? ''),
      component_type: String(r.component_type ?? ''),
      model: typeof r.model === 'string' ? r.model : r.model == null ? null : String(r.model),
      serial_number: typeof r.serial_number === 'string' ? r.serial_number : r.serial_number == null ? null : String(r.serial_number),
      metadata: (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? r.metadata : {}) as Record<
        string,
        unknown
      >,
      manufacturer_name: typeof m === 'string' ? m : null,
    }
  })

  const assignments: AssetAssignmentRecord[] = (assignmentsResponse.data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const employeeRaw = Array.isArray(r.employee) ? r.employee[0] : r.employee
    const employee =
      employeeRaw && typeof employeeRaw === 'object' && !Array.isArray(employeeRaw)
        ? (employeeRaw as Record<string, unknown>)
        : null
    return {
      id: String(r.id ?? ''),
      assigned_at: String(r.assigned_at ?? ''),
      returned_at: r.returned_at == null ? null : String(r.returned_at),
      source: String(r.source ?? ''),
      notes: r.notes == null ? null : String(r.notes),
      employee: employee
        ? {
          id: String(employee.id ?? ''),
          employee_code: String(employee.employee_code ?? ''),
          name: String(employee.name ?? ''),
          is_active: Boolean(employee.is_active),
          erp_active:
            employee.erp_active === undefined ? Boolean(employee.is_active) : Boolean(employee.erp_active),
        }
        : null,
    }
  })

  const lifecycle_events: AssetLifecycleEvent[] = []
  let lifecycle_is_capped = false
  if (eventsResponse.error) {
    if (!isMissingTableError(eventsResponse.error, 'asset_events')) {
      ensureNoSupabaseError(eventsResponse.error, 'Unable to load lifecycle events')
    }
  } else if (eventsResponse.data) {
    const rawEvents = eventsResponse.data as Record<string, unknown>[]
    lifecycle_is_capped = rawEvents.length >= ASSET_DETAIL_LIFECYCLE_LIMIT
    const actorIds = [
      ...new Set(
        rawEvents
          .map((r) => {
            const payload = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
              ? (r.payload as Record<string, unknown>)
              : {}
            const snapshot = parseActorSnapshot(payload)
            const actorIdFromSnapshot = snapshot?.actor_id
            if (typeof actorIdFromSnapshot === 'string' && actorIdFromSnapshot.length > 0) {
              return actorIdFromSnapshot
            }
            const rowActor = r.actor_id
            return typeof rowActor === 'string' && rowActor.length > 0 ? rowActor : null
          })
          .filter((id: string | null): id is string => typeof id === 'string' && id.length > 0),
      ),
    ]
    const actorByAuthUserId = new Map<
      string,
      { id: string; employee_code: string; name: string; department_name: string | null }
    >()
    if (actorIds.length > 0) {
      const { data: actorRows, error: actorErr } = await supabase
        .from('employees')
        .select('id,employee_code,name,auth_user_id,department:departments(name)')
        .in('auth_user_id', actorIds)
      if (!actorErr && actorRows) {
        for (const row of actorRows) {
          const e = row as {
            id: string
            employee_code: string
            name: string
            auth_user_id?: string | null
            department?: { name?: string } | { name?: string }[] | null
          }
          const uid = e.auth_user_id
          if (uid) {
            const deptVal = e.department
            const deptName = Array.isArray(deptVal)
              ? (typeof deptVal[0]?.name === 'string' ? deptVal[0].name : null)
              : typeof deptVal?.name === 'string'
                ? deptVal.name
                : null
            actorByAuthUserId.set(uid, {
              id: String(e.id),
              employee_code: String(e.employee_code ?? ''),
              name: String(e.name ?? ''),
              department_name: deptName,
            })
          }
        }
      }
    }
    for (const row of rawEvents) {
      const payload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {}
      const snapshot = parseActorSnapshot(payload)
      const aid =
        snapshot?.actor_id ??
        (typeof row.actor_id === 'string' && row.actor_id.length > 0 ? row.actor_id : null)
      const emp = aid ? actorByAuthUserId.get(aid) : undefined
      lifecycle_events.push({
        id: String(row.id ?? ''),
        event_type: String(row.event_type ?? ''),
        actor_id: aid,
        actor_employee_id: snapshot?.actor_employee_id ?? emp?.id ?? null,
        actor_name: snapshot?.actor_name ?? emp?.name ?? null,
        actor_employee_code: snapshot?.actor_employee_code ?? emp?.employee_code ?? null,
        actor_department_name: snapshot?.actor_department_name ?? emp?.department_name ?? null,
        payload,
        created_at: String(row.created_at ?? ''),
      })
    }
  }

  return { asset, assignments, components, lifecycle_events, lifecycle_is_capped }
}

export async function assignAsset(payload: AssignAssetPayload) {
  await assertActiveAdminAccess()
  // Omit p_assigned_at when unset: passing null overrides the SQL arg default now() and breaks NOT NULL on assigned_at.
  const { data, error } = await supabase.rpc('fn_assign_asset', {
    p_asset_tag: payload.asset_tag.trim(),
    p_employee_code: payload.employee_code.trim(),
    ...(payload.assigned_at?.trim() ? { p_assigned_at: payload.assigned_at.trim() } : {}),
    p_source: 'runtime',
    p_notes: payload.notes ?? null,
  })

  ensureNoSupabaseError(error, 'Unable to assign asset')
  const result = extractRpcJsonbObject(data)
  if (!rpcPayloadOk(result)) {
    const msg =
      typeof result?.message === 'string' && result.message.trim()
        ? result.message.trim()
        : data == null
          ? 'No data returned from assign. Confirm fn_assign_asset is deployed on the database.'
          : 'Assign failed — invalid response from server. Confirm fn_assign_asset migrations are applied.'
    throw new Error(msg)
  }
  return result
}

export async function returnAsset(payload: ReturnAssetPayload) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_return_asset', {
    p_asset_tag: payload.asset_tag.trim(),
    p_returned_at: payload.returned_at || null,
    p_source: 'runtime',
    p_notes: payload.notes || null,
  })

  ensureNoSupabaseError(error, 'Unable to return asset')
  const result = extractRpcJsonbObject(data)
  if (!rpcPayloadOk(result)) {
    const msg =
      typeof result?.message === 'string' && result.message.trim()
        ? result.message.trim()
        : data == null
          ? 'No data returned from return. Confirm fn_return_asset is deployed on the database.'
          : 'Return failed — invalid response from server. Confirm fn_return_asset migrations are applied.'
    throw new Error(msg)
  }
  return result
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

export async function listWarrantyNotifications(windowDays = 30): Promise<WarrantyNotification[]> {
  const days = Number.isFinite(windowDays) ? Math.max(1, Math.floor(windowDays)) : 30
  const { data, error } = await supabase.rpc('fn_list_warranty_notifications', {
    p_days: days,
  })
  ensureNoSupabaseError(error, 'Unable to load warranty notifications')

  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      notification_id: String(r.notification_id ?? ''),
      asset_id: String(r.asset_id ?? ''),
      asset_tag: typeof r.asset_tag === 'string' ? r.asset_tag : null,
      model: typeof r.model === 'string' ? r.model : null,
      category_name: typeof r.category_name === 'string' ? r.category_name : null,
      current_employee_id: typeof r.current_employee_id === 'string' ? r.current_employee_id : null,
      current_employee_name: typeof r.current_employee_name === 'string' ? r.current_employee_name : null,
      warranty_expiry: String(r.warranty_expiry ?? ''),
      days_remaining: Number(r.days_remaining ?? 0),
      severity: r.severity === 'expired' ? 'expired' : 'due_soon',
      message: String(r.message ?? ''),
    }
  })
}

export async function getWelcomeNotification(): Promise<WelcomeNotification | null> {
  const { data, error } = await supabase.rpc('fn_get_welcome_notification')
  if (error) {
    if (isMissingRpcError(error, 'fn_get_welcome_notification')) {
      return null
    }
    ensureNoSupabaseError(error, 'Unable to load welcome notification')
  }
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') return null

  const pl = payload as Record<string, unknown>
  return {
    show_alert: Boolean(pl.show_alert),
    title: String(pl.title ?? ''),
    message: String(pl.message ?? ''),
  }
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

  const hasExplicitPublicOrigin =
    typeof import.meta.env.VITE_PUBLIC_APP_ORIGIN === 'string' &&
    import.meta.env.VITE_PUBLIC_APP_ORIGIN.trim() !== ''

  // Stored `asset_logs.qr_code` embeds whatever origin existed at creation time (often localhost
  // during dev). In production, always render a fresh QR from the current deployment origin so
  // scans do not open stale hosts. With an explicit VITE_PUBLIC_APP_ORIGIN, same idea for previews.
  const useStoredFromDb =
    import.meta.env.VITE_TRUST_STORED_ASSET_QR === 'true' ||
    (import.meta.env.DEV && !hasExplicitPublicOrigin)

  if (useStoredFromDb) {
    const { data, error } = await supabase
      .from('asset_logs')
      .select('qr_code,created_at')
      .eq('asset_id', asset.id)
      .not('qr_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    ensureNoSupabaseError(error, 'Unable to fetch QR log')

    const storedQr = (data ?? []).find(
      (row) => typeof row?.qr_code === 'string' && row.qr_code.trim().length > 0
    )?.qr_code

    if (storedQr) return storedQr.trim()

    const created = await createLogForAsset(
      asset.id,
      asset.asset_tag || normalizedTag,
      'Auto-generated individual QR for asset'
    )
    if (typeof created?.qr_code === 'string' && created.qr_code.trim().length > 0) {
      return created.qr_code.trim()
    }
  }

  return buildAssetQrDataUri(asset.asset_tag || normalizedTag)
}

export async function regenerateQrDataUriForAssetTag(assetTag: string): Promise<string> {
  await assertActiveItOpsAccess()

  const normalizedTag = assetTag.trim()
  if (!normalizedTag) {
    throw new Error('Asset tag is required to generate QR')
  }

  const asset = await getAssetIdentityByTag(normalizedTag)
  const created = await createLogForAsset(asset.id, asset.asset_tag, 'Regenerated individual QR for asset')

  if (typeof created?.qr_code === 'string' && created.qr_code.trim().length > 0) {
    return created.qr_code.trim()
  }

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
    .eq('is_deleted', false)
    .limit(1)
    .single()

  ensureNoSupabaseError(assetError, 'Asset not found')
  return asset
}

export async function softDeleteAssetById(assetId: string, note?: string) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_soft_delete_asset', {
    p_asset_id: assetId,
    p_note: note?.trim() || null,
  })
  ensureNoSupabaseError(error, 'Unable to delete asset')
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected response while deleting asset')
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Unable to delete asset'))
  }
}

export async function softDeleteEmployeeById(employeeId: string, note?: string) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_soft_delete_employee', {
    p_employee_id: employeeId,
    p_note: note?.trim() || null,
  })
  ensureNoSupabaseError(error, 'Unable to delete employee')
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected response while deleting employee')
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Unable to delete employee'))
  }
}

export async function listRecycleBinEntries(): Promise<RecycleBinEntry[]> {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_list_recycle_bin_entries')
  ensureNoSupabaseError(error, 'Unable to load recycle bin')
  const rows = Array.isArray(data) ? data : []
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      entry_id: String(r.entry_id ?? ''),
      entity_type: r.entity_type === 'employee' ? 'employee' : 'asset',
      entity_id: String(r.entity_id ?? ''),
      label: String(r.label || ''),
      payload: r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {},
      deleted_at: String(r.deleted_at ?? ''),
      deleted_by_employee_id: String(r.deleted_by_employee_id ?? ''),
      deleted_by_employee_code: typeof r.deleted_by_employee_code === 'string' ? r.deleted_by_employee_code : null,
      deleted_by_employee_name: typeof r.deleted_by_employee_name === 'string' ? r.deleted_by_employee_name : null,
    }
  })
}

export async function restoreRecycleBinEntry(entryId: string) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_restore_recycle_bin_entry', {
    p_entry_id: entryId,
  })
  ensureNoSupabaseError(error, 'Unable to restore item')
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected response while restoring item')
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Unable to restore item'))
  }
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

/**
 * Origin embedded in asset QR codes (`/scan/{tag}`).
 * - **Production build:** `https://web-assetmanager.vercel.app` unless `VITE_PUBLIC_APP_ORIGIN` is set (staging / fork).
 * - **Development:** `window.location.origin`, or set `VITE_PUBLIC_APP_ORIGIN` for LAN phone testing.
 */
export function getScanPageBaseUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_APP_ORIGIN
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/\/$/, '')
    if (trimmed && /^https?:\/\//i.test(trimmed)) {
      return trimmed
    }
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_QR_APP_ORIGIN
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return PRODUCTION_QR_APP_ORIGIN
}

async function buildAssetQrDataUri(assetTag: string): Promise<string> {
  const base = getScanPageBaseUrl()
  const scanUrl = `${base}/scan/${encodeURIComponent(assetTag)}`
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
      ? (asset.current_employee_erp_active ? ERP_ACTIVE_LABEL : ERP_INACTIVE_LABEL)
      : 'N/A',
    custom_fields: asset.custom_fields,
  }
}

export async function getDashboardStats() {
  const [assetsRes, assignmentsRes, employeesRes] = await Promise.all([
    supabase.from('assets').select('id,status', { count: 'exact' }).eq('is_deleted', false),
    supabase.from('asset_assignments').select('id,returned_at', { count: 'exact' }).is('returned_at', null),
    supabase.from('employees').select('id,is_active', { count: 'exact' }).eq('is_deleted', false),
  ])

  ensureNoSupabaseError(assetsRes.error, 'Unable to load dashboard assets stats')
  ensureNoSupabaseError(assignmentsRes.error, 'Unable to load dashboard assignment stats')
  ensureNoSupabaseError(employeesRes.error, 'Unable to load dashboard employee stats')

  const totalAssets = assetsRes.count ?? 0
  const assignedAssets = assignmentsRes.count ?? 0
  const activeEmployees = (employeesRes.data ?? []).filter((row) => row.is_active === true).length
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
      .eq('is_deleted', false)
      .not('asset_tag', 'is', null)
      .neq('asset_tag', ''),
    supabase.from('asset_assignments').select('id,returned_at', { count: 'exact' }).is('returned_at', null),
    supabase
      .from('assets')
      .select('asset_tag,category:asset_categories(name)')
      .eq('is_deleted', false)
      .not('asset_tag', 'is', null)
      .neq('asset_tag', ''),
  ])

  ensureNoSupabaseError(assetsRes.error, 'Unable to load public assets stats')
  ensureNoSupabaseError(assignmentsRes.error, 'Unable to load public assignment stats')
  ensureNoSupabaseError(categoryRes.error, 'Unable to load category breakdown')

  type CategoryJoinRow = { category?: { name?: string } | { name?: string }[] | null }
  const breakdownMap = new Map<string, number>()
  for (const row of (categoryRes.data ?? []) as CategoryJoinRow[]) {
    const category = Array.isArray(row.category) ? row.category[0] : row.category
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

/** Payload from `fn_public_scan_asset` (anonymous QR): basic identity + inventory status only. */
export type PublicScanAsset = {
  asset_tag: string | null
  category: string | null
  manufacturer: string | null
  model: string | null
  status: string
}

export async function getPublicScanAsset(assetTag: string): Promise<PublicScanAsset> {
  const normalizedTag = assetTag.trim()
  if (!normalizedTag) {
    throw new Error('Asset not found')
  }

  const userAgent =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : ''

  const { data, error } = await supabase.rpc('fn_public_scan_asset', {
    p_asset_tag: normalizedTag,
    p_user_agent: userAgent || null,
  })
  ensureNoSupabaseError(error, 'Unable to scan asset')

  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') {
    throw new Error('Asset not found')
  }

  const p = payload as Record<string, unknown>
  return {
    asset_tag: typeof p.asset_tag === 'string' ? p.asset_tag : null,
    category: typeof p.category === 'string' ? p.category : null,
    manufacturer: typeof p.manufacturer === 'string' ? p.manufacturer : null,
    model: typeof p.model === 'string' ? p.model : null,
    status: typeof p.status === 'string' ? p.status : String(p.status ?? ''),
  }
}

export { ERP_ACTIVE_LABEL, ERP_INACTIVE_LABEL }
