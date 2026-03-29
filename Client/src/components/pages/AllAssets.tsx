import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAssets,
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
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay } from '../../utils/formatDisplay'

const SEARCH_DEBOUNCE_MS = 300
/** Set to true to show "Regenerate QR" in the asset QR modal. */
const SHOW_REGENERATE_QR_BUTTON = false
const statusFilters = ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed']
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function AllAssets() {
  const [assets, setAssets] = useState<AssetInventoryRecord[]>([])
  const [filters, setFilters] = useState<AssetFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [qrModal, setQrModal] = useState<{ assetTag: string; qrCode: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssetInventoryRecord | null>(null)
  const [scopeEmployeeId, setScopeEmployeeId] = useState<string | null>(null)
  const [accessResolved, setAccessResolved] = useState(false)
  /** False until session scope is known and the first asset list request has finished (success or error). */
  const [initialListReady, setInitialListReady] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const filtersRef = useRef<AssetFilters>({})
  const navigate = useNavigate()
  const applyScopeFilters = (base: AssetFilters): AssetFilters => {
    if (isAdmin) return { ...base, current_employee_id: undefined }
    return { ...base, current_employee_id: scopeEmployeeId || undefined }
  }

  const fetchAssets = async (currentFilters: AssetFilters) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setErrorDebug(undefined)

    try {
      // Never query with a non-UUID placeholder; show no rows when user scope is unresolved.
      if (!isAdmin && (!scopeEmployeeId || !UUID_REGEX.test(scopeEmployeeId))) {
        if (requestId === requestIdRef.current) {
          setAssets([])
          setLoading(false)
        }
        return
      }

      const result = await getAssets(applyScopeFilters(currentFilters))
      if (requestId !== requestIdRef.current) return
      setAssets(result)
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
        const [rows, adminAllowed, profile] = await Promise.all([
          listCategories().catch(() => [] as CategoryRecord[]),
          hasActiveAdminAccess(),
          getSessionEmployee(),
        ])
        if (!mounted) return
        const profileAdmin = Boolean(profile?.is_active && profile?.role !== 'employee')
        const effectiveAdmin = adminAllowed || profileAdmin
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
    void fetchAssets(filtersRef.current)
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
        void fetchAssets(next)
      }, SEARCH_DEBOUNCE_MS)
      return next
    })
  }

  const handleFilterChange = (partial: Partial<AssetFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setFilters((current) => {
      const next = { ...current, ...partial }
      filtersRef.current = next
      void fetchAssets(next)
      return next
    })
  }

  const handleRefresh = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void fetchAssets(filtersRef.current)
  }

  const handleViewQR = async (e: React.MouseEvent, assetTag: string | null) => {
    e.stopPropagation()
    if (!assetTag) {
      setError('Asset tag missing, unable to load QR')
      return
    }

    setQrLoading(true)
    try {
      const qrCode = await getQrDataUriForAssetTag(assetTag)
      setQrModal({ assetTag, qrCode })
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

  const handleSoftDeleteAsset = async (asset: AssetInventoryRecord) => {
    if (!isAdmin) return
    try {
      await softDeleteAssetById(asset.id)
      setDeleteTarget(null)
      await fetchAssets(filtersRef.current)
    } catch (err) {
      logDevError('assets.soft_delete', err)
      setError(getUserFacingMessage(err, 'Unable to delete asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    }
  }

  if (!initialListReady) {
    return (
      <main className="min-h-screen bg-app text-primary flex items-center justify-center px-4">
        <p className="text-subtle text-sm" role="status" aria-live="polite">
          Loading...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <div className="w-full 2xl:flex-[1.2]">
          <input
            type="text"
            aria-label="Search assets"
            placeholder="Search by tag, model, manufacturer, holder..."
            value={filters.search || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-surface border border-base text-primary placeholder:text-subtle rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition"
          />
        </div>

        <div className="w-full 2xl:flex-[1.8] flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by inventory status"
            value={filters.status || ''}
            onChange={(e) => handleFilterChange({ status: e.target.value || undefined })}
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[170px]"
          >
            <option value="" className="bg-surface-2 text-primary">All Inventory Status</option>
            {statusFilters.map((status) => (
              <option key={status} value={status} className="bg-surface-2 text-primary">{status}</option>
            ))}
          </select>

          <select
            aria-label="Filter by category"
            value={filters.category_slug || ''}
            onChange={(e) => handleFilterChange({ category_slug: e.target.value || undefined })}
            className="bg-surface border border-base text-primary text-sm rounded-lg px-3 py-2.5 min-w-[170px]"
          >
            <option value="" className="bg-surface-2 text-primary">All Categories</option>
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

          <RefreshButton onClick={handleRefresh} loading={loading} label="Refresh" />
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-subtle mb-3">
          Showing your assigned assets only. Admin access is required for QR and edit actions.
        </p>
      )}

      <p className="text-[11px] text-subtle mb-3">Inventory filters here use `assets.status` only.</p>
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

      {!error && (
        <div
          className={`overflow-x-auto rounded-xl border border-base transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <table className="w-full text-sm text-left min-w-[940px]">
            <thead className="bg-surface-2 text-subtle text-xs uppercase">
              <tr>
                {['Asset Tag', 'Category', 'Manufacturer', 'Model', 'Holder', 'ERP Holder Status', 'Inventory Status', 'Assignment', 'Actions'].map((header) => (
                  <th key={header} className="px-4 py-3 whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr
                  key={asset.id}
                  className="border-t border-base hover:bg-surface-3 transition cursor-pointer"
                  onClick={() => {
                    if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
                  }}
                >
                  <td className="px-4 py-3 text-accent font-medium">{formatDisplay(asset.asset_tag)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.category_name)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.manufacturer_name)}</td>
                  <td className="px-4 py-3 text-muted">{formatDisplay(asset.model)}</td>
                  <td className="px-4 py-3">{formatDisplay(asset.current_employee_name)}</td>
                  <td className="px-4 py-3">
                    {asset.current_employee_id ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${asset.current_employee_erp_active ? 'bg-accent text-on-accent' : 'bg-surface border border-base text-muted'}`}>
                        {asset.current_employee_erp_active ? 'ERP Active' : 'ERP Inactive'}
                      </span>
                    ) : (
                      <span className="text-subtle">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-accent text-on-accent px-2 py-0.5 rounded text-xs">{asset.status}</span>
                  </td>
                  <td className="px-4 py-3 text-subtle text-xs">{asset.assignment_id ? 'Assigned' : 'No open assignment'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={(e) => handleViewQR(e, asset.asset_tag)}
                          disabled={qrLoading}
                          className="text-xs text-accent border border-[color:var(--accent-soft)] px-3 py-1 rounded hover:bg-[color:var(--accent-soft)]/20 transition disabled:opacity-40 whitespace-nowrap"
                          type="button"
                        >
                          View QR
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
                          }}
                          className="text-xs border border-base px-3 py-1 rounded hover:bg-surface-2 transition whitespace-nowrap"
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(asset)
                          }}
                          className="text-xs border border-base px-3 py-1 rounded hover:bg-surface-2 transition whitespace-nowrap"
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="text-subtle text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-subtle">No assets found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-app border border-base rounded-2xl p-6 sm:p-8 text-center w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
            <p className="text-muted text-xs uppercase tracking-widest mb-1">Asset QR Code</p>
            <p className="text-accent font-bold text-lg mb-4">{qrModal.assetTag}</p>
            <div className="mx-auto w-fit rounded-2xl border border-base bg-white p-3 sm:p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <img src={qrModal.qrCode} alt="QR Code" className="mx-auto w-44 h-44 sm:w-48 sm:h-48 rounded-xl" />
            </div>
            <p className="text-muted text-xs mt-4">Scan to view asset details</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SHOW_REGENERATE_QR_BUTTON ? (
                <button
                  onClick={async () => {
                    setQrLoading(true)
                    try {
                      const { regenerateQrDataUriForAssetTag } = await import('../../api')
                      const newQrCode = await regenerateQrDataUriForAssetTag(qrModal.assetTag)
                      setQrModal({ assetTag: qrModal.assetTag, qrCode: newQrCode })
                    } catch (err) {
                      logDevError('assets.qr.regenerate', err)
                      setError(getUserFacingMessage(err, 'Unable to regenerate QR right now.'))
                    } finally {
                      setQrLoading(false)
                    }
                  }}
                  disabled={qrLoading}
                  className="border border-[color:var(--accent-soft)] text-primary font-semibold px-6 py-2 rounded-lg hover:bg-surface-3 transition text-sm w-full"
                  type="button"
                >
                  {qrLoading ? 'Regenerating...' : 'Regenerate QR'}
                </button>
              ) : null}
              <button
                onClick={handleDownloadQr}
                className="border border-base text-primary font-semibold px-6 py-2 rounded-lg hover:bg-surface-3 transition text-sm w-full"
                type="button"
              >
                Download QR
              </button>
              <button
                onClick={() => setQrModal(null)}
                className="bg-accent text-on-accent font-semibold px-6 py-2 rounded-lg hover:bg-accent-hover transition text-sm w-full shadow-accent"
                type="button"
              >
                Close
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
    </main>
  )
}
