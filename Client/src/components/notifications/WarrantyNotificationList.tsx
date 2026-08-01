import type { WarrantyNotification } from '../../api'
import WarrantyNotificationItem from './WarrantyNotificationItem'
import { WarrantyEmptyState, WarrantyListSkeleton } from './WarrantyListStates'
import { LOADING } from '../../constants/loading'

/** Alert list section: heading + live count, then loading / empty / populated state. */
export default function WarrantyNotificationList({
  rows,
  loading,
  visibleCount,
  pageSize,
  filtered,
  onLoadMore,
  onResetFilters,
}: {
  rows: WarrantyNotification[]
  loading: boolean
  visibleCount: number
  pageSize: number
  /** a date filter is active — changes the empty-state copy */
  filtered: boolean
  onLoadMore: () => void
  onResetFilters: () => void
}) {
  const visibleRows = rows.slice(0, visibleCount)
  const canLoadMore = visibleCount < rows.length

  return (
    <section aria-labelledby="warranty-alerts-heading">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="warranty-alerts-heading"
          className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-foreground-faint"
        >
          Warranty Alerts
        </h2>
        <p className="text-[length:var(--text-xs)] text-foreground-muted" role="status" aria-live="polite">
          {loading
            ? LOADING.NOTIFICATIONS
            : rows.length === 0
              ? 'No notifications to show'
              : `Showing ${visibleRows.length} of ${rows.length}`}
        </p>
      </div>

      {loading ? (
        <WarrantyListSkeleton />
      ) : rows.length === 0 ? (
        <WarrantyEmptyState filtered={filtered} onReset={onResetFilters} />
      ) : (
        <>
          <ul className="ams-list-in space-y-2">
            {visibleRows.map((row) => (
              <WarrantyNotificationItem key={row.notification_id} item={row} />
            ))}
          </ul>
          {canLoadMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-2 inline-flex min-h-[var(--touch-target)] w-full items-center justify-center rounded-md border border-line bg-surface text-[length:var(--text-sm)] font-semibold text-foreground-muted transition-[background-color,color,border-color] duration-fast ease-out hover:border-line-strong hover:bg-surface-hover hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none sm:min-h-0 sm:h-9"
            >
              Load {Math.min(rows.length - visibleCount, pageSize)} more
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
