import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getOverviewAnalysisData,
  hasActiveAdminAccess,
  type OverviewAnalysisEmployeeLoad,
  type OverviewAnalysisMetric,
  type OverviewAnalysisSnapshot,
} from '../../api'
import RefreshButton from '../common/RefreshButton'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay, formatEnumLabel } from '../../utils/formatDisplay'

const EMPLOYEE_LOAD_LIMIT = 5

export default function OverviewAnalysis() {
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<OverviewAnalysisSnapshot | null>(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getOverviewAnalysisData({ employeeLimit: EMPLOYEE_LOAD_LIMIT })
      setAccessState('allowed')
      setSnapshot(next)
    } catch (err) {
      logDevError('overviewAnalysis.load', err)
      setError(getUserFacingMessage(err, 'Unable to load overview analysis right now.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    void (async () => {
      setLoading(true)
      setError('')
      try {
        const allowed = await hasActiveAdminAccess()
        if (!mounted) return

        if (!allowed) {
          setAccessState('denied')
          setSnapshot(null)
          return
        }

        setAccessState('allowed')
        const next = await getOverviewAnalysisData({ employeeLimit: EMPLOYEE_LOAD_LIMIT })
        if (!mounted) return
        setSnapshot(next)
      } catch (err) {
        if (!mounted) return
        logDevError('overviewAnalysis.bootstrap', err)
        setError(getUserFacingMessage(err, 'Unable to load overview analysis right now.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const hasAnyOverviewData = useMemo(() => {
    if (!snapshot) return false
    return (
      snapshot.totalAssets > 0 ||
      snapshot.activeEmployees > 0 ||
      snapshot.statusBreakdown.some((item) => item.count > 0) ||
      snapshot.categoryBreakdown.some((item) => item.count > 0) ||
      snapshot.employeeLoad.length > 0
    )
  }, [snapshot])

  return (
    <section className="space-y-6" aria-labelledby="overview-analysis-title">
      <header className="flex flex-col gap-4 rounded-2xl border border-base bg-surface-2 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="overview-analysis-title" className="text-2xl font-semibold tracking-tight">
            Overview Analysis
          </h2>
          <p className="max-w-2xl text-sm text-muted sm:text-base">
            Track the current inventory footprint, assignment load, and employee coverage without leaving the analysis route.
          </p>
        </div>

        <RefreshButton
          onClick={() => {
            if (accessState !== 'allowed') return
            void loadOverview()
          }}
          loading={loading && accessState === 'allowed'}
          disabled={accessState !== 'allowed'}
          label="Refresh overview"
          ariaLabel="Refresh overview analysis"
          title={loading ? 'Refreshing overview analysis' : 'Refresh overview analysis'}
          className="shrink-0"
        />
      </header>

      {accessState === 'checking' && loading && !snapshot ? <OverviewLoadingState /> : null}

      {accessState === 'denied' ? (
        <InlineStatePanel
          title="Overview access required"
          message="This section is available only to active Admin and IT Ops accounts. Sign in with an authorized employee profile to view organization-wide metrics."
        />
      ) : null}

      {error && !snapshot ? (
        <InlineStatePanel
          title="Overview data is unavailable"
          message={error}
          action={
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Try again
            </button>
          }
        />
      ) : null}

      {accessState === 'allowed' && error && snapshot ? (
        <InlineStatePanel
          title="Showing the last loaded overview snapshot"
          message={error}
          tone="warning"
        />
      ) : null}

      {accessState === 'allowed' && !loading && snapshot && !hasAnyOverviewData ? (
        <InlineStatePanel
          title="No overview data available"
          message="No overview data is available right now."
        />
      ) : null}

      {accessState === 'allowed' && snapshot && hasAnyOverviewData ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OverviewMetricCard label="Total Assets" value={snapshot.totalAssets} detail="All non-deleted assets in the current inventory view." />
            <OverviewMetricCard label="Assigned Assets" value={snapshot.assignedAssets} detail="Assets with a current holder or open assignment." />
            <OverviewMetricCard label="In Stock" value={snapshot.inStockAssets} detail="Assets currently marked with the in-stock inventory status." />
            <OverviewMetricCard label="Active Employees" value={snapshot.activeEmployees} detail="Employees who are currently active in the organization." />
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
            <BreakdownSection
              title="Inventory Status"
              subtitle="Current asset counts by inventory status."
              items={snapshot.statusBreakdown}
              emptyLabel="No status data available."
              labelFormatter={formatEnumLabel}
            />

            <BreakdownSection
              title="Category Breakdown"
              subtitle="Distribution of assets across asset categories."
              items={snapshot.categoryBreakdown}
              emptyLabel="No category data available."
            />

            <EmployeeLoadSection rows={snapshot.employeeLoad} />
          </div>
        </>
      ) : null}
    </section>
  )
}

function OverviewMetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail: string
}) {
  return (
    <article className="rounded-xl border border-base bg-surface-2 p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-primary">{value.toLocaleString()}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  )
}

function BreakdownSection({
  title,
  subtitle,
  items,
  emptyLabel,
  labelFormatter,
}: {
  title: string
  subtitle: string
  items: OverviewAnalysisMetric[]
  emptyLabel: string
  labelFormatter?: (value: string) => string
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0)

  return (
    <section className="rounded-xl border border-base bg-surface-2 p-5">
      <div>
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>

      {items.length === 0 || total === 0 ? (
        <p className="mt-6 text-sm text-subtle">{emptyLabel}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const ratio = total > 0 ? Math.round((item.count / total) * 100) : 0
            return (
              <div key={item.label} className="rounded-xl border border-base bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-primary">
                    {labelFormatter ? labelFormatter(item.label) : item.label}
                  </p>
                  <p className="text-sm font-semibold text-primary">{item.count.toLocaleString()}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-app">
                  <div
                    className="h-2 rounded-full bg-accent transition-[width]"
                    style={{ width: `${Math.min(Math.max(ratio, 0), 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-subtle">{ratio}% of visible records</p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EmployeeLoadSection({ rows }: { rows: OverviewAnalysisEmployeeLoad[] }) {
  return (
    <section className="rounded-xl border border-base bg-surface-2 p-5">
      <div>
        <h3 className="text-lg font-semibold text-primary">Employee Assignment Load</h3>
        <p className="mt-1 text-sm text-muted">Top current holders by assigned asset count.</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-subtle">No assigned employee load to show right now.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((row, index) => (
            <article key={row.employee_id} className="rounded-xl border border-base bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">{row.employee_name}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {[
                      row.employee_code ? `ID ${row.employee_code}` : null,
                      row.department ? formatDisplay(row.department) : null,
                    ]
                      .filter(Boolean)
                      .join(' | ') || 'Employee details unavailable'}
                  </p>
                </div>
                <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full border border-base bg-surface-2 px-3 py-1 text-xs font-semibold text-primary">
                  #{index + 1}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.16em] text-subtle">Assigned Assets</p>
                <p className="text-2xl font-semibold tracking-tight text-primary">
                  {row.assigned_assets.toLocaleString()}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function OverviewLoadingState() {
  return (
    <section className="space-y-6" aria-live="polite" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-xl border border-base bg-surface-2 p-5">
            <div className="h-3 w-24 rounded bg-surface" />
            <div className="mt-4 h-8 w-20 rounded bg-surface" />
            <div className="mt-3 h-3 w-full rounded bg-surface" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-xl border border-base bg-surface-2 p-5">
            <div className="h-5 w-40 rounded bg-surface" />
            <div className="mt-2 h-3 w-52 rounded bg-surface" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div key={rowIndex} className="rounded-xl border border-base bg-surface p-4">
                  <div className="h-3 w-28 rounded bg-app" />
                  <div className="mt-3 h-2 w-full rounded bg-app" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function InlineStatePanel({
  title,
  message,
  action,
  tone = 'default',
}: {
  title: string
  message: string
  action?: ReactNode
  tone?: 'default' | 'warning'
}) {
  return (
    <section
      className={`rounded-xl border p-5 ${
        tone === 'warning'
          ? 'border-accent-soft bg-[color:var(--accent-soft)]/10'
          : 'border-base bg-surface-2'
      }`}
    >
      <p className="text-sm font-semibold text-primary">{title}</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}
