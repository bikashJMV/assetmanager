import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AnimatedNavIcon from './AnimatedNavIcon'
import { sidebarSections, type SidebarNavItem } from './sidebarNav'
import { getSessionEmployee, hasActiveAdminAccess, signOut } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { applyDocumentPreferences, getInitialDensity, getInitialFont, getInitialTheme } from '../../utils/theme'

const isItemActive = (item: SidebarNavItem, pathname: string, search: URLSearchParams) => {
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

function SidebarLink({
  item,
  pathname,
  search,
  compact = false,
  onNavigate,
}: {
  item: SidebarNavItem
  pathname: string
  search: URLSearchParams
  compact?: boolean
  onNavigate?: () => void
}) {
  const active = isItemActive(item, pathname, search)
  const accentTone = item.tone === 'accent'

  if (compact) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        className={`group nav-item nav-item-compact h-9 w-9 rounded-lg flex items-center justify-center transition ${active
          ? 'bg-accent text-on-accent shadow-accent'
          : accentTone
            ? 'bg-[color:var(--accent-soft)] text-accent hover:bg-accent hover:text-on-accent'
            : 'text-muted hover:bg-surface-3 hover:text-primary'
          }`}
      >
        <span
          className={`h-5 w-5 rounded-md border flex items-center justify-center ${active ? 'border-[color:var(--on-accent)]' : 'border-base'
            }`}
        >
          <AnimatedNavIcon name={item.icon} />
        </span>
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`group nav-item relative flex items-center gap-3 rounded-xl px-2.5 py-1.5 transition ${active
        ? 'bg-surface-3 text-primary'
        : accentTone
          ? 'text-accent hover:bg-[color:var(--accent-soft)]'
          : 'text-muted hover:bg-surface-3 hover:text-primary'
        }`}
    >
      <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <span
        className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${active ? 'border-accent-soft text-accent' : 'border-base'
          }`}
      >
        <AnimatedNavIcon name={item.icon} />
      </span>
      <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
    </Link>
  )
}

function SidebarSections({
  pathname,
  query,
  canManage,
  compact,
  onNavigate,
}: {
  pathname: string
  query: URLSearchParams
  canManage: boolean
  compact?: boolean
  onNavigate?: () => void
}) {
  const filteredSections = sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canManage || (item.id !== 'new-asset' && item.id !== 'new-employee')),
    }))
    .filter((section) => section.items.length > 0)

  if (compact) {
    return (
      <div className="space-y-1 flex flex-col items-center">
        {filteredSections.flatMap((section) => section.items).map((item) => (
          <SidebarLink
            key={item.id}
            item={item}
            pathname={pathname}
            search={query}
            compact
            onNavigate={onNavigate}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {filteredSections.map((section) => (
        <section key={section.id}>
          <p className="px-2 pb-0.5 text-[11px] uppercase tracking-[0.18em] text-subtle">{section.title}</p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <SidebarLink
                key={item.id}
                item={item}
                pathname={pathname}
                search={query}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SettingsPanel({
  theme,
  density,
  font,
  onThemeToggle,
  onDensityChange,
  onFontChange,
  onGuide,
  onLogout,
  notice,
  className = '',
}: {
  theme: 'light' | 'dark'
  density: 'compact' | 'normal' | 'large' | 'spacious'
  font: 'claude' | 'clean' | 'mono' | 'serif'
  onThemeToggle: () => void
  onDensityChange: (density: 'compact' | 'normal' | 'large' | 'spacious') => void
  onFontChange: (font: 'claude' | 'clean' | 'mono' | 'serif') => void
  onGuide: () => void
  onLogout: () => void
  notice: string
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-base bg-app p-2.5 space-y-2.5 max-h-[72vh] overflow-y-auto ${className}`}>
      <button
        onClick={onGuide}
        className="group nav-item w-full rounded-lg border border-base bg-surface px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-surface-3 transition inline-flex items-center gap-2"
        type="button"
      >
        <span className="h-5 w-5 rounded-md border border-base flex items-center justify-center shrink-0">
          <AnimatedNavIcon name="guide" />
        </span>
        <span>Guide</span>
      </button>
      <button
        onClick={onLogout}
        className="group nav-item w-full rounded-lg border border-base bg-surface px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-surface-3 transition inline-flex items-center gap-2"
        type="button"
      >
        <span className="h-5 w-5 rounded-md border border-base flex items-center justify-center shrink-0">
          <AnimatedNavIcon name="logout" />
        </span>
        <span>Logout</span>
      </button>

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-subtle mb-1.5">Theme</p>
        <button
          onClick={onThemeToggle}
          className="group nav-item w-full rounded-lg border border-base bg-surface px-2.5 py-2 text-sm font-semibold text-primary hover:bg-surface-3 transition inline-flex items-center gap-2"
          type="button"
        >
          <span className="h-5 w-5 rounded-md border border-base flex items-center justify-center shrink-0">
            <AnimatedNavIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          </span>
          <span>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>
        </button>
      </div>

      <div>
        <p className="w-full truncate text-[10px] uppercase tracking-[0.16em] text-subtle mb-1">
          Text layout
        </p>

        <div className="grid grid-cols-4 gap-1">
          {(['compact', 'normal', 'large', 'spacious'] as const).map((option) => (
            <button
              key={option}
              onClick={() => onDensityChange(option)}
              className={`rounded-lg border px-2 py-1 text-[8px] font-semibold text-ellipsis whitespace-nowrap uppercase tracking-[0.08em] transition ${density === option
                ? 'border-accent-soft bg-accent text-on-accent'
                : 'border-base bg-surface text-muted hover:text-primary hover:bg-surface-3'
                }`}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-subtle mb-1.5">Text font</p>
        <div className="grid grid-cols-4 gap-1">
          {([
            { key: 'claude', label: 'Claude' },
            { key: 'clean', label: 'Clean' },
            { key: 'mono', label: 'Mono' },
            { key: 'serif', label: 'Serif' },
          ] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => onFontChange(option.key)}
              className={`rounded-lg border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] transition ${font === option.key
                ? 'border-accent-soft bg-accent text-on-accent'
                : 'border-base bg-surface text-muted hover:text-primary hover:bg-surface-3'
                }`}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {notice && <p className="text-[11px] text-subtle">{notice}</p>}
    </div>
  )
}

export default function Sidebar() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [density, setDensity] = useState<'compact' | 'normal' | 'large' | 'spacious'>(getInitialDensity)
  const [font, setFont] = useState<'claude' | 'clean' | 'mono' | 'serif'>(getInitialFont)
  const [isAdmin, setIsAdmin] = useState(false)
  const query = useMemo(() => new URLSearchParams(search), [search])
  const settingsHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMobileOpen(false)
    setSettingsOpen(false)
    setSettingsNotice('')
  }, [pathname, search])

  useEffect(() => {
    if (!settingsOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const host = settingsHostRef.current
      const target = event.target as Node | null
      if (!host || !target) return
      if (host.contains(target)) return
      setSettingsOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [settingsOpen])

  useEffect(() => {
    applyDocumentPreferences(theme, density, font)
    localStorage.setItem('ams-theme', theme)
    localStorage.setItem('ams-density', density)
    localStorage.setItem('ams-font', font)
  }, [theme, density, font])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [allowed, profile] = await Promise.all([
          hasActiveAdminAccess(),
          getSessionEmployee(),
        ])
        const profileAdmin = Boolean(profile?.is_active && profile?.role === 'admin')
        if (!mounted) return
        setIsAdmin(allowed || profileAdmin)
      } catch (err) {
        logDevError('sidebar.role', err)
        if (!mounted) return
        setIsAdmin(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const handleLogout = async () => {
    try {
      await signOut()
      const nextTheme = getInitialTheme()
      const nextDensity = getInitialDensity()
      const nextFont = getInitialFont()
      setTheme(nextTheme)
      setDensity(nextDensity)
      setFont(nextFont)
      setSettingsNotice('')
      setSettingsOpen(false)
      navigate('/')
    } catch (err) {
      logDevError('sidebar.logout', err)
      setSettingsNotice(getUserFacingMessage(err, 'Logout failed. Please try again.'))
    }
  }

  const handleGuide = () => {
    setSettingsOpen(false)
    setMobileOpen(false)
    navigate('/guide')
  }

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      if (next) setSettingsOpen(false)
      return next
    })
  }

  const toggleTheme = () => {
    setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
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

      <aside className={`hidden sm:block shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none ${collapsed ? 'w-[50px]' : 'w-[270px]'}`}>
        <div className="sticky top-0 h-[calc(100vh-1rem)] rounded-r-2xl border-r border-base bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.28)] overflow-visible flex flex-col transition-all duration-300 ease-in-out motion-reduce:transition-none">
          <div className={`${collapsed ? 'px-1 py-1.5' : 'px-3.5 py-2.5'} border-b border-base bg-[linear-gradient(140deg,var(--accent-soft)_0%,transparent_65%)] transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-1 transition-all duration-300 ease-in-out motion-reduce:transition-none">
                <button
                  onClick={toggleCollapsed}
                  className="group nav-item h-7 w-7 rounded-lg border border-base bg-surface-2 text-muted hover:text-primary hover:bg-surface-3 transition flex items-center justify-center"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <AnimatedNavIcon name="list-chevrons-up-down" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between transition-all duration-300 ease-in-out motion-reduce:transition-none">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Workspace</p>
                    <p className="text-lg font-bold tracking-tight text-primary mt-0.5 truncate">Asset Management</p>
                  </div>
                </div>

                <button
                  onClick={toggleCollapsed}
                  className="group nav-item h-8 w-8 rounded-lg border border-base bg-surface-2 text-muted hover:text-primary hover:bg-surface-3 transition flex items-center justify-center shrink-0"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <AnimatedNavIcon name="list-chevrons-up-down" />
                </button>
              </div>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-0.5 py-1' : 'px-2.5 py-2'} transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}>
            <SidebarSections pathname={pathname} query={query} canManage={isAdmin} compact={collapsed} />
          </div>

          <div className={`${collapsed ? 'px-0.5 py-1' : 'px-2.5 py-2'} border-t border-base transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}>
            <div className="relative" ref={settingsHostRef}>
              <button
                onClick={() => {
                  setSettingsOpen((value) => !value)
                }}
                className={`rounded-xl border border-base bg-surface-2 font-semibold transition hover:bg-surface-3 ${collapsed ? 'h-9 w-9 mx-auto' : 'w-full px-3 py-2.5 text-sm'
                  } flex items-center justify-center gap-2`}
                aria-label="Open settings"
                type="button"
              >
                <span className="group nav-item h-5 w-5 rounded-md border border-base flex items-center justify-center">
                  <AnimatedNavIcon name="settings" />
                </span>
                {!collapsed && <span>Settings</span>}
              </button>

              {settingsOpen && (
                <SettingsPanel
                  theme={theme}
                  density={density}
                  font={font}
                  onThemeToggle={toggleTheme}
                  onDensityChange={setDensity}
                  onFontChange={setFont}
                  onGuide={handleGuide}
                  onLogout={handleLogout}
                  notice={settingsNotice}
                  className={`settings-pop z-20 shadow-[0_16px_32px_rgba(0,0,0,0.35)] ${collapsed
                    ? 'absolute bottom-0 left-[calc(100%+10px)] w-[264px]'
                    : 'absolute bottom-full left-0 right-0 mb-2'
                    }`}
                />
              )}
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="relative w-[19rem] h-full bg-app border-r border-base shadow-2xl shadow-black/40 p-3 flex flex-col gap-2">
            <div className="rounded-2xl border border-base bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Workspace</p>
                    <p className="text-lg font-bold tracking-tight">Asset Management</p>
                  </div>
                </div>
                <button
                  className="h-8 w-8 rounded-lg border border-base bg-surface text-muted hover:text-primary hover:bg-surface-3 text-sm"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                >
                  x
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1 py-1">
              <SidebarSections pathname={pathname} query={query} canManage={isAdmin} onNavigate={() => setMobileOpen(false)} />
            </div>

            <button
              onClick={() => setSettingsOpen((value) => !value)}
              className="mt-3 w-full rounded-xl border border-base bg-surface-2 font-semibold px-3 py-2.5 text-sm transition hover:bg-surface-3 inline-flex items-center justify-center gap-2"
              aria-label="Open settings"
              type="button"
            >
              <span className="group nav-item h-5 w-5 rounded-md border border-base flex items-center justify-center">
                <AnimatedNavIcon name="settings" />
              </span>
              <span>Settings</span>
            </button>

            {settingsOpen && (
              <SettingsPanel
                theme={theme}
                density={density}
                font={font}
                onThemeToggle={toggleTheme}
                onDensityChange={setDensity}
                onFontChange={setFont}
                onGuide={handleGuide}
                onLogout={handleLogout}
                notice={settingsNotice}
                className="settings-pop mt-2 shadow-[0_16px_32px_rgba(0,0,0,0.35)]"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
