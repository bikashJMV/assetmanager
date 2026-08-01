import { useEffect, useMemo, useState } from 'react'
import type { AssetLifecycleEvent } from '../../api'
import { formatDateTime, formatEnumLabel } from '../../utils/formatDisplay'
import {
  formatChangeValue,
  formatHistoryActor,
  getEventSummary,
  groupEventsByDay,
  normalizeFieldChanges,
  type AssetHistoryDayGroup,
} from './assetHistoryFormatters'

type Props = {
  events: AssetLifecycleEvent[]
}

type MonthGroup = {
  key: string
  label: string
  days: AssetHistoryDayGroup[]
}

type YearGroup = {
  year: string
  months: MonthGroup[]
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

  if (normalized === 'assigned') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3.5" />
        <path d="M17 8h4" />
        <path d="M19 6v4" />
      </svg>
    )
  }

  if (normalized === 'unassigned') {
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
  if (normalized === 'assigned') return 'Assigned'
  if (normalized === 'unassigned') return 'Returned'
  if (normalized === 'qr_scanned') return 'QR Scanned'
  return formatEnumLabel(eventType)
}

/** Token-driven accent color for a lifecycle event dot/label — replaces hardcoded
 * emerald/amber/sky/rose classes (dark-mode unsafe); mirrors AssetChangeHistory's legend. */
function getEventAccentColor(eventType: string): string {
  const normalized = eventType.trim().toLowerCase()
  if (normalized === 'asset_created' || normalized === 'asset_restored') return 'hsl(var(--success))'
  if (normalized === 'asset_updated') return 'hsl(var(--warning))'
  if (normalized === 'assigned' || normalized === 'unassigned') return 'hsl(var(--info))'
  if (normalized === 'asset_deleted') return 'hsl(var(--danger))'
  return 'var(--accent)' // legacy bridge var already resolves to a full hsl(...) value
}

