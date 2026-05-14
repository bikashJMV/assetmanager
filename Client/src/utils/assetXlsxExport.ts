/**
 * assetXlsxExport.ts
 *
 * Builds a clean, formatted .xlsx workbook from the asset export JSON payload.
 * Uses @e965/xlsx (SheetJS community fork) which is already a project dependency.
 *
 * Rules:
 *  - Missing / null values → "-"
 *  - Custom fields expanded alphabetically as separate columns
 *  - Status labels are human-readable (e.g. "in_stock" → "In Stock")
 *  - Export Date is today's date (UTC), same for every row
 */

import * as XLSX from '@e965/xlsx'

export type AssetExportRow = {
  asset_tag: string | null
  category_name: string | null
  manufacturer_name: string | null
  model: string | null
  serial_number: string | null
  status: string | null
  location_name: string | null
  purchase_date: string | null
  warranty_expiry: string | null
  current_employee_name: string | null
  current_employee_business_id: string | null
  current_employee_department: string | null
  current_employee_is_active: boolean | null
  custom_fields: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY = '-'

function safeStr(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value).trim() || EMPTY
}

function formatStatus(raw: string | null): string {
  if (!raw) return EMPTY
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatActive(value: boolean | null): string {
  if (value === null || value === undefined) return EMPTY
  return value ? 'Yes' : 'No'
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!
}

/** Collect all unique custom field keys across all rows, sorted alphabetically. */
function collectCustomFieldKeys(rows: AssetExportRow[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.custom_fields && typeof row.custom_fields === 'object') {
      for (const key of Object.keys(row.custom_fields)) {
        keys.add(key)
      }
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b))
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Builds a .xlsx Blob from an array of asset export rows.
 * Returns a Blob ready to be downloaded by the browser.
 */
export function buildAssetsXlsx(rows: AssetExportRow[]): Blob {
  const customKeys = collectCustomFieldKeys(rows)
  const exportDate = todayIso()

  // Build header row (human-readable labels)
  const headers: string[] = [
    'Asset Tag',
    'Category',
    'Manufacturer',
    'Model',
    'Serial Number',
    'Status',
    'Location',
    'Purchase Date',
    'Warranty Expiry',
    'Current Holder',
    'Employee ID',
    'Department',
    'Holder Active',
    // Custom fields (alphabetical)
    ...customKeys.map((k) =>
      k
        .split(/[_\s]+/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' '),
    ),
    'Export Date',
  ]

  // Build data rows
  const dataRows: string[][] = rows.map((row) => {
    const customValues = customKeys.map((key) => {
      const val = row.custom_fields?.[key]
      return safeStr(val)
    })

    return [
      safeStr(row.asset_tag),
      safeStr(row.category_name),
      safeStr(row.manufacturer_name),
      safeStr(row.model),
      safeStr(row.serial_number),
      formatStatus(row.status),
      safeStr(row.location_name),
      safeStr(row.purchase_date),
      safeStr(row.warranty_expiry),
      safeStr(row.current_employee_name),
      safeStr(row.current_employee_business_id),
      safeStr(row.current_employee_department),
      formatActive(row.current_employee_is_active),
      ...customValues,
      exportDate,
    ]
  })

  // Assemble worksheet data: header first, then data rows
  const wsData = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Bold the header row
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue
    ws[cellAddress].s = { font: { bold: true } }
  }

  // Set column widths (auto-approximate based on header length)
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }))

  // Build workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Assets')

  // Write to ArrayBuffer → Blob
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
