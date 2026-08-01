import RefreshButton from '../common/RefreshButton'
import InfoHint from '../common/InfoHint'
import { FilterIcon } from './assetsIcons'
import { ASSETS_PAGE_INFO_HINT } from './allAssetsConfig'
import { LOADING } from '../../constants/loading'

export function AssetsToolbar({
  isAdmin,
  searchInput,
  onSearchChange,
  filtersOpen,
  activeAdvancedFilterCount,
  onOpenFilters,
  onRefresh,
  loading,
}: {
  isAdmin: boolean
  searchInput: string
  onSearchChange: (value: string) => void
  filtersOpen: boolean
  activeAdvancedFilterCount: number
  onOpenFilters: () => void
  onRefresh: () => void
  loading: boolean
}) {
  const filterActive = filtersOpen || activeAdvancedFilterCount > 0
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1 sm:min-w-[320px]">
          <input
            type="text"
            aria-label="Search assets"
            placeholder={isAdmin ? 'Search by tag, model, manufacturer, holder...' : 'Search by tag, model, serial number...'}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-base bg-surface px-3 py-2.5 text-md text-primary outline-none transition placeholder:text-subtle focus:border-[color:var(--accent)] focus:shadow-focus"
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={onOpenFilters}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${filterActive
                ? 'border-accent-soft bg-[color:var(--accent-soft)]/15 text-primary'
                : 'border-base bg-surface text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent'
                }`}
              aria-expanded={filtersOpen ? 'true' : 'false'}
              aria-haspopup="dialog"
            >
              <span className="h-4 w-4 shrink-0"><FilterIcon /></span>
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-on-accent">
                  {activeAdvancedFilterCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <RefreshButton
            onClick={onRefresh}
            loading={loading}
            iconOnly
            ariaLabel="Refresh Assets"
            title={loading ? LOADING.REFRESHING_ASSETS : 'Refresh assets'}
            className="shrink-0 hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent"
          />
          <InfoHint panelTitle={ASSETS_PAGE_INFO_HINT.panelTitle} ariaLabel={ASSETS_PAGE_INFO_HINT.ariaLabel} className="shrink-0">
            {ASSETS_PAGE_INFO_HINT.sections.map((section) => (
              <div key={section.heading}>
                <p className="font-medium text-primary">{section.heading}</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {section.bullets.map((text, i) => (
                    <li key={`${section.heading}-${i}`}>{text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </InfoHint>
        </div>
      </div>
    </div>
  )
}
