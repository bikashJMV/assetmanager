import type { AssetDetailRecord, AssetInventoryRecord, PublicScanAsset } from '../types/api'
import type { ListEnvelope } from '../api/apiClient'
import type { AssetExportRow } from '../utils/assetXlsxExport'

import { buildAssetsXlsx } from '../utils/assetXlsxExport'

import { apiRequest } from '../api/apiClient'
import api from '../utils/authNexus.api'

export type ListAssetsParams = {
  page: number
  limit: number
  search?: string
  status?: string
  category?: string
  exclude_category_slugs?: string[]
  department?: string
}

export type ScanAssetResponse =
  | { redirect: true; asset_tag: string; view_only?: boolean }
  | Record<string, unknown>

type ScanPublicFields = {
  kind?: string
  asset_tag?: string | null
  category_name?: string | null
  status?: string | null
  current_employee_name?: string | null
  current_employee_department?: string | null
  current_employee_business_id?: string | null
}

function toPublicScanAsset(ref: string, input: ScanPublicFields): PublicScanAsset {
  const assetTag = String(input.asset_tag ?? ref).trim() || ref
  const categoryName = String(input.category_name ?? '').trim() || assetTag
  const status = String(input.status ?? '').trim()
  const holderName = typeof input.current_employee_name === 'string' ? input.current_employee_name : null
  const holderDepartment =
    typeof input.current_employee_department === 'string' ? input.current_employee_department : null
  const holderEmployeeBusinessId =
    typeof input.current_employee_business_id === 'string' ? input.current_employee_business_id : null

  return {
    kind: input.kind,
    category_name: categoryName,
    asset_tag: assetTag,
    status,
    is_assigned: Boolean(holderName || holderDepartment || holderEmployeeBusinessId),
    holder_name: holderName,
    holder_department: holderDepartment,
    holder_email: null,
    holder_employee_business_id: holderEmployeeBusinessId,
  }
}

export async function listAssets(params: ListAssetsParams): Promise<ListEnvelope<AssetInventoryRecord>> {
  return apiRequest<ListEnvelope<AssetInventoryRecord>>({
    method: 'GET',
    url: '/api/v1/assets',
    params,
  })
}

export async function getAsset(ref: string): Promise<AssetInventoryRecord> {
  return apiRequest<AssetInventoryRecord>({
    method: 'GET',
    url: `/api/v1/assets/${encodeURIComponent(ref)}`,
  })
}

export async function getAssetDetail(ref: string): Promise<AssetDetailRecord> {
  return apiRequest<AssetDetailRecord>({
    method: 'GET',
    url: `/api/v1/assets/${encodeURIComponent(ref)}/detail`,
  })
}

export async function softDeleteAsset(assetId: string, note?: string): Promise<{ asset_id: string; recycle_bin_id: string }> {
  return apiRequest<{ asset_id: string; recycle_bin_id: string }>({
    method: 'POST',
    url: `/api/v1/assets/${encodeURIComponent(assetId)}/soft-delete`,
    data: { note: note?.trim() || null },
  })
}

function extractDownloadFileName(contentDisposition: string | undefined, fallback: string): string {
  const raw = (contentDisposition || '').trim()
  if (!raw) return fallback

  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // ignore
    }
  }

  const match = raw.match(/filename="?([^";]+)"?/i)
  return match?.[1]?.trim() || fallback
}

export type ExportQrLabelsPdfResult = {
  pdfBlob: Blob
  fileName: string
  emptyExport: boolean
  exportedCount: number
}

export type ExportAssetsCsvResult = {
  csvBlob: Blob
  fileName: string
}

export async function exportAssetQrLabelsPdf(assetTags: string[]): Promise<ExportQrLabelsPdfResult> {
  const normalizedTags = []
  const seen = new Set<string>()
  for (const raw of assetTags) {
    const tag = String(raw || '').trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    normalizedTags.push(tag)
  }

  const resp = await api.request<Blob>({
    method: 'POST',
    url: '/api/v1/assets/qr-labels/export',
    data: { asset_tags: normalizedTags },
    responseType: 'blob',
  })

  const blob = resp.data
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('QR export returned an empty file.')
  }

  const emptyExport = String(resp.headers['x-export-empty'] || '') === '1'
  const exportedCount = Number(resp.headers['x-exported-asset-count'] || '0') || 0
  const fileName = extractDownloadFileName(resp.headers['content-disposition'], 'Asset manager QRs.pdf')
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName, emptyExport, exportedCount }
}

