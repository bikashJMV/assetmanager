import { useEffect, useMemo, useState } from 'react'
import { createAsset, listCategories, slugifyCategoryLabel } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { useToast } from '../common/ToastProvider'

type KvRow = { key: string; value: string }

type Props = {
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'
}

const emptyRow = (): KvRow => ({ key: '', value: '' })

export default function OtherAssetForm({ onClose, onSuccess, variant = 'panel' }: Props) {
  const isPanel = variant === 'panel'
  const [categoryName, setCategoryName] = useState('')
  const [assetTitle, setAssetTitle] = useState('')
  const [rows, setRows] = useState<KvRow[]>([emptyRow(), emptyRow()])
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const { showToast } = useToast()

  const slugPreview = useMemo(() => slugifyCategoryLabel(categoryName), [categoryName])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const list = await listCategories()
        if (!mounted) return
        setExistingSlugs(new Set(list.map((c) => c.slug.toLowerCase())))
      } catch (err) {
        if (!mounted) return
        logDevError('otherAssetForm.categories', err)
        setLoadError(getUserFacingMessage(err, 'Unable to verify existing categories.'))
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const addRow = () => setRows((r) => [...r, emptyRow()])

  const updateRow = (index: number, patch: Partial<KvRow>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  const removeRow = (index: number) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const nameTrim = categoryName.trim()
    if (!nameTrim) {
      setError('Category name is required.')
      return
    }

    const slug = slugifyCategoryLabel(nameTrim)
    if (!slug) {
      setError('Category name must include at least one letter or number.')
      return
    }

    if (existingSlugs.has(slug)) {
      setError(
        `A category with slug "${slug}" already exists. Go back and pick it from the grid, or use a different name.`,
      )
      return
    }

    const customFields: Record<string, string> = {}
    for (const row of rows) {
      const k = row.key.trim()
      const v = row.value.trim()
      if (!k && !v) continue
      if (!k) {
        setError('Each value needs a field name (key), or remove empty rows.')
        return
      }
      if (Object.prototype.hasOwnProperty.call(customFields, k)) {
        setError(`Duplicate field name: "${k}". Remove or rename one.`)
        return
      }
      customFields[k] = v
    }

    setLoading(true)
    try {
      const result = await createAsset({
        category_slug: slug,
        category_name: nameTrim,
        model: assetTitle.trim() || undefined,
        status: 'in_stock',
        custom_fields: customFields,
      })
      showToast({ message: 'Asset created successfully.', variant: 'success' })
      onSuccess(result)
    } catch (err) {
      logDevError('otherAssetForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to create asset right now.'))
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <div className={`bg-app border border-base w-full ${isPanel ? '' : 'max-w-7xl'}`}>
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary text-sm sm:text-base">Custom asset type (Other)</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        {loadError ? <p className="text-xs text-accent">{loadError}</p> : null}

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">New category</p>
            <label htmlFor="other-cat-name" className="block text-muted text-xs mb-0.5">
              Category name{' '}
              <span className="text-accent" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="other-cat-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. Locker bank"
              className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
              required
            />
            <p className="text-[11px] text-subtle mt-0.5">
              URL slug: <span className="font-mono text-muted">{slugPreview || '—'}</span>
            </p>
          </div>

          <div className="border-t border-base pt-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">Asset</p>
            <label htmlFor="other-asset-title" className="block text-muted text-xs mb-0.5">
              Asset name / heading
            </label>
            <input
              id="other-asset-title"
              value={assetTitle}
              onChange={(e) => setAssetTitle(e.target.value)}
              placeholder="e.g. Ground floor — Bank A, slots 1–24"
              className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
            />
            <p className="text-[11px] text-subtle mt-0.5">Stored as model / display label for this asset.</p>
          </div>

          <div className="border-t border-base pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Specs (key / value)</p>
              <button
                type="button"
                onClick={addRow}
                className="text-accent text-sm font-semibold hover:underline"
                aria-label="Add key value row"
              >
                + Add field
              </button>
            </div>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <input
                    value={row.key}
                    onChange={(e) => updateRow(index, { key: e.target.value })}
                    placeholder="Key — e.g. material"
                    className="flex-1 min-w-0 bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                  />
                  <input
                    value={row.value}
                    onChange={(e) => updateRow(index, { value: e.target.value })}
                    placeholder="Value — e.g. Powder-coated steel"
                    className="flex-1 min-w-0 bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                  />
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="shrink-0 text-xs text-muted hover:text-accent px-2 py-1.5"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="text-accent text-sm">{error}</p> : null}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-base bg-surface text-primary py-2 rounded-lg hover:bg-surface-2 transition text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-accent text-white font-semibold py-2 rounded-lg hover:bg-accent-hover transition text-sm disabled:opacity-60 shadow-accent"
          >
            {loading ? 'Creating…' : 'Create asset'}
          </button>
        </div>
      </form>
    </div>
  )

  if (isPanel) return content

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-10 px-4">
      {content}
    </div>
  )
}
