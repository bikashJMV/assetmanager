import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AnimatedNavIcon from './AnimatedNavIcon'
import { sidebarSections, type SidebarNavActionKind } from './sidebarNav'
import {
  applyDocumentPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
} from '../../utils/theme'
import {
  applyEmployeeRouteOverride,
  areOpenGroupsEqual,
  filterSidebarSections,
  getActiveGroupIds,
  getDefaultOpenGroups,
  type DensityMode,
  type FontMode,
  type TextScale,
  type ThemeMode,
} from './sidebar/sidebarNav.helpers'
import { SidebarNavigation } from './sidebar/SidebarNavigation'
import { SIDEBAR_VARS } from './sidebar/sidebarChrome'
import { applyThemeWithReveal } from '../../utils/themeTransition'

export default function Sidebar({
  isAuthenticated,
  collapsed,
  onSetCollapsed,
  topOffset = 0,
  sessionEmployee = null,
}: {
  isAuthenticated: boolean
  collapsed: boolean
  onSetCollapsed: (value: boolean) => void
  topOffset?: number
  sessionEmployee?: { id: string; role: string; is_active: boolean } | null
}) {
  const { pathname, search } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [density, setDensity] = useState<DensityMode>(getInitialDensity)
  const [font, setFont] = useState<FontMode>(getInitialFont)
  const [textScale, setTextScale] = useState<TextScale>(getInitialTextScale)

  // Derive admin/employee state directly from the already-resolved prop —
  // AppRoutes waits for profileLoading before rendering, so no async fetch is needed.
  const isAdmin = Boolean(sessionEmployee?.is_active && sessionEmployee.role !== 'employee')
  const isItOps = Boolean(sessionEmployee?.is_active && sessionEmployee.role === 'it_ops')
  const sessionEmployeeId = sessionEmployee?.id ?? null

  const query = useMemo(() => new URLSearchParams(search), [search])
  const canManage = isAuthenticated && isAdmin

  const visibleSections = useMemo(
    () =>
      applyEmployeeRouteOverride(
        filterSidebarSections(isAuthenticated, canManage, isItOps),
        canManage,
        sessionEmployeeId,
      ),
    [isAuthenticated, canManage, isItOps, sessionEmployeeId],
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
      for (const groupId of activeGroupIds) next[groupId] = true
      return areOpenGroupsEqual(current, next) ? current : next
    })
  }, [visibleSections, pathname, query])

  useEffect(() => {
    applyDocumentPreferences(theme, density, font, textScale)
    localStorage.setItem('ams-theme', theme)
    localStorage.setItem('ams-density', density)
    localStorage.setItem('ams-font', font)
    localStorage.setItem('ams-text-scale', String(textScale))
  }, [theme, density, font, textScale])

  const closeMobileNav = () => setMobileOpen(false)

  const toggleGroup = (id: string) => {
    setOpenGroups((current) => ({ ...current, [id]: !current[id] }))
  }

  const expandGroupFromCompact = (id: string) => {
    onSetCollapsed(false)
    setOpenGroups((current) => ({ ...current, [id]: true }))
  }

  const handleNavAction = (action: SidebarNavActionKind) => {
    if (action === 'toggle-theme') {
      applyThemeWithReveal(theme === 'dark' ? 'light' : 'dark', setTheme)
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

  const handleTextScaleChange = (value: TextScale) => {
    if (!Number.isFinite(value)) return
    const next = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Number(value.toFixed(2))))
    setTextScale(next)
  }

  const expandedSidebarWidth = `${Math.round(230 + Math.max(0, textScale - 1) * 100)}px`

  const navProps = {
    sections: visibleSections,
    pathname,
    search: query,
    openGroups,
    theme,
    density,
    font,
    textScale,
    onToggleGroup: toggleGroup,
    onExpandGroup: expandGroupFromCompact,
    onAction: handleNavAction,
    onTextScaleChange: handleTextScaleChange,
  }

  return (
    <>
      <button
        className="sm:hidden fixed top-3 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-sidebar p-2 text-sidebar-fg-active shadow-lg backdrop-blur transition"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        title="Open navigation"
      >
        <AnimatedNavIcon name="list-chevrons-up-down" />
      </button>

      <aside
        className="hidden shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none sm:block"
        style={{ width: collapsed ? '60px' : expandedSidebarWidth }}
      >
        <div
          className="ams-sidebar sticky flex flex-col overflow-x-visible overflow-y-hidden border-r shadow-lg"
          style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)`, ...SIDEBAR_VARS }}
        >
          <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-3 py-3'} transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}>
            <SidebarNavigation {...navProps} compact={collapsed} onNavigate={undefined} />
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
          <div className="ams-sidebar relative flex h-full w-[20rem] max-w-[88vw] flex-col border-r shadow-2xl shadow-black/40" style={SIDEBAR_VARS}>
            <div className="flex items-center justify-end border-b border-base px-4 py-3.5">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-base bg-surface text-muted transition hover:bg-surface-3 hover:text-primary"
                onClick={closeMobileNav}
                aria-label="Close"
                title="Close"
                type="button"
              >
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNavigation {...navProps} onNavigate={closeMobileNav} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
