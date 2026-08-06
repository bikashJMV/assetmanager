import FilterSelect from './FilterSelect'

type DataPaginationProps = {
  currentPage: number
  totalCount: number
  pageSize: number
  pageSizeOptions: number[]
  loading?: boolean
  itemLabel?: string
  showSummary?: boolean
  showPageSizeSelector?: boolean
  showNavigation?: boolean
  bare?: boolean
  spread?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

function buildPageItems(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | string> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) items.push('ellipsis-left')

  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }

  if (end < totalPages - 1) items.push('ellipsis-right')
  items.push(totalPages)
  return items
}

export default function DataPagination({
  currentPage,
  totalCount,
  pageSize,
  pageSizeOptions,
  loading = false,
  itemLabel = 'items',
  showSummary = true,
  showPageSizeSelector = true,
  showNavigation = true,
  bare = false,
  spread = false,
  onPageChange,
  onPageSizeChange,
}: DataPaginationProps) {
  const showInlineOnly = showPageSizeSelector && !showSummary && !showNavigation
  const pageSizeSelectOptions = pageSizeOptions.map((option) => ({
    label: String(option),
    value: String(option),
  }))

  const pageSizeControl = (
    <div className="inline-flex items-center gap-2 text-xs text-subtle">
      <div className={`min-w-[92px] ${loading ? 'pointer-events-none opacity-60' : ''}`}>
        <FilterSelect
          label="Rows per page"
          ariaLabel="Select rows per page"
          value={String(pageSize)}
          options={pageSizeSelectOptions}
          onChange={(value) => onPageSizeChange(Number(value))}
          hideLabel
          dense
        />
      </div>
    </div>
  )

  if (showInlineOnly) {
    return <div className="flex items-center justify-end">{pageSizeControl}</div>
  }

  if (totalCount <= 0) return null

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const startItem = (safeCurrentPage - 1) * pageSize + 1
  const endItem = Math.min(totalCount, safeCurrentPage * pageSize)
  const pageItems = buildPageItems(safeCurrentPage, totalPages)

  return (
    <div
      className={
        bare
          ? spread
            ? 'flex w-full flex-wrap items-center justify-between gap-3'
            : 'flex flex-wrap items-center gap-2'
          : 'mt-4 flex flex-col gap-3 rounded-2xl border border-base bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {showSummary ? (
          <p className="text-xs text-subtle">
            Showing <span className="font-semibold text-primary">{startItem}-{endItem}</span> of{' '}
            <span className="font-semibold text-primary">{totalCount}</span> {itemLabel}
          </p>
        ) : null}

        {showPageSizeSelector ? pageSizeControl : null}
      </div>

      {showNavigation ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage - 1)}
            disabled={loading || safeCurrentPage <= 1}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-base bg-app px-2.5 text-sm font-medium text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          {pageItems.map((item, index) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={loading}
                aria-current={item === safeCurrentPage ? 'page' : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition ${
                  item === safeCurrentPage
                    ? 'border-accent-soft bg-[color:var(--accent-soft)]/15 text-accent'
                    : 'border-base bg-app text-primary hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {item}
              </button>
            ) : (
              <span
                key={`${item}-${index}`}
                className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-subtle"
                aria-hidden="true"
              >
                ...
              </span>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage + 1)}
            disabled={loading || safeCurrentPage >= totalPages}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-base bg-app px-2.5 text-sm font-medium text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
