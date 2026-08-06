import { useEffect, type ReactNode } from 'react'

type FilterPopupProps = {
  open: boolean
  title: string
  description?: string
  activeCount?: number
  children: ReactNode
  applyLabel?: string
  clearLabel?: string
  cancelLabel?: string
  applyDisabled?: boolean
  clearDisabled?: boolean
  onApply: () => void
  onClear: () => void
  onClose: () => void
}

export default function FilterPopup({
  open,
  title,
  description,
  activeCount = 0,
  children,
  applyLabel = 'Apply Filters',
  clearLabel = 'Clear all',
  cancelLabel = 'Cancel',
  applyDisabled = false,
  clearDisabled = false,
  onApply,
  onClear,
  onClose,
}: FilterPopupProps) {
  useEffect(() => {
    if (!open) return

    const previousBodyOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end bg-black/55 px-0 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[calc(100vh-0.75rem)] w-full flex-col overflow-y-auto rounded-t-[28px] border border-base bg-app shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:max-h-[min(85vh,720px)] sm:max-w-xl sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-base bg-app/95 px-4 pb-4 pt-3 backdrop-blur sm:px-6 sm:pb-5 sm:pt-5">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-base sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-primary sm:text-xl">{title}</h2>
                {activeCount > 0 ? (
                  <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                    {activeCount}
                  </span>
                ) : null}
              </div>
              {description ? (
                <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close filters"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-primary"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        <div className="sticky bottom-0 border-t border-base bg-surface-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-base bg-surface px-4 text-sm font-medium text-primary transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearLabel}
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-base bg-surface px-4 text-sm font-medium text-primary transition hover:bg-surface-3"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onApply}
                disabled={applyDisabled}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
