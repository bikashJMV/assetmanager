import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { getPublicDashboardSummary, type PublicDashboardSummary } from '../api'
import { apiRequest, type ListEnvelope } from '../api/apiClient'
import { listAssets } from '../services/assetService'
import { getAnalyticsTimeseries } from '../services/metaService'
import { metaQueryKeys } from './meta'
import type { AnalyticsTimeseries, AssetInventoryRecord } from '../types/api'

/** Upper bound on the inventory sweep that powers departments, activity and health. */
export const INVENTORY_SWEEP_LIMIT = 500

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  publicSummary: () => [...dashboardQueryKeys.all, 'public-summary'] as const,
  stats: () => [...dashboardQueryKeys.all, 'stats'] as const,
  warranty: (days: number) => [...dashboardQueryKeys.all, 'warranty', days] as const,
  inventorySweep: () => [...dashboardQueryKeys.all, 'inventory-sweep'] as const,
}

export type DashboardStats = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  activeEmployees: number
  totalEmployees: number
}

export type WarrantyNotification = {
  asset_tag: string | null
  model: string | null
  category_name: string | null
  warranty_expiry: string | null
  days_remaining: number
  current_employee_name?: string | null
}

export function usePublicDashboardSummaryQuery(
  enabled = true,
): UseQueryResult<PublicDashboardSummary> {
  return useQuery<PublicDashboardSummary>({
    queryKey: dashboardQueryKeys.publicSummary(),
    queryFn: () => getPublicDashboardSummary(),
    enabled,
    staleTime: 60_000,
  })
}

/**
 * Same key as `useAnalyticsTimeseriesQuery` so the Analysis page and the
 * dashboard share one cache entry. Gated on `enabled` because the endpoint is
 * privileged — guests would only collect 401s.
 */
export function useDashboardTimeseriesQuery(
  enabled: boolean,
): UseQueryResult<AnalyticsTimeseries> {
  return useQuery<AnalyticsTimeseries>({
    queryKey: metaQueryKeys.analyticsTimeseries(),
    queryFn: () => getAnalyticsTimeseries(),
    enabled,
    staleTime: 300_000,
    retry: false,
  })
}

export function useDashboardStatsQuery(enabled: boolean): UseQueryResult<DashboardStats> {
  return useQuery<DashboardStats>({
    queryKey: dashboardQueryKeys.stats(),
    queryFn: () =>
      apiRequest<DashboardStats>({ method: 'GET', url: '/api/v1/meta/dashboard-stats' }),
    enabled,
    staleTime: 60_000,
  })
}

export function useWarrantyNotificationsQuery(
  enabled: boolean,
  daysAhead = 30,
): UseQueryResult<WarrantyNotification[]> {
  return useQuery<WarrantyNotification[]>({
    queryKey: dashboardQueryKeys.warranty(daysAhead),
    queryFn: () =>
      apiRequest<WarrantyNotification[]>({
        method: 'GET',
        url: '/api/v1/meta/warranty-notifications',
        // The route aliases its `days_ahead` filter to the `limit` query param.
        params: { limit: daysAhead },
      }),
    enabled,
    staleTime: 300_000,
  })
}

/**
 * One bounded read of the inventory view. Departments, the activity feed and the
 * health checks are all derived from this single response rather than a request
 * per department, which would be far chattier.
 */
export function useInventorySweepQuery(
  enabled: boolean,
): UseQueryResult<ListEnvelope<AssetInventoryRecord>> {
  return useQuery<ListEnvelope<AssetInventoryRecord>>({
    queryKey: dashboardQueryKeys.inventorySweep(),
    queryFn: () => listAssets({ page: 1, limit: INVENTORY_SWEEP_LIMIT }),
    enabled,
    staleTime: 120_000,
  })
}
