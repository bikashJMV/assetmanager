import type { AssetInventoryRecord } from '../../../types/api'

/**
 * Pure aggregation over the inventory sweep. Kept free of React and of the API
 * client so it can be unit tested directly.
 */

export const WARRANTY_WINDOW_DAYS = 30
export const LOW_STOCK_THRESHOLD = 3
export const RECENT_WINDOW_DAYS = 30

export const ASSET_STATUS = {
  assigned: 'assigned',
  inStock: 'in_stock',
  inRepair: 'in_repair',
} as const

export type DepartmentSummary = {
  department: string
  total: number
  assigned: number
  inStock: number
  repair: number
  warrantyExpiring: number
  utilization: number
}

export type ActivityEntry = {
  id: string
  kind: 'added' | 'assigned'
  assetTag: string
  assetName: string
  employeeName: string | null
  department: string | null
  status: string
  at: string
}

export type HealthTotals = {
  warrantyExpiring: number
  lowStockCategories: number
  underRepair: number
  recentlyAdded: number
  assignedWithoutHolder: number
}

const UNASSIGNED_DEPARTMENT = 'Unassigned'

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return Math.floor((time - now) / 86_400_000)
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return Math.floor((now - time) / 86_400_000)
}

function isWarrantyExpiring(asset: AssetInventoryRecord, now: number): boolean {
  const remaining = daysUntil(asset.warranty_expiry, now)
  return remaining !== null && remaining >= 0 && remaining <= WARRANTY_WINDOW_DAYS
}

export function assetDisplayName(asset: AssetInventoryRecord): string {
  return asset.model?.trim() || asset.category_name?.trim() || asset.asset_tag?.trim() || 'Asset'
}

export function summariseDepartments(
  assets: AssetInventoryRecord[],
  now: number,
): DepartmentSummary[] {
  const buckets = new Map<string, DepartmentSummary>()

  for (const asset of assets) {
    const name = asset.current_employee_department?.trim() || UNASSIGNED_DEPARTMENT
    let bucket = buckets.get(name)
    if (!bucket) {
      bucket = {
        department: name,
        total: 0,
        assigned: 0,
        inStock: 0,
        repair: 0,
        warrantyExpiring: 0,
        utilization: 0,
      }
      buckets.set(name, bucket)
    }

    bucket.total += 1
    if (asset.status === ASSET_STATUS.assigned) bucket.assigned += 1
    if (asset.status === ASSET_STATUS.inStock) bucket.inStock += 1
    if (asset.status === ASSET_STATUS.inRepair) bucket.repair += 1
    if (isWarrantyExpiring(asset, now)) bucket.warrantyExpiring += 1
  }

  const summaries = [...buckets.values()]
  for (const summary of summaries) {
    summary.utilization = summary.total > 0 ? summary.assigned / summary.total : 0
  }

  return summaries.sort((a, b) => b.total - a.total)
}

/**
 * Builds an activity feed from the timestamps the inventory view already
 * carries. Returns are deliberately absent: `returned_at` is not part of this
 * view, so claiming to show them would be inventing data.
 */
export function buildActivityFeed(
  assets: AssetInventoryRecord[],
  limit: number,
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  for (const asset of assets) {
    const tag = asset.asset_tag?.trim() || asset.id
    const name = assetDisplayName(asset)

    if (asset.created_at) {
      entries.push({
        id: `${asset.id}:added`,
        kind: 'added',
        assetTag: tag,
        assetName: name,
        employeeName: null,
        department: null,
        status: asset.status,
        at: asset.created_at,
      })
    }

    if (asset.assigned_at && asset.current_employee_name) {
      entries.push({
        id: `${asset.id}:assigned`,
        kind: 'assigned',
        assetTag: tag,
        assetName: name,
        employeeName: asset.current_employee_name,
        department: asset.current_employee_department,
        status: asset.status,
        at: asset.assigned_at,
      })
    }
  }

  return entries
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit)
}

export function computeHealthTotals(
  assets: AssetInventoryRecord[],
  now: number,
): HealthTotals {
  const spareByCategory = new Map<string, number>()
  let warrantyExpiring = 0
  let underRepair = 0
  let recentlyAdded = 0
  let assignedWithoutHolder = 0

  for (const asset of assets) {
    if (isWarrantyExpiring(asset, now)) warrantyExpiring += 1
    if (asset.status === ASSET_STATUS.inRepair) underRepair += 1

    const age = daysSince(asset.created_at, now)
    if (age !== null && age <= RECENT_WINDOW_DAYS) recentlyAdded += 1

    if (asset.status === ASSET_STATUS.assigned && !asset.current_employee_id) {
      assignedWithoutHolder += 1
    }

    if (asset.status === ASSET_STATUS.inStock) {
      const category = asset.category_name?.trim() || 'Uncategorised'
      spareByCategory.set(category, (spareByCategory.get(category) ?? 0) + 1)
    }
  }

  let lowStockCategories = 0
  for (const count of spareByCategory.values()) {
    if (count < LOW_STOCK_THRESHOLD) lowStockCategories += 1
  }

  return {
    warrantyExpiring,
    lowStockCategories,
    underRepair,
    recentlyAdded,
    assignedWithoutHolder,
  }
}
