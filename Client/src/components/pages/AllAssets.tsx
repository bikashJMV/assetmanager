import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAssetsPage,
  getQrDataUriForAssetTag,
  getSessionEmployee,
  hasActiveAdminAccess,
  listCategories,
  softDeleteAssetById,
  type AssetFilters,
  type AssetInventoryRecord,
  type CategoryRecord,
} from '../../api'
import Error from '../common/Error'
import RefreshButton from '../common/RefreshButton'
import ConfirmDialog from '../common/ConfirmDialog'
import FilterPopup from '../common/FilterPopup'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import InfoHint from '../common/InfoHint'
import DataPagination from '../common/DataPagination'
import PageHeaderActions from '../common/PageHeaderActions'
import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import InventoryStatusBadge, { getInventoryStatusTone } from '../common/InventoryStatusBadge'
import RowActionMenu from '../common/RowActionMenu'
import assetInfoHint from '../../data/assetInfoHint.json'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay, formatEnumLabel } from '../../utils/formatDisplay'
import { getStoredPageSize, setStoredPageSize } from '../../utils/paginationPrefs'
import InventoryBulkUpdateModal from '../form/InventoryBulkUpdateModal'

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const statusFilters = ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed']
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OTHER_CATEGORY_FILTER_VALUE = '__other__'
const DEFAULT_ASSET_CATEGORY_SLUGS = new Set(['laptop', 'sim', 'monitor', 'networking'])
const STATUS_ALL = '__all__'

type AssetAdvancedFiltersInput = {
  status: string
  categorySlug: string
  hideHeldByInactive: boolean
}

type AssetQrModalState = {
  assetTag: string
  assetLabel: string
  qrCode: string
}

function getAssetQrLabel(asset: AssetInventoryRecord): string {
  return asset.model?.trim() || asset.category_name?.trim() || asset.asset_tag?.trim() || 'Asset'
}

function getActiveAdvancedFilterCount(input: AssetAdvancedFiltersInput): number {
  let count = 0
  if (input.status && input.status !== STATUS_ALL) count += 1
  if (input.categorySlug.trim()) count += 1
  if (input.hideHeldByInactive) count += 1
  return count
}

type AssetsPageInfoHint = {
  panelTitle: string
  ariaLabel: string
  sections: { heading: string; bullets: string[] }[]
  erpStatusHint: { panelTitle: string; ariaLabel: string; bullets: string[] }
}

const ASSETS_PAGE_INFO_HINT = assetInfoHint as AssetsPageInfoHint

