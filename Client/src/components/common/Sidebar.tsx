import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AnimatedNavIcon from './AnimatedNavIcon'
import {
  sidebarSections,
  type SidebarNavAction,
  type SidebarNavActionKind,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavLink,
  type SidebarNavSection,
  type SidebarNavVisibility,
} from './sidebarNav'
import { getSessionEmployee, hasActiveAdminAccess } from '../../api'
import { logDevError } from '../../utils/errors'
import {
  applyDocumentPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTheme,
} from '../../utils/theme'

type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
type FontMode = 'claude' | 'clean' | 'mono' | 'serif'
type ThemeMode = 'light' | 'dark'

function isNavActionActive(action: SidebarNavActionKind, density: DensityMode, font: FontMode) {
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
) {
  if (visibility === 'authenticated') return isAuthenticated
  if (visibility === 'manage') return canManage
  return true
}

function filterSidebarSections(
  isAuthenticated: boolean,
  canManage: boolean,
): SidebarNavSection[] {
  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item): SidebarNavEntry | null => {
          if (item.type === 'group') {
            if (!hasVisibilityAccess(item.visibility, isAuthenticated, canManage)) return null
            const children = item.children.filter((child) =>
              hasVisibilityAccess(child.visibility, isAuthenticated, canManage),
            )
            if (!children.length) return null
            return { ...item, children }
          }

          return hasVisibilityAccess(item.visibility, isAuthenticated, canManage) ? item : null
        })
        .filter((item): item is SidebarNavEntry => item !== null),
    }))
    .filter((section) => section.items.length > 0)
}

const isLinkActive = (item: SidebarNavLink, pathname: string, search: URLSearchParams) => {
  if (item.id === 'home' && (pathname === '/' || pathname === '/dashboard/home')) return true
  if (item.id === 'all-assets' && pathname === '/assets/new') return false
  if (item.id === 'all-assets' && pathname.startsWith('/assets/scan')) return false
  if (item.id === 'all-employees' && pathname === '/employee/new') return false

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

function isEntryActive(entry: SidebarNavEntry, pathname: string, search: URLSearchParams) {
  if (entry.type === 'group') {
    return entry.children.some((child) => child.type === 'link' && isLinkActive(child, pathname, search))
  }
  if (entry.type === 'link') return isLinkActive(entry, pathname, search)
  return false
}

function getDefaultOpenGroups(sections: SidebarNavSection[]) {
  return sections.reduce<Record<string, boolean>>((acc, section) => {
    for (const item of section.items) {
      if (item.type === 'group') {
        acc[item.id] = item.defaultOpen ?? false
      }
    }
    return acc
  }, {})
}

function getActiveGroupIds(
  sections: SidebarNavSection[],
  pathname: string,
  search: URLSearchParams,
) {
  return sections.flatMap((section) =>
    section.items
      .filter((item): item is SidebarNavGroup => item.type === 'group')
      .filter((item) =>
        item.children.some((child) => child.type === 'link' && isLinkActive(child, pathname, search)),
      )
      .map((item) => item.id),
  )
}

function areOpenGroupsEqual(left: Record<string, boolean>, right: Record<string, boolean>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

function MainNavLink({
  item,
  pathname,
  search,
  compact = false,
  onNavigate,
}: {
  item: SidebarNavLink
  pathname: string
  search: URLSearchParams
  compact?: boolean
  onNavigate?: () => void
}) {
  const active = isLinkActive(item, pathname, search)
  const accentTone = item.tone === 'accent'

  if (compact) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl border transition ${active
          ? 'nav-item-active border-accent-soft bg-accent text-white shadow-accent'
          : accentTone
            ? 'border-accent-soft bg-[color:var(--accent-soft)] text-accent hover:bg-accent hover:text-white'
            : 'border-base bg-surface text-muted hover:bg-surface-3 hover:text-primary'
          }`}
      >
        <AnimatedNavIcon name={item.icon} />
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group nav-item relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${active ? 'nav-item-active bg-surface-3 text-primary' : ''
        }${active
          ? ''
          : accentTone
            ? ' text-accent hover:bg-[color:var(--accent-soft)]'
            : ' text-muted hover:bg-surface-3 hover:text-primary'
        }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'
          }`}
      />
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${active
          ? 'border-accent-soft bg-[color:var(--accent-soft)] text-accent'
          : 'border-base bg-surface-2'
          }`}
      >
        <AnimatedNavIcon name={item.icon} />
      </span>
      <span className={`flex-1 text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
        {item.label}
      </span>
    </Link>
  )
}

