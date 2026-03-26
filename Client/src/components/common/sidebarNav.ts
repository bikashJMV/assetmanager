import type { IconName } from './AnimatedNavIcon'

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

export type SidebarNavAction = SidebarNavCommon & {
  type: 'action'
  icon: IconName
  action: SidebarNavActionKind
}

export type SidebarNavGroupChild = SidebarNavLink | SidebarNavAction

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
      { id: 'notifications', type: 'link', label: 'Notifications', to: '/notifications', icon: 'bell', visibility: 'authenticated' },
      {
        id: 'assets',
        type: 'group',
        label: 'Assets',
        icon: 'boxes',
        defaultOpen: true,
        children: [
          { id: 'all-assets', type: 'link', label: 'All Assets', to: '/assets', icon: 'boxes', matchPrefix: true },
          { id: 'scan-asset', type: 'link', label: 'Scan QR', to: '/assets/scan', icon: 'scan', matchPrefix: true },
          { id: 'new-asset', type: 'link', label: 'New Asset', to: '/assets/new', icon: 'plus', tone: 'accent', visibility: 'manage' },
        ],
      },
      {
        id: 'employees',
        type: 'group',
        label: 'Employees',
        icon: 'users',
        defaultOpen: true,
        children: [
          { id: 'all-employees', type: 'link', label: 'Employees', to: '/employee', icon: 'users', matchPrefix: true },
          { id: 'new-employee', type: 'link', label: 'New Employee', to: '/employee/new', icon: 'plus', tone: 'accent', visibility: 'manage' },
        ],
      },
    ],
  },
  {
    id: 'workspace',
    title: 'Tools',
    items: [
      { id: 'guide', type: 'link', label: 'Guide', to: '/guide', icon: 'guide' },
      { id: 'analysis', type: 'link', label: 'Analysis', to: '/analysis', icon: 'chart-column', visibility: 'authenticated' },
      { id: 'recycle-bin', type: 'link', label: 'Recycle Bin', to: '/recycle-bin', icon: 'trash', visibility: 'manage' },
      { id: 'theme-toggle', type: 'action', label: 'Theme: Light/Dark', icon: 'settings', action: 'toggle-theme' },
      {
        id: 'text-layout',
        type: 'group',
        label: 'Text Layout',
        icon: 'text-layout',
        children: [
          { id: 'density-tight', type: 'action', label: 'Tight', icon: 'text-layout', action: 'density-compact' },
          { id: 'density-usual', type: 'action', label: 'Usual', icon: 'text-layout', action: 'density-normal' },
          { id: 'density-big', type: 'action', label: 'Big', icon: 'text-layout', action: 'density-large' },
          { id: 'density-airy', type: 'action', label: 'Airy', icon: 'text-layout', action: 'density-spacious' },
        ],
      },
      {
        id: 'text-font',
        type: 'group',
        label: 'Text Font',
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
]
