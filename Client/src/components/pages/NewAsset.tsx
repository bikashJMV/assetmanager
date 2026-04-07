import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetBulkImportModal from '../form/AssetBulkImportModal'
import AssetForm from '../form/AssetForm'
import CategoryPickerGrid from '../form/CategoryPickerGrid'
import OtherAssetForm from '../form/OtherAssetForm'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import InfoHint from '../common/InfoHint'
import { hasActiveAdminAccess, listCategories, type AssetInventoryRecord, type CategoryRecord } from '../../api'
import {
  ASSET_IMPORT_MAX_ROWS,
  ASSET_IMPORT_TEMPLATE_HREF,
} from '../../utils/assetBulkImport'
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

  /** Mode B uses slug from picker — closing avoids stale slug if user changes chip while dialog was open. */
  useEffect(() => {
    setBulkImportOpen(false)
  }, [effectiveSlug])

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
  const importDefaultCategorySlug = effectiveSlug && effectiveSlug !== 'other' ? effectiveSlug : undefined

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-5">

        <div className="rounded-2xl border border-base bg-surface px-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-primary">Add new asset</h1>
              <p className="text-sm text-muted">
                Choose a category in the row below — the form updates on this page. Defaults to{' '}
                <strong className="text-primary font-medium">Laptop</strong> when that category exists.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-0.5">
              <InfoHint
                panelTitle="Bulk import"
                ariaLabel="Bulk import quick reference"
                className="shrink-0"
              >
                <p className="text-primary font-medium">Admin / IT Ops only.</p>
                <p>
                  <span className="text-primary">.xlsx / .xls</span>, sheet named{' '}
                  <span className="text-primary font-medium">Import</span> preferred (else first sheet). Header row
                  required. Max{' '}
                  <span className="tabular-nums text-primary">{ASSET_IMPORT_MAX_ROWS}</span> data rows.
                </p>
                <p>
                  Use <span className="text-primary font-medium">database column names</span> (e.g.{' '}
                  <code className="text-[0.8rem] text-primary">manufacturer_name</code>,{' '}
                  <code className="text-[0.8rem] text-primary">ram_gb</code>). For mixed or custom imports, include{' '}
                  <code className="text-[0.8rem] text-primary">category_name</code> (or{' '}
                  <code className="text-[0.8rem] text-primary">category_slug</code>) per row. If blank, selected page
                  category is used. Asset tags are generated by the system. Assignment columns are not allowed.
                </p>
                <p>
                  If any <span className="text-primary font-medium">serial_number</span> appears twice in the same file,
                  or random/invalid data is found, the entire import is cancelled before anything is saved.
                </p>
                <div className="mt-2 border-t border-base pt-3">
                  <a
                    href={ASSET_IMPORT_TEMPLATE_HREF}
                    download
                    className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
                  >
                    <span
                      className="inline-flex h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-4"
                      aria-hidden="true"
                    >
                      <AnimatedNavIcon name="download" />
                    </span>
                    Download sample file
                  </a>
                </div>
              </InfoHint>
              <button
                type="button"
                onClick={() => setBulkImportOpen(true)}
                className="inline-flex h-11 min-h-11 shrink-0 items-center gap-2 rounded-xl border border-base bg-surface px-4 text-sm font-semibold text-primary shadow-sm transition [-webkit-tap-highlight-color:transparent] hover:border-[color:var(--accent-soft)] hover:bg-[color:var(--accent-soft)]/20 hover:text-accent active:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] disabled:pointer-events-none disabled:opacity-45"
              >
                <span
                  className="inline-flex h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-5"
                  aria-hidden="true"
                >
                  <AnimatedNavIcon name="upload" />
                </span>
                Bulk import
              </button>
            </div>
          </div>

          <div className="mt-5">
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
        </div>

        <AssetBulkImportModal
          open={bulkImportOpen}
          onClose={() => setBulkImportOpen(false)}
          onSuccess={() => void navigate('/assets')}
          defaultCategorySlug={importDefaultCategorySlug}
        />

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
