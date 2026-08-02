import { describe, expect, it } from 'vitest'

import type { AssetInventoryRecord } from '../../../types/api'

import {
  buildActivityFeed,
  computeHealthTotals,
  summariseDepartments,
} from './dashboardAggregates'

const NOW = Date.parse('2026-08-02T00:00:00.000Z')
const DAY = 86_400_000

function asset(overrides: Partial<AssetInventoryRecord>): AssetInventoryRecord {
  return {
    id: 'id-1',
    asset_tag: 'JMV-LTP-00001',
    serial_number: null,
    model: 'ThinkPad',
    status: 'in_stock',
    purchase_date: null,
    warranty_expiry: null,
    custom_fields: {},
    category_id: 'cat-1',
    category_slug: 'laptop',
    category_name: 'Laptop',
    manufacturer_id: null,
    manufacturer_name: null,
    location_id: null,
    location_code: null,
    location_name: null,
    assignment_id: null,
    assigned_at: null,
    current_employee_id: null,
    current_employee_business_id: null,
    current_employee_name: null,
    current_employee_email: null,
    current_employee_is_active: null,
    current_employee_department: null,
    created_at: new Date(NOW - 2 * DAY).toISOString(),
    updated_at: new Date(NOW - 2 * DAY).toISOString(),
    ...overrides,
  }
}

describe('summariseDepartments', () => {
  it('buckets assets by holder department and computes utilization', () => {
    const rows = [
      asset({ id: 'a', status: 'assigned', current_employee_department: 'IT' }),
      asset({ id: 'b', status: 'in_stock', current_employee_department: 'IT' }),
      asset({ id: 'c', status: 'in_repair', current_employee_department: 'IT' }),
      asset({ id: 'd', status: 'assigned', current_employee_department: 'Sales' }),
    ]

    const [it, sales] = summariseDepartments(rows, NOW)

    expect(it.department).toBe('IT')
    expect(it.total).toBe(3)
    expect(it.assigned).toBe(1)
    expect(it.inStock).toBe(1)
    expect(it.repair).toBe(1)
    expect(it.utilization).toBeCloseTo(1 / 3)

    expect(sales.department).toBe('Sales')
    expect(sales.utilization).toBe(1)
  })

  it('groups assets with no department under Unassigned', () => {
    const [row] = summariseDepartments([asset({ current_employee_department: null })], NOW)
    expect(row.department).toBe('Unassigned')
  })

  it('returns nothing for an empty inventory', () => {
    expect(summariseDepartments([], NOW)).toEqual([])
  })

  it('counts a warranty ending inside the window', () => {
    const rows = [
      asset({ current_employee_department: 'IT', warranty_expiry: new Date(NOW + 5 * DAY).toISOString() }),
      asset({ id: 'x', current_employee_department: 'IT', warranty_expiry: new Date(NOW + 120 * DAY).toISOString() }),
    ]
    expect(summariseDepartments(rows, NOW)[0].warrantyExpiring).toBe(1)
  })
})

describe('buildActivityFeed', () => {
  it('emits an added entry per asset and an assigned entry when a holder exists', () => {
    const rows = [
      asset({
        id: 'a',
        assigned_at: new Date(NOW - DAY).toISOString(),
        current_employee_name: 'Asha Rao',
        current_employee_department: 'IT',
        status: 'assigned',
      }),
    ]

    const feed = buildActivityFeed(rows, 10)
    expect(feed).toHaveLength(2)
    expect(feed[0].kind).toBe('assigned')
    expect(feed[0].employeeName).toBe('Asha Rao')
    expect(feed[1].kind).toBe('added')
  })

  it('skips the assigned entry when no holder is recorded', () => {
    const feed = buildActivityFeed([asset({ assigned_at: new Date(NOW).toISOString() })], 10)
    expect(feed.every((entry) => entry.kind === 'added')).toBe(true)
  })

  it('sorts newest first and honours the limit', () => {
    const rows = [
      asset({ id: 'old', created_at: new Date(NOW - 10 * DAY).toISOString() }),
      asset({ id: 'new', created_at: new Date(NOW - DAY).toISOString() }),
    ]
    const feed = buildActivityFeed(rows, 1)
    expect(feed).toHaveLength(1)
    expect(feed[0].assetTag).toBe('JMV-LTP-00001')
    expect(Date.parse(feed[0].at)).toBe(NOW - DAY)
  })

  it('returns an empty feed for no assets', () => {
    expect(buildActivityFeed([], 5)).toEqual([])
  })
})

describe('computeHealthTotals', () => {
  it('counts expiring warranties, repairs and recent additions', () => {
    const rows = [
      asset({ id: 'a', warranty_expiry: new Date(NOW + 10 * DAY).toISOString() }),
      asset({ id: 'b', status: 'in_repair' }),
      asset({ id: 'c', created_at: new Date(NOW - 200 * DAY).toISOString() }),
    ]

    const totals = computeHealthTotals(rows, NOW)
    expect(totals.warrantyExpiring).toBe(1)
    expect(totals.underRepair).toBe(1)
    expect(totals.recentlyAdded).toBe(2)
  })

  it('ignores warranties that already lapsed', () => {
    const totals = computeHealthTotals(
      [asset({ warranty_expiry: new Date(NOW - DAY).toISOString() })],
      NOW,
    )
    expect(totals.warrantyExpiring).toBe(0)
  })

  it('flags assigned assets with no holder on record', () => {
    const totals = computeHealthTotals(
      [asset({ status: 'assigned', current_employee_id: null })],
      NOW,
    )
    expect(totals.assignedWithoutHolder).toBe(1)
  })

  it('counts categories holding fewer than three spares', () => {
    const rows = [
      asset({ id: 'a', status: 'in_stock', category_name: 'Laptop' }),
      asset({ id: 'b', status: 'in_stock', category_name: 'Laptop' }),
      asset({ id: 'c', status: 'in_stock', category_name: 'Monitor' }),
      asset({ id: 'd', status: 'in_stock', category_name: 'Monitor' }),
      asset({ id: 'e', status: 'in_stock', category_name: 'Monitor' }),
    ]
    expect(computeHealthTotals(rows, NOW).lowStockCategories).toBe(1)
  })

  it('returns zeros for an empty inventory', () => {
    const totals = computeHealthTotals([], NOW)
    expect(totals).toEqual({
      warrantyExpiring: 0,
      lowStockCategories: 0,
      underRepair: 0,
      recentlyAdded: 0,
      assignedWithoutHolder: 0,
    })
  })
})
