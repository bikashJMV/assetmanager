import StoryCard from './StoryCard'

const operationalAlerts = [
  'Warranties expiring in 30 days',
  'Inactive employees still holding assets',
  'Assets without QR code assigned',
  'Missing asset ownership details',
  'Low available stock by category',
] as const

export default function ActBeforeItBreaksBox({ className = '' }: { className?: string }) {
  return (
    <StoryCard
      tone="dark"
      eyebrow="Operational Alerts"
      title="Act Before It Breaks"
      description="Catch warranty expiry, missing ownership, overdue returns, and low stock before they become operational problems."
      className={className}
    >
      <div className="space-y-2">
        {operationalAlerts.map((msg, idx) => (
          <div key={msg} className="flex items-center gap-3 rounded-lg border border-base bg-surface-2 px-3 py-2.5">
            <span className={`h-2 w-2 rounded-full ${idx < 3 ? 'bg-accent' : 'bg-muted'}`} />
            <span className="text-xs text-muted">{msg}</span>
          </div>
        ))}
      </div>
    </StoryCard>
  )
}
