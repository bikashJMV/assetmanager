import { lazy, Suspense } from 'react'

import { useSessionEmployeeQuery } from '../../../queries/employees'

import ActivityTimeline from './sections/ActivityTimeline'
import DepartmentSummarySection from './sections/DepartmentSummary'
import ExecutiveKpis from './sections/ExecutiveKpis'
import QuickActions from './sections/QuickActions'
import SystemHealth from './sections/SystemHealth'
import { useDashboardOverview } from './useDashboardOverview'

// Recharts is heavy and only this section needs it.
const DashboardCharts = lazy(() => import('./sections/DashboardCharts'))

/**
 * The authenticated dashboard body: everything between the hero and the footer.
 * Guests keep the existing marketing sections instead — see Home.tsx.
 */
export default function DashboardContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  // Reuses the cached session profile the rest of the app already loads.
  const sessionQuery = useSessionEmployeeQuery()
  const role = sessionQuery.data?.role
  const isPrivileged = role === 'admin' || role === 'it_ops'

  const overview = useDashboardOverview(isAuthenticated, isPrivileged)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:space-y-12">
      <ExecutiveKpis overview={overview} />
      <QuickActions isPrivileged={isPrivileged} />
      <DepartmentSummarySection overview={overview} />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface-2" />}>
        <DashboardCharts overview={overview} />
      </Suspense>
      <ActivityTimeline overview={overview} />
      <SystemHealth overview={overview} />
    </div>
  )
}
