const FIELD_CLASS =
  'h-9 w-full rounded-md border border-line bg-surface px-2 text-[length:var(--text-md)] text-foreground outline-none transition-[border-color,box-shadow] duration-fast ease-out hover:border-line-strong focus:border-brand focus:shadow-focus sm:w-[9.5rem] sm:text-[length:var(--text-sm)]'

const LABEL_CLASS =
  'text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.06em] text-foreground-faint'

/** Always-visible warranty date-range filters. Lives in the page header next to the
 * summary chips: right-aligned on desktop, wrapping below the chips on smaller screens. */
export default function WarrantyDateRangeFilters({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: {
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}) {
  return (
    <div
      role="group"
      aria-label="Filter by warranty end date"
      className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <span className={LABEL_CLASS}>From Date</span>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <span className={LABEL_CLASS}>To Date</span>
        <input
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
    </div>
  )
}
