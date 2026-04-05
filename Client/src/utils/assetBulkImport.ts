import type { AssetWriteInput } from '../api'
import { parseBooleanCell } from './employeeBulkImport'

/** Public template (Vite `public/`). */
export const ASSET_IMPORT_TEMPLATE_HREF = '/asset-import-template.xlsx'

/** Bump when columns or rules change; embedded in `metadata` on each create. */
export const ASSET_IMPORT_TEMPLATE_VERSION = 1

/** Safety limit for sequential `createAsset` calls. */
export const ASSET_IMPORT_MAX_ROWS = 500

const ALLOWLIST = new Set([
  'laptop',
  'desktop',
  'sim',
  'pen-drive',
  'monitor',
  'networking',
])

const ASSET_STATUSES = new Set([
  'in_stock',
  'assigned',
  'in_repair',
  'retired',
  'lost',
  'disposed',
])

/** Reject assignment-related columns so imports stay create-only. */
const FORBIDDEN_HEADERS = new Set([
  'employee_code',
  'assign',
  'assigned_to',
  'assignment',
  'holder',
  'holder_name',
])

type CustomMeta = {
  field_key: string
  data_type: 'text' | 'number' | 'boolean' | 'date' | 'json'
  is_required: boolean
}

/**
 * Mirrors `06_seed.sql` `custom_field_definitions` (field_key, data_type, is_required).
 */
const CUSTOM_META_BY_CATEGORY: Record<string, CustomMeta[]> = {
  laptop: [
    { field_key: 'processor', data_type: 'text', is_required: true },
    { field_key: 'generation', data_type: 'text', is_required: false },
    { field_key: 'ram_gb', data_type: 'number', is_required: false },
    { field_key: 'ram_type', data_type: 'text', is_required: false },
    { field_key: 'storage_gb', data_type: 'number', is_required: false },
    { field_key: 'storage_type', data_type: 'text', is_required: false },
    { field_key: 'mac_wifi', data_type: 'text', is_required: false },
    { field_key: 'mac_lan', data_type: 'text', is_required: false },
    { field_key: 'os', data_type: 'text', is_required: false },
    { field_key: 'host_name', data_type: 'text', is_required: false },
  ],
  desktop: [
    { field_key: 'processor', data_type: 'text', is_required: true },
    { field_key: 'generation', data_type: 'text', is_required: false },
    { field_key: 'ram_gb', data_type: 'number', is_required: false },
    { field_key: 'storage_gb', data_type: 'number', is_required: false },
    { field_key: 'storage_type', data_type: 'text', is_required: false },
    { field_key: 'mac_wifi', data_type: 'text', is_required: false },
    { field_key: 'mac_lan', data_type: 'text', is_required: false },
    { field_key: 'os', data_type: 'text', is_required: false },
    { field_key: 'host_name', data_type: 'text', is_required: false },
  ],
  sim: [
    { field_key: 'sim_number', data_type: 'text', is_required: true },
    { field_key: 'phone_number', data_type: 'text', is_required: false },
    { field_key: 'carrier', data_type: 'text', is_required: false },
    { field_key: 'plan_name', data_type: 'text', is_required: false },
    { field_key: 'imei_1', data_type: 'text', is_required: false },
    { field_key: 'imei_2', data_type: 'text', is_required: false },
    { field_key: 'sim_previously_used_by', data_type: 'text', is_required: false },
    { field_key: 'activation_date', data_type: 'date', is_required: false },
  ],
  'pen-drive': [
    { field_key: 'capacity_gb', data_type: 'number', is_required: true },
    { field_key: 'usb_type', data_type: 'text', is_required: false },
    { field_key: 'encryption_enabled', data_type: 'boolean', is_required: false },
    { field_key: 'file_system', data_type: 'text', is_required: false },
  ],
  monitor: [
    { field_key: 'monitor_size_inch', data_type: 'number', is_required: false },
    { field_key: 'resolution', data_type: 'text', is_required: false },
    { field_key: 'panel_type', data_type: 'text', is_required: false },
    { field_key: 'refresh_rate_hz', data_type: 'number', is_required: false },
  ],
  networking: [
    { field_key: 'device_type', data_type: 'text', is_required: true },
    { field_key: 'ip_address', data_type: 'text', is_required: false },
    { field_key: 'mac_lan', data_type: 'text', is_required: false },
    { field_key: 'mac_wifi', data_type: 'text', is_required: false },
    { field_key: 'firmware_version', data_type: 'text', is_required: false },
    { field_key: 'ports', data_type: 'number', is_required: false },
  ],
}

