import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AssetFilters } from '../../types/api'
import { getStoredPageSize, setStoredPageSize } from '../../utils/paginationPrefs'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  STATUS_ALL,
  getActiveAdvancedFilterCount,
  type AssetAdvancedFiltersInput,
} from './allAssetsConfig'

/** URL-driven search/filter/pagination state + draft advanced-filter handling for AllAssets. */
export function useAssetsFilters(loading: boolean) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = parseInt(searchParams.get('page') || '1', 10)
  const [pageSize, setPageSize] = useState(() =>
    getStoredPageSize({ storageKey: 'assets', defaultValue: DEFAULT_PAGE_SIZE, allowed: PAGE_SIZE_OPTIONS }),
  )

  const statusParam = searchParams.get('status') || undefined
  const categoryParam = searchParams.get('category') || undefined
  const searchParam = searchParams.get('search') || undefined
  const filters: AssetFilters = { search: searchParam, status: statusParam, category_slug: categoryParam }

  const [searchInput, setSearchInput] = useState(searchParam || '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftAdvancedFilters, setDraftAdvancedFilters] = useState<AssetAdvancedFiltersInput>({ status: STATUS_ALL, categorySlug: '' })

  useEffect(() => { setSearchInput(searchParam || '') }, [searchParam])

  const currentAdvancedFilters: AssetAdvancedFiltersInput = { status: statusParam || STATUS_ALL, categorySlug: categoryParam || '' }
  const activeAdvancedFilterCount = getActiveAdvancedFilterCount(currentAdvancedFilters)

  const handleFilterChange = (partial: Partial<AssetFilters>) => {
    setSearchParams((prev) => {
      if (partial.status !== undefined) {
        if (partial.status) prev.set('status', partial.status)
        else prev.delete('status')
      }
      if (partial.category_slug !== undefined) {
        if (partial.category_slug) prev.set('category', partial.category_slug)
        else prev.delete('category')
      }
      if (partial.search !== undefined) {
        if (partial.search) prev.set('search', partial.search)
        else prev.delete('search')
      }
      prev.set('page', '1')
      return prev
    })
  }

  const openFiltersPopup = () => { setDraftAdvancedFilters(currentAdvancedFilters); setFiltersOpen(true) }
  const closeFiltersPopup = () => { setDraftAdvancedFilters(currentAdvancedFilters); setFiltersOpen(false) }
  const handleDraftAdvancedFilterChange = (partial: Partial<AssetAdvancedFiltersInput>) =>
    setDraftAdvancedFilters((current) => ({ ...current, ...partial }))

  const handleApplyDraftFilters = () => {
    handleFilterChange({
      status: draftAdvancedFilters.status === STATUS_ALL ? undefined : draftAdvancedFilters.status,
      category_slug: draftAdvancedFilters.categorySlug || undefined,
    })
    setFiltersOpen(false)
  }

  const handleClearDraftFilters = () => {
    setDraftAdvancedFilters({ status: STATUS_ALL, categorySlug: '' })
    navigate('/assets')
    setFiltersOpen(false)
  }

  const handlePageChange = (page: number) => {
    if (loading || page === currentPage) return
    setSearchParams((prev) => { prev.set('page', page.toString()); return prev })
  }

  const handlePageSizeChange = (nextPageSize: number) => {
    if (loading || nextPageSize === pageSize) return
    setStoredPageSize('assets', nextPageSize)
    setPageSize(nextPageSize)
    setSearchParams((prev) => { prev.set('page', '1'); return prev })
  }

  const hasDraftAdvancedChanges =
    draftAdvancedFilters.status !== currentAdvancedFilters.status ||
    draftAdvancedFilters.categorySlug !== currentAdvancedFilters.categorySlug
  const draftAdvancedFilterCount = getActiveAdvancedFilterCount(draftAdvancedFilters)

  return {
    searchParams, setSearchParams, currentPage, pageSize,
    statusParam, categoryParam, searchParam, filters,
    searchInput, setSearchInput,
    filtersOpen, openFiltersPopup, closeFiltersPopup,
    draftAdvancedFilters, handleDraftAdvancedFilterChange,
    currentAdvancedFilters, activeAdvancedFilterCount,
    handleFilterChange, handleApplyDraftFilters, handleClearDraftFilters,
    handlePageChange, handlePageSizeChange,
    hasDraftAdvancedChanges, draftAdvancedFilterCount,
  }
}
