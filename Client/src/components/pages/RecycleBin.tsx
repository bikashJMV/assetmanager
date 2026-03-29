import { useCallback, useEffect, useState } from 'react'
import { listRecycleBinEntries, restoreRecycleBinEntry, type RecycleBinEntry } from '../../api'
import RefreshButton from '../common/RefreshButton'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { useRefreshableLoader } from '../../hooks/useRefreshableLoader'

export default function RecycleBin() {
  const [rows, setRows] = useState<RecycleBinEntry[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const { loading, error, setError, run } = useRefreshableLoader({
    defaultErrorMessage: 'Unable to load recycle bin right now.',
    onError: (err) => {
      logDevError('recycleBin.load', err)
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
    setError('')
    setSuccessMessage('')
    try {
      await restoreRecycleBinEntry(entryId)
      await load()
      setSuccessMessage('Item restored successfully.')
    } catch (err) {
      logDevError('recycleBin.restore', err)
      const debugDetail = getErrorDebugDetail(err)
      setError(debugDetail || getUserFacingMessage(err, 'Unable to restore item right now.'))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl border border-base bg-surface-2 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-subtle">Recycle Bin</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Soft Deleted Records</h1>
              <p className="mt-2 text-sm text-muted">
                Entries do not expire automatically. Admin and IT Ops can restore at any time.
              </p>
            </div>
            <RefreshButton onClick={() => void load()} loading={loading} />
          </div>
        </header>

        {error ? (
          <section className="rounded-xl border border-base bg-surface px-4 py-3 text-sm text-accent">
            {error}
          </section>
        ) : null}
        {successMessage ? (
          <section className="rounded-xl border border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)]/15 px-4 py-3 text-sm text-primary">
            {successMessage}
          </section>
        ) : null}

        <section className="overflow-x-auto rounded-xl border border-base bg-surface">
          <table className="w-full min-w-[980px] text-sm text-left">
            <thead className="bg-surface-2 text-subtle text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Deleted At</th>
                <th className="px-4 py-3">Deleted By Employee ID</th>
                <th className="px-4 py-3">Deleted By</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.entry_id} className="border-t border-base">
                  <td className="px-4 py-3 uppercase text-xs">{entry.entity_type}</td>
                  <td className="px-4 py-3">{entry.label}</td>
                  <td className="px-4 py-3">{new Date(entry.deleted_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{entry.deleted_by_employee_id}</td>
                  <td className="px-4 py-3">
                    {entry.deleted_by_employee_name || '-'}
                    {entry.deleted_by_employee_code ? ` (${entry.deleted_by_employee_code})` : ''}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleRestore(entry.entry_id)}
                      disabled={restoringId === entry.entry_id}
                      className="rounded-lg border border-base px-3 py-1.5 text-xs font-semibold hover:bg-surface-3 transition disabled:opacity-60"
                    >
                      {restoringId === entry.entry_id ? 'Restoring...' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-subtle">
                    Recycle Bin is empty.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
