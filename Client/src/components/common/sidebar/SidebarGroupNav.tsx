import AnimatedNavIcon from '../AnimatedNavIcon'
import type { SidebarNavActionKind, SidebarNavGroup, SidebarNavNestedGroup } from '../sidebarNav'
import { isEntryActive, isLinkActive, type DensityMode, type FontMode, type TextScale, type ThemeMode } from './sidebarNav.helpers'
import { SubNavAction, SubNavControl, SubNavLink } from './SidebarLeafNav'

function Chevron({ open, muted }: { open: boolean; muted: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180 text-accent' : muted ? 'text-subtle group-hover:text-accent' : 'text-accent'}`}
      aria-hidden="true"
    >
      <path d="m5 8 5 5 5-5" />
    </svg>
  )
}

export function NestedGroupNavItem({
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
  const highlight = hasActiveLink || open

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`group nav-item flex min-h-[2.5rem] w-full items-center gap-3 rounded-xl border border-transparent pl-12 pr-3 text-left text-sm transition ${highlight ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${highlight ? 'text-accent' : 'text-subtle group-hover:text-accent'}`}>
          <AnimatedNavIcon name={item.icon} />
        </span>
        <span className="flex-1 truncate font-medium">{item.label}</span>
        <Chevron open={open} muted={!highlight} />
      </button>

      {open ? (
        <div className="space-y-1 border-l border-dashed border-base/70 pl-2">
          {item.children.map((child) =>
            child.type === 'link' ? (
              <SubNavLink key={child.id} item={child} pathname={pathname} search={search} onNavigate={onNavigate} />
            ) : child.type === 'action' ? (
              <SubNavAction key={child.id} item={child} theme={theme} density={density} font={font} onAction={onAction} />
            ) : (
              <SubNavControl key={child.id} item={child} textScale={textScale} onTextScaleChange={onTextScaleChange} />
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

export function GroupNavItem({
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

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onExpandFromCompact(item.id)}
        title={item.label}
        aria-label={`Expand ${item.label}`}
        className={`group nav-item flex h-10 w-10 items-center justify-center rounded-xl transition ${active || open ? 'nav-item-active text-accent' : 'text-muted hover:text-accent'}`}
      >
        <AnimatedNavIcon name={item.icon} />
      </button>
    )
  }

  const highlight = (compact && active) || open

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={`group nav-item relative flex min-h-[3rem] w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition ${highlight ? 'nav-item-active border-accent-soft text-accent' : 'border-transparent text-muted hover:border-accent-soft hover:text-accent'}`}
      >
        <span className={`absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full ${compact && active ? 'bg-accent' : 'bg-transparent'}`} />
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${highlight ? 'border-accent-soft bg-surface-2 text-accent' : 'border-base bg-surface/90 text-subtle group-hover:border-accent-soft group-hover:text-accent'}`}>
          <AnimatedNavIcon name={item.icon} />
        </span>
        <span className="flex-1 text-sm font-semibold">{item.label}</span>
        <Chevron open={open} muted={!highlight} />
      </button>

      {open ? (
        <div className="space-y-1 border-l border-dashed border-base/80 pl-1">
          {item.children.map((child) =>
            child.type === 'link' ? (
              <SubNavLink key={child.id} item={child} pathname={pathname} search={search} onNavigate={onNavigate} />
            ) : child.type === 'nested-group' ? (
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
            ) : child.type === 'action' ? (
              <SubNavAction key={child.id} item={child} theme={theme} density={density} font={font} onAction={onAction} />
            ) : (
              <SubNavControl key={child.id} item={child} textScale={textScale} onTextScaleChange={onTextScaleChange} />
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
