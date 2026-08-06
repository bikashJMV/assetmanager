import { AppIcon } from '../ui'

const CONTROL = 'h-9 rounded-lg border border-line bg-surface text-sm text-foreground outline-none transition focus:border-brand focus:shadow-focus'

export function LogsToolbar({
  level,
  onLevel,
  loading,
  onRefresh,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  onApplyCustom,
}: {
  level: string
  onLevel: (v: string) => void
  loading: boolean
  onRefresh: () => void
  customStart: string
  customEnd: string
  onCustomStart: (v: string) => void
  onCustomEnd: (v: string) => void
  onApplyCustom: () => void
}) {
  return (
    <div className="border-b border-line bg-surface px-2 py-2.5">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        {/* Left: heading */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
            <AppIcon name="logs" size={18} />
          </span>
          <h1 className="whitespace-nowrap text-base font-semibold tracking-tight text-foreground sm:text-lg">Live Telemetry Logs</h1>
        </div>

        {/* Right: controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 2xl:justify-end">
          {/* Level dropdown */}
          <div className={`${CONTROL} relative inline-flex items-center pl-9`}>
            <span className="pointer-events-none absolute left-2.5 text-foreground-muted"><AppIcon name="filter" size={14} /></span>
            <select
              value={level}
              onChange={(e) => onLevel(e.target.value)}
              className="h-full min-w-[7rem] cursor-pointer appearance-none bg-transparent pr-6 text-sm text-foreground outline-none"
              aria-label="Filter by level"
            >
              <option value="">All levels</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
            <span className="pointer-events-none absolute right-2 text-foreground-faint">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
            </span>
          </div>

          {/* Custom date range — date only */}
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="From date (UTC)" title="From date (UTC)" value={customStart} onChange={(e) => onCustomStart(e.target.value)} className={`${CONTROL} px-2 text-xs`} />
            <span className="text-xs text-foreground-faint">→</span>
            <input type="date" aria-label="To date (UTC)" title="To date (UTC)" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} className={`${CONTROL} px-2 text-xs`} />
            <button
              type="button"
              onClick={onApplyCustom}
              className="h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-foreground transition hover:bg-brand-hover"
            >
              Apply
            </button>
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh logs"
            title="Refresh"
            className={`${CONTROL} inline-flex items-center justify-center gap-2 px-3 font-medium hover:bg-surface-hover disabled:opacity-50`}
          >
            <span className={loading ? 'animate-spin' : ''}><AppIcon name="refresh" size={14} /></span>
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
