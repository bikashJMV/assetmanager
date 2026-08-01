import { AppIcon, type AppIconName } from '../ui'

type StatusMeta = { label: string; icon: AppIconName; varName: string }

const STATUS: Record<string, StatusMeta> = {
  generated: { label: 'Generated', icon: 'success', varName: '--success' },
  pending: { label: 'Pending', icon: 'warning', varName: '--warning' },
  failed: { label: 'Failed', icon: 'error', varName: '--danger' },
}

/** Batch status badge — icon + label + tinted surface, never color alone.
 * Unknown statuses (the API may add more) fall back to plain muted text. */
export default function QrBatchStatusBadge({ status }: { status: string }) {
  const meta = STATUS[status]
  if (!meta) {
    return (
      <span className="text-[length:var(--text-xs)] uppercase tracking-wide text-foreground-muted">{status}</span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[length:var(--text-xs)] font-semibold leading-tight"
      style={{
        color: `hsl(var(${meta.varName}))`,
        backgroundColor: `hsl(var(${meta.varName}) / 0.12)`,
        boxShadow: `inset 0 0 0 1px hsl(var(${meta.varName}) / 0.28)`,
      }}
    >
      <AppIcon name={meta.icon} size={12} />
      {meta.label}
    </span>
  )
}
