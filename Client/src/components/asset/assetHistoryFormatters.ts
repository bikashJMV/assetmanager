import type { AssetFieldChangeEntry, AssetLifecycleEvent } from '../../api'
import { formatDisplay } from '../../utils/formatDisplay'

export type AssetHistoryActor = {
  primary: string
  secondary?: string
}

export type AssetHistoryDayGroup = {
  dayKey: string
  dayLabel: string
  events: AssetLifecycleEvent[]
}

function toDayKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatFullDayLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown Date'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function groupEventsByDay(events: AssetLifecycleEvent[]): AssetHistoryDayGroup[] {
  const map = new Map<string, AssetHistoryDayGroup>()
  for (const event of events) {
    const key = toDayKey(event.created_at)
    const existing = map.get(key)
    if (existing) {
      existing.events.push(event)
      continue
    }
    map.set(key, {
      dayKey: key,
      dayLabel: formatFullDayLabel(event.created_at),
      events: [event],
    })
  }
  return Array.from(map.values()).sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0))
}

export function formatHistoryActor(event: AssetLifecycleEvent): AssetHistoryActor {
  const dept = event.actor_department_name?.trim()
  if (event.actor_name || event.actor_employee_code) {
    const name = event.actor_name?.trim() || '—'
    const code = event.actor_employee_code?.trim()
    const parts = [code ? `${name} · ${code}` : name]
    if (dept) parts.push(dept)
    return { primary: parts.join(' · ') }
  }
  if (event.actor_id) {
    const ref = event.actor_id.length > 10 ? `${event.actor_id.slice(0, 8)}…` : event.actor_id
    return { primary: 'Unknown user', secondary: `Auth ref ${ref}` }
  }
  return { primary: 'System / public' }
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (v != null && typeof v !== 'object') return String(v)
  return null
}

export function getEventSummary(event: AssetLifecycleEvent): string {
  const p = event.payload || {}
  const tag = payloadString(p, 'asset_tag')
  switch (event.event_type) {
    case 'asset_created': {
      const cat = payloadString(p, 'category_slug')
      if (cat && tag) return `New asset ${tag} · category ${cat}`
      if (tag) return `New asset ${tag}`
      return 'Asset created'
    }
    case 'asset_updated':
      return tag ? `Updated asset ${tag}` : 'Asset details updated'
    case 'asset_deleted':
      return tag ? `Moved to recycle bin · ${tag}` : 'Asset deleted'
    case 'asset_restored':
      return tag ? `Restored from recycle bin · ${tag}` : 'Asset restored'
    case 'assigned': {
      const code = payloadString(p, 'employee_code')
      if (code && tag) return `Assigned to employee ${code} · asset ${tag}`
      if (code) return `Assigned to employee ${code}`
      return tag ? `Assigned · ${tag}` : 'Assigned to employee'
    }
    case 'unassigned':
      return tag ? `Returned / unassigned · ${tag}` : 'Returned / unassigned'
    case 'qr_scanned':
      return tag ? `QR code scanned · ${tag}` : 'QR code scanned (public)'
    default:
      return formatDisplay(event.event_type)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeFieldChanges(event: AssetLifecycleEvent): AssetFieldChangeEntry[] {
  if (event.event_type !== 'asset_updated') return []
  const rawChanges = event.payload?.changes
  if (!Array.isArray(rawChanges)) return []
  const normalized: Array<AssetFieldChangeEntry | null> = rawChanges.map((item) => {
      if (!isPlainObject(item)) return null
      const field = typeof item.field === 'string' ? item.field : ''
      if (!field) return null
      const base: AssetFieldChangeEntry = {
        field,
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : field,
        before: item.before,
        after: item.after,
      }
      if (item.truncated === true) {
        base.truncated = true
      }
      return base
    })
  return normalized.filter((item): item is AssetFieldChangeEntry => item !== null)
}

function formatStructuredValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '[]'
  if (isPlainObject(value)) {
    const code = typeof value.code === 'string' ? value.code.trim() : ''
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    const id = typeof value.id === 'string' ? value.id.trim() : ''
    if (code || name) return [name, code].filter(Boolean).join(' · ')
    if (id) return id
    return JSON.stringify(value)
  }
  return String(value)
}

export function formatChangeValue(value: unknown, truncated?: boolean): string {
  const base = formatStructuredValue(value)
  if (truncated && base !== '—') return `${base} (truncated)`
  return base
}
