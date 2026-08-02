import { Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { DASHBOARD_SECTIONS, DEPARTMENT_LABELS } from '../dashboardLabels'
import type { DepartmentSummary as DepartmentRow } from '../dashboardAggregates'
import type { DashboardOverview } from '../useDashboardOverview'
import SectionShell from '../ui/SectionShell'
import { SectionEmpty, SectionError, SkeletonGrid } from '../ui/SectionState'

const MAX_DEPARTMENTS = 8

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-primary">
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

function DepartmentCard({ row }: { row: DepartmentRow }) {
  const percent = Math.round(row.utilization * 100)

  return (
    <Link
      to="/employee"
      className="flex flex-col rounded-lg border border-base bg-surface p-4 transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:shadow-focus"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Building2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="truncate text-sm font-medium text-primary">{row.department}</p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label={DEPARTMENT_LABELS.totalAssets} value={row.total} />
        <Stat label={DEPARTMENT_LABELS.assigned} value={row.assigned} />
        <Stat label={DEPARTMENT_LABELS.inStock} value={row.inStock} />
        <Stat label={DEPARTMENT_LABELS.repair} value={row.repair} />
        <Stat label={DEPARTMENT_LABELS.warranty} value={row.warrantyExpiring} />
      </dl>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-subtle">
          <span>{DEPARTMENT_LABELS.utilization}</span>
          <span className="font-mono tabular-nums">{percent}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </Link>
  )
}

export default function DepartmentSummarySection({ overview }: { overview: DashboardOverview }) {
  const { departments, isSweepLoading, hasSweepError, isSweepCapped } = overview
  const rows = departments.slice(0, MAX_DEPARTMENTS)

  return (
    <SectionShell
      title={DASHBOARD_SECTIONS.departments.title}
      subtitle={DASHBOARD_SECTIONS.departments.subtitle}
    >
      {isSweepCapped ? (
        <p className="mb-3 text-xs text-subtle">{DEPARTMENT_LABELS.capped}</p>
      ) : null}

      {hasSweepError ? <SectionError message={DEPARTMENT_LABELS.error} /> : null}

      {!hasSweepError && isSweepLoading ? (
        <SkeletonGrid
          count={4}
          height="h-48"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        />
      ) : null}

      {!hasSweepError && !isSweepLoading && rows.length === 0 ? (
        <SectionEmpty message={DEPARTMENT_LABELS.empty} />
      ) : null}

      {!hasSweepError && !isSweepLoading && rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <DepartmentCard key={row.department} row={row} />
          ))}
        </div>
      ) : null}
    </SectionShell>
  )
}
