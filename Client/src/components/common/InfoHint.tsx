import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type InfoHintVariant = 'auto' | 'modal' | 'anchored'

type AnchoredPanelPosition = {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  width: number
}

export type InfoHintProps = {
  /** Heading inside the panel */
  panelTitle: string
  /** Accessible name for the icon trigger */
  ariaLabel: string
  children: ReactNode
  className?: string
  /**
   * - `anchored`: popover attached to the icon (desktop-friendly)
   * - `modal`: centered overlay dialog (mobile-friendly)
   * - `auto`: anchored on >= sm, modal on smaller screens
   */
  variant?: InfoHintVariant
}

/**
 * Compact “info” control that toggles a small panel (click outside or Escape to close).
 * Reusable on any page that needs contextual help without leaving the view.
 */
export default function InfoHint({
  panelTitle,
  ariaLabel,
  children,
  className,
  variant = 'auto',
}: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = useState<AnchoredPanelPosition | null>(null)
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  const autoId = useId()
  const panelId = `${autoId}-panel`

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)') // tailwind sm breakpoint
    const update = () => setIsSmallScreen(mq.matches)
    update()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [])

  const resolvedVariant: InfoHintVariant = variant === 'auto' ? (isSmallScreen ? 'modal' : 'anchored') : variant

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    if (resolvedVariant === 'modal') {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      if (resolvedVariant === 'modal') {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [open, resolvedVariant])

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const closePanel = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open || resolvedVariant !== 'anchored') {
      setPanelPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gutter = 12
      const gap = 10

      const width = Math.min(520, viewportWidth - gutter * 2)
      const idealLeft = rect.right - width
      const left = Math.min(
        Math.max(gutter, idealLeft),
        Math.max(gutter, viewportWidth - gutter - width),
      )

      const spaceBelow = viewportHeight - gutter - rect.bottom - gap
      const spaceAbove = rect.top - gutter - gap
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow

      if (openUpward) {
        setPanelPosition({
          left,
          width,
          maxHeight: Math.min(520, Math.max(140, spaceAbove)),
          bottom: viewportHeight - rect.top + gap,
        })
      } else {
        const top = rect.bottom + gap
        setPanelPosition({
          left,
          width,
          maxHeight: Math.min(520, Math.max(140, viewportHeight - gutter - top)),
          top,
        })
      }
    }

    updatePosition()
    const sync = () => updatePosition()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [open, resolvedVariant])

  return (
    <div ref={rootRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
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
      {open && typeof document !== 'undefined'
        ? resolvedVariant === 'modal'
          ? createPortal(
              <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/45 p-4 sm:p-6">
                <div className="mx-auto flex min-h-full items-center justify-center">
                  <div
                    ref={panelRef}
                    id={panelId}
                    role="dialog"
                    aria-modal="true"
                    aria-label={panelTitle}
                    className="relative flex w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-base bg-app shadow-[0_20px_80px_rgba(0,0,0,0.32)]"
                  >
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-base px-4 py-3 sm:px-5">
                      <h2 className="pr-2 text-sm font-semibold text-primary sm:text-base">{panelTitle}</h2>
                      <button
                        type="button"
                        aria-label="Close"
                        onClick={closePanel}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition hover:bg-surface-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
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
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                      <div className="space-y-4 text-xs leading-relaxed text-muted sm:text-sm">{children}</div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : panelPosition
            ? createPortal(
                <div
                  ref={panelRef}
                  id={panelId}
                  role="dialog"
                  aria-modal="false"
                  aria-label={panelTitle}
                  className="fixed z-[210] flex flex-col overflow-hidden rounded-2xl border border-base bg-app shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
                  style={{
                    left: panelPosition.left,
                    width: panelPosition.width,
                    maxHeight: panelPosition.maxHeight,
                    top: panelPosition.top,
                    bottom: panelPosition.bottom,
                  }}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-base px-4 py-3">
                    <h2 className="pr-2 text-sm font-semibold text-primary">{panelTitle}</h2>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closePanel}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition hover:bg-surface-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
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
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-4 text-xs leading-relaxed text-muted sm:text-sm">{children}</div>
                  </div>
                </div>,
                document.body,
              )
            : null
        : null}
    </div>
  )
}
