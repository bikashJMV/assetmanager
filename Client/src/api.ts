import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { supabase } from './supabaseClient'

/** Default origin in all QRs unless `VITE_PUBLIC_APP_ORIGIN` is set (staging / fork). */
const PRODUCTION_QR_APP_ORIGIN = 'https://web-assetmanager.vercel.app'

/**
 * BFF (FastAPI Server) base URL.
 * Reads VITE_API_URL from env; falls back to localhost:8000 for local dev.
 * Trailing slash stripped for safe concatenation.
 */
function getBffBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  return raw ? raw.replace(/\/$/, '') : 'http://localhost:8000'
}

/** Build headers for calls to the BFF server (includes X-API-Key when configured). */
function bffHeaders(): Record<string, string> {
  const key = (import.meta.env.VITE_BACKEND_API_KEY as string | undefined)?.trim() ?? ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['X-API-Key'] = key
  return headers
}

/** Strip path segments and unsafe patterns from server-provided download names (RFC 5987 / filename=). */
function sanitizeDownloadFileName(raw: string, fallback: string): string {
  let base = raw.trim().replace(/^.*[/\\]/, '').replace(/\0/g, '') || fallback
  if (base === '.' || base === '..' || base.includes('..')) base = fallback
  return base.length > 180 ? base.slice(0, 180) : base
}

function extractDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return sanitizeDownloadFileName(fallback, fallback)

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return sanitizeDownloadFileName(decodeURIComponent(utf8Match[1]), fallback)
    } catch {
      return sanitizeDownloadFileName(utf8Match[1], fallback)
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
  const fromHeader = basicMatch?.[1]?.trim()
  return sanitizeDownloadFileName(fromHeader || fallback, fallback)
}

async function readBffErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const payload = await resp.json()
    const data =
      payload && typeof payload === 'object' && 'data' in payload
        ? (payload as { data?: unknown }).data
        : payload

    if (data && typeof data === 'object') {
      const message = (data as { message?: unknown; detail?: unknown }).message ?? (data as { detail?: unknown }).detail
      if (typeof message === 'string' && message.trim()) return message.trim()
    }

    if (payload && typeof payload === 'object') {
      const message = (payload as { message?: unknown; detail?: unknown }).message ?? (payload as { detail?: unknown }).detail
      if (typeof message === 'string' && message.trim()) return message.trim()
    }
  } catch {
    // Fall back to the provided message when the response is not JSON.
  }

  return fallback
}

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

export type RecycleBinEntry = {
  entry_id: string
  entity_type: 'asset' | 'employee'
  entity_id: string
  label: string
  payload: Record<string, unknown>
  deleted_at: string
  deleted_by_employee_id: string
  deleted_by_employee_id_code: string | null
  deleted_by_employee_name: string | null
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
  current_employee_code: string | null
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
  /** Text employee id from inventory view (`current_employee_code` alias). */
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
  return {
    id: String(row.id ?? ''),
    employee_id: String(row.employee_id ?? ''),
    name: String(row.name ?? ''),
    email: typeof row.email === 'string' ? row.email : null,
    department: typeof row.department === 'string' ? row.department : null,
    role: normalizeRole({}, row.role),
    is_active: Boolean(row.is_active),
  }
}

function formatPostgrestClientError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const e = error as { message?: string; details?: string; hint?: string }
  const parts = [e.message, e.details, e.hint]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : fallback
}

function ensureNoSupabaseError(error: unknown, fallback: string): asserts error is null {
  if (error) {
    const message = formatPostgrestClientError(error, fallback)
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

const ASSET_DETAIL_LIFECYCLE_LIMIT = 100

function snapshotString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return String(v).trim() || null
}

function parseActorSnapshot(payload: Record<string, unknown>): AssetEventActorSnapshot | null {
  const raw = payload.actor_snapshot
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  return {
    actor_id: snapshotString(s.actor_id),
    actor_employee_id: snapshotString(s.actor_employee_id),
    actor_employee_code: snapshotString(s.actor_employee_code),
    actor_name: snapshotString(s.actor_name),
    actor_department_name: snapshotString(s.actor_department_name),
  }
}

function normalizeAssetEventType(eventType: string | null | undefined): string {
  return typeof eventType === 'string' ? eventType.trim().toLowerCase() : ''
}

function isAssetUpdateAuditEventType(eventType: string | null | undefined): boolean {
  const normalized = normalizeAssetEventType(eventType)
  return (
    normalized === 'asset_updated' ||
    normalized === 'asset_restored' ||
    normalized === 'asset_deleted'
  )
}

function buildAssetAuditActorDisplay({
  authUserId,
  employee,
  fallbackEvent,
}: {
  authUserId?: string | null
  employee?: { name: string; employee_id: string } | null
  fallbackEvent?: Pick<AssetLifecycleEvent, 'actor_id' | 'actor_name' | 'actor_employee_code'> | null
}): AssetAuditActorDisplay | null {
  const resolvedAuthUserId = authUserId ?? fallbackEvent?.actor_id ?? null
  const resolvedName = employee?.name ?? fallbackEvent?.actor_name ?? null
  const resolvedEmployeeId = employee?.employee_id ?? fallbackEvent?.actor_employee_code ?? null

  if (!resolvedAuthUserId && !resolvedName && !resolvedEmployeeId) {
    return null
  }

  return {
    auth_user_id: resolvedAuthUserId,
    name: resolvedName,
    employee_id: resolvedEmployeeId,
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  ensureNoSupabaseError(error, 'Unable to get session')
  return data.session
}

export function onAuthStateChange(
  callback: (session: Session | null, event: AuthChangeEvent) => void,
) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    resetAuthDerivedCache()
    callback(session, event)
  })
  return () => {
    data.subscription.unsubscribe()
  }
}