export default function AllAssets() {
  const [assets, setAssets] = useState<AssetInventoryRecord[]>([])
  const [totalAssets, setTotalAssets] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() =>
    getStoredPageSize({ storageKey: 'assets', defaultValue: DEFAULT_PAGE_SIZE, allowed: PAGE_SIZE_OPTIONS }),
  )
  const [filters, setFilters] = useState<AssetFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [qrModal, setQrModal] = useState<AssetQrModalState | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssetInventoryRecord | null>(null)
  const [scopeEmployeeId, setScopeEmployeeId] = useState<string | null>(null)
  const [accessResolved, setAccessResolved] = useState(false)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false)
  const [draftAdvancedFilters, setDraftAdvancedFilters] = useState<AssetAdvancedFiltersInput>({
    status: STATUS_ALL,
    categorySlug: '',
    hideHeldByInactive: false,
  })
  /** False until session scope is known and the first asset list request has finished (success or error). */
  const [initialListReady, setInitialListReady] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const filtersRef = useRef<AssetFilters>({})
  const navigate = useNavigate()
  const currentAdvancedFilters: AssetAdvancedFiltersInput = {
    status: filters.status || STATUS_ALL,
    categorySlug: filters.category_slug || '',
    hideHeldByInactive: Boolean(filters.hideHeldByInactive),
  }
  const activeAdvancedFilterCount = getActiveAdvancedFilterCount(currentAdvancedFilters)
  const applyScopeFilters = (base: AssetFilters): AssetFilters => {
    if (isAdmin) return { ...base, current_employee_id: undefined }
    return { ...base, current_employee_id: scopeEmployeeId || undefined }
  }

  const fetchAssets = async (
    currentFilters: AssetFilters,
    options: { page?: number; pageSize?: number } = {}
  ) => {
    const targetPage = Math.max(1, options.page ?? currentPage)
    const targetPageSize = Math.max(1, options.pageSize ?? pageSize)
    const offset = (targetPage - 1) * targetPageSize
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setErrorDebug(undefined)

    try {
      // Never query with a non-UUID placeholder; show no rows when user scope is unresolved.
      if (!isAdmin && (!scopeEmployeeId || !UUID_REGEX.test(scopeEmployeeId))) {
        if (requestId === requestIdRef.current) {
          setAssets([])
          setTotalAssets(0)
          setCurrentPage(targetPage)
          setPageSize(targetPageSize)
          setLoading(false)
        }
        return
      }

      const shouldFilterOtherCategories = currentFilters.category_slug === OTHER_CATEGORY_FILTER_VALUE
      const result = await getAssetsPage(
        applyScopeFilters({
          ...currentFilters,
          exclude_category_slugs: shouldFilterOtherCategories ? [...DEFAULT_ASSET_CATEGORY_SLUGS] : undefined,
          category_slug: shouldFilterOtherCategories ? undefined : currentFilters.category_slug,
        }),
        { offset, limit: targetPageSize }
      )
      if (requestId !== requestIdRef.current) return

      const totalPages = Math.max(1, Math.ceil(result.total / targetPageSize))
      if (result.total > 0 && targetPage > totalPages) {
        await fetchAssets(currentFilters, {
          page: totalPages,
          pageSize: targetPageSize,
        })
        return
      }

      setAssets(result.rows)
      setTotalAssets(result.total)
      setCurrentPage(targetPage)
      setPageSize(targetPageSize)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      logDevError('assets.fetch', err)
      setError(getUserFacingMessage(err, 'Unable to load assets right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [rows, profile] = await Promise.all([
          listCategories().catch(() => [] as CategoryRecord[]),
          getSessionEmployee(),
        ])
        if (!mounted) return
        const profileAdmin = Boolean(profile?.is_active && profile?.role !== 'employee')
        const effectiveAdmin = profileAdmin || await hasActiveAdminAccess()
        if (!mounted) return
        setCategories(rows)
        setIsAdmin(effectiveAdmin)
        setScopeEmployeeId(effectiveAdmin ? null : (profile?.id || null))
      } catch {
        // Keep UI usable even if categories fail.
      } finally {
        if (mounted) setAccessResolved(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!accessResolved) return
    void fetchAssets(filtersRef.current, { page: 1, pageSize })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessResolved, isAdmin, scopeEmployeeId])

  useEffect(() => {
    if (!accessResolved || loading) return
    setInitialListReady(true)
  }, [accessResolved, loading])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setFilters((current) => {
      const next = { ...current, search: value || undefined }
      filtersRef.current = next
      debounceRef.current = setTimeout(() => {
        void fetchAssets(next, { page: 1, pageSize })
      }, SEARCH_DEBOUNCE_MS)
      return next
    })
  }

  const handleFilterChange = (partial: Partial<AssetFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setFilters((current) => {
      const next = { ...current, ...partial }
      filtersRef.current = next
      void fetchAssets(next, { page: 1, pageSize })
      return next
    })
  }

  const openFiltersPopup = () => {
    setDraftAdvancedFilters(currentAdvancedFilters)
    setFiltersOpen(true)
  }

  const closeFiltersPopup = () => {
    setDraftAdvancedFilters(currentAdvancedFilters)
    setFiltersOpen(false)
  }

  const handleDraftAdvancedFilterChange = (partial: Partial<AssetAdvancedFiltersInput>) => {
    setDraftAdvancedFilters((current) => ({ ...current, ...partial }))
  }

  const handleApplyDraftFilters = () => {
    handleFilterChange({
      status: draftAdvancedFilters.status === STATUS_ALL ? undefined : draftAdvancedFilters.status,
      category_slug: draftAdvancedFilters.categorySlug || undefined,
      hideHeldByInactive: draftAdvancedFilters.hideHeldByInactive || undefined,
    })
    setFiltersOpen(false)
  }

  const handleClearDraftFilters = () => {
    setDraftAdvancedFilters({
      status: STATUS_ALL,
      categorySlug: '',
      hideHeldByInactive: false,
    })
  }

  const handleRefresh = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void fetchAssets(filtersRef.current, { page: currentPage, pageSize })
  }

  const handlePageChange = (page: number) => {
    if (loading || page === currentPage) return
    void fetchAssets(filtersRef.current, { page, pageSize })
  }

  const handlePageSizeChange = (nextPageSize: number) => {
    if (loading || nextPageSize === pageSize) return
    setStoredPageSize('assets', nextPageSize)
    void fetchAssets(filtersRef.current, { page: 1, pageSize: nextPageSize })
  }

  const handleViewQR = async (e: React.MouseEvent, asset: AssetInventoryRecord) => {
    e.stopPropagation()
    const assetTag = asset.asset_tag?.trim() || null
    if (!assetTag) {
      setError('Asset tag missing, unable to load QR')
      return
    }

    setQrLoading(true)
    try {
      const qrCode = await getQrDataUriForAssetTag(assetTag)
      setQrModal({
        assetTag,
        assetLabel: getAssetQrLabel(asset),
        qrCode,
      })
    } catch (err) {
      logDevError('assets.qr', err)
      setError(getUserFacingMessage(err, 'Unable to load QR right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setQrLoading(false)
    }
  }

  const handleDownloadQr = () => {
    if (!qrModal) return
    const link = document.createElement('a')
    link.href = qrModal.qrCode
    link.download = `${qrModal.assetTag}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const triggerQrDownload = (assetTag: string, qrCode: string) => {
    const link = document.createElement('a')
    link.href = qrCode
    link.download = `${assetTag}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDirectDownloadQr = async (e: React.MouseEvent, assetTag: string | null) => {
    e.stopPropagation()
    if (!assetTag) {
      setError('Asset tag missing, unable to download QR')
      return
    }

    setQrLoading(true)
    try {
      const qrCode = await getQrDataUriForAssetTag(assetTag)
      triggerQrDownload(assetTag, qrCode)
    } catch (err) {
      logDevError('assets.qr.download', err)
      setError(getUserFacingMessage(err, 'Unable to download QR right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setQrLoading(false)
    }
  }

  const handleSoftDeleteAsset = async (asset: AssetInventoryRecord) => {
    if (!isAdmin) return
    try {
      await softDeleteAssetById(asset.id)
      setDeleteTarget(null)
      const nextTotal = Math.max(0, totalAssets - 1)
      const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
      await fetchAssets(filtersRef.current, {
        page: Math.min(currentPage, lastPage),
        pageSize,
      })
    } catch (err) {
      logDevError('assets.soft_delete', err)
      setError(getUserFacingMessage(err, 'Unable to delete asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    }
  }

  const hasDraftAdvancedChanges =
    draftAdvancedFilters.status !== currentAdvancedFilters.status ||
    draftAdvancedFilters.categorySlug !== currentAdvancedFilters.categorySlug ||
    draftAdvancedFilters.hideHeldByInactive !== currentAdvancedFilters.hideHeldByInactive
  const draftAdvancedFilterCount = getActiveAdvancedFilterCount(draftAdvancedFilters)
  const statusOptions: FilterSelectOption[] = [
    { value: STATUS_ALL, label: 'All Inventory Status' },
    ...statusFilters.map((status) => ({
      value: status,
      label: formatEnumLabel(status),
      dotClassName: getInventoryStatusTone(status).dot,
    })),
  ]
  const categoryOptions: FilterSelectOption[] = [
    { value: '', label: 'All Categories' },
    { value: OTHER_CATEGORY_FILTER_VALUE, label: 'Other' },
    ...categories.map((category) => ({
      value: category.slug,
      label: category.name,
    })),
  ]

  if (!initialListReady) {
    return (
      <main className="min-h-screen bg-app text-primary flex items-center justify-center px-4">
        <p className="text-subtle text-sm" role="status" aria-live="polite">
          Loading
        </p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
      <PageHeaderActions
        title="All Assets"
        auxiliary={
          <DataPagination
            currentPage={currentPage}
            totalCount={totalAssets}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            loading={loading}
            itemLabel="assets"
            showSummary={false}
            showNavigation={false}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        }
        actions={[
          ...(isAdmin
            ? [
                {
                  id: 'new-asset',
                  label: 'New Asset',
                  icon: 'plus' as const,
                  onClick: () => navigate('/assets/new'),
                },
                {
                  id: 'bulk-inventory-update',
                  label: 'Bulk Inventory Update',
                  icon: 'upload' as const,
                  onClick: () => setBulkUpdateOpen(true),
                },
              ]
            : []),
          {
            id: 'scan-asset',
            label: 'Scan Asset Now',
            icon: 'scan' as const,
            onClick: () => navigate('/assets/scan'),
          },
        ]}
      />

      <div className="mb-6 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-3">
          <div className="min-w-[260px] flex-1 sm:min-w-[320px]">
            <input
              type="text"
              aria-label="Search assets"
              placeholder="Search by tag, model, manufacturer, holder..."
              value={filters.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-lg border border-base bg-surface px-3 py-2.5 text-sm text-primary outline-none transition placeholder:text-subtle focus:border-[color:var(--accent)]"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={openFiltersPopup}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                filtersOpen || activeAdvancedFilterCount > 0
                  ? 'border-accent-soft bg-[color:var(--accent-soft)]/15 text-primary'
                  : 'border-base bg-surface text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent'
              }`}
              aria-expanded={filtersOpen ? 'true' : 'false'}
              aria-haspopup="dialog"
            >
              <span className="h-4 w-4 shrink-0">
                <FilterIcon />
              </span>
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {activeAdvancedFilterCount}
                </span>
              ) : null}
            </button>
          ) : null}
          {/* Legacy inline asset filters retired in favor of the shared popup.
          <div className="relative min-w-[170px]" data-status-filter-menu>
            <button
              type="button"
              aria-label="Filter by inventory status"
              aria-haspopup="listbox"
              aria-expanded={statusFilterOpen}
              onClick={() => setStatusFilterOpen((prev) => !prev)}
              className="w-full bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 inline-flex items-center justify-between gap-2"
            >
              {filters.status ? (
                <span className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${getInventoryStatusTone(filters.status || '').dot}`} aria-hidden="true" />
                  <span>{formatEnumLabel(filters.status || '')}</span>
                </span>
              ) : (
                <span>All Inventory Status</span>
              )}
              <span className="text-subtle">▾</span>
            </button>
            {statusFilterOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-base bg-surface shadow-xl">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-3"
                  onClick={() => {
                    handleFilterChange({ status: undefined })
                    setStatusFilterOpen(false)
                  }}
                >
                  All Inventory Status
                </button>
                {statusFilters.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="w-full pl-2 py-2 text-left text-sm hover:bg-surface-3 inline-flex items-center gap-2 border-b-2 border-transparent hover:[border-bottom-color:var(--status-underline)]"
                    style={{ ['--status-underline' as any]: inventoryUnderlineColor(status) }}
                    onClick={() => {
                      handleFilterChange({ status })
                      setStatusFilterOpen(false)
                    }}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${getInventoryStatusTone(status).dot}`} aria-hidden="true" />
                    <span>{formatEnumLabel(status)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <select
            aria-label="Filter by category"
            value={filters.category_slug || ''}
            onChange={(e) => handleFilterChange({ category_slug: e.target.value || undefined })}
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[170px]"
          >
            <option value="" className="bg-surface-2 text-primary">All Categories</option>
            <option value={OTHER_CATEGORY_FILTER_VALUE} className="bg-surface-2 text-primary">Other</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug} className="bg-surface-2 text-primary">{category.name}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-muted bg-surface border border-base rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(filters.hideHeldByInactive)}
              onChange={(e) => handleFilterChange({ hideHeldByInactive: e.target.checked || undefined })}
              className="accent-[color:var(--accent)]"
            />
            Hide ERP-inactive employees
          </label>
          */}
          <RefreshButton
            onClick={handleRefresh}
            loading={loading}
            iconOnly
            ariaLabel="Refresh Assets"
            title={loading ? 'Refreshing assets' : 'Refresh assets'}
            className="shrink-0 hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent"
          />
          <InfoHint
            panelTitle={ASSETS_PAGE_INFO_HINT.panelTitle}
            ariaLabel={ASSETS_PAGE_INFO_HINT.ariaLabel}
            className="shrink-0"
          >
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

      {!isAdmin && (
        <p className="text-xs text-subtle mb-3">
          Showing your assigned assets only. Admin access is required for QR and edit actions.
        </p>
      )}

      {error ? (
        <div className="mb-3">
          <Error
            title="Could not load assets"
            message={error}
            onRetry={handleRefresh}
            onDismiss={() => {
              setError('')
              setErrorDebug(undefined)
            }}
            debugDetail={errorDebug}
            fullScreen={false}
          />
        </div>
      ) : null}

      {isAdmin ? (
        <FilterPopup
          open={filtersOpen}
          title="Filter assets"
          activeCount={draftAdvancedFilterCount}
          applyDisabled={!hasDraftAdvancedChanges}
          clearDisabled={draftAdvancedFilterCount === 0}
          onApply={handleApplyDraftFilters}
          onClear={handleClearDraftFilters}
          onClose={closeFiltersPopup}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FilterSelect
              label="Inventory status"
              ariaLabel="Filter by inventory status"
              value={draftAdvancedFilters.status}
              options={statusOptions}
              onChange={(value) =>
                handleDraftAdvancedFilterChange({
                  status: value || STATUS_ALL,
                })
              }
            />

            <FilterSelect
              label="Category"
              ariaLabel="Filter by category"
              value={draftAdvancedFilters.categorySlug}
              options={categoryOptions}
              onChange={(value) =>
                handleDraftAdvancedFilterChange({
                  categorySlug: value,
                })
              }
            />

            <div className="md:col-span-2">
              <label className="inline-flex w-full items-center gap-3 rounded-xl border border-base bg-surface px-4 py-3 text-sm text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/10">
                <input
                  type="checkbox"
                  checked={draftAdvancedFilters.hideHeldByInactive}
                  onChange={(e) =>
                    handleDraftAdvancedFilterChange({
                      hideHeldByInactive: e.target.checked,
                    })
                  }
                  className="h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                />
                <span>Hide ERP-inactive employees</span>
              </label>
            </div>
          </div>
        </FilterPopup>
      ) : null}

      {!error && (
        <div className="flex flex-1 flex-col">
        <div
          className={`overflow-x-auto rounded-xl border border-base transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-surface-2 text-subtle text-xs uppercase">
              <tr>
                {[
                  'S.No',
                  ...(isAdmin ? (['Actions'] as const) : []),
                  'Asset Tag',
                  'Category',
                  'Manufacturer',
                  'Model',
                  'Holder',
                  'ERP Status',
                  'Inventory Status',
                ].map((header) => (
                  <th key={header} className="px-4 py-3 whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, index) => (
                <tr
                  key={asset.id}
                  className="border-t border-base hover:bg-surface-3 transition cursor-pointer"
                  onClick={() => {
                    if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
                  }}
                >
                  <td className="px-4 py-3 text-muted">{(currentPage - 1) * pageSize + index + 1}</td>
                  {isAdmin ? (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        open={actionMenuId === asset.id}
                        onToggle={() => setActionMenuId((prev) => (prev === asset.id ? null : asset.id))}
                        onClose={() => setActionMenuId(null)}
                        triggerLabel={`Open actions for ${formatDisplay(asset.asset_tag) || asset.model || 'asset'}`}
                        menuLabel={`Actions for ${formatDisplay(asset.asset_tag) || asset.model || 'asset'}`}
                        triggerContent={<MoreActionsIcon />}
                      >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuId(null)
                                void handleViewQR(e, asset)
                              }}
                              className="group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-primary transition hover:bg-[color:var(--accent-soft)]/12 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={qrLoading}
                              role="menuitem"
                              aria-label="View QR"
                              title="View QR"
                            >
                              <MenuItemIcon icon={qrLoading ? 'refresh-cw' : 'scan'} spinning={qrLoading} />
                              <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-[color:var(--accent)]">
                                {qrLoading ? 'Preparing QR...' : 'View QR'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuId(null)
                                if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
                              }}
                              className="group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-primary transition hover:bg-[color:var(--accent-soft)]/12"
                              role="menuitem"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <MenuItemIcon icon="edit" />
                              <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-[color:var(--accent)]">
                                Edit
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuId(null)
                                setDeleteTarget(asset)
                              }}
                              className="group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-primary transition hover:bg-[color:var(--accent-soft)]/12"
                              role="menuitem"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <MenuItemIcon icon="trash" />
                              <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-[color:var(--accent)]">
                                Delete
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuId(null)
                                void handleDirectDownloadQr(e, asset.asset_tag)
                              }}
                              className="group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-primary transition hover:bg-[color:var(--accent-soft)]/12 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={qrLoading}
                              role="menuitem"
                              aria-label="Download QR"
                              title="Download QR"
                            >
                              <MenuItemIcon icon={qrLoading ? 'refresh-cw' : 'download'} spinning={qrLoading} />
                              <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-[color:var(--accent)]">
                                {qrLoading ? 'Preparing QR...' : 'Download QR'}
                              </span>
                            </button>
                      </RowActionMenu>
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-accent font-medium">{formatDisplay(asset.asset_tag)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.category_name)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.manufacturer_name)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.model)}</td>
                  <td className="px-4 py-3">{formatDisplay(asset.current_employee_name)}</td>
                  <td className="px-4 py-3">
                    {asset.current_employee_id ? (
                      <span
                        className={`inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs ${
                          asset.current_employee_erp_active
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-primary'
                            : 'border-red-500/40 bg-red-500/10 text-primary'
                        }`}
                        title={
                          asset.current_employee_erp_active
                            ? 'Has ERP platform access'
                            : 'No ERP platform access'
                        }
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            asset.current_employee_erp_active ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                          aria-hidden
                        />
                        {asset.current_employee_erp_active ? 'Active' : 'Inactive'}
                      </span>
                    ) : (
                      <span className="text-subtle">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <InventoryStatusBadge status={asset.status} />
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="text-center py-10 text-subtle">
                    No assets, assigned to you
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          <div className="mt-auto">
            <DataPagination
              currentPage={currentPage}
              totalCount={totalAssets}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              loading={loading}
              itemLabel="assets"
              showPageSizeSelector={false}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-base bg-app p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.22)] sm:p-8">
            <button
              type="button"
              onClick={() => setQrModal(null)}
              aria-label="Close QR popup"
              title="Close"
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-primary"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
            <p className="text-muted text-xs uppercase tracking-widest mb-1">Asset</p>
            <p className="text-xs text-muted">Scan to view asset details</p>
            <p className="mt-3 text-accent font-bold text-lg">
              {qrModal.assetLabel} / {qrModal.assetTag}
            </p>
            <div className="mx-auto w-fit rounded-2xl border border-base bg-white p-3 sm:p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <img
                src={qrModal.qrCode}
                alt={`QR code for ${qrModal.assetTag}`}
                className="mx-auto w-44 h-44 sm:w-48 sm:h-48 rounded-xl"
              />
            </div>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleDownloadQr}
                className="border border-base text-primary font-semibold px-6 py-2 rounded-lg hover:bg-surface-3 transition text-sm w-full inline-flex items-center justify-center"
                type="button"
                aria-label="Download QR"
                title="Download QR"
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  <AnimatedNavIcon name="download" />
                </span>
                <span className="ml-2">Download QR</span>
              </button>
              <button
                onClick={() => setQrModal(null)}
                className="bg-accent text-white font-semibold px-6 py-2 rounded-lg hover:bg-accent-hover transition text-sm w-full shadow-accent inline-flex items-center justify-center"
                type="button"
                aria-label="Close"
                title="Close"
              >
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Move Asset to Recycle Bin"
        message={`Move ${(deleteTarget?.asset_tag || deleteTarget?.model || 'this asset')} to Recycle Bin?`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleSoftDeleteAsset(deleteTarget)
        }}
      />

      {isAdmin && (
        <InventoryBulkUpdateModal
          open={bulkUpdateOpen}
          onClose={() => setBulkUpdateOpen(false)}
          onSuccess={() => void fetchAssets(filtersRef.current, { page: currentPage, pageSize })}
        />
      )}
    </main>
  )
}

function MenuItemIcon({ icon, spinning = false }: { icon: IconName; spinning?: boolean }) {
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center group-hover:text-accent ${spinning ? 'refresh-spin' : ''}`}>
      <AnimatedNavIcon name={icon} className="h-4 w-4" />
    </span>
  )
}

function MoreActionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="5.5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18.5" r="1.75" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}
