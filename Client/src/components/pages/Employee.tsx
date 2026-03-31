import { useEffect, useRef, useState } from 'react'
import EmployeeForm from '../form/EmployeeForm'
import Error from '../common/Error'
import RefreshButton from '../common/RefreshButton'
import ConfirmDialog from '../common/ConfirmDialog'
import Loader from '../common/Loader'
import InfoHint from '../common/InfoHint'
import IconActionButton from '../common/IconActionButton'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import {
  getCurrentEmployeeAssets,
  getAssets,
  getQrDataUriForAssetTag,
  hasActiveAdminAccess,
  listDepartments,
  listEmployees,
  setEmployeeAdminStatus,
  setEmployeeRole,
  softDeleteEmployeeById,
  type EmployeeRole,
  type EmployeeListFilters,
  type EmployeeRecord,
  type EmployeeUpsertInput,
  upsertEmployee,
} from '../../api'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay } from '../../utils/formatDisplay'
import employeeInfoHint from '../../data/employeeInfoHint.json'

type EmployeePageInfoHint = {
  panelTitle: string
  ariaLabel: string
  sections: { heading: string; bullets: string[] }[]
}

const EMPLOYEE_PAGE_INFO_HINT = employeeInfoHint as EmployeePageInfoHint

const SEARCH_DEBOUNCE_MS = 300
const FILTER_STATUS_ALL = 'all' as const
const ROLE_ALL = 'all' as const

type EmployeeFiltersInput = {
  search: string
  employeeStatus: 'all' | 'active' | 'inactive'
  erpStatus: 'all' | 'active' | 'inactive'
  department: string
  role: string
}

type EmployeeViewMode = 'table' | 'grid'

const EMPLOYEE_VIEW_MODE_STORAGE_KEY = 'ams-employee-view-mode'

function getInitialEmployeeViewMode(): EmployeeViewMode {
  if (typeof window === 'undefined') return 'table'
  return window.localStorage.getItem(EMPLOYEE_VIEW_MODE_STORAGE_KEY) === 'grid' ? 'grid' : 'table'
}

function getActiveAdvancedFilterCount(input: EmployeeFiltersInput): number {
  let count = 0
  if (input.employeeStatus !== FILTER_STATUS_ALL) count += 1
  if (input.erpStatus !== FILTER_STATUS_ALL) count += 1
  if (input.department.trim()) count += 1
  if (input.role.trim() && input.role !== ROLE_ALL) count += 1
  return count
}

function formatRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'it_ops') return 'IT Ops'
  if (normalized === 'admin') return 'Admin'
  return 'Employee'
}

function roleChangeConfirmLabel(role: EmployeeRole): string {
  if (role === 'admin') return 'Set Admin'
  if (role === 'it_ops') return 'Set IT Ops'
  return 'Set Employee'
}

function toApiFilters(input: EmployeeFiltersInput): EmployeeListFilters {
  const filters: EmployeeListFilters = { is_active: 'all', erp_active: 'all' }

  if (input.search.trim()) {
    filters.search = input.search.trim()
  }

  if (input.employeeStatus === 'active') {
    filters.is_active = true
  } else if (input.employeeStatus === 'inactive') {
    filters.is_active = false
  }

  if (input.erpStatus === 'active') {
    filters.erp_active = true
  } else if (input.erpStatus === 'inactive') {
    filters.erp_active = false
  }

  if (input.department.trim()) {
    filters.department = input.department.trim()
  }

  if (input.role.trim() && input.role !== ROLE_ALL) {
    filters.role = input.role.trim().toLowerCase()
  }

  return filters
}

