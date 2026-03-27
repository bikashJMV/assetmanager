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
        <div className="w-fit rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Asset Intake</div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Assign</div>
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Track</div>
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Return</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">QR Scan</div>
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Lifecycle</div>
          <div className="rounded-full border border-white/20 bg-[#1E1E1E] px-4 py-1 text-xs">Audit</div>
        </div>
        <div className="w-full max-w-md rounded-xl bg-[#F04E0F] px-5 py-2 text-center text-sm font-bold">Full Ownership History</div>
      </div>
    </StoryCard>
  )
}
