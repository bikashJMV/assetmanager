import type { CustomFieldDefinition } from '../../api'

/** Cast a raw text input to the declared custom-field type; null when blank. */
export function coerceValue(value: string, dataType: CustomFieldDefinition['data_type']) {
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

export function dynamicFieldPlaceholder(field: CustomFieldDefinition): string {
  switch (field.data_type) {
    case 'number': return 'e.g. 8'
    case 'date': return 'YYYY-MM-DD'
    case 'json': return 'e.g. {"key": "value"}'
    default: return `Enter ${field.label}`
  }
}
