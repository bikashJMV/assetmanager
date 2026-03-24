export type SidebarNavItem = {
  id: string
  label: string
  to: string
  icon: 'home' | 'boxes' | 'users' | 'plus' | 'scan'
  tone?: 'default' | 'accent'
  matchPrefix?: boolean
}

export type SidebarNavSection = {
  id: string
  title: string
  items: SidebarNavItem[]
}

export const sidebarSections: SidebarNavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { id: 'home', label: 'Home', to: '/', icon: 'home', matchPrefix: false },
    ],
  },
  {
    id: 'assets',
    title: 'Assets',
    items: [
      { id: 'all-assets', label: 'All Assets', to: '/assets', icon: 'boxes', matchPrefix: true },
      { id: 'scan-asset', label: 'Scan Asset', to: '/assets/scan', icon: 'scan', matchPrefix: true },
      { id: 'new-asset', label: '+ New Asset', to: '/assets/new', icon: 'plus', tone: 'accent', matchPrefix: false },
    ],
  },
  {
    id: 'employees',
    title: 'Employees',
    items: [
      { id: 'all-employees', label: 'Employees', to: '/employee', icon: 'users', matchPrefix: true },
      { id: 'new-employee', label: '+ New Employee', to: '/employee/new', icon: 'plus', tone: 'accent', matchPrefix: false },
    ],
  },
]
