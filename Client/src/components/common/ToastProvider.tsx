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

function toastTone(variant: ToastVariant) {
  if (variant === 'success') {
    return {
      card: 'border-emerald-200 bg-white',
      iconWrap: 'bg-emerald-50 text-emerald-600',
      title: 'text-emerald-700',
      message: 'text-slate-700',
      close: 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700',
    }
  }
  if (variant === 'error') {
    return {
      card: 'border-red-200 bg-white',
      iconWrap: 'bg-red-50 text-red-600',
      title: 'text-red-700',
      message: 'text-slate-700',
      close: 'text-slate-400 hover:bg-red-50 hover:text-red-700',
    }
  }
  if (variant === 'warning') {
    return {
      card: 'border-amber-200 bg-white',
      iconWrap: 'bg-amber-50 text-amber-600',
      title: 'text-amber-700',
      message: 'text-slate-700',
      close: 'text-slate-400 hover:bg-amber-50 hover:text-amber-700',
    }
  }
  return {
    card: 'border-sky-200 bg-white',
    iconWrap: 'bg-sky-50 text-sky-600',
    title: 'text-sky-700',
    message: 'text-slate-700',
    close: 'text-slate-400 hover:bg-sky-50 hover:text-sky-700',
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
          ? 6500
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
        <div className="flex w-full max-w-[22rem] flex-col gap-3 sm:w-[22rem]">
          {toasts.map((toast) => {
            const tone = toastTone(toast.variant)
            const title = toast.title?.trim() || defaultTitleForVariant(toast.variant)

            return (
              <section
                key={toast.id}
                className={`pointer-events-auto relative w-full rounded-2xl border px-4 py-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)] ${tone.card}`}
                role="status"
                aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}>
                    <ToastIcon variant={toast.variant} />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <p className={`text-sm font-semibold ${tone.title}`}>{title}</p>
                    <p className={`mt-1 text-sm leading-6 ${tone.message}`}>{toast.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close notification"
                  onClick={() => dismissToast(toast.id)}
                  className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${tone.close}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </section>
            )
          })}
        </div>
      </div>
    </ToastContext.Provider>
  )
}


