import type { ReactNode } from 'react'

type ChartCardProps = {
  title: string
  subtitle?: string
  loading: boolean
  error?: string
  empty: boolean
  emptyMessage?: string
  children: ReactNode
  headerRight?: ReactNode
  onRetry?: () => void
  minHeight?: string
}

export default function ChartCard({
  title,
  subtitle,
  loading,
  error,
  empty,
  emptyMessage = 'No data available.',
  children,
  headerRight,
  onRetry,
  minHeight = '260px',
}: ChartCardProps) {
  const showOverlay = loading || !!error || empty

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {/* Container is always rendered so refs attach immediately */}
      <div className="relative" style={{ minHeight }}>
        {/* Chart lives here always — ECharts can mount reliably */}
        <div style={{ width: '100%', height: minHeight, visibility: showOverlay ? 'hidden' : 'visible' }}>
          {children}
        </div>

        {/* Overlay states */}
        {loading && (
          <div className="absolute inset-0 animate-pulse rounded-lg bg-[var(--surface-2)]" aria-label="Loading chart" />
        )}
        {!loading && !!error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs text-[var(--muted)] underline hover:text-[var(--text)]"
              >
                Retry
              </button>
            )}
          </div>
        )}
        {!loading && !error && empty && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--subtle)]">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  )
}
