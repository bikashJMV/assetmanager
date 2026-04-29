import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  bulkInsertEmployees,
  getActiveEmployeeIdsInUse,
  getEmailsAlreadyInUse,
  getSoftDeletedEmployeeIds,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import {
  EMPLOYEE_IMPORT_TEMPLATE_HREF,
  humanizeBulkImportSaveError,
  parseEmployeeImportMatrix,
} from '../../utils/employeeBulkImport'
import { useModalScrollLock } from '../../hooks/useModalScrollLock'
import { ModalPortal } from '../common/ModalPortal'
import { useToast } from '../../hooks/useToast'
import AnimatedNavIcon from '../common/AnimatedNavIcon'

const ACCEPT =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

type Props = {
  open: boolean
  onClose: () => void
  /** Called after a fully successful import (all rows saved); not called when save stops on first error. */
  onSuccess: () => void
}

export default function EmployeeBulkImportModal({ open, onClose, onSuccess }: Props) {
  const { showToast } = useToast()
  useModalScrollLock(open)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const inputRef = useRef<HTMLInputElement | null>(null)
  const applyIssuesRef = useRef<HTMLDivElement | null>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [applyErrors, setApplyErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    if (parseErrors.length + applyErrors.length > 0 && applyIssuesRef.current) {
      applyIssuesRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [parseErrors.length, applyErrors.length])

  const resetState = useCallback(() => {
    setFileLabel('')
    setParseErrors([])
    setParseWarnings([])
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
      setParseWarnings([])
      setApplyErrors([])
      setBusy(true)
      setProgress(null)

      try {
        const buf = await file.arrayBuffer()
        const XLSX = await import('@e965/xlsx')
        const workbook = XLSX.read(buf, { type: 'array' })
        const firstName = workbook.SheetNames[0]
        if (!firstName) {
          setParseErrors(['No sheets found in the workbook.'])
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message: 'Invalid workbook: no sheets found.',
          })
          setBusy(false)
          return
        }
        const sheet = workbook.Sheets[firstName]
        const matrix = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as unknown[][]

        const parsed = parseEmployeeImportMatrix(matrix)
        if (!parsed.ok) {
          setParseErrors(parsed.errors)
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message: 'Invalid or inconsistent spreadsheet format. Fix the issues below and try again.',
          })
          setBusy(false)
          return
        }

        setParseWarnings(parsed.warnings)
        if (parsed.warnings.length > 0) {
          showToast({
            variant: 'warning',
            title: 'Email column header',
            message: parsed.warnings[0] ?? 'Fix the email column name to import addresses.',
          })
        }

        const ids = parsed.rows.map((r) => r.input.employee_id)
        let deletedIds: Set<string>
        try {
          deletedIds = await getSoftDeletedEmployeeIds(ids)
        } catch (err) {
          logDevError('employeeBulkImport.deletedCheck', err)
          showToast({
            variant: 'error',
            message: getUserFacingMessage(err, 'Unable to verify deleted employees.'),
          })
          setBusy(false)
          return
        }

        const blocked = parsed.rows.filter((r) => deletedIds.has(r.input.employee_id))
        if (blocked.length > 0) {
          setParseErrors(
            blocked.map(
              (r) =>
                `Row ${r.rowNumber}: employee "${r.input.employee_id}" is in the Recycle Bin — restore before importing.`,
            ),
          )
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message:
              'One or more employee IDs are in the Recycle Bin. Restore those records before importing.',
          })
          setBusy(false)
          return
        }

        let inUse: Set<string>
        try {
          inUse = await getActiveEmployeeIdsInUse(ids)
        } catch (err) {
          logDevError('employeeBulkImport.existingCheck', err)
          showToast({
            variant: 'error',
            message: getUserFacingMessage(err, 'Unable to verify existing employees.'),
          })
          setBusy(false)
          return
        }

        const duplicateRows = parsed.rows.filter((r) => inUse.has(r.input.employee_id))
        if (duplicateRows.length > 0) {
          setParseErrors(
            duplicateRows.map(
              (r) =>
                `Row ${r.rowNumber}: employee ID "${r.input.employee_id}" already exists in the system.`,
            ),
          )
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message:
              'Duplicate employee data: one or more employee IDs already exist. No rows were imported.',
          })
          setBusy(false)
          return
        }

        const distinctEmails = [
          ...new Set(
            parsed.rows
              .map((r) => r.input.email?.trim())
              .filter((e): e is string => Boolean(e)),
          ),
        ]
        let emailsInDb: Set<string>
        try {
          emailsInDb = await getEmailsAlreadyInUse(distinctEmails)
        } catch (err) {
          logDevError('employeeBulkImport.emailCheck', err)
          showToast({
            variant: 'error',
            message: getUserFacingMessage(err, 'Unable to verify existing emails.'),
          })
          setBusy(false)
          return
        }

        const emailClashRows = parsed.rows.filter((r) => {
          const e = r.input.email?.trim()
          return Boolean(e && emailsInDb.has(e.toLowerCase()))
        })
        if (emailClashRows.length > 0) {
          setParseErrors(
            emailClashRows.map(
              (r) =>
                `Row ${r.rowNumber}: email "${r.input.email}" already exists in the system (another employee).`,
            ),
          )
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message:
              'One or more emails are already used by other employees. Fix the rows below or update those records instead.',
          })
          setBusy(false)
          return
        }

        const total = parsed.rows.length

        try {
          await bulkInsertEmployees(parsed.rows.map((r) => r.input))
        } catch (err) {
          logDevError('employeeBulkImport.bulk', err)
          const lines = humanizeBulkImportSaveError(err)
          if (mountedRef.current) {
            setApplyErrors([
              ...lines,
              'The import runs as a single database transaction: if anything fails, no rows are saved.',
            ])
          }
          showToast({
            variant: 'error',
            title: 'Import failed',
            message: `${lines[0] ?? 'Bulk import failed.'} No employees were saved.`,
          })
          return
        }
        showToast({
          variant: 'success',
          message: `Imported ${total} new employee${total === 1 ? '' : 's'}.`,
        })
        resetState()
        onSuccess()
        onClose()
      } catch (err) {
        logDevError('employeeBulkImport.file', err)
        if (mountedRef.current) {
          setParseErrors([getUserFacingMessage(err, 'Could not read the Excel file.')])
          showToast({
            variant: 'error',
            title: 'Import cancelled',
            message: 'Could not read the Excel file.',
          })
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
  const showFileLine = Boolean(fileLabel) && !busy && !parseErrors.length
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center overscroll-none bg-black/55 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-bulk-import-title"
        className="relative flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col rounded-2xl border border-base bg-app p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10 sm:p-6"
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
            <h3 id="employee-bulk-import-title" className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-primary">
              Bulk import employees
            </h3>
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
            <span>{busy ? 'Importing…' : 'Import from file'}</span>
          </button>

          {showFileLine ? (
            <p className="mt-3 text-sm text-muted">
              Selected: <span className="font-medium text-primary">{fileLabel}</span>
            </p>
          ) : null}

          {parseWarnings.length > 0 && !parseErrors.length ? (
            <div
              className="mt-5 max-h-40 overflow-y-auto rounded-xl border border-amber-500/40 bg-amber-500/[0.08] py-3 pl-4 pr-3 dark:border-amber-400/35 dark:bg-amber-400/[0.1]"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-semibold text-primary">Header notice</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-snug text-muted marker:text-amber-700 dark:marker:text-amber-400">
                {parseWarnings.map((line) => (
                  <li key={line} className="break-words pl-0.5">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {progress ? (
            <div className="mt-5 space-y-2" role="status" aria-live="polite" aria-busy="true">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-primary">Saving employees…</span>
                <span className="tabular-nums text-muted">
                  {progress.done} of {progress.total} ({pct}%)
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-surface-3"
                aria-hidden="true"
              >
                <div
                  className="h-full min-w-0 rounded-full bg-accent transition-[width] duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : null}

          {issueLines.length > 0 && (
            <div
              ref={issueLines.length > 0 ? applyIssuesRef : undefined}
              className="mt-5 max-h-52 overflow-y-auto rounded-xl border border-red-500/35 bg-red-500/[0.06] py-3 pl-4 pr-3 dark:border-red-400/35 dark:bg-red-400/[0.08]"
              role="region"
              aria-label="Import issues"
            >
              <p className="text-sm font-semibold text-primary">
                {parseErrors.length > 0 && applyErrors.length > 0
                  ? 'Validation and save issues'
                  : parseErrors.length > 0
                    ? 'Import was not applied — fix these in your file'
                    : 'Import failed — no rows were saved'}
              </p>
              <ul className="mt-2.5 list-disc space-y-2 pl-5 text-sm leading-snug text-muted marker:text-red-600 dark:marker:text-red-400">
                {issueLines.slice(0, 80).map((line) => (
                  <li key={line} className="break-words pl-0.5">
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
            href={EMPLOYEE_IMPORT_TEMPLATE_HREF}
            download
            className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 transition hover:decoration-accent"
          >
            <span className="inline-flex h-4 w-4 shrink-0" aria-hidden="true">
              <AnimatedNavIcon name="download" className="h-4 w-4" />
            </span>
            Download bulk import employee sample file
          </a>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
