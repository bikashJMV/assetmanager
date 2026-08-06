type FontSizeSliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

/** Compact slider — sits at the end of its row; shows only the current percentage. */
export default function FontSizeSlider({ label, value, min, max, step, onChange }: FontSizeSliderProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
        className="w-36 cursor-pointer sm:w-44"
        aria-label={label}
      />
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-accent">{toPercent(value)}</span>
    </div>
  )
}
