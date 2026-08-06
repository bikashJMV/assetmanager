import type { QrBatch } from '../../services/qrService'
import { formatDateTime } from '../../utils/formatDisplay'
import QrBatchDownloadButton from './QrBatchDownloadButton'
import QrBatchStatusBadge from './QrBatchStatusBadge'

const CELL = 'px-3 py-2 lg:px-4 xl:px-5'
/** Sticky header cells paint their own background — a bg on <thead> alone doesn't
 * render reliably while stuck, and a border-bottom would scroll away with it.
 * The header sticks against the app scroll root (App.tsx `data-app-scroll-root`);
 * no ancestor here may set overflow, or that becomes the scrollport instead. */
const HEAD_CELL = `${CELL} sticky top-0 z-10 bg-surface-sunken font-semibold uppercase tracking-[0.06em] text-foreground-faint shadow-[inset_0_-1px_0_hsl(var(--border-t))]`

function formatRange(batch: QrBatch): string {
  return batch.start_tag && batch.end_tag ? `${batch.start_tag} - ${batch.end_tag}` : '-'
}

/** Desktop / tablet grid (md and up). Mobile uses the stacked card list instead. */
export default function QrBatchesTable({
  items,
  downloadingId,
  onDownload,
}: {
  items: QrBatch[]
  downloadingId: string | null
  onDownload: (batch: QrBatch) => void
}) {
  return (
    <div className="hidden w-full rounded-lg border border-line bg-surface md:block">
      <table className="w-full border-separate border-spacing-0 text-left text-[length:var(--text-sm)]">
          <thead className="text-[length:var(--text-xs)]">
            <tr>
              <th scope="col" className={`${HEAD_CELL} w-16 rounded-tl-lg`}>S.No</th>
              <th scope="col" className={HEAD_CELL}>Date Created</th>
              <th scope="col" className={`${HEAD_CELL} w-28 text-right`}>Count</th>
              <th scope="col" className={HEAD_CELL}>Range</th>
              <th scope="col" className={`${HEAD_CELL} w-40`}>Status</th>
              <th scope="col" className={`${HEAD_CELL} w-44 rounded-tr-lg text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((batch, i) => (
              <tr
                key={batch.id}
                /* border-separate: row dividers must live on the cells, not the <tr> */
                className="transition-colors duration-fast ease-out hover:bg-surface-hover [&>td]:border-t [&>td]:border-line"
              >
                <td className={`${CELL} tabular-nums text-foreground-muted`}>{i + 1}</td>
                <td className={`${CELL} whitespace-nowrap text-foreground`}>{formatDateTime(batch.created_at)}</td>
                <td className={`${CELL} text-right font-medium tabular-nums text-foreground`}>
                  {batch.requested_count ?? batch.count ?? '-'}
                </td>
                <td className={`${CELL} whitespace-nowrap font-mono text-[length:var(--text-xs)] text-foreground-muted`}>
                  {formatRange(batch)}
                </td>
                <td className={CELL}>
                  <QrBatchStatusBadge status={batch.status} />
                </td>
                <td className={`${CELL} text-right`}>
                  {batch.status === 'generated' ? (
                    <QrBatchDownloadButton batch={batch} downloadingId={downloadingId} onDownload={onDownload} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </div>
  )
}
