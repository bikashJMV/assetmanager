import { useState, useEffect, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchLokiLogs, type LogEntry } from '../../api/logsApi'
import { useToast } from '../../hooks/useToast'
import DataPagination from '../common/DataPagination'

type TimeRange = '1h' | '6h' | '24h' | '48h' | '72h' | 'custom'

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState<string>('')
  const [search, setSearch] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  const fetchingRef = useRef(false)
  const { showToast } = useToast()
  const parentRef = useRef<HTMLDivElement>(null)

  // Client-side filtering
  const filteredLogs = useMemo(() => {
    let result = logs ?? []
    if (search.trim()) {
      const lowerSearch = search.toLowerCase()
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(lowerSearch) ||
          log.service.toLowerCase().includes(lowerSearch)
      )
    }
    return result
  }, [logs, search])

  // Paginated logs
  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, currentPage, pageSize])

  // Virtualizer for the current page
  const rowVirtualizer = useVirtualizer({
    count: pagedLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  const toLokiNs = (dateStr: string) => {
    if (!dateStr) return undefined
    // Fix: Treat local datetime-local input as UTC to avoid 5.5h offset in India
    return new Date(dateStr + ':00Z').getTime() * 1_000_000
  }

  async function loadLogs() {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)

    try {
      let start: number | undefined
      let end: number | undefined

      if (timeRange === 'custom') {
        start = toLokiNs(customStart)
        end = toLokiNs(customEnd)
      } else {
        const hours = parseInt(timeRange)
        start = (Date.now() - hours * 3600 * 1000) * 1_000_000
      }

      const res = await fetchLokiLogs({
        limit: 1000, // Fetch a large buffer for client-side pagination
        service: 'all',
        level,
        start,
        end
      })

      setLogs(res.logs ?? [])
      setCurrentPage(1) // Reset to first page on new fetch
    } catch (e) {
      showToast({
        variant: 'error',
        title: 'Failed to load logs',
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  // Load on mount and when filters change
  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, timeRange])

  const getLevelColor = (l: string) => {
    switch (l) {
      case 'ERROR': return 'text-red-400 bg-red-500/10'
      case 'WARN':
      case 'WARNING': return 'text-amber-400 bg-amber-500/10'
      case 'DEBUG': return 'text-muted bg-surface-3'
      default: return 'text-blue-400 bg-blue-500/10'
    }
  }

  return (
    <div className="flex w-full h-[100vh] flex-col overflow-hidden rounded-xl border border-base bg-surface-2 shadow-sm mt-4 sm:mt-5">

      {/* Toolbar */}
      <div className="flex flex-col border-b border-base bg-surface">
        <div className="flex flex-col gap-3 px-3 py-3 border-b border-base/50 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="rounded-lg border border-base bg-surface px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent"
            >
              <option value="">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-base bg-surface-2 p-1">
              {(['1h', '6h', '24h', '48h', '72h', 'custom'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-[10px] font-medium rounded-md transition ${timeRange === range
                    ? 'bg-accent text-on-accent shadow-sm'
                    : 'text-muted hover:text-primary hover:bg-surface-3'
                    }`}
                >
                  {range === 'custom' ? 'Custom Range' : `Last ${range}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:w-64 md:w-72">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search loaded logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-base bg-surface py-1.5 pl-8 pr-3 text-xs text-primary outline-none placeholder:text-muted transition-colors focus:border-accent"
              />
            </div>
            <button
              onClick={loadLogs}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-base bg-surface px-3 py-1.5 text-xs text-primary transition-colors hover:bg-surface-3 disabled:opacity-50 sm:justify-start"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-5.67" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {timeRange === 'custom' && (
          <div className="flex flex-col gap-3 px-3 py-2 bg-surface-3/30 border-b border-base/50 animate-in fade-in slide-in-from-top-2 duration-200 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase text-subtle">From (UTC)</span>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded border border-base bg-surface px-2 py-1 text-[11px] text-primary outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase text-subtle">To (UTC)</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded border border-base bg-surface px-2 py-1 text-[11px] text-primary outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={loadLogs}
              className="text-[10px] font-bold text-accent hover:underline sm:ml-auto"
            >
              APPLY RANGE
            </button>
          </div>
        )}
      </div>

      {/* Log Body */}
      <div className="flex-1 bg-black font-mono text-xs overflow-hidden relative" ref={parentRef} style={{ overflowY: 'auto' }}>
        {loading && logs.length === 0 ? (
          <div className="p-4 text-muted animate-pulse">Fetching logs from Loki...</div>
        ) : pagedLogs.length === 0 ? (
          <div className="p-4 text-muted flex flex-col items-center justify-center h-full gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>No logs found for the selected criteria.</span>
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const log = pagedLogs[virtualRow.index]
              const relTime = new Date(log.ts).toLocaleTimeString()
              return (
                <div
                  key={virtualRow.index}
                  className="absolute top-0 left-0 w-full hover:bg-white/5 cursor-pointer px-4 flex gap-3 border-b border-white/[0.03] transition-colors overflow-hidden items-center group"
                  style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => {
                    navigator.clipboard.writeText(log.message)
                    showToast({ variant: 'success', message: 'Copied to clipboard' })
                  }}
                >
                  <span className="text-[#666] shrink-0 whitespace-nowrap min-w-[70px] select-none text-[10px]">{relTime}</span>
                  <span className={`shrink-0 font-bold px-1 rounded text-[9px] select-none min-w-[48px] text-center ${getLevelColor(log.level)}`}>
                    {log.level}
                  </span>
                  <span className="text-[#888] shrink-0 whitespace-nowrap select-none min-w-[100px] truncate border-l border-white/5 pl-2">{log.service}</span>
                  <span className="text-[#ddd] truncate group-hover:text-on-accent transition-colors">{log.message}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer / Pagination */}
      <div className="border-t border-base bg-surface p-2">
        <DataPagination
          currentPage={currentPage}
          totalCount={filteredLogs.length}
          pageSize={pageSize}
          pageSizeOptions={[50, 100, 200]}
          loading={loading}
          itemLabel="logs"
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
      </div>
    </div>
  )
}
