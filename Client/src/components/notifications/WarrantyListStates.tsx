import { AppIcon, Skeleton } from '../ui'
import { WARRANTY_SEVERITY } from './warrantySeverity'

/** Loading skeleton that mirrors the real row geometry (badge + title, message, metadata). */
export function WarrantyListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <li
          key={index}
          className="grid gap-2 rounded-md border border-line bg-surface py-2.5 pl-4 pr-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:py-2 sm:pl-5"
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-full sm:w-28" />
        </li>
      ))}
    </ul>
  )
}

/** Empty state — distinguishes "nothing to worry about" from "filters hid everything". */
export function WarrantyEmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  const tone = WARRANTY_SEVERITY.healthy.varName
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ color: `hsl(var(${tone}))`, backgroundColor: `hsl(var(${tone}) / 0.12)` }}
        aria-hidden
      >
        <AppIcon name={filtered ? 'filter' : 'success'} size={20} />
      </span>
      <p className="text-[length:var(--text-md)] font-semibold text-foreground">
        {filtered ? 'No notifications in this date range' : 'All warranties are healthy'}
      </p>
      <p className="max-w-md text-[length:var(--text-sm)] text-foreground-muted">
        {filtered
          ? 'Widen the From/To range or reset the filters to see the full alert list.'
          : 'No managed asset has a warranty that is expired or expiring in the current window.'}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 inline-flex min-h-[var(--touch-target)] items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[length:var(--text-sm)] font-semibold text-foreground-muted transition-[background-color,color] duration-fast ease-out hover:bg-surface-hover hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none sm:min-h-0 sm:h-8"
        >
          <AppIcon name="filter" size={14} />
          Reset Filters
        </button>
      ) : null}
    </div>
  )
}
