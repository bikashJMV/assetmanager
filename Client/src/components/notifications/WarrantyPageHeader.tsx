import WarrantyDateRangeFilters from './WarrantyDateRangeFilters'
import WarrantySummaryChips from './WarrantySummaryChips'

const PAGE_TITLE = 'Notifications'

/** Page header: title, live summary chips, inline date-range filters, visibility note. */
export default function WarrantyPageHeader({
  total,
  expired,
  expiringSoon,
  activeFilters,
  audienceLabel,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: {
  total: number
  expired: number
  expiringSoon: number
  activeFilters: number
  audienceLabel: string
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}) {
  return (
    <header className="mb-4 space-y-3">
      <div className="min-w-0">
        <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-tight text-foreground">{PAGE_TITLE}</h1>
      </div>
      {/* Chips and filters share one wrapping row: filters sit right on desktop, drop
          below the chips once the row runs out of width. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <WarrantySummaryChips
          total={total}
          expired={expired}
          expiringSoon={expiringSoon}
          activeFilters={activeFilters}
        />
        <WarrantyDateRangeFilters
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={onFromDateChange}
          onToDateChange={onToDateChange}
        />
      </div>
      <p className="text-[length:var(--text-xs)] text-foreground-faint">{audienceLabel}</p>
    </header>
  )
}
