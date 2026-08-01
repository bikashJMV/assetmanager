/**
 * Skeleton primitive (Notes/UI.md §7). Shimmer via transform on a gradient overlay
 * (GPU-only). Mirror the real layout — use SkeletonText/SkeletonRow, never a lone
 * centered spinner on a full page.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`ams-skeleton block rounded-sm ${className}`} style={style} aria-hidden />
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    /* decorative only — an aria-hidden node's aria-label is never announced, so the
       announcement belongs to the caller's live region (see AppLoader). */
    <div className="flex flex-col divide-y divide-line" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ maxWidth: c === 0 ? '30%' : undefined }} />
          ))}
        </div>
      ))}
    </div>
  )
}