const KEYS_BY_CATEGORY = Object.fromEntries(
  Object.entries(CUSTOM_META_BY_CATEGORY).map(([slug, defs]) => [
    slug,
    new Set(defs.map((d) => d.field_key)),
  ]),
) as Record<string, Set<string>>

const ALL_CUSTOM_KEYS_SORTED = Array.from(
  new Set(Object.values(CUSTOM_META_BY_CATEGORY).flatMap((defs) => defs.map((d) => d.field_key))),
).sort((a, b) => a.localeCompare(b))

/** Core columns after optional `category_slug` (Mode A). */
export const ASSET_IMPORT_CORE_COLUMNS = [
  'manufacturer_name',
  'category_name',
  'model',
  'serial_number',
  'location_code',
  'location_name',
  'purchase_date',
  'warranty_expiry',
  'status',
  'notes',
] as const

const PLACEHOLDER_EMPTY = new Set(['', 'n/a', 'na', '—', '-'])

function normalizeHeaderCell(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function isSimCategory(slug: string): boolean {
  return slug === 'sim'
}

function isNetworkingCategory(slug: string): boolean {
  return slug === 'networking' || slug === 'network'
}

function cellTrimmed(line: unknown[], idx: number | undefined): string {
  if (idx === undefined) return ''
  return String(line[idx] ?? '').trim()
}

function isRowMeaningfullyEmpty(line: unknown[]): boolean {
  return line.every((c) => {
    const s = String(c ?? '').trim()
    return s === ''
  })
}

function coerceCustomField(
  raw: string,
  meta: CustomMeta,
  rowLabel: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const t = raw.trim()
  if (!t || PLACEHOLDER_EMPTY.has(t.toLowerCase())) {
    if (meta.is_required) return { ok: false, message: `${rowLabel}: "${meta.field_key}" is required.` }
    return { ok: true, value: undefined }
  }

  switch (meta.data_type) {
    case 'number': {
      const n = Number(t.replace(/,/g, ''))
      if (!Number.isFinite(n)) return { ok: false, message: `${rowLabel}: "${meta.field_key}" must be a number.` }
      return { ok: true, value: n }
    }
    case 'boolean': {
      const b = parseBooleanCell(t, false)
      if (!b.ok) return { ok: false, message: `${rowLabel}: "${meta.field_key}" — ${b.message}` }
      return { ok: true, value: b.value }
    }
    case 'date': {
      const iso = normalizeDateToIso(t, rowLabel, meta.field_key)
      if (!iso.ok) return iso
      return { ok: true, value: iso.value }
    }
    case 'json': {
      try {
        return { ok: true, value: JSON.parse(t) }
      } catch {
        return { ok: true, value: t }
      }
    }
    default:
      return { ok: true, value: t }
  }
}

function normalizeDateToIso(
  raw: string,
  rowLabel: string,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: true, value: t }
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return { ok: true, value: `${y}-${m}-${day}` }
  }
  return { ok: false, message: `${rowLabel}: "${field}" — use yyyy-mm-dd or a recognizable date.` }
}

export type AssetImportParsedRow = {
  rowNumber: number
  input: AssetWriteInput
}

export type AssetImportParseResult =
  | { ok: true; rows: AssetImportParsedRow[] }
  | { ok: false; errors: string[] }

export type ParseAssetImportOptions = {
  /**
   * When set (New Asset — selected standard category): file must **not** include `category_slug`;
   * every row uses this slug.
   */
  fixedCategorySlug?: string
}

/** Ordered header row for Mode B template / strict validation (no `category_slug`). */
export function getExpectedHeadersModeB(): string[] {
  return [...ASSET_IMPORT_CORE_COLUMNS, ...ALL_CUSTOM_KEYS_SORTED]
}

/** Mode A = includes `category_slug` first. */
export function getExpectedHeadersModeA(): string[] {
  return ['category_slug', ...getExpectedHeadersModeB()]
}

export function isBulkImportAllowedCategorySlug(slug: string | null | undefined): boolean {
  if (!slug || slug === 'other') return false
  return ALLOWLIST.has(slug)
}

/**
 * First row = headers. Data from row 2+. Headers: normalized like employee import.
 * Duplicate `(category_slug, serial_number)` in-file fails entire parse when serial is non-empty.
 */
