import AnimatedNavIcon from '../common/AnimatedNavIcon'
import type { AssetQrModalState } from './allAssetsConfig'

export function AssetQrModal({
  qrModal,
  onDownload,
  onClose,
}: {
  qrModal: AssetQrModalState
  onDownload: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-base bg-app p-6 text-center shadow-lg sm:p-8">
        <button
          type="button"
          onClick={onClose}
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
        <div className="mx-auto w-fit rounded-2xl border border-base bg-white p-3 sm:p-4 shadow-md">
          <img
            src={qrModal.qrCode}
            alt={`QR code for ${qrModal.assetTag}`}
            width={192}
            height={192}
            className="mx-auto w-44 h-44 sm:w-48 sm:h-48 rounded-xl"
          />
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={onDownload}
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
            onClick={onClose}
            className="bg-accent text-on-accent font-semibold px-6 py-2 rounded-lg hover:bg-accent-hover transition text-sm w-full shadow-accent inline-flex items-center justify-center"
            type="button"
            aria-label="Close"
            title="Close"
          >
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  )
}
