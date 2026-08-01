import type { ReactNode } from 'react'
import { AppIcon, type AppIconName } from '../ui'

/** Card shell for a settings section: icon + title + description, then content. */
export function SettingsCard({
  icon,
  title,
  description,
  children,
}: {
  icon: AppIconName
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'hsl(var(--primary) / 0.10)', color: 'hsl(var(--primary))' }}>
          <AppIcon name={icon} size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[length:var(--text-lg)] font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-[length:var(--text-sm)] text-foreground-muted">{description}</p> : null}
        </div>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

/** One labelled row inside a settings card. */
export function SettingsRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[length:var(--text-sm)] font-medium text-foreground">{label}</p>
        {hint ? <p className="text-[length:var(--text-xs)] text-foreground-faint">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
