import { useState } from 'react'
import { useQrBatchesQuery } from '../../queries/qr'
import { downloadQrBatchPdf, type QrBatch } from '../../services/qrService'
import { formatDateTime } from '../../utils/formatDisplay'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import DataPagination from '../common/DataPagination'
import GenerateBatchModal from '../form/GenerateBatchModal'
import { useToast } from '../../hooks/useToast'
import Loader from '../common/Loader'
import AnimatedNavIcon from '../common/AnimatedNavIcon'

export default function QrBatches() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [modalOpen, setModalOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQrBatchesQuery(page, limit)
  const { showToast } = useToast()

  const handleDownload = async (batch: QrBatch) => {
    if (downloadingId) return
    setDownloadingId(batch.id)
    try {
      const { pdfBlob, fileName } = await downloadQrBatchPdf(batch.id)
      const blobUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      showToast({ message: 'Download started.', variant: 'success' })
    } catch (err) {
      logDevError('qr.downloadPdf', err)
      showToast({
        message: getUserFacingMessage(err, 'Failed to download PDF.'),
        variant: 'error',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const renderStatus = (status: string) => {
    switch (status) {
      case 'generated':
        return <span className="text-green-600 bg-green-500/10 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide">Generated</span>
      case 'pending':
        return <span className="text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide">Pending</span>
      case 'failed':
        return <span className="text-red-600 bg-red-500/10 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide">Failed</span>
      default:
        return <span className="text-muted text-xs uppercase tracking-wide">{status}</span>
    }
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="rounded-2xl border border-base bg-surface px-3 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-primary">QR Batches</h1>
            <p className="text-sm text-muted mt-1">Manage bulk generated QR codes.</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-transparent bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm hover:bg-accent-hover transition"
          >
            Generate New Batch
          </button>
        </div>

        {isError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
            {getUserFacingMessage(error, 'Failed to load QR batches.')}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center p-10"><Loader /></div>
        ) : data && data.items.length > 0 ? (
          <div className="rounded-2xl border border-base bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-2 border-b border-base text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-5 py-3 font-semibold">S.No</th>
                    {/* <th className="px-5 py-3 font-semibold">Batch Code</th> */}
                    <th className="px-5 py-3 font-semibold">Date Created</th>
                    <th className="px-5 py-3 font-semibold">Count</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {data.items.map((batch, i) => (
                    <tr key={batch.id} className="hover:bg-surface-2/50 transition">
                      <td className="px-5 py-4 font-medium text-primary">{i + 1}</td>
                      {/* <td className="px-5 py-4 font-medium text-primary">{batch.batch_code}</td> */}
                      <td className="px-5 py-4 text-subtle">{formatDateTime(batch.created_at)}</td>
                      <td className="px-5 py-4 text-primary">{batch.requested_count ?? '-'}</td>
                      <td className="px-5 py-4">{renderStatus(batch.status)}</td>
                      <td className="px-5 py-4 text-right">
                        {batch.status === 'generated' && (
                          <button
                            onClick={() => handleDownload(batch)}
                            disabled={downloadingId === batch.id}
                            className="inline-flex items-center gap-1.5 text-accent hover:text-accent-hover font-medium transition disabled:opacity-50"
                          >
                            <span className="w-4 h-4"><AnimatedNavIcon name="download" /></span>
                            {downloadingId === batch.id ? 'Downloading...' : 'Download PDF'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : data ? (
          <div className="rounded-2xl border border-base bg-surface p-10 text-center">
            <p className="text-subtle">No QR batches have been generated yet.</p>
          </div>
        ) : null}

        {data && data.total > 0 && (
          <DataPagination
            currentPage={page}
            totalCount={data.total}
            pageSize={limit}
            pageSizeOptions={[20, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setLimit(newSize)
              setPage(1)
            }}
            itemLabel="batches"
          />
        )}
      </div>

      <GenerateBatchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  )
}
