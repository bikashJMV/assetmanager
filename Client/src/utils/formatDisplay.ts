export function formatDisplay(value: unknown): string {
  if (value === null || value === undefined) return '-'

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : '-'
  }

  return String(value)
}

/**
 * Formats ISO-8601 / Postgres timestamptz strings for the UI (user's locale, medium date + short time).
 */
export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined) return '-'
  const raw = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!raw) return '-'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
