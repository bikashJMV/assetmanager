import type { IconName } from './AnimatedNavIcon'
import { FEATURES } from '../../utils/featureFlags'

export type SidebarNavVisibility = 'always' | 'authenticated' | 'manage'

type SidebarNavCommon = {
  id: string
  label: string
  visibility?: SidebarNavVisibility
  matchPrefix?: boolean
}

export type SidebarNavLink = SidebarNavCommon & {
  type: 'link'
  to: string
  icon: IconName
  tone?: 'default' | 'accent'
}

export type SidebarNavActionKind =
  | 'toggle-theme'
  | 'density-compact'
  | 'density-normal'
  | 'density-large'
  | 'density-spacious'
  | 'font-claude'
  | 'font-clean'
  | 'font-mono'
  | 'font-serif'

export type SidebarNavControlKind = 'font-scale'

export type SidebarNavAction = SidebarNavCommon & {
  type: 'action'
  icon: IconName
  action: SidebarNavActionKind
}

export type SidebarNavControl = SidebarNavCommon & {
  type: 'control'
  icon: IconName
  control: SidebarNavControlKind
}

export type SidebarNavNestedGroup = SidebarNavCommon & {
  type: 'nested-group'
  icon: IconName
  defaultOpen?: boolean
  children: Array<SidebarNavLink | SidebarNavAction | SidebarNavControl>
}

export type SidebarNavGroupChild = SidebarNavLink | SidebarNavAction | SidebarNavControl | SidebarNavNestedGroup

export type SidebarNavGroup = SidebarNavCommon & {
  type: 'group'
  icon: IconName
  defaultOpen?: boolean
  children: SidebarNavGroupChild[]
}

export type SidebarNavEntry = SidebarNavLink | SidebarNavGroup | SidebarNavAction

export type SidebarNavSection = {
  id: string
  title?: string
  items: SidebarNavEntry[]
}

export const sidebarSections: SidebarNavSection[] = [
  {
    id: 'primary',
    title: 'Main',
    items: [
      { id: 'home', type: 'link', label: 'Home', to: '/', icon: 'home', matchPrefix: false },
      { id: 'assets', type: 'link', label: 'Assets', to: '/assets', icon: 'box-3d', matchPrefix: true },
      { id: 'employees', type: 'link', label: 'Employees', to: '/employee', icon: 'users', matchPrefix: true },
    ],
  },
  {
    id: 'workspace',
    title: 'Tools',
    items: [
      { id: 'qr-batches', type: 'link', label: 'QR Batches', to: '/qr-generate/batches', icon: 'qr', visibility: 'manage' },
      { id: 'analysis', type: 'link', label: 'Analysis', to: '/analysis', icon: 'chart-column', visibility: 'manage' },
      // { id: 'notifications', type: 'link', label: 'Notifications', to: '/notifications', icon: 'bell', visibility: 'authenticated' },
      {
        id: 'settings',
        type: 'group',
        label: 'Settings',
        icon: 'settings',
        children: [
          ...(FEATURES.RECYCLE_BIN ? [{ id: 'recycle-bin', type: 'link' as const, label: 'Recycle Bin', to: '/recycle-bin', icon: 'trash' as const, visibility: 'manage' as const }] : []),
          { id: 'guide', type: 'link', label: 'Guide', to: '/guide', icon: 'guide' },
          { id: 'theme-toggle', type: 'action', label: 'Theme: Light/Dark', icon: 'settings', action: 'toggle-theme' },
          {
            id: 'text-layout',
            type: 'nested-group',
            label: 'Text UI',
            icon: 'text-layout',
            children: [
              { id: 'font-scale-slider', type: 'control', label: 'Scale', icon: 'text-layout', control: 'font-scale' },
            ],
          },
          {
            id: 'text-font',
            type: 'nested-group',
            label: 'Font Family',
            icon: 'text-font',
            children: [
              { id: 'font-claude', type: 'action', label: 'Claude', icon: 'text-font', action: 'font-claude' },
              { id: 'font-clean', type: 'action', label: 'Clean', icon: 'text-font', action: 'font-clean' },
              { id: 'font-mono', type: 'action', label: 'Mono', icon: 'text-font', action: 'font-mono' },
              { id: 'font-serif', type: 'action', label: 'Serif', icon: 'text-font', action: 'font-serif' },
            ],
          },
        ],
      },
    ],
  },
]
