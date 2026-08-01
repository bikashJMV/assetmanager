import { useState } from 'react'
import { useQrBatchesInfiniteQuery } from '../../queries/qr'
import { useInfiniteScrollSentinel } from '../../hooks/useInfiniteScrollSentinel'
import { getUserFacingMessage } from '../../utils/errors'
import DataPagination from '../common/DataPagination'
import GenerateBatchModal from '../form/GenerateBatchModal'
import { AppLoader } from '../ui'
import QrBatchCards from '../qr/QrBatchCards'
import QrBatchesTable from '../qr/QrBatchesTable'
import { useQrDownloads } from '../qr/useQrDownloads'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { LOADING } from '../../constants/loading'

export default function QrBatches() {
  const [limit, setLimit] = useState(50)
  const [modalOpen, setModalOpen] = useState(false)

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useQrBatchesInfiniteQuery(limit)

  const { downloadingId, unusedDownloading, unusedCount, handleDownload, handleDownloadUnused } =
    useQrDownloads(modalOpen)

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const total = data?.pages[0]?.total ?? 0
  const sentinelRef = useInfiniteScrollSentinel<HTMLDivElement>(
    () => { void fetchNextPage() },
    Boolean(hasNextPage) && !isFetchingNextPage,
  )

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto max-w-content space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[length:var(--text-2xl)] font-semibold tracking-tight text-foreground">QR Batches</h1>
            <p className="mt-1 text-[length:var(--text-sm)] text-foreground-muted">Manage bulk generated QR codes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <DataPagination
              showSummary={false}
              showNavigation={false}
              currentPage={1}
              totalCount={total}
              pageSize={limit}
              pageSizeOptions={[20, 50, 100]}
              onPageChange={() => {}}
              onPageSizeChange={setLimit}
              itemLabel="batches"
            />
            <button
              onClick={() => { void handleDownloadUnused() }}
              disabled={unusedDownloading || unusedCount === 0}
              title="Download a single PDF of all unused QR codes for reuse"
              className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-4 text-[length:var(--text-sm)] font-semibold text-foreground shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:h-10"
            >
              <span className="h-4 w-4 shrink-0">
                <AnimatedNavIcon name="download" />
              </span>
              {unusedDownloading ? LOADING.PREPARING_PDF : 'Unused QRs'}
              {unusedCount != null && unusedCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-foreground">
                  {unusedCount}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-4 text-[length:var(--text-sm)] font-semibold text-foreground shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:h-10"
            >
              <span className="h-4 w-4 shrink-0">
                <AnimatedNavIcon name="plus" />
              </span>
              Generate New Batch
            </button>
          </div>
        </header>

        {isError && (
          <div
            role="alert"
            className="rounded-lg border p-3 text-[length:var(--text-sm)]"
            style={{
              borderColor: 'hsl(var(--danger) / 0.3)',
              backgroundColor: 'hsl(var(--danger) / 0.08)',
              color: 'hsl(var(--danger))',
            }}
          >
            {getUserFacingMessage(error, 'Failed to load QR batches.')}
          </div>
        )}

        {isLoading ? (
          <AppLoader variant="inline" />
        ) : items.length > 0 ? (
          <>
            <QrBatchesTable items={items} downloadingId={downloadingId} onDownload={(b) => { void handleDownload(b) }} />
            <QrBatchCards items={items} downloadingId={downloadingId} onDownload={(b) => { void handleDownload(b) }} />

            {/* Sentinel sits below the list; the page (app scroll root) does the scrolling. */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />

            <div className="pb-2 text-center" role="status" aria-live="polite">
              {isFetchingNextPage ? (
                <span className="text-[length:var(--text-sm)] text-foreground-muted">{LOADING.DEFAULT}</span>
              ) : (
                <span className="text-[length:var(--text-xs)] text-foreground-faint">
                  {hasNextPage ? `Showing ${items.length} of ${total} batches` : `All ${total} batches loaded`}
                </span>
              )}
            </div>
          </>
        ) : data ? (
          <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
            <p className="text-[length:var(--text-sm)] text-foreground-muted">No QR batches have been generated yet.</p>
          </div>
        ) : null}
      </div>

      <GenerateBatchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  )
}
