import { useEffect, useState } from 'react'
import { countUnusedQr, downloadQrBatchPdf, downloadUnusedQrPdf, type QrBatch } from '../../services/qrService'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { useToast } from '../../hooks/useToast'

function triggerBlobDownload(pdfBlob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(pdfBlob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
}

/** Batch + unused-QR PDF downloads, plus the best-effort unused counter badge.
 * `refreshKey` re-counts unused QRs whenever the caller's modal state changes. */
export function useQrDownloads(refreshKey: unknown) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [unusedDownloading, setUnusedDownloading] = useState(false)
  const [unusedCount, setUnusedCount] = useState<number | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const c = await countUnusedQr()
        if (alive) setUnusedCount(c)
      } catch {
        /* badge is best-effort */
      }
    })()
    return () => { alive = false }
  }, [refreshKey, unusedDownloading])

  const handleDownload = async (batch: QrBatch): Promise<void> => {
    if (downloadingId) return
    setDownloadingId(batch.id)
    try {
      const { pdfBlob, fileName } = await downloadQrBatchPdf(batch.id)
      triggerBlobDownload(pdfBlob, fileName)
      showToast({ message: 'Download started.', variant: 'success' })
    } catch (err) {
      logDevError('qr.downloadPdf', err)
      showToast({ message: getUserFacingMessage(err, 'Failed to download PDF.'), variant: 'error' })
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadUnused = async (): Promise<void> => {
    if (unusedDownloading) return
    if (unusedCount === 0) {
      showToast({ message: 'No unused QR codes to download.', variant: 'info' })
      return
    }
    setUnusedDownloading(true)
    try {
      const { pdfBlob, fileName } = await downloadUnusedQrPdf()
      triggerBlobDownload(pdfBlob, fileName)
      showToast({ message: 'Unused QR PDF download started.', variant: 'success' })
    } catch (err) {
      logDevError('qr.downloadUnusedPdf', err)
      showToast({ message: getUserFacingMessage(err, 'Failed to download unused QR PDF.'), variant: 'error' })
    } finally {
      setUnusedDownloading(false)
    }
  }

  return { downloadingId, unusedDownloading, unusedCount, handleDownload, handleDownloadUnused }
}
