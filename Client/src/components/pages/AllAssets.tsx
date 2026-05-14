import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AssetFilters, AssetInventoryRecord, CategoryRecord } from '../../types/api'

import { useAssetsListQueryEnabled } from '../../queries/assets'
import { useAdminAccessQuery } from '../../queries/authz'
import { useSessionEmployeeQuery } from '../../queries/employees'
import { useCategoriesQuery } from '../../queries/meta'
import { exportAssetQrLabelsPdf, exportAssetsXlsx, listAssets, /* softDeleteAsset */ } from '../../services/assetService'
import { buildAssetQrDataUri } from '../../utils/qr'
import Error from '../common/Error'
import { useToast } from '../../hooks/useToast'
import RefreshButton from '../common/RefreshButton'
import ConfirmDialog from '../common/ConfirmDialog'
import FilterPopup from '../common/FilterPopup'
import FilterSelect, { type FilterSelectOption } from '../common/FilterSelect'
import InfoHint from '../common/InfoHint'
import DataPagination from '../common/DataPagination'
import PageHeaderActions from '../common/PageHeaderActions'
import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import { getInventoryStatusTone } from '../../utils/formatDisplay'
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
const STATUS_ALL = '__all__'
const QR_EXPORT_BATCH_SIZE = 200

type AssetAdvancedFiltersInput = {
  status: string
  categorySlug: string
}

type AssetQrModalState = {
  assetTag: string
  assetLabel: string
  qrCode: string
}

/** Pending blob when a new tab could not be opened; user must confirm download or close to revoke. */
type AssetQrPdfTabFallbackState = { blobUrl: string; fileName: string; emptyExport: boolean }

function getAssetQrLabel(asset: AssetInventoryRecord): string {
  return asset.model?.trim() || asset.category_name?.trim() || asset.asset_tag?.trim() || 'Asset'
}

