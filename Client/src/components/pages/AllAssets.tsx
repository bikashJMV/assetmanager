import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CategoryRecord } from '../../types/api'

import { useAssetsListQueryEnabled } from '../../queries/assets'
import { useAssetsListSync } from '../../components/assets/useAssetsListSync'
import { useAdminAccessQuery } from '../../queries/authz'
import { useSessionEmployeeQuery } from '../../queries/employees'
import { useCategoriesQuery } from '../../queries/meta'
import Error from '../common/Error'
import DataPagination from '../common/DataPagination'
import PageHeaderActions from '../common/PageHeaderActions'
import { getErrorDebugDetail, getUserFacingMessage } from '../../utils/errors'
import { PAGE_SIZE_OPTIONS } from '../../components/assets/allAssetsConfig'
import { useAssetsFilters } from '../../components/assets/useAssetsFilters'
import { useAssetExports } from '../../components/assets/useAssetExports'
import { AssetsToolbar } from '../../components/assets/AssetsToolbar'
import { AssetsTable } from '../../components/assets/AssetsTable'
import { AssetsFilterPopup } from '../../components/assets/AssetsFilterPopup'
import { AssetsOverlays } from '../../components/assets/AssetsOverlays'
import { buildAssetsHeaderActions } from '../../components/assets/assetsHeaderActions'
import { LOADING } from '../../constants/loading'