const AUTH_DERIVED_CACHE_TTL_MS = 10_000

type AdminAccessState = { allowed: boolean; reason?: string }
type CachedAuthValue<T> = {
  key: string
  value?: T
  promise?: Promise<T>
  expiresAt: number
}

let sessionEmployeeCache: CachedAuthValue<SessionEmployee | null> | null = null
let adminAccessCache: CachedAuthValue<AdminAccessState> | null = null

function buildAuthCacheKey(user?: Pick<User, 'id' | 'email'> | null): string {
  if (!user?.id) return 'anonymous'
  return `${user.id}:${user.email ?? ''}`
}

function readCachedAuthValue<T>(cache: CachedAuthValue<T> | null, key: string): T | Promise<T> | null {
  if (!cache || cache.key !== key || cache.expiresAt <= Date.now()) return null
  if ('value' in cache) return cache.value as T
  if (cache.promise) return cache.promise
  return null
}

function resetAuthDerivedCache() {
  sessionEmployeeCache = null
  adminAccessCache = null
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
  if (error) {
    ensureNoSupabaseError(error, 'Unable to start Google sign-in')
  }
}

export async function signOut() {
  resetAuthDerivedCache()
  const { error } = await supabase.auth.signOut()
  ensureNoSupabaseError(error, 'Unable to sign out')
}

