import { useQuery } from '@tanstack/react-query'

import { getAsset, getAssetDetail, listAssets, protectedScanAsset, publicScanAsset, scanAsset, getNextTag, validateTag, type ListAssetsParams } from '../services/assetService'

export const assetQueryKeys = {
  all: ['assets'] as const,
  list: (params: ListAssetsParams) => [...assetQueryKeys.all, 'list', params] as const,
  detail: (ref: string) => [...assetQueryKeys.all, 'detail', ref] as const,
  detailBundle: (ref: string) => [...assetQueryKeys.all, 'detailBundle', ref] as const,
  scan: (ref: string) => [...assetQueryKeys.all, 'scan', ref] as const,
  scanPublic: (ref: string) => [...assetQueryKeys.all, 'scanPublic', ref] as const,
  scanProtected: (ref: string) => [...assetQueryKeys.all, 'scanProtected', ref] as const,
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

export function useProtectedAssetScanQuery(ref: string, enabled = true) {
  return useQuery({
    queryKey: assetQueryKeys.scanProtected(ref),
    queryFn: () => protectedScanAsset(ref),
    enabled: enabled && Boolean(ref && ref.trim()),
  })
}

export function useNextTagQuery(alias?: string, enabled = true) {
  return useQuery({
    queryKey: ['assets', 'nextTag', alias || ''],
    queryFn: () => getNextTag(alias),
    enabled: enabled && alias !== undefined,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useValidateTagQuery(assetTag: string, enabled = true) {
  return useQuery({
    queryKey: ['assets', 'validateTag', assetTag],
    queryFn: () => validateTag(assetTag),
    enabled: enabled && Boolean(assetTag && assetTag.trim()),
    staleTime: 0,
    gcTime: 0,
  })
}