function MainNavAction({
  item,
  compact = false,
  theme,
  density,
  font,
  onAction,
}: {
  item: SidebarNavAction
  compact?: boolean
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  onAction: (action: SidebarNavActionKind) => void
}) {
  const isThemeAction = item.action === 'toggle-theme'
  const actionLabel =
    isThemeAction ? (theme === 'dark' ? 'Switch to Light' : 'Switch to Dark') : item.label
  const actionIcon = isThemeAction ? (theme === 'dark' ? 'sun' : 'moon') : item.icon
  const active = isNavActionActive(item.action, density, font)

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onAction(item.action)}
        title={actionLabel}
        aria-label={actionLabel}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl border transition ${active
          ? 'nav-item-active border-accent-soft bg-accent text-white shadow-accent'
          : 'border-base bg-surface text-muted hover:bg-surface-3 hover:text-primary'
          }`}
      >
        <AnimatedNavIcon name={actionIcon} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onAction(item.action)}
      className={`group nav-item relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'nav-item-active bg-surface-3 text-primary' : 'text-muted hover:bg-surface-3 hover:text-primary'
        }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'
          }`}
      />
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${active
          ? 'border-accent-soft bg-[color:var(--accent-soft)] text-accent'
          : 'border-base bg-surface-2'
          }`}
      >
        <AnimatedNavIcon name={actionIcon} />
      </span>
      <span className={`flex-1 text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{actionLabel}</span>
    </button>
  )
}

function SubNavLink({
  item,
  pathname,
  search,
  onNavigate,
}: {
  item: SidebarNavLink
  pathname: string
  search: URLSearchParams
  onNavigate?: () => void
}) {
  const active = isLinkActive(item, pathname, search)
  const accentTone = item.tone === 'accent'

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group nav-item flex items-center gap-3 rounded-lg py-1.5 pl-12 pr-2.5 text-sm transition ${active ? 'nav-item-active bg-surface-3 text-primary' : ''
        }${active
          ? ''
          : accentTone
            ? ' text-accent hover:bg-[color:var(--accent-soft)]'
            : ' text-muted hover:bg-surface-3 hover:text-primary'
        }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-sm ${active
          ? 'bg-accent'
          : accentTone
            ? 'bg-[color:var(--accent-soft)]'
            : 'bg-[color:var(--border)]'
          }`}
      />
      <span className={`truncate ${active ? 'font-semibold' : 'font-medium'}`}>
        {item.label}
      </span>
    </Link>
  )
}

