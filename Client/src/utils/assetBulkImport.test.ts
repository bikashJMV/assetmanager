import { describe, expect, it } from 'vitest'
import { parseAssetImportMatrix } from './assetBulkImport'

describe('parseAssetImportMatrix (bulk import)', () => {
  it('stores cross-template columns in custom_fields (e.g. ram_type on desktop)', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'ram_type'],
      ['desktop', 'DESK-SN-KV-1', 'DDR5'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].input.category_slug).toBe('desktop')
    expect(r.rows[0].input.serial_number).toBe('DESK-SN-KV-1')
    expect(r.rows[0].input.custom_fields).toMatchObject({ ram_type: 'DDR5' })
  })

  it('maps core columns and merges extras into custom_fields', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'model', 'wifi_mac'],
      ['laptop', 'LAP-SN-KV-1', 'X1', 'aa:bb:cc:dd:ee:ff'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[0].input.model).toBe('X1')
    expect(r.rows[0].input.custom_fields).toMatchObject({ wifi_mac: 'aa:bb:cc:dd:ee:ff' })
  })

  it('fails when serial_number is missing', () => {
    const matrix = [
      ['category_slug', 'serial_number'],
      ['desktop', ''],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.includes('serial_number is required'))).toBe(true)
  })

  it('fails on forbidden assignment-style headers', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'assigned_to'],
      ['desktop', 'X', 'e1'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.toLowerCase().includes('not allowed'))).toBe(true)
  })

  it('fails on duplicate serial_number within the file', () => {
    const matrix = [
      ['category_slug', 'serial_number'],
      ['desktop', 'DUP-SN-1'],
      ['laptop', 'DUP-SN-1'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true)
  })

  it('accepts custom_* columns as custom_fields with stripped prefix', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'custom_vendor'],
      ['monitor', 'MON-SN-KV-1', 'Dell'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[0].input.custom_fields).toMatchObject({ vendor: 'Dell' })
  })

  it('rejects asset_tag column', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'asset_tag'],
      ['desktop', 'SN-AT-1', 'AST-999'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.toLowerCase().includes('asset tag'))).toBe(true)
  })

  it('rejects duplicate normalised headers', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'serial_number'],
      ['desktop', 'A', 'B'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true)
  })

  it('does not map generic "Type" header to category — stores as custom field', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'Type'],
      ['laptop', 'LAP-TYPE-1', 'USB-C'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[0].input.category_slug).toBe('laptop')
    expect(r.rows[0].input.custom_fields).toMatchObject({ type: 'USB-C' })
  })

  it('coerces custom_* columns using type hints (e.g. custom_ram_gb)', () => {
    const matrix = [
      ['category_slug', 'serial_number', 'custom_ram_gb'],
      ['laptop', 'LAP-RAM-1', '16'],
    ]
    const r = parseAssetImportMatrix(matrix, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows[0].input.custom_fields).toMatchObject({ ram_gb: 16 })
  })
})
