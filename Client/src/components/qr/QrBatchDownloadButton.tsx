import type { QrBatch } from '../../services/qrService'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { LOADING } from '../../constants/loading'

/** Download action shared by the desktop table and the mobile cards, so both stay
 * in sync with the per-row downloading state. */
export default function QrBatchDownloadButton({
  batch,
  downloadingId,
  onDownload,
  block = false,
}: {
  batch: QrBatch
  downloadingId: string | null
  onDownload: (batch: QrBatch) => void
  /** full-width variant for the stacked mobile card */
  block?: boolean
}) {
  const busy = downloadingId === batch.id
  return (
    <button
      type="button"
      onClick={() => onDownload(batch)}
      disabled={busy}
      aria-label={`Download PDF for batch ${batch.start_tag ?? batch.id}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-line px-2.5 text-[length:var(--text-sm)] font-medium text-foreground-muted transition-[background-color,color,border-color] duration-fast ease-out hover:border-brand hover:bg-surface-hover hover:text-brand focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        block ? 'min-h-[var(--touch-target)] w-full' : 'h-7'
      }`}
    >
      <span className="h-4 w-4 shrink-0">
        <AnimatedNavIcon name="download" />
      </span>
      {busy ? LOADING.DOWNLOADING : 'Download PDF'}
    </button>
  )
}
