import { CheckCircle2, PackagePlus, ShieldAlert, TriangleAlert, UserX, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { DASHBOARD_SECTIONS, HEALTH_LABELS, type Severity } from '../dashboardLabels'
import type { DashboardOverview } from '../useDashboardOverview'
import SectionShell from '../ui/SectionShell'
import { SectionError, SkeletonGrid } from '../ui/SectionState'

type HealthItem = {
  icon: LucideIcon
  label: string
  hint: string
  value: number
  severity: Severity
}

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
  ok: 'border-l-success',
}

const SEVERITY_ICON_CLASS: Record<Severity, string> = {
  critical: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  ok: 'bg-success/10 text-success',
}

function severityFor(value: number, warnAt: number): Severity {
  if (value === 0) return 'ok'
  return value >= warnAt ? 'critical' : 'warning'
}

export default function SystemHealth({ overview }: { overview: DashboardOverview }) {
  const { health, isSweepLoading, hasSweepError } = overview

  const items: HealthItem[] = [
    {
      icon: ShieldAlert,
      label: HEALTH_LABELS.warrantyExpiring,
      hint: HEALTH_LABELS.warrantyExpiringHint,
      value: health.warrantyExpiring,
      severity: severityFor(health.warrantyExpiring, 5),
    },
    {
      icon: TriangleAlert,
      label: HEALTH_LABELS.lowStock,
      hint: HEALTH_LABELS.lowStockHint,
      value: health.lowStockCategories,
      severity: severityFor(health.lowStockCategories, 3),
    },
    {
      icon: Wrench,
      label: HEALTH_LABELS.underRepair,
      hint: HEALTH_LABELS.underRepairHint,
      value: health.underRepair,
      severity: severityFor(health.underRepair, 5),
    },
    {
      icon: UserX,
      label: HEALTH_LABELS.unassignedHolders,
      hint: HEALTH_LABELS.unassignedHoldersHint,
      value: health.assignedWithoutHolder,
      severity: severityFor(health.assignedWithoutHolder, 1),
    },
    {
      icon: PackagePlus,
      label: HEALTH_LABELS.recentlyAdded,
      hint: HEALTH_LABELS.recentlyAddedHint,
      value: health.recentlyAdded,
      severity: 'info',
    },
  ]

  const allClear = items.every((item) => item.severity === 'ok' || item.severity === 'info')

  return (
    <SectionShell
      title={DASHBOARD_SECTIONS.health.title}
      subtitle={DASHBOARD_SECTIONS.health.subtitle}
    >
      {hasSweepError ? <SectionError message={HEALTH_LABELS.error} /> : null}

      {!hasSweepError && isSweepLoading ? (
        <SkeletonGrid
          count={5}
          height="h-24"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        />
      ) : null}

      {!hasSweepError && !isSweepLoading ? (
        <>
          {allClear ? (
            <p className="mb-3 inline-flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {HEALTH_LABELS.allClear}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {items.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border border-l-2 border-base bg-surface p-4 transition-shadow duration-150 hover:shadow-md ${SEVERITY_CLASS[item.severity]}`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${SEVERITY_ICON_CLASS[item.severity]}`}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-3 font-mono text-2xl font-bold tabular-nums leading-none text-primary">
                  {item.value.toLocaleString()}
                </p>
                <p className="mt-2 text-sm font-medium text-primary">{item.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-subtle">{item.hint}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </SectionShell>
  )
}
