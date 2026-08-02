import type { AnalyticsMonthCount } from '../../../types/api'

export const BAR_COUNT = 12

/** Scales the most recent months against the peak so the wall bars read 0–1. */
export function normalizeBars(points: AnalyticsMonthCount[]): number[] {
  if (points.length === 0) return []
  const recent = points.slice(-BAR_COUNT)
  const peak = recent.reduce((max, point) => Math.max(max, point.count), 0)
  if (peak <= 0) return recent.map(() => 0)
  return recent.map((point) => point.count / peak)
}

/** Same normalization for the category fallback used when monthly data is unavailable. */
export function normalizeCounts(counts: number[]): number[] {
  const slice = counts.slice(0, BAR_COUNT)
  const peak = slice.reduce((max, value) => Math.max(max, value), 0)
  if (peak <= 0) return slice.map(() => 0)
  return slice.map((value) => value / peak)
}
