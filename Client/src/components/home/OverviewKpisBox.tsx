import type { PublicDashboardSummary } from '../../api'
import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import StoryCard from './StoryCard'

type OverviewKpisBoxProps = {
  isAuthenticated: boolean
  publicSummary: PublicDashboardSummary | null
  className?: string
}

type OverviewMetric = {
  label: string
  icon: IconName
  accent?: boolean
  status: string
}

export default function OverviewKpisBox({ isAuthenticated, publicSummary, className = '' }: OverviewKpisBoxProps) {
  const overviewMetrics: OverviewMetric[] = [
    { label: 'Assets', icon: 'boxes', accent: true, status: isAuthenticated ? 'Protected live snapshot' : 'Protected preview' },
    { label: 'Assigned Assets', icon: 'refresh-cw', status: 'Lifecycle monitored' },
    { label: 'In Stock Assets', icon: 'home', status: 'Stock health tracked' },
    { label: 'Active Employees', icon: 'users', status: isAuthenticated ? 'Workspace synced' : 'Visible after sign-in' },
  ]

  return (
    <StoryCard
      tone="light"
      eyebrow="Overview KPIs"
      title="Know What Exists"
      description="Live dashboard summaries turn scattered inventory into one view of assets, stock, and active employees."
      className={className}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {overviewMetrics.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border p-4 text-center ${item.accent ? 'border-[#0A0A0A] bg-[#0A0A0A]' : 'border-[#F0ECE5] bg-[#FAFAF8]'}`}
            >
              <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center ${item.accent ? 'text-white' : 'text-[#222]'}`}>
                <AnimatedNavIcon name={item.icon} />
              </div>
              <div className="flex justify-center">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                    item.accent ? 'bg-white/14 text-white' : 'bg-[#ECE7DE] text-[#333]'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className={`mt-1 text-xs font-semibold ${item.accent ? 'text-white/70' : 'text-[#777]'}`}>{item.label}</p>
            </div>
          ))}
        </div>

        {!isAuthenticated && publicSummary?.categoryBreakdown?.length ? (
          <div className="rounded-2xl border border-[#E8E4DC] bg-[#FAFAF8] px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#888]">Top Categories</p>
              <span className="text-[11px] font-semibold text-[#666]">Protected mix</span>
            </div>
            <div className="space-y-2">
              {publicSummary.categoryBreakdown.slice(0, 3).map((item) => (
                <div key={item.category}>
                  <div className="mb-1 flex items-center justify-between text-xs text-[#666]">
                    <span>{item.category}</span>
                    <span className="rounded-full bg-[#EEE7DD] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6F685F]">
                      tracked
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#EEE7DD]">
                    <div
                      className="h-2 rounded-full bg-[#F04E0F]"
                      style={{
                        width: `${38 + ((item.category.length * 7) % 37)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs leading-6 text-[#666]">
          {isAuthenticated
            ? 'Realtime dashboard signals refresh as assignments and inventory records change.'
            : 'Sign in to unlock protected operational insights, deeper category analysis, and asset detail views.'}
        </p>
      </div>
    </StoryCard>
  )
}
