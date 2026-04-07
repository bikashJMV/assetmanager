import type { AssetWriteInput } from '../api'
import { parseBooleanCell } from './employeeBulkImport'

/** Public template (Vite `public/`). */
export const ASSET_IMPORT_TEMPLATE_HREF = '/asset-import-template.xlsx'

/** Bump when columns or rules change; embedded in `metadata` on each create. */
export const ASSET_IMPORT_TEMPLATE_VERSION = 2

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

const HEADER_ALIASES: Record<string, string> = {
  manufacturer: 'manufacturer_name',
  location: 'location_name',
}

const CUSTOM_PREFIX = 'custom_'

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

const CUSTOM_TYPE_HINT = new Map<string, CustomMeta['data_type']>()
for (const defs of Object.values(CUSTOM_META_BY_CATEGORY)) {
  for (const d of defs) {
    if (!CUSTOM_TYPE_HINT.has(d.field_key)) CUSTOM_TYPE_HINT.set(d.field_key, d.data_type)
  }
}

/** Core columns after optional category columns. */
export const ASSET_IMPORT_CORE_COLUMNS = [
  'manufacturer_name',
  'category_name',
  'category_slug',
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
  const key = String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return HEADER_ALIASES[key] ?? key
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

function isCellEmpty(raw: string): boolean {
  return PLACEHOLDER_EMPTY.has(raw.trim().toLowerCase())
}

function isRowMeaningfullyEmpty(line: unknown[]): boolean {
  return line.every((c) => {
    const s = String(c ?? '').trim()
    return s === ''
  })
}

function coerceByType(
  raw: string,
  dataType: CustomMeta['data_type'],
  rowLabel: string,
  fieldKey: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const t = raw.trim()
  if (!t || isCellEmpty(t)) return { ok: true, value: undefined }

  switch (dataType) {
    case 'number': {
      const n = Number(t.replace(/,/g, ''))
      if (!Number.isFinite(n)) return { ok: false, message: `${rowLabel}: "${fieldKey}" must be a number.` }
      return { ok: true, value: n }
    }
    case 'boolean': {
      const b = parseBooleanCell(t, false)
      if (!b.ok) return { ok: false, message: `${rowLabel}: "${fieldKey}" — ${b.message}` }
      return { ok: true, value: b.value }
    }
    case 'date': {
      const iso = normalizeDateToIso(t, rowLabel, fieldKey)
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
  /** Fallback category when sheet omits both `category_slug` and `category_name`. */
  defaultCategorySlug?: string
}

export function getExpectedHeadersModeB(): string[] {
  return [...ASSET_IMPORT_CORE_COLUMNS.filter((k) => k !== 'category_slug'), ...ALL_CUSTOM_KEYS_SORTED]
}

export function getExpectedHeadersModeA(): string[] {
  return [...ASSET_IMPORT_CORE_COLUMNS, ...ALL_CUSTOM_KEYS_SORTED]
}

export function isBulkImportAllowedCategorySlug(slug: string | null | undefined): boolean {
  if (!slug || slug === 'other') return false
  return ALLOWLIST.has(slug)
}

function resolveCategoryForRow(
  line: unknown[],
  idx: Record<string, number | undefined>,
  defaultCategorySlug: string | undefined,
): { slug: string; displayName?: string } | { error: string } {
  const slugRaw = cellTrimmed(line, idx.category_slug)
  const nameRaw = cellTrimmed(line, idx.category_name)

  if (slugRaw) {
    return {
      slug: slugify(slugRaw),
      ...(nameRaw ? { displayName: nameRaw } : {}),
    }
  }
  if (nameRaw) {
    const slug = slugify(nameRaw)
    if (!slug) return { error: 'category_name is invalid.' }
    return { slug, displayName: nameRaw }
  }
  if (defaultCategorySlug) {
    return { slug: defaultCategorySlug }
  }
  return { error: 'category_slug or category_name is required.' }
}

/**
 * First row = headers. Data from row 2+. Headers are normalized (lowercase, spaces => underscores).
 * Known-category rows enforce strict seeded custom fields. Unknown categories can use `custom_*` columns.
 */
export function parseAssetImportMatrix(
  matrix: unknown[][],
  options: ParseAssetImportOptions,
): AssetImportParseResult {
  if (!matrix.length) {
    return { ok: false, errors: ['The spreadsheet is empty.'] }
  }

  const fallback = options.defaultCategorySlug?.trim().toLowerCase()
  if (fallback && fallback !== 'other' && !fallback.match(/^[a-z0-9-]+$/)) {
    return { ok: false, errors: ['Invalid fallback category on import page.'] }
  }

  const headerRow = matrix[0] ?? []
  const headerMap = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const key = normalizeHeaderCell(cell)
    if (key && !headerMap.has(key)) headerMap.set(key, idx)
  })

  const hasCategorySlug = headerMap.has('category_slug')
  const hasCategoryName = headerMap.has('category_name')
  if (!hasCategorySlug && !hasCategoryName && !fallback) {
    return { ok: false, errors: ['Provide category_name or category_slug in the file, or select a category on the page.'] }
  }

  const knownHeaderSet = new Set<string>([
    ...ASSET_IMPORT_CORE_COLUMNS,
    ...ALL_CUSTOM_KEYS_SORTED,
  ])

  const headerErrors: string[] = []
  for (const [name] of headerMap) {
    if (FORBIDDEN_HEADERS.has(name)) {
      headerErrors.push(`Column "${name}" is not allowed on asset import (assignment belongs in the app).`)
      continue
    }
    if (knownHeaderSet.has(name)) continue
    if (name.startsWith(CUSTOM_PREFIX) && name.length > CUSTOM_PREFIX.length) continue
    headerErrors.push(
      `Unknown column "${name.replace(/_/g, ' ')}". Use the sample headers or custom_* columns for custom categories.`,
    )
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors }

  const idx: Record<string, number | undefined> = {}
  for (const [k, i] of headerMap) idx[k] = i

  const customDynamicKeys = Array.from(headerMap.keys()).filter(
    (k) => k.startsWith(CUSTOM_PREFIX) && k.length > CUSTOM_PREFIX.length,
  )

  const dataRowCount = matrix.length - 1
  if (dataRowCount > ASSET_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      errors: [
        `Too many data rows (${dataRowCount}). Maximum is ${ASSET_IMPORT_MAX_ROWS}. Split into smaller files.`,
      ],
    }
  }

  // Preflight duplicate serial uniqueness (global across the file)
  const serialRows = new Map<string, number[]>()
  const preflightErrors: string[] = []
  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const line = matrix[i] ?? []
    if (isRowMeaningfullyEmpty(line as unknown[])) continue

    const cat = resolveCategoryForRow(line, idx, fallback)
    if ('error' in cat) {
      preflightErrors.push(`Row ${excelRow}: ${cat.error}`)
      continue
    }

    const serial = cellTrimmed(line, idx.serial_number)
    if (serial && !isCellEmpty(serial)) {
      const key = serial.toLowerCase()
      const rows = serialRows.get(key)
      if (rows) rows.push(excelRow)
      else serialRows.set(key, [excelRow])
    }
  }
  for (const [serial, rows] of serialRows) {
    if (rows.length < 2) continue
    preflightErrors.push(
      `Duplicate serial_number "${serial}" in file (rows ${rows.join(', ')}). No rows were imported.`,
    )
  }
  if (preflightErrors.length) return { ok: false, errors: preflightErrors }

  const rows: AssetImportParsedRow[] = []
  const errors: string[] = []

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1
    const rowLabel = `Row ${excelRow}`
    const line = matrix[i] ?? []
    if (isRowMeaningfullyEmpty(line as unknown[])) continue

    const rowErrors: string[] = []
    const customPayload: Record<string, unknown> = {}

    const cat = resolveCategoryForRow(line, idx, fallback)
    if ('error' in cat) {
      errors.push(`${rowLabel}: ${cat.error}`)
      continue
    }
    const categorySlug = cat.slug
    const isKnownCategory = ALLOWLIST.has(categorySlug)

    const manufacturer = cellTrimmed(line, idx.manufacturer_name)
    const model = cellTrimmed(line, idx.model)
    const locationName = cellTrimmed(line, idx.location_name)
    const serial = cellTrimmed(line, idx.serial_number)
    const purchase = cellTrimmed(line, idx.purchase_date)
    const warranty = cellTrimmed(line, idx.warranty_expiry)
    const notes = cellTrimmed(line, idx.notes)
    const locationCode = cellTrimmed(line, idx.location_code)

    if (!manufacturer || isCellEmpty(manufacturer)) {
      rowErrors.push(`${rowLabel}: manufacturer_name is required (use N/A if not applicable).`)
    }
    if (!isSimCategory(categorySlug) && (!model || isCellEmpty(model))) {
      rowErrors.push(`${rowLabel}: model is required (use N/A if not applicable).`)
    }
    if (!locationName || isCellEmpty(locationName)) {
      rowErrors.push(`${rowLabel}: location_name is required (use N/A if unknown).`)
    }

    if (!isNetworkingCategory(categorySlug)) {
      if (!serial || isCellEmpty(serial)) {
        rowErrors.push(`${rowLabel}: serial_number is required (use N/A if not available).`)
      }
      if (!purchase || isCellEmpty(purchase)) {
        rowErrors.push(`${rowLabel}: purchase_date is required (yyyy-mm-dd or similar).`)
      } else {
        const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
        if (!d.ok) rowErrors.push(d.message)
      }
      if (!warranty || isCellEmpty(warranty)) {
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

    if (isKnownCategory) {
      const validKeys = KEYS_BY_CATEGORY[categorySlug]!
      for (const meta of CUSTOM_META_BY_CATEGORY[categorySlug]!) {
        const raw = cellTrimmed(line, idx[meta.field_key])
        const coerced = coerceByType(raw, meta.data_type, rowLabel, meta.field_key)
        if (!coerced.ok) {
          rowErrors.push(coerced.message)
          continue
        }
        if ((raw === '' || isCellEmpty(raw)) && meta.is_required) {
          rowErrors.push(`${rowLabel}: "${meta.field_key}" is required.`)
          continue
        }
        if (coerced.value !== undefined) customPayload[meta.field_key] = coerced.value
      }
      for (const key of ALL_CUSTOM_KEYS_SORTED) {
        if (validKeys.has(key)) continue
        const raw = cellTrimmed(line, idx[key])
        if (raw && !isCellEmpty(raw)) {
          rowErrors.push(
            `${rowLabel}: column "${key}" is not used for category "${categorySlug}". Leave it empty for this row.`,
          )
        }
      }
    } else {
      // Custom category row: allow non-empty known keys + custom_* keys as custom_fields.
      for (const key of ALL_CUSTOM_KEYS_SORTED) {
        const raw = cellTrimmed(line, idx[key])
        if (!raw || isCellEmpty(raw)) continue
        const hinted = CUSTOM_TYPE_HINT.get(key) ?? 'text'
        const coerced = coerceByType(raw, hinted, rowLabel, key)
        if (!coerced.ok) rowErrors.push(coerced.message)
        else if (coerced.value !== undefined) customPayload[key] = coerced.value
      }
    }

    for (const dyn of customDynamicKeys) {
      const raw = cellTrimmed(line, idx[dyn])
      if (!raw || isCellEmpty(raw)) continue
      const outputKey = dyn.slice(CUSTOM_PREFIX.length)
      if (!outputKey) continue
      customPayload[outputKey] = raw
    }

    let purchaseDateOut: string | undefined
    let warrantyOut: string | undefined
    if (purchase && !isCellEmpty(purchase)) {
      const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
      if (d.ok) purchaseDateOut = d.value
    }
    if (warranty && !isCellEmpty(warranty)) {
      const d = normalizeDateToIso(warranty, rowLabel, 'warranty_expiry')
      if (d.ok) warrantyOut = d.value
    }

    const metadata: Record<string, unknown> = {
      source: 'bulk_import',
      template_version: ASSET_IMPORT_TEMPLATE_VERSION,
      category_mode: isKnownCategory ? 'predefined' : 'custom',
    }
    if (notes) metadata.notes = notes

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const input: AssetWriteInput = {
      category_slug: categorySlug,
      ...(cat.displayName ? { category_name: cat.displayName } : {}),
      manufacturer_name: manufacturer,
      model: isSimCategory(categorySlug) ? model || undefined : model || undefined,
      serial_number: serial || undefined,
      location_code: locationCode || undefined,
      location_name: locationName,
      purchase_date: purchaseDateOut,
      warranty_expiry: warrantyOut,
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
