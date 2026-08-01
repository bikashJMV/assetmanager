import { useAnalyticsTimeseriesQuery } from '../../queries/meta'
import { getUserFacingMessage } from '../../utils/errors'

import CategoryDistributionBar from './analytics/CategoryDistributionBar'
import CumulativeAssetsLine from './analytics/CumulativeAssetsLine'
import InStockByLocationPanel from './analytics/InStockByLocationPanel'
import MonthlyAcquisitionHeatmap from './analytics/MonthlyAcquisitionHeatmap'
import RollingAssignmentsLine from './analytics/RollingAssignmentsLine'
import WarrantyScatter from './analytics/WarrantyScatter'
import YearlyAcquisitionBar from './analytics/YearlyAcquisitionBar'
import { ANALYTICS_LABELS } from './analytics/analyticsLabels'

const L = ANALYTICS_LABELS

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--bg)] p-3 text-[var(--text)] sm:p-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  )
}

function ReportHeader({ generatedAt }: { generatedAt?: string }) {
  const stamp = generatedAt ? new Date(generatedAt).toLocaleString() : null

  return (
    <header className="border-b border-[var(--border)] pb-4">
      <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">
        {L.pageTitle}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{L.pageSubtitle}</p>
      {stamp ? (
        <p className="mt-1 text-xs text-[var(--subtle)]">
          {L.generatedPrefix} {stamp}
        </p>
      ) : null}
    </header>
  )
}

function LoadingSkeleton() {
  return (
    <Shell>
      <ReportHeader />
      <div className="mt-6 animate-pulse space-y-4">
        <div className="h-64 rounded-xl bg-[var(--surface-2)]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 rounded-xl bg-[var(--surface-2)]" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-[var(--surface-2)]" />
      </div>
    </Shell>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell>
      <ReportHeader />
      <div
        className="mt-6 rounded-xl border p-6"
        style={{ borderColor: 'hsl(var(--danger) / 0.2)', backgroundColor: 'hsl(var(--danger) / 0.1)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'hsl(var(--danger))' }}>
          Failed to load analytics
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-3)]"
        >
          Retry
        </button>
      </div>
    </Shell>
  )
}

export default function OverviewAnalysis() {
  const query = useAnalyticsTimeseriesQuery()

  if (query.isPending) return <LoadingSkeleton />

  if (query.isError) {
    return (
      <ErrorState
        message={getUserFacingMessage(query.error, 'Unable to load analytics right now.')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const data = query.data

  return (
    <Shell>
      <ReportHeader generatedAt={data.generatedAt} />

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <CumulativeAssetsLine data={data.cumulativeByMonth} />
        <MonthlyAcquisitionHeatmap data={data.acquisitionMatrix} />
        <YearlyAcquisitionBar data={data.acquisitionByYear} />
        <CategoryDistributionBar data={data.categoryDistribution} />
        <InStockByLocationPanel />
        <WarrantyScatter data={data.warrantyPoints} />
        <RollingAssignmentsLine data={data.assignmentsByMonth} />
      </div>
    </Shell>
  )
}
