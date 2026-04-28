import type { ReactNode } from 'react'

export type IconName =
  | 'home'
  | 'guide'
  | 'boxes'
  | 'box-3d'
  | 'scan'
  | 'qr'
  | 'edit'
  | 'users'
  | 'plus'
  | 'chart-column'
  | 'bell'
  | 'trash'
  | 'log-in'
  | 'type'
  | 'text-layout'
  | 'text-font'
  | 'list-chevrons-up-down'
  | 'refresh-cw'
  | 'download'
  | 'upload'
  | 'settings'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'user-circle'
  | 'chevron-up'
  | 'alert-triangle'

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

export default function AnimatedNavIcon({ name, className = '' }: { name: IconName; className?: string }) {
  if (name === 'home') {
    return (
      <BaseIcon className={className}>
        <path className="ai-move-up" d="M3 10.5 12 3l9 7.5" />
        <path className="ai-fade-in" d="M5 10v10h14V10" />
        <path className="ai-door" d="M10 20v-6h4v6" />
      </BaseIcon>
    )
  }

  if (name === 'guide') {
    return (
      <BaseIcon className={className}>
        <path className="ai-book-left" d="M4 5a3 3 0 0 1 3-3h6v18H7a3 3 0 0 0-3 3Z" />
        <path className="ai-book-right" d="M20 5a3 3 0 0 0-3-3h-6v18h6a3 3 0 0 1 3 3Z" />
      </BaseIcon>
    )
  }

  if (name === 'boxes') {
    return (
      <BaseIcon className={className}>
        <path className="ai-box-shell" d="M7 8.5V8a5 5 0 0 1 10 0v.5" />
        <rect className="ai-box-lid" x="4" y="8.5" width="16" height="11.5" rx="3" />
        <path className="ai-box-center" d="M10 13h4" />
        <path className="ai-box-center" d="M12 11v4" />
      </BaseIcon>
    )
  }

  if (name === 'box-3d') {
    return (
      <BaseIcon className={className}>
        <path className="ai-box-shell" d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
        <path className="ai-box-lid" d="m4 8 8 4.5L20 8" />
        <path className="ai-box-center" d="M12 21V12.5" />
      </BaseIcon>
    )
  }

  if (name === 'scan') {
    return (
      <BaseIcon className={className}>
        <path className="ai-scan-tl" d="M4 8V5h3" />
        <path className="ai-scan-tr" d="M20 8V5h-3" />
        <path className="ai-scan-bl" d="M4 16v3h3" />
        <path className="ai-scan-br" d="M20 16v3h-3" />
        <path className="ai-scan-line" d="M7 12h10" />
      </BaseIcon>
    )
  }

  if (name === 'qr') {
    return (
      <BaseIcon className={className}>
        <rect x="3.5" y="3.5" width="6" height="6" rx="1.2" />
        <rect x="14.5" y="3.5" width="6" height="6" rx="1.2" />
        <rect x="3.5" y="14.5" width="6" height="6" rx="1.2" />
        <path d="M14.5 14.5h2.5v2.5H14.5z" />
        <path d="M18.5 14.5h2v2" />
        <path d="M17 17h3.5" />
        <path d="M12.5 11h2.5" />
        <path d="M11 12.5h2.5" />
        <path d="M14 12.5h1.5" />
      </BaseIcon>
    )
  }

  if (name === 'users') {
    return (
      <BaseIcon className={className}>
        <circle className="ai-user-head" cx="9" cy="8" r="4" />
        <path className="ai-user-body" d="M3.5 20v-1.2a5.5 5.5 0 0 1 5.5-5.5h0a5.5 5.5 0 0 1 5.5 5.5V20" />
        <path className="ai-fade-in" d="M7.6 9.1h.01" />
        <path className="ai-fade-in" d="M10.4 9.1h.01" />
        <path className="ai-move-up" d="M7.4 11.4a2.2 2.2 0 0 0 3.2 0" />
      </BaseIcon>
    )
  }

  if (name === 'chart-column') {
    return (
      <BaseIcon className={className}>
        <path className="ai-chart-axis" d="M4 4v16h16" />
        <path className="ai-chart-bar-1" d="M8 18v-5" />
        <path className="ai-chart-bar-2" d="M12 18V9" />
        <path className="ai-chart-bar-3" d="M16 18V6" />
      </BaseIcon>
    )
  }

  if (name === 'bell') {
    return (
      <BaseIcon className={className}>
        <path className="ai-bell-body" d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9" />
        <path className="ai-bell-clapper" d="M10 19a2 2 0 0 0 4 0" />
      </BaseIcon>
    )
  }

  if (name === 'trash') {
    return (
      <BaseIcon className={className}>
        <path className="ai-trash-lid" d="M4 7h16" />
        <path className="ai-trash-handle" d="M10 4h4" />
        <path className="ai-trash-body" d="m6 7 1 13h10l1-13" />
        <path className="ai-trash-line-1" d="M10 11v5" />
        <path className="ai-trash-line-2" d="M14 11v5" />
      </BaseIcon>
    )
  }

  if (name === 'edit') {
    return (
      <BaseIcon className={className}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
      </BaseIcon>
    )
  }

  if (name === 'log-in') {
    return (
      <BaseIcon className={className}>
        <path className="ai-login-door" d="M10 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path className="ai-login-line" d="M9 12h12" />
        <path className="ai-login-arrow" d="m16 7 5 5-5 5" />
      </BaseIcon>
    )
  }

  if (name === 'type') {
    return (
      <BaseIcon className={className}>
        <path className="ai-type-top" d="M5 6h14" />
        <path className="ai-type-stem" d="M12 6v12" />
        <path className="ai-type-base" d="M9 18h6" />
      </BaseIcon>
    )
  }

  if (name === 'text-layout') {
    return (
      <BaseIcon className={className}>
        <path className="ai-layout-row-1" d="M5 7h14" />
        <path className="ai-layout-row-2" d="M5 12h10" />
        <path className="ai-layout-row-3" d="M5 17h6" />
      </BaseIcon>
    )
  }

  if (name === 'text-font') {
    return (
      <BaseIcon className={className}>
        <path className="ai-font-top" d="M6 19 12 5l6 14" />
        <path className="ai-font-mid" d="M8.5 13h7" />
      </BaseIcon>
    )
  }

  if (name === 'list-chevrons-up-down') {
    return (
      <BaseIcon className={className}>
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
      <BaseIcon className={className}>
        <path className="ai-refresh-arc" d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path className="ai-refresh-arrow" d="M21 3v6h-6" />
      </BaseIcon>
    )
  }

  if (name === 'download') {
    return (
      <BaseIcon className={className}>
        <path className="ai-download-arrow" d="M12 4.5v9.5" />
        <path className="ai-download-arrow" d="m8.2 12.3 3.8 3.8 3.8-3.8" />
        <path className="ai-download-tray" d="M5 20.5h14" />
      </BaseIcon>
    )
  }

  if (name === 'upload') {
    return (
      <BaseIcon className={className}>
        <path d="M12 19.5V10" />
        <path d="m8.2 11.7 3.8-3.8 3.8 3.8" />
        <path d="M5 4.5h14" />
      </BaseIcon>
    )
  }

  if (name === 'settings') {
    return (
      <BaseIcon className={className}>
        <circle className="ai-gear-core" cx="12" cy="12" r="3.3" />
        <path className="ai-gear-ring" d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.4 1.4 0 0 1-2 2l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.4 1.4 0 1 1-2.8 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.4 1.4 0 0 1-2-2l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H7a1.4 1.4 0 1 1 0-2.8h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.4 1.4 0 1 1 2-2l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5a1.4 1.4 0 1 1 2.8 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1.4 1.4 0 0 1 2 2l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.4 1.4 0 1 1 0 2.8h-.2a1 1 0 0 0-.9.7Z" />
      </BaseIcon>
    )
  }

  if (name === 'logout') {
    return (
      <BaseIcon className={className}>
        <path className="ai-logout-door" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path className="ai-logout-arrow" d="M16 17l5-5-5-5" />
        <path className="ai-logout-line" d="M21 12H9" />
      </BaseIcon>
    )
  }

  if (name === 'sun') {
    return (
      <BaseIcon className={className}>
        <circle className="ai-sun-core" cx="12" cy="12" r="3.2" />
        <path className="ai-sun-rays" d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
      </BaseIcon>
    )
  }

  if (name === 'moon') {
    return (
      <BaseIcon className={className}>
        <path className="ai-moon-body" d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7.1 7.1 0 0 0 9.8 9.8Z" />
      </BaseIcon>
    )
  }

  if (name === 'user-circle') {
    return (
      <BaseIcon className={className}>
        <circle className="ai-user-ring" cx="12" cy="12" r="9" />
        <circle className="ai-user-head" cx="12" cy="9" r="2.6" />
        <path className="ai-user-shoulders" d="M6.5 18a5.5 5.5 0 0 1 11 0" />
      </BaseIcon>
    )
  }

  if (name === 'alert-triangle') {
    return (
      <BaseIcon className={className}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </BaseIcon>
    )
  }

  if (name === 'chevron-up') {
    return (
      <BaseIcon className={className}>
        <path d="m6 14 6-6 6 6" />
      </BaseIcon>
    )
  }

  return (
    <BaseIcon className={className}>
      <path className="ai-plus-v" d="M12 5v14" />
      <path className="ai-plus-h" d="M5 12h14" />
    </BaseIcon>
  )
}
