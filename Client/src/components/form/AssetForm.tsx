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

type Props = {
  prefill?: Partial<AssetWriteInput>
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'
}

type FormState = {
  asset_tag: string
  category_slug: string
  manufacturer_name: string
  model: string
  serial_number: string
  location_code: string
  location_name: string
  purchase_date: string
  warranty_expiry: string
  status: string
  notes: string
}

const inventoryStatuses = ['in_stock', 'assigned', 'in_repair', 'retired', 'lost', 'disposed']

const defaultForm: FormState = {
  asset_tag: '',
  category_slug: 'laptop',
  manufacturer_name: '',
  model: '',
  serial_number: '',
  location_code: '',
  location_name: '',
  purchase_date: '',
  warranty_expiry: '',
  status: 'in_stock',
  notes: '',
}

export default function AssetForm({ prefill = {}, onClose, onSuccess, variant = 'modal' }: Props) {
  const isEditing = !!prefill.asset_tag
  const isPanel = variant === 'panel'
  const [form, setForm] = useState<FormState>({
    ...defaultForm,
    asset_tag: prefill.asset_tag || '',
    category_slug: prefill.category_slug || 'laptop',
    manufacturer_name: prefill.manufacturer_name || '',
    model: prefill.model || '',
    serial_number: prefill.serial_number || '',
    location_code: prefill.location_code || '',
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
  const [message, setMessage] = useState('')

  useEffect(() => {
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
  }, [])

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

  const requiredDynamicKeys = useMemo(
    () => customDefs.filter((field) => field.is_required).map((field) => field.field_key),
    [customDefs]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!form.category_slug.trim()) {
      setError('Category is required')
      return
    }

    const missingDynamic = requiredDynamicKeys.find((key) => !customValues[key]?.trim())
    if (missingDynamic) {
      const def = customDefs.find((item) => item.field_key === missingDynamic)
      setError(`${def?.label || missingDynamic} is required`)
      return
    }

    setLoading(true)

    try {
      const typeByKey = new Map(customDefs.map((field) => [field.field_key, field.data_type] as const))
      const preparedCustomFields = Object.fromEntries(
        Object.entries(customValues)
          .map(([key, raw]) => [key, coerceValue(raw, typeByKey.get(key) || 'text')] as const)
          .filter(([, value]) => value !== null && value !== '')
      )

      const payload: AssetWriteInput = {
        asset_tag: form.asset_tag.trim() || undefined,
        category_slug: form.category_slug,
        manufacturer_name: form.manufacturer_name.trim() || undefined,
        model: form.model.trim() || undefined,
        serial_number: form.serial_number.trim() || undefined,
        location_code: form.location_code.trim() || undefined,
        location_name: form.location_name.trim() || undefined,
        purchase_date: form.purchase_date || undefined,
        warranty_expiry: form.warranty_expiry || undefined,
        status: form.status || undefined,
        custom_fields: preparedCustomFields,
        metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined,
      }

      const result = isEditing && prefill.asset_tag
        ? await updateAsset(prefill.asset_tag, payload)
        : await createAsset(payload)

      onSuccess(result)
      setMessage(isEditing ? 'Asset updated successfully.' : 'Asset created successfully.')

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
    <div className={`bg-app border border-base shadow-[0_18px_48px_var(--accent-shadow)] w-full ${isPanel ? '' : 'max-w-7xl'}`}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary text-sm sm:text-base">
          {isEditing ? `Edit Asset ${prefill.asset_tag}` : 'Add New Asset'}
        </h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">x</button>
      </div>

      <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 sm:py-6 space-y-5">
        <section className="rounded-xl border border-base bg-surface p-3 sm:p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Core Details</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Asset Tag"
              value={form.asset_tag}
              placeholder="AST-00001"
              onChange={(value) => setForm((current) => ({ ...current, asset_tag: value }))}
              disabled={isEditing}
            />

            <div>
            <label htmlFor="asset-form-category" className="block text-muted text-xs mb-1">Category *</label>
              <select
              id="asset-form-category"
                value={form.category_slug}
                onChange={(e) => setForm((current) => ({ ...current, category_slug: e.target.value }))}
                className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>{category.name}</option>
                ))}
              </select>
            </div>

            <Field
              label="Manufacturer"
              value={form.manufacturer_name}
              onChange={(value) => setForm((current) => ({ ...current, manufacturer_name: value }))}
            />
            <Field
              label="Model"
              value={form.model}
              onChange={(value) => setForm((current) => ({ ...current, model: value }))}
            />
            <Field
              label="Serial Number"
              value={form.serial_number}
              onChange={(value) => setForm((current) => ({ ...current, serial_number: value }))}
            />
            <Field
              label="Location Code"
              value={form.location_code}
              placeholder="BLR-HQ"
              onChange={(value) => setForm((current) => ({ ...current, location_code: value }))}
            />
            <Field
              label="Location Name"
              value={form.location_name}
              onChange={(value) => setForm((current) => ({ ...current, location_name: value }))}
            />
            <Field
              label="Purchase Date"
              type="date"
              value={form.purchase_date}
              onChange={(value) => setForm((current) => ({ ...current, purchase_date: value }))}
            />
            <Field
              label="Warranty Expiry"
              type="date"
              value={form.warranty_expiry}
              onChange={(value) => setForm((current) => ({ ...current, warranty_expiry: value }))}
            />

            <div>
            <label htmlFor="asset-form-status" className="block text-muted text-xs mb-1">Inventory Status</label>
              <select
              id="asset-form-status"
                value={form.status}
                onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
                className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
              >
                {inventoryStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted mt-1">This is asset inventory status, not employee ERP/HR status.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-base bg-surface p-3 sm:p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Dynamic Fields ({form.category_slug})</p>
          {customDefs.length === 0 ? (
            <p className="text-sm text-muted">No dynamic fields found for this category.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </section>

        <section className="rounded-xl border border-base bg-surface p-3 sm:p-4">
          <label className="block text-muted text-xs mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
            rows={3}
            className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition resize-none"
            placeholder="Operational notes, procurement references, etc."
          />
        </section>

        {error && <p className="text-accent text-sm">{error}</p>}
        {message && <p className="text-primary text-sm">{message}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-base bg-surface text-primary py-2.5 rounded-lg hover:bg-surface-2 transition text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-accent text-on-accent font-semibold py-2.5 rounded-lg hover:bg-accent-hover transition text-sm disabled:opacity-60 shadow-accent"
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
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-muted text-xs mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  )
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
  const commonClass = 'w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition'

  return (
    <div>
      <label className="block text-muted text-xs mb-1">
        {field.label}
        {field.is_required && <span className="text-accent"> *</span>}
      </label>

      {field.data_type === 'boolean' ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={commonClass}>
          <option value="">Select</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : field.data_type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? (
        <select aria-label={field.label} value={value} onChange={(e) => onChange(e.target.value)} className={commonClass}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          type={field.data_type === 'date' ? 'date' : field.data_type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={commonClass}
        />
      )}
    </div>
  )
}
