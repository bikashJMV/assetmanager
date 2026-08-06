import { AppIcon } from '../ui'
import { WARRANTY_SEVERITY, type WarrantySeverityKey } from './warrantySeverity'

/** Severity badge — icon + text + tinted surface, never color alone (WCAG 1.4.1).
 * Colors come from the semantic --danger / --warning / --success tokens, so the
 * badge re-tunes itself in dark mode instead of being inverted. */
export default function WarrantySeverityBadge({
  severity,
  className = '',
}: {
  severity: WarrantySeverityKey
  className?: string
}) {
  const meta = WARRANTY_SEVERITY[severity]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-xs)] font-semibold leading-tight ${className}`}
      style={{
        color: `hsl(var(${meta.varName}))`,
        backgroundColor: `hsl(var(${meta.varName}) / 0.14)`,
        boxShadow: `inset 0 0 0 1px hsl(var(${meta.varName}) / 0.28)`,
      }}
    >
      <AppIcon name={meta.icon} size={12} />
      {meta.label}
    </span>
  )
}
