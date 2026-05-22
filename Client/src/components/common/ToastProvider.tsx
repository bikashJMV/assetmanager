import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastRecord = {
  id: number
  message: string
  title?: string
  variant: ToastVariant
  durationMs?: number
}


import { ToastContext, type ToastInput, type ToastVariant } from '../../hooks/useToast'


const DEFAULT_DURATION_MS = 4200
const PERSISTENT_TOAST_DURATION_MS = 0

function toastTone(variant: ToastVariant) {
  if (variant === 'success') {
    return {
      bar: 'border-l-4 border-l-emerald-500',
      iconWrap: 'bg-emerald-500/10 text-emerald-500',
      title: 'text-primary',
      message: 'text-muted',
      close: 'text-subtle hover:bg-surface-3 hover:text-primary',
      progress: 'bg-emerald-500',
    }
  }
  if (variant === 'error') {
    return {
      bar: 'border-l-4 border-l-red-500',
      iconWrap: 'bg-red-500/10 text-red-500',
      title: 'text-primary',
      message: 'text-muted',
      close: 'text-subtle hover:bg-surface-3 hover:text-primary',
      progress: 'bg-red-500',
    }
  }
  if (variant === 'warning') {
    return {
      bar: 'border-l-4 border-l-amber-500',
      iconWrap: 'bg-amber-500/10 text-amber-500',
      title: 'text-primary',
      message: 'text-muted',
      close: 'text-subtle hover:bg-surface-3 hover:text-primary',
      progress: 'bg-amber-500',
    }
  }
  return {
    bar: 'border-l-4 border-l-sky-500',
    iconWrap: 'bg-sky-500/10 text-sky-500',
    title: 'text-primary',
    message: 'text-muted',
    close: 'text-subtle hover:bg-surface-3 hover:text-primary',
    progress: 'bg-sky-500',
  }
}

function defaultTitleForVariant(variant: ToastVariant): string {
  if (variant === 'success') return 'Success'
  if (variant === 'error') return 'Something went wrong'
  if (variant === 'warning') return 'Warning'
  return 'Notice'
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }
  if (variant === 'error') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9 9 15" />
        <path d="m9 9 6 6" />
      </svg>
    )
  }
  if (variant === 'warning') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextIdRef = useRef(1)
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((input: ToastInput) => {
    const id = nextIdRef.current++
    const variant = input.variant ?? 'success'
    const nextToast: ToastRecord = {
      ...input,
      id,
      variant,
    }

    setToasts((current) => [...current, nextToast])

    const durationMs =
      typeof input.durationMs === 'number'
        ? input.durationMs
        : variant === 'error' || variant === 'warning'
          ? PERSISTENT_TOAST_DURATION_MS
          : DEFAULT_DURATION_MS

    if (durationMs > 0) {
      const timer = setTimeout(() => {
        dismissToast(id)
      }, durationMs)
      timersRef.current.set(id, timer)
    }

    return id
  }, [dismissToast])

  useEffect(() => {
    const currentTimers = timersRef.current
    return () => {
      for (const timer of currentTimers.values()) {
        clearTimeout(timer)
      }
      currentTimers.clear()
    }
  }, [])

  const contextValue = useMemo(
    () => ({ showToast, dismissToast }),
    [dismissToast, showToast],
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[160] flex justify-center px-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:justify-end">
        <div className="flex w-full max-w-[24rem] flex-col gap-3 sm:w-[24rem]">
          {toasts.map((toast) => {
            const tone = toastTone(toast.variant)
            const title = toast.title?.trim() || defaultTitleForVariant(toast.variant)
            const durationMs =
              typeof toast.durationMs === 'number'
                ? toast.durationMs
                : toast.variant === 'error' || toast.variant === 'warning'
                  ? PERSISTENT_TOAST_DURATION_MS
                  : DEFAULT_DURATION_MS
            const hasProgress = durationMs > 0

            return (
              <section
                key={toast.id}
                className={`toast-enter pointer-events-auto relative w-full overflow-hidden rounded-xl border border-[color:var(--border)] bg-surface-2 shadow-lg backdrop-blur-sm ${tone.bar}`}
                role="alert"
                aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
              >
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.iconWrap}`}>
                    <ToastIcon variant={toast.variant} />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className={`text-sm font-semibold leading-snug ${tone.title}`}>{title}</p>
                    <p className={`mt-0.5 text-[13px] leading-5 break-words ${tone.message}`}>{toast.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close notification"
                  onClick={() => dismissToast(toast.id)}
                  className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-lg transition ${tone.close}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
                {hasProgress && (
                  <div className="absolute bottom-0 left-0 h-0.5 w-full">
                    <div
                      className={`toast-progress h-full w-full origin-left ${tone.progress}`}
                      style={{ animationDuration: `${durationMs}ms` }}
                    />
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </ToastContext.Provider>
  )
}


