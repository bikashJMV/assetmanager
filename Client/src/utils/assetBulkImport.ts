import type { AssetWriteInput } from '../api'
import { parseBooleanCell } from './employeeBulkImport'

/** Public template (Vite `public/`). */
export const ASSET_IMPORT_TEMPLATE_HREF = '/asset-import-template.xlsx'

/** Bump when columns or rules change; embedded in `metadata` on each create. */
export const ASSET_IMPORT_TEMPLATE_VERSION = 5

/** Safety limit per batch. */
export const ASSET_IMPORT_MAX_ROWS = 500

/**
 * Known/recognised category slugs for the predefined-template path.
 * "other" and "sim" removed; mouse, keyboard, wifi-dongle added.
 */
const ALLOWLIST = new Set([
  'laptop',
  'desktop',
  'pen-drive',
  'monitor',
  'mouse',
  'keyboard',
  'wifi-dongle',
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
  'employee_id',
  'assign',
  'assigned_to',
  'assignment',
  'holder',
  'holder_name',
])

/**
 * Headers that must not appear on the sheet (system-managed or out of scope for create import).
 */
const BLOCKED_IMPORT_HEADERS = new Set(['asset_tag'])

/**
 * Expanded alias map. Keys are the *normalised* raw header (trimmed + lowercased + spaces→_).
 * Values are the canonical internal field name.
 */
const HEADER_ALIASES: Record<string, string> = {
  // serial_number
  serial:               'serial_number',
  sr_no:                'serial_number',
  'sr no':              'serial_number',
  's/n':                'serial_number',
  sn:                   'serial_number',
  serial_no:            'serial_number',
  serial_num:           'serial_number',
  // category
  cat:                  'category_slug',
  type:                 'category_slug',
  category:             'category_slug',
  category_name:        'category_name',  // keep as-is but alias "Category Name"
  asset_category:       'category_slug',
  // manufacturer
  manufacturer:         'manufacturer_name',
  make:                 'manufacturer_name',
  brand:                'manufacturer_name',
  mfr:                  'manufacturer_name',
  vendor:               'manufacturer_name',
  // model
  model_no:             'model',
  model_name:           'model',
  model_number:         'model',
  // location
  location:             'location_name',
  loc:                  'location_name',
  site:                 'location_name',
  office:               'location_name',
  address:              'location_name',
  location_code:        'location_code',
  loc_code:             'location_code',
  // status
  inventory_status:     'status',
  state:                'status',
  asset_status:         'status',
  // dates
  purchase:             'purchase_date',
  purchase_dt:          'purchase_date',
  buy_date:             'purchase_date',
  bought_on:            'purchase_date',
  warranty:             'warranty_expiry',
  warranty_date:        'warranty_expiry',
  expiry:               'warranty_expiry',
  expiry_date:          'warranty_expiry',
  warranty_end:         'warranty_expiry',
  // notes
  note:                 'notes',
  remarks:              'notes',
  comment:              'notes',
  comments:             'notes',
  description:          'notes',
}

/**
 * Aliases applied only when parsing bulk import sheets.
 * Omits short/ambiguous keys that commonly mean something other than a core column
 * (e.g. "Type" as USB type, "Vendor" as supplier distinct from manufacturer, "State" as region).
 */
const BULK_IMPORT_HEADER_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).filter(([k]) => !['type', 'vendor', 'state'].includes(k)),
)

const CUSTOM_PREFIX = 'custom_'

type CustomMeta = {
  field_key: string
  data_type: 'text' | 'number' | 'boolean' | 'date' | 'json'
  is_required: false  // all template fields are now optional
}

/**
 * Mirrors `06_seed.sql` + `36_seed_category_changes.sql` custom_field_definitions.
 * All is_required are false — matching the updated schema.
 */
