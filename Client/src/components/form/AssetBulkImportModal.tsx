import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from '@e965/xlsx'
import { bulkInsertAssets } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import {
  ASSET_IMPORT_MAX_ROWS,
  ASSET_IMPORT_TEMPLATE_HREF,
  type AssetImportParsedRow,
  type HeaderMappingEntry,
  parseAssetImportMatrix,
} from '../../utils/assetBulkImport'
import { useModalScrollLock } from '../../hooks/useModalScrollLock'
import { ModalPortal } from '../common/ModalPortal'
import { useToast } from '../../hooks/useToast'
import AnimatedNavIcon from '../common/AnimatedNavIcon'

const ACCEPT =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

function pickSheetName(sheetNames: string[]): string | null {
  const imp = sheetNames.find((n) => n.trim().toLowerCase() === 'import')
  return imp ?? sheetNames[0] ?? null
}

type Phase =
  | { name: 'idle' }
  | { name: 'preview'; rows: AssetImportParsedRow[]; mapping: HeaderMappingEntry[]; fileName: string }
  | { name: 'importing' }
  | { name: 'error'; errors: string[]; mapping?: HeaderMappingEntry[] }
  | { name: 'success'; inserted: number }

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  defaultCategorySlug?: string
}

export default function AssetBulkImportModal({ open, onClose, onSuccess, defaultCategorySlug }: Props) {
  const { showToast } = useToast()
  useModalScrollLock(open)
  const mountedRef = useRef(true)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) setPhase({ name: 'idle' })
  }, [open])

  const handleClose = useCallback(() => {
    if (phase.name === 'importing') return
    if (inputRef.current) inputRef.current.value = ''
    setPhase({ name: 'idle' })
    onClose()
  }, [phase.name, onClose])

  // ── Step 1: read file, parse, show preview ──────────────────────────────────
  const handleFilePicked = useCallback(
    async (file: File) => {
      if (inputRef.current) inputRef.current.value = ''
      try {
        const buf = await file.arrayBuffer()
        const workbook = XLSX.read(buf, { type: 'array' })
        const sheetName = pickSheetName(workbook.SheetNames)
        if (!sheetName) {
          setPhase({ name: 'error', errors: ['No sheets found in the workbook.'] })
          return
        }
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          setPhase({ name: 'error', errors: [`Sheet "${sheetName}" is missing.`] })
          return
        }
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][]

        const parsed = parseAssetImportMatrix(matrix, { defaultCategorySlug })
        if (!parsed.ok) {
          setPhase({ name: 'error', errors: parsed.errors, mapping: parsed.headerMapping })
          return
        }
        setPhase({ name: 'preview', rows: parsed.rows, mapping: parsed.headerMapping, fileName: file.name })
      } catch (err) {
        logDevError('assetBulkImport.file', err)
        setPhase({ name: 'error', errors: [getUserFacingMessage(err, 'Could not read the Excel file.')] })
      }
    },
    [defaultCategorySlug],
  )

  const onPickFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const lower = file.name.toLowerCase()
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        showToast({ variant: 'warning', message: 'Please choose an Excel file (.xlsx or .xls).' })
        return
      }
      void handleFilePicked(file)
    },
    [handleFilePicked, showToast],
  )

  // ── Step 2: user confirms → atomic RPC call ─────────────────────────────────
  const runImport = useCallback(async () => {
    if (phase.name !== 'preview') return
    const { rows } = phase
    setPhase({ name: 'importing' })

    try {
      const inputs = rows.map((r) => r.input)
      const result = await bulkInsertAssets(inputs)
      if (!mountedRef.current) return

      if (result.inserted === 0) {
        setPhase({ name: 'error', errors: ['No assets were saved. All rows failed on the server.'] })
        showToast({ variant: 'error', title: 'Import failed', message: 'No assets were saved.', durationMs: 0 })
        return
      }

      setPhase({ name: 'success', inserted: result.inserted })
      showToast({ variant: 'success', message: `Imported ${result.inserted} new asset${result.inserted === 1 ? '' : 's'}.` })
      onSuccess()
    } catch (err) {
      logDevError('assetBulkImport.rpc', err)
      if (!mountedRef.current) return
      const msg = getUserFacingMessage(err, 'Import failed — no assets were saved.')
      setPhase({ name: 'error', errors: [msg] })
      showToast({
        variant: 'error',
        title: 'Import failed',
        message: 'No assets were saved. See details below.',
        durationMs: 0,
      })
    }
  }, [phase, onSuccess, showToast])

  if (!open) return null

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center overscroll-none bg-black/55 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-bulk-import-title"
        className="relative flex max-h-[min(92dvh,680px)] w-full max-w-lg flex-col rounded-2xl border border-base bg-app p-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10 sm:p-6"
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          disabled={phase.name === 'importing'}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="sr-only">Close</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="shrink-0 pr-11 pt-0 sm:pr-12">
          <h3 id="asset-bulk-import-title" className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-primary">
            Bulk import assets
          </h3>
          <p className="mt-1 text-sm text-muted">
            Column names are matched flexibly — e.g. “Brand”, “Sr No”, “Category”. Short headers like “Type” or “Vendor”
            map to custom fields; use category_slug / manufacturer_name for category and manufacturer.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 space-y-4">

          {/* ── Idle: file picker ── */}
          {phase.name === 'idle' && (
            <>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
              >
                <span className="inline-flex h-5 w-5 shrink-0 text-white" aria-hidden="true">
                  <AnimatedNavIcon name="upload" className="h-5 w-5 text-[color:var(--on-accent)]" />
                </span>
                <span>Choose Excel file</span>
              </button>
            </>
          )}

          {/* ── Preview: column mapping + row count ── */}
          {phase.name === 'preview' && (
            <>
              <div className="rounded-xl border border-base bg-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                  Detected columns — {phase.fileName}
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {phase.mapping.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-primary truncate max-w-[140px]" title={entry.raw}>
                        "{entry.raw}"
                      </span>
                      <span className="text-subtle shrink-0">→</span>
                      {entry.isForbidden ? (
                        <span className="text-accent font-medium">not allowed</span>
                      ) : entry.isFreeForm ? (
                        <span className="font-mono text-muted">{entry.canonical} <span className="italic text-subtle">(custom_fields)</span></span>
                      ) : (
                        <span className="font-mono text-primary">{entry.canonical}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-green-500/30 bg-green-500/[0.06] dark:bg-green-400/[0.08] px-4 py-3">
                <p className="text-sm font-semibold text-primary">
                  Ready to import {phase.rows.length} asset{phase.rows.length === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  All {phase.rows.length} rows passed validation. The import is atomic — if anything fails on the
                  server, nothing will be saved.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => { setPhase({ name: 'idle' }); if (inputRef.current) inputRef.current.value = '' }}
                  className="flex-1 border border-base bg-surface text-primary py-2 rounded-lg hover:bg-surface-2 transition text-sm"
                >
                  ← Pick a different file
                </button>
                <button
                  type="button"
                  onClick={() => void runImport()}
                  className="flex-1 bg-accent text-white font-semibold py-2 rounded-lg hover:bg-accent-hover transition text-sm shadow-accent"
                >
                  Import {phase.rows.length} asset{phase.rows.length === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}

          {/* ── Importing: spinner ── */}
          {phase.name === 'importing' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3" role="status" aria-live="polite" aria-busy="true">
              <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="text-sm text-muted">Saving assets… do not close this window.</p>
            </div>
          )}

          {/* ── Success ── */}
          {phase.name === 'success' && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/[0.06] dark:bg-green-400/[0.08] px-4 py-4 text-center">
              <p className="text-lg font-semibold text-primary">
                {phase.inserted} asset{phase.inserted === 1 ? '' : 's'} imported
              </p>
              <p className="text-sm text-muted mt-1">All rows were saved successfully.</p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-4 bg-accent text-white font-semibold px-6 py-2 rounded-lg hover:bg-accent-hover transition text-sm shadow-accent"
              >
                Done
              </button>
            </div>
          )}

          {/* ── Error: parse or RPC errors ── */}
          {phase.name === 'error' && (
            <>
              {phase.mapping && phase.mapping.length > 0 && (
                <div className="rounded-xl border border-base bg-surface p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">Detected columns</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {phase.mapping.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-primary truncate max-w-[140px]" title={entry.raw}>
                          "{entry.raw}"
                        </span>
                        <span className="text-subtle shrink-0">→</span>
                        {entry.isForbidden ? (
                          <span className="text-accent font-medium">not allowed</span>
                        ) : entry.isFreeForm ? (
                          <span className="font-mono text-muted">{entry.canonical} <span className="italic text-subtle">(custom_fields)</span></span>
                        ) : (
                          <span className="font-mono text-primary">{entry.canonical}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="max-h-52 overflow-y-auto rounded-xl border border-red-500/35 bg-red-500/[0.06] py-3 pl-4 pr-3 dark:border-red-400/35 dark:bg-red-400/[0.08]"
                role="region"
                aria-label="Import errors"
              >
                <p className="text-sm font-semibold text-primary">
                  Import was not applied — fix these issues in your file
                </p>
                <ul className="mt-2.5 list-disc space-y-2 pl-5 text-sm leading-snug text-muted marker:text-red-600 dark:marker:text-red-400">
                  {phase.errors.slice(0, 80).map((line, idx) => (
                    <li key={`${idx}-${line.slice(0, 48)}`} className="break-words pl-0.5">
                      {line}
                    </li>
                  ))}
                </ul>
                {phase.errors.length > 80 && (
                  <p className="mt-3 text-xs text-subtle">Showing the first 80 errors.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setPhase({ name: 'idle' }); if (inputRef.current) inputRef.current.value = '' }}
                  className="flex-1 border border-base bg-surface text-primary py-2 rounded-lg hover:bg-surface-2 transition text-sm"
                >
                  ← Try again
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 shrink-0 border-t border-base pt-4">
          <a
            href={ASSET_IMPORT_TEMPLATE_HREF}
            download
            className="inline-flex items-center gap-2 text-sm font-medium text-accent underline decoration-accent/50 underline-offset-2 transition hover:decoration-accent"
          >
            <span className="inline-flex h-4 w-4 shrink-0" aria-hidden="true">
              <AnimatedNavIcon name="download" className="h-4 w-4" />
            </span>
            Download bulk import sample file
          </a>
          <p className="mt-2 text-xs text-subtle">
            Max {ASSET_IMPORT_MAX_ROWS} rows per import. Only <span className="text-primary font-medium">serial_number</span> and <span className="text-primary font-medium">category</span> are required per row.
          </p>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
