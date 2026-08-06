import type { ReactNode } from 'react'

type ChartPanelProps = {
  title: string
  subtitle?: string
  isEmpty: boolean
  emptyMessage: string
  children: ReactNode
  className?: string
  height?: number
}

function EmptyState({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--subtle)]"
      style={{ height }}
    >
      {message}
    </div>
  )
}

export default function ChartPanel({
  title,
  subtitle,
  isEmpty,
  emptyMessage,
  children,
  className,
  height = 260,
}: ChartPanelProps) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ${className ?? ''}`}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </header>

      {isEmpty ? (
        <EmptyState message={emptyMessage} height={height} />
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </section>
  )
}