export default function Employee() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [filtersInput, setFiltersInput] = useState<EmployeeFiltersInput>({
    search: '',
    employeeStatus: 'all',
    erpStatus: 'all',
    department: '',
    role: ROLE_ALL,
  })
  const [editEmployee, setEditEmployee] = useState<EmployeeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [accessResolved, setAccessResolved] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isItOps, setIsItOps] = useState(false)
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(null)
  const [accessWarning, setAccessWarning] = useState('')
  const [roleChangeTarget, setRoleChangeTarget] = useState<EmployeeRecord | null>(null)
  const [roleChangeTargetRole, setRoleChangeTargetRole] = useState<EmployeeRole | null>(null)
  const [roleChangeLoading, setRoleChangeLoading] = useState(false)
  const [bulkQrEmployeeId, setBulkQrEmployeeId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState<EmployeeViewMode>(getInitialEmployeeViewMode)
  const [successMessage, setSuccessMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRecord | null>(null)
  const [grantAdminTarget, setGrantAdminTarget] = useState<EmployeeRecord | null>(null)
  const [revokeAdminTarget, setRevokeAdminTarget] = useState<EmployeeRecord | null>(null)
  const [adminPrivilegeLoading, setAdminPrivilegeLoading] = useState(false)

  const requestIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef<EmployeeListFilters>(toApiFilters({
    search: '',
    employeeStatus: 'all',
    erpStatus: 'all',
    department: '',
    role: ROLE_ALL,
  }))
  const canManageEmployees = accessResolved && isAdmin
  const activeAdvancedFilterCount = getActiveAdvancedFilterCount(filtersInput)

  const fetchEmployees = async (filters: EmployeeListFilters) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setErrorDebug(undefined)

    try {
      const rows = await listEmployees(filters)
      if (requestId !== requestIdRef.current) return
      setEmployees(rows)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      logDevError('employees.fetch', err)
      setError(getUserFacingMessage(err, 'Unable to load employees right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  const loadPassportAndDepartments = async () => {
    try {
      const [passport, departmentRows, adminAccess] = await Promise.all([
        getCurrentEmployeeAssets(),
        listDepartments(),
        hasActiveAdminAccess(),
      ])

      const profileAdmin = Boolean(
        passport.sessionEmployee?.is_active && passport.sessionEmployee?.role !== 'employee'
      )
      setIsItOps(Boolean(passport.sessionEmployee?.is_active && passport.sessionEmployee?.role === 'it_ops'))
      const effectiveAdmin = adminAccess || profileAdmin

      setIsAdmin(effectiveAdmin)
      setSessionEmployeeId(passport.sessionEmployee?.id || null)
      setDepartments(departmentRows)

      if (profileAdmin && !adminAccess) {
        setAccessWarning(
          'Privileged profile detected, but DB access policy check is failing. Employee list may be scoped to your own row until RLS policies are re-applied.'
        )
      } else {
        setAccessWarning('')
      }
    } catch (err) {
      logDevError('employees.passport_or_departments', err)
      setAccessWarning('Unable to verify admin visibility scope right now. Reload after confirming session and RLS policies.')
    } finally {
      setAccessResolved(true)
    }
  }

  useEffect(() => {
    void loadPassportAndDepartments()
    void fetchEmployees(filtersRef.current)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(EMPLOYEE_VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  const handleSearchChange = (value: string) => {
    setFiltersInput((current) => {
      const nextInput = { ...current, search: value }
      const nextFilters = toApiFilters(nextInput)
      filtersRef.current = nextFilters

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void fetchEmployees(nextFilters)
      }, SEARCH_DEBOUNCE_MS)

      return nextInput
    })
  }

  const handleFilterChange = (
    partial: Partial<Pick<EmployeeFiltersInput, 'employeeStatus' | 'erpStatus' | 'department' | 'role'>>
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    setFiltersInput((current) => {
      const nextInput = { ...current, ...partial }
      const nextFilters = toApiFilters(nextInput)
      filtersRef.current = nextFilters
      void fetchEmployees(nextFilters)
      return nextInput
    })
  }

  const handleResetAdvancedFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    setFiltersInput((current) => {
      const nextInput = {
        ...current,
        employeeStatus: FILTER_STATUS_ALL,
        erpStatus: FILTER_STATUS_ALL,
        department: '',
        role: ROLE_ALL,
      }
      const nextFilters = toApiFilters(nextInput)
      filtersRef.current = nextFilters
      void fetchEmployees(nextFilters)
      return nextInput
    })
  }

  const handleRefresh = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSuccessMessage('')
    void fetchEmployees(filtersRef.current)
  }

  const handleUpsertEmployee = async (employee: EmployeeUpsertInput) => {
    try {
      await upsertEmployee({
        ...employee,
        id: editEmployee?.id,
      })
      setEditEmployee(null)
      setSuccessMessage('Employee saved successfully.')
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.upsert', err)
      setError(getUserFacingMessage(err, 'Unable to save employee right now.'))
      setErrorDebug(getErrorDebugDetail(err))
      throw err
    }
  }

  const openGrantAdminConfirm = (employee: EmployeeRecord) => {
    setGrantAdminTarget(employee)
    setSuccessMessage('')
    setError('')
    setErrorDebug(undefined)
  }

  const closeGrantAdminConfirm = () => {
    if (adminPrivilegeLoading) return
    setGrantAdminTarget(null)
  }

  const openRevokeAdminConfirm = (employee: EmployeeRecord) => {
    setRevokeAdminTarget(employee)
    setSuccessMessage('')
    setError('')
    setErrorDebug(undefined)
  }

  const closeRevokeAdminConfirm = () => {
    if (adminPrivilegeLoading) return
    setRevokeAdminTarget(null)
  }

  const handleConfirmGrantAdmin = async () => {
    if (!grantAdminTarget) return
    setAdminPrivilegeLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      await setEmployeeAdminStatus(grantAdminTarget, true)
      setSuccessMessage(`${grantAdminTarget.name} is now an admin.`)
      setGrantAdminTarget(null)
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.grant_admin', err)
      setError(getUserFacingMessage(err, 'Unable to update admin privileges right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setAdminPrivilegeLoading(false)
    }
  }

  const handleConfirmRevokeAdmin = async () => {
    if (!revokeAdminTarget) return
    setAdminPrivilegeLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      await setEmployeeAdminStatus(revokeAdminTarget, false)
      setSuccessMessage(`${revokeAdminTarget.name} is now an employee.`)
      setRevokeAdminTarget(null)
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.revoke_admin', err)
      setError(getUserFacingMessage(err, 'Unable to update admin privileges right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setAdminPrivilegeLoading(false)
    }
  }

  const openRoleChange = (employee: EmployeeRecord, role: EmployeeRole) => {
    setRoleChangeTarget(employee)
    setRoleChangeTargetRole(role)
    setSuccessMessage('')
    setError('')
    setErrorDebug(undefined)
  }

  const closeRoleChange = () => {
    if (roleChangeLoading) return
    setRoleChangeTarget(null)
    setRoleChangeTargetRole(null)
  }

  const handleConfirmRoleChange = async () => {
    if (!roleChangeTarget || !roleChangeTargetRole) return

    setRoleChangeLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      await setEmployeeRole(roleChangeTarget, roleChangeTargetRole)
      setSuccessMessage(`${roleChangeTarget.name} role updated to ${roleChangeTargetRole.replace('_', ' ')}.`)
      setRoleChangeTarget(null)
      setRoleChangeTargetRole(null)
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.set_role', err)
      setError(getUserFacingMessage(err, 'Unable to update role right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setRoleChangeLoading(false)
    }
  }

  const triggerQrDownload = (assetTag: string, qrCode: string) => {
    const link = document.createElement('a')
    link.href = qrCode
    link.download = `${assetTag}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadEmployeeQrs = async (employee: EmployeeRecord) => {
    setBulkQrEmployeeId(employee.id)
    setError('')
    setErrorDebug(undefined)
    setSuccessMessage('')
    try {
      const assets = await getAssets({ current_employee_id: employee.id })
      const tags = assets
        .map((asset) => asset.asset_tag?.trim() || '')
        .filter((tag) => Boolean(tag))

      if (!tags.length) {
        setSuccessMessage(`No assigned assets found for ${employee.name}.`)
        return
      }

      for (const tag of tags) {
        const qrCode = await getQrDataUriForAssetTag(tag)
        triggerQrDownload(tag, qrCode)
      }

      setSuccessMessage(`Downloaded ${tags.length} QR code(s) for ${employee.name}.`)
    } catch (err) {
      logDevError('employees.bulk_qr_download', err)
      setError(getUserFacingMessage(err, 'Unable to download employee QR codes right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setBulkQrEmployeeId(null)
    }
  }

  const handleSoftDeleteEmployee = async (employee: EmployeeRecord) => {
    try {
      await softDeleteEmployeeById(employee.id)
      setDeleteTarget(null)
      setSuccessMessage(`${employee.name} moved to Recycle Bin.`)
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.soft_delete', err)
      setError(getUserFacingMessage(err, 'Unable to delete employee right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    }
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center">
          <div className="min-w-0 lg:flex-[1_1_320px]">
            <input
              type="text"
              aria-label="Search employees"
              value={filtersInput.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by code, name, email..."
              className="w-full bg-surface border border-base text-primary placeholder:text-subtle rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition"
            />
          </div>

          <div className="flex items-center gap-2 lg:flex-nowrap lg:shrink-0">
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${filtersOpen || activeAdvancedFilterCount > 0
                ? 'border-accent-soft bg-[color:var(--accent-soft)]/15 text-primary'
                : 'border-base bg-surface text-muted hover:bg-surface-3 hover:text-primary'
                }`}
            >
              <span className="h-4 w-4 shrink-0">
                <FilterIcon />
              </span>
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 && (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {activeAdvancedFilterCount}
                </span>
              )}
            </button>

            <RefreshButton
              onClick={handleRefresh}
              loading={loading}
              iconOnly
              ariaLabel="Refresh employees"
              title={loading ? 'Refreshing employees' : 'Refresh employees'}
              className="shrink-0"
            />

            <div className="inline-flex items-center rounded-lg border border-base bg-surface p-1">
              <button
                type="button"
                aria-label="Show table layout"
                title="Table layout"
                onClick={() => setViewMode('table')}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${viewMode === 'table'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-surface-3 hover:text-primary'
                  }`}
              >
                <TableViewIcon />
              </button>
              <button
                type="button"
                aria-label="Show grid layout"
                title="Grid layout"
                onClick={() => setViewMode('grid')}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${viewMode === 'grid'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-surface-3 hover:text-primary'
                  }`}
              >
                <GridViewIcon />
              </button>
            </div>

            {accessResolved && canManageEmployees ? (
              <InfoHint
                panelTitle={EMPLOYEE_PAGE_INFO_HINT.panelTitle}
                ariaLabel={EMPLOYEE_PAGE_INFO_HINT.ariaLabel}
                className="shrink-0"
              >
                {EMPLOYEE_PAGE_INFO_HINT.sections.map((section) => (
                  <div key={section.heading}>
                    <p className="font-medium text-primary">{section.heading}</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {section.bullets.map((text, i) => (
                        <li key={`${section.heading}-${i}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </InfoHint>
            ) : null}
          </div>
        </div>

        {filtersOpen && (
          <section className="rounded-xl border border-base bg-surface-2 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3 overflow-x-auto">
              <select
                aria-label="Filter by employment status (employees.is_active)"
                title="Employment / account active flag — not the same as ERP access (erp_active)"
                value={filtersInput.employeeStatus}
                onChange={(e) =>
                  handleFilterChange({
                    employeeStatus: (e.target.value || FILTER_STATUS_ALL) as EmployeeFiltersInput['employeeStatus'],
                  })
                }
                className="min-w-[10rem] flex-1 bg-surface border border-base text-primary text-sm rounded-lg px-2.5 py-2"
              >
                <option value="all" className="bg-surface-2 text-primary">All employees</option>
                <option value="active" className="bg-surface-2 text-primary">Active employee</option>
                <option value="inactive" className="bg-surface-2 text-primary">Not active employee</option>
              </select>

              <select
                aria-label="Filter by ERP entitlement (employees.erp_active)"
                title="Uses employees.erp_active — AMS/ERP access flag, separate from employment active"
                value={filtersInput.erpStatus}
                onChange={(e) =>
                  handleFilterChange({
                    erpStatus: (e.target.value || FILTER_STATUS_ALL) as EmployeeFiltersInput['erpStatus'],
                  })
                }
                className="min-w-[8.5rem] flex-1 bg-surface border border-base text-primary text-sm rounded-lg px-2.5 py-2"
              >
                <option value="all" className="bg-surface-2 text-primary">Any ERP access</option>
                <option value="active" className="bg-surface-2 text-primary">ERP access on</option>
                <option value="inactive" className="bg-surface-2 text-primary">ERP access off</option>
              </select>

              <select
                aria-label="Filter by department"
                value={filtersInput.department}
                onChange={(e) => handleFilterChange({ department: e.target.value })}
                className="min-w-[9rem] flex-1 bg-surface border border-base text-primary text-sm rounded-lg px-2.5 py-2"
              >
                <option value="" className="bg-surface-2 text-primary">All Departments</option>
                {departments.map((department) => (
                  <option key={department} value={department} className="bg-surface-2 text-primary">
                    {department}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by role"
                value={filtersInput.role}
                onChange={(e) => handleFilterChange({ role: e.target.value || ROLE_ALL })}
                className="min-w-[7.5rem] flex-1 bg-surface border border-base text-primary text-sm rounded-lg px-2.5 py-2"
              >
                <option value="all" className="bg-surface-2 text-primary">All Roles</option>
                <option value="admin" className="bg-surface-2 text-primary">Admin</option>
                <option value="it_ops" className="bg-surface-2 text-primary">IT Ops</option>
                <option value="employee" className="bg-surface-2 text-primary">Employee</option>
              </select>

              <button
                type="button"
                onClick={handleResetAdvancedFilters}
                disabled={activeAdvancedFilterCount === 0}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-base bg-surface px-3 text-sm font-medium text-muted transition hover:bg-surface-3 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed sm:h-10"
              >
                Clear
              </button>
            </div>
          </section>
        )}
      </div>

      {accessResolved && !isAdmin && (
        <p className="text-xs text-subtle mb-4">
          Read-only mode. Active admin access is required to add or edit employees.
        </p>
      )}
      {/* 
      <section className="mb-5 bg-surface-2 border border-base rounded-xl p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-subtle mb-3">Employee Passport (Current Session)</h2>
        {passportNote && <p className="text-xs text-subtle mb-3">{passportNote}</p>}
        {passportAssets.length === 0 ? (
          <p className="text-sm text-subtle">No currently assigned assets for this session user.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {passportAssets.map((asset) => (
              <div key={`${asset.asset_tag}-${asset.status}`} className="rounded-lg border border-base bg-surface px-3 py-2.5">
                <p className="text-xs text-subtle uppercase tracking-[0.12em]">Asset</p>
                <p className="text-sm font-semibold text-primary mt-1">{formatDisplay(asset.asset_tag)}</p>
                <p className="text-xs text-muted mt-1">{formatDisplay(asset.model)}</p>
                <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded bg-accent text-white">{asset.status}</span>
              </div>
            ))}
          </div>
        )}
      </section> */}

      {error ? (
        <div className="mb-4">
          <Error
            title="Could not load employees"
            message={error}
            onRetry={handleRefresh}
            onDismiss={() => {
              setError('')
              setErrorDebug(undefined)
            }}
            debugDetail={errorDebug}
            fullScreen={false}
          />
        </div>
      ) : null}
      {successMessage ? (
        <div className="mb-4 rounded-lg border border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)]/15 px-4 py-2 text-sm text-primary">
          {successMessage}
        </div>
      ) : null}
      {accessWarning ? (
        <div className="mb-4 rounded-lg border border-base bg-surface px-4 py-2 text-xs text-subtle">
          {accessWarning}
        </div>
      ) : null}

      <section className="min-w-0">
        {!accessResolved || (loading && employees.length === 0) ? (
          <Loader embedded />
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto rounded-xl border border-base">
            <table className="w-full min-w-[980px] text-sm text-left">
              <thead className="bg-surface-2 text-subtle text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Employee Code</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">ERP</th>
                  {canManageEmployees && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-t border-base hover:bg-surface-3 transition">
                    <td className="px-4 py-3 text-primary font-medium">{employee.name}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(employee.email)}</td>
                    <td className="px-4 py-3 text-primary">{employee.employee_code}</td>
                    <td className="px-4 py-3 text-primary">{formatDisplay(employee.department)}</td>
                    <td className="px-4 py-3 text-primary">{formatRoleLabel(employee.role)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${employee.is_active ? 'bg-accent text-white' : 'bg-surface border border-base text-muted'}`}>
                        {employee.is_active ? 'Active' : 'Not active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${employee.erp_active ? 'bg-accent text-white' : 'bg-surface border border-base text-muted'}`}>
                        {employee.erp_active ? 'ERP Active' : 'ERP Inactive'}
                      </span>
                    </td>
                    {canManageEmployees && (
                      <td className="px-4 py-3">
                        <EmployeeActions
                          employee={employee}
                          isItOps={isItOps}
                          sessionEmployeeId={sessionEmployeeId}
                          bulkQrEmployeeId={bulkQrEmployeeId}
                          onEdit={setEditEmployee}
                          onSetRole={openRoleChange}
                          onGrantAdmin={openGrantAdminConfirm}
                          onRevokeAdmin={openRevokeAdminConfirm}
                          onDownloadQrs={handleDownloadEmployeeQrs}
                          onDelete={setDeleteTarget}
                          align="end"
                        />
                      </td>
                    )}
                  </tr>
                ))}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={canManageEmployees ? 8 : 7} className="text-center py-8 text-subtle">No employees found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {employees.map((employee) => (
              <article key={employee.id} className="bg-surface-2 border border-base rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{employee.name}</h2>
                    <p className="text-sm text-muted">{formatDisplay(employee.email)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded ${employee.is_active ? 'bg-accent text-white' : 'bg-surface border border-base text-muted'}`}>
                      {employee.is_active ? 'Active employee' : 'Not active'}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${employee.erp_active ? 'bg-accent text-white' : 'bg-surface border border-base text-muted'}`}>
                      {employee.erp_active ? 'ERP Active' : 'ERP Inactive'}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm">
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px]">Employee Code</p>
                  <p className="text-primary">{employee.employee_code}</p>
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px] mt-3">Department</p>
                  <p className="text-primary">{formatDisplay(employee.department)}</p>
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px] mt-3">Role</p>
                  <p className="text-primary">{formatRoleLabel(employee.role)}</p>
                </div>
                {canManageEmployees && (
                  <div className="mt-4 border-t border-base pt-4">
                    <EmployeeActions
                      employee={employee}
                      isItOps={isItOps}
                      sessionEmployeeId={sessionEmployeeId}
                      bulkQrEmployeeId={bulkQrEmployeeId}
                      onEdit={setEditEmployee}
                      onSetRole={openRoleChange}
                      onGrantAdmin={openGrantAdminConfirm}
                      onRevokeAdmin={openRevokeAdminConfirm}
                      onDownloadQrs={handleDownloadEmployeeQrs}
                      onDelete={setDeleteTarget}
                    />
                  </div>
                )}
              </article>
            ))}

            {!loading && employees.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3 bg-surface-2 border border-base rounded-xl p-8 text-center text-subtle">
                No employees found
              </div>
            )}
          </div>
        )}
      </section>

      {editEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-10 px-4">
          <div className="w-full max-w-4xl">
            <EmployeeForm
              key={editEmployee.id}
              departmentOptions={departments}
              prefill={{
                id: editEmployee.id,
                employee_code: editEmployee.employee_code,
                name: editEmployee.name,
                email: editEmployee.email,
                department: editEmployee.department,
                role: editEmployee.role,
                is_active: editEmployee.is_active,
                erp_active: editEmployee.erp_active,
              }}
              onClose={() => setEditEmployee(null)}
              onSubmit={handleUpsertEmployee}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(roleChangeTarget && roleChangeTargetRole)}
        title="Confirm role change"
        message={
          roleChangeTarget && roleChangeTargetRole
            ? `Are you sure you want to set ${roleChangeTarget.name} as ${formatRoleLabel(roleChangeTargetRole)}? Employee code: ${roleChangeTarget.employee_code}.`
            : ''
        }
        confirmLabel={
          roleChangeTargetRole ? roleChangeConfirmLabel(roleChangeTargetRole) : 'Confirm'
        }
        loading={roleChangeLoading}
        showDismissIcon
        onClose={closeRoleChange}
        onConfirm={() => {
          void handleConfirmRoleChange()
        }}
      />
      <ConfirmDialog
        open={Boolean(grantAdminTarget)}
        title="Make admin"
        message={
          grantAdminTarget
            ? `Grant full admin privileges to ${grantAdminTarget.name}? Employee code: ${grantAdminTarget.employee_code}.`
            : ''
        }
        confirmLabel="Make Admin"
        loading={adminPrivilegeLoading}
        showDismissIcon
        onClose={closeGrantAdminConfirm}
        onConfirm={() => {
          void handleConfirmGrantAdmin()
        }}
      />
      <ConfirmDialog
        open={Boolean(revokeAdminTarget)}
        title="Revoke admin"
        message={
          revokeAdminTarget
            ? `Remove admin privileges from ${revokeAdminTarget.name}? They will return to the employee role. Employee code: ${revokeAdminTarget.employee_code}.`
            : ''
        }
        confirmLabel="Revoke Admin"
        loading={adminPrivilegeLoading}
        showDismissIcon
        onClose={closeRevokeAdminConfirm}
        onConfirm={() => {
          void handleConfirmRevokeAdmin()
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Move Employee to Recycle Bin"
        message={
          deleteTarget
            ? `Move ${deleteTarget.name} (${deleteTarget.employee_code}) to Recycle Bin?`
            : 'Move employee to Recycle Bin?'
        }
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleSoftDeleteEmployee(deleteTarget)
        }}
      />
    </main>
  )
}

type EmployeeActionsProps = {
  employee: EmployeeRecord
  isItOps: boolean
  sessionEmployeeId: string | null
  bulkQrEmployeeId: string | null
  align?: 'start' | 'end'
  onEdit: (employee: EmployeeRecord) => void
  onSetRole: (employee: EmployeeRecord, role: EmployeeRole) => void
  onGrantAdmin: (employee: EmployeeRecord) => void
  onRevokeAdmin: (employee: EmployeeRecord) => void
  onDownloadQrs: (employee: EmployeeRecord) => Promise<void>
  onDelete: (employee: EmployeeRecord) => void
}

function EmployeeActions({
  employee,
  isItOps,
  sessionEmployeeId,
  bulkQrEmployeeId,
  align = 'start',
  onEdit,
  onSetRole,
  onGrantAdmin,
  onRevokeAdmin,
  onDownloadQrs,
  onDelete,
}: EmployeeActionsProps) {
  const primaryButtonClass = 'bg-accent text-white py-1.5 px-3 rounded-lg hover:bg-accent-hover transition text-xs'
  const dangerOutlineButtonClass =
    'border border-base text-accent py-1.5 px-3 rounded-lg hover:bg-surface-2 transition text-xs disabled:opacity-50 disabled:cursor-not-allowed'

  const showSetEmployee = isItOps && employee.role !== 'employee'
  const showMakeAdmin = !isItOps && employee.role !== 'it_ops' && employee.role !== 'admin'
  const showRevokeAdmin = employee.role === 'admin'
  const showSetAdmin = isItOps && employee.role !== 'admin'
  const showSetItOps = isItOps && employee.role !== 'it_ops'
  const hasRoleManagementControl =
    showSetEmployee || showMakeAdmin || showRevokeAdmin || showSetAdmin || showSetItOps
  const showYouBadge =
    Boolean(sessionEmployeeId) && employee.id === sessionEmployeeId && !hasRoleManagementControl

  return (
    <div className={`flex flex-wrap gap-2 items-center ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {showYouBadge ? (
        <span
          className="inline-flex h-8 min-w-[3.25rem] items-center justify-center rounded-lg border border-base bg-surface-2 px-3 text-xs font-semibold tracking-wide text-muted"
          aria-label="This row is your account"
        >
          YOU
        </span>
      ) : null}
      {showSetEmployee ? (
        <IconActionButton
          icon="users"
          label="Set Employee"
          onClick={() => onSetRole(employee, 'employee')}
          disabled={employee.id === sessionEmployeeId && employee.role === 'it_ops'}
          variant="base"
        />
      ) : null}
      {showMakeAdmin ? (
        <button
          onClick={() => {
            onGrantAdmin(employee)
          }}
          className={primaryButtonClass}
          type="button"
        >
          Make Admin
        </button>
      ) : null}
      {showRevokeAdmin ? (
        <button
          type="button"
          onClick={() => {
            onRevokeAdmin(employee)
          }}
          disabled={employee.id === sessionEmployeeId}
          className={dangerOutlineButtonClass}
        >
          Revoke Admin
        </button>
      ) : null}
      {showSetAdmin ? (
        <IconActionButton
          icon="users"
          label="Set Admin"
          onClick={() => onSetRole(employee, 'admin')}
          variant="accent"
        />
      ) : null}
      {showSetItOps ? (
        <IconActionButton
          icon="users"
          label="Set IT Ops"
          onClick={() => onSetRole(employee, 'it_ops')}
          variant="base"
        />
      ) : null}
      <IconActionButton
        icon="edit"
        label="Edit"
        onClick={() => onEdit(employee)}
        variant="base"
      />
      <button
        type="button"
        onClick={() => {
          void onDownloadQrs(employee)
        }}
        disabled={bulkQrEmployeeId === employee.id}
        title={bulkQrEmployeeId === employee.id ? 'Preparing QR downloads…' : 'Download QR images for all assets assigned to this employee'}
        aria-label={bulkQrEmployeeId === employee.id ? 'Preparing QR downloads' : 'Download QR codes for assigned assets'}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--accent-soft)] bg-surface px-2.5 text-xs font-semibold text-accent transition hover:bg-[color:var(--accent-soft)]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${bulkQrEmployeeId === employee.id ? 'refresh-spin' : ''}`}>
          <AnimatedNavIcon name={bulkQrEmployeeId === employee.id ? 'refresh-cw' : 'download'} />
        </span>
        <span>QR</span>
      </button>
      <IconActionButton
        icon="trash"
        label="Delete"
        onClick={() => onDelete(employee)}
        disabled={employee.id === sessionEmployeeId}
        variant="danger"
      />
    </div>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function TableViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  )
}

function GridViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  )
}
