import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchLokiLogs, type LogEntry } from '../../api/logsApi'
import { useToast } from '../../hooks/useToast'
import DataPagination from '../common/DataPagination'

const LEVELS = ['error', 'warn', 'info', 'debug'] as const
type Level = typeof LEVELS[number]

const LEVEL_LABEL: Record<Level, string> = { error: 'Error', warn: 'Warn', info: 'Info', debug: 'Debug' }

const LEVEL_ACTIVE: Record<Level, string> = {
  error: 'bg-red-500/15 border-red-500/50 text-red-400',
  warn:  'bg-amber-500/15 border-amber-500/50 text-amber-400',
  info:  'bg-blue-500/15 border-blue-500/50 text-blue-400',
  debug: 'bg-surface-3 border-base text-muted',
}

const LEVEL_IDLE = 'bg-surface border-base text-muted hover:text-primary hover:bg-surface-3'

function toDatetimeLocal(date: Date): string {
  return date.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM"
}

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [level, setLevel] = useState<Level | ''>('')
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const [customStart, setCustomStart] = useState(toDatetimeLocal(oneHourAgo))
  const [customEnd, setCustomEnd] = useState(toDatetimeLocal(now))
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchingRef = useRef(false)
  const { showToast } = useToast()
  const parentRef = useRef<HTMLDivElement>(null)

  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return logs.slice(start, start + pageSize)
  }, [logs, currentPage, pageSize])

  const rowVirtualizer = useVirtualizer({
    count: pagedLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  const toLokiNs = (dateStr: string) => {
    if (!dateStr) return undefined
    return new Date(dateStr + ':00Z').getTime() * 1_000_000
  }

  const loadLogs = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setFetchError(null)

    try {
      const res = await fetchLokiLogs({
        limit: 1000,
        service: 'all',
        level,
        start: toLokiNs(customStart),
        end: toLokiNs(customEnd),
      })
      setLogs(res.logs ?? [])
      setCurrentPage(1)
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status
      const msg =
        status === 503 ? 'Log backend (Loki) is unreachable. Check server connectivity.' :
        status === 403 ? 'You do not have permission to view logs.' :
        'Failed to load logs. Please try again.'
      setFetchError(msg)
      showToast({ variant: 'error', title: 'Logs error', message: msg })
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [level, customStart, customEnd])

  useEffect(() => { loadLogs() }, [loadLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => { loadLogs() }, 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, loadLogs])

  const getLevelColor = (l: string) => {
    if (l === 'ERROR') return 'text-red-400 bg-red-500/10'
    if (l === 'WARN' || l === 'WARNING') return 'text-amber-400 bg-amber-500/10'
    if (l === 'DEBUG') return 'text-[#666] bg-white/5'
    return 'text-blue-400 bg-blue-500/10'
  }

  const handleLevelPill = (picked: Level) => {
    setLevel(prev => prev === picked ? '' : picked)
  }

  return (
    <div className="flex w-full h-[100vh] flex-col overflow-hidden rounded-xl border border-base bg-surface-2 shadow-sm mt-4 sm:mt-5">

      {/* ── Header row 1: level pills + actions ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-base bg-surface px-4 py-2.5">
        {/* Level pills */}
        <div className="flex items-center gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => handleLevelPill(l)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                level === l ? LEVEL_ACTIVE[l] : LEVEL_IDLE
              }`}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Page size */}
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
            className="rounded-lg border border-base bg-surface px-2 py-1.5 text-xs text-primary outline-none focus:border-accent"
          >
            {[50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>

          {/* Refresh */}
          <button
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-base bg-surface px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-5.67" />
            </svg>
            Refresh
          </button>

          {/* Auto-refresh */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              autoRefresh
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-base bg-surface text-muted hover:text-primary hover:bg-surface-3'
            }`}
            title={autoRefresh ? 'Auto-refresh on (30 s)' : 'Enable auto-refresh'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-accent animate-pulse' : 'bg-muted'}`} />
            Auto
          </button>
        </div>
      </div>

      {/* ── Header row 2: custom date range ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-base bg-surface/60 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Range (UTC)</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">From</span>
          <input
            type="datetime-local"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded border border-base bg-surface px-2 py-1 text-[11px] text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">To</span>
          <input
            type="datetime-local"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded border border-base bg-surface px-2 py-1 text-[11px] text-primary outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={loadLogs}
          className="text-[10px] font-bold text-accent hover:underline"
        >
          APPLY
        </button>
        <button
          onClick={() => {
            const n = new Date()
            setCustomEnd(toDatetimeLocal(n))
            setCustomStart(toDatetimeLocal(new Date(n.getTime() - 60 * 60 * 1000)))
          }}
          className="text-[10px] text-muted hover:text-primary"
        >
          Reset to now
        </button>
      </div>

      {/* ── Log body ── */}
      <div className="flex-1 bg-black font-mono text-xs overflow-hidden relative" ref={parentRef} style={{ overflowY: 'auto' }}>
        {loading && logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#555] animate-pulse">
            Fetching logs from Loki…
          </div>
        ) : fetchError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 opacity-60">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-red-400 text-center text-[11px] max-w-sm">{fetchError}</span>
          </div>
        ) : pagedLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#555] text-[11px]">
            No logs found for this period.
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const log = pagedLogs[virtualRow.index]
              const ts = new Date(log.ts).toLocaleTimeString()
              return (
                <div
                  key={virtualRow.index}
                  className="absolute top-0 left-0 w-full flex items-center gap-3 px-4 border-b border-white/[0.03] hover:bg-white/5 cursor-pointer transition-colors overflow-hidden group"
                  style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => {
                    navigator.clipboard.writeText(log.message)
                    showToast({ variant: 'success', message: 'Copied to clipboard' })
                  }}
                >
                  <span className="shrink-0 text-[#555] text-[10px] min-w-[70px] whitespace-nowrap select-none">{ts}</span>
                  <span className={`shrink-0 font-bold px-1 rounded text-[9px] min-w-[46px] text-center select-none ${getLevelColor(log.level)}`}>
                    {log.level}
                  </span>
                  <span className="shrink-0 text-[#666] text-[10px] min-w-[100px] truncate border-l border-white/5 pl-2 select-none">{log.service}</span>
                  <span className="text-[#ccc] truncate group-hover:text-white transition-colors">{log.message}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Footer: pagination ── */}
      <div className="border-t border-base bg-surface px-2 py-1.5">
        <DataPagination
          currentPage={currentPage}
          totalCount={logs.length}
          pageSize={pageSize}
          pageSizeOptions={[50, 100, 200]}
          loading={loading}
          itemLabel="logs"
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }}
        />
      </div>
    </div>
  )
}
