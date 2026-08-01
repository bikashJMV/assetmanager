import {
  sidebarSections,
  type SidebarNavActionKind,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavGroupChild,
  type SidebarNavLink,
  type SidebarNavSection,
  type SidebarNavVisibility,
} from '../sidebarNav'

export type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
export type FontMode = 'claude' | 'clean' | 'mono' | 'serif'
export type ThemeMode = 'light' | 'dark'
export type TextScale = number

export function isNavActionActive(action: SidebarNavActionKind, density: DensityMode, font: FontMode) {
  if (action === 'density-compact') return density === 'compact'
  if (action === 'density-normal') return density === 'normal'
  if (action === 'density-large') return density === 'large'
  if (action === 'density-spacious') return density === 'spacious'
  if (action === 'font-claude') return font === 'claude'
  if (action === 'font-clean') return font === 'clean'
  if (action === 'font-mono') return font === 'mono'
  if (action === 'font-serif') return font === 'serif'
  return false
}

function hasVisibilityAccess(
  visibility: SidebarNavVisibility | undefined,
  isAuthenticated: boolean,
  canManage: boolean,
  isItOps: boolean,
) {
  if (visibility === 'authenticated') return isAuthenticated
  if (visibility === 'manage') return canManage
  if (visibility === 'it_ops') return isItOps
  return true
}

function filterGroupChildren(
  children: SidebarNavGroupChild[],
  isAuthenticated: boolean,
  canManage: boolean,
  isItOps: boolean,
): SidebarNavGroupChild[] {
  return children
    .map((child): SidebarNavGroupChild | null => {
      if (!hasVisibilityAccess(child.visibility, isAuthenticated, canManage, isItOps)) return null

      if (child.type === 'nested-group') {
        const nestedChildren = child.children.filter((nestedChild) =>
          hasVisibilityAccess(nestedChild.visibility, isAuthenticated, canManage, isItOps),
        )
        if (!nestedChildren.length) return null
        return { ...child, children: nestedChildren }
      }

      return child
    })
    .filter((child): child is SidebarNavGroupChild => child !== null)
}

/**
 * For non-privileged (employee) users, rewrite the "employees" sidebar link
 * to point to their own profile page instead of the admin directory.
 */
export function applyEmployeeRouteOverride(
  sections: SidebarNavSection[],
  canManage: boolean,
  employeeId: string | null,
): SidebarNavSection[] {
  if (canManage || !employeeId) return sections
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.type === 'link' && item.id === 'employees') {
        return { ...item, to: `/employee/${employeeId}` }
      }
      return item
    }),
  }))
}

export function filterSidebarSections(
  isAuthenticated: boolean,
  canManage: boolean,
  isItOps: boolean,
): SidebarNavSection[] {
  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item): SidebarNavEntry | null => {
          if (item.type === 'group') {
            if (!hasVisibilityAccess(item.visibility, isAuthenticated, canManage, isItOps)) return null
            const children = filterGroupChildren(item.children, isAuthenticated, canManage, isItOps)
            if (!children.length) return null
            return { ...item, children }
          }

          return hasVisibilityAccess(item.visibility, isAuthenticated, canManage, isItOps) ? item : null
        })
        .filter((item): item is SidebarNavEntry => item !== null),
    }))
    .filter((section) => section.items.length > 0)
}

export const isLinkActive = (item: SidebarNavLink, pathname: string, search: URLSearchParams) => {
  if (item.id === 'home' && (pathname === '/' || pathname === '/dashboard')) return true
  if (item.id === 'all-assets' && pathname === '/assets/new') return false
  if (item.id === 'all-assets' && pathname.startsWith('/assets/scan')) return false

  const url = new URL(item.to, 'https://ams.local')
  const routeMatches = item.matchPrefix
    ? pathname === url.pathname || pathname.startsWith(`${url.pathname}/`)
    : pathname === url.pathname

  if (!routeMatches) return false
  if (!url.searchParams.size) return true

  for (const [key, value] of url.searchParams.entries()) {
    if (search.get(key) !== value) return false
  }

  return true
}

export function isEntryActive(entry: SidebarNavEntry, pathname: string, search: URLSearchParams) {
  if (entry.type === 'group') {
    return entry.children.some((child) => {
      if (child.type === 'link') return isLinkActive(child, pathname, search)
      if (child.type === 'nested-group') {
        return child.children.some((nestedChild) => nestedChild.type === 'link' && isLinkActive(nestedChild, pathname, search))
      }
      return false
    })
  }
  if (entry.type === 'link') return isLinkActive(entry, pathname, search)
  return false
}

export function getDefaultOpenGroups(sections: SidebarNavSection[]) {
  return sections.reduce<Record<string, boolean>>((acc, section) => {
    for (const item of section.items) {
      if (item.type === 'group') {
        acc[item.id] = item.defaultOpen ?? false
        for (const child of item.children) {
          if (child.type === 'nested-group') {
            acc[child.id] = child.defaultOpen ?? false
          }
        }
      }
    }
    return acc
  }, {})
}

export function getActiveGroupIds(
  sections: SidebarNavSection[],
  pathname: string,
  search: URLSearchParams,
) {
  return sections.flatMap((section) =>
    section.items
      .filter((item): item is SidebarNavGroup => item.type === 'group')
      .filter((item) =>
        item.children.some((child) => {
          if (child.type === 'link') return isLinkActive(child, pathname, search)
          if (child.type === 'nested-group') {
            return child.children.some((nestedChild) => nestedChild.type === 'link' && isLinkActive(nestedChild, pathname, search))
          }
          return false
        }),
      )
      .flatMap((item) => {
        const ids = [item.id]
        for (const child of item.children) {
          if (child.type === 'nested-group' && child.children.some((nestedChild) => nestedChild.type === 'link' && isLinkActive(nestedChild, pathname, search))) {
            ids.push(child.id)
          }
        }
        return ids
      }),
  )
}

export function areOpenGroupsEqual(left: Record<string, boolean>, right: Record<string, boolean>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}