const CUSTOM_META_BY_CATEGORY: Record<string, CustomMeta[]> = {
  laptop: [
    { field_key: 'processor',    data_type: 'text',   is_required: false },
    { field_key: 'generation',   data_type: 'text',   is_required: false },
    { field_key: 'ram_gb',       data_type: 'number', is_required: false },
    { field_key: 'ram_type',     data_type: 'text',   is_required: false },
    { field_key: 'storage_gb',   data_type: 'number', is_required: false },
    { field_key: 'storage_type', data_type: 'text',   is_required: false },
    { field_key: 'mac_wifi',     data_type: 'text',   is_required: false },
    { field_key: 'mac_lan',      data_type: 'text',   is_required: false },
    { field_key: 'os',           data_type: 'text',   is_required: false },
    { field_key: 'host_name',    data_type: 'text',   is_required: false },
  ],
  desktop: [
    { field_key: 'processor',    data_type: 'text',   is_required: false },
    { field_key: 'generation',   data_type: 'text',   is_required: false },
    { field_key: 'ram_gb',       data_type: 'number', is_required: false },
    { field_key: 'storage_gb',   data_type: 'number', is_required: false },
    { field_key: 'storage_type', data_type: 'text',   is_required: false },
    { field_key: 'mac_wifi',     data_type: 'text',   is_required: false },
    { field_key: 'mac_lan',      data_type: 'text',   is_required: false },
    { field_key: 'os',           data_type: 'text',   is_required: false },
    { field_key: 'host_name',    data_type: 'text',   is_required: false },
  ],
  'pen-drive': [
    { field_key: 'capacity_gb',         data_type: 'number',  is_required: false },
    { field_key: 'usb_type',            data_type: 'text',    is_required: false },
    { field_key: 'encryption_enabled',  data_type: 'boolean', is_required: false },
    { field_key: 'file_system',         data_type: 'text',    is_required: false },
  ],
  monitor: [
    { field_key: 'monitor_size_inch', data_type: 'number', is_required: false },
    { field_key: 'resolution',        data_type: 'text',   is_required: false },
    { field_key: 'panel_type',        data_type: 'text',   is_required: false },
    { field_key: 'refresh_rate_hz',   data_type: 'number', is_required: false },
  ],
  mouse: [
    { field_key: 'connectivity', data_type: 'text', is_required: false },
    { field_key: 'interface',    data_type: 'text', is_required: false },
  ],
  keyboard: [
    { field_key: 'layout',       data_type: 'text', is_required: false },
    { field_key: 'connectivity', data_type: 'text', is_required: false },
    { field_key: 'interface',    data_type: 'text', is_required: false },
  ],
  'wifi-dongle': [
    { field_key: 'standard',  data_type: 'text', is_required: false },
    { field_key: 'usb_type',  data_type: 'text', is_required: false },
  ],
}

const CUSTOM_TYPE_HINT = new Map<string, CustomMeta['data_type']>()
for (const defs of Object.values(CUSTOM_META_BY_CATEGORY)) {
  for (const d of defs) {
    if (!CUSTOM_TYPE_HINT.has(d.field_key)) CUSTOM_TYPE_HINT.set(d.field_key, d.data_type)
  }
}

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

/** Headers mapped to top-level asset fields or metadata — never duplicated into `custom_fields`. */
const TOP_LEVEL_IMPORT_KEYS = new Set<string>(ASSET_IMPORT_CORE_COLUMNS as unknown as string[])

const PLACEHOLDER_EMPTY = new Set(['', 'n/a', 'na', '—', '-'])

/**
 * Normalises a raw header cell to its canonical internal field name.
 * 1. Trim + lowercase
 * 2. Collapse whitespace/dashes to underscores
 * 3. Check expanded HEADER_ALIASES
 * 4. Return normalised key (or original if unrecognised)
 */
