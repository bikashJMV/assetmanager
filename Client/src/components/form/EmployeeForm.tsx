import { useEffect, useMemo, useState } from 'react'
import { listDepartments, type EmployeeRole } from '../../api'
import type { EmployeeUpsertInput } from '../../types/api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import EmployeeFormFields from './EmployeeFormFields'
import ConfirmDialog from '../common/ConfirmDialog'
import { LOADING } from '../../constants/loading'

type Props = {
  prefill?: Partial<EmployeeUpsertInput>
  onClose: () => void
  onSubmit: (employee: EmployeeUpsertInput) => Promise<void> | void
  /** Department names for the suggestion list. If omitted, names are loaded from the API. */
  departmentOptions?: string[]
  /** Whether the current user can manage admin-level fields (admin or IT Ops). */
  canManageAdminRole?: boolean
  /** Assets currently held by this employee — drives the department-cascade confirmation. */
  heldAssetCount?: number
}

const defaults: EmployeeUpsertInput = {
  employee_id: '',
  name: '',
  email: '',
  department: '',
  role: 'employee',
  is_active: true,
}

const requiredFields: (keyof EmployeeUpsertInput)[] = ['employee_id', 'name', 'department']

export default function EmployeeForm({ prefill, onClose, onSubmit, departmentOptions, canManageAdminRole = false, heldAssetCount = 0 }: Props) {
  const [form, setForm] = useState<EmployeeUpsertInput>({
    ...defaults,
    ...prefill,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadedDepartmentNames, setLoadedDepartmentNames] = useState<string[]>([])
  const [deptConfirmOpen, setDeptConfirmOpen] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<EmployeeUpsertInput | null>(null)

  const isEditing = Boolean(prefill?.id)

  useEffect(() => {
    if (departmentOptions !== undefined) return
    let mounted = true
    void (async () => {
      try {
        const rows = await listDepartments()
        if (!mounted) return
        setLoadedDepartmentNames(rows)
      } catch (err) {
        if (!mounted) return
        logDevError('employeeForm.departments', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [departmentOptions])

  const departmentSuggestions = useMemo(() => {
    const raw = departmentOptions ?? loadedDepartmentNames
    return [...raw].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [departmentOptions, loadedDepartmentNames])

  const doSubmit = async (payload: EmployeeUpsertInput) => {
    setSaving(true)
    setError('')
    try {
      await onSubmit(payload)
    } catch (err) {
      logDevError('employeeForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save employee right now.'))
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const missing = requiredFields.find((field) => {
      const value = form[field]
      return typeof value === 'string' ? !value.trim() : value === undefined || value === null
    })

    if (missing) {
      setError('Please fill all required fields.')
      return
    }

    const normalizedRole = form.role ? (form.role as EmployeeRole) : 'employee'
    const payload: EmployeeUpsertInput = {
      ...form,
      employee_id: form.employee_id.trim(),
      name: form.name.trim(),
      email: form.email?.trim() || null,
      department: form.department?.trim() || null,
      role: normalizedRole,
    }

    const departmentChanged = (prefill?.department ?? '').trim() !== (form.department ?? '').trim()
    if (isEditing && departmentChanged && heldAssetCount > 0) {
      setPendingPayload(payload)
      setDeptConfirmOpen(true)
      return
    }

    await doSubmit(payload)
  }

  return (
    <div className="bg-app border border-base w-full ">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary">{isEditing ? 'Edit Employee' : 'Add New Employee'}</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">x</button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
        <EmployeeFormFields
          form={form}
          setForm={setForm}
          isEditing={isEditing}
          canManageAdminRole={canManageAdminRole}
          departmentSuggestions={departmentSuggestions}
        />

        {error && <p className="text-accent text-sm">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-base bg-surface text-primary py-2.5 rounded-lg hover:bg-surface-2 transition text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-accent text-on-accent font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition text-sm shadow-accent disabled:opacity-60"
          >
            {saving ? LOADING.SAVING : isEditing ? 'Save Employee' : 'Add Employee'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={deptConfirmOpen}
        title="Update department for held assets?"
        message={`Changing the department to “${form.department?.trim() || '—'}” will also update the department of ${heldAssetCount} asset${heldAssetCount === 1 ? '' : 's'} currently held by ${form.name.trim() || 'this employee'}, and record it in each asset's audit trail. Continue?`}
        confirmLabel="Update department"
        loading={saving}
        showDismissIcon
        onConfirm={() => {
          if (pendingPayload) void doSubmit(pendingPayload)
          setDeptConfirmOpen(false)
        }}
        onClose={() => setDeptConfirmOpen(false)}
      />
    </div>
  )
}
