import type { SidebarNavActionKind, SidebarNavSection } from '../sidebarNav'
import type { DensityMode, FontMode, TextScale, ThemeMode } from './sidebarNav.helpers'
import { MainNavAction, MainNavLink } from './SidebarLeafNav'
import { GroupNavItem } from './SidebarGroupNav'

export function SidebarNavigation({
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
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {sections.map((section, index) => (
        <section key={section.id} className={compact ? 'flex flex-col items-center gap-2' : 'space-y-2'}>
          {!compact && section.title ? (
            <div className="flex items-center gap-3 px-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-subtle">{section.title}</p>
              <div className="h-px flex-1 bg-gradient-to-r from-[color:var(--border)] to-transparent" aria-hidden="true" />
            </div>
          ) : null}

          <div className={compact ? 'flex flex-col items-center gap-2.5' : 'space-y-1'}>
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
