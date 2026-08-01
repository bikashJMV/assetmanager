import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import AssetBulkImportModal from '../form/AssetBulkImportModal'
import AssetForm from '../form/AssetForm'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { hasActiveAdminAccess, type AssetInventoryRecord } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { LOADING } from '../../constants/loading'
import { BulkImportHint } from './newAsset/BulkImportHint'

export default function NewAsset() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlTag = searchParams.get('tag')
  const urlReservationId = searchParams.get('reservation_id')

  const [accessState, setAccessState] = useState<'loading' | 'allowed' | 'denied'>('loading')
  const [error, setError] = useState('')
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  /** Mirrors the form's category so import rows with a blank category can fall back to it. */
  const [formCategorySlug, setFormCategorySlug] = useState('laptop')

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

  const handleCreated = (result: unknown) => {
    const tag = (result as AssetInventoryRecord)?.asset_tag ?? urlTag
    if (tag) {
      void navigate(`/assets/${encodeURIComponent(tag)}`)
      return
    }
    void navigate('/assets')
  }

  if (accessState === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app px-6 py-8 text-primary">
        <p className="text-sm text-subtle">{LOADING.CHECKING_ADMIN_ACCESS}</p>
      </main>
    )
  }

  if (accessState === 'denied') {
    return (
      <main className="min-h-screen bg-app px-6 py-8 text-primary">
        <div className="mx-auto max-w-3xl rounded-2xl border border-base bg-surface-2 p-6">
          <h1 className="text-xl font-semibold">Admin Access Required</h1>
          <p className="mt-2 text-sm text-muted">
            You need active admin access to create or update asset records.
          </p>
          {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
          <button
            onClick={() => navigate('/assets')}
            className="mt-5 rounded-xl border border-base bg-surface px-4 py-2 text-sm font-semibold text-primary transition hover:bg-surface-3"
            type="button"
          >
            Back to All Assets
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app px-4 py-4 text-primary sm:px-6">
      <div className="mx-auto max-w-[1150px] space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-base bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-primary sm:text-xl">Create asset</h1>
            <p className="text-sm text-muted">
              Pick a category, or choose <span className="font-medium text-primary">Other</span> to name your own.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <BulkImportHint />
            <button
              type="button"
              onClick={() => setBulkImportOpen(true)}
              className="inline-flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border border-base bg-surface px-4 text-sm font-semibold text-primary shadow-sm transition hover:border-[color:var(--accent-soft)] hover:bg-[color:var(--accent-soft)]/20 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
            >
              <span className="inline-flex h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">
                <AnimatedNavIcon name="upload" />
              </span>
              Bulk import
            </button>
          </div>
        </div>

        <AssetBulkImportModal
          open={bulkImportOpen}
          onClose={() => setBulkImportOpen(false)}
          onSuccess={() => void navigate('/assets')}
          defaultCategorySlug={formCategorySlug || undefined}
        />

        {urlTag ? (
          <div className="rounded-lg border border-base bg-surface-2 px-4 py-3">
            <p className="text-sm text-primary">
              Logging reserved tag: <strong className="text-accent">{urlTag}</strong>
            </p>
          </div>
        ) : null}

        <AssetForm
          variant="panel"
          prefill={{ status: 'in_stock', category_slug: 'laptop' }}
          qr_reservation_id={urlReservationId || undefined}
          onCategoryChange={setFormCategorySlug}
          onClose={() => navigate('/assets')}
          onSuccess={handleCreated}
        />
      </div>
    </main>
  )
}
