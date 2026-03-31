import { useMemo, useState, type ReactNode } from 'react'
import type { AssetLifecycleEvent } from '../../api'
import AssetHistoryTable from './AssetHistoryTable'
import AssetHistoryTimeline from './AssetHistoryTimeline'

type HistoryViewMode = 'table' | 'timeline'

type Props = {
  events: AssetLifecycleEvent[]
  isCapped?: boolean
}

const VIEW_MODE_STORAGE_KEY = 'assetHistoryViewMode'

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
        pressed ? 'bg-accent text-white border-accent' : 'bg-surface-2 text-muted border-base hover:text-primary'
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
      <p className="text-sm text-subtle py-4 text-center border border-dashed border-base rounded-lg">
        No events yet, or none visible for your role.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-subtle">{headerText}</p>
        <div className="inline-flex items-center gap-1 rounded-lg border border-base bg-surface-2 p-1">
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
      </div>

      {isCapped ? (
        <p className="text-xs rounded-lg border border-base bg-surface-2 px-3 py-2 text-subtle">
          Showing latest 100 changes. Older events are not loaded in this view yet.
        </p>
      ) : null}

      {mode === 'table' ? <AssetHistoryTable events={events} /> : <AssetHistoryTimeline events={events} />}
    </div>
  )
}
