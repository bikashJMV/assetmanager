import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

const core = [
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
]

const custom = [
  'activation_date',
  'capacity_gb',
  'carrier',
  'device_type',
  'encryption_enabled',
  'file_system',
  'firmware_version',
  'generation',
  'host_name',
  'imei_1',
  'imei_2',
  'ip_address',
  'mac_lan',
  'mac_wifi',
  'monitor_size_inch',
  'os',
  'panel_type',
  'phone_number',
  'plan_name',
  'ports',
  'processor',
  'ram_gb',
  'ram_type',
  'refresh_rate_hz',
  'resolution',
  'sim_number',
  'sim_previously_used_by',
  'storage_gb',
  'storage_type',
  'usb_type',
]

const headers = [...core, ...custom]

const wb = XLSX.utils.book_new()
/** Headers only — required custom fields (e.g. processor, sim_number) depend on the selected category. */
const importData = [headers]
const ws = XLSX.utils.aoa_to_sheet(importData)
XLSX.utils.book_append_sheet(wb, ws, 'Import')

const readme = [
  ['Asset bulk import (v1)'],
  [''],
  ['Use the Import sheet. Row 1 = headers; add your data from row 2 onward.'],
  ['Do not add a category_slug column when importing from the New Asset page (category comes from the UI).'],
  ['For multi-category files (advanced), include category_slug as the first column — not used by the current UI flow.'],
  ['Dates: yyyy-mm-dd. Booleans: true/false. Empty or N/A = optional field omitted.'],
  ['asset_tag is system-generated; do not add a column for it.'],
  ['Reject: duplicate (category + serial) within the same file; employee/assignment columns.'],
  ['template_version in app: 1'],
]
const wsR = XLSX.utils.aoa_to_sheet(readme)
XLSX.utils.book_append_sheet(wb, wsR, 'Readme')

const out = join(__dirname, '..', 'public', 'asset-import-template.xlsx')
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
