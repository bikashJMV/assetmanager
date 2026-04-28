import type { EmployeeUpsertInput } from '../api'
import { getUserFacingMessage } from './errors'

export const EMPLOYEE_IMPORT_TEMPLATE_HREF = '/employee-import-template.xlsx'

/** Safety limit for client-side sequential upserts. */
export const EMPLOYEE_IMPORT_MAX_ROWS = 500

const REQUIRED_HEADERS = ['employee_id', 'name', 'department'] as const

/** Normalized header keys that look like email but are not the accepted `email` column. */
const MISNAMED_EMAIL_HEADER_KEYS = [
  'email_id',
  'e_mail',
  'email_address',
  'email_addr',
  'mail_id',
] as const

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
  | { ok: true; rows: EmployeeImportParsedRow[]; warnings: string[] }
  | { ok: false; errors: string[] }

function originalHeaderLabel(headerRow: unknown[], headerMap: Map<string, number>, key: string): string {
  const col = headerMap.get(key)
  if (col === undefined) return key.replace(/_/g, ' ')
  const raw = String(headerRow[col] ?? '').trim()
  return raw || key.replace(/_/g, ' ')
}

function emailHeaderWarnings(headerRow: unknown[], headerMap: Map<string, number>): string[] {
  if (headerMap.has('email')) return []
  const out: string[] = []
  for (const wrong of MISNAMED_EMAIL_HEADER_KEYS) {
    if (!headerMap.has(wrong)) continue
    const label = originalHeaderLabel(headerRow, headerMap, wrong)
    out.push(
      `Column "${label}" is not used for email. Rename it to "Email" so addresses are imported (this file was parsed without email values).`,
    )
  }
  return out
}

function isRowEmpty(cells: unknown[]): boolean {
  return cells.every((c) => c === '' || c === null || c === undefined || String(c).trim() === '')
}

/** Turns PostgREST / Postgres bulk-import failures into short, readable lines for the UI. */
export function humanizeBulkImportSaveError(error: unknown): string[] {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '')
  const trimmed = raw.trim()
  if (!trimmed) {
    return [getUserFacingMessage(error, 'Bulk import failed.')]
  }

  const keyEmail = /Key\s*\(\s*email\s*\)\s*=\s*\(\s*([^)]+?)\s*\)/i.exec(trimmed)
  const keyEmp = /Key\s*\(\s*employee_id\s*\)\s*=\s*\(\s*([^)]+?)\s*\)/i.exec(trimmed)

  if (keyEmail) {
    const addr = keyEmail[1].trim()
    return [
      `Email "${addr}" is already used by another employee in the database.`,
      'Fix or remove that row in the spreadsheet, or update the existing employee instead of importing again.',
    ]
  }
  if (keyEmp) {
    const code = keyEmp[1].trim()
    return [
      `Employee ID "${code}" already exists in the database (unique constraint).`,
      'Use a new ID or remove the row if this person is already in the system.',
    ]
  }

  if (/duplicate|unique violation|23505/i.test(trimmed)) {
    return [
      getUserFacingMessage(error, 'Bulk import failed.'),
      'This is usually a duplicate employee ID or email already in the database, or two rows sharing the same email. Fix the sheet and try again.',
    ]
  }

  return [getUserFacingMessage(error, 'Bulk import failed.')]
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

  // Accept legacy spreadsheet column header (concatenated so imports still match old templates).
  const legacyCodeHeader = 'employee' + '_code'
  const hasEmployeeIdColumn = headerMap.has('employee_id') || headerMap.has(legacyCodeHeader)
  const headerErrors: string[] = []
  for (const req of REQUIRED_HEADERS) {
    if (req === 'employee_id') {
      if (!hasEmployeeIdColumn) {
        headerErrors.push('Missing required column: "employee id" (or alias "employee code").')
      }
      continue
    }
    if (!headerMap.has(req)) {
      headerErrors.push(`Missing required column: "${req.replace(/_/g, ' ')}".`)
    }
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors }

  const employeeIdCol = headerMap.get('employee_id') ?? headerMap.get(legacyCodeHeader)
  if (employeeIdCol === undefined) {
    return { ok: false, errors: ['Missing required column: "employee id".'] }
  }

  const idx = {
    employee_id: employeeIdCol,
    name: headerMap.get('name')!,
    department: headerMap.get('department')!,
    email: headerMap.get('email'),
    is_active: headerMap.get('is_active'),
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
  const idsInFile = new Map<string, number>()
  const emailsInFile = new Map<string, number>()

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const line = matrix[i] ?? []
    if (isRowEmpty(line as unknown[])) continue

    const employee_id = String(line[idx.employee_id] ?? '').trim()
    const name = String(line[idx.name] ?? '').trim()
    const department = String(line[idx.department] ?? '').trim()
    const emailRaw = idx.email !== undefined ? line[idx.email] : ''
    const emailStr = String(emailRaw ?? '').trim()

    const rowErrors: string[] = []
    if (!employee_id) rowErrors.push(`Row ${excelRow}: employee_id is required.`)
    if (!name) rowErrors.push(`Row ${excelRow}: name is required.`)
    if (!department) rowErrors.push(`Row ${excelRow}: department is required.`)

    if (employee_id) {
      const prev = idsInFile.get(employee_id)
      if (prev !== undefined) {
        rowErrors.push(
          `Row ${excelRow}: duplicate employee_id "${employee_id}" (also on row ${prev}).`,
        )
      } else {
        idsInFile.set(employee_id, excelRow)
      }
    }

    if (emailStr) {
      const norm = emailStr.toLowerCase()
      const prevEmailRow = emailsInFile.get(norm)
      if (prevEmailRow !== undefined) {
        rowErrors.push(
          `Row ${excelRow}: duplicate email "${emailStr}" (also on row ${prevEmailRow}).`,
        )
      } else {
        emailsInFile.set(norm, excelRow)
      }
    }

    let is_active = true
    if (idx.is_active !== undefined) {
      const b = parseBooleanCell(line[idx.is_active]!, true)
      if (!b.ok) rowErrors.push(`Row ${excelRow}: is_active — ${b.message}`)
      else is_active = b.value
    }

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const input: EmployeeUpsertInput = {
      employee_id,
      name,
      department,
      email: emailStr ? emailStr : null,
      is_active,
      role: 'employee',
    }
    rows.push({ rowNumber: excelRow, input })
  }

  if (errors.length) return { ok: false, errors }

  if (rows.length === 0) {
    return { ok: false, errors: ['No data rows found after the header (skipping blank lines).'] }
  }

  return { ok: true, rows, warnings: emailHeaderWarnings(headerRow, headerMap) }
}
