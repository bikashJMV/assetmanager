import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetForm from '../form/AssetForm'
import { hasActiveAdminAccess } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

export default function NewAsset() {
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
        logDevError('newAsset.access', err)
        setError(getUserFacingMessage(err, 'Unable to verify access right now.'))
        setAccessState('denied')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (accessState === 'loading') {
    return (
      <main className="min-h-screen bg-app text-primary px-6 py-8 flex items-center justify-center">
        <p className="text-subtle text-sm">Checking admin access...</p>
      </main>
    )
  }

  if (accessState === 'denied') {
    return (
      <main className="min-h-screen bg-app text-primary px-6 py-8">
        <div className="max-w-3xl mx-auto bg-surface-2 border border-base rounded-2xl p-6">
          <h1 className="text-xl font-semibold">Admin Access Required</h1>
          <p className="text-sm text-muted mt-2">
            You need active admin access to create or update asset records.
          </p>
          {error ? <p className="text-sm text-accent mt-2">{error}</p> : null}
          <button
            onClick={() => navigate('/assets')}
            className="mt-5 border border-base bg-surface text-primary px-4 py-2 rounded-xl hover:bg-surface-3 transition text-sm font-semibold"
            type="button"
          >
            Back to All Assets
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-4">

        <button
          onClick={() => navigate('/assets')}
          className="text-primary px-4 hover:bg-surface-3 transition text-sm font-semibold"
        >
          &larr; Back to All Assets
        </button>

        <div className="max-w-6xl">
          <AssetForm
            variant="panel"
            prefill={{ status: 'in_stock', category_slug: 'laptop' }}
            onClose={() => navigate('/assets')}
            onSuccess={() => null}
          />
        </div>
      </div>
    </main>
  )
}
