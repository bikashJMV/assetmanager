import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEntry } from '../../api/logsApi'
import { useToast } from '../../hooks/useToast'
import { AppIcon } from '../ui'
import { levelColor } from './logLevel'
import { LOADING } from '../../constants/loading'

function LogRow({ log, onCopy }: { log: LogEntry; onCopy: (msg: string) => void }) {
  const color = levelColor(log.level)
  const relTime = new Date(log.ts).toLocaleTimeString()
  return (
    <button
      type="button"
      onClick={() => onCopy(log.message)}
      title="Click to copy message"
      className="group absolute left-0 top-0 flex w-full items-center gap-3 px-4 text-left"
      style={{ borderBottom: '1px solid var(--term-line)' }}
    >
      <span aria-hidden className="h-full w-0.5 shrink-0 self-stretch" style={{ backgroundColor: color, opacity: 0.7 }} />
      <span className="shrink-0 select-none tabular-nums text-[10px]" style={{ color: 'var(--term-dim)', minWidth: 72 }}>{relTime}</span>
      <span className="shrink-0 select-none rounded px-1.5 py-0.5 text-center text-[9px] font-bold uppercase" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, minWidth: 52 }}>
        {log.level}
      </span>
      <span className="shrink-0 select-none truncate pl-2 text-[11px]" style={{ color: 'var(--term-dim)', minWidth: 96, borderLeft: '1px solid var(--term-line)' }}>{log.service}</span>
      <span className="flex-1 truncate" style={{ color: 'var(--term-fg)' }}>{log.message}</span>
      <span className="shrink-0 opacity-0 transition group-hover:opacity-60" style={{ color: 'var(--term-dim)' }} aria-hidden>
        <AppIcon name="copy" size={13} />
      </span>
    </button>
  )
}

export function LogTerminal({ logs, loading, hadError, onRetry }: { logs: LogEntry[]; loading: boolean; hadError: boolean; onRetry: () => void }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  })

  const copy = (msg: string) => {
    navigator.clipboard.writeText(msg)
    showToast({ variant: 'success', message: 'Copied to clipboard' })
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto font-mono text-xs" ref={parentRef} style={{ backgroundColor: 'var(--term-bg)' }}>
      {loading && logs.length === 0 ? (
        <div className="flex flex-col gap-0" aria-label={LOADING.LOGS} aria-busy="true">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: '1px solid var(--term-line)' }}>
              <span className="ams-skeleton h-3 rounded" style={{ width: 60 }} />
              <span className="ams-skeleton h-3 rounded" style={{ width: 44 }} />
              <span className="ams-skeleton h-3 flex-1 rounded" style={{ maxWidth: `${40 + ((i * 7) % 45)}%` }} />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: 'var(--term-dim)' }}>
          <AppIcon name={hadError ? 'error' : 'logs'} size={28} />
          <p className="text-sm">{hadError ? "Couldn't load logs." : 'No logs found for the selected criteria.'}</p>
          <button type="button" onClick={onRetry} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--term-info)', border: '1px solid var(--term-line)' }}>
            {hadError ? 'Retry' : 'Refresh'}
          </button>
        </div>
      ) : (
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((v) => (
            <div key={v.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)` }}>
              <div className="relative h-full hover:[background:var(--term-hover)]">
                <LogRow log={logs[v.index]} onCopy={copy} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
