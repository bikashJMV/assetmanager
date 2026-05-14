import { useCallback, useEffect, useState } from "react"
import {
  deleteRecycleBinEntryPermanently,
  listRecycleBinEntries,
  restoreRecycleBinEntry,
  type RecycleBinEntry,
} from "../../api"
import { FEATURES } from "../../utils/featureFlags"
import ConfirmDialog from "../common/ConfirmDialog"
import RefreshButton from "../common/RefreshButton"
import InfoHint from "../common/InfoHint"
import recycleBinInfoHint from "../../data/recyclebin.json"
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from "../../utils/errors"
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader"
import { useToast } from "../../hooks/useToast"

type RecycleBinPageInfoHint = {
  panelTitle: string
  ariaLabel: string
  sections: { heading: string; bullets: string[] }[]
}

const RECYCLE_BIN_PAGE_INFO_HINT = recycleBinInfoHint as RecycleBinPageInfoHint

function payloadString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  if (typeof v === "string" && v.trim()) return v.trim()
  return ""
}

function firstNameFromFullName(full: string): string {
  const t = full.trim()
  if (!t) return ""
  return t.split(/\s+/)[0] ?? t
}

function formatDeletedItem(entry: RecycleBinEntry): string {
  const p = entry.payload ?? {}
  if (entry.entity_type === "employee") {
    const name = payloadString(p, "name")
    const code = payloadString(p, "employee_id") || entry.label.trim() || ""
    const first = firstNameFromFullName(name)
    if (first && code) return `${first} / ${code}`
    if (code && name) return `${firstNameFromFullName(name)} / ${code}`
    if (code) return code
    if (name) return name
    return entry.label.trim() || "—"
  }
  const tag = payloadString(p, "asset_tag") || entry.label.trim()
  const model = payloadString(p, "model")
  if (model && tag) return `${model} / ${tag}`
  if (tag) return tag
  if (model) return model
  return entry.label.trim() || "—"
}

function formatDeletedByActor(entry: RecycleBinEntry): string {
  const name = entry.deleted_by_employee_name?.trim() || ""
  const idCode = entry.deleted_by_employee_id_code?.trim() || ""
  const first = firstNameFromFullName(name)
  if (first && idCode) return `${first} / ${idCode}`
  if (name && idCode) return `${name} / ${idCode}`
  if (name) return name
  if (idCode) return idCode
  return "—"
}

export default function RecycleBin() {
  const [rows, setRows] = useState<RecycleBinEntry[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [purgingId, setPurgingId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<RecycleBinEntry | null>(null)
  const { showToast } = useToast()
  const { loading, error, setError, run } = useRefreshableLoader({
    defaultErrorMessage: "Unable to load recycle bin right now.",
    onError: (err) => {
      logDevError("recycleBin.load", err)
    },
  })

  const load = useCallback(async () => {
    await run(async () => {
      const data = await listRecycleBinEntries()
      setRows(data)
    })
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  const handleRestore = async (entryId: string) => {
    setRestoringId(entryId)
    setError("")
    try {
      await restoreRecycleBinEntry(entryId)
      await load()
      showToast({ message: "Item restored successfully.", variant: "success" })
    } catch (err) {
      logDevError("recycleBin.restore", err)
      const debugDetail = getErrorDebugDetail(err)
      setError(debugDetail || getUserFacingMessage(err, "Unable to restore item right now."))
    } finally {
      setRestoringId(null)
    }
  }

  const handleConfirmPermanentDelete = async () => {
    if (!purgeTarget) return
    const entry = purgeTarget
    setPurgingId(entry.entry_id)
    setError("")
    try {
      await deleteRecycleBinEntryPermanently(entry.entry_id)
      setPurgeTarget(null)
      await load()
      showToast({ message: "Item permanently removed.", variant: "success" })
    } catch (err) {
      logDevError("recycleBin.permanentDelete", err)
      const debugDetail = getErrorDebugDetail(err)
      setError(debugDetail || getUserFacingMessage(err, "Unable to permanently delete this item."))
    } finally {
      setPurgingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl ">
        <header className=" p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Soft Deleted Records</h1> 
              <p className=" text-sm text-muted">
                Entries do not expire automatically. You can restore at any time for more info look at the help icon.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <InfoHint
                panelTitle={RECYCLE_BIN_PAGE_INFO_HINT.panelTitle}
                ariaLabel={RECYCLE_BIN_PAGE_INFO_HINT.ariaLabel}
                className="shrink-0"
              >
                {RECYCLE_BIN_PAGE_INFO_HINT.sections.map((section) => (
                  <div key={section.heading}>
                    <p className="font-medium text-primary">{section.heading}</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {section.bullets.map((text, i) => (
                        <li key={`${section.heading}-${i}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </InfoHint>
              <RefreshButton
                onClick={() => {
                  void load()
                }}
                loading={loading}
                iconOnly
                ariaLabel="Refresh Recycle Bin"
                title={loading ? "Refreshing recycle bin" : "Refresh recycle bin"}
                className="shrink-0"
              />
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-xl border border-base bg-surface px-4 py-3 text-sm text-accent">
            {error}
          </section>
        ) : null}
        <section className="overflow-x-auto rounded-xl border border-base bg-surface">
          <table className="w-full min-w-[860px] text-sm text-left">
            <thead className="bg-surface-2 text-subtle text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Deleted item</th>
                <th className="px-4 py-3">Deleted at</th>
                <th className="px-4 py-3">Deleted by</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.entry_id} className="border-t border-base">
                  <td className="px-4 py-3 uppercase text-xs">{entry.entity_type}</td>
                  <td className="px-4 py-3">{formatDeletedItem(entry)}</td>
                  <td className="px-4 py-3">{new Date(entry.deleted_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{formatDeletedByActor(entry)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRestore(entry.entry_id)}
                        disabled={restoringId === entry.entry_id || purgingId === entry.entry_id}
                        className="rounded-lg border border-base px-3 py-1.5 text-xs font-semibold hover:bg-surface-3 transition disabled:opacity-60"
                      >
                        {restoringId === entry.entry_id ? "Restoring..." : "Restore"}
                      </button>
                      {FEATURES.RECYCLE_BIN && (
                        <button
                          type="button"
                          onClick={() => setPurgeTarget(entry)}
                          disabled={restoringId === entry.entry_id || purgingId === entry.entry_id}
                          title="Permanently remove this record (opens confirmation)"
                          className="rounded-lg border-2 border-red-600/80 bg-surface px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500 dark:bg-surface-2 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          {purgingId === entry.entry_id ? "Removing..." : "Delete permanently"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-subtle">
                    Recycle Bin is empty.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {FEATURES.RECYCLE_BIN && (
          <ConfirmDialog
            open={Boolean(purgeTarget)}
            title="Delete permanently"
            message={
              purgeTarget
                ? `This cannot be undone. Permanently remove this ${purgeTarget.entity_type} from the database: ${formatDeletedItem(purgeTarget)}?`
                : ""
            }
            confirmLabel="Delete permanently"
            loading={Boolean(purgingId)}
            showDismissIcon
            onClose={() => { if (!purgingId) setPurgeTarget(null) }}
            onConfirm={() => void handleConfirmPermanentDelete()}
          />
        )}
      </div>
    </main>
  )
}

