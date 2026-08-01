import api from '../utils/authNexus.api'

export function extractDownloadFileName(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback
  const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
  const matches = filenameRegex.exec(contentDisposition)
  if (matches != null && matches[1]) {
    return matches[1].replace(/['"]/g, '')
  }
  return fallback
}


export type QrBatch = {
  id: string
  batch_code: string
  status: 'pending' | 'generated' | 'failed'
  requested_count: number   // actual DB column name
  count?: number            // kept for backwards compat
  start_tag: string | null
  end_tag: string | null
  created_at: string
  created_by_employee_id: string
}

export type ListBatchesResponse = {
  items: QrBatch[]
  page: number
  limit: number
  count: number
  total: number
}

export async function listQrBatches(page = 1, limit = 50): Promise<ListBatchesResponse> {
  const resp = await api.request<{ data: ListBatchesResponse }>({
    method: 'GET',
    url: '/api/v1/qr/batches',
    params: { page, limit },
  })
  return resp.data.data
}

export async function createQrBatch(count: number, idempotencyKey: string): Promise<QrBatch> {
  const resp = await api.request<{ data: QrBatch }>({
    method: 'POST',
    url: '/api/v1/qr/batches',
    data: { count },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  return resp.data.data
}

export async function countUnusedQr(): Promise<number> {
  const resp = await api.request<{ data: { count: number } }>({
    method: 'GET',
    url: '/api/v1/qr/reservations/unused/count',
  })
  return resp.data.data.count
}

/** Single PDF of ALL unused QR codes (reserved, never linked) for reprint/reuse. */
export async function downloadUnusedQrPdf(): Promise<{ pdfBlob: Blob; fileName: string }> {
  const resp = await api.request<Blob>({
    method: 'GET',
    url: '/api/v1/qr/reservations/unused/pdf',
    responseType: 'blob',
  })

  const blob = resp.data
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('Unused QR export returned an empty file.')
  }

  const fileName = extractDownloadFileName(resp.headers['content-disposition'], 'Unused QRs.pdf')
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName }
}

export async function downloadQrBatchPdf(batchId: string): Promise<{ pdfBlob: Blob; fileName: string }> {
  const resp = await api.request<Blob>({
    method: 'GET',
    url: `/api/v1/qr/batches/${encodeURIComponent(batchId)}/pdf`,
    responseType: 'blob',
  })

  const blob = resp.data
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('QR batch export returned an empty file.')
  }

  const fileName = extractDownloadFileName(resp.headers['content-disposition'], 'Batch QRs.pdf')
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName }
}
