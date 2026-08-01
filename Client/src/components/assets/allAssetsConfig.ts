import type { AssetInventoryRecord } from '../../types/api'
import assetInfoHint from '../../data/assetInfoHint.json'

export const SEARCH_DEBOUNCE_MS = 300
export const DEFAULT_PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
export const statusFilters = ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed']
export const STATUS_ALL = '__all__'
export const QR_EXPORT_BATCH_SIZE = 200

export type AssetAdvancedFiltersInput = {
  status: string
  categorySlug: string
}

export type AssetQrModalState = {
  assetTag: string
  assetLabel: string
  qrCode: string
}

/** Pending blob when a new tab could not be opened; user must confirm download or close to revoke. */
export type AssetQrPdfTabFallbackState = { blobUrl: string; fileName: string; emptyExport: boolean }

export function getAssetQrLabel(asset: AssetInventoryRecord): string {
  return asset.model?.trim() || asset.category_name?.trim() || asset.asset_tag?.trim() || 'Asset'
}

export function getActiveAdvancedFilterCount(input: AssetAdvancedFiltersInput): number {
  let count = 0
  if (input.status && input.status !== STATUS_ALL) count += 1
  if (input.categorySlug.trim()) count += 1
  return count
}

export type AssetsPageInfoHint = {
  panelTitle: string
  ariaLabel: string
  sections: { heading: string; bullets: string[] }[]
  erpStatusHint: { panelTitle: string; ariaLabel: string; bullets: string[] }
}

export const ASSETS_PAGE_INFO_HINT = assetInfoHint as AssetsPageInfoHint
