import type { AssetLifecycleEvent } from '../../api'
import { formatDateTime, formatDisplay } from '../../utils/formatDisplay'
import { formatChangeValue, formatHistoryActor, getEventSummary, normalizeFieldChanges } from './assetHistoryFormatters'

type Props = {
  events: AssetLifecycleEvent[]
}

export default function AssetHistoryTable({ events }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-surface-2 text-muted uppercase text-xs">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Who</th>
            <th className="px-3 py-2 text-left">Field</th>
            <th className="px-3 py-2 text-left">Before</th>
            <th className="px-3 py-2 text-left">After</th>
            <th className="px-3 py-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const actor = formatHistoryActor(event)
            const changes = normalizeFieldChanges(event)
            if (changes.length === 0) {
              return (
                <tr key={event.id} className="border-t border-base">
                  <td className="px-3 py-2 text-primary whitespace-nowrap">{formatDateTime(event.created_at)}</td>
                  <td className="px-3 py-2 text-primary font-medium">{formatDisplay(event.event_type)}</td>
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
                <td className="px-3 py-2 text-primary font-medium">{idx === 0 ? formatDisplay(event.event_type) : ''}</td>
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
                <td className="px-3 py-2 text-muted">{formatChangeValue(change.after, change.truncated)}</td>
                <td className="px-3 py-2 text-subtle">{idx === 0 ? getEventSummary(event) : ''}</td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}
