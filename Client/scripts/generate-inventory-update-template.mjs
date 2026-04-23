import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from '@e965/xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

const headers = ['Asset Tag', 'Inventory Status', 'Employee ID', 'Comment']

const examples = [
  ['AST-01102', 'Returned', '', 'Took return from xyz'],
  ['AST-01103', 'Assigned', 'bik@jmv.co.in', 'Gave laptop to bik'],
  ['AST-01104', 'In Stock', '', 'Received today'],
  ['AST-01105', 'Lost', '', ''],
  ['AST-01106', 'In Repair', '', 'Sent for screen repair'],
  ['AST-01893', 'Assigned', 'EMP01034', 'Handover pendrive to mallick'],
]

const wb = XLSX.utils.book_new()
const importData = [headers, ...examples]
const ws = XLSX.utils.aoa_to_sheet(importData)
XLSX.utils.book_append_sheet(wb, ws, 'Import')

const readme = [
  ['Bulk Inventory Status Update'],
  [''],
  ['Use the Import sheet. Row 1 = headers; add your data from row 2 onward.'],
  [''],
  ['Columns:'],
  ['  Asset Tag          — required, must match an existing non-deleted asset'],
  ['  Inventory Status   — required: Assigned, Returned, In Stock, In Repair, Retired, Lost, Disposed'],
  ['  Employee ID        — required only for "Assigned"; use employee ID (EMP01034) or email (user@company.com)'],
  ['  Comment            — optional free-text note'],
  [''],
  ['Rules:'],
  ['  - Each asset_tag can appear only once per file.'],
  ['  - "Assigned" requires Employee ID or email; all other statuses must leave it blank.'],
  ['  - The entire import stops on the first error (fail-fast).'],
  ['  - Max 500 data rows per file.'],
  [''],
  ['Status mapping:'],
  ['  Assigned    → assigns asset to the employee (reuses fn_assign_asset)'],
  ['  Returned    → closes the open assignment (reuses fn_return_asset)'],
  ['  In Stock    → sets status to in_stock; auto-closes any open assignment'],
  ['  In Repair   → sets status to in_repair; auto-closes any open assignment'],
  ['  Retired     → sets status to retired; auto-closes any open assignment'],
  ['  Lost        → sets status to lost; auto-closes any open assignment'],
  ['  Disposed    → sets status to disposed; auto-closes any open assignment'],
]
const wsR = XLSX.utils.aoa_to_sheet(readme)
XLSX.utils.book_append_sheet(wb, wsR, 'Readme')

const out = join(__dirname, '..', 'public', 'inventory-update-template.xlsx')
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
