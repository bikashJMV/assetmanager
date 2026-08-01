import { useEffect, useRef } from 'react'
import type { useNavigate } from 'react-router-dom'
import type { WarrantyNotification } from '../../api'
import { AppIcon, SkeletonRows } from '../ui'
import { NotificationRow } from './NotificationRow'

type Status = 'loading' | 'error' | 'empty' | 'data'

function statusOf(loading: boolean, error: boolean, items: WarrantyNotification[]): Status {
  if (loading) return 'loading'
  if (error) return 'error'
  if (items.length === 0) return 'empty'
  return 'data'
}

/**
 * Notification bell dropdown — premium production redesign (UI-1, Notes/ui-and-bugfix-plan.md).
 * Token-driven surfaces (dark-mode safe), four explicit states, keyboard-closable, scroll-capped
 * list with a sticky footer.
 */
export function NotificationsMenu({
  open,
  loading,
  error,
  items,
  onClose,
  onRetry,
  navigate,
  isRead,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: {
  open: boolean
  loading: boolean
  error: boolean
  items: WarrantyNotification[]
  onClose: () => void
  onRetry: () => void
  navigate: ReturnType<typeof useNavigate>
  isRead: (item: WarrantyNotification) => boolean
  unreadCount: number
  onMarkRead: (item: WarrantyNotification) => void
  onMarkAllRead: () => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  const status = statusOf(loading, error, items)

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="menu"
      aria-label="Notifications"
      className="ams-idle-in absolute right-0 z-dropdown mt-3 flex max-h-[28rem] w-80 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lg outline-none sm:w-96"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full px-2 py-0.5 text-[length:var(--text-xs)] font-semibold" style={{ backgroundColor: 'hsl(var(--success) / 0.14)', color: 'hsl(var(--success))' }}>
              {unreadCount} new
            </span>
          ) : null}
        </div>
        {status === 'data' && unreadCount > 0 ? (
          <button type="button" onClick={onMarkAllRead} className="text-[length:var(--text-xs)] font-semibold text-brand transition hover:underline">
            Mark all read
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' && <SkeletonRows rows={4} cols={1} />}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'hsl(var(--danger) / 0.12)', color: 'hsl(var(--danger))' }}>
              <AppIcon name="error" size={20} />
            </span>
            <p className="text-sm text-foreground-muted">Couldn't load notifications.</p>
            <button type="button" onClick={onRetry} className="text-sm font-semibold text-brand hover:underline">
              Retry
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'hsl(var(--success) / 0.12)', color: 'hsl(var(--success))' }}>
              <AppIcon name="success" size={20} />
            </span>
            <p className="text-sm text-foreground-muted">You're all caught up.</p>
          </div>
        )}

        {status === 'data' && (
          <div className="divide-y divide-line" role="none">
            {items.map((item) => (
              <NotificationRow
                key={item.notification_id}
                item={item}
                read={isRead(item)}
                onClick={() => { onMarkRead(item); onClose(); navigate(`/assets/${item.asset_tag}`) }}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-line p-2">
        <button
          type="button"
          onClick={() => { onClose(); navigate('/notifications') }}
          className="w-full rounded-md bg-brand py-1.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-hover"
        >
          View all
        </button>
      </footer>
    </div>
  )
}
