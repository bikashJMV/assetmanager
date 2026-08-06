import { AppIcon, type AppIconName } from '../ui'

type Chip = {
  id: string
  label: string
  count: number
  icon: AppIconName
  /** semantic token name, or null for a neutral chip */
  varName: string | null
}

/** Compact, dynamically-updating summary chips under the page title. Counts carry
 * an icon + label so they read without relying on the tint alone. */
export default function WarrantySummaryChips({
  total,
  expired,
  expiringSoon,
  activeFilters,
}: {
  total: number
  expired: number
  expiringSoon: number
  activeFilters: number
}) {
  const chips: Chip[] = [
    { id: 'total', label: 'Total Notifications', count: total, icon: 'info', varName: null },
    { id: 'expired', label: 'Expired', count: expired, icon: 'error', varName: '--danger' },
    { id: 'expiring', label: 'Expiring Soon', count: expiringSoon, icon: 'warning', varName: '--warning' },
    {
      id: 'filters',
      label: 'Active Filters',
      count: activeFilters,
      icon: 'filter',
      varName: activeFilters > 0 ? '--primary' : null,
    },
  ]

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Warranty notification summary">
      {chips.map((chip) => {
        const neutral = chip.varName === null || chip.count === 0
        return (
          <li
            key={chip.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--text-xs)] font-medium transition-colors duration-fast ${
              neutral ? 'border border-line bg-surface text-foreground-muted' : ''
            }`}
            style={
              neutral
                ? undefined
                : {
                    color: `hsl(var(${chip.varName}))`,
                    backgroundColor: `hsl(var(${chip.varName}) / 0.12)`,
                    boxShadow: `inset 0 0 0 1px hsl(var(${chip.varName}) / 0.28)`,
                  }
            }
          >
            <AppIcon name={chip.icon} size={12} />
            <span>{chip.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{chip.count}</span>
          </li>
        )
      })}
    </ul>
  )
}
