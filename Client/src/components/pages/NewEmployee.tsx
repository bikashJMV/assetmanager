import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmployeeForm from '../form/EmployeeForm'
import { hasActiveAdminAccess, upsertEmployee, type EmployeeUpsertInput } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

export default function NewEmployee() {
  const navigate = useNavigate()
  const [accessState, setAccessState] = useState<'loading' | 'allowed' | 'denied'>('loading')
  const [error, setError] = useState('')

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
          <button
            onClick={() => navigate('/employee')}
            className="mt-5 border border-base bg-surface text-primary px-4 py-2 rounded-xl hover:bg-surface-3 transition text-sm font-semibold"
            type="button"
          >
            Back to Employees
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/employee')}
          className="text-primary px-4 hover:bg-surface-3 transition text-sm font-semibold"
        >
          &larr; Back to Employees
        </button>

        <div className="max-w-6xl">
          <EmployeeForm onClose={() => navigate('/employee')} onSubmit={handleCreate} />
        </div>
      </div>
    </main>
  )
}
