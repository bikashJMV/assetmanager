import type { ReactNode } from 'react'

export type StoryTone = 'light' | 'dark' | 'accent'

type StoryCardProps = {
  tone: StoryTone
  eyebrow: string
  title: string
  description: string
  className?: string
  children?: ReactNode
}

export default function StoryCard({ tone, eyebrow, title, description, className = '', children }: StoryCardProps) {
  const cardTone =
    tone === 'dark'
      ? 'border border-base bg-surface-3 text-primary shadow-xl'
      : tone === 'accent'
        ? 'border border-accent-soft bg-accent text-on-accent shadow-accent'
        : 'border border-base bg-surface-2 text-primary shadow-lg'

  const eyebrowTone =
    tone === 'light'
      ? 'text-muted'
      : tone === 'accent'
        ? 'text-white/65'
        : 'text-muted'

  const bodyTone = tone === 'light' ? 'text-subtle' : tone === 'accent' ? 'text-white/82' : 'text-subtle'

  return (
    <article className={`rounded-[28px] p-6 sm:p-8 ${cardTone} ${className}`}>
      {children ? <div className="mb-6">{children}</div> : null}
      <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${eyebrowTone}`}>{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-normal leading-tight sm:text-4xl">{title}</h2>
      <p className={`mt-3 text-sm leading-6 ${bodyTone}`}>{description}</p>
    </article>
  )
}
