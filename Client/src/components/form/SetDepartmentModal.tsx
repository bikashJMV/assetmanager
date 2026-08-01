import { useEffect, useState } from 'react'
import type { EmployeeRecord } from '../../types/api'
import { LOADING } from '../../constants/loading'

/** Focused quick-editor: add/update just an employee's department from the employee table. */
export default function SetDepartmentModal({
  employee,
  departmentOptions,
  saving,
  onSave,
  onClose,
}: {
  employee: EmployeeRecord | null
  departmentOptions: string[]
  saving: boolean
  onSave: (department: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(employee?.department ?? '')
  }, [employee])

  useEffect(() => {
    if (!employee) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [employee])

  if (!employee) return null

  const trimmed = value.trim()
  const unchanged = trimmed === (employee.department ?? '').trim()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmed || unchanged || saving) return
    onSave(trimmed)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-base bg-app p-5 shadow-2xl sm:p-6"
      >
        <h3 className="text-lg font-semibold text-primary">Set department</h3>
        <p className="mt-1 text-xs text-muted">
          {employee.name} · {employee.employee_id}
        </p>

        <label htmlFor="set-dept-input" className="mt-4 mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          Department <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="set-dept-input"
          list="set-dept-suggestions"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. R&D, IT, Finance"
          autoComplete="off"
          autoFocus
          className="h-11 w-full rounded-lg border border-base bg-app px-3 text-sm text-primary placeholder:text-subtle outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        />
        <datalist id="set-dept-suggestions">
          {departmentOptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <p className="mt-2 text-xs text-muted">
          Assets currently held by this employee will follow the new department (recorded in each asset's audit trail).
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-base bg-surface px-5 py-2 text-sm text-primary transition hover:bg-surface-2 sm:min-w-[110px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed || unchanged || saving}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-on-accent shadow-accent transition hover:bg-accent-hover disabled:opacity-60 sm:min-w-[140px]"
          >
            {saving ? LOADING.SAVING : 'Save department'}
          </button>
        </div>
      </form>
    </div>
  )
}
