import type { ReactNode } from 'react'
import { navIconGlyphs, plusGlyph } from './navIcons'

export type IconName =
  | 'home'
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
  const glyph = navIconGlyphs[name] ?? plusGlyph
  return <BaseIcon className={className}>{glyph}</BaseIcon>
}
