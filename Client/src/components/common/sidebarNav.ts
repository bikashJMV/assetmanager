import type { IconName } from './AnimatedNavIcon'

export type SidebarNavVisibility = 'always' | 'authenticated' | 'manage' | 'it_ops'

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
      // Appearance/font/density preferences moved to the dedicated /settings page.
      { id: 'settings', type: 'link', label: 'Settings', to: '/settings', icon: 'settings', visibility: 'authenticated', matchPrefix: true },
    ],
  },
  {
    id: 'it-ops',
    title: 'IT Ops',
    items: [
      {
        id: 'logs',
        type: 'link',
        label: 'Logs',
        to: '/logs',
        icon: 'bell',
        visibility: 'it_ops',
        matchPrefix: true,
      },
    ],
  },
]
