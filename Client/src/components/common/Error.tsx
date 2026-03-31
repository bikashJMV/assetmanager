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

  return (
    <div className={containerClass}>
      <div className="w-full max-w-xl rounded-xl border border-base bg-surface-2 p-5">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>

        {import.meta.env.DEV && debugDetail ? (
          <pre className="mt-3 rounded-md border border-base bg-surface p-3 text-xs text-subtle overflow-auto">
            {debugDetail}
          </pre>
        ) : null}

        {(onRetry || onDismiss) ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="bg-accent text-white font-semibold px-4 py-2 rounded-lg hover:bg-accent-hover transition text-sm"
              >
                Try again
              </button>
            ) : null}

            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="border border-base text-muted px-4 py-2 rounded-lg hover:bg-surface-3 transition text-sm"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
