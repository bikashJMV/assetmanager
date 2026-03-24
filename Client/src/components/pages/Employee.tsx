import { useEffect, useRef, useState } from 'react'
import EmployeeForm from '../form/EmployeeForm'
import Error from '../common/Error'
import RefreshButton from '../common/RefreshButton'
import {
  getCurrentEmployeeAssets,
  getAssets,
  getQrDataUriForAssetTag,
  hasActiveAdminAccess,
  listDepartments,
  listEmployees,
  setEmployeeAdminStatus,
  type EmployeeListFilters,
  type EmployeeRecord,
  type EmployeeUpsertInput,
  upsertEmployee,
} from '../../api'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay } from '../../utils/formatDisplay'

const SEARCH_DEBOUNCE_MS = 300
const ERP_STATUS_ALL = 'all'
const ROLE_ALL = 'all'

type EmployeeFiltersInput = {
  search: string
  erpStatus: 'all' | 'active' | 'inactive'
  department: string
  role: string
}

function toApiFilters(input: EmployeeFiltersInput): EmployeeListFilters {
  const filters: EmployeeListFilters = { is_active: 'all' }

  if (input.search.trim()) {
    filters.search = input.search.trim()
  }

  if (input.erpStatus === 'active') {
    filters.is_active = true
  } else if (input.erpStatus === 'inactive') {
    filters.is_active = false
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
    erpStatus: 'all',
    department: '',
    role: ROLE_ALL,
  })
  const [editEmployee, setEditEmployee] = useState<EmployeeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(null)
  const [accessWarning, setAccessWarning] = useState('')
  const [adminToggleTarget, setAdminToggleTarget] = useState<EmployeeRecord | null>(null)
  const [adminToggleMode, setAdminToggleMode] = useState<'grant' | 'revoke' | null>(null)
  const [adminToggleLoading, setAdminToggleLoading] = useState(false)
  const [bulkQrEmployeeId, setBulkQrEmployeeId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  const requestIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef<EmployeeListFilters>(toApiFilters({
    search: '',
    erpStatus: 'all',
    department: '',
    role: ROLE_ALL,
  }))

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
        passport.sessionEmployee?.is_active && passport.sessionEmployee?.role === 'admin'
      )
      const effectiveAdmin = adminAccess || profileAdmin

      setIsAdmin(effectiveAdmin)
      setSessionEmployeeId(passport.sessionEmployee?.id || null)
      setDepartments(departmentRows)

      if (profileAdmin && !adminAccess) {
        setAccessWarning(
          'Admin profile detected, but DB admin policy check is failing. Employee list may be scoped to your own row until RLS policies are re-applied.'
        )
      } else {
        setAccessWarning('')
      }
    } catch (err) {
      logDevError('employees.passport_or_departments', err)
      setAccessWarning('Unable to verify admin visibility scope right now. Reload after confirming session and RLS policies.')
    }
  }

  useEffect(() => {
    void loadPassportAndDepartments()
    void fetchEmployees(filtersRef.current)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    partial: Partial<Pick<EmployeeFiltersInput, 'erpStatus' | 'department' | 'role'>>
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

  const openAdminToggle = (employee: EmployeeRecord, mode: 'grant' | 'revoke') => {
    setAdminToggleTarget(employee)
    setAdminToggleMode(mode)
    setSuccessMessage('')
    setError('')
    setErrorDebug(undefined)
  }

  const closeAdminToggle = () => {
    if (adminToggleLoading) return
    setAdminToggleTarget(null)
    setAdminToggleMode(null)
  }

  const handleConfirmAdminToggle = async () => {
    if (!adminToggleTarget || !adminToggleMode) return

    setAdminToggleLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      await setEmployeeAdminStatus(adminToggleTarget, adminToggleMode === 'grant')
      setSuccessMessage(
        adminToggleMode === 'grant'
          ? `${adminToggleTarget.name} is now an admin.`
          : `${adminToggleTarget.name} is now an employee.`
      )
      setAdminToggleTarget(null)
      setAdminToggleMode(null)
      await fetchEmployees(filtersRef.current)
    } catch (err) {
      logDevError('employees.toggle_admin', err)
      setError(getUserFacingMessage(err, 'Unable to update admin privileges right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setAdminToggleLoading(false)
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

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="w-full 2xl:flex-[1.2]">
          <input
            type="text"
            aria-label="Search employees"
            value={filtersInput.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by code, name, email..."
            className="w-full bg-surface border border-base text-primary placeholder:text-subtle rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition"
          />
        </div>

        <div className="w-full 2xl:flex-[1.8] flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by ERP status"
            value={filtersInput.erpStatus}
            onChange={(e) =>
              handleFilterChange({
                erpStatus: (e.target.value || ERP_STATUS_ALL) as EmployeeFiltersInput['erpStatus'],
              })
            }
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[160px]"
          >
            <option value="all" className="bg-surface-2 text-primary">All</option>
            <option value="active" className="bg-surface-2 text-primary">ERP Active</option>
            <option value="inactive" className="bg-surface-2 text-primary">ERP Inactive</option>
          </select>

          <select
            aria-label="Filter by department"
            value={filtersInput.department}
            onChange={(e) => handleFilterChange({ department: e.target.value })}
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[160px]"
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
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[140px]"
          >
            <option value="all" className="bg-surface-2 text-primary">All Roles</option>
            <option value="admin" className="bg-surface-2 text-primary">Admin</option>
            <option value="employee" className="bg-surface-2 text-primary">Employee</option>
          </select>

          <RefreshButton onClick={handleRefresh} loading={loading} label="Refresh" />
        </div>
      </div>

      {!isAdmin && (
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
                <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded bg-accent text-on-accent">{asset.status}</span>
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

      {loading && <p className="text-subtle text-sm mb-4">Loading employees...</p>}

      <section className="min-w-0">
        {isAdmin ? (
          <div className="overflow-x-auto rounded-xl border border-base">
            <table className="w-full min-w-[980px] text-sm text-left">
              <thead className="bg-surface-2 text-subtle text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Employee Code</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">ERP Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-t border-base hover:bg-surface-3 transition">
                    <td className="px-4 py-3 text-primary font-medium">{employee.name}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(employee.email)}</td>
                    <td className="px-4 py-3 text-primary">{employee.employee_code}</td>
                    <td className="px-4 py-3 text-primary">{formatDisplay(employee.department)}</td>
                    <td className="px-4 py-3 text-primary capitalize">{employee.role}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${employee.is_active ? 'bg-accent text-on-accent' : 'bg-surface border border-base text-muted'}`}>
                        {employee.is_active ? 'ERP Active' : 'ERP Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditEmployee(employee)}
                          className="border border-base text-muted py-1.5 px-3 rounded-lg hover:bg-surface-3 transition text-xs"
                          type="button"
                        >
                          Edit
                        </button>
                        {employee.role === 'admin' ? (
                          <button
                            onClick={() => openAdminToggle(employee, 'revoke')}
                            disabled={employee.id === sessionEmployeeId}
                            className="border border-base text-muted py-1.5 px-3 rounded-lg hover:bg-surface-3 transition text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            type="button"
                            title={employee.id === sessionEmployeeId ? 'You cannot revoke your own admin role.' : 'Revoke admin privileges'}
                          >
                            Revoke Admin
                          </button>
                        ) : (
                          <button
                            onClick={() => openAdminToggle(employee, 'grant')}
                            className="bg-accent text-on-accent py-1.5 px-3 rounded-lg hover:bg-accent-hover transition text-xs"
                            type="button"
                          >
                            Make Admin
                          </button>
                        )}
                        <button
                          onClick={() => {
                            void handleDownloadEmployeeQrs(employee)
                          }}
                          disabled={bulkQrEmployeeId === employee.id}
                          className="border border-base text-muted py-1.5 px-3 rounded-lg hover:bg-surface-3 transition text-xs disabled:opacity-60"
                          type="button"
                          title="Download QR codes for all assets assigned to this employee"
                        >
                          {bulkQrEmployeeId === employee.id ? 'Preparing QRs...' : 'Download QRs'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-subtle">No employees found</td>
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
                  <span className="text-xs px-2 py-1 rounded bg-accent text-on-accent">
                    {employee.is_active ? 'ERP Active' : 'ERP Inactive'}
                  </span>
                </div>
                <div className="mt-4 space-y-1 text-sm">
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px]">Employee Code</p>
                  <p className="text-primary">{employee.employee_code}</p>
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px] mt-3">Department</p>
                  <p className="text-primary">{formatDisplay(employee.department)}</p>
                  <p className="text-subtle uppercase tracking-[0.14em] text-[11px] mt-3">Role</p>
                  <p className="text-primary capitalize">{employee.role}</p>
                </div>
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
              prefill={{
                id: editEmployee.id,
                employee_code: editEmployee.employee_code,
                name: editEmployee.name,
                email: editEmployee.email,
                department: editEmployee.department,
                role: editEmployee.role,
                is_active: editEmployee.is_active,
              }}
              onClose={() => setEditEmployee(null)}
              onSubmit={handleUpsertEmployee}
            />
          </div>
        </div>
      )}

      {adminToggleTarget && adminToggleMode && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-md bg-surface-2 border border-base rounded-xl p-5">
            <h3 className="text-base font-semibold text-primary">
              {adminToggleMode === 'grant' ? 'Confirm Admin Grant' : 'Confirm Admin Revoke'}
            </h3>
            <p className="text-sm text-subtle mt-2">
              {adminToggleMode === 'grant'
                ? `Are you sure you want to grant admin privileges to ${adminToggleTarget.name}?`
                : `Are you sure you want to revoke admin privileges from ${adminToggleTarget.name}?`}
            </p>
            <p className="text-xs text-subtle mt-2">Employee Code: {adminToggleTarget.employee_code}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeAdminToggle}
                disabled={adminToggleLoading}
                className="flex-1 border border-base text-muted py-2 rounded-lg hover:bg-surface-3 transition text-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAdminToggle()}
                disabled={adminToggleLoading}
                className="flex-1 bg-accent text-on-accent py-2 rounded-lg hover:bg-accent-hover transition text-sm disabled:opacity-60"
              >
                {adminToggleLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
