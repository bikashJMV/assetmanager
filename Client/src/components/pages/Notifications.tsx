import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getSessionEmployee,
  listWarrantyNotifications,
  type SessionEmployee,
  type WarrantyNotification,
} from '../../api'
import RefreshButton from '../common/RefreshButton'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'

function formatExpiryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

export default function Notifications() {
  const [profile, setProfile] = useState<SessionEmployee | null>(null)
  const [notifications, setNotifications] = useState<WarrantyNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    expired: true,
    due_soon: true,
  })

  const loadNotifications = async () => {
    setLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const [sessionProfile, rows] = await Promise.all([
        getSessionEmployee(),
        listWarrantyNotifications(30),
      ])
      setProfile(sessionProfile)
      setNotifications(rows)
    } catch (err) {
      logDevError('notifications.fetch', err)
      setError(getUserFacingMessage(err, 'Unable to load notifications right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()
  }, [])

  const grouped = useMemo(() => {
    const expired: WarrantyNotification[] = []
    const dueSoon: WarrantyNotification[] = []
    for (const row of notifications) {
      if (row.severity === 'expired') expired.push(row)
      else dueSoon.push(row)
    }
    return { expired, dueSoon }
  }, [notifications])

  const isPrivileged = Boolean(profile?.is_active && profile?.role !== 'employee')
  const audienceLabel = isPrivileged
    ? 'Showing all alerts for Admin / IT Ops scope.'
    : 'Showing only alerts for assets currently assigned to you.'

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-base bg-surface-2 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-subtle">Notifications</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Warranty Alerts</h1>
              <p className="mt-2 text-sm text-muted">{audienceLabel}</p>
            </div>
            <RefreshButton
              onClick={() => {
                void loadNotifications()
              }}
              loading={loading}
              label="Refresh"
              className="shrink-0"
            />
          </div>
        </header>

        {error ? (
          <section className="rounded-xl border border-base bg-surface px-4 py-3">
            <p className="text-sm text-accent">{error}</p>
            {errorDebug ? <p className="mt-1 text-xs text-subtle">{errorDebug}</p> : null}
          </section>
        ) : null}

        <AlertGroup
          title={`Expired (${grouped.expired.length})`}
          tone="expired"
          expanded={expanded.expired}
          onToggle={() => setExpanded((current) => ({ ...current, expired: !current.expired }))}
          loading={loading}
          rows={grouped.expired}
        />

        <AlertGroup
          title={`Due Soon (${grouped.dueSoon.length})`}
          tone="due_soon"
          expanded={expanded.due_soon}
          onToggle={() => setExpanded((current) => ({ ...current, due_soon: !current.due_soon }))}
          loading={loading}
          rows={grouped.dueSoon}
        />
      </div>
    </main>
  )
}

function AlertGroup({
  title,
  tone,
  expanded,
  onToggle,
  loading,
  rows,
}: {
  title: string
  tone: 'expired' | 'due_soon'
  expanded: boolean
  onToggle: () => void
  loading: boolean
  rows: WarrantyNotification[]
}) {
  const borderTone = tone === 'expired' ? 'border-accent-soft' : 'border-base'
  const badgeTone = tone === 'expired'
    ? 'bg-accent text-on-accent'
    : 'bg-[color:var(--accent-soft)]/20 text-primary'

  return (
    <section className={`rounded-xl border bg-surface ${borderTone}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <p className="text-sm font-semibold text-primary">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-base px-4 py-3">
          {loading ? (
            <p className="text-sm text-subtle">Loading alerts...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-subtle">No alerts in this category.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <article
                  key={row.notification_id}
                  className="rounded-lg border border-base bg-surface-2 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-primary">
                      {row.asset_tag || 'Asset'} {row.model ? `- ${row.model}` : ''}
                    </p>
                    {row.asset_tag ? (
                      <Link
                        to={`/assets/${encodeURIComponent(row.asset_tag)}`}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Open asset
                      </Link>
                    ) : (
                      <span className="text-xs text-subtle">Tag unavailable</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">{row.message}</p>
                  <p className="mt-1 text-xs text-subtle">
                    Expires: {formatExpiryDate(row.warranty_expiry)} | Days remaining: {row.days_remaining}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