function getActiveAdvancedFilterCount(input: AssetAdvancedFiltersInput): number {
  let count = 0
  if (input.status && input.status !== STATUS_ALL) count += 1
  if (input.categorySlug.trim()) count += 1
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
  const [searchParams, setSearchParams] = useSearchParams()
  const currentPage = parseInt(searchParams.get('page') || '1', 10)
  const [pageSize, setPageSize] = useState(() =>
    getStoredPageSize({ storageKey: 'assets', defaultValue: DEFAULT_PAGE_SIZE, allowed: PAGE_SIZE_OPTIONS }),
  )

  const statusParam = searchParams.get('status') || undefined
  const categoryParam = searchParams.get('category') || undefined
  const searchParam = searchParams.get('search') || undefined

  const filters: AssetFilters = {
    search: searchParam,
    status: statusParam,
    category_slug: categoryParam,
  }
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [qrModal, setQrModal] = useState<AssetQrModalState | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [bulkQrExporting, setBulkQrExporting] = useState(false)
  const [bulkXlsxExporting, setBulkXlsxExporting] = useState(false)
  const [qrPdfTabFallback, setQrPdfTabFallback] = useState<AssetQrPdfTabFallbackState | null>(null)
  const qrPdfTabFallbackRef = useRef<AssetQrPdfTabFallbackState | null>(null)
  // const [deleteTarget, setDeleteTarget] = useState<AssetInventoryRecord | null>(null)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false)
  const [draftAdvancedFilters, setDraftAdvancedFilters] = useState<AssetAdvancedFiltersInput>({
    status: STATUS_ALL,
    categorySlug: '',
  })
  const [dismissedListError, setDismissedListError] = useState(false)
  /** False until session scope is known and the first asset list request has finished (success or error). */
  const [initialListReady, setInitialListReady] = useState(false)

  const navigate = useNavigate()
  const { showToast } = useToast()

  const adminAccessQuery = useAdminAccessQuery()
  const isAdmin = adminAccessQuery.data?.allowed ?? false
  const accessResolved = adminAccessQuery.isFetched

  const sessionEmployeeQuery = useSessionEmployeeQuery()
  const isStrictAdmin = Boolean(sessionEmployeeQuery.data?.is_active && sessionEmployeeQuery.data?.role === 'admin')

  const categoriesQuery = useCategoriesQuery()
  const categories: CategoryRecord[] = categoriesQuery.data ?? []

  const [searchInput, setSearchInput] = useState(searchParam || '')

  useEffect(() => {
    setSearchInput(searchParam || '')
  }, [searchParam])

  const currentAdvancedFilters: AssetAdvancedFiltersInput = {
    status: statusParam || STATUS_ALL,
    categorySlug: categoryParam || '',
  }
  const activeAdvancedFilterCount = getActiveAdvancedFilterCount(currentAdvancedFilters)

  const assetsQuery = useAssetsListQueryEnabled(
    {
      page: currentPage,
      limit: pageSize,
      search: searchParam?.trim() || undefined,
      status: statusParam?.trim() || undefined,
      category: categoryParam?.trim() || undefined,
      exclude_category_slugs: undefined,
    },
    accessResolved,
  )

  const assets = assetsQuery.data?.items ?? []
  const totalAssets = assetsQuery.data?.total ?? 0
  const loading = assetsQuery.isLoading || assetsQuery.isFetching
  const listErrorMessage = assetsQuery.isError ? getUserFacingMessage(assetsQuery.error, 'Unable to load assets right now.') : ''
  const listErrorDebug = assetsQuery.isError ? getErrorDebugDetail(assetsQuery.error) : undefined

  const pageErrorMessage = error || (!dismissedListError ? listErrorMessage : '')
  const pageErrorDebug = error ? errorDebug : listErrorDebug

  useEffect(() => {
    if (!listErrorMessage) return
    setDismissedListError(false)
  }, [listErrorMessage])

  useEffect(() => {
    if (!accessResolved) return
    if (!initialListReady && assetsQuery.isFetched) {
      setInitialListReady(true)
    }
  }, [accessResolved, assetsQuery.isFetched, initialListReady])

  useEffect(() => {
    if (!accessResolved) return

    const timer = setTimeout(() => {
      if (searchInput !== (searchParam || '')) {
        setSearchParams(prev => {
          if (searchInput.trim()) prev.set('search', searchInput.trim())
          else prev.delete('search')
          prev.set('page', '1')
          return prev
        }, { replace: true })
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [accessResolved, searchInput, searchParam, setSearchParams])

  useEffect(() => {
    if (!assetsQuery.data) return
    if (totalAssets <= 0) return
    const totalPages = Math.max(1, Math.ceil(totalAssets / pageSize))
    if (currentPage > totalPages) {
      setSearchParams(prev => {
        prev.set('page', totalPages.toString())
        return prev
      }, { replace: true })
    }
  }, [assetsQuery.data, currentPage, pageSize, totalAssets, setSearchParams])

  useEffect(() => {
    qrPdfTabFallbackRef.current = qrPdfTabFallback
  }, [qrPdfTabFallback])

  useEffect(() => () => {
    const pending = qrPdfTabFallbackRef.current
    if (pending) URL.revokeObjectURL(pending.blobUrl)
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleFilterChange = (partial: Partial<AssetFilters>) => {
    setSearchParams(prev => {
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
    })
    setFiltersOpen(false)
  }

  const handleClearDraftFilters = () => {
    setDraftAdvancedFilters({
      status: STATUS_ALL,
      categorySlug: '',
    })
    navigate('/assets')
    setFiltersOpen(false)
  }

  const handleRefresh = () => {
    setError('')
    setErrorDebug(undefined)
    void assetsQuery.refetch()
  }

  const handlePageChange = (page: number) => {
    if (loading || page === currentPage) return
    setSearchParams(prev => {
      prev.set('page', page.toString())
      return prev
    })
  }

  const handlePageSizeChange = (nextPageSize: number) => {
    if (loading || nextPageSize === pageSize) return
    setStoredPageSize('assets', nextPageSize)
    setPageSize(nextPageSize)
    setSearchParams(prev => {
      prev.set('page', '1')
      return prev
    })
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
      const qrCode = await buildAssetQrDataUri(assetTag)
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
      const qrCode = await buildAssetQrDataUri(assetTag)
      triggerQrDownload(assetTag, qrCode)
    } catch (err) {
      logDevError('assets.qr.download', err)
      setError(getUserFacingMessage(err, 'Unable to download QR right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setQrLoading(false)
    }
  }

  const collectAssetTagsForQrExport = async (): Promise<string[]> => {
    const collectedTags: string[] = []
    const MAX_TAGS = 10_000
    let page = 1
    let total = 0
    let totalVerified = false

    const category = filters.category_slug?.trim() || undefined
    const exclude_category_slugs = undefined
    const search = searchParam?.trim() ? searchParam.trim() : undefined
    const status = filters.status?.trim() || undefined

    do {
      const result = await listAssets({
        page,
        limit: QR_EXPORT_BATCH_SIZE,
        search,
        status,
        category,
        exclude_category_slugs,
      })

      if (page === 1) {
        total = result.total
        if (
          typeof total !== 'number' ||
          (result.items.length > 0 && total < result.items.length)
        ) {
          console.warn(
            '[QR Export] result.total looks incorrect — expected global total, got:',
            total,
            '(items on page:',
            result.items.length,
            ') — falling back to exhaustive pagination.',
          )
          total = Number.MAX_SAFE_INTEGER
        }
        totalVerified = true
      }

      const pageTags = result.items
        .map((asset) => asset.asset_tag?.trim() || '')
        .filter(Boolean)

      collectedTags.push(...pageTags)
      page += 1

      if (result.items.length === 0) break
      if (collectedTags.length >= MAX_TAGS) {
        console.warn(`[QR Export] Safety cap reached (${MAX_TAGS} tags). Stopping pagination.`)
        break
      }
    } while (totalVerified && (page - 1) * QR_EXPORT_BATCH_SIZE < total)

    return [...new Set(collectedTags)]
  }

  const closeQrPdfTabFallbackModal = () => {
    setQrPdfTabFallback((current) => {
      if (current) URL.revokeObjectURL(current.blobUrl)
      return null
    })
  }

  const confirmQrPdfTabFallbackDownload = () => {
    let started = false
    setQrPdfTabFallback((current) => {
      if (!current) return current
      started = true
      const { blobUrl, fileName } = current
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      return null
    })
    if (started) {
      showToast({ variant: 'success', message: 'Download started.' })
    }
  }

  const handleDownloadQrLabels = async () => {
    if (bulkQrExporting) {
      showToast({
        variant: 'warning',
        message: 'An export is already in progress. Please wait for it to finish.',
      })
      return
    }

    setBulkQrExporting(true)
    setError('')
    setErrorDebug(undefined)

    try {
      const assetTags = await collectAssetTagsForQrExport()
      const { pdfBlob, fileName, emptyExport } = await exportAssetQrLabelsPdf(assetTags)
      const blobUrl = URL.createObjectURL(pdfBlob)
      const viewer = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      if (viewer) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
        if (emptyExport) {
          showToast({
            variant: 'info',
            message: 'Opened a summary PDF — there are no QR labels to print for this export.',
          })
        }
        return
      }
      setQrPdfTabFallback({ blobUrl, fileName, emptyExport })
    } catch (err) {
      logDevError('assets.qr.export', err)
      setError(getUserFacingMessage(err, 'Unable to export QR labels right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setBulkQrExporting(false)
    }
  }

  const handleDownloadAssetsXlsx = async () => {
    if (bulkXlsxExporting) {
      showToast({ variant: 'warning', message: 'An export is already in progress. Please wait.' })
      return
    }

    setBulkXlsxExporting(true)
    setError('')
    setErrorDebug(undefined)

    try {
      const { xlsxBlob, fileName } = await exportAssetsXlsx()
      const blobUrl = URL.createObjectURL(xlsxBlob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      showToast({ variant: 'success', message: 'Assets XLSX download started.' })
    } catch (err) {
      logDevError('assets.xlsx.export', err)
      setError(getUserFacingMessage(err, 'Unable to export XLSX right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setBulkXlsxExporting(false)
    }
  }

  // const handleSoftDeleteAsset = async (asset: AssetInventoryRecord) => {
  //   if (!isAdmin) return
  //   try {
  //     await softDeleteAsset(asset.id)
  //     setDeleteTarget(null)
  //     const nextTotal = Math.max(0, totalAssets - 1)
  //     const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
  //     const nextPage = Math.min(currentPage, lastPage)
  //     setSearchParams(prev => {
  //       prev.set('page', nextPage.toString())
  //       return prev
  //     }, { replace: true })
  //     await assetsQuery.refetch()
  //   } catch (err) {
  //     logDevError('assets.soft_delete', err)
  //     setError(getUserFacingMessage(err, 'Unable to delete asset right now.'))
  //     setErrorDebug(getErrorDebugDetail(err))
  //   }
  // }

  const hasDraftAdvancedChanges =
    draftAdvancedFilters.status !== currentAdvancedFilters.status ||
    draftAdvancedFilters.categorySlug !== currentAdvancedFilters.categorySlug
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
    ...categories
      .filter((category) => category.name.toLowerCase().trim() !== 'other')
      .map((category) => ({
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
    <main className="relative flex min-h-screen flex-col bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
      {bulkQrExporting ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex max-w-sm items-center gap-3 rounded-2xl border border-base bg-app px-5 py-4 shadow-lg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-accent refresh-spin" aria-hidden>
              <AnimatedNavIcon name="refresh-cw" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">Preparing your PDF</p>
              <p className="mt-0.5 text-xs text-muted">When ready, it will open in a new browser tab.</p>
            </div>
          </div>
        </div>
      ) : null}
      <PageHeaderActions
        title="All Assets"
        auxiliary={
          isAdmin ? (
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
          ) : undefined
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
              {
                id: 'download-asset-manager-qrs',
                label: bulkQrExporting ? 'Preparing Asset manager QRs...' : `Asset's QR Download`,
                icon: 'download' as const,
                onClick: () => {
                  void handleDownloadQrLabels()
                },
                disabled: loading || bulkQrExporting,
              },
              {
                id: 'generate-bulk-qr',
                label: 'Generate Bulk QR',
                icon: 'qr' as const,
                onClick: () => navigate('/qr-generate/batches'),
              },
              ...(isStrictAdmin
                ? [
                  {
                    id: 'export-assets-xlsx',
                    label: bulkXlsxExporting ? 'Exporting...' : 'Export Asset data',
                    icon: 'download' as const,
                    onClick: () => {
                      void handleDownloadAssetsXlsx()
                    },
                    disabled: loading || bulkXlsxExporting,
                  },
                ]
                : []),
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
              placeholder={isAdmin ? 'Search by tag, model, manufacturer, holder...' : 'Search by tag, model, serial number...'}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-lg border border-base bg-surface px-3 py-2.5 text-sm text-primary outline-none transition placeholder:text-subtle focus:border-[color:var(--accent)]"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isAdmin ? (
              <button
                type="button"
                onClick={openFiltersPopup}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${filtersOpen || activeAdvancedFilterCount > 0
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

      {pageErrorMessage ? (
        <div className="mb-3">
          <Error
            title="Could not load assets"
            message={pageErrorMessage}
            onRetry={handleRefresh}
            onDismiss={() => {
              if (error) {
                setError('')
                setErrorDebug(undefined)
              } else {
                setDismissedListError(true)
              }
            }}
            debugDetail={pageErrorDebug}
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
                    'Holder active',
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
                          {/* <button
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
                            </button> */}
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
                          className={`inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs ${asset.current_employee_is_active
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-primary'
                            : 'border-red-500/40 bg-red-500/10 text-primary'
                            }`}
                          title={
                            asset.current_employee_is_active
                              ? 'Holder employee account is active'
                              : 'Holder employee account is inactive'
                          }
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${asset.current_employee_is_active ? 'bg-emerald-500' : 'bg-red-500'
                              }`}
                            aria-hidden
                          />
                          {asset.current_employee_is_active ? 'Active' : 'Inactive'}
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
          {isAdmin && (
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
          )}
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
      {/* <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Move Asset to Recycle Bin"
        message={`Move ${(deleteTarget?.asset_tag || deleteTarget?.model || 'this asset')} to Recycle Bin?`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleSoftDeleteAsset(deleteTarget)
        }}
      /> */}

      <ConfirmDialog
        open={Boolean(qrPdfTabFallback)}
        title="Couldn't open PDF in a new tab"
        message={
          qrPdfTabFallback?.emptyExport
            ? 'Download PDF to save the summary, or Close to cancel.'
            : 'Download PDF to save the file, or Close to cancel.'
        }
        confirmLabel="Download PDF"
        cancelLabel="Close"
        showDismissIcon
        onClose={closeQrPdfTabFallbackModal}
        onConfirm={confirmQrPdfTabFallbackDownload}
      />

      {isAdmin && (
        <InventoryBulkUpdateModal
          open={bulkUpdateOpen}
          onClose={() => setBulkUpdateOpen(false)}
          onSuccess={() => void assetsQuery.refetch()}
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
