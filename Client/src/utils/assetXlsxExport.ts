import * as XLSX from '@e965/xlsx'

export type AssetExportRow = {
  asset_tag: string | null
  category_name: string | null
  manufacturer_name: string | null
  model: string | null
  serial_number: string | null
  status: string | null
  location_name: string | null
  asset_department_name: string | null
  purchase_date: string | null
  warranty_expiry: string | null
  current_employee_name: string | null
  current_employee_business_id: string | null
  current_employee_department: string | null
  assigned_at: string | null
  custom_fields: Record<string, unknown> | null
}

export type AssetHistoryRow = {
  asset_tag: string | null
  employee_name: string | null
  employee_id: string | null
  department: string | null
  assigned_at: string | null
  returned_at: string | null
  source: string | null
  notes: string | null
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

function collectCustomFieldKeys(rows: AssetExportRow[]): string[] {
  // Normalise to lowercase so "Ram" and "ram" don't produce two identical header columns.
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.custom_fields && typeof row.custom_fields === 'object') {
      for (const key of Object.keys(row.custom_fields)) {
        keys.add(key.toLowerCase())
      }
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b))
}

function titleCase(key: string): string {
  return key
    .split(/[_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function custodyDays(assignedAt: string | null, returnedAt: string | null, exportedAt: string): number | string {
  if (!assignedAt) return EMPTY
  const end = returnedAt ? new Date(returnedAt) : new Date(exportedAt)
  const start = new Date(assignedAt)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

function applyHeaderStyle(ws: XLSX.WorkSheet, headerRow = 0): void {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let col = range.s.c; col <= range.e.c; col++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c: col })
    if (!ws[addr]) continue
    ws[addr].s = {
      font: { bold: true },
      fill: { patternType: 'solid', fgColor: { rgb: 'D6E4F7' } },
    }
  }
}

function dataAwareWidths(headers: string[], dataRows: (string | number)[][], minWidths: number[]): XLSX.ColInfo[] {
  return headers.map((h, colIdx) => {
    const minW = minWidths[colIdx] ?? Math.max(h.length + 4, 14)
    const dataMax = dataRows.reduce((m, r) => Math.max(m, String(r[colIdx] ?? '').length), 0)
    return { wch: Math.min(Math.max(minW, dataMax + 2), 60) }
  })
}

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------

function buildAssetsSheet(rows: AssetExportRow[], exportedAt: string): XLSX.WorkSheet {
  const customKeys = collectCustomFieldKeys(rows)

  const headers: string[] = [
    'Asset Tag',
    'Category',
    'Manufacturer',
    'Model',
    'Serial Number',
    'Status',
    'Location',
    'Asset Department',
    'Purchase Date',
    'Warranty Expiry',
    'Current Holder',
    'Holder Employee ID',
    'Holder Department',
    'Custody Start',
    ...customKeys.map(titleCase),
    'Export Date',
  ]

  const MIN_WIDTHS = [16, 18, 18, 20, 20, 14, 20, 22, 16, 16, 28, 20, 22, 16]
  // custom fields min width filled dynamically below, Export Date = 16
  const customMins = customKeys.map((k) => Math.max(titleCase(k).length + 4, 18))
  const allMins = [...MIN_WIDTHS, ...customMins, 16]

  const dataRows: (string | number)[][] = rows.map((row) => {
    const customValues = customKeys.map((key) => {
      if (!row.custom_fields) return EMPTY
      // Keys are normalised to lowercase; find the matching entry case-insensitively.
      const match = Object.keys(row.custom_fields).find((k) => k.toLowerCase() === key)
      return match !== undefined ? safeStr(row.custom_fields[match]) : EMPTY
    })
    return [
      safeStr(row.asset_tag),
      safeStr(row.category_name),
      safeStr(row.manufacturer_name),
      safeStr(row.model),
      safeStr(row.serial_number),
      formatStatus(row.status),
      safeStr(row.location_name),
      safeStr(row.asset_department_name),
      safeStr(row.purchase_date),
      safeStr(row.warranty_expiry),
      safeStr(row.current_employee_name),
      safeStr(row.current_employee_business_id),
      safeStr(row.current_employee_department),
      safeStr(row.assigned_at),
      ...customValues,
      exportedAt,
    ]
  })

  // Row 0 = "Asset Manager" title, Row 1 = column headers, Row 2+ = data
  const ws = XLSX.utils.aoa_to_sheet([['Asset Manager'], headers, ...dataRows])

  // Merge the title across all columns
  const lastCol = headers.length - 1
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }]

  // Style the title cell
  if (ws['A1']) {
    ws['A1'].s = {
      font: { bold: true, sz: 14, color: { rgb: 'E07B00' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
  }

  // Freeze below the header row (row 2)
  ws['!freeze'] = { xSplit: 0, ySplit: 2 }

  // Auto-filter starts at the header row
  const headerRowRef = `A2:${XLSX.utils.encode_col(lastCol)}2`
  ws['!autofilter'] = { ref: headerRowRef }

  ws['!cols'] = dataAwareWidths(headers, dataRows, allMins)
  applyHeaderStyle(ws, 1)
  return ws
}

function buildHistorySheet(historyRows: AssetHistoryRow[], exportedAt: string): XLSX.WorkSheet {
  const headers = [
    'Asset Tag',
    'Employee Name',
    'Employee ID',
    'Department',
    'Assigned At',
    'Returned At',
    'Custody Days',
    'Source',
    'Notes',
  ]

  const dataRows: (string | number)[][] = historyRows.map((r) => [
    safeStr(r.asset_tag),
    safeStr(r.employee_name),
    safeStr(r.employee_id),
    safeStr(r.department),
    safeStr(r.assigned_at),
    r.returned_at ? safeStr(r.returned_at) : 'Active',
    custodyDays(r.assigned_at, r.returned_at, exportedAt),
    safeStr(r.source),
    safeStr(r.notes),
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }
  ws['!cols'] = [16, 28, 20, 22, 16, 16, 14, 16, 30].map((wch) => ({ wch }))
  applyHeaderStyle(ws)
  return ws
}

function buildExportInfoSheet(
  exportedAt: string,
  exportedBy: string,
  totalAssets: number,
  totalAssignments: number,
): XLSX.WorkSheet {
  const data = [
    ['Exported By', exportedBy],
    ['Export Date (UTC)', exportedAt],
    ['Total Assets', totalAssets],
    ['Total Assignment Records', totalAssignments],
    ['Schema Version', '2.0'],
    ['System', 'Asset Manager'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }]
  return ws
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildAssetsXlsx(
  rows: AssetExportRow[],
  exportedAt: string,
  historyRows: AssetHistoryRow[],
  exportedBy: string,
): Blob {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, buildAssetsSheet(rows, exportedAt), 'Assets')
  XLSX.utils.book_append_sheet(wb, buildHistorySheet(historyRows, exportedAt), 'Assignment History')
  XLSX.utils.book_append_sheet(
    wb,
    buildExportInfoSheet(exportedAt, exportedBy, rows.length, historyRows.length),
    'Export Info',
  )

  const buffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
