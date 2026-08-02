import { useMemo } from 'react'

import {
  INVENTORY_SWEEP_LIMIT,
  useDashboardStatsQuery,
  useDashboardTimeseriesQuery,
  useInventorySweepQuery,
  useWarrantyNotificationsQuery,
  type DashboardStats,
} from '../../../queries/dashboard'
import type { AnalyticsLabelCount, AnalyticsMonthCount } from '../../../types/api'

import {
  buildActivityFeed,
  computeHealthTotals,
  summariseDepartments,
  type ActivityEntry,
  type DepartmentSummary,
  type HealthTotals,
} from './dashboardAggregates'

const ACTIVITY_LIMIT = 8
const TREND_MONTHS = 12

const EMPTY_STATS: DashboardStats = {
  totalAssets: 0,
  assignedAssets: 0,
  inStockAssets: 0,
  activeEmployees: 0,
  totalEmployees: 0,
}

const EMPTY_HEALTH: HealthTotals = {
  warrantyExpiring: 0,
  lowStockCategories: 0,
  underRepair: 0,
  recentlyAdded: 0,
  assignedWithoutHolder: 0,
}

export type DashboardOverview = {
  stats: DashboardStats
  health: HealthTotals
  departments: DepartmentSummary[]
  activity: ActivityEntry[]
  categoryMix: AnalyticsLabelCount[]
  statusMix: AnalyticsLabelCount[]
  assignmentTrend: AnalyticsMonthCount[]
  now: number
  generatedAt: string | null
  isStatsLoading: boolean
  isSweepLoading: boolean
  hasStatsError: boolean
  hasSweepError: boolean
  hasChartsError: boolean
  isSweepCapped: boolean
}

function toLabelCounts(map: Map<string, number>): AnalyticsLabelCount[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Single source of truth for the enterprise dashboard sections.
 *
 * Four reads total: dashboard stats, warranty alerts, the analytics time series
 * and one bounded inventory sweep. Departments, the activity feed, the status
 * and category mixes and the health checks are all derived from that sweep
 * rather than a request per department.
 */
export function useDashboardOverview(enabled: boolean, isPrivileged: boolean): DashboardOverview {
  const statsQuery = useDashboardStatsQuery(enabled)
  const warrantyQuery = useWarrantyNotificationsQuery(enabled)
  const sweepQuery = useInventorySweepQuery(enabled)
  const timeseriesQuery = useDashboardTimeseriesQuery(enabled && isPrivileged)

  const assets = sweepQuery.data?.items
  const sweepTotal = sweepQuery.data?.total ?? 0
  const warrantyCount = warrantyQuery.data?.length ?? 0
  const timeseries = timeseriesQuery.data
  const dataUpdatedAt = statsQuery.dataUpdatedAt

  return useMemo<DashboardOverview>(() => {
    const now = Date.now()
    const rows = assets ?? []

    const departments = summariseDepartments(rows, now)
    const activity = buildActivityFeed(rows, ACTIVITY_LIMIT)
    const sweptHealth = computeHealthTotals(rows, now)

    const statusMap = new Map<string, number>()
    const categoryMap = new Map<string, number>()
    for (const asset of rows) {
      const status = asset.status?.trim() || 'unknown'
      const category = asset.category_name?.trim() || 'Uncategorised'
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1)
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1)
    }

    // The warranty endpoint is authoritative and unbounded by the sweep, so it
    // wins over the count derived from the sampled rows.
    const health: HealthTotals = {
      ...(assets ? sweptHealth : EMPTY_HEALTH),
      warrantyExpiring: warrantyQuery.data ? warrantyCount : sweptHealth.warrantyExpiring,
    }

    const trend = (timeseries?.assignmentsByMonth ?? []).slice(-TREND_MONTHS)

    return {
      stats: statsQuery.data ?? EMPTY_STATS,
      health,
      departments,
      activity,
      categoryMix: toLabelCounts(categoryMap),
      statusMix: toLabelCounts(statusMap),
      assignmentTrend: trend,
      now,
      generatedAt: dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null,
      isStatsLoading: statsQuery.isPending,
      isSweepLoading: sweepQuery.isPending,
      hasStatsError: statsQuery.isError,
      hasSweepError: sweepQuery.isError,
      hasChartsError: sweepQuery.isError,
      isSweepCapped: sweepTotal > INVENTORY_SWEEP_LIMIT,
    }
    // `warrantyQuery.data` is read only for presence; the count drives the value.
  }, [
    assets,
    sweepTotal,
    warrantyCount,
    warrantyQuery.data,
    timeseries,
    statsQuery.data,
    statsQuery.isPending,
    statsQuery.isError,
    sweepQuery.isPending,
    sweepQuery.isError,
    dataUpdatedAt,
  ])
}
