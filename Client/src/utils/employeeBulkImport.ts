// Deprecated and fully retired. Bulk import utilities are no longer used.
export const EMPLOYEE_IMPORT_TEMPLATE_HREF = '/employee-import-template.xlsx'
export const EMPLOYEE_IMPORT_MAX_ROWS = 500

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
