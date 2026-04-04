type QuickFactCardProps = {
  fact: string
  className?: string
}

export default function QuickFactCard({ fact, className = '' }: QuickFactCardProps) {
  return (
    <aside
      className={` pt-2 text-left ${className}`}
    >
      <div className="flex items-end">
        <span className="inline-flex rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          Quick Fact
        </span>
        <span className="h-2 w-2 rounded-full bg-[color:var(--accent-soft)]" />
      </div>
      <p className="mt-3 text-[10px] font-medium text-[#252525] sm:text-[12px] ">{fact}</p>
    </aside>
  )
}
