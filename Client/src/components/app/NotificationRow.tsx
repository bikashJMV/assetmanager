import type { WarrantyNotification } from '../../api'
import { AppIcon } from '../ui'
import { formatDaysRemaining } from './notificationText'

export function NotificationRow({ item, read, onClick }: { item: WarrantyNotification; read: boolean; onClick: () => void }) {
  const expired = item.severity === 'expired'
  const tone = expired ? '--danger' : '--warning'
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none ${read ? 'opacity-70' : ''}`}
    >
      {/* unread dot rail (green) — keeps rows aligned whether read or not */}
      <span className="flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
        {!read ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--success))' }} /> : null}
      </span>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `hsl(var(${tone}) / 0.14)`, color: `hsl(var(${tone}))` }}
        aria-hidden
      >
        <AppIcon name={expired ? 'error' : 'warning'} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${read ? 'font-medium' : 'font-semibold'} text-foreground`}>
          {item.category_name ?? 'Asset'} <span className="text-foreground-faint">·</span> {item.asset_tag ?? '—'}
        </p>
        <p className="truncate text-xs text-foreground-muted">{item.message}</p>
      </div>
      <span className="shrink-0 self-start text-[length:var(--text-xs)] font-medium" style={{ color: `hsl(var(${tone}))` }}>
        {formatDaysRemaining(item)}
      </span>
    </button>
  )
}
