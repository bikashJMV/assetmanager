import { useState } from 'react'
import type { EmployeeRole, EmployeeUpsertInput } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

type Props = {
  prefill?: Partial<EmployeeUpsertInput>
  onClose: () => void
  onSubmit: (employee: EmployeeUpsertInput) => Promise<void> | void
}

const defaults: EmployeeUpsertInput = {
  employee_code: '',
  name: '',
  email: '',
  department: '',
  role: 'employee',
  is_active: true,
}

const requiredFields: (keyof EmployeeUpsertInput)[] = ['employee_code', 'name', 'department']

export default function EmployeeForm({ prefill, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<EmployeeUpsertInput>({
    ...defaults,
    ...prefill,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = Boolean(prefill?.id)

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
      await onSubmit({
        ...form,
        employee_code: form.employee_code.trim(),
        name: form.name.trim(),
        email: form.email?.trim() || null,
        department: form.department?.trim() || null,
        role: form.role === 'admin' ? 'admin' : 'employee',
      })
    } catch (err) {
      logDevError('employeeForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save employee right now.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-app border border-base w-full shadow-[0_18px_48px_var(--accent-shadow)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary">{isEditing ? 'Edit Employee' : 'Add New Employee'}</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">x</button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
        <div className="rounded-xl border border-base bg-surface p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Employee Code"
              value={form.employee_code}
              required
              onChange={(value) => setForm((current) => ({ ...current, employee_code: value }))}
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
            />
            <Field
              label="Role"
              value={form.role || 'employee'}
              onChange={(value) => setForm((current) => ({ ...current, role: value as EmployeeRole }))}
              type="select"
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
            <div>
              <label className="block text-muted text-xs mb-1">ERP / HR Status</label>
              <select
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.value === 'active' }))}
                className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                aria-label="Employee ERP status"
              >
                <option value="active" className="bg-surface-2 text-primary">Active (ERP/HR)</option>
                <option value="inactive" className="bg-surface-2 text-primary">Inactive (ERP/HR)</option>
              </select>
              <p className="text-[11px] text-muted mt-1">This status is employee ERP/HR status, not asset inventory status.</p>
            </div>
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
  onChange,
}: {
  label: string
  value: string
  required?: boolean
  type?: string
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const fieldId = `employee-form-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

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
        <input
          id={fieldId}
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
        />
      )}
    </div>
  )
}
