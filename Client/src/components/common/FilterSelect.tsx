import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type FilterSelectOption = {
  label: string
  value: string
  dotClassName?: string
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
}

type FloatingMenuPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
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
          className={`flex w-full items-center justify-between gap-3 border text-left outline-none transition ${
            dense ? 'rounded-lg px-3 py-2.5 text-sm' : 'rounded-xl px-3 py-3 text-sm'
          } ${
            open
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

      {open && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className="fixed z-[150] overflow-y-auto rounded-xl border border-base bg-app p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
              style={{
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              {options.map((option) => {
                const selected = option.value === value

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? 'bg-[color:var(--accent-soft)]/15 text-primary'
                        : 'text-primary hover:bg-surface-3'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 underline decoration-transparent underline-offset-[3px] transition group-hover:decoration-[color:var(--accent)] group-hover:underline">
                      {option.dotClassName ? (
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.dotClassName}`} aria-hidden="true" />
                      ) : null}
                      <span>{option.label}</span>
                    </span>
                    {selected ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    ) : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
