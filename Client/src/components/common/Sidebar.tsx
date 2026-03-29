import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
import {
  getSessionEmployee,
  hasActiveAdminAccess,
  signInWithGoogle,
  signOut,
  type SessionEmployee,
} from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
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
function sidebarFirstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? trimmed
}

function sidebarRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'it_ops') return 'IT Ops'
  if (normalized === 'admin') return 'Admin'
  return 'Employee'
}

function sidebarInitial(name: string): string {
  const firstName = sidebarFirstName(name)
  return (firstName[0] ?? name[0] ?? '?').toUpperCase()
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
          ? 'nav-item-active border-accent-soft bg-accent text-on-accent shadow-accent'
          : accentTone
            ? 'border-accent-soft bg-[color:var(--accent-soft)] text-accent hover:bg-accent hover:text-on-accent'
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
          ? 'nav-item-active border-accent-soft bg-accent text-on-accent shadow-accent'
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

function SidebarFooter({
  isAuthenticated,
  signInLoading,
  sessionProfile,
  compact = false,
  onAuthAction,
  notice,
}: {
  isAuthenticated: boolean
  signInLoading: boolean
  sessionProfile: SessionEmployee | null
  compact?: boolean
  onAuthAction: () => void
  notice: string
}) {
  const authLabel = isAuthenticated ? 'Sign out' : signInLoading ? 'Redirecting...' : 'Sign in'
  const authIcon = isAuthenticated ? 'logout' : 'log-in'

  return (
    <div
      className={`${compact ? 'px-2 py-3' : 'px-3 py-3.5'} border-t border-base bg-[linear-gradient(0deg,var(--accent-soft)_-30%,transparent_70%)]`}
    >
      {sessionProfile ? (
        compact ? (
          <div className="mb-3 flex justify-center">
            <div
              title={`${sidebarFirstName(sessionProfile.name)}\n${sidebarRoleLabel(sessionProfile.role)}`}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-soft bg-[color:var(--accent-soft)] text-sm font-black text-accent"
            >
              {sidebarInitial(sessionProfile.name)}
            </div>
          </div>
        ) : (
          <div className="mb-2 rounded-2xl border border-base bg-surface-2 p-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-[color:var(--accent-soft)] text-sm font-black text-accent">
                {sidebarInitial(sessionProfile.name)}
              </div>
              <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                <p className="truncate min-w-fit text-sm font-semibold text-primary">
                  {(sidebarFirstName(sessionProfile.name) || sessionProfile.name) + '|' + sidebarRoleLabel(sessionProfile.role).toUpperCase()}
                </p>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-base bg-surface text-subtle"
                  title={isAuthenticated ? 'Signed in' : 'Signed out'}
                  aria-label={isAuthenticated ? 'Signed in' : 'Signed out'}
                >
                  <AnimatedNavIcon name={isAuthenticated ? 'logout' : 'log-in'} />
                </span>
              </div>
            </div>
          </div>
        )
      ) : null}

      <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
        <button
          onClick={onAuthAction}
          disabled={!isAuthenticated && signInLoading}
          className={`group nav-item rounded-xl border border-base bg-surface-2 font-semibold transition hover:bg-surface-3 disabled:opacity-60 ${compact ? 'mx-auto flex h-10 w-10 items-center justify-center' : 'w-full px-3 py-2.5 text-sm'
            } flex items-center justify-center gap-2`}
          type="button"
          aria-label={authLabel}
          title={compact ? authLabel : undefined}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-base shrink-0">
            <AnimatedNavIcon name={authIcon} />
          </span>
          {!compact ? <span>{authLabel}</span> : null}
        </button>

        {notice ? <p className="text-[11px] text-subtle">{notice}</p> : null}
      </div>
    </div>
  )
}

export default function Sidebar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState('')
  const [signInLoading, setSignInLoading] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [density, setDensity] = useState<DensityMode>(getInitialDensity)
  const [font, setFont] = useState<FontMode>(getInitialFont)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sessionProfile, setSessionProfile] = useState<SessionEmployee | null>(null)
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
    setSettingsNotice('')
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
      setSessionProfile(null)
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
        setSessionProfile(profile ?? null)
      } catch (err) {
        logDevError('sidebar.session_profile', err)
        if (!mounted) return
        setIsAdmin(false)
        setSessionProfile(null)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isAuthenticated])

  const handleLogout = async () => {
    try {
      await signOut()
      setSessionProfile(null)
      setIsAdmin(false)
      setSettingsNotice('')
      setTheme(getInitialTheme())
      setDensity(getInitialDensity())
      setFont(getInitialFont())
      navigate('/')
    } catch (err) {
      logDevError('sidebar.logout', err)
      setSettingsNotice(getUserFacingMessage(err, 'Sign out failed. Please try again.'))
    }
  }

  const handleSignIn = async () => {
    setSettingsNotice('')
    setSignInLoading(true)

    try {
      const next = `${pathname}${search}${hash}`
      await signInWithGoogle(next)
    } catch (err) {
      logDevError('sidebar.signin', err)
      setSettingsNotice(getUserFacingMessage(err, 'Google sign-in failed. Please try again.'))
      setSignInLoading(false)
    }
  }

  const handleAuthAction = () => {
    if (isAuthenticated) {
      void handleLogout()
      return
    }
    void handleSignIn()
  }

  const closeMobileNav = () => {
    setMobileOpen(false)
  }

  const toggleCollapsed = () => {
    setCollapsed((value) => !value)
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
    setCollapsed(false)
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
        className="sm:hidden fixed top-4 left-4 z-30 bg-accent text-on-accent font-semibold px-4 py-2 rounded-xl shadow-accent hover:bg-accent-hover transition"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        Menu
      </button>

      <aside
        className={`hidden sm:block shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${collapsed ? 'w-[60px]' : 'w-[230px]'
          }`}
      >
        <div className="sticky top-0 flex h-screen flex-col overflow-x-visible overflow-y-hidden border-r border-base bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div
            className={`${collapsed ? 'px-2 py-3' : 'px-4 py-4'} border-b border-base bg-[linear-gradient(160deg,var(--accent-soft)_0%,transparent_72%)] transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}
          >
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">

                <button
                  onClick={toggleCollapsed}
                  className="group nav-item flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface-2 text-muted hover:text-primary hover:bg-surface-3 transition"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  type="button"
                >
                  <AnimatedNavIcon name="list-chevrons-up-down" />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Workspace</p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-primary truncate">
                    Asset Manager
                  </p>
                </div>

                <button
                  onClick={toggleCollapsed}
                  className="group nav-item flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-base bg-surface-2 text-muted hover:text-primary hover:bg-surface-3 transition"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  type="button"
                >
                  <AnimatedNavIcon name="list-chevrons-up-down" />
                </button>
              </div>
            )}
          </div>

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

          <SidebarFooter
            isAuthenticated={isAuthenticated}
            signInLoading={signInLoading}
            sessionProfile={sessionProfile}
            compact={collapsed}
            onAuthAction={handleAuthAction}
            notice={settingsNotice}
          />
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
            <div className="border-b border-base bg-[linear-gradient(160deg,var(--accent-soft)_0%,transparent_72%)] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Workspace</p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-primary truncate">
                    Asset Manager
                  </p>
                </div>

                <button
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface text-muted hover:text-primary hover:bg-surface-3 transition"
                  onClick={closeMobileNav}
                  aria-label="Close navigation"
                  type="button"
                >
                  x
                </button>
              </div>
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

            <SidebarFooter
              isAuthenticated={isAuthenticated}
              signInLoading={signInLoading}
              sessionProfile={sessionProfile}
              onAuthAction={handleAuthAction}
              notice={settingsNotice}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
