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
export function roleBadgeClass(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'it_ops') return 'bg-orange-500 text-white'
  if (normalized === 'admin') return 'bg-blue-600 text-white'
  return 'bg-gray-500 text-white'
}

/**
 * Formats ISO-8601 / Postgres timestamptz strings for the UI (user's locale, medium date + short time).
 */
function parseToDate(raw: string): Date | null {
  let d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d
  // Postgres often returns "YYYY-MM-DD HH:mm:ss…" without "T"; some engines parse that inconsistently.
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

export function getInventoryStatusTone(status: string): { dot: string; border: string; bg: string; text: string } {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'assigned') {
    return { dot: 'bg-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-primary' }
  }
  if (normalized === 'in_stock') {
    return { dot: 'bg-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', text: 'text-primary' }
  }
  if (normalized === 'in_repair') {
    return { dot: 'bg-teal-500', border: 'border-teal-500/40', bg: 'bg-teal-500/10', text: 'text-primary' }
  }
  if (normalized === 'retired') {
    return { dot: 'bg-gray-700', border: 'border-gray-600/50', bg: 'bg-gray-600/15', text: 'text-primary' }
  }
  if (normalized === 'lost') {
    return { dot: 'bg-red-500', border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-primary' }
  }
  if (normalized === 'disposed') {
    return { dot: 'bg-gray-300', border: 'border-gray-400/50', bg: 'bg-gray-300/20', text: 'text-primary' }
  }
  return { dot: 'bg-gray-400', border: 'border-base', bg: 'bg-surface', text: 'text-muted' }
}

