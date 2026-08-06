import { AppIcon, type AppIconName } from './AppIcon'

/**
 * Status pill (Notes/UI.md §11). Colorblind-safe: color + icon + text, never color
 * alone. Soft tinted bg from the status hue token; full-radius HF pill.
 *
 * Vocabulary matches the REAL statuses the API emits (see AllAssets `statusFilters` /
 * utils/formatDisplay.ts `getInventoryStatusTone` — the single other place status color
 * is computed; both read the same --status-* tokens in styles/tokens.css).
 */
type StatusKey = 'assigned' | 'in_stock' | 'in_repair' | 'retired' | 'lost' | 'disposed'

interface StatusMeta {
  label: string
  icon: AppIconName
  varName: string
}

const STATUS: Record<StatusKey, StatusMeta> = {
  assigned:   { label: 'Assigned',    icon: 'statusAssigned',    varName: '--status-assigned' },
  in_stock:   { label: 'In Stock',    icon: 'statusAvailable',   varName: '--status-in-stock' },
  in_repair:  { label: 'In Repair',   icon: 'statusMaintenance', varName: '--status-in-repair' },
  retired:    { label: 'Retired',     icon: 'statusRetired',     varName: '--status-retired' },
  lost:       { label: 'Lost',        icon: 'warning',           varName: '--status-lost' },
  disposed:   { label: 'Disposed',    icon: 'delete',            varName: '--status-disposed' },
}

function normalize(raw: string): StatusKey {
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return (k in STATUS ? k : 'retired') as StatusKey
}

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const meta = STATUS[normalize(status)]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[length:var(--text-xs)] font-semibold ${className}`}
      style={{
        color: `hsl(var(${meta.varName}))`,
        backgroundColor: `hsl(var(${meta.varName}) / 0.12)`,
      }}
    >
      <AppIcon name={meta.icon} size={12} />
      {meta.label}
    </span>
  )
}
