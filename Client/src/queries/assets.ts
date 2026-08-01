import { useQuery } from '@tanstack/react-query'

import type { AssetInventoryRecord } from '../types/api'
import { getAsset, getAssetDetail, listAssets, protectedScanAsset, publicScanAsset, scanAsset, type ListAssetsParams } from '../services/assetService'

export const assetQueryKeys = {
  all: ['assets'] as const,
  list: (params: ListAssetsParams) => [...assetQueryKeys.all, 'list', params] as const,
  detail: (ref: string) => [...assetQueryKeys.all, 'detail', ref] as const,
  detailBundle: (ref: string) => [...assetQueryKeys.all, 'detailBundle', ref] as const,
  scan: (ref: string) => [...assetQueryKeys.all, 'scan', ref] as const,
  scanPublic: (ref: string) => [...assetQueryKeys.all, 'scanPublic', ref] as const,
  scanProtected: (ref: string) => [...assetQueryKeys.all, 'scanProtected', ref] as const,
  inStock: () => [...assetQueryKeys.all, 'in-stock'] as const,
}

export function useAssetsListQuery(params: ListAssetsParams) {
  return useQuery({
    queryKey: assetQueryKeys.list(params),
    queryFn: () => listAssets(params),
  })
}

export function useAssetsListQueryEnabled(params: ListAssetsParams, enabled: boolean) {
  return useQuery({
    queryKey: assetQueryKeys.list(params),
    queryFn: () => listAssets(params),
    enabled,
  })
}

export function useAssetQuery(ref: string) {
  return useQuery({
    queryKey: assetQueryKeys.detail(ref),
    queryFn: () => getAsset(ref),
    enabled: Boolean(ref && ref.trim()),
  })
}

export function useAssetDetailQuery(ref: string, enabled: boolean) {
  return useQuery({
    queryKey: assetQueryKeys.detailBundle(ref),
    queryFn: () => getAssetDetail(ref),
    enabled,
  })
}

export function useAssetScanQuery(ref: string) {
  return useQuery({
    queryKey: assetQueryKeys.scan(ref),
    queryFn: () => scanAsset(ref),
    enabled: Boolean(ref && ref.trim()),
  })
}

export function usePublicAssetScanQuery(ref: string) {
  return useQuery({
    queryKey: assetQueryKeys.scanPublic(ref),
    queryFn: () => publicScanAsset(ref),
    enabled: Boolean(ref && ref.trim()),
  })
}

export function useProtectedAssetScanQuery(ref: string) {
  return useQuery({
    queryKey: assetQueryKeys.scanProtected(ref),
    queryFn: () => protectedScanAsset(ref),
    enabled: Boolean(ref && ref.trim()),
  })
}

/** Server caps `limit` at 200; a hard page ceiling keeps a bad `total` from looping forever. */
const IN_STOCK_PAGE_SIZE = 200
const IN_STOCK_MAX_PAGES = 25

async function fetchAllInStockAssets(): Promise<AssetInventoryRecord[]> {
  const collected: AssetInventoryRecord[] = []
  let page = 1
  let total = 0

  do {
    const result = await listAssets({ page, limit: IN_STOCK_PAGE_SIZE, status: 'in_stock' })
    if (page === 1) total = result.total
    collected.push(...result.items)
    if (result.items.length === 0) break
    page += 1
  } while (collected.length < total && page <= IN_STOCK_MAX_PAGES)

  return collected
}

/** Every in-stock asset, for client-side analytics grouping. Read-only; no new endpoint. */
export function useInStockAssetsQuery() {
  return useQuery({
    queryKey: assetQueryKeys.inStock(),
    queryFn: () => fetchAllInStockAssets(),
    staleTime: 5 * 60 * 1000,
  })
}
