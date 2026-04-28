import StoryCard from './StoryCard'

export default function AssignReturnBox({ className = '' }: { className?: string }) {
  return (
    <StoryCard
      tone="dark"
      eyebrow="Controlled Lifecycle"
      title="Assign and Return"
      description="Controlled assign and return flows keep handoffs auditable, traceable, and visible without manual checking."
      className={className}
    >
      <div className="space-y-2">
        <div className="w-fit rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Asset Intake</div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Assign</div>
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Track</div>
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Return</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">QR Scan</div>
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Lifecycle</div>
          <div className="rounded-full border border-base bg-surface-3 px-4 py-1 text-xs text-primary">Audit</div>
        </div>
        <div className="w-full max-w-md rounded-xl bg-accent px-5 py-2 text-center text-sm font-bold text-white shadow-accent">
          Full Ownership History
        </div>
      </div>
    </StoryCard>
  )
}
