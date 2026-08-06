import { AppIcon, type AppIconName } from '../ui'

export type PillOption<T extends string> = {
  value: T
  label: string
  icon?: AppIconName
  /** Optional font-family stack — renders the label in that face (font-family preview). */
  fontFamily?: string
}

/** Segmented pill selector (HF-style). Full-radius pills, active = brand fill. Icon-forward. */
export function OptionPills<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: PillOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            style={opt.fontFamily ? { fontFamily: opt.fontFamily } : undefined}
            className={`inline-flex min-h-[2.5rem] items-center gap-2 rounded-full border px-4 text-[length:var(--text-sm)] font-medium transition-[background-color,color,border-color] duration-fast ease-out focus-visible:shadow-focus focus-visible:outline-none ${
              active
                ? 'border-transparent bg-brand text-brand-foreground'
                : 'border-line bg-surface text-foreground-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            {opt.icon ? <AppIcon name={opt.icon} size={16} /> : null}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
