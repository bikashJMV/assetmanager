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
      ? 'border border-[#1B1B1B] bg-[#0A0A0A] text-white shadow-[0_24px_44px_rgba(10,10,10,0.2)]'
      : tone === 'accent'
        ? 'border border-[#DB480D] bg-[#F04E0F] text-white shadow-[0_24px_44px_rgba(240,78,15,0.22)]'
        : 'border border-[#E8E4DC] bg-white text-[#0A0A0A] shadow-[0_24px_44px_rgba(10,10,10,0.08)]'

  const eyebrowTone =
    tone === 'light'
      ? 'text-[#888]'
      : tone === 'accent'
        ? 'text-white/65'
        : 'text-white/40'

  const bodyTone = tone === 'light' ? 'text-[#666]' : tone === 'accent' ? 'text-white/82' : 'text-white/58'

  return (
    <article className={`rounded-[28px] p-6 sm:p-8 ${cardTone} ${className}`}>
      {children ? <div className="mb-6">{children}</div> : null}
      <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${eyebrowTone}`}>{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-normal leading-tight sm:text-4xl">{title}</h2>
      <p className={`mt-3 text-sm leading-6 ${bodyTone}`}>{description}</p>
    </article>
  )
}