async function claimCurrentEmployeeAuthLink(session?: Session | null): Promise<string | null> {
  const activeSession = session ?? await getSession()
  if (!activeSession?.user?.email) return null

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

async function getActiveAdminAccessState(user?: User | null): Promise<{ allowed: boolean; reason?: string }> {
  const session = user ? ({ user } as Session) : await getSession()
  if (!session?.user) {
    return { allowed: false, reason: 'You are not signed in.' }
  }

  const cacheKey = buildAuthCacheKey(session.user)
  const cached = readCachedAuthValue(adminAccessCache, cacheKey)
  if (cached) {
    return await cached
  }

  const loadState = (async () => {
    const profile = await getSessionEmployee(session.user)
    if (profile && profile.role !== 'employee' && profile.is_active) {
      return { allowed: true }
    }

    const linkIssue = await claimCurrentEmployeeAuthLink(session)
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
  })()

  adminAccessCache = {
    key: cacheKey,
    promise: loadState,
    expiresAt: Date.now() + AUTH_DERIVED_CACHE_TTL_MS,
  }

  try {
    const state = await loadState
    if (adminAccessCache?.key === cacheKey) {
      adminAccessCache = {
        key: cacheKey,
        value: state,
        expiresAt: Date.now() + AUTH_DERIVED_CACHE_TTL_MS,
      }
    }
    return state
  } catch (error) {
    if (adminAccessCache?.key === cacheKey) {
      adminAccessCache = null
    }
    throw error
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

async function loadSessionEmployeeForUser(activeUser: User): Promise<SessionEmployee | null> {
  // Security definer RPC: auth_user_id lookup, email fallback, auto-link auth_user_id — bypasses RLS.
  // No auto-provision (migration 32): unknown accounts resolve to null.
  const displayName = activeUser.user_metadata?.full_name || activeUser.user_metadata?.name || null
  const { data, error } = await supabase.rpc('fn_get_session_employee', {
    p_auth_uid: activeUser.id,
    p_email: activeUser.email?.trim() || null,
    p_display_name: displayName,
  })

  if (error) {
    return null
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  const row = data as Record<string, unknown>
  const normalized = normalizeEmployeeRow(row)
  return {
    ...normalized,
    department: normalized.department,
  }
}

export async function getSessionEmployee(user?: User | null): Promise<SessionEmployee | null> {
  const activeUser = user ?? (await getSession())?.user
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

  const loadProfile = loadSessionEmployeeForUser(activeUser)
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
  const { data, error } = await supabase.from('employees').select('department')
  ensureNoSupabaseError(error, 'Unable to load departments')
  const names = [...new Set(
    (data ?? [])
      .map((row) => (typeof row.department === 'string' ? row.department.trim() : ''))
      .filter(Boolean),
  )]
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return names
}

const EMPLOYEE_LIST_SELECT = 'id,employee_id,name,email,is_active,role,department'

async function runEmployeeListQuery(
  filters: EmployeeListFilters,
  options: {
    countExact?: boolean
    offset?: number
    limit?: number
  } = {},
) {
  let q = supabase
    .from('v_employee_directory')
    .select(EMPLOYEE_LIST_SELECT, options.countExact ? { count: 'exact' } : undefined)
    .order('name', { ascending: true })

  if (filters.search?.trim()) {
    const s = filters.search.trim()
    q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,employee_id.ilike.%${s}%`)
  }

  if (filters.is_active !== undefined && filters.is_active !== 'all') {
    q = q.eq('is_active', filters.is_active)
  }

  if (filters.department?.trim()) {
    q = q.ilike('department', filters.department.trim())
  }

  if (filters.role?.trim()) {
    q = q.eq('role', filters.role.trim().toLowerCase())
  }

  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.max(1, options.limit ?? 0)
  if (limit > 0) {
    q = q.range(offset, offset + limit - 1)
  }

  return q
}

export async function listEmployees(filters: EmployeeListFilters = {}): Promise<EmployeeRecord[]> {
  const { data, error } = await runEmployeeListQuery(filters, {})
  ensureNoSupabaseError(error, 'Unable to load employees')

  let rows = (data ?? []).map((r) => normalizeEmployeeRow(r as unknown as Record<string, unknown>))

  if (filters.role?.trim()) {
    const targetRole = filters.role.trim().toLowerCase()
    rows = rows.filter((row) => row.role === targetRole)
  }

  return rows
}

export async function listEmployeesPage(
  filters: EmployeeListFilters = {},
  options: EmployeePageOptions = {}
): Promise<EmployeePageResult> {
  const queryOptions = {
    countExact: true,
    offset: Math.max(0, options.offset ?? 0),
    limit: Math.max(1, options.limit ?? 50),
  }

  const {
    data,
    error,
    count,
  } = (await runEmployeeListQuery(filters, queryOptions)) as {
    data: unknown[] | null
    error: unknown
    count: number | null
  }

  ensureNoSupabaseError(error, 'Unable to load employees')

  let rows = (data ?? []).map((r) => normalizeEmployeeRow(r as unknown as Record<string, unknown>))

  if (filters.role?.trim()) {
    const targetRole = filters.role.trim().toLowerCase()
    rows = rows.filter((row) => row.role === targetRole)
  }

  return {
    rows,
    total: count ?? rows.length,
  }
}

export async function getEmployeeById(employeeId: string): Promise<EmployeeRecord> {
  const trimmedId = employeeId.trim()
  if (!trimmedId) {
    throw new Error('Employee not found')
  }

  const selectCols = 'id,employee_id,name,email,is_active,role,department'

  // Use directory view (not raw `employees`) so rows with an open Recycle Bin entry are
  // invisible here, matching the All Employees list and /employee/:id expectations.
  const response = await supabase
    .from('v_employee_directory')
    .select(selectCols)
    .eq('id', trimmedId)
    .limit(1)
    .maybeSingle()

  ensureNoSupabaseError(response.error, 'Unable to load employee')

  if (!response.data) {
    throw new Error('Employee not found')
  }

  return normalizeEmployeeRow(response.data as unknown as Record<string, unknown>)
}

export async function getAssignedAssetCountsForEmployees(employeeIds: string[]): Promise<EmployeeAssetCountMap> {
  const ids = [...new Set(employeeIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('v_asset_inventory')
    .select('current_employee_id')
    .in('current_employee_id', ids)

  ensureNoSupabaseError(error, 'Unable to load employee asset counts')

  const counts: EmployeeAssetCountMap = {}
  for (const id of ids) counts[id] = 0

  for (const row of data ?? []) {
    const employeeId = typeof row.current_employee_id === 'string' ? row.current_employee_id : ''
    if (!employeeId) continue
    counts[employeeId] = (counts[employeeId] ?? 0) + 1
  }

  return counts
}

export async function searchAssignableEmployees(
  query: string,
  options: { limit?: number } = {},
): Promise<EmployeeRecord[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { rows } = await listEmployeesPage(
    {
      search: trimmed,
      is_active: true,
    },
    {
      offset: 0,
      limit: Math.max(1, options.limit ?? 8),
    },
  )

  return rows.filter((row) => row.employee_id.trim().length > 0)
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

export async function upsertEmployee(input: EmployeeUpsertInput) {
  await assertActiveAdminAccess()
  const employeeId = input.employee_id.trim()

  const payload: Record<string, unknown> = {
    employee_id: employeeId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    department: input.department,
    is_active: input.is_active,
    role: input.role || 'employee',
  }

  if (input.id) payload.id = input.id

  const { error } = await supabase.from('employees').upsert(payload, { onConflict: 'employee_id' })
  ensureNoSupabaseError(error, 'Unable to save employee')
}

/** Bulk import only: insert a new row; does not update existing `employee_id`. */
export async function insertEmployeeNew(input: EmployeeUpsertInput) {
  await assertActiveAdminAccess()
  const employeeId = input.employee_id.trim()

  const payload: Record<string, unknown> = {
    employee_id: employeeId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    department: input.department,
    is_active: input.is_active,
    role: input.role || 'employee',
  }

  const { error } = await supabase.from('employees').insert(payload)
  if (error) {
    const pgCode =
      typeof (error as { code?: string }).code === 'string' ? (error as { code: string }).code : ''
    const msg = String((error as { message?: string }).message || '').toLowerCase()
    if (pgCode === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      throw new Error('This employee ID already exists.')
    }
    ensureNoSupabaseError(error, 'Unable to save employee')
  }
}

const BULK_EMPLOYEE_IMPORT_MAX = 500

/** Single-transaction bulk insert (migration 30). Any failure rolls back all rows. */
export async function bulkInsertEmployeesNew(inputs: EmployeeUpsertInput[]) {
  await assertActiveAdminAccess()
  if (inputs.length === 0) {
    throw new Error('No employees to import')
  }
  if (inputs.length > BULK_EMPLOYEE_IMPORT_MAX) {
    throw new Error(`Too many rows (max ${BULK_EMPLOYEE_IMPORT_MAX}).`)
  }

  const p_rows = inputs.map((i) => ({
    employee_id: i.employee_id.trim(),
    name: i.name.trim(),
    email: i.email?.trim() || null,
    department: i.department?.trim() ?? '',
    is_active: i.is_active,
    role: 'employee',
  }))

  const { data, error } = await supabase.rpc('fn_bulk_insert_employees', { p_rows })
  if (error) {
    const pgCode =
      typeof (error as { code?: string }).code === 'string' ? (error as { code: string }).code : ''
    const msg = String((error as { message?: string }).message || '').toLowerCase()
    if (pgCode === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      throw new Error(
        'Duplicate employee ID or email — no rows were saved. Fix the spreadsheet and try again.',
      )
    }
    ensureNoSupabaseError(error, 'Unable to import employees')
  }

  const rawRow = Array.isArray(data) && data.length > 0 ? data[0] : data
  const payload =
    rawRow && typeof rawRow === 'object' && rawRow !== null && 'payload' in rawRow
      ? (rawRow as { payload: unknown }).payload
      : rawRow
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from bulk import')
  }
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Bulk import failed'))
  }
}

const EMPLOYEE_ID_LOOKUP_CHUNK = 150

/** Active employee IDs among the given list — bulk import must reject the file if any match. */
export async function getActiveEmployeeIdsInUse(ids: string[]): Promise<Set<string>> {
  await assertActiveAdminAccess()
  const normalized = [...new Set(ids.map((c) => c.trim()).filter(Boolean))]
  if (normalized.length === 0) return new Set()

  const out = new Set<string>()
  for (let i = 0; i < normalized.length; i += EMPLOYEE_ID_LOOKUP_CHUNK) {
    const chunk = normalized.slice(i, i + EMPLOYEE_ID_LOOKUP_CHUNK)

    const res = await supabase.from('employees').select('employee_id').in('employee_id', chunk)

    ensureNoSupabaseError(res.error, 'Unable to check employee IDs')

    for (const row of res.data ?? []) {
      const r = row as { employee_id?: string }
      if (r.employee_id) out.add(r.employee_id)
    }
  }
  return out
}

/** Emails that already exist on an employee row — bulk import should list every conflicting row in the file. */
export async function getEmailsAlreadyInUse(emails: string[]): Promise<Set<string>> {
  await assertActiveAdminAccess()
  const normalized = [...new Set(emails.map((e) => e.trim()).filter(Boolean))]
  if (normalized.length === 0) return new Set()

  const out = new Set<string>()
  for (let i = 0; i < normalized.length; i += EMPLOYEE_ID_LOOKUP_CHUNK) {
    const chunk = normalized.slice(i, i + EMPLOYEE_ID_LOOKUP_CHUNK)
    const res = await supabase.from('employees').select('email').in('email', chunk)
    ensureNoSupabaseError(res.error, 'Unable to check emails')
    for (const row of res.data ?? []) {
      const e = (row as { email?: string | null }).email
      if (e != null && String(e).trim()) {
        out.add(String(e).trim().toLowerCase())
      }
    }
  }
  return out
}

/** IDs that exist and are soft-deleted (bulk import should reject until restored from Recycle Bin).
 * NOTE: Soft-delete has been removed, this function returns empty set for compatibility.
 */
export async function getSoftDeletedEmployeeIds(_ids: string[]): Promise<Set<string>> {
  await assertActiveAdminAccess()
  return new Set()
}

export async function setEmployeeAdminStatus(
  targetEmployee: Pick<EmployeeRecord, 'id' | 'employee_id'>,
  makeAdmin: boolean,
) {
  await assertActiveAdminAccess()

  const { data, error } = await supabase.rpc('fn_set_employee_admin_status', {
    p_target_employee_id: targetEmployee.id,
    p_is_admin: makeAdmin,
    p_metadata: {
      source: 'employee-page',
      target_employee_id: targetEmployee.employee_id,
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
  targetEmployee: Pick<EmployeeRecord, 'id' | 'employee_id'>,
  role: EmployeeRole,
) {
  await assertActiveItOpsAccess()
  const normalizedRole = normalizeEmployeeRoleInput(role)

  const { data, error } = await supabase.rpc('fn_set_employee_role', {
    p_target_employee_id: targetEmployee.id,
    p_new_role: normalizedRole,
    p_metadata: {
      source: 'employee-page',
      target_employee_id: targetEmployee.employee_id,
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

  const serialNumber = payload.serial_number.trim()
  if (!serialNumber) {
    throw new Error('Serial number is required')
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
    p_serial_number: serialNumber,
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

export async function bulkInsertAssets(rows: AssetWriteInput[]): Promise<{ inserted: number }> {
  await assertActiveAdminAccess()
  if (rows.length === 0) throw new Error('No assets to import')
  if (rows.length > 500) throw new Error('Too many rows (max 500). Split into smaller files.')

  const p_rows = rows.map((r) => ({
    category_slug: r.category_slug,
    category_name: r.category_name ?? null,
    manufacturer_name: r.manufacturer_name ?? null,
    model: r.model ?? null,
    serial_number: r.serial_number,
    location_code: r.location_code ?? null,
    location_name: r.location_name ?? null,
    status: r.status ?? 'in_stock',
    purchase_date: r.purchase_date ?? null,
    warranty_expiry: r.warranty_expiry ?? null,
    custom_fields: r.custom_fields ?? {},
    metadata: r.metadata ?? {},
  }))

  const { data, error } = await supabase.rpc('fn_bulk_insert_assets', { p_rows })
  if (error) {
    const msg = String((error as { message?: string }).message || '').toLowerCase()
    const code = String((error as { code?: string }).code ?? '')
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      throw new Error('Duplicate serial number found — no assets were saved. Fix the file and try again.')
    }
    ensureNoSupabaseError(error, 'Bulk asset import failed')
  }

  if (Array.isArray(data) && data.length === 0) {
    throw new Error(
      'Bulk import returned no rows from fn_bulk_insert_assets. Confirm migration 48+ is applied on the database and the RPC returns one { payload } row.',
    )
  }

  const rawRow = Array.isArray(data) && data.length > 0 ? data[0] : data
  const payload =
    rawRow && typeof rawRow === 'object' && rawRow !== null && 'payload' in rawRow
      ? (rawRow as { payload: unknown }).payload
      : rawRow
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected response from bulk asset import')
  }
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Bulk import failed'))
  }
  return { inserted: Number((payload as { inserted?: unknown }).inserted ?? rows.length) }
}

export async function updateAsset(assetTag: string, payload: Partial<AssetWriteInput>) {
  await assertActiveAdminAccess()
  if (payload.status !== undefined) {
    throw new Error('Use the lifecycle status update flow to change inventory status.')
  }
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
  if (payload.serial_number !== undefined) {
    const sn = payload.serial_number.trim()
    if (!sn) {
      throw new Error('Serial number cannot be empty')
    }
    patch.serial_number = sn
  }
  if (payload.purchase_date !== undefined) patch.purchase_date = payload.purchase_date || null
  if (payload.warranty_expiry !== undefined) patch.warranty_expiry = payload.warranty_expiry || null
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

  if (filters.current_employee_id?.trim()) {
    query = query.eq('current_employee_id', filters.current_employee_id.trim())
  }

  const excludedCategorySlugs = (filters.exclude_category_slugs ?? [])
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean)

  if (excludedCategorySlugs.length > 0) {
    query = query.not(
      'category_slug',
      'in',
      `(${excludedCategorySlugs.map((slug) => `"${slug}"`).join(',')})`
    )
  }

  const { data, error } = await query
  ensureNoSupabaseError(error, 'Unable to fetch assets')
  return (data ?? []) as AssetInventoryRecord[]
}

function buildEmployeeAssetPortfolio(
  employee: EmployeeRecord,
  assets: EmployeeAssignedAssetRecord[],
): EmployeeAssetPortfolio {
  return {
    employee,
    totalAssignedAssets: assets.length,
    assets,
  }
}

export async function getEmployeeAssetPortfolio(employeeId: string): Promise<EmployeeAssetPortfolio> {
  const [employee, assets] = await Promise.all([
    getEmployeeById(employeeId),
    getAssets({ current_employee_id: employeeId }),
  ])

  const assignmentIds = [...new Set(
    assets
      .map((asset) => asset.assignment_id?.trim() || '')
      .filter(Boolean),
  )]

  const assetIds = [...new Set(
    assets
      .map((asset) => asset.id?.trim() || '')
      .filter(Boolean),
  )]

  const assignedByByAssignmentId = new Map<string, string | null>()

  if (assetIds.length > 0) {
    try {
      const { data: events, error: eventsError } = await supabase
        .from('asset_events')
        .select('asset_id,actor_id,payload,event_type,created_at')
        .eq('event_type', 'assigned')
        .in('asset_id', assetIds)
        .order('created_at', { ascending: false })

      if (eventsError) {
        ensureNoSupabaseError(eventsError, 'Unable to load employee assignment history')
      }

      for (const row of events ?? []) {
        const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {}
        const snapshot = parseActorSnapshot(payload)
        const assignmentId = typeof payload.assignment_id === 'string' ? payload.assignment_id.trim() : ''
        if (!assignmentId || assignedByByAssignmentId.has(assignmentId) || !assignmentIds.includes(assignmentId)) {
          continue
        }

        const display =
          (typeof snapshot?.actor_name === 'string' && snapshot.actor_name.trim()
            ? snapshot.actor_name.trim()
            : '') ||
          (typeof snapshot?.actor_employee_code === 'string' && snapshot.actor_employee_code.trim()
            ? snapshot.actor_employee_code.trim()
            : '') ||
          null
        assignedByByAssignmentId.set(assignmentId, display)
      }
    } catch {
      // Employee detail should still render even when assignment actor history is unavailable.
    }
  }

  const enrichedAssets: EmployeeAssignedAssetRecord[] = assets.map((asset) => ({
    ...asset,
    assigned_by_name: asset.assignment_id ? (assignedByByAssignmentId.get(asset.assignment_id) ?? null) : null,
  }))

  return buildEmployeeAssetPortfolio(employee, enrichedAssets)
}

export async function getAssetsPage(
  filters: AssetFilters = {},
  options: AssetPageOptions = {}
): Promise<AssetPageResult> {
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.max(1, options.limit ?? 50)

  let query = supabase
    .from('v_asset_inventory')
    .select('*', { count: 'exact' })
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

  if (filters.current_employee_id?.trim()) {
    query = query.eq('current_employee_id', filters.current_employee_id.trim())
  }

  const excludedCategorySlugs = (filters.exclude_category_slugs ?? [])
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean)

  if (excludedCategorySlugs.length > 0) {
    query = query.not(
      'category_slug',
      'in',
      `(${excludedCategorySlugs.map((slug) => `"${slug}"`).join(',')})`
    )
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  ensureNoSupabaseError(error, 'Unable to fetch assets')

  return {
    rows: (data ?? []) as AssetInventoryRecord[],
    total: count ?? 0,
  }
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
      .select('id,assigned_at,returned_at,source,notes,employee:employees(id,employee_id,name,is_active,department,role)')
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
          employee_id: String(employee.employee_id ?? ''),
          name: String(employee.name ?? ''),
          is_active: Boolean(employee.is_active),
          department: typeof employee.department === 'string' ? employee.department : null,
          role: typeof employee.role === 'string' ? employee.role : null,
        }
        : null,
    }
  })

  const lifecycle_events: AssetLifecycleEvent[] = []
  let lifecycle_is_capped = false
  let rawEvents: Record<string, unknown>[] = []

  if (eventsResponse.error) {
    if (!isMissingTableError(eventsResponse.error, 'asset_events')) {
      ensureNoSupabaseError(eventsResponse.error, 'Unable to load lifecycle events')
    }
  } else if (eventsResponse.data) {
    rawEvents = eventsResponse.data as Record<string, unknown>[]
    lifecycle_is_capped = rawEvents.length >= ASSET_DETAIL_LIFECYCLE_LIMIT
  }

  for (const row of rawEvents) {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}
    const snapshot = parseActorSnapshot(payload)
    const rowActor = row.actor_id
    const aid =
      snapshot?.actor_id ??
      (rowActor != null && String(rowActor).length > 0 ? String(rowActor) : null)
    lifecycle_events.push({
      id: String(row.id ?? ''),
      event_type: String(row.event_type ?? ''),
      actor_id: aid,
      actor_employee_id: snapshot?.actor_employee_id ?? null,
      actor_name: snapshot?.actor_name ?? null,
      actor_employee_code: snapshot?.actor_employee_code ?? null,
      actor_department_name: snapshot?.actor_department_name ?? null,
      payload,
      created_at: String(row.created_at ?? ''),
    })
  }

  const createdEvent = lifecycle_events.find(
    (event) => normalizeAssetEventType(event.event_type) === 'asset_created',
  ) ?? null
  const latestUpdateEvent =
    lifecycle_events.find((event) => isAssetUpdateAuditEventType(event.event_type)) ??
    createdEvent

  const audit_actors = {
    created_by: buildAssetAuditActorDisplay({
      authUserId: asset.created_by ?? null,
      fallbackEvent: createdEvent,
    }),
    updated_by: buildAssetAuditActorDisplay({
      authUserId: asset.updated_by ?? null,
      fallbackEvent: latestUpdateEvent,
    }),
  }

  return { asset, assignments, components, lifecycle_events, lifecycle_is_capped, audit_actors }
}

export async function assignAsset(payload: AssignAssetPayload) {
  await assertActiveAdminAccess()

  // Route through the BFF so the server can dispatch email notifications.
  // The BFF calls fn_assign_asset internally with service-role, same business rules.
  const session = await getSession()
  const body: Record<string, unknown> = {
    asset_tag: payload.asset_tag.trim(),
    employee_id: payload.employee_id.trim(),
    source: 'runtime',
  }
  if (payload.assigned_at?.trim()) body.assigned_at = payload.assigned_at.trim()
  if (payload.notes) body.notes = payload.notes

  const headers = bffHeaders()
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const resp = await fetch(`${getBffBaseUrl()}/assignments/assign`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const json: unknown = await resp.json()
  // Unwrap envelope if present (BFF wraps responses).
  const data = (
    json && typeof json === 'object' && 'data' in (json as object)
      ? (json as { data: unknown }).data
      : json
  ) as Record<string, unknown> | null

  if (!resp.ok || !data || data.ok === false) {
    const msg =
      (typeof data?.detail === 'string' && data.detail.trim()) ||
      (typeof data?.message === 'string' && data.message.trim()) ||
      `Assign failed (${resp.status}). Check server logs or connectivity.`
    throw new Error(msg)
  }
  return data
}

export async function returnAsset(payload: ReturnAssetPayload) {
  await assertActiveAdminAccess()

  // Route through the BFF so the server can dispatch email notifications.
  const session = await getSession()
  const body: Record<string, unknown> = {
    asset_tag: payload.asset_tag.trim(),
    source: 'runtime',
  }
  if (payload.returned_at) body.returned_at = payload.returned_at
  if (payload.notes) body.notes = payload.notes

  const headers = bffHeaders()
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  const resp = await fetch(`${getBffBaseUrl()}/assignments/return`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const json: unknown = await resp.json()
  const data = (
    json && typeof json === 'object' && 'data' in (json as object)
      ? (json as { data: unknown }).data
      : json
  ) as Record<string, unknown> | null

  if (!resp.ok || !data || data.ok === false) {
    const msg =
      (typeof data?.detail === 'string' && data.detail.trim()) ||
      (typeof data?.message === 'string' && data.message.trim()) ||
      `Return failed (${resp.status}). Check server logs or connectivity.`
    throw new Error(msg)
  }
  return data
}

export async function setAssetLifecycleStatus(
  assetTag: string,
  newStatus: string,
  notes?: string,
  source: string = 'runtime',
): Promise<Record<string, unknown>> {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_set_asset_lifecycle_status', {
    p_asset_tag: assetTag.trim(),
    p_new_status: newStatus.trim(),
    p_source: source,
    p_notes: notes || null,
  })

  ensureNoSupabaseError(error, 'Unable to update asset status')
  const result = extractRpcJsonbObject(data)
  if (!rpcPayloadOk(result)) {
    const msg =
      typeof result?.message === 'string' && result.message.trim()
        ? result.message.trim()
        : data == null
          ? 'No data returned. Confirm fn_set_asset_lifecycle_status is deployed on the database.'
          : 'Status update failed — invalid response from server.'
    throw new Error(msg)
  }
  return result!
}

export async function resolveEmployeeIdForAssign(
  identifier: string,
): Promise<string> {
  const trimmed = identifier.trim()
  if (!trimmed) throw new Error('Employee identifier is empty')

  if (trimmed.includes('@')) {
    const { data, error } = await supabase
      .from('employees')
      .select('employee_id')
      .ilike('email', trimmed)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    ensureNoSupabaseError(error, 'Unable to resolve employee by email')
    if (!data?.employee_id) {
      throw new Error(`No active employee found with email "${trimmed}"`)
    }
    return data.employee_id
  }

  return trimmed
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
  return buildAssetQrDataUri(asset.asset_tag || normalizedTag)
}

/** Result of fetching the QR label PDF from the BFF; UI opens a tab or offers an explicit download. */
export type FetchedQrLabelsPdf = {
  pdfBlob: Blob
  fileName: string
  /** Server set when the PDF is a notice (no labels) rather than label sheets. */
  emptyExport: boolean
}

export async function fetchAssetQrLabelsPdf(assetTags: string[]): Promise<FetchedQrLabelsPdf> {
  await assertActiveAdminAccess()

  const normalizedTags = [...new Set(assetTags.map((tag) => tag.trim()).filter(Boolean))]

  const session = await getSession()
  const headers = bffHeaders()
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  let resp: Response
  try {
    resp = await fetch(`${getBffBaseUrl()}/assets/qr-labels/export`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ asset_tags: normalizedTags }),
    })
  } catch (err) {
    throw err
  }

  if (!resp.ok) {
    const message = await readBffErrorMessage(resp, `QR export failed (${resp.status}). Confirm the server is reachable.`)
    throw new Error(message)
  }

  const blob = await resp.blob()
  if (!blob.size) {
    throw new Error('QR export returned an empty file.')
  }

  const emptyExport = resp.headers.get('X-Export-Empty') === '1'
  const fileName = extractDownloadFileName(resp.headers.get('content-disposition'), 'Asset manager QRs.pdf')
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName, emptyExport }
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

/** Soft-delete: moves employee to Recycle Bin; main directory hides them until restore. Not for Active/Inactive (use employee upsert / is_active). */
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

/**
 * Hard delete: removes dependent audit/assignment rows, then the employee row.
 * Only valid after soft-delete (open bin row). Migrations 27 + 46; call from Recycle Bin UI only.
 */
export async function deleteEmployeePermanently(employeeId: string) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_delete_employee_permanent', {
    p_employee_id: employeeId,
  })
  ensureNoSupabaseError(error, 'Unable to delete employee')
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected response while deleting employee')
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Unable to delete employee'))
  }
}

/** Hard delete a soft-deleted asset; removes recycle-bin row. Requires migration 28. */
export async function deleteAssetPermanently(assetId: string) {
  await assertActiveAdminAccess()
  const { data, error } = await supabase.rpc('fn_delete_asset_permanent', {
    p_asset_id: assetId,
  })
  ensureNoSupabaseError(error, 'Unable to delete asset')
  const payload = Array.isArray(data) ? data[0] : data
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected response while deleting asset')
  if ((payload as { ok?: boolean }).ok === false) {
    throw new Error(String((payload as { message?: unknown }).message || 'Unable to delete asset'))
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
      deleted_by_employee_id_code:
        typeof r.deleted_by_employee_id_code === 'string'
          ? r.deleted_by_employee_id_code
          : typeof r.deleted_by_employee_code === 'string'
            ? r.deleted_by_employee_code
            : null,
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
 * Defaults to `https://web-assetmanager.vercel.app` in dev and production so scans work from a phone
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
  return PRODUCTION_QR_APP_ORIGIN
}

async function buildAssetQrDataUri(assetTag: string): Promise<string> {
  const base = getScanPageBaseUrl()
  const scanUrl = `${base}/scan/${encodeURIComponent(assetTag)}`
  return QRCode.toDataURL(scanUrl, { margin: 2, width: 320 })
}

export async function scanAsset(assetTag: string) {
  const [asset, sessionEmp] = await Promise.all([getAsset(assetTag), getSessionEmployee()])
  const isPrivileged = Boolean(sessionEmp?.is_active && sessionEmp?.role !== 'employee')
  // is_own_asset: true for admin/IT Ops, or if the asset is assigned to the signed-in employee.
  // false means employee is viewing an asset not assigned to them — caller shows limited view via ScanPage.
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

export async function getDashboardStats() {
  const [assetsRes, assignmentsRes, employeesRes] = await Promise.all([
    supabase.from('assets').select('id,status', { count: 'exact' }).eq('is_deleted', false),
    supabase.from('asset_assignments').select('id,returned_at', { count: 'exact' }).is('returned_at', null),
    supabase.from('v_employee_directory').select('id,is_active', { count: 'exact' }),
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

const OVERVIEW_STATUS_ORDER = ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed'] as const

export async function getOverviewAnalysisData(
  options: { employeeLimit?: number } = {},
): Promise<OverviewAnalysisSnapshot> {
  await assertActiveAdminAccess()

  const employeeLimit = Math.min(Math.max(1, options.employeeLimit ?? 5), 10)
  const [assetsRes, activeEmployeesRes] = await Promise.all([
    supabase
      .from('v_asset_inventory')
      .select(
        'status,category_name,current_employee_id,current_employee_name,current_employee_code,current_employee_department',
      ),
    listEmployeesPage(
      { is_active: true },
      {
        offset: 0,
        limit: 1,
      },
    ),
  ])

  ensureNoSupabaseError(assetsRes.error, 'Unable to load overview analysis assets')

  type OverviewAssetRow = Pick<
    AssetInventoryRecord,
    | 'status'
    | 'category_name'
    | 'current_employee_id'
    | 'current_employee_name'
    | 'current_employee_code'
    | 'current_employee_department'
  >

  const rows = (assetsRes.data ?? []) as OverviewAssetRow[]
  const statusMap = new Map<string, number>()
  const categoryMap = new Map<string, number>()
  const employeeLoadMap = new Map<
    string,
    {
      employee_id: string
      employee_name: string
      display_employee_id: string | null
      department: string | null
      assigned_assets: number
    }
  >()

  let assignedAssets = 0
  let inStockAssets = 0

  for (const row of rows) {
    const status = typeof row.status === 'string' && row.status.trim() ? row.status.trim() : 'unknown'
    const categoryName =
      typeof row.category_name === 'string' && row.category_name.trim()
        ? row.category_name.trim()
        : 'Uncategorized'
    const employeeId =
      typeof row.current_employee_id === 'string' && row.current_employee_id.trim()
        ? row.current_employee_id.trim()
        : ''
    const employeeName =
      typeof row.current_employee_name === 'string' && row.current_employee_name.trim()
        ? row.current_employee_name.trim()
        : 'Unknown employee'
    const employeeCode =
      typeof row.current_employee_code === 'string' && row.current_employee_code.trim()
        ? row.current_employee_code.trim()
        : null
    const employeeDepartment =
      typeof row.current_employee_department === 'string' && row.current_employee_department.trim()
        ? row.current_employee_department.trim()
        : null

    statusMap.set(status, (statusMap.get(status) ?? 0) + 1)
    categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + 1)

    if (status === 'in_stock') {
      inStockAssets += 1
    }

    if (!employeeId) continue

    assignedAssets += 1
    const current = employeeLoadMap.get(employeeId)
    if (current) {
      current.assigned_assets += 1
      continue
    }

    employeeLoadMap.set(employeeId, {
      employee_id: employeeId,
      employee_name: employeeName,
      display_employee_id: employeeCode,
      department: employeeDepartment,
      assigned_assets: 1,
    })
  }

  const orderedStatusBreakdown: OverviewAnalysisMetric[] = []
  for (const status of OVERVIEW_STATUS_ORDER) {
    orderedStatusBreakdown.push({
      label: status,
      count: statusMap.get(status) ?? 0,
    })
  }

  const extraStatusBreakdown = Array.from(statusMap.entries())
    .filter(([label]) => !OVERVIEW_STATUS_ORDER.includes(label as (typeof OVERVIEW_STATUS_ORDER)[number]))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const employeeLoad = Array.from(employeeLoadMap.values())
    .sort((a, b) => b.assigned_assets - a.assigned_assets || a.employee_name.localeCompare(b.employee_name))
    .slice(0, employeeLimit)

  return {
    totalAssets: rows.length,
    assignedAssets,
    inStockAssets,
    activeEmployees: activeEmployeesRes.total,
    statusBreakdown: [...orderedStatusBreakdown, ...extraStatusBreakdown],
    categoryBreakdown,
    employeeLoad,
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

/** Payload from `fn_public_scan_asset` (anonymous QR): tightly-scoped public scan details. */
export type PublicScanAsset = {
  category_name: string
  asset_tag: string
  status: string
  is_assigned: boolean
  holder_name?: string | null
  holder_employee_code?: string | null
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
    category_name:
      typeof p.category_name === 'string' && p.category_name.trim()
        ? p.category_name
        : normalizedTag,
    asset_tag:
      typeof p.asset_tag === 'string' && p.asset_tag.trim()
        ? p.asset_tag
        : normalizedTag,
    status: typeof p.status === 'string' ? p.status : String(p.status ?? ''),
    is_assigned: Boolean(p.is_assigned),
    holder_name: typeof p.holder_name === 'string' ? p.holder_name : null,
    holder_employee_code:
      typeof p.holder_employee_code === 'string' ? p.holder_employee_code : null,
  }
}

export { ERP_ACTIVE_LABEL, ERP_INACTIVE_LABEL }
