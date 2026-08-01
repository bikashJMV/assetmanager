import type { IconName } from '../common/AnimatedNavIcon'
import { LOADING } from '../../constants/loading'

export type HeaderAction = {
  id: string
  label: string
  icon: IconName
  onClick: () => void
  disabled?: boolean
}

type BuildParams = {
  isAdmin: boolean
  isStrictAdmin: boolean
  loading: boolean
  bulkQrExporting: boolean
  bulkXlsxExporting: boolean
  navigate: (to: string) => void
  onBulkUpdate: () => void
  onDownloadQrLabels: () => void
  onDownloadXlsx: () => void
}

/** Builds the PageHeaderActions action list for AllAssets (role-gated). */
export function buildAssetsHeaderActions(p: BuildParams): HeaderAction[] {
  const adminActions: HeaderAction[] = p.isAdmin
    ? [
        { id: 'new-asset', label: 'New Asset', icon: 'plus', onClick: () => p.navigate('/assets/new') },
        { id: 'bulk-inventory-update', label: 'Bulk Inventory Update', icon: 'upload', onClick: p.onBulkUpdate },
        {
          id: 'download-asset-manager-qrs',
          label: p.bulkQrExporting ? LOADING.PREPARING_QR_DOWNLOADS : `Asset's QR Download`,
          icon: 'download',
          onClick: p.onDownloadQrLabels,
          disabled: p.loading || p.bulkQrExporting,
        },
        { id: 'generate-bulk-qr', label: 'Generate Bulk QR', icon: 'qr', onClick: () => p.navigate('/qr-generate/batches') },
        ...(p.isAdmin
          ? [
              {
                id: 'export-assets-xlsx',
                label: p.bulkXlsxExporting ? LOADING.EXPORTING : 'Export Asset data',
                icon: 'download' as IconName,
                onClick: p.onDownloadXlsx,
                disabled: p.loading || p.bulkXlsxExporting,
              },
            ]
          : []),
      ]
    : []

  return [
    ...adminActions,
  ]
}
