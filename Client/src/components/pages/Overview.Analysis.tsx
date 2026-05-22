import { useState } from 'react'
import { useAnalyticsData } from '../analytics/hooks/useAnalyticsData'
import AssetsByDepartmentChart from '../analytics/charts/AssetsByDepartmentChart'
import AssetsByStatusChart from '../analytics/charts/AssetsByStatusChart'
import AssignmentActivityChart from '../analytics/charts/AssignmentActivityChart'
import type { WarrantyNotification } from '../../api'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeUtilizationRate(assigned: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((assigned / total) * 100)
}

function computePercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function computeWarrantySeverityCounts(alerts: WarrantyNotification[]) {
  return alerts.reduce(
    (acc, a) => {
      if (a.severity === 'expired') acc.expired += 1
      else acc.dueSoon += 1
      return acc
    },
    { expired: 0, dueSoon: 0 },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
        {accent && <span className={`h-2 w-2 rounded-full ${accent}`} aria-hidden="true" />}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text)]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--muted)]">{sub}</p>}
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
// Warranty Risk tile with expandable asset list
// ─────────────────────────────────────────────────────────────────────────────

function WarrantyTile({
  label,
  count,
  borderClass,
  bgClass,
  textClass,
  badgeClass,
  alerts,
  expanded,
  onToggle,
}: {
  label: string
  count: number
  borderClass: string
  bgClass: string
  textClass: string
  badgeClass: string
  alerts: WarrantyNotification[]
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} overflow-hidden`}>
      <button
        type="button"
        className="w-full p-3 text-left cursor-pointer hover:brightness-110 transition"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between">
          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${textClass}`}>{label}</p>
          <span className={`text-[10px] font-bold ${textClass} opacity-60`}>{expanded ? '▲' : '▼'}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{count}</p>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] max-h-64 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="p-3 text-xs text-[var(--muted)]">No assets in this category.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {alerts.map((alert) => (
                <li key={alert.notification_id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--text)]">
                      {alert.category_name ?? 'Asset'} · {alert.asset_tag ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">{alert.message}</p>
                    {alert.current_employee_name && (
                      <p className="mt-0.5 text-[10px] text-[var(--subtle)]">Holder: {alert.current_employee_name}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                    {alert.severity === 'expired'
                      ? `${Math.abs(alert.days_remaining)}d ago`
                      : `${alert.days_remaining}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OverviewAnalysis() {
  const { data, loadState, error, accessDenied } = useAnalyticsData()
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null)
  const [expandedTile, setExpandedTile] = useState<'expired' | 'dueSoon' | null>(null)

  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h1 className="text-xl font-semibold">Admin Access Required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">This dashboard is restricted to administrators.</p>
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
              <div key={i} className="h-32 rounded-xl bg-[var(--surface-2)]" />
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
          <p className="text-sm font-semibold text-red-400">Failed to load analytics</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{error}</p>
        </div>
      </main>
    )
  }

  if (!data) return null

  const { snapshot, warrantyAlerts } = data
  const utilizationRate = computeUtilizationRate(snapshot.assignedAssets, snapshot.totalAssets)
  const unassignedAssets = Math.max(0, snapshot.totalAssets - snapshot.assignedAssets)
  const { expired, dueSoon } = computeWarrantySeverityCounts(warrantyAlerts)

  const expiredAlerts = warrantyAlerts.filter((a) => a.severity === 'expired')
  const dueSoonAlerts = warrantyAlerts.filter((a) => a.severity === 'due_soon')

  // Department aggregation for chart
  const departmentMap = new Map<string, { employees: number; assets: number }>()
  for (const row of snapshot.employeeLoad) {
    const dept = row.department?.trim()
    if (!dept) continue
    const existing = departmentMap.get(dept) ?? { employees: 0, assets: 0 }
    departmentMap.set(dept, { employees: existing.employees + 1, assets: existing.assets + row.assigned_assets })
  }
  const deptChartData = Array.from(departmentMap.entries())
    .map(([department, d]) => ({ department, count: d.assets }))
    .sort((a, b) => b.count - a.count)

  const filteredEmployeeLoad = activeDepartment
    ? snapshot.employeeLoad.filter((e) => e.department?.trim() === activeDepartment)
    : snapshot.employeeLoad

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-7xl lg:p-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-center">
          <h2 className="mt-1 font-bold tracking-tight text-[var(--text)] sm:text-2xl">
            Operational asset and employee metrics across the organization.
          </h2>
        </div>

        <div className="mt-4 grid gap-4">

          {/* KPI ROW */}
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard label="Total Assets" value={snapshot.totalAssets} sub="All inventory records" accent="bg-violet-500" />
            <KpiCard label="Assigned Assets" value={snapshot.assignedAssets} sub={`${utilizationRate}% utilization rate`} accent="bg-blue-500" />
            <KpiCard label="Ready To Use" value={snapshot.inStockAssets} sub="Available inventory" accent="bg-emerald-500" />
            <KpiCard label="Active Employees" value={snapshot.activeEmployees} sub="Current workforce" accent="bg-amber-500" />
          </section>

          {/* ECHARTS ROW */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AssetsByDepartmentChart
              data={deptChartData}
              loading={loadState === 'loading'}
              activeDepartment={activeDepartment}
              onDepartmentFilter={setActiveDepartment}
            />
            <AssetsByStatusChart
              data={snapshot.statusBreakdown}
              loading={loadState === 'loading'}
            />
            <AssignmentActivityChart />
          </section>

          {/* BOTTOM ROW — Employees | Operational Insights | Warranty Risk */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">

            {/* Employees With Most Assets */}
            <Panel
              title="Employees With Most Assets"
              subtitle={activeDepartment ? `Filtered: ${activeDepartment}` : 'Top assigned asset holders'}
            >
              {filteredEmployeeLoad.length === 0 ? (
                <EmptyState message="No assignment data available." />
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {filteredEmployeeLoad.map((row, idx) => (
                    <div key={row.employee_id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-bold text-white">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text)]">{row.employee_name}</p>
                          <p className="truncate text-[11px] text-[var(--subtle)]">
                            {[row.display_employee_id, row.department].filter(Boolean).join(' | ') || 'Employee'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-[var(--text)]">{row.assigned_assets}</p>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">Assets</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Operational Insights */}
            <Panel title="Operational Insights" subtitle="Derived directly from live inventory metrics">
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {computePercent(snapshot.inStockAssets, snapshot.totalAssets)}% of assets are currently available for use.
                  </p>
                </div>
                {snapshot.categoryBreakdown.length > 0 && (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {snapshot.categoryBreakdown.slice().sort((a, b) => b.count - a.count)[0]?.label} is the largest inventory category.
                    </p>
                  </div>
                )}
                {snapshot.employeeLoad.length > 0 && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {snapshot.employeeLoad.slice().sort((a, b) => b.assigned_assets - a.assigned_assets)[0]?.employee_name} currently has the highest assigned asset count.
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    {unassignedAssets} assets remain unassigned.
                  </p>
                </div>
              </div>
            </Panel>

            {/* Warranty Risk */}
            <Panel title="Warranty Risk" subtitle="Click a tile to view affected assets">
              <div className="space-y-3">
                <WarrantyTile
                  label="Expired"
                  count={expired}
                  borderClass="border-red-500/20"
                  bgClass="bg-red-500/10"
                  textClass="text-red-300"
                  badgeClass="bg-red-500/15 text-red-300"
                  alerts={expiredAlerts}
                  expanded={expandedTile === 'expired'}
                  onToggle={() => setExpandedTile(expandedTile === 'expired' ? null : 'expired')}
                />
                <WarrantyTile
                  label="Due Soon"
                  count={dueSoon}
                  borderClass="border-amber-500/20"
                  bgClass="bg-amber-500/10"
                  textClass="text-amber-300"
                  badgeClass="bg-amber-500/15 text-amber-300"
                  alerts={dueSoonAlerts}
                  expanded={expandedTile === 'dueSoon'}
                  onToggle={() => setExpandedTile(expandedTile === 'dueSoon' ? null : 'dueSoon')}
                />
              </div>
            </Panel>

          </section>

        </div>
      </div>
    </main>
  )
}
