import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'

export function MenuItemIcon({ icon, spinning = false }: { icon: IconName; spinning?: boolean }) {
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center group-hover:text-accent ${spinning ? 'refresh-spin' : ''}`}>
      <AnimatedNavIcon name={icon} className="h-4 w-4" />
    </span>
  )
}

export function MoreActionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="5.5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18.5" r="1.75" />
    </svg>
  )
}

export function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}
