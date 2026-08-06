import { useEffect, useRef, useState } from 'react'
import type { useNavigate } from 'react-router-dom'
import { User } from 'oidc-client-ts'
import { type SessionEmployee, type WarrantyNotification, listWarrantyNotifications } from '../../api'
import { formatRoleLabel, roleBadgeStyle } from '../../utils/formatDisplay'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { BrandLogo } from '../common/BrandLogo'
import UserAvatar from '../common/UserAvatar'
import { NotificationsMenu } from './NotificationsMenu'
import { useNotificationReads } from '../../hooks/useNotificationReads'
import { useMyAvatarQuery } from '../../queries/avatar'
import { AppIcon } from '../ui'

function firstNameOf(name: string | undefined | null, fallback: string): string {
  const n = (name ?? '').trim()
  return n ? n.split(/\s+/)[0] : fallback
}

export function TopBar({
  onToggleSidebar,
  user,
  sessionEmployee,
  navigate,
  onSignOut,
}: {
  onToggleSidebar: () => void
  user: User | null
  sessionEmployee: SessionEmployee | null
  navigate: ReturnType<typeof useNavigate>
  onSignOut: () => void
}) {
  const hasOidcSession = Boolean(user && !user.expired)
  // Every active user gets the bell; the server scopes an employee to alerts for assets they hold,
  // while admin/it_ops see all.
  const canSeeNotifications = hasOidcSession && Boolean(sessionEmployee?.is_active)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState<WarrantyNotification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const { isRead, unreadCount, markRead, markAllRead } = useNotificationReads()

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!notifRef.current?.contains(event.target as Node | null)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  const loadNotifications = async (): Promise<void> => {
    setNotifLoading(true)
    setNotifError(false)
    try {
      setNotifItems(await listWarrantyNotifications(30))
    } catch {
      setNotifError(true)
    } finally {
      setNotifLoading(false)
    }
  }

  // Prefetch once when the bell becomes available, so the unread dot is accurate before opening.
  useEffect(() => {
    if (canSeeNotifications) void loadNotifications()
  }, [canSeeNotifications])

  useEffect(() => {
    if (notifOpen) void loadNotifications()
  }, [notifOpen])

  // Lock background scroll while the dropdown is open (dashboard behind must not scroll).
  useEffect(() => {
    if (!notifOpen) return
    const root = document.querySelector('[data-app-scroll-root]') as HTMLElement | null
    const prevRoot = root?.style.overflow
    const prevBody = document.body.style.overflow
    if (root) root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      if (root) root.style.overflow = prevRoot ?? ''
      document.body.style.overflow = prevBody
    }
  }, [notifOpen])

  const firstName = firstNameOf(
    sessionEmployee?.name ?? (typeof user?.profile?.name === 'string' ? user.profile.name : undefined),
    'Account',
  )
  const unread = unreadCount(notifItems)
  const hasUnread = unread > 0
  const avatarQuery = useMyAvatarQuery()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface-sunken">
      <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onToggleSidebar} className="icon-btn text-muted" aria-label="Toggle sidebar">
            <AnimatedNavIcon name="list-chevrons-up-down" className="h-7 w-7" />
          </button>
          <button type="button" onClick={() => navigate('/')} className="truncate transition hover:opacity-90" aria-label="Asset Manager home">
            <BrandLogo size="sm" />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {hasOidcSession ? (
            <>
              {/* Signed-in identity → opens Settings. Name + role collapse away on mobile,
                  leaving the avatar as the tap target. */}
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="group flex items-center gap-2 rounded-full border border-transparent py-0.5 pl-0.5 pr-1 transition-[background-color,border-color] duration-fast ease-out hover:border-line hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none sm:pr-2"
                title="Account & settings"
                aria-label={`Account and settings for ${firstName}`}
              >
                <UserAvatar avatar={avatarQuery.data} size={32} alt={`${firstName} profile image`} />
                <span className="hidden max-w-[9rem] truncate text-[length:var(--text-sm)] font-semibold text-foreground transition-colors group-hover:text-brand sm:inline">
                  {firstName}
                </span>
                {sessionEmployee ? (
                  <span
                    className="hidden rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide md:inline"
                    style={roleBadgeStyle(sessionEmployee.role)}
                  >
                    {formatRoleLabel(sessionEmployee.role)}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={onSignOut}
                title="Log out"
                aria-label="Log out"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-danger bg-transparent px-2 text-[length:var(--text-sm)] font-semibold text-danger transition-[background-color,color,border-color] duration-fast ease-out hover:bg-danger hover:text-white active:bg-danger-active active:text-white focus-visible:shadow-focus-danger focus-visible:outline-none sm:px-3"
              >
                <AppIcon name="signOut" size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>

              {canSeeNotifications ? (
                <div className="relative" ref={notifRef}>
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className={`icon-btn relative rounded-md transition-[background-color] duration-fast ease-out hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none ${notifOpen ? 'icon-btn-active' : ''}`}
                    aria-label={hasUnread ? `Notifications, ${unread} unread` : 'Notifications'}
                    aria-haspopup="menu"
                    aria-expanded={notifOpen}
                  >
                    <AnimatedNavIcon name="bell" className="h-7 w-7" />
                    {hasUnread ? (
                      <span
                        className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: 'hsl(var(--success))', boxShadow: '0 0 0 2px hsl(var(--surface-t))' }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                  <NotificationsMenu
                    open={notifOpen}
                    loading={notifLoading}
                    error={notifError}
                    items={notifItems}
                    onClose={() => setNotifOpen(false)}
                    onRetry={() => void loadNotifications()}
                    navigate={navigate}
                    isRead={isRead}
                    unreadCount={unread}
                    onMarkRead={markRead}
                    onMarkAllRead={() => markAllRead(notifItems)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <button type="button" onClick={() => navigate('/login')} className="rounded-lg bg-accent text-on-accent text-sm font-semibold px-4 py-1.5 hover:bg-accent-hover transition">
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
