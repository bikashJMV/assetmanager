import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import FilterSelectMenu, { type FloatingMenuPosition } from './FilterSelectMenu'

export type FilterSelectOption = {
  label: string
  value: string
  /** CSS color value (e.g. `hsl(var(--status-assigned))`) for the option's status dot. */
  dotColor?: string
}

type FilterSelectProps = {
  label: string
  value: string
  options: ReadonlyArray<FilterSelectOption>
  ariaLabel: string
  title?: string
  onChange: (value: string) => void
  /** Omit the built-in label (use an external `<label htmlFor={triggerId}>`). */
  hideLabel?: boolean
  /** Match compact form controls (`EmployeeForm`-style inputs). */
  dense?: boolean
  /** `id` on the trigger button for `htmlFor` on an external label. */
  triggerId?: string
  /** Disable the control. Re-clicking the selected option resets to `deselectValue` (toggle-off). */
  disabled?: boolean
  deselectValue?: string
}

export default function FilterSelect({
  label,
  value,
  options,
  ariaLabel,
  title,
  onChange,
  hideLabel = false,
  dense = false,
  triggerId,
  disabled = false,
  deselectValue,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null)
  const listboxId = useId()

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? { label: '', value: '' },
    [options, value],
  )

  useEffect(() => {
    if (!open) return

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gutter = 12
      const gap = 8
      /** Prefer flipping up when there is not enough room below for a short menu. */
      const flipThreshold = 120
      const maxMenu = 320

      const width = Math.min(rect.width, Math.max(220, viewportWidth - gutter * 2))
      const left = Math.min(
        Math.max(gutter, rect.left),
        Math.max(gutter, viewportWidth - gutter - width),
      )

      const spaceBelow = viewportHeight - gutter - rect.bottom - gap
      const spaceAbove = rect.top - gutter - gap
      const openUpward = spaceBelow < flipThreshold && spaceAbove > spaceBelow

      if (openUpward) {
        const maxHeight = Math.min(maxMenu, Math.max(48, spaceAbove))
        setMenuPosition({
          left,
          width,
          maxHeight,
          bottom: viewportHeight - rect.top + gap,
        })
      } else {
        const top = rect.bottom + gap
        const maxHeight = Math.min(maxMenu, Math.max(48, viewportHeight - gutter - top))
        setMenuPosition({
          left,
          width,
          maxHeight,
          top,
        })
      }
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, options.length])

  return (
    <div ref={rootRef} className={hideLabel ? undefined : dense ? 'space-y-1' : 'space-y-2'}>
      {!hideLabel ? (
        <span className={dense ? 'block text-muted text-xs' : 'block text-sm font-medium text-primary'}>
          {label}
        </span>
      ) : null}

      <div className="relative">
        <button
          id={triggerId}
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={open ? listboxId : undefined}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          className={`flex w-full items-center justify-between gap-3 border text-left outline-none transition ${
            dense ? 'rounded-lg px-3 py-2.5 text-sm' : 'rounded-xl px-3 py-3 text-sm'
          } ${
            disabled
              ? 'opacity-50 cursor-not-allowed border-base bg-app text-primary'
              : open
                ? 'border-[color:var(--accent)] bg-surface-2 text-primary ring-2 ring-[color:var(--accent-soft)]'
                : dense
                  ? 'border-base bg-app text-primary hover:border-[color:var(--accent-soft)]'
                  : 'border-base bg-surface text-primary hover:border-[color:var(--accent-soft)]'
          }`}
        >
          <span className="truncate">{selectedOption.label}</span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && menuPosition ? (
        <FilterSelectMenu
          menuRef={menuRef}
          listboxId={listboxId}
          ariaLabel={ariaLabel}
          menuPosition={menuPosition}
          options={options}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          deselectValue={deselectValue}
        />
      ) : null}
    </div>
  )
}