export function parseAssetImportMatrix(
  matrix: unknown[][],
  options: ParseAssetImportOptions,
): AssetImportParseResult {
  if (!matrix.length) {
    return { ok: false, errors: ['The spreadsheet is empty.'] }
  }

  const fixed = options.fixedCategorySlug?.trim().toLowerCase()
  if (fixed && !ALLOWLIST.has(fixed)) {
    return { ok: false, errors: ['Bulk import is not available for this category.'] }
  }

  const headerRow = matrix[0] ?? []
  const headerMap = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const key = normalizeHeaderCell(cell)
    if (key && !headerMap.has(key)) headerMap.set(key, idx)
  })

  const hasCategoryCol = headerMap.has('category_slug')
  if (fixed) {
    if (hasCategoryCol) {
      return {
        ok: false,
        errors: [
          'This import uses the category selected on the page. Remove the "category_slug" column from the file, or use a multi-category template without a fixed category.',
        ],
      }
    }
  } else if (!hasCategoryCol) {
    return { ok: false, errors: ['Missing required column: "category_slug".'] }
  }

  const allowedHeaderSet = new Set<string>([
    ...(fixed ? [] : ['category_slug']),
    ...ASSET_IMPORT_CORE_COLUMNS,
    ...ALL_CUSTOM_KEYS_SORTED,
  ])

  const headerErrors: string[] = []
  for (const [name] of headerMap) {
    if (FORBIDDEN_HEADERS.has(name)) {
      headerErrors.push(`Column "${name}" is not allowed on asset import (assignment belongs in the app).`)
    } else if (!allowedHeaderSet.has(name)) {
      headerErrors.push(`Unknown column "${name.replace(/_/g, ' ')}". Use the sample file headers only.`)
    }
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors }

  const idx: Record<string, number | undefined> = {}
  for (const h of allowedHeaderSet) {
    const i = headerMap.get(h)
    if (i !== undefined) idx[h] = i
  }

  const dataRowCount = matrix.length - 1
  if (dataRowCount > ASSET_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      errors: [
        `Too many data rows (${dataRowCount}). Maximum is ${ASSET_IMPORT_MAX_ROWS}. Split into smaller files.`,
      ],
    }
  }

  const dupBuckets = new Map<string, number[]>()
  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const line = matrix[i] ?? []
    if (isRowMeaningfullyEmpty(line as unknown[])) continue

    const categorySlugRaw = fixed ?? cellTrimmed(line, idx.category_slug)
    const cat = categorySlugRaw.trim().toLowerCase()
    const serialRaw = cellTrimmed(line, idx.serial_number)
    if (!cat || !ALLOWLIST.has(cat) || serialRaw === '') continue

    const dupKey = `${cat}\x00${serialRaw.toLowerCase()}`
    const list = dupBuckets.get(dupKey)
    if (list) list.push(excelRow)
    else dupBuckets.set(dupKey, [excelRow])
  }

  const dupErrors: string[] = []
  for (const [, rowNums] of dupBuckets) {
    if (rowNums.length < 2) continue
    dupErrors.push(
      `Duplicate category + serial in file (rows ${rowNums.join(', ')}). Fix before importing — no rows will be saved.`,
    )
  }
  if (dupErrors.length) {
    return { ok: false, errors: dupErrors }
  }

  const rows: AssetImportParsedRow[] = []
  const errors: string[] = []

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const rowLabel = `Row ${excelRow}`
    const line = matrix[i] ?? []
    if (isRowMeaningfullyEmpty(line as unknown[])) continue

    const rowErrors: string[] = []

    const categorySlugRaw = fixed ?? cellTrimmed(line, idx.category_slug)
    const cat = categorySlugRaw.trim().toLowerCase()
    if (!cat) {
      errors.push(`${rowLabel}: category_slug is required.`)
      continue
    }
    if (!ALLOWLIST.has(cat)) {
      errors.push(
        `${rowLabel}: category "${categorySlugRaw}" is not supported in bulk import. Use a standard category from the template, or create "Other" assets with the form.`,
      )
      continue
    }

    const serialRaw = cellTrimmed(line, idx.serial_number)

    const manufacturer = cellTrimmed(line, idx.manufacturer_name)
    const model = cellTrimmed(line, idx.model)
    const locationName = cellTrimmed(line, idx.location_name)
    const serial = serialRaw
    const purchase = cellTrimmed(line, idx.purchase_date)
    const warranty = cellTrimmed(line, idx.warranty_expiry)
    const notes = cellTrimmed(line, idx.notes)
    const categoryNameOverride = cellTrimmed(line, idx.category_name)

    if (!manufacturer || PLACEHOLDER_EMPTY.has(manufacturer.toLowerCase())) {
      rowErrors.push(`${rowLabel}: manufacturer_name is required (use N/A if not applicable).`)
    }
    if (!isSimCategory(cat)) {
      if (!model || PLACEHOLDER_EMPTY.has(model.toLowerCase())) {
        rowErrors.push(`${rowLabel}: model is required (use N/A if not applicable).`)
      }
    }
    if (!locationName || PLACEHOLDER_EMPTY.has(locationName.toLowerCase())) {
      rowErrors.push(`${rowLabel}: location_name is required (use N/A if unknown).`)
    }

    if (!isNetworkingCategory(cat)) {
      if (!serial || PLACEHOLDER_EMPTY.has(serial.toLowerCase())) {
        rowErrors.push(`${rowLabel}: serial_number is required (use N/A if not available).`)
      }
      if (!purchase || PLACEHOLDER_EMPTY.has(purchase.toLowerCase())) {
        rowErrors.push(`${rowLabel}: purchase_date is required (yyyy-mm-dd or similar).`)
      } else {
        const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
        if (!d.ok) rowErrors.push(d.message)
      }
      if (!warranty || PLACEHOLDER_EMPTY.has(warranty.toLowerCase())) {
        rowErrors.push(`${rowLabel}: warranty_expiry is required (yyyy-mm-dd or similar).`)
      } else {
        const d = normalizeDateToIso(warranty, rowLabel, 'warranty_expiry')
        if (!d.ok) rowErrors.push(d.message)
      }
    } else {
      if (purchase) {
        const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
        if (!d.ok) rowErrors.push(d.message)
      }
      if (warranty) {
        const d = normalizeDateToIso(warranty, rowLabel, 'warranty_expiry')
        if (!d.ok) rowErrors.push(d.message)
      }
    }

    let statusVal = cellTrimmed(line, idx.status).toLowerCase()
    if (!statusVal) statusVal = 'in_stock'
    if (!ASSET_STATUSES.has(statusVal)) {
      rowErrors.push(
        `${rowLabel}: status must be one of: ${[...ASSET_STATUSES].join(', ')} (or leave blank for in_stock).`,
      )
    }

    const customPayload: Record<string, unknown> = {}
    const validKeys = KEYS_BY_CATEGORY[cat]!
    for (const meta of CUSTOM_META_BY_CATEGORY[cat]!) {
      const colIdx = idx[meta.field_key]
      const rawStr = cellTrimmed(line, colIdx)
      const coerced = coerceCustomField(rawStr, meta, rowLabel)
      if (!coerced.ok) {
        rowErrors.push(coerced.message)
        continue
      }
      if (coerced.value !== undefined) customPayload[meta.field_key] = coerced.value
    }

    for (const key of ALL_CUSTOM_KEYS_SORTED) {
      if (validKeys.has(key)) continue
      const colIdx = idx[key]
      const stray = cellTrimmed(line, colIdx)
      if (stray && !PLACEHOLDER_EMPTY.has(stray.toLowerCase())) {
        rowErrors.push(
          `${rowLabel}: column "${key}" is not used for category "${cat}". Leave it empty or use a multi-category file with the correct category_slug per row.`,
        )
      }
    }

    const locationCode = cellTrimmed(line, idx.location_code)
    let purchaseDateOut: string | undefined
    let warrantyOut: string | undefined
    if (purchase && !PLACEHOLDER_EMPTY.has(purchase.toLowerCase())) {
      const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
      if (d.ok) purchaseDateOut = d.value
    }
    if (warranty && !PLACEHOLDER_EMPTY.has(warranty.toLowerCase())) {
      const d = normalizeDateToIso(warranty, rowLabel, 'warranty_expiry')
      if (d.ok) warrantyOut = d.value
    }

    const metadata: Record<string, unknown> = {
      source: 'bulk_import',
      template_version: ASSET_IMPORT_TEMPLATE_VERSION,
    }
    if (notes) metadata.notes = notes

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const input: AssetWriteInput = {
      category_slug: cat,
      ...(categoryNameOverride ? { category_name: categoryNameOverride } : {}),
      manufacturer_name: manufacturer,
      model: isSimCategory(cat) ? model || undefined : model,
      serial_number: isNetworkingCategory(cat) ? serial || undefined : serial || undefined,
      location_code: locationCode || undefined,
      location_name: locationName,
      purchase_date: isNetworkingCategory(cat) ? purchaseDateOut : purchaseDateOut,
      warranty_expiry: isNetworkingCategory(cat) ? warrantyOut : warrantyOut,
      status: statusVal,
      custom_fields: customPayload,
      metadata,
    }
    rows.push({ rowNumber: excelRow, input })
  }

  if (errors.length) return { ok: false, errors }

  if (rows.length === 0) {
    return { ok: false, errors: ['No data rows found after the header (skipping blank lines).'] }
  }

  return { ok: true, rows }
}
