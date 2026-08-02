import { useMemo } from 'react'

import {
  useDashboardTimeseriesQuery,
  usePublicDashboardSummaryQuery,
} from '../../../queries/dashboard'
import { normalizeBars, normalizeCounts } from './dioramaBars'
import type { AnalyticsWallData } from './dioramaTextures'

export type DioramaFacts = {
  totalAssets: number
  assignedAssets: number
  inStockAssets: number
  utilization: number
  topCategory: { label: string; count: number } | null
  wall: AnalyticsWallData
  isLoading: boolean
  isEmpty: boolean
  hasError: boolean
}

/**
 * Numbers behind both the 3D wall and the text cards. Reads the public summary
 * (available to every visitor) and, for privileged sessions, the monthly
 * assignment series that drives the wall's bars.
 */
export function useDioramaData(isAuthenticated: boolean): DioramaFacts {
  const summaryQuery = usePublicDashboardSummaryQuery()
  const timeseriesQuery = useDashboardTimeseriesQuery(isAuthenticated)

  const summary = summaryQuery.data
  const timeseries = timeseriesQuery.data

  return useMemo<DioramaFacts>(() => {
    const totalAssets = summary?.totalAssets ?? 0
    const assignedAssets = summary?.assignedAssets ?? 0
    const inStockAssets = summary?.inStockAssets ?? Math.max(0, totalAssets - assignedAssets)
    const utilization = totalAssets > 0 ? assignedAssets / totalAssets : 0

    const categories = summary?.categoryBreakdown ?? []
    const topCategory = categories.length > 0
      ? { label: categories[0].category, count: categories[0].count }
      : null

    const monthly = timeseries?.assignmentsByMonth ?? []
    const bars = monthly.length > 0
      ? normalizeBars(monthly)
      : normalizeCounts(categories.map((item) => item.count))

    const isEmpty = !summaryQuery.isError && totalAssets === 0

    return {
      totalAssets,
      assignedAssets,
      inStockAssets,
      utilization,
      topCategory,
      wall: { bars, utilization, isEmpty },
      isLoading: summaryQuery.isPending,
      isEmpty,
      hasError: summaryQuery.isError,
    }
  }, [summary, timeseries, summaryQuery.isError, summaryQuery.isPending])
}
