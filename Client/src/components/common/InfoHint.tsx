import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type InfoHintProps = {
  /** Heading inside the panel */
  panelTitle: string
  /** Accessible name for the icon trigger */
  ariaLabel: string
  children: ReactNode
  className?: string
}

/**
 * Compact “info” control that toggles a small panel (click outside or Escape to close).
 * Reusable on any page that needs contextual help without leaving the view.
 */
export default function InfoHint({ panelTitle, ariaLabel, children, className }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const autoId = useId()
  const panelId = `${autoId}-panel`

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const closePanel = useCallback(() => setOpen(false), [])

  return (
    <div ref={rootRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        title="Page help"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={[
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 shadow-sm transition [-webkit-tap-highlight-color:transparent]',
          // Kill browser default blue focus outline (still shows after mouse click).
          'outline-none focus:outline-none',
          // Keyboard / assistive tech: orange ring only when :focus-visible.
          'focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
          open
            ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]/35 text-primary ring-2 ring-[color:var(--accent)]/35'
            : 'border-base bg-surface text-primary ring-0 hover:border-[color:var(--accent-soft)] hover:bg-surface-3',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 min-h-5 min-w-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={panelTitle}
          className="absolute right-0 top-full z-[100] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-base bg-app p-4 pt-3 pr-11 shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={closePanel}
            className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted outline-none transition hover:bg-surface-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          >
            <span className="sr-only">Close</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-primary pr-1">{panelTitle}</h2>
          <div className="mt-3 space-y-4 text-xs leading-relaxed text-muted sm:text-sm">{children}</div>
        </div>
      ) : null}
    </div>
  )
}
