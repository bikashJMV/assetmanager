import type { ReactNode } from 'react'
import AnimatedNavIcon, { type IconName } from './AnimatedNavIcon'

type PageHeaderAction = {
  id: string
  label: string
  icon: IconName
  onClick: () => void
  disabled?: boolean
}

type PageHeaderActionsProps = {
  title: string
  actions: PageHeaderAction[]
  auxiliary?: ReactNode
}

export default function PageHeaderActions({ title, actions, auxiliary }: PageHeaderActionsProps) {
  return (
    <section className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">{title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {auxiliary ? <div className="shrink-0">{auxiliary}</div> : null}
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-base bg-surface px-4 text-sm font-semibold text-primary shadow-sm transition hover:border-[color:var(--accent-soft)] hover:bg-[color:var(--accent-soft)]/20 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-base disabled:hover:bg-surface disabled:hover:text-primary"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <AnimatedNavIcon name={action.icon} />
            </span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
