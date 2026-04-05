import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingMenuPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

type Props = {
  id: string
  label: React.ReactNode
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  hint?: React.ReactNode
  required?: boolean
}

export default function DepartmentCombobox({
  id,
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  hint,
  required,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null)
  const listboxId = useId()

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = suggestions.filter(Boolean)
    if (!q) return list.slice(0, 80)
    return list.filter((name) => name.toLowerCase().includes(q)).slice(0, 80)
  }, [suggestions, value])

  useEffect(() => {
    if (!open) return

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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
      const flipThreshold = 120
      const maxMenu = 280

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
  }, [open, filtered.length])

  const showMenu = open && filtered.length > 0

  return (
    <div ref={rootRef}>
      <label htmlFor={id} className="block text-muted text-xs mb-1">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      <div ref={triggerRef} className="flex gap-1">
        <input
          id={id}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={showMenu ? listboxId : undefined}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="min-w-0 flex-1 bg-app border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show department suggestions"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-lg border border-base bg-app px-2.5 text-muted outline-none transition hover:border-[color:var(--accent-soft)] hover:text-primary focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)]"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`}
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
      {hint ? <div className="text-[11px] text-muted mt-1 leading-snug">{hint}</div> : null}

      {showMenu && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label="Department suggestions"
              className="fixed z-[150] overflow-y-auto rounded-xl border border-base bg-app p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
              style={{
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              {filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={name === value.trim()}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(name)
                    setOpen(false)
                  }}
                  className="group flex w-full rounded-lg px-3 py-2.5 text-left text-sm text-primary transition hover:bg-surface-3"
                >
                  <span className="underline decoration-transparent underline-offset-[3px] transition group-hover:underline group-hover:decoration-[color:var(--accent)]">
                    {name}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
