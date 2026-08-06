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
 * Inline style (background + text color) for a role badge pill, driven by the
 * --role-* design tokens (styles/tokens.css) so it renders correctly in both themes —
 * replaces the old hardcoded bg-orange-500/bg-blue-600/bg-gray-500 (dark-mode unsafe,
 * inconsistent with the rest of the token system).
 */
export function roleBadgeStyle(role: string): { backgroundColor: string; color: string } {
  const normalized = role.trim().toLowerCase()
  const varName =
    normalized === 'it_ops' ? '--role-it-ops' : normalized === 'admin' ? '--role-admin' : '--role-employee'
  return { backgroundColor: `hsl(var(${varName}))`, color: 'hsl(var(--primary-foreground))' }
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

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const datePart = `${year}-${month}-${day}`

  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return `${datePart}, ${timePart}`
}

export type InventoryStatusTone = {
  /** hsl() color string for the status dot / icon */
  dotColor: string
  /** CSS border-color value (soft-tinted) */
  borderColor: string
  /** CSS background-color value (soft-tinted, legible on both themes) */
  bgColor: string
  /** Tailwind text class — already theme-safe via the token bridge */
  text: string
}

/**
 * Token-driven style for an active/inactive badge (employee/holder status), replacing
 * hardcoded emerald/red palette classes (dark-mode unsafe). Success = active, danger = inactive.
 * Shared by Employee list, EmployeeDetail, and the assets holder-active column.
 */
export function activeBadgeStyle(isActive: boolean): { color: string; backgroundColor: string; borderColor: string } {
  const v = isActive ? '--success' : '--danger'
  return { color: `hsl(var(${v}))`, backgroundColor: `hsl(var(${v}) / 0.12)`, borderColor: `hsl(var(${v}) / 0.4)` }
}

/** Dot color (CSS value) for the active/inactive indicator. */
export function activeDotColor(isActive: boolean): string {
  return `hsl(var(${isActive ? '--success' : '--danger'}))`
}

/**
 * Status tone for the asset lifecycle badge/dot, driven by the --status-* design tokens
 * (styles/tokens.css) — replaces hardcoded bg-emerald-500/bg-yellow-400/etc (dark-mode unsafe:
 * those fixed-lightness Tailwind colors don't adapt, so some were unreadable in dark mode and
 * others washed out in light mode). Single source of truth for AllAssets, InventoryStatusBadge,
 * and the filter dropdown — fixing this fixes the color everywhere it's used.
 */
export function getInventoryStatusTone(status: string): InventoryStatusTone {
  const normalized = status.trim().toLowerCase()
  const known = ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed']
  if (!known.includes(normalized)) {
    return { dotColor: 'hsl(var(--faint-foreground))', borderColor: 'hsl(var(--border-t))', bgColor: 'hsl(var(--surface-t))', text: 'text-muted' }
  }
  const varName = `--status-${normalized.replace(/_/g, '-')}`
  return {
    dotColor: `hsl(var(${varName}))`,
    borderColor: `hsl(var(${varName}) / 0.4)`,
    bgColor: `hsl(var(${varName}) / 0.12)`,
    text: 'text-primary',
  }
}