function SubNavAction({
  item,
  theme,
  density,
  font,
  onAction,
}: {
  item: SidebarNavAction
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  onAction: (action: SidebarNavActionKind) => void
}) {
  const isThemeAction = item.action === 'toggle-theme'
  const actionLabel =
    isThemeAction ? (theme === 'dark' ? 'Switch to Light' : 'Switch to Dark') : item.label
  const actionIcon = isThemeAction ? (theme === 'dark' ? 'sun' : 'moon') : item.icon
  const active = isNavActionActive(item.action, density, font)

  return (
    <button
      type="button"
      onClick={() => onAction(item.action)}
      className={`group nav-item flex w-full items-center gap-3 rounded-lg py-1.5 pl-12 pr-2.5 text-sm transition ${active ? 'nav-item-active bg-surface-3 text-primary' : 'text-muted hover:bg-surface-3 hover:text-primary'
        }`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? 'text-accent' : 'text-subtle'}`}>
        <AnimatedNavIcon name={actionIcon} />
      </span>
      <span className={`truncate ${active ? 'font-semibold' : 'font-medium'}`}>{actionLabel}</span>
    </button>
  )
}

function GroupNavItem({
  item,
  pathname,
  search,
  compact = false,
  open,
  theme,
  density,
  font,
  onToggle,
  onExpandFromCompact,
  onAction,
  onNavigate,
}: {
  item: SidebarNavGroup
  pathname: string
  search: URLSearchParams
  compact?: boolean
  open: boolean
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  onToggle: (id: string) => void
  onExpandFromCompact: (id: string) => void
  onAction: (action: SidebarNavActionKind) => void
  onNavigate?: () => void
}) {
  const active = isEntryActive(item, pathname, search)
  const emphasizeGroup = compact && active

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onExpandFromCompact(item.id)}
        title={item.label}
        aria-label={`Expand ${item.label}`}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl border transition ${active || open
          ? 'nav-item-active border-accent-soft bg-surface-3 text-accent'
          : 'border-base bg-surface text-muted hover:bg-surface-3 hover:text-primary'
          }`}
      >
        <AnimatedNavIcon name={item.icon} />
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`group nav-item relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${emphasizeGroup ? 'nav-item-active bg-surface-2 text-primary' : open ? 'bg-surface-2 text-primary' : 'text-muted hover:bg-surface-3 hover:text-primary'
          }`}
      >
        <span
          className={`absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r-full ${emphasizeGroup ? 'bg-accent' : 'bg-transparent'
            }`}
        />
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${emphasizeGroup
            ? 'border-accent-soft bg-[color:var(--accent-soft)] text-accent'
            : 'border-base bg-surface-2'
            }`}
        >
          <AnimatedNavIcon name={item.icon} />
        </span>
        <span className="flex-1 text-sm font-semibold">{item.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? `rotate-180 ${emphasizeGroup ? 'text-accent' : 'text-subtle'}` : 'text-subtle'}`}
          aria-hidden="true"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="space-y-0.5">
          {item.children.map((child) => (
            child.type === 'link' ? (
              <SubNavLink
                key={child.id}
                item={child}
                pathname={pathname}
                search={search}
                onNavigate={onNavigate}
              />
            ) : (
              <SubNavAction key={child.id} item={child} theme={theme} density={density} font={font} onAction={onAction} />
            )
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SidebarNavigation({
  sections,
  pathname,
  search,
  compact = false,
  openGroups,
  theme,
  density,
  font,
  onToggleGroup,
  onExpandGroup,
  onAction,
  onNavigate,
}: {
  sections: SidebarNavSection[]
  pathname: string
  search: URLSearchParams
  compact?: boolean
  openGroups: Record<string, boolean>
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  onToggleGroup: (id: string) => void
  onExpandGroup: (id: string) => void
  onAction: (action: SidebarNavActionKind) => void
  onNavigate?: () => void
}) {
  return (
    <div className={`${compact ? 'space-y-4' : 'space-y-5'}`}>
      {sections.map((section, index) => (
        <section key={section.id} className={`${compact ? 'flex flex-col items-center gap-2' : 'space-y-1.5'}`}>
          {!compact && section.title ? (
            <p className="px-3 text-[11px] uppercase tracking-[0.18em] text-subtle">
              {section.title}
            </p>
          ) : null}

          <div className={`${compact ? 'flex flex-col items-center gap-2' : 'space-y-1'}`}>
            {section.items.map((item) =>
              item.type === 'group' ? (
                <GroupNavItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  search={search}
                  compact={compact}
                  open={Boolean(openGroups[item.id])}
                  theme={theme}
                  density={density}
                  font={font}
                  onToggle={onToggleGroup}
                  onExpandFromCompact={onExpandGroup}
                  onAction={onAction}
                  onNavigate={onNavigate}
                />
              ) : item.type === 'link' ? (
                <MainNavLink
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  search={search}
                  compact={compact}
                  onNavigate={onNavigate}
                />
              ) : (
                <MainNavAction
                  key={item.id}
                  item={item}
                  compact={compact}
                  theme={theme}
                  density={density}
                  font={font}
                  onAction={onAction}
                />
              ),
            )}
          </div>

          {compact && index < sections.length - 1 ? (
            <div className="h-px w-6 bg-[color:var(--border)]" aria-hidden="true" />
          ) : null}
        </section>
      ))}
    </div>
  )
}

export default function Sidebar({
  isAuthenticated,
  collapsed,
  onSetCollapsed,
  topOffset = 0,
}: {
  isAuthenticated: boolean
  collapsed: boolean
  onSetCollapsed: (value: boolean) => void
  topOffset?: number
}) {
  const { pathname, search } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [density, setDensity] = useState<DensityMode>(getInitialDensity)
  const [font, setFont] = useState<FontMode>(getInitialFont)
  const [isAdmin, setIsAdmin] = useState(false)
  const query = useMemo(() => new URLSearchParams(search), [search])

  const canManage = isAuthenticated && isAdmin
  const visibleSections = useMemo(
    () => filterSidebarSections(isAuthenticated, canManage),
    [isAuthenticated, canManage],
  )
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    getDefaultOpenGroups(sidebarSections),
  )

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, search])

  useEffect(() => {
    const defaults = getDefaultOpenGroups(visibleSections)
    const activeGroupIds = getActiveGroupIds(visibleSections, pathname, query)

    setOpenGroups((current) => {
      const next = { ...defaults, ...current }
      for (const groupId of activeGroupIds) {
        next[groupId] = true
      }
      return areOpenGroupsEqual(current, next) ? current : next
    })
  }, [visibleSections, pathname, query])

  useEffect(() => {
    applyDocumentPreferences(theme, density, font)
    localStorage.setItem('ams-theme', theme)
    localStorage.setItem('ams-density', density)
    localStorage.setItem('ams-font', font)
  }, [theme, density, font])

  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false)
      return
    }

    let mounted = true

    void (async () => {
      try {
        const [allowed, profile] = await Promise.all([
          hasActiveAdminAccess(),
          getSessionEmployee(),
        ])
        const profileAdmin = Boolean(profile?.is_active && profile?.role !== 'employee')
        if (!mounted) return
        setIsAdmin(allowed || profileAdmin)
      } catch (err) {
        logDevError('sidebar.session_profile', err)
        if (!mounted) return
        setIsAdmin(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  const closeMobileNav = () => {
    setMobileOpen(false)
  }

  const toggleTheme = () => {
    setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
  }

  const toggleGroup = (id: string) => {
    setOpenGroups((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

  const expandGroupFromCompact = (id: string) => {
    onSetCollapsed(false)
    setOpenGroups((current) => ({
      ...current,
      [id]: true,
    }))
  }

  const handleNavAction = (action: SidebarNavActionKind) => {
    if (action === 'toggle-theme') {
      toggleTheme()
      return
    }
    if (action === 'density-compact') return setDensity('compact')
    if (action === 'density-normal') return setDensity('normal')
    if (action === 'density-large') return setDensity('large')
    if (action === 'density-spacious') return setDensity('spacious')
    if (action === 'font-claude') return setFont('claude')
    if (action === 'font-clean') return setFont('clean')
    if (action === 'font-mono') return setFont('mono')
    if (action === 'font-serif') return setFont('serif')
  }

  const handleMobileNavigate = () => {
    closeMobileNav()
  }

  return (
    <>
      <button
        className="sm:hidden fixed top-3 left-4 z-30 text-white font-semibold h-10 w-10 rounded-xl hover:bg-accent-hover transition flex items-center justify-center p-2"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        title="Open navigation"
      >
        <AnimatedNavIcon name="list-chevrons-up-down" />
      </button>

      <aside
        className={`hidden sm:block shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${collapsed ? 'w-[60px]' : 'w-[230px]'
          }`}
      >
        <div
          className="sticky flex h-screen flex-col overflow-x-visible overflow-y-hidden border-r border-base bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
          style={{ top: topOffset }}
        >


          <div
            className={`flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-3 py-4'} transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}
          >
            <SidebarNavigation
              sections={visibleSections}
              pathname={pathname}
              search={query}
              compact={collapsed}
              openGroups={openGroups}
              theme={theme}
              density={density}
              font={font}
              onToggleGroup={toggleGroup}
              onExpandGroup={expandGroupFromCompact}
              onAction={handleNavAction}
              onNavigate={undefined}
            />
          </div>

        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeMobileNav}
            aria-label="Close navigation overlay"
          />
          <div className="relative flex h-full w-[20rem] max-w-[88vw] flex-col border-r border-base bg-app shadow-2xl shadow-black/40">
            <div className="border-b border-base bg-[linear-gradient(160deg,var(--accent-soft)_0%,transparent_72%)] px-4 py-4 flex items-center justify-between gap-3">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface text-muted hover:text-primary hover:bg-surface-3 transition"
                onClick={closeMobileNav}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                type="button"
              >
                <AnimatedNavIcon name="list-chevrons-up-down" />
              </button>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface text-muted hover:text-primary hover:bg-surface-3 transition"
                onClick={closeMobileNav}
                aria-label="Close"
                title="Close"
                type="button"
              >
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNavigation
                sections={visibleSections}
                pathname={pathname}
                search={query}
                openGroups={openGroups}
                theme={theme}
                density={density}
                font={font}
                onToggleGroup={toggleGroup}
                onExpandGroup={expandGroupFromCompact}
                onAction={handleNavAction}
                onNavigate={handleMobileNavigate}
              />
            </div>

          </div>
        </div>
      ) : null}
    </>
  )
}
