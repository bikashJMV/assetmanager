import { useMemo, useState } from 'react'
import { slugifyCategoryLabel, type AssetWriteInput } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatEnumLabel } from '../../utils/formatDisplay'
import { getCatalogLocationLabels } from '../../utils/locationAddressCatalog'
import type { FilterSelectOption } from '../common/FilterSelect'
import { useToast } from '../../hooks/useToast'
import { OTHER } from './assetForm.categoryMeta'
import { buildCustomFields, saveAsset, validateAssetForm } from './assetFormSubmit'
import { useCategoryTemplates } from './useCategoryTemplates'

export type FormState = {
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

export type ExtraPair = { id: string; key: string; value: string }

const inventoryStatuses = ['in_stock', 'in_repair', 'retired', 'lost', 'disposed']
const lifecycleEditStatuses = ['in_stock', 'in_repair', 'retired', 'lost', 'disposed']

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

type Options = {
  prefill: Partial<AssetWriteInput>
  onSuccess: (result: unknown) => void
  categoryLocked: boolean
  qr_reservation_id?: string
  onCategoryChange?: (slug: string) => void
}

export function useAssetForm({
  prefill,
  onSuccess,
  categoryLocked,
  qr_reservation_id,
  onCategoryChange,
}: Options) {
  const isEditing = !!prefill.asset_tag
  const originalStatus = prefill.status || 'in_stock'
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

  // "Other" = user-typed custom category; the slug is derived from the name on submit.
  const [isOther, setIsOther] = useState(false)
  const [customCategoryName, setCustomCategoryName] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  const {
    selectableCategories,
    customDefs,
    customValues,
    setCustomValues,
    extraPairs,
    setExtraPairs,
  } = useCategoryTemplates({
    categorySlug: form.category_slug,
    isOther,
    lockCategory,
    prefillCustomFields: (prefill.custom_fields ?? {}) as Record<string, unknown>,
    onError: setError,
  })

  const locationSuggestions = useMemo(() => getCatalogLocationLabels(), [])

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

  const pickCategory = (value: string) => {
    setError('')
    if (value === OTHER) {
      setIsOther(true)
      onCategoryChange?.('')
      return
    }
    setIsOther(false)
    setForm((c) => ({ ...c, category_slug: value }))
    onCategoryChange?.(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedOtherName = customCategoryName.trim()
    const effectiveSlug = isOther ? slugifyCategoryLabel(trimmedOtherName) : form.category_slug

    const validationError = validateAssetForm({
      form,
      isOther,
      effectiveSlug,
      otherName: trimmedOtherName,
      customDefs,
      extraPairs,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const payload: AssetWriteInput = {
        asset_tag: isEditing ? form.asset_tag.trim() || undefined : undefined,
        category_slug: effectiveSlug,
        category_name: isOther ? trimmedOtherName : undefined,
        manufacturer_name: form.manufacturer_name.trim() || undefined,
        model: form.model.trim() || undefined,
        serial_number: form.serial_number.trim(),
        location_name: form.location_name.trim() || undefined,
        purchase_date: form.purchase_date || undefined,
        warranty_expiry: form.warranty_expiry || undefined,
        status: form.status || undefined,
        custom_fields: buildCustomFields(customDefs, customValues, extraPairs),
        metadata: form.notes.trim() ? { notes: form.notes.trim() } : undefined,
        qr_reservation_id: qr_reservation_id || undefined,
      }

      const result = await saveAsset({
        payload,
        isEditing,
        existingTag: prefill.asset_tag,
        status: form.status,
        originalStatus,
      })

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
        setIsOther(false)
        setCustomCategoryName('')
      }
    } catch (err) {
      logDevError('assetForm.submit', err)
      setError(getUserFacingMessage(err, 'Unable to save asset right now.'))
    } finally {
      setLoading(false)
    }
  }

  return {
    form, setForm, isEditing, lockCategory, isOther, customCategoryName, setCustomCategoryName,
    customDefs, customValues, setCustomValues, extraPairs, addExtraPair, updateExtraPair,
    removeExtraPair, selectableCategories, inventoryStatusOptions, locationSuggestions,
    pickCategory, handleSubmit, loading, error,
  }
}
