import AnimatedNavIcon from './AnimatedNavIcon'

interface IdleWarningModalProps {
  onStayLoggedIn: () => void
  onLogoutNow: () => void
}

export default function IdleWarningModal({ onStayLoggedIn, onLogoutNow }: IdleWarningModalProps) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/55 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center px-4 py-6 sm:py-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="idle-warning-title"
          aria-describedby="idle-warning-description"
          className="relative w-full max-w-md rounded-2xl border border-base bg-app p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] sm:p-6"
        >
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-accent">
            <AnimatedNavIcon name="logout" />
          </div>

          <h3 id="idle-warning-title" className="mb-1 text-center text-base font-bold text-primary sm:text-lg">
            Are you still there?
          </h3>
          <p id="idle-warning-description" className="mb-5 text-center text-sm leading-relaxed text-muted">
            You have been inactive for a while. For your security, we will log you out soon.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onStayLoggedIn}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Yes, stay logged in
            </button>
            <button
              type="button"
              onClick={onLogoutNow}
              className="w-full rounded-lg border border-base bg-surface px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-surface-3"
            >
              Logout now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
