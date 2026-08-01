import type { QrBatch } from '../../services/qrService'
import { formatDateTime } from '../../utils/formatDisplay'
import QrBatchDownloadButton from './QrBatchDownloadButton'
import QrBatchStatusBadge from './QrBatchStatusBadge'

function CardField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[length:var(--text-xs)] uppercase tracking-[0.08em] text-foreground-faint">{label}</dt>
      <dd
        className={`truncate text-[length:var(--text-sm)] text-foreground ${mono ? 'font-mono text-[length:var(--text-xs)]' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

/** Mobile layout (below md): each batch becomes a stacked card so the table never
 * needs horizontal scrolling on a phone. */
export default function QrBatchCards({
  items,
  downloadingId,
  onDownload,
}: {
  items: QrBatch[]
  downloadingId: string | null
  onDownload: (batch: QrBatch) => void
}) {
  return (
    <ul className="space-y-2 md:hidden">
      {items.map((batch, i) => (
        <li key={batch.id} className="rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--text-sm)] font-semibold tabular-nums text-foreground">#{i + 1}</span>
            <QrBatchStatusBadge status={batch.status} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <CardField label="Date Created" value={formatDateTime(batch.created_at)} />
            <CardField label="Count" value={String(batch.requested_count ?? batch.count ?? '-')} />
            <div className="col-span-2">
              <CardField
                label="Range"
                mono
                value={batch.start_tag && batch.end_tag ? `${batch.start_tag} - ${batch.end_tag}` : '-'}
              />
            </div>
          </dl>
          {batch.status === 'generated' ? (
            <div className="mt-3">
              <QrBatchDownloadButton batch={batch} downloadingId={downloadingId} onDownload={onDownload} block />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
