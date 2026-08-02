import { Boxes, CheckCircle2, PackageOpen, ShieldAlert, Users, Wrench } from 'lucide-react'

import { DASHBOARD_SECTIONS, KPI_LABELS } from '../dashboardLabels'
import type { DashboardOverview } from '../useDashboardOverview'
import MetricCard, { type MetricCardProps } from '../ui/MetricCard'
import SectionShell from '../ui/SectionShell'
import { SectionError } from '../ui/SectionState'

const GRID_CLASS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'

export default function ExecutiveKpis({ overview }: { overview: DashboardOverview }) {
  const { stats, health, isStatsLoading, hasStatsError, generatedAt } = overview

  const share = (value: number): number | undefined =>
    stats.totalAssets > 0 ? value / stats.totalAssets : undefined

  const cards: MetricCardProps[] = [
    {
      icon: Boxes,
      label: KPI_LABELS.totalAssets,
      value: stats.totalAssets,
      hint: KPI_LABELS.totalAssetsHint,
      severity: 'info',
    },
    {
      icon: PackageOpen,
      label: KPI_LABELS.inStock,
      value: stats.inStockAssets,
      hint: KPI_LABELS.inStockHint,
      severity: 'ok',
      share: share(stats.inStockAssets),
    },
    {
      icon: CheckCircle2,
      label: KPI_LABELS.assigned,
      value: stats.assignedAssets,
      hint: KPI_LABELS.assignedHint,
      severity: 'ok',
      share: share(stats.assignedAssets),
    },
    {
      icon: Users,
      label: KPI_LABELS.activeEmployees,
      value: stats.activeEmployees,
      hint: KPI_LABELS.activeEmployeesHint,
      severity: 'info',
    },
    {
      icon: ShieldAlert,
      label: KPI_LABELS.warrantyExpiring,
      value: health.warrantyExpiring,
      hint: KPI_LABELS.warrantyExpiringHint,
      severity: health.warrantyExpiring > 0 ? 'warning' : 'ok',
    },
    {
      icon: Wrench,
      label: KPI_LABELS.underRepair,
      value: health.underRepair,
      hint: KPI_LABELS.underRepairHint,
      severity: health.underRepair > 0 ? 'warning' : 'ok',
    },
  ]

  return (
    <SectionShell title={DASHBOARD_SECTIONS.kpi.title} subtitle={DASHBOARD_SECTIONS.kpi.subtitle}>
      {hasStatsError ? (
        <SectionError />
      ) : (
        <div className={GRID_CLASS}>
          {cards.map((card) => (
            <MetricCard
              key={card.label}
              {...card}
              updatedAt={generatedAt}
              isLoading={isStatsLoading}
            />
          ))}
        </div>
      )}
    </SectionShell>
  )
}
