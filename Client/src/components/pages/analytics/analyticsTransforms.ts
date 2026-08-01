import type {
  AnalyticsMatrixCell,
  AnalyticsMonthCount,
  AnalyticsWarrantyPoint,
} from '../../../types/api'

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const MONTH_LABELS: readonly string[] = MONTH_ABBR

/** "2024-03" → "Mar 2024". Falls back to the raw key if it isn't parseable. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1

  if (!year || idx < 0 || idx >= MONTH_ABBR.length) return key

  return `${MONTH_ABBR[idx]} ${year}`
}

/** Trailing simple moving average; positions with < `window` samples are null. */
export function rollingAverage(
  values: number[],
  window: number,
): (number | null)[] {
  if (window <= 0) return values.map(() => null)

  const out: (number | null)[] = []
  let sum = 0

  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]

    out.push(i >= window - 1 ? sum / window : null)
  }

  return out
}

export type TrendLine = { slope: number; intercept: number }

/** Ordinary least-squares fit. Returns a flat line at the mean when x has no spread. */
export function linearTrend(points: AnalyticsWarrantyPoint[]): TrendLine | null {
  if (points.length < 2) return null

  const n = points.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (const p of points) {
    sumX += p.ageDays
    sumY += p.warrantyDays
    sumXY += p.ageDays * p.warrantyDays
    sumXX += p.ageDays * p.ageDays
  }

  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

export type HeatmapRow = { year: number; counts: number[] }
export type HeatmapGrid = { rows: HeatmapRow[]; max: number }

/** Dense year × 12-month grid (missing cells → 0) for the acquisition heatmap. */
export function buildHeatmapGrid(cells: AnalyticsMatrixCell[]): HeatmapGrid {
  const byYear = new Map<number, number[]>()
  let max = 0

  for (const cell of cells) {
    const row = byYear.get(cell.year) ?? new Array<number>(12).fill(0)
    row[cell.month - 1] = cell.count
    byYear.set(cell.year, row)
    if (cell.count > max) max = cell.count
  }

  const rows = Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, counts]) => ({ year, counts }))

  return { rows, max }
}

/** Attach a trailing rolling average to a monthly assignment series. */
export type AssignmentTrendPoint = {
  month: string
  label: string
  count: number
  rolling: number | null
}

export function buildAssignmentSeries(
  series: AnalyticsMonthCount[],
  window: number,
): AssignmentTrendPoint[] {
  const rolling = rollingAverage(series.map((p) => p.count), window)

  return series.map((p, i) => ({
    month: p.month,
    label: monthLabel(p.month),
    count: p.count,
    rolling: rolling[i],
  }))
}

export type InStockCategoryCount = { name: string; count: number }

export type InStockLocationGroup = {
  key: string
  /** short axis label (first address segment) */
  label: string
  /** full location name for the tooltip */
  fullLabel: string
  total: number
  categories: InStockCategoryCount[]
}

export const NO_LOCATION_LABEL = 'No location set'
/** Bars past this fold into "Other" so the axis stays readable. */
export const IN_STOCK_LOCATION_LIMIT = 11

/** Long site names are full addresses; the axis only gets the leading segment. */
export function shortLocationLabel(name: string): string {
  const head = name.split(',')[0]?.trim() ?? name
  return head.length > 24 ? `${head.slice(0, 23)}…` : head
}

type InStockAsset = {
  status: string
  location_id: string | null
  location_name: string | null
  category_name: string | null
}

function sortedCategories(counts: Map<string, number>): InStockCategoryCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * In-stock assets grouped by stock location, each with its category breakdown.
 * Assets are only counted when `status === 'in_stock'`; everything past
 * IN_STOCK_LOCATION_LIMIT collapses into a single "Other" bar.
 */
export function groupInStockByLocation(assets: InStockAsset[]): InStockLocationGroup[] {
  const buckets = new Map<string, { fullLabel: string; categories: Map<string, number> }>()

  for (const asset of assets) {
    if (asset.status !== 'in_stock') continue
    const key = asset.location_id ?? ''
    const fullLabel = asset.location_name?.trim() || NO_LOCATION_LABEL
    const bucket = buckets.get(key) ?? { fullLabel, categories: new Map<string, number>() }
    const category = asset.category_name?.trim() || 'Uncategorized'
    bucket.categories.set(category, (bucket.categories.get(category) ?? 0) + 1)
    buckets.set(key, bucket)
  }

  const groups: InStockLocationGroup[] = [...buckets.entries()]
    .map(([key, bucket]) => {
      const categories = sortedCategories(bucket.categories)
      return {
        key,
        label: shortLocationLabel(bucket.fullLabel),
        fullLabel: bucket.fullLabel,
        total: categories.reduce((sum, c) => sum + c.count, 0),
        categories,
      }
    })
    .sort((a, b) => b.total - a.total || a.fullLabel.localeCompare(b.fullLabel))

  if (groups.length <= IN_STOCK_LOCATION_LIMIT) return groups

  const head = groups.slice(0, IN_STOCK_LOCATION_LIMIT)
  const tail = groups.slice(IN_STOCK_LOCATION_LIMIT)
  const merged = new Map<string, number>()
  for (const group of tail) {
    for (const category of group.categories) {
      merged.set(category.name, (merged.get(category.name) ?? 0) + category.count)
    }
  }

  return [
    ...head,
    {
      key: '__other__',
      label: 'Other',
      fullLabel: `Other (${tail.length} locations)`,
      total: tail.reduce((sum, g) => sum + g.total, 0),
      categories: sortedCategories(merged),
    },
  ]
}
