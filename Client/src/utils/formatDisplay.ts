export function formatDisplay(value: unknown): string {
  if (value === null || value === undefined) return '-'

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : '-'
  }

  return String(value)
}

/**
 * Converts enum-like values (`in_stock`, `it_ops`, `in-repair`) into
 * readable labels for end users (`In Stock`, `It Ops`, `In Repair`).
 */
export function formatEnumLabel(value: unknown): string {
  const raw = formatDisplay(value)
  if (raw === '-') return raw
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

/**
 * Human-readable label for an employee role value.
 */
export function formatRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'it_ops') return 'IT Ops'
  if (normalized === 'admin') return 'Admin'
  return 'Employee'
}

/**
 * Tailwind classes for a role badge pill.
 */
export function roleBadgeClass(_role: string): string {
  return 'bg-orange-500 text-white'
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
