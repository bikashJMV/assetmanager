import ConfirmDialog from '../common/ConfirmDialog'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import InventoryBulkUpdateModal from '../form/InventoryBulkUpdateModal'
import { AssetQrModal } from './AssetQrModal'
import type { AssetQrModalState, AssetQrPdfTabFallbackState } from './allAssetsConfig'
import { LOADING } from '../../constants/loading'

/** Bundles every AllAssets overlay: bulk-QR progress, QR modal, PDF-fallback confirm, bulk update. */
export function AssetsOverlays({
  isAdmin,
  bulkQrExporting,
  qrModal,
  onQrDownload,
  onQrClose,
  qrPdfTabFallback,
  onFallbackClose,
  onFallbackConfirm,
  bulkUpdateOpen,
  onBulkUpdateClose,
  onBulkUpdateSuccess,
}: {
  isAdmin: boolean
  bulkQrExporting: boolean
  qrModal: AssetQrModalState | null
  onQrDownload: () => void
  onQrClose: () => void
  qrPdfTabFallback: AssetQrPdfTabFallbackState | null
  onFallbackClose: () => void
  onFallbackConfirm: () => void
  bulkUpdateOpen: boolean
  onBulkUpdateClose: () => void
  onBulkUpdateSuccess: () => void
}) {
  return (
    <>
      {bulkQrExporting ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]" role="status" aria-live="polite" aria-busy="true">
          <div className="flex max-w-sm items-center gap-3 rounded-2xl border border-base bg-app px-5 py-4 shadow-lg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-accent refresh-spin" aria-hidden><AnimatedNavIcon name="refresh-cw" className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-semibold text-primary">{LOADING.PREPARING_PDF}</p>
              <p className="mt-0.5 text-xs text-muted">When ready, it will open in a new browser tab.</p>
            </div>
          </div>
        </div>
      ) : null}

      {qrModal && <AssetQrModal qrModal={qrModal} onDownload={onQrDownload} onClose={onQrClose} />}

      <ConfirmDialog
        open={Boolean(qrPdfTabFallback)}
        title="PDF Ready"
        message={qrPdfTabFallback?.emptyExport ? 'Download PDF to save the summary, or Close to cancel.' : 'Download PDF to save the file, or Close to cancel.'}
        confirmLabel="Download PDF"
        cancelLabel="Close"
        showDismissIcon
        onClose={onFallbackClose}
        onConfirm={onFallbackConfirm}
      />

      {isAdmin && (
        <InventoryBulkUpdateModal open={bulkUpdateOpen} onClose={onBulkUpdateClose} onSuccess={onBulkUpdateSuccess} />
      )}
    </>
  )
}
