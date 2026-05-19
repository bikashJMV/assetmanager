import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmployeeForm from '../form/EmployeeForm'
import { useToast } from '../../hooks/useToast'
import { hasActiveAdminAccess, upsertEmployee, type EmployeeUpsertInput } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

export default function NewEmployee() {
  const navigate = useNavigate()
  const { showToast } = useToast()
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
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">New Employee</h1>
            <p className="text-sm text-muted mt-1">
              Create a new employee profile to assign assets.
            </p>
          </div>
        </div>

        <div className="max-w-6xl">
          <EmployeeForm onClose={() => navigate('/employee')} onSubmit={handleCreate} />
        </div>
      </div>
    </main>
  )
}
