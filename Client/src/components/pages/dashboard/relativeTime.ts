const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Short, plain relative time. Falls back to a date once past a week. */
export function relativeTime(iso: string, now: number): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''

  const delta = now - time
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (delta < 7 * DAY) {
    const days = Math.floor(delta / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  return new Date(time).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Two-letter initials for the timeline avatar. */
export function initials(name: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
