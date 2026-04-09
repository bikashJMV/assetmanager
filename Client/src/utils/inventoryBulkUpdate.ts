/** Safety limit for sequential bulk inventory update calls. */
export const INVENTORY_UPDATE_MAX_ROWS = 500

export const INVENTORY_UPDATE_TEMPLATE_HREF = '/inventory-update-template.xlsx'

export type InventoryAction =
  | 'assigned'
  | 'returned'
  | 'in_stock'
  | 'in_repair'
  | 'retired'
  | 'lost'
  | 'disposed'

const ACTION_ALIASES: Record<string, InventoryAction> = {
  assigned: 'assigned',
  assign: 'assigned',
  returned: 'returned',
  return: 'returned',
  'in stock': 'in_stock',
  in_stock: 'in_stock',
  stock: 'in_stock',
  'in repair': 'in_repair',
  in_repair: 'in_repair',
  repair: 'in_repair',
  retired: 'retired',
  lost: 'lost',
  disposed: 'disposed',
}

const ASSIGNMENT_ACTIONS: ReadonlySet<InventoryAction> = new Set(['assigned', 'returned'])
const LIFECYCLE_ACTIONS: ReadonlySet<InventoryAction> = new Set([
  'in_stock',
  'in_repair',
  'retired',
  'lost',
  'disposed',
])

export function isAssignmentAction(action: InventoryAction): boolean {
  return ASSIGNMENT_ACTIONS.has(action)
}

export function isLifecycleAction(action: InventoryAction): boolean {
  return LIFECYCLE_ACTIONS.has(action)
}

export type InventoryUpdateParsedRow = {
  rowNumber: number
  assetTag: string
  action: InventoryAction
  assignee: string
  comment: string
}

export type InventoryUpdateParseResult =
  | { ok: true; rows: InventoryUpdateParsedRow[] }
  | { ok: false; errors: string[] }

const REQUIRED_HEADERS = ['asset_tag', 'inventory_status'] as const

function normalizeHeaderCell(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\]+/g, '_')
}

const HEADER_ALIASES: Record<string, string> = {
  asset_id: 'asset_tag',
  asset_code: 'asset_tag',
  tag: 'asset_tag',
  inventory_status: 'inventory_status',
  status: 'inventory_status',
  action: 'inventory_status',
  employee_code: 'assignee',
  employee_code_or_email: 'assignee',
  employee_code_email: 'assignee',
  email: 'assignee',
  assignee: 'assignee',
  emp_tag: 'assignee',
  employee: 'assignee',
  comment: 'comment',
  comments: 'comment',
  notes: 'comment',
  note: 'comment',
}

function resolveHeader(cell: unknown): string {
  const key = normalizeHeaderCell(cell)
  return HEADER_ALIASES[key] ?? key
}

function isRowEmpty(cells: unknown[]): boolean {
  return cells.every(
    (c) => c === '' || c === null || c === undefined || String(c).trim() === '',
  )
}

export function parseInventoryUpdateMatrix(
  matrix: unknown[][],
): InventoryUpdateParseResult {
  if (!matrix.length) {
    return { ok: false, errors: ['The spreadsheet is empty.'] }
  }

  const headerRow = matrix[0] ?? []
  const headerMap = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const key = resolveHeader(cell)
    if (key && !headerMap.has(key)) headerMap.set(key, idx)
  })

  const headerErrors: string[] = []
  for (const req of REQUIRED_HEADERS) {
    if (!headerMap.has(req)) {
      headerErrors.push(
        `Missing required column: "${req.replace(/_/g, ' ')}".`,
      )
    }
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors }

  const idx = {
    asset_tag: headerMap.get('asset_tag')!,
    inventory_status: headerMap.get('inventory_status')!,
    assignee: headerMap.get('assignee'),
    comment: headerMap.get('comment'),
  }

  const dataRowCount = matrix.length - 1
  if (dataRowCount > INVENTORY_UPDATE_MAX_ROWS) {
    return {
      ok: false,
      errors: [
        `Too many data rows (${dataRowCount}). Maximum is ${INVENTORY_UPDATE_MAX_ROWS}. Split into smaller files.`,
      ],
    }
  }

  const rows: InventoryUpdateParsedRow[] = []
  const errors: string[] = []
  const tagsInFile = new Map<string, number>()

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const line = matrix[i] ?? []
    if (isRowEmpty(line as unknown[])) continue

    const assetTag = String(line[idx.asset_tag] ?? '').trim()
    const rawStatus = String(line[idx.inventory_status] ?? '').trim()
    const assignee =
      idx.assignee !== undefined
        ? String(line[idx.assignee] ?? '').trim()
        : ''
    const comment =
      idx.comment !== undefined
        ? String(line[idx.comment] ?? '').trim()
        : ''

    const rowLabel = `Row ${excelRow}`

    if (!assetTag) {
      errors.push(`${rowLabel}: asset_tag is required.`)
      return { ok: false, errors }
    }

    const action = ACTION_ALIASES[rawStatus.toLowerCase()]
    if (!action) {
      errors.push(
        `${rowLabel}: unrecognized inventory status "${rawStatus}". Allowed: Assigned, Returned, In Stock, In Repair, Retired, Lost, Disposed.`,
      )
      return { ok: false, errors }
    }

    const prevRow = tagsInFile.get(assetTag.toUpperCase())
    if (prevRow !== undefined) {
      errors.push(
        `${rowLabel}: duplicate asset_tag "${assetTag}" (also on row ${prevRow}). Each asset can appear only once per file.`,
      )
      return { ok: false, errors }
    }
    tagsInFile.set(assetTag.toUpperCase(), excelRow)

    if (action === 'assigned' && !assignee) {
      errors.push(
        `${rowLabel}: "Assigned" requires an employee code or email in the assignee column.`,
      )
      return { ok: false, errors }
    }

    if (action === 'returned' && assignee) {
      errors.push(
        `${rowLabel}: "Returned" must not have an assignee. Leave the assignee column empty for returns.`,
      )
      return { ok: false, errors }
    }

    if (isLifecycleAction(action) && assignee) {
      errors.push(
        `${rowLabel}: lifecycle status "${rawStatus}" must not have an assignee. Leave the assignee column empty.`,
      )
      return { ok: false, errors }
    }

    rows.push({ rowNumber: excelRow, assetTag, action, assignee, comment })
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        'No data rows found after the header (skipping blank lines).',
      ],
    }
  }

  return { ok: true, rows }
}
