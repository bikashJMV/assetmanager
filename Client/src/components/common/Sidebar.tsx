import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AnimatedNavIcon from './AnimatedNavIcon'
import FontSizeSlider from './FontSizeSlider'
import {
  sidebarSections,
  type SidebarNavAction,
  type SidebarNavActionKind,
  type SidebarNavControl,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavGroupChild,
  type SidebarNavLink,
  type SidebarNavNestedGroup,
  type SidebarNavSection,
  type SidebarNavVisibility,
} from './sidebarNav'
import {
  applyDocumentPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  TEXT_SCALE_STEP,
} from '../../utils/theme'

type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
type FontMode = 'claude' | 'clean' | 'mono' | 'serif'
type ThemeMode = 'light' | 'dark'
type TextScale = number

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

function filterGroupChildren(
  children: SidebarNavGroupChild[],
  isAuthenticated: boolean,
  canManage: boolean,
): SidebarNavGroupChild[] {
  return children
    .map((child): SidebarNavGroupChild | null => {
      if (!hasVisibilityAccess(child.visibility, isAuthenticated, canManage)) return null

      if (child.type === 'nested-group') {
        const nestedChildren = child.children.filter((nestedChild) =>
          hasVisibilityAccess(nestedChild.visibility, isAuthenticated, canManage),
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
function applyEmployeeRouteOverride(
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
            const children = filterGroupChildren(item.children, isAuthenticated, canManage)
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
  if (item.id === 'home' && (pathname === '/' || pathname === '/dashboard')) return true
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

function getDefaultOpenGroups(sections: SidebarNavSection[]) {
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

function getActiveGroupIds(
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
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active
          ? 'nav-item-active text-accent'
          : accentTone
            ? 'text-muted hover:text-accent'
            : 'text-muted hover:text-accent'
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
      className={`group nav-item relative flex min-h-[3rem] items-center gap-3 rounded-2xl border px-3.5 transition ${active ? 'nav-item-active border-accent-soft text-accent' : 'border-transparent'
        }${active
          ? ''
          : accentTone
            ? ' text-muted hover:text-accent'
            : ' text-muted hover:text-accent'
        }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'
          }`}
      />
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${active
          ? 'border-accent-soft bg-white/80 text-accent'
          : 'border-base bg-surface/90 text-subtle group-hover:text-accent'
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
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active
          ? 'nav-item-active text-accent'
          : 'text-muted hover:text-accent'
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
      className={`group nav-item relative flex min-h-[3rem] w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition ${active ? 'nav-item-active border-accent-soft bg-[linear-gradient(135deg,rgba(224,122,36,0.16),rgba(224,122,36,0.05))] text-accent shadow-[0_14px_36px_rgba(224,122,36,0.12)]' : 'border-transparent text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/12 hover:text-accent'
        }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'
          }`}
      />
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${active
          ? 'border-accent-soft bg-white/80 text-accent'
          : 'border-base bg-surface/90 text-subtle group-hover:border-accent-soft group-hover:bg-[color:var(--accent-soft)]/12 group-hover:text-accent'
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
      className={`group nav-item relative flex min-h-[2.5rem] items-center gap-3 rounded-lg pl-12 pr-3 text-sm transition ${active ? 'nav-item-active text-accent' : ''
        }${active
          ? ''
          : accentTone
            ? ' text-muted hover:text-accent'
            : ' text-muted hover:text-accent'
        }`}
    >
      <span
        className={`absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'}`}
      />
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
        <AnimatedNavIcon name={item.icon} />
      </span>
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
      className={`group nav-item flex min-h-[2.5rem] w-full items-center gap-3 rounded-xl border border-transparent pl-12 pr-3 text-sm transition ${active ? 'nav-item-active border-accent-soft/60 bg-[color:var(--accent-soft)]/10 text-accent' : 'text-muted hover:border-accent-soft/50 hover:bg-[color:var(--accent-soft)]/12 hover:text-accent'
        }`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
        <AnimatedNavIcon name={actionIcon} />
      </span>
      <span className={`truncate ${active ? 'font-semibold' : 'font-medium'}`}>{actionLabel}</span>
    </button>
  )
}

function SubNavControl({
  item,
  textScale,
  onTextScaleChange,
}: {
  item: SidebarNavControl
  textScale: TextScale
  onTextScaleChange: (value: TextScale) => void
}) {
  if (item.control !== 'font-scale') return null

  return (
    <FontSizeSlider
      label={item.label}
      icon={item.icon}
      value={textScale}
      min={MIN_TEXT_SCALE}
      max={MAX_TEXT_SCALE}
      step={TEXT_SCALE_STEP}
      onChange={onTextScaleChange}
    />
  )
}

function NestedGroupNavItem({
  item,
  pathname,
  search,
  open,
  theme,
  density,
  font,
  textScale,
  onToggle,
  onAction,
  onTextScaleChange,
  onNavigate,
}: {
  item: SidebarNavNestedGroup
  pathname: string
  search: URLSearchParams
  open: boolean
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  textScale: TextScale
  onToggle: (id: string) => void
  onAction: (action: SidebarNavActionKind) => void
  onTextScaleChange: (value: TextScale) => void
  onNavigate?: () => void
}) {
  const hasActiveLink = item.children.some((child) => child.type === 'link' && isLinkActive(child, pathname, search))

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`group nav-item flex min-h-[2.5rem] w-full items-center gap-3 rounded-xl border border-transparent pl-12 pr-3 text-left text-sm transition ${
          hasActiveLink
            ? 'border-accent-soft/60 bg-[color:var(--accent-soft)]/10 text-accent'
            : open
              ? 'border-accent-soft/50 bg-[color:var(--accent-soft)]/10 text-accent'
              : 'text-muted hover:border-accent-soft/50 hover:bg-[color:var(--accent-soft)]/12 hover:text-accent'
        }`}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${hasActiveLink ? 'text-accent' : open ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
          <AnimatedNavIcon name={item.icon} />
        </span>
        <span className="flex-1 truncate font-medium">{item.label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180 text-accent' : 'text-subtle group-hover:text-accent'}`}
          aria-hidden="true"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="space-y-1 border-l border-dashed border-base/70 pl-2">
          {item.children.map((child) =>
            child.type === 'link' ? (
              <SubNavLink
                key={child.id}
                item={child}
                pathname={pathname}
                search={search}
                onNavigate={onNavigate}
              />
            ) : (
              child.type === 'action' ? (
                <SubNavAction key={child.id} item={child} theme={theme} density={density} font={font} onAction={onAction} />
              ) : (
                <SubNavControl
                  key={child.id}
                  item={child}
                  textScale={textScale}
                  onTextScaleChange={onTextScaleChange}
                />
              )
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

function GroupNavItem({
  item,
  pathname,
  search,
  compact = false,
  open,
  openGroups,
  theme,
  density,
  font,
  textScale,
  onToggle,
  onExpandFromCompact,
  onAction,
  onTextScaleChange,
  onNavigate,
}: {
  item: SidebarNavGroup
  pathname: string
  search: URLSearchParams
  compact?: boolean
  open: boolean
  openGroups: Record<string, boolean>
  theme: ThemeMode
  density: DensityMode
  font: FontMode
  textScale: TextScale
  onToggle: (id: string) => void
  onExpandFromCompact: (id: string) => void
  onAction: (action: SidebarNavActionKind) => void
  onTextScaleChange: (value: TextScale) => void
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
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active || open
          ? 'nav-item-active text-accent'
          : 'text-muted hover:text-accent'
          }`}
      >
        <AnimatedNavIcon name={item.icon} />
      </button>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`group nav-item relative flex min-h-[3rem] w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition ${emphasizeGroup ? 'nav-item-active border-accent-soft bg-[linear-gradient(135deg,rgba(224,122,36,0.16),rgba(224,122,36,0.05))] text-accent shadow-[0_14px_36px_rgba(224,122,36,0.12)]' : open ? 'border-accent-soft/50 bg-[color:var(--accent-soft)]/10 text-accent' : 'border-transparent text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/12 hover:text-accent'
          }`}
      >
        <span
          className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${emphasizeGroup ? 'bg-accent' : 'bg-transparent'
            }`}
        />
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${emphasizeGroup
            ? 'border-accent-soft bg-white/80 text-accent'
            : open
              ? 'border-base bg-surface text-accent'
              : 'border-base bg-surface/90 text-subtle group-hover:border-accent-soft group-hover:bg-[color:var(--accent-soft)]/12 group-hover:text-accent'
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
          className={`h-4 w-4 shrink-0 transition-transform ${open ? `rotate-180 ${emphasizeGroup ? 'text-accent' : 'text-accent'}` : 'text-subtle group-hover:text-accent'}`}
          aria-hidden="true"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="space-y-1 border-l border-dashed border-base/80 pl-1">
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
              child.type === 'nested-group' ? (
                <NestedGroupNavItem
                  key={child.id}
                  item={child}
                  pathname={pathname}
                  search={search}
                  open={Boolean(openGroups[child.id])}
                  theme={theme}
                  density={density}
                  font={font}
                  textScale={textScale}
                  onToggle={onToggle}
                  onAction={onAction}
                  onTextScaleChange={onTextScaleChange}
                  onNavigate={onNavigate}
                />
              ) : (
                child.type === 'action' ? (
                  <SubNavAction key={child.id} item={child} theme={theme} density={density} font={font} onAction={onAction} />
                ) : (
                  <SubNavControl
                    key={child.id}
                    item={child}
                    textScale={textScale}
                    onTextScaleChange={onTextScaleChange}
                  />
                )
              )
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
  textScale,
  onToggleGroup,
  onExpandGroup,
  onAction,
  onTextScaleChange,
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
  textScale: TextScale
  onToggleGroup: (id: string) => void
  onExpandGroup: (id: string) => void
  onAction: (action: SidebarNavActionKind) => void
  onTextScaleChange: (value: TextScale) => void
  onNavigate?: () => void
}) {
  return (
    <div className={`${compact ? 'space-y-3' : 'space-y-4'}`}>
      {sections.map((section, index) => (
        <section key={section.id} className={`${compact ? 'flex flex-col items-center gap-2' : 'space-y-2'}`}>
          {!compact && section.title ? (
            <div className="flex items-center gap-3 px-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">{section.title}</p>
              <div className="h-px flex-1 bg-gradient-to-r from-[color:var(--border)] to-transparent" aria-hidden="true" />
            </div>
          ) : null}

          <div className={`${compact ? 'flex flex-col items-center gap-2.5' : 'space-y-1'}`}>
            {section.items.map((item) =>
              item.type === 'group' ? (
                <GroupNavItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  search={search}
                  compact={compact}
                  open={Boolean(openGroups[item.id])}
                  openGroups={openGroups}
                  theme={theme}
                  density={density}
                  font={font}
                  textScale={textScale}
                  onToggle={onToggleGroup}
                  onExpandFromCompact={onExpandGroup}
                  onAction={onAction}
                  onTextScaleChange={onTextScaleChange}
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
            <div className="h-px w-6 bg-gradient-to-r from-[color:var(--border)] to-transparent" aria-hidden="true" />
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
  // no async fetch needed; AppRoutes waits for profileLoading before rendering.
  const isAdmin = Boolean(sessionEmployee?.is_active && sessionEmployee.role !== 'employee')
  const sessionEmployeeId = sessionEmployee?.id ?? null

  const query = useMemo(() => new URLSearchParams(search), [search])

  const canManage = isAuthenticated && isAdmin
  const visibleSections = useMemo(
    () => applyEmployeeRouteOverride(
      filterSidebarSections(isAuthenticated, canManage),
      canManage,
      sessionEmployeeId,
    ),
    [isAuthenticated, canManage, sessionEmployeeId],
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
    if (density === 'normal') return
    setDensity('normal')
    localStorage.setItem('ams-density', 'normal')
  }, [density])

  useEffect(() => {
    applyDocumentPreferences(theme, density, font, textScale)
    localStorage.setItem('ams-theme', theme)
    localStorage.setItem('ams-density', density)
    localStorage.setItem('ams-font', font)
    localStorage.setItem('ams-text-scale', String(textScale))
  }, [theme, density, font, textScale])


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

  const handleTextScaleChange = (value: TextScale) => {
    if (!Number.isFinite(value)) return
    const next = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Number(value.toFixed(2))))
    setTextScale(next)
  }

  const handleMobileNavigate = () => {
    closeMobileNav()
  }

  const sidebarShellBackground =
    theme === 'dark'
      ? 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.92))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,245,240,0.94))'
  const expandedSidebarWidth = `${Math.round(230 + Math.max(0, textScale - 1) * 100)}px`

  return (
    <>
      <button
        className="sm:hidden fixed top-3 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/85 p-2 text-white shadow-[0_14px_36px_rgba(15,23,42,0.34)] backdrop-blur transition hover:bg-slate-900"
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
          className="sticky flex flex-col overflow-x-visible overflow-y-hidden border-r border-base shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
          style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)`, background: sidebarShellBackground }}
        >
          <div
            className={`flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-3 py-3'} transition-[padding] duration-300 ease-in-out motion-reduce:transition-none`}
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
              textScale={textScale}
              onToggleGroup={toggleGroup}
              onExpandGroup={expandGroupFromCompact}
              onAction={handleNavAction}
              onTextScaleChange={handleTextScaleChange}
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
            <div className="border-b border-base bg-[linear-gradient(160deg,rgba(224,122,36,0.1)_0%,transparent_72%)] px-4 py-3.5">
              <div className="flex items-center justify-end gap-3">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-base bg-surface text-muted hover:bg-surface-3 hover:text-primary transition"
                  onClick={closeMobileNav}
                  aria-label="Close"
                  title="Close"
                  type="button"
                >
                  <span className="text-lg leading-none">&times;</span>
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
                textScale={textScale}
                onToggleGroup={toggleGroup}
                onExpandGroup={expandGroupFromCompact}
                onAction={handleNavAction}
                onTextScaleChange={handleTextScaleChange}
                onNavigate={handleMobileNavigate}
              />
            </div>

          </div>
        </div>
      ) : null}
    </>
  )
}
