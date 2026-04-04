import { useMemo, useState, type ReactNode } from 'react'
import type { AssetLifecycleEvent } from '../../api'
import InfoHint from '../common/InfoHint'
import AssetHistoryTable from './AssetHistoryTable'
import AssetHistoryTimeline from './AssetHistoryTimeline'

type HistoryViewMode = 'table' | 'timeline'

type Props = {
  events: AssetLifecycleEvent[]
  isCapped?: boolean
}

const VIEW_MODE_STORAGE_KEY = 'assetHistoryViewMode'

const LIFECYCLE_EVENT_HINTS: Array<{
  label: string
  accentClassName: string
  description: string
}> = [
  {
    label: 'Assigned',
    accentClassName: 'text-sky-600',
    description: 'The asset was assigned to an employee and the current holder changed.',
  },
  {
    label: 'Returned',
    accentClassName: 'text-sky-600',
    description: 'The active assignment was closed and the asset returned from that holder.',
  },
  {
    label: 'Updated',
    accentClassName: 'text-amber-600',
    description: 'Some asset details were changed, such as status, location, model, or other recorded fields.',
  },
  {
    label: 'Created',
    accentClassName: 'text-emerald-600',
    description: 'A new asset record was created in the system.',
  },
  {
    label: 'Restored',
    accentClassName: 'text-emerald-600',
    description: 'The asset was restored from the recycle bin and became active again.',
  },
  {
    label: 'Deleted',
    accentClassName: 'text-rose-600',
    description: 'The asset was moved to the recycle bin.',
  },
  {
    label: 'QR Scanned',
    accentClassName: 'text-accent',
    description: 'The asset QR code was scanned to open or view its details.',
  },
]

function getInitialViewMode(): HistoryViewMode {
  if (typeof window === 'undefined') return 'table'
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return stored === 'timeline' ? 'timeline' : 'table'
}

function ViewToggleButton({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-8 w-8 rounded-md border flex items-center justify-center transition ${
        pressed
          ? 'border-accent bg-accent text-white'
          : 'border-base bg-surface text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent'
      }`}
    >
      {children}
    </button>
  )
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </svg>
  )
}

function TimelineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 6h13M7 12h13M7 18h13" />
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
    </svg>
  )
}

export default function AssetChangeHistory({ events, isCapped = false }: Props) {
  const [mode, setMode] = useState<HistoryViewMode>(() => getInitialViewMode())

  const hasEvents = events.length > 0
  const headerText = useMemo(() => (mode === 'table' ? 'Table view' : 'Timeline view'), [mode])

  const setViewMode = (next: HistoryViewMode) => {
    setMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
    }
  }

  if (!hasEvents) {
    return (
      <div className="rounded-2xl border border-dashed border-base px-4 py-5 text-center text-sm text-subtle">
        No events yet, or none visible for your role.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-base bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <p className="text-xs text-subtle">{headerText}</p>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-base bg-app p-1">
            <ViewToggleButton pressed={mode === 'table'} label="Switch to table view" onClick={() => setViewMode('table')}>
              <TableIcon />
            </ViewToggleButton>
            <ViewToggleButton
              pressed={mode === 'timeline'}
              label="Switch to timeline view"
              onClick={() => setViewMode('timeline')}
            >
              <TimelineIcon />
            </ViewToggleButton>
          </div>
          <InfoHint
            panelTitle="Lifecycle event guide"
            ariaLabel="Open lifecycle event guide"
            className="shrink-0"
          >
            <div className="space-y-3">
              {LIFECYCLE_EVENT_HINTS.map((item) => (
                <div key={item.label} className="space-y-1">
                  <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${item.accentClassName}`}>
                    {item.label}
                  </p>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </InfoHint>
        </div>
      </div>

      {isCapped ? (
        <p className="border-t border-base px-4 py-2 text-xs text-subtle sm:px-5">
          Showing latest 100 changes. Older events are not loaded in this view yet.
        </p>
      ) : null}

      <div className="border-t border-base px-4 py-4 sm:px-5">
        {mode === 'table' ? <AssetHistoryTable events={events} /> : <AssetHistoryTimeline events={events} />}
      </div>
    </div>
  )
}
