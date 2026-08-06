import type { WarrantyNotification } from '../../api'
import type { AppIconName } from '../ui'

/** Presentation vocabulary for warranty alerts. The API only emits
 * `expired | due_soon`; `due_today` and `healthy` are display-only refinements
 * derived from `days_remaining` (no business logic lives here). */
export type WarrantySeverityKey = 'expired' | 'due_today' | 'expiring_soon' | 'healthy'

type SeverityMeta = {
  label: string
  icon: AppIconName
  /** token name in styles/tokens.css — theme-aware in light + dark */
  varName: string
}

export const WARRANTY_SEVERITY: Record<WarrantySeverityKey, SeverityMeta> = {
  expired: { label: 'Expired', icon: 'error', varName: '--danger' },
  due_today: { label: 'Due Today', icon: 'warning', varName: '--warning' },
  expiring_soon: { label: 'Expiring Soon', icon: 'warning', varName: '--warning' },
  healthy: { label: 'Healthy', icon: 'success', varName: '--success' },
}

export function resolveWarrantySeverity(item: WarrantyNotification): WarrantySeverityKey {
  if (item.severity === 'expired') return 'expired'
  return item.days_remaining <= 0 ? 'due_today' : 'expiring_soon'
}

export function formatWarrantyDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** One concise sentence — the most readable line of a notification row. */
export function formatWarrantyHeadline(item: WarrantyNotification): string {
  const days = item.days_remaining
  if (item.severity === 'expired') {
    const overdue = Math.abs(days)
    if (overdue <= 0) return 'Warranty expired today.'
    return `Warranty expired on ${formatWarrantyDate(item.warranty_expiry)}.`
  }
  if (days <= 0) return 'Warranty expires today.'
  if (days === 1) return 'Warranty expires tomorrow.'
  return `Warranty expires in ${days} days.`
}

/** Overdue / remaining metadata, phrased for the inline metadata line. */
export function formatWarrantyAge(item: WarrantyNotification): { label: string; value: string } {
  const days = item.days_remaining
  if (item.severity === 'expired') {
    const overdue = Math.abs(days)
    return { label: 'Overdue', value: `${overdue} day${overdue === 1 ? '' : 's'}` }
  }
  const remaining = Math.max(days, 0)
  return { label: 'Remaining', value: `${remaining} day${remaining === 1 ? '' : 's'}` }
}
