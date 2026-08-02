import { DASHBOARD_STATE_LABELS } from '../dashboardLabels'

type SkeletonGridProps = {
  count: number
  className?: string
  height?: string
}

export function SkeletonGrid({ count, className = '', height = 'h-28' }: SkeletonGridProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`${height} animate-pulse rounded-lg border border-base bg-surface-2`}
        />
      ))}
    </div>
  )
}

export function SectionError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-base bg-surface p-6 text-center text-sm text-muted"
    >
      <p className="font-medium text-primary">{message ?? DASHBOARD_STATE_LABELS.error}</p>
      <p className="mt-1 text-xs text-subtle">{DASHBOARD_STATE_LABELS.retry}</p>
    </div>
  )
}

export function SectionEmpty({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-base bg-surface-2 p-6 text-center text-sm text-subtle">
      {message ?? DASHBOARD_STATE_LABELS.empty}
    </div>
  )
}
