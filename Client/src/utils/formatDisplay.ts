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
function parseToDate(raw: string): Date | null {
  let d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d
  // Postgres / Supabase often returns "YYYY-MM-DD HH:mm:ss…" without "T"; some engines parse that inconsistently.
  if (/^\d{4}-\d{2}-\d{2} \d/.test(raw)) {
    d = new Date(raw.replace(' ', 'T'))
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined) return '-'
  const raw = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!raw) return '-'
  const d = parseToDate(raw)
  if (!d) return raw
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
