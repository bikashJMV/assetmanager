import { AppIcon, Button } from '../ui'

/**
 * Inactivity warning (Notes/UI.md modal spec). Slides bottom→center. Offers Stay (keep the
 * session) or Logout, and shows the remaining seconds before automatic logout.
 */
export function IdleWarningModal({
  open,
  secondsLeft,
  onStay,
  onLogout,
}: {
  open: boolean
  secondsLeft: number
  onStay: () => void
  onLogout: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="ams-idle-in relative w-full max-w-sm rounded-lg border border-line bg-surface p-6 text-center shadow-lg">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'hsl(var(--warning) / 0.14)', color: 'hsl(var(--warning))' }}>
          <AppIcon name="warning" size={24} />
        </span>
        <h2 id="idle-title" className="text-[length:var(--text-lg)] font-semibold text-foreground">You are not active</h2>
        <p className="mt-1 text-[length:var(--text-sm)] text-foreground-muted">
          Still there? For your security you will be signed out automatically.
        </p>
        <p className="mt-3 text-[length:var(--text-sm)] font-medium text-foreground">
          Auto logout in <span className="tabular-nums font-bold" style={{ color: 'hsl(var(--danger))' }}>{secondsLeft}s</span>
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" icon="signOut" onClick={onLogout}>Log out</Button>
          <Button variant="primary" onClick={onStay}>Stay signed in</Button>
        </div>
      </div>
    </div>
  )
}
