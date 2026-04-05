import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmployeeForm from '../form/EmployeeForm'
import EmployeeBulkImportModal from '../form/EmployeeBulkImportModal'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import InfoHint from '../common/InfoHint'
import { useToast } from '../common/ToastProvider'
import { hasActiveAdminAccess, upsertEmployee, type EmployeeUpsertInput } from '../../api'
import {
  EMPLOYEE_IMPORT_MAX_ROWS,
  EMPLOYEE_IMPORT_TEMPLATE_HREF,
} from '../../utils/employeeBulkImport'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

export default function NewEmployee() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [accessState, setAccessState] = useState<'loading' | 'allowed' | 'denied'>('loading')
  const [error, setError] = useState('')
  const [bulkImportOpen, setBulkImportOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const allowed = await hasActiveAdminAccess()
        if (!mounted) return
        setAccessState(allowed ? 'allowed' : 'denied')
      } catch (err) {
        if (!mounted) return
        logDevError('newEmployee.access', err)
        setError(getUserFacingMessage(err, 'Unable to verify access right now.'))
        setAccessState('denied')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const handleCreate = async (employee: EmployeeUpsertInput) => {
    await upsertEmployee(employee)
    showToast({ variant: 'success', message: 'Employee saved successfully.' })
    navigate('/employee')
  }

  if (accessState === 'loading') {
    return (
      <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8 flex items-center justify-center">
        <p className="text-subtle text-sm">Checking admin access...</p>
      </main>
    )
  }

  if (accessState === 'denied') {
    return (
      <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto bg-surface-2 border border-base rounded-2xl p-6">
          <h1 className="text-xl font-semibold">Admin Access Required</h1>
          <p className="text-sm text-muted mt-2">
            You need active admin access to create or update employee records.
          </p>
          {error ? <p className="text-sm text-accent mt-2">{error}</p> : null}
          
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted mt-1">
              OR you can bulk import employees from Excel
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <InfoHint
              panelTitle="Bulk import"
              ariaLabel="Bulk import quick reference"
              className="shrink-0"
            >
              <p className="text-primary font-medium">Admin / IT Ops only.</p>
              <p>
                <span className="text-primary">.xlsx / .xls</span>, first sheet only. Header row required. Max{' '}
                <span className="tabular-nums text-primary">{EMPLOYEE_IMPORT_MAX_ROWS}</span> data rows.
              </p>
              <p>
                <span className="text-primary font-medium">Required:</span>{' '}
                <code className="text-[0.8rem] text-primary">employee_code</code>,{' '}
                <code className="text-[0.8rem] text-primary">name</code>,{' '}
                <code className="text-[0.8rem] text-primary">department</code>.{' '}
                <code className="text-[0.8rem] text-primary">email</code>,{' '}
                <code className="text-[0.8rem] text-primary">is_active</code>,{' '}
                <code className="text-[0.8rem] text-primary">erp_active</code> (true/false).
              </p>
              <p>
                <span className="text-primary font-medium">is_active</span>: active in this app.{' '}
                <span className="text-primary font-medium">erp_active</span>: active in ERP/HR reporting. Bulk import adds{' '}
                <span className="text-primary font-medium">new</span> employees only: if any row fails validation, any
                duplicate <code className="text-[0.8rem] text-primary">employee_code</code> (in the file or already in the
                system), or a Recycle Bin conflict, the entire import is cancelled and nothing is saved. Use the single
                employee form to edit existing records.
              </p>
              <div className="mt-2 border-t border-base pt-3">
                <a
                  href={EMPLOYEE_IMPORT_TEMPLATE_HREF}
                  download
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
                >
                  <span className="inline-flex h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">
                    <AnimatedNavIcon name="download" />
                  </span>
                  Download sample file
                </a>
              </div>
            </InfoHint>
            <button
              type="button"
              onClick={() => setBulkImportOpen(true)}
              className="inline-flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border border-base bg-surface px-4 text-sm font-semibold text-primary shadow-sm transition [-webkit-tap-highlight-color:transparent] hover:border-[color:var(--accent-soft)] hover:bg-[color:var(--accent-soft)]/20 hover:text-accent active:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
            >
              <span className="inline-flex h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">
                <AnimatedNavIcon name="upload" />
              </span>
              Bulk import
            </button>
          </div>
        </div>

        <EmployeeBulkImportModal
          open={bulkImportOpen}
          onClose={() => setBulkImportOpen(false)}
          onSuccess={() => navigate('/employee')}
        />

        <div className="max-w-6xl">
          <EmployeeForm onClose={() => navigate('/employee')} onSubmit={handleCreate} />
        </div>
      </div>
    </main>
  )
}
