import { LOADING } from '../../constants/loading'
import { Skeleton } from './Skeleton'

type Variant = 'page' | 'inline' | 'button' | 'overlay' | 'skeleton'

/**
 * Single loading primitive for the whole app.
 *
 * Accessibility contract: the announcement always comes from a live region that
 * carries the label. Decorative parts (spinner, skeleton bars) are `aria-hidden`
 * and never also carry an `aria-label` — a hidden node's label is never announced.
 *
 * - `page`    full-screen block (route/auth boundaries)
 * - `inline`  centered block inside an existing layout
 * - `button`  small spinner for inside a button; the button owns `aria-busy`
 * - `overlay` blocking scrim for long exports/imports
 * - `skeleton` row placeholders that mirror list/table geometry
 */
export interface AppLoaderProps {
  variant?: Variant
  /** announced + displayed message; defaults to "Loading…" */
  label?: string
  /** skeleton only */
  rows?: number
  className?: string
}

function Spinner({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-brand border-t-transparent"
      style={{ width: size, height: size }}
    />
  )
}

const LIVE_REGION = { role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const

export function AppLoader({ variant = 'inline', label = LOADING.DEFAULT, rows = 5, className = '' }: AppLoaderProps) {
  if (variant === 'button') {
    return (
      <>
        <Spinner size={14} />
        <span className="sr-only">{label}</span>
      </>
    )
  }

  if (variant === 'skeleton') {
    return (
      <div {...LIVE_REGION} className={className}>
        <span className="sr-only">{label}</span>
        <div aria-hidden className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-10 rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  const body = (
    <div className="flex flex-col items-center gap-3">
      <Spinner />
      <p className="text-[length:var(--text-sm)] text-foreground-muted">{label}</p>
    </div>
  )

  if (variant === 'overlay') {
    return (
      <div
        {...LIVE_REGION}
        className={`fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm ${className}`}
      >
        <div className="rounded-lg border border-line bg-surface px-6 py-5 shadow-lg">{body}</div>
      </div>
    )
  }

  if (variant === 'page') {
    return (
      <main {...LIVE_REGION} className={`flex min-h-screen items-center justify-center bg-background ${className}`}>
        {body}
      </main>
    )
  }

  return (
    <div
      {...LIVE_REGION}
      className={`flex w-full min-h-[min(28rem,calc(100dvh-12rem))] items-center justify-center py-12 ${className}`}
    >
      {body}
    </div>
  )
}

export default AppLoader
