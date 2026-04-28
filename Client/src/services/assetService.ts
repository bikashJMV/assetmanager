import type { AssetDetailRecord, AssetInventoryRecord, PublicScanAsset } from '../types/api'
import type { ListEnvelope } from '../api/apiClient'

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

export async function scanAsset(ref: string): Promise<ScanAssetResponse> {
  return apiRequest<ScanAssetResponse>({
    method: 'GET',
    url: `/api/v1/assets/scan/${encodeURIComponent(ref)}`,
  })
}

export async function publicScanAsset(ref: string): Promise<PublicScanAsset> {
  const data = await apiRequest<ScanPublicFields>({
    method: 'GET',
    url: `/api/v1/assets/scan/${encodeURIComponent(ref)}`,
    headers: { 'X-Skip-Auth': 'true' },
  })
  return toPublicScanAsset(ref, data)
}

export async function protectedScanAsset(ref: string): Promise<{ redirect: true; asset_tag: string; view_only?: boolean } | PublicScanAsset> {
  const data = await scanAsset(ref)
  if (data && typeof data === 'object' && 'redirect' in data && (data as { redirect?: unknown }).redirect === true) {
    const redirect = data as { redirect: true; asset_tag: string; view_only?: boolean }
    return redirect
  }
  return toPublicScanAsset(ref, data as ScanPublicFields)
}
