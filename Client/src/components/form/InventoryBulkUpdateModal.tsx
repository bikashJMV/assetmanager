import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import {
  assignAsset,
  resolveEmployeeCodeFromIdentifier,
  returnAsset,
  setAssetLifecycleStatus,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import {
  INVENTORY_UPDATE_MAX_ROWS,
  INVENTORY_UPDATE_TEMPLATE_HREF,
  isAssignmentAction,
  parseInventoryUpdateMatrix,
  type InventoryUpdateParsedRow,
} from '../../utils/inventoryBulkUpdate'
import { useToast } from '../common/ToastProvider'
import AnimatedNavIcon from '../common/AnimatedNavIcon'

const ACCEPT =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

function pickSheetName(sheetNames: string[]): string | null {
  const imp = sheetNames.find((n) => n.trim().toLowerCase() === 'import')
  return imp ?? sheetNames[0] ?? null
}

async function executeRow(row: InventoryUpdateParsedRow): Promise<void> {
  const { assetTag, action, assignee, comment } = row

  switch (action) {
    case 'assigned': {
      const employeeCode = await resolveEmployeeCodeFromIdentifier(assignee)
      await assignAsset({
        asset_tag: assetTag,
        employee_code: employeeCode,
        notes: comment || undefined,
      })
      break
    }
    case 'returned':
      await returnAsset({
        asset_tag: assetTag,
        notes: comment || undefined,
      })
      break
    default:
      await setAssetLifecycleStatus(assetTag, action, comment || undefined, 'bulk_update')
      break
  }
}

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function InventoryBulkUpdateModal({ open, onClose, onSuccess }: Props) {
  const { showToast } = useToast()
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    if (open) cancelledRef.current = false
    else cancelledRef.current = true
  }, [open])

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [applyErrors, setApplyErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const resetState = useCallback(() => {
    setFileLabel('')
    setParseErrors([])
    setApplyErrors([])
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => {
    if (busy) return
    resetState()
    onClose()
  }, [busy, onClose, resetState])

  const runImport = useCallback(
    async (file: File) => {
      setParseErrors([])
      setApplyErrors([])
      setBusy(true)
      setProgress(null)
      cancelledRef.current = false

      try {
        const buf = await file.arrayBuffer()
        const workbook = XLSX.read(buf, { type: 'array' })
        const sheetName = pickSheetName(workbook.SheetNames)
        if (!sheetName) {
          setParseErrors(['No sheets found in the workbook.'])
          showToast({ variant: 'error', title: 'Update cancelled', message: 'Invalid workbook: no sheets found.' })
          setBusy(false)
          return
        }
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          setParseErrors([`Sheet "${sheetName}" is missing.`])
          showToast({ variant: 'error', title: 'Update cancelled', message: 'Could not read the sheet.' })
          setBusy(false)
          return
        }

        const matrix = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as unknown[][]

        const parsed = parseInventoryUpdateMatrix(matrix)
        if (!parsed.ok) {
          setParseErrors(parsed.errors)
          showToast({
            variant: 'error',
            title: 'Update cancelled',
            message: 'Validation failed. Fix the issues below and try again.',
          })
          setBusy(false)
          return
        }

        const applyErrs: string[] = []
        let ok = 0
        const total = parsed.rows.length
        setProgress({ done: 0, total })

        for (let i = 0; i < parsed.rows.length; i += 1) {
          if (cancelledRef.current) break
          const row = parsed.rows[i]!
          const rowLabel = `Row ${row.rowNumber} (${row.assetTag})`
          try {
            await executeRow(row)
            ok += 1
          } catch (err) {
            logDevError('inventoryBulkUpdate.row', err)
            const action = isAssignmentAction(row.action) ? row.action : `status → ${row.action}`
            applyErrs.push(`${rowLabel} [${action}]: ${getUserFacingMessage(err, 'Operation failed.')}`)
            if (ok > 0) {
              applyErrs.push(
                `Stopped after ${ok} of ${total} rows applied. Earlier rows were committed; review assets or fix and re-import remaining rows.`,
              )
            }
            break
          }
          setProgress({ done: i + 1, total })
        }

        const wasCancelled = cancelledRef.current && ok < total
        if (applyErrs.length) {
          if (mountedRef.current) setApplyErrors(applyErrs)
          showToast({
            variant: 'error',
            title: ok > 0 ? 'Update stopped' : 'Update failed',
            message:
              ok > 0
                ? `Only ${ok} of ${total} rows were applied before an error. Review the messages below.`
                : 'No updates were applied. Review the messages below.',
          })
          if (ok > 0) onSuccess()
        } else if (wasCancelled) {
          showToast({
            variant: 'warning',
            title: 'Update cancelled',
            message: ok > 0 ? `Applied ${ok} of ${total} rows before cancel.` : 'No updates were applied.',
          })
          if (ok > 0) onSuccess()
        } else {
          showToast({
            variant: 'success',
            message: `Bulk inventory update complete — ${ok} asset${ok === 1 ? '' : 's'} updated.`,
          })
          resetState()
          onSuccess()
          onClose()
        }
      } catch (err) {
        logDevError('inventoryBulkUpdate.file', err)
        if (mountedRef.current) {
          setParseErrors([getUserFacingMessage(err, 'Could not read the Excel file.')])
          showToast({ variant: 'error', title: 'Update cancelled', message: 'Could not read the Excel file.' })
        }
      } finally {
        if (mountedRef.current) {
          setBusy(false)
          setProgress(null)
        }
      }
    },
    [onClose, onSuccess, resetState, showToast],
  )

  const onPickFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const lower = file.name.toLowerCase()
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        showToast({ variant: 'warning', message: 'Please choose an Excel file (.xlsx or .xls).' })
        return
      }
      setFileLabel(file.name)
      void runImport(file)
    },
    [runImport, showToast],
  )

  if (!open) return null

  const issueLines = [...parseErrors, ...applyErrors]
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-bulk-update-title"
        className="relative flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-base bg-app p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10 sm:p-6"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          disabled={busy}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="sr-only">Close</span>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <div className="shrink-0 pr-11 pt-0 sm:pr-12">
          <h3
            id="inventory-bulk-update-title"
            className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-primary"
          >
            Bulk Update Inventory Status
          </h3>
          <p className="mt-1 text-sm text-muted">
            Upload an Excel sheet with columns:{' '}
            <code className="text-[0.8rem]">asset_tag</code>,{' '}
            <code className="text-[0.8rem]">inventory_status</code>,{' '}
            <code className="text-[0.8rem]">employee_code/email</code> (for assign),{' '}
            <code className="text-[0.8rem]">comment</code> (optional).
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onPickFile}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            <span className="inline-flex h-5 w-5 shrink-0 text-white" aria-hidden="true">
              <AnimatedNavIcon name="upload" className="h-5 w-5 text-[color:var(--on-accent)]" />
            </span>
            <span>{busy ? 'Updating…' : 'Upload Excel file'}</span>
          </button>

          {fileLabel && !busy && !parseErrors.length && !applyErrors.length ? (
            <p className="mt-3 text-sm text-muted">
              Selected: <span className="font-medium text-primary">{fileLabel}</span>
            </p>
          ) : null}

          {progress ? (
            <div className="mt-5 space-y-2" role="status" aria-live="polite" aria-busy="true">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-primary">Processing rows…</span>
                <span className="tabular-nums text-muted">
                  {progress.done} of {progress.total} ({pct}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <div
                  className="h-full min-w-0 rounded-full bg-accent transition-[width] duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : null}

          {issueLines.length > 0 && (
            <div
              className="mt-5 max-h-52 overflow-y-auto rounded-xl border border-red-500/35 bg-red-500/[0.06] py-3 pl-4 pr-3 dark:border-red-400/35 dark:bg-red-400/[0.08]"
              role="region"
              aria-label="Update issues"
            >
              <p className="text-sm font-semibold text-primary">
                {parseErrors.length > 0 && applyErrors.length > 0
                  ? 'Validation and execution issues'
                  : parseErrors.length > 0
                    ? 'Update was not applied — fix these in your file'
                    : 'Update did not complete'}
              </p>
              <ul className="mt-2.5 list-disc space-y-2 pl-5 text-sm leading-snug text-muted marker:text-red-600 dark:marker:text-red-400">
                {issueLines.slice(0, 80).map((line, idx) => (
                  <li key={`${idx}-${line.slice(0, 48)}`} className="break-words pl-0.5">
                    {line}
                  </li>
                ))}
              </ul>
              {issueLines.length > 80 ? (
                <p className="mt-3 text-xs text-subtle">Showing the first 80 messages.</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-4 shrink-0 border-t border-base pt-4">
          <a
            href={INVENTORY_UPDATE_TEMPLATE_HREF}
            download
            className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 transition hover:decoration-accent"
          >
            <span className="inline-flex h-4 w-4 shrink-0" aria-hidden="true">
              <AnimatedNavIcon name="download" className="h-4 w-4" />
            </span>
            Download sample template
          </a>
          <p className="mt-2 text-xs text-subtle">
            Use the <span className="font-medium text-primary">Import</span> sheet; max{' '}
            {INVENTORY_UPDATE_MAX_ROWS} data rows. Entire process stops on the first error.
          </p>
        </div>
      </div>
    </div>
  )
}
