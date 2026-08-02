import type { ReactNode } from 'react'

type SectionShellProps = {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * One heading treatment for every dashboard section, so spacing and type scale
 * stay consistent down the page.
 */
export default function SectionShell({
  title,
  subtitle,
  action,
  children,
  className = '',
}: SectionShellProps) {
  return (
    <section className={`w-full ${className}`}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-primary sm:text-xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
