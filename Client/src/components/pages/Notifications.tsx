import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getSessionEmployee,
  getWelcomeNotification,
  listWarrantyNotifications,
  type SessionEmployee,
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
  const [profile, setProfile] = useState<SessionEmployee | null>(null)
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
      setProfile(sessionProfile)
      setNotifications(rows)
      if (welcomeMessage?.show_alert) {
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

  const isPrivileged = Boolean(profile?.is_active && profile?.role !== 'employee')
  const audienceLabel = isPrivileged ? 'Showing alerts for all assets.' : 'Showing only alerts for assets currently assigned to you.'

  return (
    <main className="min-h-screen bg-app text-primary sm:px-6">
      <div className="mx-auto max-w-6xl ">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-primary sm:text-xl">Notifications</h1>
            <p className="mt-1 text-sm leading-snug text-muted">{audienceLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>
        <section className="p-4">
          <div className="flex flex-row items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-subtle">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full rounded-lg border border-base bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-[color:var(--accent)]"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-subtle">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full rounded-lg border border-base bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-[color:var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="h-10 shrink-0 rounded-lg border border-base bg-surface-2 px-4 text-sm font-semibold text-muted transition hover:bg-surface-3 hover:text-primary"
            >
              Clear
            </button>
          </div>
        </section>

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
    <section className=" p-3">
      <p className="mb-2 text-sm font-semibold text-primary">{title}</p>
      {loading ? (
        <Loader embedded />
      ) : rows.length === 0 ? (
        <p className="text-sm text-subtle">No alerts in this category.</p>
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
                          ? 'inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white'
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
