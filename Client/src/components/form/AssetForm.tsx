import { useEffect, useMemo, useState } from 'react'
import {
  createAsset,
  getCustomFieldDefinitions,
  listCategories,
  type AssetWriteInput,
  type CategoryRecord,
  type CustomFieldDefinition,
  updateAsset,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { getCatalogLocationLabels } from '../../utils/locationAddressCatalog'
import { useToast } from '../common/ToastProvider'

type Props = {
  prefill?: Partial<AssetWriteInput>
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'
  /** When true (create flow only), category is fixed — no dropdown. */
  categoryLocked?: boolean
  /** Shown when categoryLocked; falls back to title from slug. */
  lockedCategoryLabel?: string
}

type FormState = {
  asset_tag: string
  category_slug: string
  manufacturer_name: string
  model: string
  serial_number: string
  location_name: string
  purchase_date: string
  warranty_expiry: string
  status: string
  notes: string
}

const inventoryStatuses = ['in_stock', 'assigned', 'in_repair', 'retired', 'lost', 'disposed']

/** Seed category slug is `networking`; accept `network` if used elsewhere. */
function isNetworkingAssetCategory(slug: string): boolean {
  const s = slug.trim().toLowerCase()
  return s === 'networking' || s === 'network'
}

/** Seed category slug is `sim`. */
function isSimAssetCategory(slug: string): boolean {
  return slug.trim().toLowerCase() === 'sim'
}

function hasNonEmptyAnswer(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

const defaultForm: FormState = {
  asset_tag: '',
  category_slug: 'laptop',
  manufacturer_name: '',
  model: '',
  serial_number: '',
  location_name: '',
  purchase_date: '',
  warranty_expiry: '',
  status: 'in_stock',
  notes: '',
}

export default function AssetForm({
  prefill = {},
  onClose,
  onSuccess,
  variant = 'modal',
  categoryLocked = false,
  lockedCategoryLabel,
}: Props) {
  const isEditing = !!prefill.asset_tag
  const isPanel = variant === 'panel'
  const lockCategory = Boolean(categoryLocked && !isEditing)
  const [form, setForm] = useState<FormState>({
    ...defaultForm,
    asset_tag: prefill.asset_tag || '',
    category_slug: prefill.category_slug || 'laptop',
    manufacturer_name: prefill.manufacturer_name || '',
    model: prefill.model || '',
    serial_number: prefill.serial_number || '',
    location_name: prefill.location_name || '',
    purchase_date: prefill.purchase_date || '',
    warranty_expiry: prefill.warranty_expiry || '',
    status: prefill.status || 'in_stock',
    notes: typeof prefill.metadata?.notes === 'string' ? prefill.metadata.notes : '',
  })

  const [customDefs, setCustomDefs] = useState<CustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const existing = (prefill.custom_fields ?? {}) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(existing).map(([key, value]) => [key, value == null ? '' : String(value)])
    )
  })
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    if (lockCategory) return
    let mounted = true
    void (async () => {
      try {
        const rows = await listCategories()
        if (!mounted) return
        setCategories(rows)
      } catch (err) {
        if (!mounted) return
        logDevError('assetForm.categories', err)
        setError(getUserFacingMessage(err, 'Unable to load categories right now.'))
      }
    })()
    return () => {
      mounted = false
    }
  }, [lockCategory])

  useEffect(() => {
    if (!form.category_slug) return
    let mounted = true
    void (async () => {
      try {
        const defs = await getCustomFieldDefinitions(form.category_slug)
        if (!mounted) return
        setCustomDefs(defs)
      } catch (err) {
        if (!mounted) return
        logDevError('assetForm.customFields', err)
        setError(getUserFacingMessage(err, 'Unable to load custom fields right now.'))
      }
    })()
    return () => {
      mounted = false
    }
  }, [form.category_slug])

  const locationSuggestions = useMemo(() => getCatalogLocationLabels(), [])
  const hideNetworkingLifecycleFields = isNetworkingAssetCategory(form.category_slug)
  const hideSimModelAndCategoryFields = isSimAssetCategory(form.category_slug)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.category_slug.trim()) {
      setError('Category is required')
      return
    }

    if (!hasNonEmptyAnswer(form.manufacturer_name)) {
      setError('Manufacturer is required. Enter N/A if not applicable.')
      return
    }
    if (!hideSimModelAndCategoryFields && !hasNonEmptyAnswer(form.model)) {
      setError('Model is required. Enter N/A if not applicable.')
      return
    }
    if (!hasNonEmptyAnswer(form.location_name)) {
      setError('Location name is required. Enter N/A if unknown.')
      return
    }
    if (!hideNetworkingLifecycleFields) {
      if (!hasNonEmptyAnswer(form.serial_number)) {
        setError('Serial number is required. Enter N/A if not available.')
        return
      }
      if (!hasNonEmptyAnswer(form.purchase_date)) {
        setError('Purchase date is required. Pick your best estimate if the exact date is unknown.')
        return
      }
      if (!hasNonEmptyAnswer(form.warranty_expiry)) {
        setError('Warranty expiry is required. Pick your best estimate if the exact date is unknown.')
        return
      }
    }

    if (!hideSimModelAndCategoryFields) {
      const emptyCatField = customDefs.find((field) => !hasNonEmptyAnswer(customValues[field.field_key]))
      if (emptyCatField) {
        setError(
          `${emptyCatField.label} is required. For text fields you may enter N/A if the value is unknown.`,
        )
        return
      }
    }

    setLoading(true)

    try {
      const typeByKey = new Map(customDefs.map((field) => [field.field_key, field.data_type] as const))
      const preparedCustomFields = Object.fromEntries(
        Object.entries(customValues)
          .map(([key, raw]) => [key, coerceValue(raw, typeByKey.get(key) || 'text')] as const)
          .filter(([, value]) => value !== null && value !== '')
      )

      const customFieldsForPayload: Record<string, unknown> = hideSimModelAndCategoryFields
        ? {}
        : preparedCustomFields

      const payload: AssetWriteInput = {
        asset_tag: isEditing ? form.asset_tag.trim() || undefined : undefined,
        category_slug: form.category_slug,
        manufacturer_name: form.manufacturer_name.trim() || undefined,
        model: hideSimModelAndCategoryFields ? '' : form.model.trim() || undefined,
        serial_number: hideNetworkingLifecycleFields
          ? ''
          : form.serial_number.trim() || undefined,
        location_name: form.location_name.trim() || undefined,
        purchase_date: hideNetworkingLifecycleFields ? '' : form.purchase_date || undefined,
        warranty_expiry: hideNetworkingLifecycleFields ? '' : form.warranty_expiry || undefined,
        status: hideNetworkingLifecycleFields ? undefined : form.status || undefined,
        custom_fields: customFieldsForPayload,
        metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined,
      }

      const result = isEditing && prefill.asset_tag
        ? await updateAsset(prefill.asset_tag, payload)
        : await createAsset(payload)

      showToast({
        message: isEditing ? 'Asset updated successfully.' : 'Asset created successfully.',
        variant: 'success',
      })
      onSuccess(result)

      if (!isEditing) {
        setForm(defaultForm)
        setCustomValues({})
      }
    } catch (err) {
      logDevError('assetForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save asset right now.'))
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <div className={`bg-app border border-base  w-full ${isPanel ? '' : 'max-w-7xl'}`}>
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary text-sm sm:text-base">
          {isEditing
            ? `Edit Asset ${prefill.asset_tag}`
            : lockCategory && lockedCategoryLabel
              ? `Add new asset — ${lockedCategoryLabel}`
              : 'Add New Asset'}
        </h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">x</button>
      </div>

      <form onSubmit={handleSubmit} className="px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        <section className=" p-2.5 sm:p-3 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">Core Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Asset Tag"
                value={isEditing ? form.asset_tag : ''}
                placeholder={isEditing ? 'AST-00001' : 'Auto-generated on save'}
                onChange={(value) => setForm((current) => ({ ...current, asset_tag: value }))}
                disabled={true}
              />

              <div>
                <label htmlFor="asset-form-category" className="block text-muted text-xs mb-0.5">
                  Category{' '}
                  <span className="text-accent" aria-hidden="true">
                    *
                  </span>
                </label>
                {lockCategory ? (
                  <div
                    id="asset-form-category"
                    className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2 text-primary text-sm"
                  >
                    {lockedCategoryLabel ||
                      form.category_slug
                        .split('-')
                        .filter(Boolean)
                        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                        .join(' ') ||
                      form.category_slug}
                  </div>
                ) : (
                  <select
                    id="asset-form-category"
                    value={form.category_slug}
                    onChange={(e) => setForm((current) => ({ ...current, category_slug: e.target.value }))}
                    className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                    required
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>{category.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <Field
                label="Manufacturer"
                requiredMark
                value={form.manufacturer_name}
                placeholder="e.g. Dell, Lenovo, Apple — or N/A"
                onChange={(value) => setForm((current) => ({ ...current, manufacturer_name: value }))}
              />
              {!hideSimModelAndCategoryFields && (
                <Field
                  label="Model"
                  requiredMark
                  value={form.model}
                  placeholder="e.g. Latitude 5540 — or N/A"
                  onChange={(value) => setForm((current) => ({ ...current, model: value }))}
                />
              )}
              <div className="md:col-span-2">
                <label htmlFor="asset-form-location-name" className="block text-muted text-xs mb-0.5">
                  Location name{' '}
                  <span className="text-accent" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="asset-form-location-name"
                  list="asset-location-suggestions"
                  value={form.location_name}
                  onChange={(e) => setForm((current) => ({ ...current, location_name: e.target.value }))}
                  placeholder="Address or N/A"
                  autoComplete="off"
                  className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                />
                <datalist id="asset-location-suggestions">
                  {locationSuggestions.map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted mt-0.5 leading-snug">
                  Pick a suggestion or type any address; use N/A if location is not assigned yet.
                </p>
              </div>
              {!hideNetworkingLifecycleFields && (
                <>
                  <Field
                    label="Purchase Date"
                    requiredMark
                    type="date"
                    value={form.purchase_date}
                    placeholder="YYYY-MM-DD"
                    onChange={(value) => setForm((current) => ({ ...current, purchase_date: value }))}
                  />
                  <Field
                    label="Warranty Expiry"
                    requiredMark
                    type="date"
                    value={form.warranty_expiry}
                    placeholder="YYYY-MM-DD"
                    onChange={(value) => setForm((current) => ({ ...current, warranty_expiry: value }))}
                  />

                  <Field
                    label="Serial Number"
                    requiredMark
                    value={form.serial_number}
                    placeholder="e.g. SN-ABC12345678 — or N/A"
                    onChange={(value) => setForm((current) => ({ ...current, serial_number: value }))}
                  />
                  <div>
                    <label htmlFor="asset-form-status" className="block text-muted text-xs mb-0.5">
                      Inventory Status{' '}
                      <span className="text-accent" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <select
                      id="asset-form-status"
                      value={form.status}
                      onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
                      className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                    >
                      {inventoryStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted mt-0.5 leading-snug">
                      Inventory only — not employee ERP status.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {!hideSimModelAndCategoryFields && (
            <div className="border-t border-base pt-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">
                Category fields ({form.category_slug})
              </p>
              {customDefs.length === 0 ? (
                <p className="text-sm text-muted">No extra fields for this category.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {customDefs.map((field) => (
                    <DynamicField
                      key={field.id}
                      field={field}
                      value={customValues[field.field_key] || ''}
                      onChange={(value) =>
                        setCustomValues((current) => ({
                          ...current,
                          [field.field_key]: value,
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-base pt-3">
            <label className="block text-muted text-xs mb-0.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
              rows={2}
              className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition resize-none"
              placeholder="Operational notes, procurement references…"
            />
          </div>
        </section>

        {error && <p className="text-accent text-sm">{error}</p>}

        <p className="text-[11px] text-muted leading-relaxed border-t border-base pt-2.5 mt-1">
          <span className="text-accent font-semibold">*</span> All starred fields are required before you can save (Notes is optional).
          For text inputs, if you do not have a real value, enter <span className="font-mono text-primary">N/A</span>.
          Date fields need a calendar value—use your best estimate when the exact date is unknown. Category-specific
          fields below “Category fields” follow the same rule (N/A is allowed where the field is plain text).
        </p>

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
            {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Asset'}
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

function coerceValue(value: string, dataType: CustomFieldDefinition['data_type']) {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (dataType === 'number') {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : trimmed
  }

  if (dataType === 'boolean') {
    if (trimmed.toLowerCase() === 'true') return true
    if (trimmed.toLowerCase() === 'false') return false
  }

  if (dataType === 'json') {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function Field({
  label,
  requiredMark = false,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
}: {
  label: string
  requiredMark?: boolean
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-muted text-xs mb-0.5">
        {label}
        {requiredMark ? (
          <>
            {' '}
            <span className="text-accent" aria-hidden="true">
              *
            </span>
          </>
        ) : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  )
}

function dynamicFieldPlaceholder(field: CustomFieldDefinition): string {
  switch (field.data_type) {
    case 'number':
      return 'e.g. 8'
    case 'date':
      return 'YYYY-MM-DD'
    case 'json':
      return 'e.g. {"key": "value"}'
    default:
      return `Enter ${field.label} — or N/A`
  }
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition
  value: string
  onChange: (value: string) => void
}) {
  const commonClass =
    'w-full bg-app border border-base rounded-lg px-3 py-2 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition'

  return (
    <div>
      <label className="block text-muted text-xs mb-0.5">
        {field.label}
        <span className="text-accent" aria-hidden="true">
          {' '}
          *
        </span>
      </label>

      {field.data_type === 'boolean' ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={commonClass}>
          <option value="">Select yes or no…</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : field.data_type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={commonClass}>
          <option value="">Choose an option…</option>
          {field.options.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          type={field.data_type === 'date' ? 'date' : field.data_type === 'number' ? 'number' : 'text'}
          value={value}
          placeholder={dynamicFieldPlaceholder(field)}
          onChange={(e) => onChange(e.target.value)}
          className={commonClass}
        />
      )}
    </div>
  )
}
