import type { CategoryRecord } from '../../types/api'
import FilterPopup from '../common/FilterPopup'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import { getInventoryStatusTone, formatEnumLabel } from '../../utils/formatDisplay'
import { STATUS_ALL, statusFilters, type AssetAdvancedFiltersInput } from './allAssetsConfig'

export function AssetsFilterPopup({
  open,
  categories,
  draft,
  draftCount,
  applyDisabled,
  clearDisabled,
  onDraftChange,
  onApply,
  onClear,
  onClose,
}: {
  open: boolean
  categories: CategoryRecord[]
  draft: AssetAdvancedFiltersInput
  draftCount: number
  applyDisabled: boolean
  clearDisabled: boolean
  onDraftChange: (partial: Partial<AssetAdvancedFiltersInput>) => void
  onApply: () => void
  onClear: () => void
  onClose: () => void
}) {
  const statusOptions: FilterSelectOption[] = [
    { value: STATUS_ALL, label: 'All Inventory Status' },
    ...statusFilters.map((status) => ({ value: status, label: formatEnumLabel(status), dotColor: getInventoryStatusTone(status).dotColor })),
  ]
  const categoryOptions: FilterSelectOption[] = [
    { value: '', label: 'All Categories' },
    ...categories
      .filter((c) => c.name.toLowerCase().trim() !== 'other')
      .map((c) => ({ value: c.slug, label: c.name })),
  ]

  return (
    <FilterPopup
      open={open}
      title="Filter assets"
      activeCount={draftCount}
      applyDisabled={applyDisabled}
      clearDisabled={clearDisabled}
      onApply={onApply}
      onClear={onClear}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FilterSelect
          label="Inventory status"
          ariaLabel="Filter by inventory status"
          value={draft.status}
          options={statusOptions}
          deselectValue={STATUS_ALL}
          onChange={(value) => onDraftChange({ status: value || STATUS_ALL })}
        />
        <FilterSelect
          label="Category"
          ariaLabel="Filter by category"
          value={draft.categorySlug}
          options={categoryOptions}
          deselectValue=""
          onChange={(value) => onDraftChange({ categorySlug: value })}
        />
      </div>
    </FilterPopup>
  )
}
