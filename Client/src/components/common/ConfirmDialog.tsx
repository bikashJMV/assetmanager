import { LOADING } from '../../constants/loading'
type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  /** Top-right dismiss control; still shows Cancel; respects `loading` (disabled while busy). */
  showDismissIcon?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  showDismissIcon = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-md rounded-2xl border border-base bg-app p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] sm:p-6 ${showDismissIcon ? 'pr-11 sm:pr-12' : ''}`}
      >
        {showDismissIcon ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={loading}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="sr-only">Close</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-base bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-surface-3 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? LOADING.PLEASE_WAIT : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
