import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { getSession, hasActiveItOpsAccess } from '../../api'
import { fetchEnveloped } from '../../utils/apiEnvelope'
import { useToast } from '../common/ToastProvider'
import { startTelemetryBuffer, stopTelemetryBuffer } from '../../telemetry'

// ── Types ──────────────────────────────────────────────────────────────────────

type TelemetryEventRow = {
  table_source?: string
  id?: number
  source?: string
  event_id?: string
  event_name?: string
  environment?: string
  priority?: string
  route_pattern?: string | null
  method?: string | null
  status_code?: number | null
  duration_ms?: number | null
  error_category?: string | null
  operation_name?: string | null
  table_or_rpc?: string | null
  actor_role?: string | null
  session_id?: string | null
  request_id?: string | null
  trace_id?: string | null
  sample_rate?: number | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

type CachedState = { events: TelemetryEventRow[]; offset: number; hasMore: boolean }



type EventDeleteTarget = { table_source: string; id: number }

// ── Session cache ──────────────────────────────────────────────────────────────

const SESSION_KEY = 'ams.telemetry.analysis.v1'

function readCache(): CachedState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as CachedState) : null
  } catch { return null }
}
function writeCache(s: CachedState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* quota */ }
}
function clearCache() { sessionStorage.removeItem(SESSION_KEY) }

// ── Formatters ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleString()
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: 'Validation error (bad request)',
  auth: 'Authentication failed',
  forbidden: 'Access forbidden',
  not_found: 'Resource not found',
  dependency: 'Upstream dependency unavailable',
  timeout: 'Request timed out',
  rate_limit: 'Rate limit exceeded',
  server_error: 'Internal server error',
  unknown: 'Unknown error',
}

// ── Badge components ───────────────────────────────────────────────────────────

function StatusDot({ tableSource, statusCode }: { tableSource?: string; statusCode?: number | null }) {
  const ok = tableSource === 'success' || (statusCode != null && statusCode < 400)
  const err = tableSource === 'error' || (statusCode != null && statusCode >= 400)
  if (ok) return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/15 text-green-500">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
  if (err) return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-500">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </span>
  )
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3">
      <span className="h-1.5 w-1.5 rounded-full bg-subtle" />
    </span>
  )
}

const METHOD_CLS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-400',
  POST: 'bg-green-500/10 text-green-400',
  PUT: 'bg-amber-500/10 text-amber-400',
  PATCH: 'bg-amber-500/10 text-amber-400',
  DELETE: 'bg-red-500/10 text-red-400',
}
function MethodBadge({ m }: { m?: string | null }) {
  if (!m) return <span className="text-subtle">-</span>
  const cls = METHOD_CLS[m.toUpperCase()] ?? 'bg-surface-3 text-muted'
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${cls}`}>{m.toUpperCase()}</span>
}

function StatusBadge({ code }: { code?: number | null }) {
  if (code == null) return <span className="text-subtle">-</span>
  let cls = 'bg-surface-3 text-muted'
  if (code >= 200 && code < 300) cls = 'bg-green-500/10 text-green-400'
  else if (code >= 300 && code < 400) cls = 'bg-blue-500/10 text-blue-400'
  else if (code >= 400 && code < 500) cls = 'bg-amber-500/10 text-amber-400'
  else if (code >= 500) cls = 'bg-red-500/10 text-red-400'
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${cls}`}>{code}</span>
}

const PRIORITY_CLS: Record<string, string> = {
  HIGH: 'bg-red-500/10 text-red-400',
  MEDIUM: 'bg-amber-500/10 text-amber-400',
  LOW: 'bg-surface-3 text-subtle',
}
function PriorityBadge({ p }: { p?: string }) {
  if (!p) return <span className="text-subtle">-</span>
  const cls = PRIORITY_CLS[p.toUpperCase()] ?? 'bg-surface-3 text-muted'
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{p}</span>
}



// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ ev, onDelete }: { ev: TelemetryEventRow; onDelete: (t: EventDeleteTarget) => void }) {
  const userId = (ev.metadata as Record<string, unknown> | null | undefined)?.user_id
  const errorMsg = ev.error_category ? (ERROR_MESSAGES[ev.error_category] ?? ev.error_category) : null
  const isFailure = ev.table_source === 'error' || (ev.status_code != null && ev.status_code >= 400)

  const rows: [string, string | null | undefined][] = [
    ['Event ID', ev.event_id],
    ['Source', ev.source],
    ['Event Name', ev.event_name],
    ['User ID', userId != null ? String(userId) : null],
    ['Session ID', ev.session_id],
    ['Request ID', ev.request_id],
    ['Trace ID', ev.trace_id],
    ['Role', ev.actor_role],
    ['Environment', ev.environment],
    ['Sample Rate', ev.sample_rate != null ? `${(ev.sample_rate * 100).toFixed(0)}%` : null],
    ['Operation', ev.operation_name],
    ['Table / RPC', ev.table_or_rpc],
    ['Created', ev.created_at ? new Date(ev.created_at).toLocaleString() : null],
  ]

  if (isFailure && errorMsg) rows.splice(3, 0, ['Error', errorMsg])

  const metaStr = ev.metadata && Object.keys(ev.metadata).length > 0
    ? JSON.stringify(ev.metadata, null, 2)
    : null

  return (
    <div className="border-t border-base bg-surface px-5 py-4">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-subtle">{label}</span>
              <span className="break-all font-mono text-xs text-primary">{value}</span>
            </div>
          ) : null,
        )}
      </div>

      {metaStr && (
        <div className="mt-4">
          <span className="text-[10px] uppercase tracking-wider text-subtle">Metadata</span>
          <pre className="mt-1 max-h-32 overflow-auto rounded-lg border border-base bg-surface-2 p-3 text-xs text-muted">
            {metaStr}
          </pre>
        </div>
      )}

      {ev.id != null && ev.table_source && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onDelete({ table_source: ev.table_source!, id: ev.id! })}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1.5 3h9M4 3V2h4v1M5 5v4M7 5v4M2 3l.5 7h7L10 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete event
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TelemetryAnalysis() {
  const backendBase = useMemo(() => {
    const v = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
    return v && v.length > 0 ? v.replace(/\/+$/, '') : 'http://localhost:8000'
  }, [])

  const pageSize = 50

  // Data state
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<TelemetryEventRow[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Selection state
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // Telemetry toggle state (persisted to localStorage)
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(() =>
    localStorage.getItem('ams.telemetry.enabled') !== 'false',
  )


  const { showToast } = useToast()

  const didInit = useRef(false)

  // ── Escape key to exit selection mode ───────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectMode) {
        setSelectMode(false)
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectMode])

  // ── Auth helper ─────────────────────────────────────────────────────────────

  async function getAuthToken(): Promise<string> {
    const allowed = await hasActiveItOpsAccess()
    if (!allowed) throw new Error('IT Ops access required.')
    const session = await getSession()
    const token = session?.access_token?.trim()
    if (!token) throw new Error('Missing session token.')
    return token
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const cached = readCache()
    if (cached?.events.length) {
      setEvents(cached.events)
      setOffset(cached.offset)
      setHasMore(cached.hasMore ?? true) // Preserve hasMore from cache, default to true
      setFromCache(true)
      return
    }
    void fetchPage(0, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendBase])

  async function fetchPage(pageOffset: number, accumulated: TelemetryEventRow[]) {
    setLoading(true)
    setFromCache(false)
    try {
      const token = await getAuthToken()
      const { data } = await fetchEnveloped<{ events?: TelemetryEventRow[] }>(
        `${backendBase}/analysis?limit=${pageSize}&offset=${pageOffset}`,
        { headers: { authorization: `Bearer ${token}` } },
      )
      const next = Array.isArray(data.events) ? data.events : []
      const all = [...accumulated, ...next]
      const canLoadMore = next.length === pageSize
      setEvents(all)
      // Offset always stays at 0 for infinite scroll (where accumulated data starts)
      // Only update on first fetch
      if (pageOffset === 0) {
        setOffset(0)
      }
      setHasMore(canLoadMore)
      writeCache({ events: all, offset: 0, hasMore: canLoadMore })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load telemetry data.'
      showToast({ variant: 'error', title: 'Load failed', message: msg })
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteEvents(targets: EventDeleteTarget[]) {
    if (!targets.length) return
    setDeleting(true)
    try {
      const token = await getAuthToken()
      await fetchEnveloped(`${backendBase}/analysis/bulk`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ targets }),
      })
      setEvents(prev =>
        prev.filter(
          e => !targets.some(t => t.table_source === e.table_source && t.id === e.id),
        ))
      setSelected(new Set())
      setSelectMode(false)
      setExpanded(null)
      clearCache()
      showToast({ variant: 'success', message: `${targets.length} event${targets.length > 1 ? 's' : ''} deleted` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed.'
      showToast({ variant: 'error', title: 'Delete failed', message: msg })
    } finally {
      setDeleting(false)
    }
  }

  function handleDeleteSingle(t: EventDeleteTarget) {
    void deleteEvents([t])
  }

  function handleBulkDelete() {
    const targets: EventDeleteTarget[] = events
      .filter(
        e =>
          e.id != null
          && e.table_source
          && selected.has(rowKey(e)),
      )
      .map(e => ({ table_source: e.table_source!, id: e.id! }))
    void deleteEvents(targets)
  }

  // ── Telemetry toggle ─────────────────────────────────────────────────────────

  function toggleTelemetry() {
    const next = !telemetryEnabled
    setTelemetryEnabled(next)
    localStorage.setItem('ams.telemetry.enabled', String(next))
    if (next) {
      startTelemetryBuffer()
    } else {
      stopTelemetryBuffer()
    }
    showToast({ variant: 'success', message: `Telemetry ${next ? 'enabled' : 'disabled'}` })
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  function rowKey(ev: TelemetryEventRow) {
    return ev.event_id ?? String(ev.id ?? Math.random())
  }

  function toggleRow(id: string) {
    setExpanded(prev => (prev === id ? null : id))
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  const allKeys = events.map(rowKey)
  const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k))
  const someSelected = !allSelected && allKeys.some(k => selected.has(k))

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allKeys))
    }
  }

  const loadMore = () => { if (!loading && hasMore) void fetchPage(offset + pageSize, events) }
  const refresh = () => {
    clearCache()
    setEvents([])
    setOffset(0)
    setHasMore(true)
    setExpanded(null)
    setSelected(new Set())
    setSelectMode(false)
    void fetchPage(0, [])
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const colCount = selectMode ? 9 : 8

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">API Event Feed</h2>
            <p className="mt-0.5 text-sm text-muted">
              Server API calls captured by the internal telemetry pipeline.
              {fromCache && (
                <span className="ml-2 text-xs text-subtle italic">
                  From session cache —{' '}
                  <button type="button" onClick={refresh} className="text-accent hover:underline">
                    refresh
                  </button>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Telemetry toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Telemetry</span>
              <button
                type="button"
                role="switch"
                aria-checked={telemetryEnabled}
                onClick={toggleTelemetry}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${telemetryEnabled ? 'bg-green-500' : 'bg-slate-500'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${telemetryEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-base bg-surface px-3 py-2 text-sm text-muted transition hover:bg-surface-3 disabled:opacity-50"
            >
              <svg
                width="13" height="13" viewBox="0 0 13 13" fill="none"
                className={loading ? 'animate-spin' : ''}
              >
                <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M6.5 2L8.5 4H4.5L6.5 2Z" fill="currentColor" />
              </svg>
              Refresh
            </button>
          </div>
        </div>



        {/* Table */}
        <section className="overflow-hidden rounded-xl border border-base bg-surface-2">
          {/* Table toolbar */}
          <div className="flex items-center justify-between gap-4 border-b border-base px-5 py-3">
            {selectMode ? (
              <>
                <span className="text-sm font-medium text-primary">
                  {selected.size} event{selected.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 cursor-pointer accent-accent"
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="rounded-lg border border-base bg-surface px-3 py-1.5 text-xs text-muted transition hover:bg-surface-3"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-primary">
                  Events <span className="text-subtle">({events.length})</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle">
                    {loading ? 'Loading…' : hasMore ? 'More available' : 'All loaded'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectMode(true)}
                    title="Manage events"
                    className="flex items-center gap-1.5 rounded-lg border border-base bg-surface px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-3"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5.5 5.5v4M7.5 5.5v4M2.5 3.5l.5 7.5h7l.5-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-base text-[10px] uppercase tracking-widest text-subtle">
                  {selectMode && (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 cursor-pointer accent-accent"
                      />
                    </th>
                  )}
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-3 py-3">Endpoint</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-5 py-3 text-right">Time</th>
                  <th className="w-8 px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {/* Skeleton */}
                {loading && Array.from({ length: 50 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-base last:border-0">
                    {Array.from({ length: colCount }).map((__, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3.5 animate-pulse rounded bg-surface-3" />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Empty */}
                {!loading && events.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-5 py-12 text-center text-sm text-muted">
                      No telemetry events found.
                    </td>
                  </tr>
                )}

                {/* Rows */}
                {events.map(ev => {
                  const key = rowKey(ev)
                  const isOpen = expanded === key
                  const isSel = selected.has(key)
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`border-b border-base last:border-0 transition-colors
                          ${isSel ? 'bg-accent/5' : isOpen ? 'bg-surface' : 'hover:bg-surface'}`}
                      >
                        {/* Checkbox (only in select mode) */}
                        {selectMode && (
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSelect(key)}
                              className="h-3.5 w-3.5 cursor-pointer accent-accent"
                            />
                          </td>
                        )}

                        {/* Status dot */}
                        <td className="cursor-pointer px-2 py-3" onClick={() => toggleRow(key)}>
                          <StatusDot tableSource={ev.table_source} statusCode={ev.status_code} />
                        </td>

                        <td className="cursor-pointer px-3 py-3" onClick={() => toggleRow(key)}>
                          <MethodBadge m={ev.method} />
                        </td>

                        <td className="max-w-[220px] cursor-pointer px-3 py-3" onClick={() => toggleRow(key)}>
                          <span title={ev.route_pattern ?? undefined} className="block truncate font-mono text-xs text-primary">
                            {ev.route_pattern ?? ev.event_name ?? '-'}
                          </span>
                        </td>

                        <td className="cursor-pointer px-3 py-3" onClick={() => toggleRow(key)}>
                          <StatusBadge code={ev.status_code} />
                        </td>

                        <td className="cursor-pointer px-3 py-3 text-xs tabular-nums text-muted" onClick={() => toggleRow(key)}>
                          {formatDuration(ev.duration_ms)}
                        </td>

                        <td className="cursor-pointer px-3 py-3" onClick={() => toggleRow(key)}>
                          <PriorityBadge p={ev.priority} />
                        </td>

                        <td className="cursor-pointer whitespace-nowrap px-5 py-3 text-right text-xs text-subtle" onClick={() => toggleRow(key)}>
                          {relativeTime(ev.created_at)}
                        </td>

                        {/* Expand chevron */}
                        <td className="cursor-pointer px-3 py-3 text-subtle" onClick={() => toggleRow(key)}>
                          <svg
                            width="14" height="14" viewBox="0 0 14 14" fill="none"
                            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          >
                            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-base last:border-0">
                          <td colSpan={colCount} className="p-0">
                            <DetailPanel ev={ev} onDelete={handleDeleteSingle} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 border-t border-base px-5 py-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading || !hasMore}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Loading…' : hasMore ? 'Load more' : 'No more data'}
            </button>
            <span className="text-xs text-subtle">
              Items: {events.length} · Page size: {pageSize} {hasMore ? '· More available' : '· All loaded'}
            </span>
          </div>
        </section>

        {/* Floating bulk-delete action bar */}
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ease-out ${selectMode && selected.size > 0
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-4 opacity-0'
            }`}
        >
          <div className="flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-surface/90 px-5 py-3 shadow-2xl backdrop-blur-md">
            <span className="text-sm font-medium text-amber-300">
              {selected.size} event{selected.size !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-subtle transition hover:text-muted"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5.5 5.5v4M7.5 5.5v4M2.5 3.5l.5 7.5h7l.5-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {deleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
