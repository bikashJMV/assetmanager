import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchLokiLogs, type LogEntry } from '../../api/logsApi'
import { useToast } from '../../hooks/useToast'
import DataPagination from '../common/DataPagination'
import { LogsToolbar } from '../logs/LogsToolbar'
import { LogTerminal } from '../logs/LogTerminal'

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hadError, setHadError] = useState(false)
  const [level, setLevel] = useState<string>('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  const fetchingRef = useRef(false)
  const { showToast } = useToast()

  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (logs ?? []).slice(start, start + pageSize)
  }, [logs, currentPage, pageSize])

  const toLokiNs = (dateStr: string, endOfDay = false) => {
    if (!dateStr) return undefined
    // Date-only input is treated as UTC; end date spans to the last second of that day.
    const time = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z'
    return new Date(dateStr + time).getTime() * 1_000_000
  }

  async function loadLogs() {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setHadError(false)
    try {
      const start = toLokiNs(customStart)
      const end = toLokiNs(customEnd, true)
      if (start !== undefined && end !== undefined && start >= end) {
        showToast({ variant: 'warning', message: 'From date must be on or before To date.' })
        return
      }
      const res = await fetchLokiLogs({ limit: 1000, service: 'all', level, start, end })
      setLogs(res.logs ?? [])
      setCurrentPage(1)
    } catch (e) {
      setHadError(true)
      showToast({ variant: 'error', title: 'Failed to load logs', message: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <LogsToolbar
        level={level}
        onLevel={setLevel}
        loading={loading}
        onRefresh={loadLogs}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        onApplyCustom={loadLogs}
      />

      <LogTerminal logs={pagedLogs} loading={loading} hadError={hadError} onRetry={loadLogs} />

      <div className="flex justify-center border-t border-line bg-surface p-2">
        <DataPagination
          bare
          showSummary={false}
          showPageSizeSelector={false}
          currentPage={currentPage}
          totalCount={(logs ?? []).length}
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
