import { DEFAULT_USER_MESSAGE } from '../../utils/errors'

type Props = {
  title?: string
  message?: string
  onRetry?: () => void
  onDismiss?: () => void
  debugDetail?: string
  fullScreen?: boolean
}

/**
 * Error banner (G2, Notes/color-theme-consistency-plan.md). Retokenized from hardcoded
 * red-50/red-200/slate colors (dark-mode unsafe — near-invisible on a dark background) to
 * the --danger token: surface bg + tinted left border + tinted icon chip, same visual
 * language as ToastProvider's error toast.
 */
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
        className="w-full max-w-2xl rounded-lg border p-5 shadow-md sm:p-6"
        style={{ backgroundColor: 'hsl(var(--surface-t))', borderColor: 'hsl(var(--border-t))', borderLeft: '3px solid hsl(var(--danger))' }}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-4">
          <div
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'hsl(var(--danger) / 0.12)', color: 'hsl(var(--danger))' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--danger))' }}>{title}</h2>
            <p className="mt-2 max-w-[60ch] text-[13px] leading-6 text-muted break-words sm:text-sm">
              {message}
            </p>

            {import.meta.env.DEV && debugDetail ? (
              <pre
                className="mt-4 overflow-auto rounded-lg border p-3 text-xs leading-5 text-muted"
                style={{ backgroundColor: 'hsl(var(--surface-sunken))', borderColor: 'hsl(var(--border-t))' }}
              >
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
                    className="border px-4 py-2 rounded-lg text-sm font-medium text-primary transition hover:bg-surface-3"
                    style={{ borderColor: 'hsl(var(--border-t))', backgroundColor: 'hsl(var(--surface-t))' }}
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
