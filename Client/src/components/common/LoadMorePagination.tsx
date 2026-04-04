type LoadMorePaginationProps = {
  loadedCount: number
  totalCount: number
  loading: boolean
  itemLabel?: string
  onLoadMore: () => void
}

export default function LoadMorePagination({
  loadedCount,
  totalCount,
  loading,
  itemLabel = 'items',
  onLoadMore,
}: LoadMorePaginationProps) {
  if (totalCount <= 0) return null

  const canLoadMore = loadedCount < totalCount

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-base bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-subtle">
        Showing <span className="font-semibold text-primary">{loadedCount}</span> of{' '}
        <span className="font-semibold text-primary">{totalCount}</span> {itemLabel}
      </p>

      {canLoadMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Loading more...' : 'Load more'}
        </button>
      ) : (
        <span className="text-xs font-medium text-subtle">All matching {itemLabel} loaded</span>
      )}
    </div>
  )
}
