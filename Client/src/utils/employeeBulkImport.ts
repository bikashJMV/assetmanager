import type { EmployeeUpsertInput } from '../api'

export const EMPLOYEE_IMPORT_TEMPLATE_HREF = '/employee-import-template.xlsx'

/** Safety limit for client-side sequential upserts. */
export const EMPLOYEE_IMPORT_MAX_ROWS = 500

const REQUIRED_HEADERS = ['employee_code', 'name', 'department'] as const

function normalizeHeaderCell(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function parseBooleanCell(
  value: unknown,
  defaultValue: boolean,
): { ok: true; value: boolean } | { ok: false; message: string } {
  if (value === '' || value === null || value === undefined) {
    return { ok: true, value: defaultValue }
  }
  if (typeof value === 'boolean') return { ok: true, value: value }
  if (typeof value === 'number') {
    if (value === 1) return { ok: true, value: true }
    if (value === 0) return { ok: true, value: false }
  }
  const s = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(s)) return { ok: true, value: true }
  if (['false', '0', 'no', 'n'].includes(s)) return { ok: true, value: false }
  return { ok: false, message: `Expected true/false, got "${String(value)}"` }
}

export type EmployeeImportParsedRow = {
  rowNumber: number
  input: EmployeeUpsertInput
}

export type EmployeeImportParseResult =
  | { ok: true; rows: EmployeeImportParsedRow[] }
  | { ok: false; errors: string[] }

function isRowEmpty(cells: unknown[]): boolean {
  return cells.every((c) => c === '' || c === null || c === undefined || String(c).trim() === '')
}

/**
 * First row = headers. Remaining rows = data. Headers are matched case-insensitively with spaces → underscores.
 */
export function parseEmployeeImportMatrix(matrix: unknown[][]): EmployeeImportParseResult {
  if (!matrix.length) {
    return { ok: false, errors: ['The spreadsheet is empty.'] }
  }

  const headerRow = matrix[0] ?? []
  const headerMap = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const key = normalizeHeaderCell(cell)
    if (key && !headerMap.has(key)) headerMap.set(key, idx)
  })

  const headerErrors: string[] = []
  for (const req of REQUIRED_HEADERS) {
    if (!headerMap.has(req)) {
      headerErrors.push(`Missing required column: "${req.replace(/_/g, ' ')}".`)
    }
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors }

  const idx = {
    employee_code: headerMap.get('employee_code')!,
    name: headerMap.get('name')!,
    department: headerMap.get('department')!,
    email: headerMap.get('email'),
    is_active: headerMap.get('is_active'),
    erp_active: headerMap.get('erp_active'),
  }

  const dataRowCount = matrix.length - 1
  if (dataRowCount > EMPLOYEE_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      errors: [
        `Too many data rows (${dataRowCount}). Maximum is ${EMPLOYEE_IMPORT_MAX_ROWS}. Split into smaller files.`,
      ],
    }
  }

  const rows: EmployeeImportParsedRow[] = []
  const errors: string[] = []
  const codesInFile = new Map<string, number>()

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const line = matrix[i] ?? []
    if (isRowEmpty(line as unknown[])) continue

    const employee_code = String(line[idx.employee_code] ?? '').trim()
    const name = String(line[idx.name] ?? '').trim()
    const department = String(line[idx.department] ?? '').trim()
    const emailRaw = idx.email !== undefined ? line[idx.email] : ''
    const emailStr = String(emailRaw ?? '').trim()

    const rowErrors: string[] = []
    if (!employee_code) rowErrors.push(`Row ${excelRow}: employee_code is required.`)
    if (!name) rowErrors.push(`Row ${excelRow}: name is required.`)
    if (!department) rowErrors.push(`Row ${excelRow}: department is required.`)

    if (employee_code) {
      const prev = codesInFile.get(employee_code)
      if (prev !== undefined) {
        rowErrors.push(
          `Row ${excelRow}: duplicate employee_code "${employee_code}" (also on row ${prev}).`,
        )
      } else {
        codesInFile.set(employee_code, excelRow)
      }
    }

    let is_active = true
    if (idx.is_active !== undefined) {
      const b = parseBooleanCell(line[idx.is_active]!, true)
      if (!b.ok) rowErrors.push(`Row ${excelRow}: is_active — ${b.message}`)
      else is_active = b.value
    }

    let erp_active = true
    if (idx.erp_active !== undefined) {
      const b = parseBooleanCell(line[idx.erp_active]!, true)
      if (!b.ok) rowErrors.push(`Row ${excelRow}: erp_active — ${b.message}`)
      else erp_active = b.value
    }

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const input: EmployeeUpsertInput = {
      employee_code,
      name,
      department,
      email: emailStr ? emailStr : null,
      is_active,
      erp_active,
      role: 'employee',
    }
    rows.push({ rowNumber: excelRow, input })
  }

  if (errors.length) return { ok: false, errors }

  if (rows.length === 0) {
    return { ok: false, errors: ['No data rows found after the header (skipping blank lines).'] }
  }

  return { ok: true, rows }
}
