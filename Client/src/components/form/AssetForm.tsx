import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAsset,
  getCustomFieldDefinitions,
  listCategories,
  listDepartmentObjects,
  setAssetLifecycleStatus,
  type AssetWriteInput,
  type CategoryRecord,
  type CustomFieldDefinition,
  type DepartmentRecord,
  updateAsset,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatEnumLabel } from '../../utils/formatDisplay'
import { getCatalogLocationLabels } from '../../utils/locationAddressCatalog'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import { useToast } from '../../hooks/useToast'

type Props = {
  prefill?: Partial<AssetWriteInput>
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'
  categoryLocked?: boolean
  lockedCategoryLabel?: string
  qr_reservation_id?: string
  isStatusDisabled?: boolean
  initialCategories?: CategoryRecord[]
}


type FormState = {
  asset_tag: string
  category_slug: string
  department_id: string
  manufacturer_name: string
  model: string
  serial_number: string
  location_name: string
  purchase_date: string
  warranty_expiry: string
  status: string
  notes: string
}

type ExtraPair = { id: string; key: string; value: string }

const inventoryStatuses = ['in_stock', 'in_repair', 'retired', 'lost', 'disposed']
const lifecycleEditStatuses = ['in_stock', 'in_repair', 'retired', 'lost', 'disposed']

function getCategoryLabelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const defaultForm: FormState = {
  asset_tag: '',
  category_slug: 'laptop',
  department_id: '',
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
  qr_reservation_id,
  isStatusDisabled = false,
  initialCategories,
}: Props) {

  const isEditing = !!prefill.asset_tag
  const originalStatus = prefill.status || 'in_stock'
  const isPanel = variant === 'panel'
  const lockCategory = Boolean(categoryLocked && !isEditing)
  const isTagReadOnly = Boolean(isEditing || prefill.asset_tag)

  const [form, setForm] = useState<FormState>({
    ...defaultForm,
    asset_tag: prefill.asset_tag || '',
    category_slug: prefill.category_slug || 'laptop',
    department_id: prefill.department_id || '',
    manufacturer_name: prefill.manufacturer_name || '',
    model: prefill.model || '',
    serial_number: prefill.serial_number || '',
    location_name: prefill.location_name || '',
    purchase_date: prefill.purchase_date || '',
    warranty_expiry: prefill.warranty_expiry || '',
    status: prefill.status || 'in_stock',
    notes: typeof prefill.metadata?.notes === 'string' ? prefill.metadata.notes : '',
  })

  const isLegacyTag = Boolean(form.asset_tag && /^AST-\d{5}$/i.test(form.asset_tag))

  const [customDefs, setCustomDefs] = useState<CustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [extraPairs, setExtraPairs] = useState<ExtraPair[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [departments, setDepartments] = useState<DepartmentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.slug === form.category_slug)
  }, [categories, form.category_slug])

  const currentAlias = selectedCategory?.alias_code || 'OTH'

  const [seqPart, setSeqPart] = useState('')

  const [tagValidation, setTagValidation] = useState<{
    valid: boolean
    reason: string | null
    suggestions: string[]
  } | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const handleSeqChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 5)
    setSeqPart(raw)
  }

  const handleAutoAssign = async () => {
    if (!selectedCategory) {
      showToast({ message: 'Categories are still loading — please wait a moment.', variant: 'error' })
      return
    }
    try {
      const { getNextTag } = await import('../../services/assetService')
      const tag = await getNextTag(currentAlias)
      const parts = tag.split('-')
      const num = parts[parts.length - 1]
      setSeqPart(num)
    } catch (err) {
      showToast({ message: 'Failed to generate auto-assigned tag.', variant: 'error' })
    }
  }

  // Clear seqPart when category slug changes to avoid mismatched alias prefixes
  useEffect(() => {
    if (!isTagReadOnly) {
      setSeqPart('')
    }
  }, [form.category_slug, isTagReadOnly])

  // Clear seqPart if alias was a stale OTH fallback and now resolves to the real alias
  useEffect(() => {
    if (isTagReadOnly) return
    if (prevAliasRef.current === 'OTH' && currentAlias !== 'OTH') {
      setSeqPart('')
    }
    prevAliasRef.current = currentAlias
  }, [currentAlias, isTagReadOnly])

  // Automatically assemble asset_tag from JMV-{alias}-{seqPart}
  useEffect(() => {
    if (isTagReadOnly) return
    const cleanSeq = seqPart.replace(/\D/g, '').slice(0, 5)
    if (cleanSeq.length === 5) {
      setForm((c) => ({ ...c, asset_tag: `JMV-${currentAlias}-${cleanSeq}` }))
    } else if (cleanSeq.length > 0) {
      setForm((c) => ({ ...c, asset_tag: `JMV-${currentAlias}-${cleanSeq.padStart(5, '0')}` }))
    } else {
      setForm((c) => ({ ...c, asset_tag: '' }))
    }
  }, [seqPart, currentAlias, isTagReadOnly])

  useEffect(() => {
    if (isTagReadOnly || !form.asset_tag.trim()) {
      setTagValidation(null)
      return
    }

    const delay = setTimeout(async () => {
      setIsValidating(true)
      try {
        const { validateTag } = await import('../../services/assetService')
        const result = await validateTag(form.asset_tag)
        setTagValidation(result)
      } catch (err) {
        setTagValidation(null)
      } finally {
        setIsValidating(false)
      }
    }, 500)

    return () => clearTimeout(delay)
  }, [form.asset_tag, isTagReadOnly])

  // Tracks the previous alias to detect when it resolves from the stale OTH fallback
  const prevAliasRef = useRef<string>(currentAlias)

  // Tracks the last loaded category so we know whether this is initial load or a user-driven change.
  const prevCategoryRef = useRef<string | null>(null)

  // Load categories — use parent-provided list when available to avoid async race
  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      setCategories(initialCategories)
      return
    }
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
  }, [lockCategory, initialCategories])

  // Load departments for the department picker
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const rows = await listDepartmentObjects()
        if (mounted) setDepartments(rows)
      } catch {
        // non-critical — leave empty
      }
    })()
    return () => { mounted = false }
  }, [])

  // Load custom field definitions whenever category changes.
  // On the very first load (prevCategoryRef === null) we seed template values from prefill.custom_fields
  // and split out any unknown keys into extraPairs.
  // On a user-driven category switch we reset template values to empty but keep extraPairs.
  useEffect(() => {
    if (!form.category_slug) return
    let mounted = true
    void (async () => {
      try {
        const defs = await getCustomFieldDefinitions(form.category_slug)
        if (!mounted) return
        setCustomDefs(defs)

        const templateKeys = new Set(defs.map((d) => d.field_key))
        const isFirstLoad = prevCategoryRef.current === null
        prevCategoryRef.current = form.category_slug

        if (isFirstLoad) {
          // Seed from prefill — split into template values + extra pairs
          const existing = (prefill.custom_fields ?? {}) as Record<string, unknown>
          const templateInit: Record<string, string> = {}
          const extraInit: ExtraPair[] = []
          for (const d of defs) {
            const v = existing[d.field_key]
            templateInit[d.field_key] = v == null ? '' : String(v)
          }
          for (const [k, v] of Object.entries(existing)) {
            if (!templateKeys.has(k)) {
              extraInit.push({ id: crypto.randomUUID(), key: k, value: v == null ? '' : String(v) })
            }
          }
          setCustomValues(templateInit)
          setExtraPairs(extraInit)
        } else {
          // User switched category — reset template fields to empty, keep extra pairs unchanged
          const templateInit: Record<string, string> = {}
          for (const d of defs) {
            templateInit[d.field_key] = ''
          }
          setCustomValues(templateInit)
        }
      } catch (err) {
        if (!mounted) return
        logDevError('assetForm.customFields', err)
        setError(getUserFacingMessage(err, 'Unable to load custom fields right now.'))
      }
    })()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category_slug])

  const locationSuggestions = useMemo(() => getCatalogLocationLabels(), [])

  const categoryOptions = useMemo<FilterSelectOption[]>(() => {
    const options = categories.map((c) => ({ value: c.slug, label: c.name }))
    if (!form.category_slug.trim()) return options
    if (options.some((o) => o.value === form.category_slug)) return options
    return [
      { value: form.category_slug, label: getCategoryLabelFromSlug(form.category_slug) || form.category_slug },
      ...options,
    ]
  }, [categories, form.category_slug])

  const departmentOptions = useMemo<FilterSelectOption[]>(() => {
    const opts = departments.map((d) => ({ value: d.id, label: d.name }))
    return [{ value: '', label: 'No department' }, ...opts]
  }, [departments])

  const inventoryStatusOptions = useMemo<FilterSelectOption[]>(() => {
    const statuses = isEditing
      ? Array.from(new Set([originalStatus, ...lifecycleEditStatuses]))
      : inventoryStatuses
    return statuses.map((s) => ({ value: s, label: formatEnumLabel(s) }))
  }, [isEditing, originalStatus])

  const addExtraPair = () =>
    setExtraPairs((prev) => [...prev, { id: crypto.randomUUID(), key: '', value: '' }])

  const updateExtraPair = (id: string, patch: Partial<ExtraPair>) =>
    setExtraPairs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const removeExtraPair = (id: string) =>
    setExtraPairs((prev) => prev.filter((p) => p.id !== id))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.category_slug.trim()) {
      setError('Category is required.')
      return
    }
    if (!form.serial_number.trim()) {
      setError('Serial number is required.')
      return
    }

    // Validate extra pairs: no empty keys with values, no duplicates, no collision with template keys
    const templateKeySet = new Set(customDefs.map((d) => d.field_key))
    const seenExtra = new Set<string>()
    for (const p of extraPairs) {
      const k = p.key.trim()
      const v = p.value.trim()
      if (!k && !v) continue
      if (!k) {
        setError('Each "Additional Details" entry needs a label. Remove empty rows or fill in the label.')
        return
      }
      if (templateKeySet.has(k)) {
        setError(`"${k}" is already a template field. Use a different label for the additional detail.`)
        return
      }
      if (seenExtra.has(k)) {
        setError(`Duplicate label "${k}" in Additional Details. Each label must be unique.`)
        return
      }
      seenExtra.add(k)
    }

    if (tagValidation && !tagValidation.valid) {
      setError(tagValidation.reason || 'Asset tag is invalid.')
      return
    }

    setLoading(true)
    try {
      const typeByKey = new Map(customDefs.map((d) => [d.field_key, d.data_type] as const))
      const preparedTemplateFields = Object.fromEntries(
        Object.entries(customValues)
          .map(([key, raw]) => [key, coerceValue(raw, typeByKey.get(key) || 'text')] as const)
          .filter(([, v]) => v !== null && v !== ''),
      )
      const preparedExtraFields = Object.fromEntries(
        extraPairs
          .filter((p) => p.key.trim() && p.value.trim())
          .map((p) => [p.key.trim(), p.value.trim()]),
      )
      const custom_fields: Record<string, unknown> = { ...preparedTemplateFields, ...preparedExtraFields }

      const payload: AssetWriteInput = {
        asset_tag: form.asset_tag.trim() || undefined,
        category_slug: form.category_slug,
        department_id: form.department_id || undefined,
        manufacturer_name: form.manufacturer_name.trim() || undefined,
        model: form.model.trim() || undefined,
        serial_number: form.serial_number.trim(),
        location_name: form.location_name.trim() || undefined,
        purchase_date: form.purchase_date || undefined,
        warranty_expiry: form.warranty_expiry || undefined,
        status: form.status || undefined,
        custom_fields,
        metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined,
        qr_reservation_id: qr_reservation_id || undefined,
      }


      let result: unknown
      if (isEditing && prefill.asset_tag) {
        result = await updateAsset(prefill.asset_tag, {
          asset_tag: payload.asset_tag,
          category_slug: payload.category_slug,
          manufacturer_name: payload.manufacturer_name,
          model: payload.model,
          serial_number: payload.serial_number,
          location_name: payload.location_name,
          purchase_date: payload.purchase_date,
          warranty_expiry: payload.warranty_expiry,
          custom_fields: payload.custom_fields,
          metadata: payload.metadata,
        })

        if (form.status !== originalStatus) {
          try {
            await setAssetLifecycleStatus(prefill.asset_tag, form.status, undefined, 'asset_edit')
          } catch (statusErr) {
            throw new Error(
              `Asset details were saved, but inventory status was not updated. ${getUserFacingMessage(
                statusErr,
                'Please retry the inventory status change.',
              )}`,
            )
          }
        }
      } else {
        result = await createAsset(payload)
      }

      showToast({
        message: isEditing
          ? form.status !== originalStatus
            ? 'Asset details and inventory status updated successfully.'
            : 'Asset updated successfully.'
          : 'Asset created successfully.',
        variant: 'success',
      })
      onSuccess(result)

      if (!isEditing) {
        setForm(defaultForm)
        setCustomValues({})
        setExtraPairs([])
      }
    } catch (err) {
      logDevError('assetForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save asset right now.'))
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <div className={`bg-app border border-base w-full ${isPanel ? '' : 'max-w-7xl'}`}>
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-base bg-surface rounded-t-2xl">
        <h2 className="font-semibold text-primary text-sm sm:text-base">
          {isEditing
            ? `Edit Asset ${prefill.asset_tag}`
            : lockCategory && lockedCategoryLabel
              ? `Add new asset — ${lockedCategoryLabel}`
              : 'Add New Asset'}
        </h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        <section className="p-2.5 sm:p-3 space-y-4">
          {isLegacyTag && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs leading-relaxed space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                ⚠️ Legacy Tag Format Detected
              </p>
              <p>
                This QR label uses the legacy tag format. The asset will be registered with the tag <strong>{form.asset_tag}</strong>. Future batches will utilize the new categorized <strong>JMV-{currentAlias}-xxxxx</strong> format.
              </p>
            </div>
          )}

          {/* ── Core Details ── */}
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">Core Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* <Field
                label="Asset Tag"
                value={isEditing ? form.asset_tag : ''}
                placeholder={isEditing ? 'AST-00001' : 'Auto-generated on save'}
                onChange={(v) => setForm((c) => ({ ...c, asset_tag: v }))}
                disabled
              /> */}
              <div>
                <label htmlFor="asset-form-tag" className="block text-muted text-xs mb-0.5 flex justify-between items-center">
                  <span>Asset Tag {isTagReadOnly ? <span className="text-accent">*</span> : ''}</span>
                  {!isTagReadOnly && (
                    <button
                      type="button"
                      onClick={handleAutoAssign}
                      disabled={!selectedCategory}
                      className="text-xs text-accent hover:underline font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      Auto-Assign Tag
                    </button>
                  )}
                </label>

                {isTagReadOnly ? (
                  <input
                    id="asset-form-tag"
                    type="text"
                    value={form.asset_tag}
                    disabled
                    className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2 text-primary text-sm opacity-60 cursor-not-allowed"
                  />
                ) : (
                  <div className="flex items-stretch rounded-lg overflow-hidden border border-base bg-app focus-within:border-[color:var(--accent)] focus-within:ring-2 focus-within:ring-[color:var(--accent-soft)] transition">
                    <span className="flex items-center bg-surface-2 text-muted text-sm font-semibold px-3 border-r border-base select-none">
                      {categories.length === 0 ? (
                        <span className="animate-pulse text-subtle">Loading...</span>
                      ) : (
                        `JMV-${currentAlias}-`
                      )}
                    </span>
                    <input
                      id="asset-form-tag"
                      type="text"
                      maxLength={5}
                      value={seqPart}
                      placeholder="00000"
                      onChange={handleSeqChange}
                      disabled={categories.length === 0}
                      className="w-full bg-transparent py-2 px-3 text-primary placeholder:text-subtle text-sm outline-none border-none disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                )}

                {isValidating && (
                  <p className="text-[11px] text-muted mt-1 animate-pulse">Checking availability...</p>
                )}
                {!isValidating && tagValidation && (
                  <div className="mt-1 text-xs">
                    {tagValidation.valid ? (
                      <p className="text-emerald-500 font-semibold flex items-center gap-1">
                        ✓ Available
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-accent font-semibold flex items-center gap-1">
                          ✗ {tagValidation.reason}
                        </p>
                        {tagValidation.suggestions && tagValidation.suggestions.length > 0 && (
                          <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
                            <span>Suggested:</span>
                            {tagValidation.suggestions.map((sug) => {
                              const parts = sug.split('-')
                              const displayLabel = parts[parts.length - 1]
                              return (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() => setSeqPart(displayLabel)}
                                  className="bg-surface border border-base hover:border-accent text-accent px-1.5 py-0.5 rounded text-[10px] font-semibold transition"
                                >
                                  {displayLabel}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="asset-form-category" className="block text-muted text-xs mb-0.5">
                  Category{' '}
                  <span className="text-accent" aria-hidden="true">*</span>
                </label>
                {lockCategory ? (
                  <div
                    id="asset-form-category"
                    className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2 text-primary text-sm"
                  >
                    {lockedCategoryLabel || getCategoryLabelFromSlug(form.category_slug) || form.category_slug}
                  </div>
                ) : (
                  <FilterSelect
                    label="Category"
                    ariaLabel="Select asset category"
                    value={form.category_slug}
                    options={categoryOptions}
                    onChange={(v) => setForm((c) => ({ ...c, category_slug: v }))}
                    hideLabel
                    dense
                    triggerId="asset-form-category"
                  />
                )}
              </div>

              <div>
                <label htmlFor="asset-form-department" className="block text-muted text-xs mb-0.5">
                  Department
                </label>
                <FilterSelect
                  label="Department"
                  ariaLabel="Select department"
                  value={form.department_id}
                  options={departmentOptions}
                  onChange={(v) => setForm((c) => ({ ...c, department_id: v }))}
                  hideLabel
                  dense
                  triggerId="asset-form-department"
                />
              </div>

              <Field
                label="Serial Number"
                requiredMark
                value={form.serial_number}
                placeholder="e.g. SN-ABC12345678"
                onChange={(v) => setForm((c) => ({ ...c, serial_number: v }))}
              />

              <Field
                label="Manufacturer"
                value={form.manufacturer_name}
                placeholder="e.g. Dell, Lenovo, Apple"
                onChange={(v) => setForm((c) => ({ ...c, manufacturer_name: v }))}
              />

              <Field
                label="Model"
                value={form.model}
                placeholder="e.g. Latitude 5540"
                onChange={(v) => setForm((c) => ({ ...c, model: v }))}
              />

              <div>
                <label htmlFor="asset-form-status" className="block text-muted text-xs mb-0.5">
                  Inventory Status{' '}
                  <span className="text-accent" aria-hidden="true">*</span>
                </label>
                <FilterSelect
                  label="Inventory Status"
                  ariaLabel="Select inventory status"
                  value={form.status}
                  options={inventoryStatusOptions}
                  onChange={(v) => setForm((c) => ({ ...c, status: v }))}
                  hideLabel
                  dense
                  triggerId="asset-form-status"
                  disabled={isStatusDisabled}
                  title={isStatusDisabled ? "Cannot change status while asset is assigned and in edit mode" : undefined}
                />
                <p className="text-[11px] text-muted mt-0.5 leading-snug">
                  Status changes in edit mode are logged in asset history.
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="asset-form-location-name" className="block text-muted text-xs mb-0.5">
                  Location name
                </label>
                <input
                  id="asset-form-location-name"
                  list="asset-location-suggestions"
                  value={form.location_name}
                  onChange={(e) => setForm((c) => ({ ...c, location_name: e.target.value }))}
                  placeholder="Address or office location"
                  autoComplete="off"
                  className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                />
                <datalist id="asset-location-suggestions">
                  {locationSuggestions.map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
              </div>

              <Field
                label="Purchase Date"
                type="date"
                value={form.purchase_date}
                placeholder="YYYY-MM-DD"
                onChange={(v) => setForm((c) => ({ ...c, purchase_date: v }))}
              />
              <Field
                label="Warranty Expiry"
                type="date"
                value={form.warranty_expiry}
                placeholder="YYYY-MM-DD"
                onChange={(v) => setForm((c) => ({ ...c, warranty_expiry: v }))}
              />

            </div>
          </div>

          {/* ── Category template fields ── */}
          {customDefs.length > 0 && (
            <div className="border-t border-base pt-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted mb-2">
                {getCategoryLabelFromSlug(form.category_slug)} fields
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {customDefs.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={customValues[field.field_key] || ''}
                    onChange={(v) =>
                      setCustomValues((c) => ({ ...c, [field.field_key]: v }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Additional Details (free-form key-value) ── */}
          <div className="border-t border-base pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Additional Details</p>
              <button
                type="button"
                onClick={addExtraPair}
                className="text-accent bg-orange-500 text-on-accent px-2 text-md font-semibold hover:underline hover:decoration-black transition rounded"
                aria-label="Add additional detail"
              >
                + Add
              </button>
            </div>
            {extraPairs.length === 0 ? (
              <p className="text-sm text-subtle italic">
                No extra details yet. Click "+ Add" to attach custom key-value information.
              </p>
            ) : (
              <div className="space-y-2">
                {extraPairs.map((pair) => (
                  <div
                    key={pair.id}
                    className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
                  >
                    <input
                      value={pair.key}
                      onChange={(e) => updateExtraPair(pair.id, { key: e.target.value })}
                      placeholder="Label — e.g. wifi_address"
                      className="flex-1 min-w-0 bg-app border border-base rounded-lg px-3 py-2 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                    />
                    <input
                      value={pair.value}
                      onChange={(e) => updateExtraPair(pair.id, { value: e.target.value })}
                      placeholder="Value — e.g. 192.168.1.50"
                      className="flex-1 min-w-0 bg-app border border-base rounded-lg px-3 py-2 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
                    />
                    <button
                      type="button"
                      onClick={() => removeExtraPair(pair.id)}
                      className="shrink-0 text-xs text-muted hover:text-accent px-2 py-1.5"
                      aria-label="Remove row"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="border-t border-base pt-3">
            <label className="block text-muted text-xs mb-0.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              rows={2}
              className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition resize-none"
              placeholder="Operational notes, procurement references…"
            />
          </div>
        </section>

        {error && <p className="text-accent text-sm">{error}</p>}

        {/* <p className="text-[11px] text-muted leading-relaxed border-t border-base pt-2.5 mt-1">
          <span className="text-accent font-semibold">*</span> Asset tag is auto-generated. Category and serial number
          are the only required fields; everything else is optional.
          All other fields including template and additional details are optional.
        </p> */}

        <p className="text-[11px] text-muted leading-relaxed border-t border-base pt-2.5 mt-1">
          <span className="text-accent font-semibold">*</span>{' '}
          {`Asset tag is auto-generated from the selected category. Category and serial number are required; others are optional.`}
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
            className="flex-1 bg-accent text-on-accent font-semibold py-2 rounded-lg hover:bg-accent-hover transition text-sm disabled:opacity-60 shadow-accent"
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
            <span className="text-accent" aria-hidden="true">*</span>
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
    case 'number': return 'e.g. 8'
    case 'date': return 'YYYY-MM-DD'
    case 'json': return 'e.g. {"key": "value"}'
    default: return `Enter ${field.label}`
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
      <label className="block text-muted text-xs mb-0.5">{field.label}</label>

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
