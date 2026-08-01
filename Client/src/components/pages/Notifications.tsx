import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getSessionEmployee,
  getWelcomeNotification,
  listWarrantyNotifications,
  type SessionEmployee,
  type WelcomeNotification,
  type WarrantyNotification,
} from '../../api'
import { getErrorDebugDetail, logDevError } from '../../utils/errors'
import { useRefreshableLoader } from '../../hooks/useRefreshableLoader'
import { WarrantyErrorNotice, WarrantyWelcomeBanner } from '../notifications/WarrantyBanners'
import WarrantyNotificationList from '../notifications/WarrantyNotificationList'
import WarrantyPageHeader from '../notifications/WarrantyPageHeader'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const NOTIFICATION_PAGE_SIZE = 15
const WELCOME_DISMISSED_PREFIX = 'ams-welcome-seen'
const WELCOME_DISMISSED_FALLBACK = 'ams-welcome-seen-fallback'

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

      const profileIsPrivileged = Boolean(
        sessionProfile?.is_active && sessionProfile.role !== 'employee',
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

  const expiredCount = useMemo(
    () => filteredNotifications.filter((row) => row.severity === 'expired').length,
    [filteredNotifications],
  )
  const activeFilters = (fromDate ? 1 : 0) + (toDate ? 1 : 0)
  const resetFilters = () => { setFromDate(''); setToDate('') }

  const isPrivileged = Boolean(profile?.is_active && profile?.role !== 'employee')
  const audienceLabel = isPrivileged ? 'Showing alerts for all assets.' : 'Showing only alerts for assets currently assigned to you.'

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <WarrantyPageHeader
          total={filteredNotifications.length}
          expired={expiredCount}
          expiringSoon={filteredNotifications.length - expiredCount}
          activeFilters={activeFilters}
          audienceLabel={audienceLabel}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
        />

        {welcome ? <WarrantyWelcomeBanner welcome={welcome} /> : null}

        {error ? (
          <WarrantyErrorNotice message={error} debugDetail={errorDebug} />
        ) : (
          <WarrantyNotificationList
            rows={filteredNotifications}
            loading={loading}
            visibleCount={visibleCount}
            pageSize={NOTIFICATION_PAGE_SIZE}
            filtered={activeFilters > 0}
            onLoadMore={() => setVisibleCount((current) => current + NOTIFICATION_PAGE_SIZE)}
            onResetFilters={resetFilters}
          />
        )}
      </div>
    </main>
  )
}
