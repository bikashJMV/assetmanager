import { Link } from 'react-router-dom'
import AnimatedNavIcon from '../AnimatedNavIcon'
import FontSizeSlider from '../FontSizeSlider'
import { MAX_TEXT_SCALE, MIN_TEXT_SCALE, TEXT_SCALE_STEP } from '../../../utils/theme'
import type { SidebarNavAction, SidebarNavActionKind, SidebarNavControl, SidebarNavLink } from '../sidebarNav'
import { isLinkActive, isNavActionActive, type DensityMode, type FontMode, type TextScale, type ThemeMode } from './sidebarNav.helpers'

export function MainNavLink({
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

  if (compact) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
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
      className={`group nav-item relative flex min-h-[3rem] items-center gap-3 rounded-2xl border px-3.5 transition ${active ? 'nav-item-active border-accent-soft text-accent' : 'border-transparent text-muted hover:text-accent'}`}
    >
      <span className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${active ? 'border-accent-soft bg-surface-2 text-accent' : 'border-base bg-surface/90 text-subtle group-hover:text-accent'}`}>
        <AnimatedNavIcon name={item.icon} />
      </span>
      <span className={`flex-1 text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
    </Link>
  )
}

function resolveActionMeta(item: SidebarNavAction, theme: ThemeMode) {
  const isThemeAction = item.action === 'toggle-theme'
  return {
    label: isThemeAction ? (theme === 'dark' ? 'Switch to Light' : 'Switch to Dark') : item.label,
    icon: isThemeAction ? (theme === 'dark' ? 'sun' : 'moon') : item.icon,
  }
}

export function MainNavAction({
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
  const { label, icon } = resolveActionMeta(item, theme)
  const active = isNavActionActive(item.action, density, font)

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onAction(item.action)}
        title={label}
        aria-label={label}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
      >
        <AnimatedNavIcon name={icon} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onAction(item.action)}
      className={`group nav-item relative flex min-h-[3rem] w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition ${active ? 'nav-item-active border-accent-soft text-accent' : 'border-transparent text-muted hover:border-accent-soft hover:text-accent'}`}
    >
      <span className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${active ? 'border-accent-soft bg-surface-2 text-accent' : 'border-base bg-surface/90 text-subtle group-hover:border-accent-soft group-hover:text-accent'}`}>
        <AnimatedNavIcon name={icon} />
      </span>
      <span className={`flex-1 text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  )
}

export function SubNavLink({
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

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group nav-item relative flex min-h-[2.5rem] items-center gap-3 rounded-lg pl-12 pr-3 text-sm transition ${active ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
    >
      <span className={`absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
        <AnimatedNavIcon name={item.icon} />
      </span>
      <span className={`truncate ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
    </Link>
  )
}

export function SubNavAction({
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
  const { label, icon } = resolveActionMeta(item, theme)
  const active = isNavActionActive(item.action, density, font)

  return (
    <button
      type="button"
      onClick={() => onAction(item.action)}
      className={`group nav-item flex min-h-[2.5rem] w-full items-center gap-3 rounded-xl border border-transparent pl-12 pr-3 text-sm transition ${active ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${active ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
        <AnimatedNavIcon name={icon} />
      </span>
      <span className={`truncate ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  )
}

export function SubNavControl({
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
      value={textScale}
      min={MIN_TEXT_SCALE}
      max={MAX_TEXT_SCALE}
      step={TEXT_SCALE_STEP}
      onChange={onTextScaleChange}
    />
  )
}
