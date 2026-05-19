import { useEffect, useMemo, useState } from 'react'
import { listDepartments, type EmployeeRole } from '../../api'
import type { EmployeeUpsertInput } from '../../types/api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'

type Props = {
  prefill?: Partial<EmployeeUpsertInput>
  onClose: () => void
  onSubmit: (employee: EmployeeUpsertInput) => Promise<void> | void
  /** Department names for the suggestion list. If omitted, names are loaded from the API. */
  departmentOptions?: string[]
  /** Whether the current user can manage admin-level fields (admin or IT Ops). */
  canManageAdminRole?: boolean
}

const defaults: EmployeeUpsertInput = {
  employee_id: '',
  name: '',
  email: '',
  department: '',
  role: 'employee',
}

const requiredFields: (keyof EmployeeUpsertInput)[] = ['employee_id', 'name', 'department']

const ROLE_OPTIONS: FilterSelectOption[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
  { value: 'it_ops', label: 'IT Ops' },
]

export default function EmployeeForm({ prefill, onClose, onSubmit, departmentOptions, canManageAdminRole = false }: Props) {
  const [form, setForm] = useState<EmployeeUpsertInput>({
    ...defaults,
    ...prefill,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadedDepartmentNames, setLoadedDepartmentNames] = useState<string[]>([])

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

    setSaving(true)
    setError('')

    try {
      const normalizedRole = form.role ? (form.role as EmployeeRole) : 'employee'
      await onSubmit({
        ...form,
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        email: form.email?.trim() || null,
        department: form.department?.trim() || null,
        role: normalizedRole,
      })
    } catch (err) {
      logDevError('employeeForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save employee right now.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-app border border-base w-full ">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary">{isEditing ? 'Edit Employee' : 'Add New Employee'}</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">x</button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
        <div className=" p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Employee ID"
              value={form.employee_id}
              required
              onChange={(value) => setForm((current) => ({ ...current, employee_id: value }))}
              disabled={isEditing}
            />
            <Field
              label="Full Name"
              value={form.name}
              required
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            />
            <Field
              label="Email"
              type="email"
              value={form.email || ''}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
            />
            <Field
              label="Department"
              value={form.department || ''}
              required
              onChange={(value) => setForm((current) => ({ ...current, department: value }))}
              placeholder="Enter department name"
              suggestions={departmentSuggestions}
            />
            {canManageAdminRole && (
              <div>
                <label htmlFor="employee-form-role-trigger" className="block text-muted text-xs mb-1">
                  Role
                </label>
                <FilterSelect
                  hideLabel
                  dense
                  triggerId="employee-form-role-trigger"
                  label=""
                  value={form.role || 'employee'}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, role: value as EmployeeRole }))
                  }
                  options={ROLE_OPTIONS}
                  ariaLabel="Employee role"
                />
              </div>
            )}
          </div>
        </div>

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
            {saving ? 'Saving...' : isEditing ? 'Save Employee' : 'Add Employee'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  required = false,
  type = 'text',
  disabled = false,
  options = [],
  placeholder,
  suggestions,
  onChange,
}: {
  label: string
  value: string
  required?: boolean
  type?: string
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  suggestions?: string[]
  onChange: (value: string) => void
}) {
  const fieldId = `employee-form-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const listId = suggestions && suggestions.length > 0 ? `${fieldId}-suggestions` : undefined

  return (
    <div>
      <label htmlFor={fieldId} className="block text-muted text-xs mb-1">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {type === 'select' ? (
        <select
          id={fieldId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-surface-2 text-primary">
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={fieldId}
            type={type}
            value={value}
            disabled={disabled}
            list={listId}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {listId ? (
            <datalist id={listId}>
              {suggestions!.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
    </div>
  )
}
