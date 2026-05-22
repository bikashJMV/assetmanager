import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getSessionEmployee,
  getWelcomeNotification,
  listWarrantyNotifications,
  type WelcomeNotification,
  type WarrantyNotification,
} from '../../api'
import RefreshButton from '../common/RefreshButton'
import InfoHint from '../common/InfoHint'
import notificationsInfoHint from '../../data/notifications.InfoHint.json'
import { getErrorDebugDetail, logDevError } from '../../utils/errors'
import { useRefreshableLoader } from '../../hooks/useRefreshableLoader'
import Loader from '../common/Loader'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const NOTIFICATION_PAGE_SIZE = 15
const WELCOME_DISMISSED_PREFIX = 'ams-welcome-seen'
const WELCOME_DISMISSED_FALLBACK = 'ams-welcome-seen-fallback'

type NotificationsPageInfoHint = {
  panelTitle: string
  ariaLabel: string
  sections: { heading: string; bullets: string[] }[]
}

const NOTIFICATIONS_PAGE_INFO_HINT = notificationsInfoHint as NotificationsPageInfoHint

function formatExpiryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function parseDateInput(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calculateWindowDays(toDateInput: string): number {
  const toDate = parseDateInput(toDateInput)
  if (!toDate) return 30
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((toDate.getTime() - today.getTime()) / MS_PER_DAY)
  return Math.max(30, diffDays, 1)
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<WarrantyNotification[]>([])
  const [welcome, setWelcome] = useState<WelcomeNotification | null>(null)
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [visibleCount, setVisibleCount] = useState(NOTIFICATION_PAGE_SIZE)
  const { loading, error, run } = useRefreshableLoader({
    defaultErrorMessage: 'Unable to load notifications right now.',
    onError: (err) => {
      logDevError('notifications.fetch', err)
      setErrorDebug(getErrorDebugDetail(err))
    },
  })

  const loadNotifications = useCallback(async () => {
    setErrorDebug(undefined)
    await run(async () => {
      const [sessionProfile, rows, welcomeMessage] = await Promise.all([
        getSessionEmployee(),
        listWarrantyNotifications(calculateWindowDays(toDate)),
        getWelcomeNotification(),
      ])
      setNotifications(rows)

      const profileIsPrivileged = Boolean(
        sessionProfile && sessionProfile.role !== 'employee',
      )
      // Welcome message is shown only to employee-role users, not to Admin/IT Ops.
      if (profileIsPrivileged) {
        setWelcome(null)
      } else if (welcomeMessage?.show_alert) {
        setWelcome(welcomeMessage)
      } else if (sessionProfile?.id) {
        const key = `${WELCOME_DISMISSED_PREFIX}:${sessionProfile.id}`
        const alreadyShown = window.localStorage.getItem(key) === '1'
        if (!alreadyShown) {
          const firstName = sessionProfile.name?.trim().split(/\s+/)[0] || 'User'
          setWelcome({
            show_alert: true,
            title: `Welcome, ${firstName}!`,
            message: 'Your account is ready.\n\n• Review warranty alerts below.\n• Open All Assets or Employees from the menu, depending on your role.',
          })
          window.localStorage.setItem(key, '1')
        } else {
          setWelcome(null)
        }
      } else {
        const alreadyShown = window.localStorage.getItem(WELCOME_DISMISSED_FALLBACK) === '1'
        if (!alreadyShown) {
          setWelcome({
            show_alert: true,
            title: 'Welcome!',
            message: 'Your account is ready.\n\n• Review warranty alerts below.\n• Open All Assets or Employees from the menu, depending on your role.',
          })
          window.localStorage.setItem(WELCOME_DISMISSED_FALLBACK, '1')
        } else {
          setWelcome(null)
        }
      }
    })
  }, [toDate, run])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const filteredNotifications = useMemo(() => {
    const start = parseDateInput(fromDate)
    const end = parseDateInput(toDate)

    return notifications.filter((row) => {
      const expiry = parseDateInput(row.warranty_expiry)
      if (!expiry) return false
      if (start && expiry < start) return false
      if (end && expiry > end) return false
      return true
    })
  }, [notifications, fromDate, toDate])

  useEffect(() => {
    setVisibleCount(NOTIFICATION_PAGE_SIZE)
  }, [filteredNotifications])

  return (
    <main className="min-h-screen bg-app text-primary sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end gap-2 py-3">
          {/* date filters — full-width on mobile, auto-width on sm+ */}
          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-base bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-[color:var(--accent)] sm:w-auto"
            />
          </label>
          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-lg border border-base bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-[color:var(--accent)] sm:w-auto"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
            className="h-10 w-full shrink-0 self-end rounded-lg border border-base bg-surface-2 px-4 text-sm font-semibold text-muted transition hover:bg-surface-3 hover:text-primary sm:w-auto"
          >
            Clear
          </button>
          {/* refresh + infohint — pushed to the right on sm+, left-aligned on mobile */}
          <div className="flex shrink-0 items-center gap-2 self-end sm:ml-auto">
            <RefreshButton
              onClick={() => {
                void loadNotifications()
              }}
              loading={loading}
              iconOnly
              ariaLabel="Refresh Notifications"
              title={loading ? 'Refreshing notifications' : 'Refresh notifications'}
              className="shrink-0"
            />
            <InfoHint
              panelTitle={NOTIFICATIONS_PAGE_INFO_HINT.panelTitle}
              ariaLabel={NOTIFICATIONS_PAGE_INFO_HINT.ariaLabel}
              className="shrink-0"
            >
              {NOTIFICATIONS_PAGE_INFO_HINT.sections.map((section) => (
                <div key={section.heading}>
                  <p className="font-medium text-primary">{section.heading}</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {section.bullets.map((text, i) => (
                      <li key={`${section.heading}-${i}`}>{text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </InfoHint>
          </div>
        </div>

        <section className=" py-3">
          {welcome ? (
            <div className="rounded-lg border border-accent-soft bg-[color:var(--accent-soft)]/15 px-4 py-3">
              <p className="text-base font-semibold text-primary">{welcome.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted whitespace-pre-line">{welcome.message}</p>
            </div>
          ) : null}

          {error ? (
            <div className={`${welcome ? 'mt-3' : ''}`}>
              <p className="text-sm text-accent">{error}</p>
              {errorDebug ? <p className="mt-1 text-xs text-subtle">{errorDebug}</p> : null}
            </div>
          ) : null}

          {!error ? (
            <div className={`${welcome ? 'mt-3' : ''}`}>
              <NotificationRows
                title={`All Notifications (${filteredNotifications.length})`}
                loading={loading}
                rows={filteredNotifications}
                visibleCount={visibleCount}
                onLoadMore={() => setVisibleCount((current) => current + NOTIFICATION_PAGE_SIZE)}
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function NotificationRows({
  title,
  loading,
  rows,
  visibleCount,
  onLoadMore,
}: {
  title: string
  loading: boolean
  rows: WarrantyNotification[]
  visibleCount: number
  onLoadMore: () => void
}) {
  const visibleRows = rows.slice(0, visibleCount)
  const canLoadMore = visibleCount < rows.length

  return (
    <section className="p-3">
      <p className="mb-2 text-sm font-semibold text-primary">{title}</p>
      {loading ? (
        <Loader embedded />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-base font-semibold text-primary">No new notifications</p>
          <p className="text-sm text-subtle">You're all caught up. No warranty alerts at this time.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((row) => (
            <article
              key={row.notification_id}
              className="rounded-lg border border-base bg-surface px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        row.severity === 'expired'
                          ? 'inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-accent'
                          : 'inline-flex rounded-full border border-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent'
                      }
                    >
                      {row.severity === 'expired' ? 'Expired' : 'Due soon'}
                    </span>
                    <p className="text-sm font-semibold text-primary">
                      {row.model || 'Asset'}
                      {row.asset_tag ? (
                        <span className="font-normal text-muted"> · {row.asset_tag}</span>
                      ) : null}
                    </p>
                  </div>
                  {(row.category_name || row.current_employee_name) ? (
                    <p className="text-xs text-muted">
                      {row.category_name ? (
                        <span>
                          <span className="text-subtle">Category</span> {row.category_name}
                        </span>
                      ) : null}
                      {row.category_name && row.current_employee_name ? ' · ' : null}
                      {row.current_employee_name ? (
                        <span>
                          <span className="text-subtle">Holder</span> {row.current_employee_name}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {row.asset_tag ? (
                  <Link
                    to={`/assets/${encodeURIComponent(row.asset_tag)}`}
                    className="shrink-0 text-xs font-semibold text-accent hover:underline"
                  >
                    Open asset
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-subtle">Tag unavailable</span>
                )}
              </div>
              <p className="mt-2 rounded-md border border-base bg-app/80 px-3 py-2 text-sm leading-relaxed text-primary">
                {row.message}
              </p>
              <p className="mt-2 text-xs text-subtle">
                <span className="font-medium text-muted">Warranty end</span> {formatExpiryDate(row.warranty_expiry)}
                {' · '}
                {row.severity === 'expired' ? (
                  <>
                    Overdue by {Math.abs(row.days_remaining)} day{Math.abs(row.days_remaining) === 1 ? '' : 's'}
                  </>
                ) : (
                  <>
                    {row.days_remaining} day{row.days_remaining === 1 ? '' : 's'} left
                  </>
                )}
              </p>
            </article>
          ))}
          {canLoadMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-1 w-full rounded-lg border border-base bg-surface px-3 py-2 text-sm font-semibold text-primary transition hover:bg-surface-3"
            >
              Load more
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