export default function AllAssets() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false)
  const [dismissedListError, setDismissedListError] = useState(false)
  const [initialListReady, setInitialListReady] = useState(false)

  const adminAccessQuery = useAdminAccessQuery()
  const isAdmin = adminAccessQuery.data?.allowed ?? false
  const accessResolved = adminAccessQuery.isFetched
  const sessionEmployeeQuery = useSessionEmployeeQuery()
  const isStrictAdmin = Boolean(sessionEmployeeQuery.data?.is_active && sessionEmployeeQuery.data?.role === 'admin')
  const categories: CategoryRecord[] = useCategoriesQuery().data ?? []

  const f = useAssetsFilters(false)

  const assetsQuery = useAssetsListQueryEnabled(
    {
      page: f.currentPage,
      limit: f.pageSize,
      search: f.searchParam?.trim() || undefined,
      status: f.statusParam?.trim() || undefined,
      category: f.categoryParam?.trim() || undefined,
      exclude_category_slugs: undefined,
    },
    accessResolved,
  )

  const assets = assetsQuery.data?.items ?? []
  const totalAssets = assetsQuery.data?.total ?? 0
  const loading = assetsQuery.isLoading || assetsQuery.isFetching
  const exports = useAssetExports({ filters: f.filters, searchParam: f.searchParam, onError: (m, d) => { setError(m); setErrorDebug(d) } })
  const listErrorMessage = assetsQuery.isError ? getUserFacingMessage(assetsQuery.error, 'Unable to load assets right now.') : ''
  const listErrorDebug = assetsQuery.isError ? getErrorDebugDetail(assetsQuery.error) : undefined
  const pageErrorMessage = error || (!dismissedListError ? listErrorMessage : '')
  const pageErrorDebug = error ? errorDebug : listErrorDebug

  useAssetsListSync({ accessResolved, isFetched: assetsQuery.isFetched, hasData: Boolean(assetsQuery.data), totalAssets, initialListReady, setInitialListReady, listErrorMessage, setDismissedListError, filters: f })
  const handleRefresh = () => { setError(''); setErrorDebug(undefined); void assetsQuery.refetch() }

  const headerActions = buildAssetsHeaderActions({
    isAdmin, isStrictAdmin, loading,
    bulkQrExporting: exports.bulkQrExporting, bulkXlsxExporting: exports.bulkXlsxExporting,
    navigate, onBulkUpdate: () => setBulkUpdateOpen(true),
    onDownloadQrLabels: () => void exports.handleDownloadQrLabels(),
    onDownloadXlsx: () => void exports.handleDownloadAssetsXlsx(),
  })

  if (!initialListReady) {
    return (
      <main className="min-h-screen bg-app text-primary flex items-center justify-center px-4">
        <p className="text-subtle text-sm" role="status" aria-live="polite">{LOADING.DEFAULT}</p>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
      <PageHeaderActions
        title="All Assets"
        auxiliary={isAdmin ? (
          <DataPagination currentPage={f.currentPage} totalCount={totalAssets} pageSize={f.pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} loading={loading} itemLabel="assets" showSummary={false} showNavigation={false} onPageChange={f.handlePageChange} onPageSizeChange={f.handlePageSizeChange} />
        ) : undefined}
        actions={headerActions}
      />

      <AssetsToolbar
        isAdmin={isAdmin}
        searchInput={f.searchInput}
        onSearchChange={f.setSearchInput}
        filtersOpen={f.filtersOpen}
        activeAdvancedFilterCount={f.activeAdvancedFilterCount}
        onOpenFilters={f.openFiltersPopup}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {!isAdmin && (
        <p className="text-xs text-subtle mb-3">Showing your assigned assets only. Admin access is required for QR and edit actions.</p>
      )}

      {pageErrorMessage ? (
        <div className="mb-3">
          <Error
            title="Could not load assets"
            message={pageErrorMessage}
            onRetry={handleRefresh}
            onDismiss={() => { if (error) { setError(''); setErrorDebug(undefined) } else setDismissedListError(true) }}
            debugDetail={pageErrorDebug}
            fullScreen={false}
          />
        </div>
      ) : null}

      {isAdmin ? (
        <AssetsFilterPopup
          open={f.filtersOpen}
          categories={categories}
          draft={f.draftAdvancedFilters}
          draftCount={f.draftAdvancedFilterCount}
          applyDisabled={!f.hasDraftAdvancedChanges}
          clearDisabled={f.draftAdvancedFilterCount === 0}
          onDraftChange={f.handleDraftAdvancedFilterChange}
          onApply={f.handleApplyDraftFilters}
          onClear={f.handleClearDraftFilters}
          onClose={f.closeFiltersPopup}
        />
      ) : null}

      {!error && (
        <div className="flex flex-1 flex-col">
          <AssetsTable
            assets={assets}
            isAdmin={isAdmin}
            loading={loading}
            firstLoad={!assetsQuery.data}
            currentPage={f.currentPage}
            pageSize={f.pageSize}
            navigate={navigate}
            actionMenuId={actionMenuId}
            setActionMenuId={setActionMenuId}
            qrLoading={exports.qrLoading}
            onViewQr={exports.handleViewQR}
            onDownloadQr={exports.handleDirectDownloadQr}
            onNewAsset={() => navigate('/assets/new')}
          />
          {isAdmin && (
            <div className="mt-auto pt-4">
              <DataPagination bare spread currentPage={f.currentPage} totalCount={totalAssets} pageSize={f.pageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} loading={loading} itemLabel="assets" showPageSizeSelector={false} onPageChange={f.handlePageChange} onPageSizeChange={f.handlePageSizeChange} />
            </div>
          )}
        </div>
      )}

      <AssetsOverlays
        isAdmin={isAdmin}
        bulkQrExporting={exports.bulkQrExporting}
        qrModal={exports.qrModal}
        onQrDownload={exports.handleDownloadQr}
        onQrClose={() => exports.setQrModal(null)}
        qrPdfTabFallback={exports.qrPdfTabFallback}
        onFallbackClose={exports.closeQrPdfTabFallbackModal}
        onFallbackConfirm={exports.confirmQrPdfTabFallbackDownload}
        bulkUpdateOpen={bulkUpdateOpen}
        onBulkUpdateClose={() => setBulkUpdateOpen(false)}
        onBulkUpdateSuccess={() => void assetsQuery.refetch()}
      />
    </main>
  )
}
