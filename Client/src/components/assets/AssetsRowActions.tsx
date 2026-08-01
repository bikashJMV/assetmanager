import type { NavigateFunction } from 'react-router-dom'
import type { AssetInventoryRecord } from '../../types/api'
import RowActionMenu from '../common/RowActionMenu'
import { formatDisplay } from '../../utils/formatDisplay'
import { MenuItemIcon, MoreActionsIcon } from './assetsIcons'
import { LOADING } from '../../constants/loading'

const ITEM_CLASS =
  'group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-primary transition hover:bg-[color:var(--accent-soft)]/12 disabled:cursor-not-allowed disabled:opacity-50'
const LABEL_CLASS = 'underline decoration-transparent underline-offset-4 transition group-hover:decoration-[color:var(--accent)]'

export function AssetsRowActions({
  asset,
  open,
  onToggle,
  onClose,
  navigate,
  qrLoading,
  onViewQr,
  onDownloadQr,
}: {
  asset: AssetInventoryRecord
  open: boolean
  onToggle: () => void
  onClose: () => void
  navigate: NavigateFunction
  qrLoading: boolean
  onViewQr: (e: React.MouseEvent, asset: AssetInventoryRecord) => void
  onDownloadQr: (e: React.MouseEvent, assetTag: string | null) => void
}) {
  const label = formatDisplay(asset.asset_tag) || asset.model || 'asset'
  return (
    <RowActionMenu
      open={open}
      onToggle={onToggle}
      onClose={onClose}
      triggerLabel={`Open actions for ${label}`}
      menuLabel={`Actions for ${label}`}
      triggerContent={<MoreActionsIcon />}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); onViewQr(e, asset) }}
        className={ITEM_CLASS}
        disabled={qrLoading}
        role="menuitem"
        aria-label="View QR"
        title="View QR"
      >
        <MenuItemIcon icon={qrLoading ? 'refresh-cw' : 'scan'} spinning={qrLoading} />
        <span className={LABEL_CLASS}>{qrLoading ? LOADING.PREPARING_QR : 'View QR'}</span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`) }}
        className={ITEM_CLASS}
        role="menuitem"
        aria-label="Edit"
        title="Edit"
      >
        <MenuItemIcon icon="edit" />
        <span className={LABEL_CLASS}>Edit</span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); onDownloadQr(e, asset.asset_tag) }}
        className={ITEM_CLASS}
        disabled={qrLoading}
        role="menuitem"
        aria-label="Download QR"
        title="Download QR"
      >
        <MenuItemIcon icon={qrLoading ? 'refresh-cw' : 'download'} spinning={qrLoading} />
        <span className={LABEL_CLASS}>{qrLoading ? LOADING.PREPARING_QR : 'Download QR'}</span>
      </button>
    </RowActionMenu>
  )
}
