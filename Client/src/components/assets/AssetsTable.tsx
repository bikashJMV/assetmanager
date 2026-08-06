import type { NavigateFunction } from 'react-router-dom'
import type { AssetInventoryRecord } from '../../types/api'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import { formatDisplay } from '../../utils/formatDisplay'
import { SkeletonRows } from '../ui'
import { Button } from '../ui'
import { AssetsRowActions } from './AssetsRowActions'

const HEADERS = ['S.No', 'Asset Tag', 'Category', 'Manufacturer', 'Model', 'Holder', 'Holder active', 'Inventory Status']

function HolderActive({ asset }: { asset: AssetInventoryRecord }) {
  if (!asset.current_employee_id) return <span className="text-subtle">-</span>
  const on = asset.current_employee_is_active
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs text-primary"
      style={{ borderColor: `hsl(var(${on ? '--success' : '--danger'}) / 0.4)`, backgroundColor: `hsl(var(${on ? '--success' : '--danger'}) / 0.1)` }}
      title={on ? 'Holder employee account is active' : 'Holder employee account is inactive'}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: `hsl(var(${on ? '--success' : '--danger'}))` }} aria-hidden />
      {on ? 'Active' : 'Inactive'}
    </span>
  )
}

type TableProps = {
  assets: AssetInventoryRecord[]
  isAdmin: boolean
  loading: boolean
  firstLoad: boolean
  currentPage: number
  pageSize: number
  navigate: NavigateFunction
  actionMenuId: string | null
  setActionMenuId: (updater: (prev: string | null) => string | null) => void
  qrLoading: boolean
  onViewQr: (e: React.MouseEvent, asset: AssetInventoryRecord) => void
  onDownloadQr: (e: React.MouseEvent, assetTag: string | null) => void
  onNewAsset: () => void
}

export function AssetsTable(props: TableProps) {
  const { assets, isAdmin, loading, firstLoad, currentPage, pageSize, navigate } = props

  if (firstLoad && loading) {
    return (
      <div className="rounded-xl border border-base overflow-hidden">
        <SkeletonRows rows={pageSize > 10 ? 10 : pageSize} cols={isAdmin ? 6 : 5} />
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-base bg-surface flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-primary font-semibold">{isAdmin ? 'No assets found' : 'No assets assigned to you'}</p>
        <p className="text-sm text-muted max-w-xs">
          {isAdmin ? 'Try clearing filters, or add your first asset to get started.' : 'Assets assigned to you will appear here.'}
        </p>
        {isAdmin ? <Button icon="assign" onClick={props.onNewAsset}>New Asset</Button> : null}
      </div>
    )
  }

  const goToAsset = (asset: AssetInventoryRecord) => {
    if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
  }
  const rowActions = (asset: AssetInventoryRecord) => (
    <AssetsRowActions
      asset={asset}
      open={props.actionMenuId === asset.id}
      onToggle={() => props.setActionMenuId((prev) => (prev === asset.id ? null : asset.id))}
      onClose={() => props.setActionMenuId(() => null)}
      navigate={navigate}
      qrLoading={props.qrLoading}
      onViewQr={props.onViewQr}
      onDownloadQr={props.onDownloadQr}
    />
  )

  return (
    <div className={`transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-xl border border-base sm:block">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-surface-2 text-subtle text-xs uppercase">
            <tr>
              {(isAdmin ? [HEADERS[0], 'Actions', ...HEADERS.slice(1)] : HEADERS).map((header) => (
                <th key={header} className="px-4 py-3 whitespace-nowrap">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, index) => (
              <tr key={asset.id} className="border-t border-base hover:bg-surface-3 transition cursor-pointer" onClick={() => goToAsset(asset)}>
                <td className="px-4 py-3 text-muted">{(currentPage - 1) * pageSize + index + 1}</td>
                {isAdmin ? <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>{rowActions(asset)}</td> : null}
                <td className="px-4 py-3 text-accent font-medium">{formatDisplay(asset.asset_tag)}</td>
                <td className="px-4 py-3 text-muted">{formatDisplay(asset.category_name)}</td>
                <td className="px-4 py-3 text-muted">{formatDisplay(asset.manufacturer_name)}</td>
                <td className="px-4 py-3 text-muted">{formatDisplay(asset.model)}</td>
                <td className="px-4 py-3">{formatDisplay(asset.current_employee_name)}</td>
                <td className="px-4 py-3"><HolderActive asset={asset} /></td>
                <td className="px-4 py-3"><InventoryStatusBadge status={asset.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (Notes/UI.md §13) */}
      <div className="flex flex-col gap-3 sm:hidden">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-xl border border-base bg-surface p-4" onClick={() => goToAsset(asset)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-accent font-semibold truncate">{formatDisplay(asset.asset_tag)}</p>
                <p className="text-sm text-muted truncate">{formatDisplay(asset.category_name)} · {formatDisplay(asset.model)}</p>
              </div>
              {isAdmin ? <div onClick={(e) => e.stopPropagation()}>{rowActions(asset)}</div> : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm text-muted truncate">{formatDisplay(asset.current_employee_name)}</span>
              <InventoryStatusBadge status={asset.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
