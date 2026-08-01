import {
  createAsset,
  setAssetLifecycleStatus,
  updateAsset,
  type AssetWriteInput,
  type CustomFieldDefinition,
} from '../../api'
import { getUserFacingMessage } from '../../utils/errors'
import { coerceValue } from './assetForm.values'
import type { ExtraPair, FormState } from './useAssetForm'

type ValidateArgs = {
  form: FormState
  isOther: boolean
  effectiveSlug: string
  otherName: string
  customDefs: CustomFieldDefinition[]
  extraPairs: ExtraPair[]
}

/** Returns a user-facing message, or '' when the form is valid. */
export function validateAssetForm({
  form,
  isOther,
  effectiveSlug,
  otherName,
  customDefs,
  extraPairs,
}: ValidateArgs): string {
  if (isOther) {
    if (!otherName) return 'Category name is required.'
    if (!effectiveSlug) return 'Category name must include at least one letter or number.'
  } else if (!form.category_slug.trim()) {
    return 'Category is required.'
  }
  if (!form.serial_number.trim()) return 'Serial number is required.'

  const templateKeySet = new Set(customDefs.map((d) => d.field_key))
  const seen = new Set<string>()
  for (const p of extraPairs) {
    const k = p.key.trim()
    const v = p.value.trim()
    if (!k && !v) continue
    if (!k) return 'Each custom field needs a name. Remove empty rows or fill in the name.'
    if (templateKeySet.has(k)) {
      return `"${k}" is already a template field. Use a different name for the custom field.`
    }
    if (seen.has(k)) return `Duplicate name "${k}" in custom fields. Each name must be unique.`
    seen.add(k)
  }
  return ''
}

export function buildCustomFields(
  customDefs: CustomFieldDefinition[],
  customValues: Record<string, string>,
  extraPairs: ExtraPair[],
): Record<string, unknown> {
  const typeByKey = new Map(customDefs.map((d) => [d.field_key, d.data_type] as const))
  const templateFields = Object.fromEntries(
    Object.entries(customValues)
      .map(([key, raw]) => [key, coerceValue(raw, typeByKey.get(key) || 'text')] as const)
      .filter(([, v]) => v !== null && v !== ''),
  )
  const extraFields = Object.fromEntries(
    extraPairs.filter((p) => p.key.trim() && p.value.trim()).map((p) => [p.key.trim(), p.value.trim()]),
  )
  return { ...templateFields, ...extraFields }
}

/**
 * Create or update the asset. On edit, a changed inventory status is applied through the
 * lifecycle endpoint so the change is recorded in asset history.
 */
export async function saveAsset({
  payload,
  isEditing,
  existingTag,
  status,
  originalStatus,
}: {
  payload: AssetWriteInput
  isEditing: boolean
  existingTag?: string
  status: string
  originalStatus: string
}): Promise<unknown> {
  if (!isEditing || !existingTag) return createAsset(payload)

  const result = await updateAsset(existingTag, {
    asset_tag: payload.asset_tag,
    category_slug: payload.category_slug,
    category_name: payload.category_name,
    manufacturer_name: payload.manufacturer_name,
    model: payload.model,
    serial_number: payload.serial_number,
    location_name: payload.location_name,
    purchase_date: payload.purchase_date,
    warranty_expiry: payload.warranty_expiry,
    custom_fields: payload.custom_fields,
    metadata: payload.metadata,
  })

  if (status === originalStatus) return result

  try {
    await setAssetLifecycleStatus(existingTag, status, undefined, 'asset_edit')
  } catch (statusErr) {
    throw new Error(
      `Asset details were saved, but inventory status was not updated. ${getUserFacingMessage(
        statusErr,
        'Please retry the inventory status change.',
      )}`,
    )
  }
  return result
}
