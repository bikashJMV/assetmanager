type QuickFactCardProps = {
  fact: string
  className?: string
}

export default function QuickFactCard({ fact, className = '' }: QuickFactCardProps) {
  return (
    <aside
      className={`rounded-[2px] border border-[#D9D0C4] border-l-[5px] border-l-[color:var(--accent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(252,249,245,0.98)_100%)] px-5 py-5 text-left shadow-[0_22px_36px_rgba(10,10,10,0.1)] ring-1 ring-white/70 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          Quick Fact
        </span>
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--accent-soft)]" />
      </div>
      <p className="mt-3 text-[14px] font-medium leading-6 text-[#252525] sm:text-[15px] sm:leading-7">{fact}</p>
    </aside>
  )
}
