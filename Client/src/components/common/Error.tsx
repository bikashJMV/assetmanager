import { DEFAULT_USER_MESSAGE } from '../../utils/errors'

type Props = {
  title?: string
  message?: string
  onRetry?: () => void
  onDismiss?: () => void
  debugDetail?: string
  fullScreen?: boolean
}

export default function Error({
  title = 'Something went wrong',
  message = DEFAULT_USER_MESSAGE,
  onRetry,
  onDismiss,
  debugDetail,
  fullScreen = true,
}: Props) {
  const containerClass = fullScreen
    ? 'min-h-screen bg-app text-primary flex items-center justify-center px-4'
    : 'w-full'
  const hasActions = Boolean(onRetry || onDismiss)

  return (
    <div className={containerClass}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-[0_18px_46px_rgba(127,29,29,0.08)] sm:p-6"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-4">
          <div className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-white text-red-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-red-800">{title}</h2>
            <p className="mt-2 max-w-[60ch] text-[13px] leading-6 text-slate-800 break-words sm:text-sm">
              {message}
            </p>

            {import.meta.env.DEV && debugDetail ? (
              <pre className="mt-4 overflow-auto rounded-xl border border-red-100 bg-white/90 p-3 text-xs leading-5 text-slate-600">
                {debugDetail}
              </pre>
            ) : null}

            {hasActions ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="bg-accent text-on-accent font-semibold px-4 py-2 rounded-lg hover:bg-accent-hover transition text-sm"
                  >
                    Try again
                  </button>
                ) : null}

                {onDismiss ? (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="border border-red-200 bg-white px-4 py-2 rounded-lg text-sm font-medium text-slate-700 transition hover:bg-red-50"
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
