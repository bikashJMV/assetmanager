import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetForm from '../form/AssetForm'
import CategoryPickerGrid from '../form/CategoryPickerGrid'
import OtherAssetForm from '../form/OtherAssetForm'
import { hasActiveAdminAccess, listCategories, type AssetInventoryRecord, type CategoryRecord } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'

export default function NewAsset() {
  const navigate = useNavigate()
  const [accessState, setAccessState] = useState<'loading' | 'allowed' | 'denied'>('loading')
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState('')
  /** Explicit category slug, 'other', or null to use the default (laptop / first category). */
  const [selectedSlug, setSelectedSlug] = useState<string | 'other' | null>(null)

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

  useEffect(() => {
    if (accessState !== 'allowed') return
    let mounted = true
    void (async () => {
      setCategoriesLoading(true)
      setCategoriesError('')
      try {
        const rows = await listCategories()
        if (!mounted) return
        setCategories(rows)
      } catch (err) {
        if (!mounted) return
        logDevError('newAsset.categories', err)
        setCategoriesError(getUserFacingMessage(err, 'Unable to load categories.'))
      } finally {
        if (mounted) setCategoriesLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [accessState])

  const baselineSlug = useMemo(() => {
    if (!categories.length) return null
    const laptop = categories.find((c) => c.slug === 'laptop')
    return laptop?.slug ?? categories[0]!.slug
  }, [categories])

  const effectiveSlug = selectedSlug === 'other' ? 'other' : (selectedSlug ?? baselineSlug)

  const activeCategory = useMemo(() => {
    if (!effectiveSlug || effectiveSlug === 'other') return undefined
    return categories.find((c) => c.slug === effectiveSlug)
  }, [categories, effectiveSlug])

  const handleCreated = (result: unknown) => {
    const tag = (result as AssetInventoryRecord)?.asset_tag
    if (tag) {
      void navigate(`/assets/${encodeURIComponent(tag)}`)
      return
    }
    void navigate('/assets')
  }

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

  const pickerValue = effectiveSlug ?? 'laptop'

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-5">
        <button
          onClick={() => navigate('/assets')}
          className="text-primary px-2 hover:bg-surface-3 transition text-sm font-semibold rounded-lg py-1"
          type="button"
        >
          ← Back to All Assets
        </button>

        <div className="rounded-2xl border border-base bg-surface px-5 sm:p-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary">Add new asset</h1>
            <p className="text-sm text-muted">
              Choose a category in the row below — the form updates on this page. Defaults to{' '}
              <strong className="text-primary font-medium">Laptop</strong> when that category exists.
            </p>
          </div>

          <CategoryPickerGrid
            variant="row"
            categories={categories}
            loading={categoriesLoading}
            error={categoriesError}
            selectedSlug={pickerValue}
            onSelectSlug={(slug) => {
              if (slug === 'other') {
                setSelectedSlug('other')
                return
              }
              setSelectedSlug(slug === baselineSlug ? null : slug)
            }}
          />
        </div>

        {!categoriesLoading && categories.length === 0 && !categoriesError ? (
          <p className="text-sm text-subtle text-center py-6">No categories found. Add categories in the database first.</p>
        ) : null}

        {effectiveSlug === 'other' ? (
          <OtherAssetForm
            variant="panel"
            onClose={() => setSelectedSlug(null)}
            onSuccess={handleCreated}
          />
        ) : effectiveSlug ? (
          <AssetForm
            key={effectiveSlug}
            variant="panel"
            categoryLocked
            lockedCategoryLabel={activeCategory?.name}
            prefill={{
              status: 'in_stock',
              category_slug: effectiveSlug,
            }}
            onClose={() => navigate('/assets')}
            onSuccess={handleCreated}
          />
        ) : (
          <p className="text-sm text-subtle text-center py-8">Loading categories…</p>
        )}
      </div>
    </main>
  )
}
