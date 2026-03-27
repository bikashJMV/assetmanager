import StoryCard from './StoryCard'

const roleFootprints = [
  { role: 'Employee', detail: 'My Digital Footprint' },
  { role: 'Admin', detail: 'Efficiency Hub' },
  { role: 'IT Ops', detail: 'Health-First Management' },
] as const

export default function RightAccessBox({ className = '' }: { className?: string }) {
  return (
    <StoryCard
      tone="light"
      eyebrow="Role-Based Access"
      title="Right Access, Right People"
      description="Admins, IT Ops, and Employees each see only what they need. Secure sign-in keeps records protected and identity verified at every step."
      className={className}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#0A0A0A] px-4 py-2 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F04E0F]" />
            Admin
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#F04E0F] px-4 py-2 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
            IT Ops
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-[#E0DDD6] bg-[#F0ECE5] px-4 py-2 text-xs font-semibold text-[#0A0A0A]">
            <span className="h-1.5 w-1.5 rounded-full bg-black/40" />
            Employee
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {roleFootprints.map((item) => (
            <div key={item.role} className="rounded-xl border border-[#E8E4DC] bg-[#FAFAF8] px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#888]">{item.role}</p>
              <p className="mt-2 text-sm leading-6 text-[#333]">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </StoryCard>
  )
}