function buildYearGroups(events: AssetLifecycleEvent[]): YearGroup[] {
  const yearMap = new Map<string, Map<string, MonthGroup>>()

  for (const dayGroup of groupEventsByDay(events)) {
    const dateSource = dayGroup.events[0]?.created_at ?? dayGroup.dayKey
    const date = new Date(dateSource)
    const year = Number.isNaN(date.getTime()) ? 'Unknown' : String(date.getFullYear())
    const monthIndex = Number.isNaN(date.getTime()) ? -1 : date.getMonth()
    const monthKey = monthIndex >= 0 ? `${year}-${String(monthIndex + 1).padStart(2, '0')}` : `${year}-unknown`
    const monthLabel = monthIndex >= 0
      ? new Intl.DateTimeFormat(undefined, { month: 'long' }).format(date)
      : 'Unknown Month'

    if (!yearMap.has(year)) {
      yearMap.set(year, new Map<string, MonthGroup>())
    }

    const monthMap = yearMap.get(year)!
    const existingMonth = monthMap.get(monthKey)
    if (existingMonth) {
      existingMonth.days.push(dayGroup)
      continue
    }

    monthMap.set(monthKey, {
      key: monthKey,
      label: monthLabel,
      days: [dayGroup],
    })
  }

  return Array.from(yearMap.entries())
    .sort(([yearA], [yearB]) => (yearA < yearB ? 1 : yearA > yearB ? -1 : 0))
    .map(([year, monthMap]) => ({
      year,
      months: Array.from(monthMap.values()).sort((monthA, monthB) =>
        monthA.key < monthB.key ? 1 : monthA.key > monthB.key ? -1 : 0
      ),
    }))
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function MonthIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

export default function AssetHistoryTimeline({ events }: Props) {
  const yearGroups = useMemo(() => buildYearGroups(events), [events])
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({})
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({})
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (yearGroups.length === 0) return

    setOpenYears((current) => {
      const next = { ...current }
      for (const [index, group] of yearGroups.entries()) {
        if (!(group.year in next)) {
          next[group.year] = index === 0
        }
      }
      return next
    })

    setOpenMonths((current) => {
      const next = { ...current }
      for (const [yearIndex, group] of yearGroups.entries()) {
        for (const [monthIndex, month] of group.months.entries()) {
          if (!(month.key in next)) {
            next[month.key] = yearIndex === 0 && monthIndex === 0
          }
        }
      }
      return next
    })

    setOpenDays((current) => {
      const next = { ...current }
      for (const [yearIndex, group] of yearGroups.entries()) {
        for (const [monthIndex, month] of group.months.entries()) {
          for (const [dayIndex, day] of month.days.entries()) {
            if (!(day.dayKey in next)) {
              next[day.dayKey] = yearIndex === 0 && monthIndex === 0 && dayIndex === 0
            }
          }
        }
      }
      return next
    })
  }, [yearGroups])

  return (
    <div>
      {yearGroups.map((yearGroup, yearIndex) => {
        const defaultYearOpen = yearIndex === 0
        const yearOpen = openYears[yearGroup.year] ?? defaultYearOpen
        const yearEventCount = yearGroup.months.reduce(
          (sum, month) => sum + month.days.reduce((daySum, day) => daySum + day.events.length, 0),
          0,
        )

        return (
          <section key={yearGroup.year}>
            <button
              type="button"
              onClick={() =>
                setOpenYears((current) => ({
                  ...current,
                  [yearGroup.year]: !(current[yearGroup.year] ?? defaultYearOpen),
                }))
              }
              className={`flex w-full items-center justify-between gap-3 px-1 py-3 text-left ${yearIndex > 0 ? 'border-t border-base' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex min-w-[3.75rem] items-center justify-center rounded-full bg-accent px-3 py-1 text-xs font-semibold text-on-accent">
                  {yearGroup.year}
                </span>
                <span className="inline-flex items-center rounded-full border border-base bg-app px-2.5 py-1 text-[11px] font-medium text-muted">
                  {yearEventCount} event{yearEventCount === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-muted">
                <Chevron open={yearOpen} />
              </span>
            </button>

            {yearOpen ? (
              <div className="pl-3 sm:pl-4">
                {yearGroup.months.map((monthGroup, monthIndex) => {
                  const defaultMonthOpen = yearIndex === 0 && monthIndex === 0
                  const monthOpen = openMonths[monthGroup.key] ?? defaultMonthOpen
                  const monthEventCount = monthGroup.days.reduce((sum, day) => sum + day.events.length, 0)

                  return (
                    <div key={monthGroup.key} className={`${monthIndex > 0 ? 'border-t border-base/70' : ''}`}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMonths((current) => ({
                            ...current,
                            [monthGroup.key]: !(current[monthGroup.key] ?? defaultMonthOpen),
                          }))
                        }
                        className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                            <span className="text-accent">
                              <MonthIcon />
                            </span>
                            {monthGroup.label}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-base bg-app px-2 py-0.5 text-[11px] font-medium text-subtle">
                            {monthEventCount} event{monthEventCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <span className="text-muted">
                          <Chevron open={monthOpen} />
                        </span>
                      </button>

                      {monthOpen ? (
                        <div className="space-y-3 pb-2 pl-4 sm:pl-5">
                          {monthGroup.days.map((dayGroup, dayIndex) => {
                            const defaultDayOpen = yearIndex === 0 && monthIndex === 0 && dayIndex === 0
                            const dayOpen = openDays[dayGroup.dayKey] ?? defaultDayOpen

                            return (
                              <section
                                key={dayGroup.dayKey}
                                className="overflow-hidden rounded-xl border border-base bg-app"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenDays((current) => ({
                                      ...current,
                                      [dayGroup.dayKey]: !(current[dayGroup.dayKey] ?? defaultDayOpen),
                                    }))
                                  }
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-primary">{dayGroup.dayLabel}</span>
                                    <span className="inline-flex items-center rounded-full border border-base bg-surface px-2 py-0.5 text-[11px] font-medium text-subtle">
                                      {dayGroup.events.length} change{dayGroup.events.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  <span className="text-muted">
                                    <Chevron open={dayOpen} />
                                  </span>
                                </button>

                                {dayOpen ? (
                                  <div className="relative border-t border-base px-4 py-2 pl-9">
                                    <div
                                      className="absolute bottom-4 left-5 top-4 w-px bg-[color:var(--border)]"
                                      aria-hidden="true"
                                    />
                                    {dayGroup.events.map((event, eventIndex) => {
                                      const actor = formatHistoryActor(event)
                                      const changes = normalizeFieldChanges(event)
                                      const eventLabel = getEventLabel(event.event_type)
                                      const accentColor = getEventAccentColor(event.event_type)

                                      return (
                                        <article
                                          key={event.id}
                                          className={`relative py-3 ${eventIndex > 0 ? 'border-t border-base/70' : ''}`}
                                        >
                                          <span
                                            className="absolute left-[-1.18rem] top-[1.35rem] h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: accentColor }}
                                            aria-hidden="true"
                                          />

                                          <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: accentColor }}>
                                                <EventIcon eventType={event.event_type} />
                                                {eventLabel}
                                              </span>
                                              <span className="text-xs text-subtle">{formatDateTime(event.created_at)}</span>
                                            </div>

                                            <p className="text-sm font-medium leading-6 text-primary">
                                              {getEventSummary(event)}
                                              <span className="ml-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
                                                By:
                                              </span>{' '}
                                              <span className="text-sm font-normal text-muted">{actor.primary}</span>
                                            </p>

                                            {actor.secondary ? <p className="text-[11px] text-subtle">{actor.secondary}</p> : null}

                                            {changes.length > 0 ? (
                                              <div className="pt-1 text-xs leading-6 text-muted">
                                                {changes.map((change, changeIndex) => (
                                                  <p key={`${event.id}:${change.field}:${changeIndex}`}>
                                                    <span className="font-semibold text-primary">{change.label}:</span>{' '}
                                                    {formatChangeValue(change.before, change.truncated)}{' '}
                                                    <span className="inline-flex translate-y-[1px] text-accent" aria-hidden="true">
                                                      <svg
                                                        viewBox="0 0 24 24"
                                                        className="h-4 w-5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2.4"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                      >
                                                        <path d="M3 12h15" />
                                                        <path d="m14 7 5 5-5 5" />
                                                      </svg>
                                                    </span>{' '}
                                                    {formatChangeValue(change.after, change.truncated)}
                                                  </p>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        </article>
                                      )
                                    })}
                                  </div>
                                ) : null}
                              </section>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
