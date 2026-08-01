import type { WelcomeNotification } from '../../api'
import { AppIcon } from '../ui'

/** One-time welcome panel (employee role only — gating stays in the page). */
export function WarrantyWelcomeBanner({ welcome }: { welcome: WelcomeNotification }) {
  return (
    <div
      className="mb-3 rounded-md border border-line px-4 py-3"
      style={{ backgroundColor: 'hsl(var(--primary) / 0.06)' }}
    >
      <p className="text-[length:var(--text-md)] font-semibold text-foreground">{welcome.title}</p>
      <p className="mt-1.5 whitespace-pre-line text-[length:var(--text-sm)] leading-relaxed text-foreground-muted">
        {welcome.message}
      </p>
    </div>
  )
}

/** Load failure notice — icon + message, optional dev-side debug detail. */
export function WarrantyErrorNotice({ message, debugDetail }: { message: string; debugDetail?: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-line px-4 py-3"
      style={{ backgroundColor: 'hsl(var(--danger) / 0.08)' }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--danger))' }} aria-hidden>
        <AppIcon name="error" size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--text-sm)] font-semibold text-foreground">{message}</p>
        {debugDetail ? (
          <p className="mt-1 text-[length:var(--text-xs)] text-foreground-faint">{debugDetail}</p>
        ) : null}
      </div>
    </div>
  )
}
