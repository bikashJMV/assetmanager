import type { ReactNode } from 'react'

type IconName =
  | 'home'
  | 'guide'
  | 'boxes'
  | 'scan'
  | 'users'
  | 'plus'
  | 'list-chevrons-up-down'
  | 'refresh-cw'
  | 'settings'
  | 'logout'
  | 'sun'
  | 'moon'

function BaseIcon({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ai-icon ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export default function AnimatedNavIcon({ name }: { name: IconName }) {
  if (name === 'home') {
    return (
      <BaseIcon>
        <path className="ai-move-up" d="M3 10.5 12 3l9 7.5" />
        <path className="ai-fade-in" d="M5 10v10h14V10" />
        <path className="ai-door" d="M10 20v-6h4v6" />
      </BaseIcon>
    )
  }

  if (name === 'guide') {
    return (
      <BaseIcon>
        <path className="ai-book-left" d="M4 5a3 3 0 0 1 3-3h6v18H7a3 3 0 0 0-3 3Z" />
        <path className="ai-book-right" d="M20 5a3 3 0 0 0-3-3h-6v18h6a3 3 0 0 1 3 3Z" />
      </BaseIcon>
    )
  }

  if (name === 'boxes') {
    return (
      <BaseIcon>
        <path className="ai-box-shell" d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path className="ai-box-lid" d="m3.3 7 8.7 5 8.7-5" />
        <path className="ai-box-center" d="M12 22V12" />
      </BaseIcon>
    )
  }

  if (name === 'scan') {
    return (
      <BaseIcon>
        <path d="M4 8V5h3" />
        <path d="M20 8V5h-3" />
        <path d="M4 16v3h3" />
        <path d="M20 16v3h-3" />
        <path d="M7 12h10" />
      </BaseIcon>
    )
  }

  if (name === 'users') {
    return (
      <BaseIcon>
        <circle className="ai-user-head" cx="8.5" cy="7" r="3.2" />
        <path className="ai-user-body" d="M2.5 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
        <path className="ai-user-plus-v" d="M20 8v6" />
        <path className="ai-user-plus-h" d="M23 11h-6" />
      </BaseIcon>
    )
  }

  if (name === 'list-chevrons-up-down') {
    return (
      <BaseIcon>
        <path className="ai-list-line-1" d="M5 7h10" />
        <path className="ai-list-line-2" d="M5 12h10" />
        <path className="ai-list-line-3" d="M5 17h10" />
        <path className="ai-chevron-up" d="m17 9 2-2 2 2" />
        <path className="ai-chevron-down" d="m17 15 2 2 2-2" />
      </BaseIcon>
    )
  }

  if (name === 'refresh-cw') {
    return (
      <BaseIcon>
        <path className="ai-refresh-arc" d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path className="ai-refresh-arrow" d="M21 3v6h-6" />
      </BaseIcon>
    )
  }

  if (name === 'settings') {
    return (
      <BaseIcon>
        <circle className="ai-gear-core" cx="12" cy="12" r="3.3" />
        <path className="ai-gear-ring" d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.4 1.4 0 0 1-2 2l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.4 1.4 0 1 1-2.8 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.4 1.4 0 0 1-2-2l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H7a1.4 1.4 0 1 1 0-2.8h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.4 1.4 0 1 1 2-2l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5a1.4 1.4 0 1 1 2.8 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1.4 1.4 0 0 1 2 2l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.4 1.4 0 1 1 0 2.8h-.2a1 1 0 0 0-.9.7Z" />
      </BaseIcon>
    )
  }

  if (name === 'logout') {
    return (
      <BaseIcon>
        <path className="ai-logout-door" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path className="ai-logout-arrow" d="M16 17l5-5-5-5" />
        <path className="ai-logout-line" d="M21 12H9" />
      </BaseIcon>
    )
  }

  if (name === 'sun') {
    return (
      <BaseIcon>
        <circle className="ai-sun-core" cx="12" cy="12" r="3.2" />
        <path className="ai-sun-rays" d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
      </BaseIcon>
    )
  }

  if (name === 'moon') {
    return (
      <BaseIcon>
        <path className="ai-moon-body" d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7.1 7.1 0 0 0 9.8 9.8Z" />
      </BaseIcon>
    )
  }

  return (
    <BaseIcon>
      <path className="ai-plus-v" d="M12 5v14" />
      <path className="ai-plus-h" d="M5 12h14" />
    </BaseIcon>
  )
}
