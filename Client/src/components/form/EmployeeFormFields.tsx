import type { Dispatch, SetStateAction } from 'react'
import type { EmployeeRole } from '../../api'
import type { EmployeeUpsertInput } from '../../types/api'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import Field from './EmployeeFormField'

const ROLE_OPTIONS: FilterSelectOption[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
  { value: 'it_ops', label: 'IT Ops' },
]

const EMPLOYEE_STATUS_OPTIONS: FilterSelectOption[] = [
  { value: 'active', label: 'Active employee' },
  { value: 'inactive', label: 'Inactive employee' },
]

type Props = {
  form: EmployeeUpsertInput
  setForm: Dispatch<SetStateAction<EmployeeUpsertInput>>
  isEditing: boolean
  canManageAdminRole: boolean
  departmentSuggestions: string[]
}

export default function EmployeeFormFields({
  form,
  setForm,
  isEditing,
  canManageAdminRole,
  departmentSuggestions,
}: Props) {
  return (
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
        {canManageAdminRole && (
          <>
            <Field
              label="Employee status"
              type="select"
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(value) =>
                setForm((current) => ({ ...current, is_active: value === 'active' }))
              }
              options={EMPLOYEE_STATUS_OPTIONS}
            />
            <p className="text-[11px] text-muted mt-1">
              Employment / account flag. Assignment is blocked when not active.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
