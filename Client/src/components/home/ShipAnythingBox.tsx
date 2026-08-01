import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import StoryCard from './StoryCard'

type FeatureChip = { label: string; icon: IconName; filled?: boolean }

const featureChips: FeatureChip[] = [
  { label: 'authNexus SSO', icon: 'log-in', filled: true },
  { label: 'Asset Listing', icon: 'boxes' },
  { label: 'QR Scan', icon: 'scan', filled: true },
  { label: 'Asset Tracking', icon: 'users' },
  { label: 'Category Breakdown', icon: 'chart-column' },
  { label: 'Realtime Sync', icon: 'refresh-cw', filled: true },
  { label: 'Theme Preferences', icon: 'settings' },
] as const

export default function ShipAnythingBox({ className = '' }: { className?: string }) {
  return (
    <StoryCard
      tone="accent"
      eyebrow="Current Features"
      title="Ship Anything"
      description="From secure Enterprise SSO via authNexus to QR-based lookup, every feature is built to replace spreadsheets with one reliable, sovereign system."
      className={className}
    >
      <>
        <div className="mb-5 flex justify-end gap-2">
          <div className="h-2 w-2 rounded-full border border-white/60" />
          <div className="h-2 w-2 rounded-full border border-white/60" />
          <div className="h-2 w-2 rounded-full border border-white/60" />
        </div>
        <div className="flex flex-wrap gap-2">
          {featureChips.map((chip) => (
            <div
              key={chip.label}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${chip.filled ? 'border-base bg-surface-3' : 'border-white/20 bg-white/10'}`}
            >
              <AnimatedNavIcon name={chip.icon} />
              {chip.label}
            </div>
          ))}
        </div>
      </>
    </StoryCard>
  )
}
