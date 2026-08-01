import type { WarrantyNotification } from '../../api'

/** Human phrasing for a warranty notification's urgency, in place of a timestamp
 * (the API has no created_at — days_remaining is the natural equivalent of "time ago"). */
export function formatDaysRemaining(item: WarrantyNotification): string {
  const days = item.days_remaining
  if (item.severity === 'expired') {
    const overdue = Math.abs(days)
    return overdue <= 0 ? 'Expired today' : `Expired ${overdue} day${overdue === 1 ? '' : 's'} ago`
  }
  if (days <= 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}
