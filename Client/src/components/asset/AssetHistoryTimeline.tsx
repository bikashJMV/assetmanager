import type { AssetLifecycleEvent } from '../../api'
import { formatDateTime, formatDisplay } from '../../utils/formatDisplay'
import { formatChangeValue, formatHistoryActor, getEventSummary, groupEventsByDay, normalizeFieldChanges } from './assetHistoryFormatters'

type Props = {
  events: AssetLifecycleEvent[]
}

export default function AssetHistoryTimeline({ events }: Props) {
  const dayGroups = groupEventsByDay(events)

  return (
    <div className="space-y-3">
      {dayGroups.map((group) => (
        <section key={group.dayKey} className="space-y-2.5">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-subtle px-1">{group.dayLabel}</h3>
          {group.events.map((event) => {
            const actor = formatHistoryActor(event)
            const changes = normalizeFieldChanges(event)
            return (
              <article key={event.id} className="rounded-xl border border-base bg-surface p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-primary">{formatDisplay(event.event_type)}</p>
                      <p className="text-xs text-subtle">{formatDateTime(event.created_at)}</p>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{actor.primary}</p>
                    {actor.secondary ? <p className="text-[11px] text-subtle">{actor.secondary}</p> : null}
                    <p className="text-sm text-muted mt-2">{getEventSummary(event)}</p>
                  </div>
                </div>

                {changes.length > 0 ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-base">
                    <table className="w-full min-w-[580px] text-xs sm:text-sm">
                      <thead className="bg-surface-2 text-muted uppercase text-[11px]">
                        <tr>
                          <th className="px-2.5 py-2 text-left">Field</th>
                          <th className="px-2.5 py-2 text-left">Before</th>
                          <th className="px-2.5 py-2 text-left">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((change, idx) => (
                          <tr key={`${event.id}:${change.field}:${idx}`} className="border-t border-base">
                            <td className="px-2.5 py-2 text-primary">{change.label}</td>
                            <td className="px-2.5 py-2 text-muted">{formatChangeValue(change.before, change.truncated)}</td>
                            <td className="px-2.5 py-2 text-muted">{formatChangeValue(change.after, change.truncated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}
