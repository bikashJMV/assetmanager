import { describe, expect, it } from 'vitest'

import {
  buildAssignmentSeries,
  buildHeatmapGrid,
  groupInStockByLocation,
  IN_STOCK_LOCATION_LIMIT,
  linearTrend,
  monthLabel,
  NO_LOCATION_LABEL,
  rollingAverage,
  shortLocationLabel,
} from './analyticsTransforms'

describe('monthLabel', () => {
  it('formats an ISO month key as abbreviated month + year', () => {
    expect(monthLabel('2024-03')).toBe('Mar 2024')
  })

  it('returns the raw key when the month is out of range', () => {
    expect(monthLabel('2024-13')).toBe('2024-13')
  })
})

describe('rollingAverage', () => {
  it('is null until the window is filled, then trails the mean', () => {
    expect(rollingAverage([2, 4, 6, 8], 3)).toEqual([null, null, 4, 6])
  })

  it('returns all nulls for a non-positive window', () => {
    expect(rollingAverage([1, 2, 3], 0)).toEqual([null, null, null])
  })
})

describe('linearTrend', () => {
  it('returns null with fewer than two points', () => {
    expect(linearTrend([{ ageDays: 1, warrantyDays: 1 }])).toBeNull()
  })

  it('recovers a perfect linear relationship', () => {
    const trend = linearTrend([
      { ageDays: 0, warrantyDays: 0 },
      { ageDays: 1, warrantyDays: 2 },
      { ageDays: 2, warrantyDays: 4 },
    ])

    expect(trend?.slope).toBeCloseTo(2)
    expect(trend?.intercept).toBeCloseTo(0)
  })

  it('flattens to the mean when x has no spread', () => {
    const trend = linearTrend([
      { ageDays: 5, warrantyDays: 10 },
      { ageDays: 5, warrantyDays: 20 },
    ])

    expect(trend).toEqual({ slope: 0, intercept: 15 })
  })
})

describe('buildHeatmapGrid', () => {
  it('produces dense 12-month rows sorted newest year first', () => {
    const grid = buildHeatmapGrid([
      { year: 2023, month: 1, count: 3 },
      { year: 2024, month: 12, count: 5 },
    ])

    expect(grid.max).toBe(5)
    expect(grid.rows.map((r) => r.year)).toEqual([2024, 2023])
    expect(grid.rows[0].counts).toHaveLength(12)
    expect(grid.rows[0].counts[11]).toBe(5)
    expect(grid.rows[1].counts[0]).toBe(3)
  })

  it('returns an empty grid with zero max for no cells', () => {
    expect(buildHeatmapGrid([])).toEqual({ rows: [], max: 0 })
  })
})

describe('buildAssignmentSeries', () => {
  it('labels each month and attaches the trailing rolling average', () => {
    const series = buildAssignmentSeries(
      [
        { month: '2025-01', count: 2 },
        { month: '2025-02', count: 4 },
        { month: '2025-03', count: 6 },
      ],
      2,
    )

    expect(series[0]).toEqual({
      month: '2025-01',
      label: 'Jan 2025',
      count: 2,
      rolling: null,
    })
    expect(series[2].rolling).toBe(5)
  })
})

describe('shortLocationLabel', () => {
  it('keeps only the leading address segment', () => {
    expect(shortLocationLabel('JMV LPS LTD, W-50, Sector-11, Noida')).toBe('JMV LPS LTD')
  })

  it('truncates a long leading segment with an ellipsis', () => {
    expect(shortLocationLabel('A'.repeat(40))).toBe(`${'A'.repeat(23)}…`)
  })
})

describe('groupInStockByLocation', () => {
  const asset = (over: Partial<Parameters<typeof groupInStockByLocation>[0][number]> = {}) => ({
    status: 'in_stock',
    location_id: 'loc-1',
    location_name: 'Noida Store, Sector-11',
    category_name: 'Laptop',
    ...over,
  })

  it('counts only in-stock assets', () => {
    const groups = groupInStockByLocation([asset(), asset({ status: 'assigned' }), asset({ status: 'retired' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(1)
  })

  it('breaks each location down by category, highest count first', () => {
    const groups = groupInStockByLocation([
      asset({ category_name: 'Monitor' }),
      asset({ category_name: 'Laptop' }),
      asset({ category_name: 'Laptop' }),
    ])
    expect(groups[0].categories).toEqual([
      { name: 'Laptop', count: 2 },
      { name: 'Monitor', count: 1 },
    ])
  })

  it('buckets assets with no location under a single labelled group', () => {
    const groups = groupInStockByLocation([asset({ location_id: null, location_name: null })])
    expect(groups[0].fullLabel).toBe(NO_LOCATION_LABEL)
    expect(groups[0].key).toBe('')
  })

  it('labels a missing category as Uncategorized', () => {
    const groups = groupInStockByLocation([asset({ category_name: null })])
    expect(groups[0].categories).toEqual([{ name: 'Uncategorized', count: 1 }])
  })

  it('sorts locations by descending total', () => {
    const groups = groupInStockByLocation([
      asset({ location_id: 'a', location_name: 'A' }),
      asset({ location_id: 'b', location_name: 'B' }),
      asset({ location_id: 'b', location_name: 'B' }),
    ])
    expect(groups.map((g) => g.fullLabel)).toEqual(['B', 'A'])
  })

  it('folds locations past the limit into a single Other bar', () => {
    const many = Array.from({ length: IN_STOCK_LOCATION_LIMIT + 3 }, (_, i) =>
      asset({ location_id: `loc-${i}`, location_name: `Site ${i}` }),
    )
    const groups = groupInStockByLocation(many)
    expect(groups).toHaveLength(IN_STOCK_LOCATION_LIMIT + 1)
    const other = groups[groups.length - 1]
    expect(other.label).toBe('Other')
    expect(other.total).toBe(3)
  })

  it('returns nothing when no asset is in stock', () => {
    expect(groupInStockByLocation([asset({ status: 'assigned' })])).toEqual([])
  })
})
