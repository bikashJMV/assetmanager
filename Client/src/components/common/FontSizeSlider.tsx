import AnimatedNavIcon, { type IconName } from './AnimatedNavIcon'

type FontSizeSliderProps = {
  label: string
  icon?: IconName
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export default function FontSizeSlider({
  label,
  icon = 'text-layout',
  value,
  min,
  max,
  step,
  onChange,
}: FontSizeSliderProps) {
  return (
    <div className="relative min-w-0 pl-10 pr-3 py-2">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-subtle">
          <AnimatedNavIcon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 text-sm font-medium text-primary">{label}</span>
            <span className="shrink-0 text-xs font-semibold text-accent">{toPercent(value)}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number.parseFloat(event.target.value))}
            className="mt-2 block w-full cursor-pointer"
            aria-label={label}
          />
          <div className="mt-1 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">
            <span>{toPercent(min)}</span>
            <span>{toPercent(max)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
