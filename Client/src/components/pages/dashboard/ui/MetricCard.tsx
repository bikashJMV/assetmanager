import type { LucideIcon } from 'lucide-react'

import { KPI_LABELS, type Severity } from '../dashboardLabels'
import { useCountUp } from './useCountUp'

export type MetricCardProps = {
  icon: LucideIcon
  label: string
  value: number
  hint: string
  severity?: Severity
  /** Share of the total, 0–1. Rendered as a secondary line when provided. */
  share?: number
  updatedAt?: string | null
  isLoading?: boolean
}

const SEVERITY_ICON_CLASS: Record<Severity, string> = {
  critical: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  ok: 'bg-brand/10 text-brand',
}

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  severity = 'ok',
  share,
  updatedAt,
  isLoading = false,
}: MetricCardProps) {
  const display = useCountUp(value)
  const updated = formatUpdated(updatedAt)

  if (isLoading) {
    return (
      <div className="rounded-lg border border-base bg-surface p-4">
        <div className="h-8 w-8 animate-pulse rounded-md bg-surface-3" />
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-surface-3" />
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-surface-3" />
      </div>
    )
  }

  return (
    <div className="group rounded-lg border border-base bg-surface p-4 transition-shadow duration-150 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${SEVERITY_ICON_CLASS[severity]}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {share !== undefined ? (
          <span className="text-[11px] font-medium tabular-nums text-subtle">
            {Math.round(share * 100)}% {KPI_LABELS.ofTotal}
          </span>
        ) : null}
      </div>

      <p className="mt-3 font-mono text-2xl font-bold tabular-nums leading-none text-primary sm:text-3xl">
        {display.toLocaleString()}
      </p>
      <p className="mt-2 text-sm font-medium text-primary">{label}</p>
      <p className="mt-0.5 text-xs leading-5 text-subtle">{hint}</p>

      {updated ? (
        <p className="mt-3 border-t border-base pt-2 text-[11px] text-subtle">
          {KPI_LABELS.updatedPrefix} {updated}
        </p>
      ) : null}
    </div>
  )
}