export function normalizeHeaderCell(cell: unknown): string {
  const raw = String(cell ?? '').trim().toLowerCase()
  // Collapse runs of spaces, dashes, slashes to a single underscore
  const collapsed = raw.replace(/[\s\-/]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return BULK_IMPORT_HEADER_ALIASES[collapsed] ?? BULK_IMPORT_HEADER_ALIASES[raw] ?? collapsed
}

/**
 * Returns a human-readable mapping of raw header → canonical key for display in UI.
 * Unrecognised headers map to a normalised `canonical` key and are stored in `custom_fields` on import.
 */
export type HeaderMappingEntry = {
  raw: string
  canonical: string
  isFreeForm: boolean
  isForbidden: boolean
  /** Legacy: always false — unknown headers map to `custom_fields` and show as free-form in UI. */
  isIgnored: boolean
}

export function buildHeaderMapping(headerRow: unknown[]): HeaderMappingEntry[] {
  return headerRow
    .map((cell) => {
      const raw = String(cell ?? '').trim()
      if (!raw) return null
      const canonical = normalizeHeaderCell(cell)
      const isForbidden = FORBIDDEN_HEADERS.has(canonical)
      const isBlocked = BLOCKED_IMPORT_HEADERS.has(canonical)
      const isCustomPrefix = canonical.startsWith(CUSTOM_PREFIX) && canonical.length > CUSTOM_PREFIX.length
      // Anything not a top-level core column is stored in custom_fields (including laptop/desktop template keys).
      const isTopLevelKey = TOP_LEVEL_IMPORT_KEYS.has(canonical)
      const isFreeForm = isCustomPrefix || (!isForbidden && !isBlocked && !isTopLevelKey)
      return { raw, canonical, isFreeForm, isForbidden: isForbidden || isBlocked, isIgnored: false }
    })
    .filter((e): e is HeaderMappingEntry => e !== null)
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cellTrimmed(line: unknown[], idx: number | undefined): string {
  if (idx === undefined) return ''
  return String(line[idx] ?? '').trim()
}

function isCellEmpty(raw: string): boolean {
  return PLACEHOLDER_EMPTY.has(raw.trim().toLowerCase())
}

function isRowMeaningfullyEmpty(line: unknown[]): boolean {
  return line.every((c) => String(c ?? '').trim() === '')
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

/** Excel 1900 date system: serial 25569 → 1970-01-01 UTC when converted via epoch offset. */
function tryExcelSerialStringToIsoUtc(t: string): string | null {
  // Require 5+ digits so values like "2020" are parsed as calendar years via Date, not as serials.
  if (!/^\d{5,6}(?:\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 1 || n > 100_000) return null
  // Typical stored dates fall in this range; ignore small integers that are not dates.
  if (n < 2000 || n > 90_000) return null
  const ms = (n - 25569) * 86_400_000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  if (y < 1970 || y > 2100) return null
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeDateToIso(
  raw: string,
  rowLabel: string,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: true, value: t }
  const fromExcel = tryExcelSerialStringToIsoUtc(t)
  if (fromExcel) return { ok: true, value: fromExcel }
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
  | { ok: true; rows: AssetImportParsedRow[]; headerMapping: HeaderMappingEntry[] }
  | { ok: false; errors: string[]; headerMapping?: HeaderMappingEntry[] }

export type ParseAssetImportOptions = {
  /** Fallback category when sheet omits both `category_slug` and `category_name`. */
  defaultCategorySlug?: string
}

export function getExpectedHeadersModeB(): string[] {
  return [...ASSET_IMPORT_CORE_COLUMNS.filter((k) => k !== 'category_slug')]
}

export function getExpectedHeadersModeA(): string[] {
  return [...ASSET_IMPORT_CORE_COLUMNS]
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
    return { slug: slugify(slugRaw), ...(nameRaw ? { displayName: nameRaw } : {}) }
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
 * Parse a worksheet matrix (row-0 = headers, row-1+ = data).
 * Uses fuzzy header normalisation so common column name variants are accepted.
 * Returns headerMapping always so the UI can show the column preview.
 *
 * Rules:
 *  - Category + serial_number required per row; asset_tag is never imported (server-generated).
 *  - Core columns map to top-level fields; any other column (except forbidden) merges into `custom_fields`.
 *  - No per-category column rejection — e.g. laptop-only fields on a desktop row are stored as custom data.
 *  - Entire parse fails if any row has an error (client-side atomic gate).
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
  const headerMapping = buildHeaderMapping(headerRow)

  // Build index map from canonical key → column index
  const headerMap = new Map<string, number>()
  headerRow.forEach((cell, colIdx) => {
    const key = normalizeHeaderCell(cell)
    if (key && !headerMap.has(key)) headerMap.set(key, colIdx)
  })

  // Check for forbidden / blocked columns
  const headerErrors: string[] = []
  for (const entry of headerMapping) {
    if (!entry.isForbidden) continue
    const c = normalizeHeaderCell(entry.raw)
    if (BLOCKED_IMPORT_HEADERS.has(c)) {
      headerErrors.push(
        `Column "${entry.raw}" is not imported — asset tags are generated automatically. Remove this column.`,
      )
    } else {
      headerErrors.push(`Column "${entry.raw}" is not allowed on asset import (assignment belongs in the app).`)
    }
  }
  if (headerErrors.length) return { ok: false, errors: headerErrors, headerMapping }

  // Duplicate logical columns (same normalised header twice)
  const seenKeys = new Set<string>()
  for (let col = 0; col < headerRow.length; col += 1) {
    const key = normalizeHeaderCell(headerRow[col])
    if (!key) continue
    if (seenKeys.has(key)) {
      return {
        ok: false,
        errors: [
          `Duplicate column "${key}" — each column may only appear once in row 1 (found again near column ${col + 1}).`,
        ],
        headerMapping,
      }
    }
    seenKeys.add(key)
  }

  const hasCategorySlug = headerMap.has('category_slug')
  const hasCategoryName = headerMap.has('category_name')
  if (!hasCategorySlug && !hasCategoryName && !fallback) {
    return {
      ok: false,
      errors: ['Provide category_name or category_slug in the file, or select a category on the page.'],
      headerMapping,
    }
  }

  const idx: Record<string, number | undefined> = {}
  for (const [k, i] of headerMap) idx[k] = i

  const customDynamicKeys = Array.from(headerMap.keys()).filter(
    (k) => k.startsWith(CUSTOM_PREFIX) && k.length > CUSTOM_PREFIX.length,
  )

  const dataRowCount = matrix.length - 1
  if (dataRowCount > ASSET_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      errors: [`Too many data rows (${dataRowCount}). Maximum is ${ASSET_IMPORT_MAX_ROWS}. Split into smaller files.`],
      headerMapping,
    }
  }

  // ── Preflight: duplicate serial numbers in file ───────────────────────────
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
      const existing = serialRows.get(key)
      if (existing) existing.push(excelRow)
      else serialRows.set(key, [excelRow])
    }
  }

  for (const [serial, rows] of serialRows) {
    if (rows.length < 2) continue
    preflightErrors.push(
      `Duplicate serial_number "${serial}" in file (rows ${rows.join(', ')}). Fix duplicates and try again.`,
    )
  }
  if (preflightErrors.length) return { ok: false, errors: preflightErrors, headerMapping }

  // ── Per-row parse ──────────────────────────────────────────────────────────
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
    const model        = cellTrimmed(line, idx.model)
    const locationName = cellTrimmed(line, idx.location_name)
    const locationCode = cellTrimmed(line, idx.location_code)
    const serial       = cellTrimmed(line, idx.serial_number)
    const purchase     = cellTrimmed(line, idx.purchase_date)
    const warranty     = cellTrimmed(line, idx.warranty_expiry)
    const notes        = cellTrimmed(line, idx.notes)

    // Only serial_number is mandatory (category already resolved above)
    if (!serial || isCellEmpty(serial)) {
      rowErrors.push(`${rowLabel}: serial_number is required.`)
    }

    if (purchase && !isCellEmpty(purchase)) {
      const d = normalizeDateToIso(purchase, rowLabel, 'purchase_date')
      if (!d.ok) rowErrors.push(d.message)
    }
    if (warranty && !isCellEmpty(warranty)) {
      const d = normalizeDateToIso(warranty, rowLabel, 'warranty_expiry')
      if (!d.ok) rowErrors.push(d.message)
    }

    let statusVal = cellTrimmed(line, idx.status).toLowerCase()
    if (!statusVal || isCellEmpty(statusVal)) statusVal = 'in_stock'
    if (!ASSET_STATUSES.has(statusVal)) {
      rowErrors.push(
        `${rowLabel}: status "${statusVal}" is not valid. Must be one of: ${[...ASSET_STATUSES].join(', ')}.`,
      )
    }

    // custom_* columns → custom_fields (prefix stripped; same type hints as plain custom keys)
    for (const dyn of customDynamicKeys) {
      const raw = cellTrimmed(line, idx[dyn])
      if (!raw || isCellEmpty(raw)) continue
      const outputKey = dyn.slice(CUSTOM_PREFIX.length)
      if (!outputKey) continue
      const hinted = CUSTOM_TYPE_HINT.get(outputKey) ?? 'text'
      const coerced = coerceByType(raw, hinted, rowLabel, outputKey)
      if (!coerced.ok) {
        rowErrors.push(coerced.message)
        continue
      }
      if (coerced.value !== undefined) customPayload[outputKey] = coerced.value
    }

    // Remaining columns: template-shaped keys and arbitrary headers → custom_fields (typed when we have hints)
    const sortedExtraKeys = Array.from(headerMap.keys()).sort((a, b) => a.localeCompare(b))
    for (const key of sortedExtraKeys) {
      if (FORBIDDEN_HEADERS.has(key)) continue
      if (BLOCKED_IMPORT_HEADERS.has(key)) continue
      if (TOP_LEVEL_IMPORT_KEYS.has(key)) continue
      if (key.startsWith(CUSTOM_PREFIX)) continue
      const raw = cellTrimmed(line, idx[key])
      if (!raw || isCellEmpty(raw)) continue
      const hinted = CUSTOM_TYPE_HINT.get(key) ?? 'text'
      const coerced = coerceByType(raw, hinted, rowLabel, key)
      if (!coerced.ok) {
        rowErrors.push(coerced.message)
        continue
      }
      if (coerced.value !== undefined) customPayload[key] = coerced.value
    }

    // Resolve dates
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

    if (rowErrors.length) {
      errors.push(...rowErrors)
      continue
    }

    const metadata: Record<string, unknown> = {
      source: 'bulk_import',
      template_version: ASSET_IMPORT_TEMPLATE_VERSION,
      category_mode: isKnownCategory ? 'predefined' : 'custom',
    }
    if (notes) metadata.notes = notes

    const input: AssetWriteInput = {
      category_slug: categorySlug,
      ...(cat.displayName ? { category_name: cat.displayName } : {}),
      manufacturer_name: manufacturer && !isCellEmpty(manufacturer) ? manufacturer : undefined,
      model:             model && !isCellEmpty(model) ? model : undefined,
      serial_number:     serial.trim(),
      location_code:     locationCode || undefined,
      location_name:     locationName && !isCellEmpty(locationName) ? locationName : undefined,
      purchase_date:     purchaseDateOut,
      warranty_expiry:   warrantyOut,
      status:            statusVal,
      custom_fields:     customPayload,
      metadata,
    }
    rows.push({ rowNumber: excelRow, input })
  }

  if (errors.length) return { ok: false, errors, headerMapping }

  if (rows.length === 0) {
    return { ok: false, errors: ['No data rows found after the header (skipping blank lines).'], headerMapping }
  }

  return { ok: true, rows, headerMapping }
}
