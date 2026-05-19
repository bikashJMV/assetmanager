import { useCallback, useEffect, useState, useRef } from 'react'
import {
  getOverviewAnalysisData,
  hasActiveAdminAccess,
  listWarrantyNotifications,
  type OverviewAnalysisSnapshot,
  type WarrantyNotification,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatEnumLabel } from '../../utils/formatDisplay'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success' | 'error'

type DashboardData = {
  snapshot: OverviewAnalysisSnapshot
  warrantyAlerts: WarrantyNotification[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Colors
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<
  string,
  {
    bar: string
    dot: string
    soft: string
    text: string
  }
> = {
  assigned: {
    bar: 'bg-blue-500',
    dot: 'bg-blue-500',
    soft: 'bg-blue-500/10',
    text: 'text-blue-400',
  },
  in_stock: {
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
    soft: 'bg-violet-500/10',
    text: 'text-violet-400',
  },
  lost: {
    bar: 'bg-orange-500',
    dot: 'bg-orange-500',
    soft: 'bg-orange-500/10',
    text: 'text-orange-400',
  },
  retired: {
    bar: 'bg-zinc-500',
    dot: 'bg-zinc-500',
    soft: 'bg-zinc-500/10',
    text: 'text-zinc-400',
  },
  disposed: {
    bar: 'bg-red-500',
    dot: 'bg-red-500',
    soft: 'bg-red-500/10',
    text: 'text-red-400',
  },
  in_repair: {
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
}

function getStatusColor(label: string) {
  const key = label.toLowerCase().replace(/\s+/g, '_')

  return (
    STATUS_COLORS[key] ?? {
      bar: 'bg-cyan-500',
      dot: 'bg-cyan-500',
      soft: 'bg-cyan-500/10',
      text: 'text-cyan-400',
    }
  )
}

const CATEGORY_COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-amber-500',
]

function getCategoryColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computePercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function computeUtilizationRate(assigned: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((assigned / total) * 100)
}

function computeWarrantySeverityCounts(alerts: WarrantyNotification[]) {
  return alerts.reduce(
    (acc, a) => {
      if (a.severity === 'expired') acc.expired += 1
      else acc.dueSoon += 1

      return acc
    },
    {
      expired: 0,
      dueSoon: 0,
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  )
}

function DataBar({
  ratio,
  colorClass,
}: {
  ratio: number
  colorClass: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const id = requestAnimationFrame(() => {
      el.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`
    })

    return () => cancelAnimationFrame(id)
  }, [ratio])

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        ref={ref}
        className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
        style={{ width: '0%' }}
      />
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  accent?: string
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          {label}
        </p>

        {accent ? (
          <span
            className={`h-2 w-2 rounded-full ${accent}`}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text)]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>

      {sub ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{sub}</p>
      ) : null}
    </article>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center text-sm text-[var(--subtle)]">
      {message}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OverviewAnalysis() {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [error, setError] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    setError('')

    try {
      const allowed = await hasActiveAdminAccess()

      if (!allowed) {
        setAccessDenied(true)
        setLoadState('error')
        return
      }

      const [snapshot, warrantyAlerts] = await Promise.all([
        getOverviewAnalysisData({ employeeLimit: 10 }),
        listWarrantyNotifications(100),
      ])

      setData({
        snapshot,
        warrantyAlerts,
      })

      setLoadState('success')
    } catch (err) {
      logDevError('overviewAnalytics.load', err)

      setError(
        getUserFacingMessage(
          err,
          'Unable to load analytics dashboard right now.',
        ),
      )

      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h1 className="text-xl font-semibold">Admin Access Required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This dashboard is restricted to administrators.
          </p>
        </div>
      </main>
    )
  }

  if (loadState === 'loading' && !data) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--text)]">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-10 w-64 rounded bg-[var(--surface-2)]" />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-[var(--surface-2)]"
              />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (loadState === 'error' && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
          <p className="text-sm font-semibold text-red-400">
            Failed to load analytics
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{error}</p>
        </div>
      </main>
    )
  }

  if (!data) return null

  const { snapshot, warrantyAlerts } = data

  const utilizationRate = computeUtilizationRate(
    snapshot.assignedAssets,
    snapshot.totalAssets,
  )

  const unassignedAssets = Math.max(
    0,
    snapshot.totalAssets - snapshot.assignedAssets,
  )

  const statusTotal = snapshot.statusBreakdown.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  const categoryTotal = snapshot.categoryBreakdown.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  const departmentMap = new Map<
    string,
    {
      employees: number
      assets: number
    }
  >()

  for (const row of snapshot.employeeLoad) {
    const dept = row.department?.trim()

    if (!dept) continue

    const existing = departmentMap.get(dept) ?? {
      employees: 0,
      assets: 0,
    }

    departmentMap.set(dept, {
      employees: existing.employees + 1,
      assets: existing.assets + row.assigned_assets,
    })
  }

  const departments = Array.from(departmentMap.entries())
    .map(([dept, data]) => ({
      dept,
      ...data,
    }))
    .sort((a, b) => b.assets - a.assets)

  const maxDepartmentAssets = Math.max(
    ...departments.map((d) => d.assets),
    1,
  )



  const { expired, dueSoon } = computeWarrantySeverityCounts(
    warrantyAlerts,
  )

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-7xl lg:p-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-center">
          <h2 className="mt-1 font-bold tracking-tight text-[var(--text)] sm:text-2xl">
            Operational asset and employee metrics across the organization.
          </h2>
        </div>

        {/* Dashboard */}
        <div className="mt-4 grid gap-4">

          {/* KPI ROW */}
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard
              label="Total Assets"
              value={snapshot.totalAssets}
              sub="All inventory records"
              accent="bg-violet-500"
            />

            <KpiCard
              label="Assigned Assets"
              value={snapshot.assignedAssets}
              sub={`${utilizationRate}% utilization rate`}
              accent="bg-blue-500"
            />

            <KpiCard
              label="Ready To Use"
              value={snapshot.inStockAssets}
              sub="Available inventory"
              accent="bg-emerald-500"
            />

            <KpiCard
              label="Active Employees"
              value={snapshot.activeEmployees}
              sub="Current workforce"
              accent="bg-amber-500"
            />
          </section>

          {/* MAIN GRID */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_1.1fr_0.9fr]">

            {/* Status */}
            <Panel
              title="Asset Status"
              subtitle="Where assets currently exist"
            >
              {snapshot.statusBreakdown.length === 0 ? (
                <EmptyState message="No status data available." />
              ) : (
                <div className="space-y-3">
                  {snapshot.statusBreakdown
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((item) => {
                      const percent = computePercent(item.count, statusTotal)

                      const colors = getStatusColor(item.label)

                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${colors.dot}`}
                              />

                              <span className="text-[var(--text)]/80">
                                {formatEnumLabel(item.label)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-semibold text-[var(--text)]">
                                {item.count}
                              </span>

                              <span className={colors.text}>
                                {percent}%
                              </span>
                            </div>
                          </div>

                          <DataBar
                            ratio={item.count / statusTotal}
                            colorClass={colors.bar}
                          />
                        </div>
                      )
                    })}
                </div>
              )}
            </Panel>

            {/* Categories */}
            <Panel
              title="Asset Categories"
              subtitle="Inventory grouped by category"
            >
              {snapshot.categoryBreakdown.length === 0 ? (
                <EmptyState message="No category data available." />
              ) : (
                <div className="space-y-3">
                  {snapshot.categoryBreakdown
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((item, idx) => {
                      const percent = computePercent(item.count, categoryTotal)

                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${getCategoryColor(idx)}`}
                              />

                              <span className="text-[var(--text)]/80">
                                {item.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs">
                              <span className="font-semibold text-[var(--text)]">
                                {item.count}
                              </span>

                              <span className="text-[var(--muted)]">
                                {percent}%
                              </span>
                            </div>
                          </div>

                          <DataBar
                            ratio={item.count / categoryTotal}
                            colorClass={getCategoryColor(idx)}
                          />
                        </div>
                      )
                    })}
                </div>
              )}
            </Panel>

            {/* Top Employees */}
            <Panel
              title="Employees With Most Assets"
              subtitle="Top assigned asset holders"
            >
              {snapshot.employeeLoad.length === 0 ? (
                <EmptyState message="No assignment data available." />
              ) : (
                <div className="space-y-2">
                  {snapshot.employeeLoad.map((row, idx) => (
                    <div
                      key={row.employee_id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-bold text-[var(--text)]">
                          {idx + 1}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text)]">
                            {row.employee_name}
                          </p>

                          <p className="truncate text-[11px] text-[var(--subtle)]">
                            {[
                              row.display_employee_id,
                              row.department,
                            ]
                              .filter(Boolean)
                              .join(' | ') || 'Employee'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-[var(--text)]">
                          {row.assigned_assets}
                        </p>

                        <p className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">
                          Assets
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>

          {/* SECOND ROW */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">

            {/* Workforce */}
            <Panel
              title="Department Asset Distribution"
              subtitle="Assets grouped by employee department"
            >
              {departments.length === 0 ? (
                <EmptyState message="No department data available." />
              ) : (
                <div className="space-y-3">
                  {departments.map((dept, idx) => (
                    <div
                      key={dept.dept}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {dept.dept}
                          </p>

                          <p className="text-[11px] text-[var(--subtle)]">
                            {dept.employees} employee
                            {dept.employees !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-[var(--text)]">
                          {dept.assets} assets
                        </p>
                      </div>

                      <DataBar
                        ratio={dept.assets / maxDepartmentAssets}
                        colorClass={getCategoryColor(idx)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Insights */}
            <Panel
              title="Operational Insights"
              subtitle="Derived directly from live inventory metrics"
            >
              <div className="space-y-3">

                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {computePercent(
                      snapshot.inStockAssets,
                      snapshot.totalAssets,
                    )}% of assets are currently available for use.
                  </p>
                </div>

                {snapshot.categoryBreakdown.length > 0 ? (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {
                        snapshot.categoryBreakdown
                          .slice()
                          .sort((a, b) => b.count - a.count)[0]?.label
                      }{' '}
                      is the largest inventory category.
                    </p>
                  </div>
                ) : null}

                {snapshot.employeeLoad.length > 0 ? (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {
                        snapshot.employeeLoad
                          .slice()
                          .sort(
                            (a, b) =>
                              b.assigned_assets - a.assigned_assets,
                          )[0]?.employee_name
                      }{' '}
                      currently has the highest assigned asset count.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                  <p className="text-sm font-medium text-white">
                    {unassignedAssets} assets remain unassigned.
                  </p>
                </div>
              </div>
            </Panel>
          </section>

          {/* THIRD ROW */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">

            {/* Warranty KPIs */}
            <Panel
              title="Warranty Risk"
              subtitle="Warranty notification system"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">

                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-300">
                    Expired
                  </p>

                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {expired}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                    Due Soon
                  </p>

                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {dueSoon}
                  </p>
                </div>

                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
                    Total Alerts
                  </p>

                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {warrantyAlerts.length}
                  </p>
                </div>
              </div>
            </Panel>

            {/* Warranty Alerts */}
            <Panel
              title="Warranty Alerts"
              subtitle="Live notification records"
            >
              {warrantyAlerts.length === 0 ? (
                <EmptyState message="No active warranty alerts." />
              ) : (
                <div className="space-y-2">
                  {warrantyAlerts.slice(0, 10).map((alert) => {
                    const expired = alert.severity === 'expired'

                    return (
                      <div
                        key={alert.notification_id}
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${
                          expired
                            ? 'border-red-500/20 bg-red-500/5'
                            : 'border-amber-500/20 bg-amber-500/5'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text)]">
                            {alert.category_name ?? 'Asset'} ·{' '}
                            {alert.asset_tag ?? '—'}
                          </p>

                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                            {alert.message}
                          </p>

                          {alert.current_employee_name ? (
                            <p className="mt-1 text-[10px] text-[var(--subtle)]">
                              Holder: {alert.current_employee_name}
                            </p>
                          ) : null}
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                            expired
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {expired
                            ? `${Math.abs(alert.days_remaining)}d ago`
                            : `${alert.days_remaining}d left`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </section>
        </div>
      </div>
    </main>
  )
}