export async function exportAssetHistoryPdf(assetTag: string): Promise<{ pdfBlob: Blob; fileName: string }> {
  const resp = await api.request<Blob>({
    method: 'POST',
    url: `/api/v1/assets/${encodeURIComponent(assetTag)}/history/pdf`,
    responseType: 'blob',
  })

  const blob = resp.data
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('History PDF export returned an empty file.')
  }

  const fileName = extractDownloadFileName(resp.headers['content-disposition'], `${assetTag}-history.pdf`)
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName }
}

export async function exportAssetAuditTrailPdf(ref: string, options: { limit?: number } = {}): Promise<{ pdfBlob: Blob; fileName: string }> {
  const normalized = ref.trim()
  if (!normalized) throw new Error('Asset ref is required to export audit trail.')

  const resp = await api.request<Blob>({
    method: 'GET',
    url: `/api/v1/assets/${encodeURIComponent(normalized)}/audit-trail/export`,
    params: typeof options.limit === 'number' ? { limit: options.limit } : undefined,
    responseType: 'blob',
  })

  const blob = resp.data
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('Audit trail export returned an empty file.')
  }

  const fileName = extractDownloadFileName(resp.headers['content-disposition'], 'Audit Trail.pdf')
  const pdfBlob = new Blob([blob], { type: 'application/pdf' })
  return { pdfBlob, fileName }
}

export type ExportAssetsXlsxResult = {
  xlsxBlob: Blob
  fileName: string
}

export async function exportAssetsXlsx(): Promise<ExportAssetsXlsxResult> {
  const resp = await api.request<{ data: AssetExportRow[] }>({
    method: 'GET',
    url: '/api/v1/assets/export.json',
  })

  const rows: AssetExportRow[] = resp.data?.data ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Asset export returned no data.')
  }

  const today = new Date().toISOString().split('T')[0]!
  const fileName = `assets-${today}.xlsx`
  const xlsxBlob = buildAssetsXlsx(rows)
  return { xlsxBlob, fileName }
}

export async function scanAsset(ref: string): Promise<ScanAssetResponse> {
  return apiRequest<ScanAssetResponse>({
    method: 'GET',
    url: `/api/v1/assets/scan/${encodeURIComponent(ref)}`,
  })
}

export async function publicScanAsset(ref: string): Promise<PublicScanAsset | { kind: string }> {
  const data = await apiRequest<ScanPublicFields | { kind: string }>({
    method: 'GET',
    url: `/api/v1/assets/scan/${encodeURIComponent(ref)}`,
    headers: { 'X-Skip-Auth': 'true' },
  })
  if (data && typeof data === 'object' && 'kind' in data) {
    return data as { kind: string }
  }
  return toPublicScanAsset(ref, data as ScanPublicFields)
}

export type ScanReadyToLogResponse = {
  kind: 'ready_to_log'
  asset_tag?: string
  qr_reservation_id: string
  batch_code?: string
}

export async function protectedScanAsset(
  ref: string
): Promise<
  | { redirect: true; asset_tag: string; view_only?: boolean }
  | ScanReadyToLogResponse
  | PublicScanAsset
> {
  const data = await scanAsset(ref)

  if (data && typeof data === 'object') {
    // Existing — unchanged
    if ('redirect' in data && (data as { redirect?: unknown }).redirect === true) {
      return data as { redirect: true; asset_tag: string; view_only?: boolean }
    }

    // NEW — preserve ready_to_log payload (qr_reservation_id must survive)
    if ('kind' in data && (data as { kind?: unknown }).kind === 'ready_to_log') {
      const d = data as { asset_tag?: unknown; qr_reservation_id?: unknown; batch_code?: unknown }
      if (typeof d.qr_reservation_id === 'string') {
        return {
          kind: 'ready_to_log',
          asset_tag: typeof d.asset_tag === 'string' ? d.asset_tag : undefined,
          qr_reservation_id: d.qr_reservation_id,
          batch_code: typeof d.batch_code === 'string' ? d.batch_code : undefined,
        }
      }
    }
  }

  return toPublicScanAsset(ref, data as ScanPublicFields)
}

export async function getNextTag(alias?: string): Promise<string> {
  const resp = await apiRequest<{ next_tag: string }>({
    method: 'GET',
    url: '/api/v1/assets/next-tag',
    params: alias ? { alias } : undefined,
  })
  return resp.next_tag
}

export async function validateTag(assetTag: string): Promise<{
  valid: boolean
  reason: string | null
  suggestions: string[]
}> {
  return apiRequest<{
    valid: boolean
    reason: string | null
    suggestions: string[]
  }>({
    method: 'POST',
    url: '/api/v1/assets/validate-tag',
    data: { asset_tag: assetTag },
  })
}
