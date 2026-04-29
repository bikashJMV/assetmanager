import type { ReactNode } from 'react'

type StoryNoteProps = {
  label: string
  className?: string
  tone?: 'neutral' | 'accent'
  children: ReactNode
}

export default function StoryNote({ label, className = '', tone = 'neutral', children }: StoryNoteProps) {
  const noteTone =
    tone === 'accent'
      ? {
          shell: 'border-accent-soft bg-surface-2',
          chip: 'bg-accent text-white',
          dot: 'bg-accent',
          body: 'text-primary',
          edge: 'border-l-accent',
        }
      : {
          shell: 'border-base bg-surface-3',
          chip: 'bg-surface-2 text-primary',
          dot: 'bg-accent',
          body: 'text-primary',
          edge: 'border-l-primary',
        }

  return (
    <aside
      className={`rounded-[24px] border border-l-[5px] px-4 py-4 text-left shadow-[0_24px_40px_rgba(10,10,10,0.12)] ring-1 ring-white/70 backdrop-blur-sm sm:px-5 sm:py-5 ${noteTone.shell} ${noteTone.edge} ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${noteTone.chip}`}>
          {label}
        </span>
        <span className={`h-2.5 w-2.5 rounded-full ${noteTone.dot}`} />
      </div>
      <div className={`mt-3 text-[13px] font-medium leading-6 sm:text-[15px] sm:leading-7 ${noteTone.body}`}>{children}</div>
    </aside>
  )
}
