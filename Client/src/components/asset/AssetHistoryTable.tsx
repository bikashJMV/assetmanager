import { Fragment } from 'react'
import type { AssetLifecycleEvent } from '../../api'
import { formatDateTime, formatEnumLabel } from '../../utils/formatDisplay'
import {
  formatChangeValue,
  formatHistoryActor,
  getEventSummary,
  groupEventsByDay,
  normalizeFieldChanges,
} from './assetHistoryFormatters'

type Props = {
  events: AssetLifecycleEvent[]
}

function EventIcon({ eventType }: { eventType: string }) {
  const normalized = eventType.trim().toLowerCase()

  if (normalized === 'asset_created') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    )
  }

  if (normalized === 'asset_updated') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m4 20 4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z" />
        <path d="m13.5 7.5 3 3" />
      </svg>
    )
  }

  if (normalized === 'asset_deleted') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9 7V5h6v2" />
        <path d="M7 7l1 12h8l1-12" />
      </svg>
    )
  }

  if (normalized === 'asset_restored') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 7H5v4" />
        <path d="M5 11a7 7 0 1 0 2-4" />
      </svg>
    )
  }

  if (normalized === 'asset_assigned') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3.5" />
        <path d="M17 8h4" />
        <path d="M19 6v4" />
      </svg>
    )
  }

  if (normalized === 'asset_returned') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3.5" />
        <path d="M21 12h-6" />
      </svg>
    )
  }

  if (normalized === 'qr_scanned') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7V4h3" />
        <path d="M20 7V4h-3" />
        <path d="M4 17v3h3" />
        <path d="M20 17v3h-3" />
        <path d="M8 12h8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function getEventLabel(eventType: string): string {
  const normalized = eventType.trim().toLowerCase()
  if (normalized === 'asset_created') return 'Created'
  if (normalized === 'asset_updated') return 'Updated'
  if (normalized === 'asset_deleted') return 'Deleted'
  if (normalized === 'asset_restored') return 'Restored'
  if (normalized === 'asset_assigned') return 'Assigned'
  if (normalized === 'asset_returned') return 'Returned'
  if (normalized === 'qr_scanned') return 'QR Scanned'
  return formatEnumLabel(eventType)
}

function getEventAccentClass(eventType: string): string {
  const normalized = eventType.trim().toLowerCase()
  if (normalized === 'asset_created' || normalized === 'asset_restored') return 'text-emerald-600'
  if (normalized === 'asset_updated') return 'text-amber-600'
  if (normalized === 'asset_assigned' || normalized === 'asset_returned') return 'text-sky-600'
  if (normalized === 'asset_deleted') return 'text-rose-600'
  return 'text-accent'
}

export default function AssetHistoryTable({ events }: Props) {
  const dayGroups = groupEventsByDay(events)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-surface-2 text-muted uppercase text-xs">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Action</th>
            <th className="px-3 py-2 text-left">By</th>
            <th className="px-3 py-2 text-left">Field</th>
            <th className="px-3 py-2 text-left">Before</th>
            <th className="px-3 py-2 text-left">After</th>
            <th className="px-3 py-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {dayGroups.map((dayGroup) => (
            <Fragment key={dayGroup.dayKey}>
              <tr className="border-t border-base bg-surface-2/70">
                <td colSpan={7} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{dayGroup.dayLabel}</span>
                    <span className="inline-flex items-center rounded-full border border-base bg-surface px-2 py-0.5 text-[11px] font-medium text-subtle">
                      {dayGroup.events.length} change{dayGroup.events.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </td>
              </tr>
              {dayGroup.events.map((event) => {
            const actor = formatHistoryActor(event)
            const changes = normalizeFieldChanges(event)
            const actionLabel = getEventLabel(event.event_type)
            const actionAccentClassName = getEventAccentClass(event.event_type)
            if (changes.length === 0) {
              return (
                <tr key={event.id} className="border-t border-base">
                  <td className="px-3 py-2 text-primary whitespace-nowrap">{formatDateTime(event.created_at)}</td>
                  <td className="px-3 py-2 text-primary font-medium">
                    <span className={`inline-flex items-center gap-1.5 ${actionAccentClassName}`}>
                      <EventIcon eventType={event.event_type} />
                      {actionLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-primary">
                    <span className="block">{actor.primary}</span>
                    {actor.secondary ? <span className="block text-[11px] text-subtle mt-0.5">{actor.secondary}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-subtle">—</td>
                  <td className="px-3 py-2 text-subtle">—</td>
                  <td className="px-3 py-2 text-subtle">—</td>
                  <td className="px-3 py-2 text-muted">{getEventSummary(event)}</td>
                </tr>
              )
            }

            return changes.map((change, idx) => (
              <tr key={`${event.id}:${change.field}:${idx}`} className="border-t border-base">
                <td className="px-3 py-2 text-primary whitespace-nowrap">{idx === 0 ? formatDateTime(event.created_at) : ''}</td>
                <td className="px-3 py-2 text-primary font-medium">
                  {idx === 0 ? (
                    <span className={`inline-flex items-center gap-1.5 ${actionAccentClassName}`}>
                      <EventIcon eventType={event.event_type} />
                      {actionLabel}
                    </span>
                  ) : ''}
                </td>
                <td className="px-3 py-2 text-primary">
                  {idx === 0 ? (
                    <>
                      <span className="block">{actor.primary}</span>
                      {actor.secondary ? <span className="block text-[11px] text-subtle mt-0.5">{actor.secondary}</span> : null}
                    </>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-primary">{change.label}</td>
                <td className="px-3 py-2 text-muted">{formatChangeValue(change.before, change.truncated)}</td>
                <td className="px-3 py-2 text-muted">{formatChangeValue(change.after, change.truncated)} </td>
                <td className="px-3 py-2 text-subtle">{idx === 0 ? getEventSummary(event) : ''}</td>
              </tr>
            ))
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
