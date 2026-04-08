import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type FloatingMenuPosition = {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  minWidth: number
}

type RowActionMenuProps = {
  open: boolean
  onToggle: () => void
  onClose: () => void
  triggerLabel: string
  triggerTitle?: string
  menuLabel: string
  triggerContent: ReactNode
  children: ReactNode
  minWidth?: number
}

export default function RowActionMenu({
  open,
  onToggle,
  onClose,
  triggerLabel,
  triggerTitle = 'Actions',
  menuLabel,
  triggerContent,
  children,
  minWidth = 220,
}: RowActionMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null)

  useEffect(() => {
    if (!open) return

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      onClose()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gutter = 12
      const gap = 8
      const menuWidth = Math.min(Math.max(minWidth, rect.width), viewportWidth - gutter * 2)
      const left = Math.min(
        Math.max(gutter, rect.left),
        Math.max(gutter, viewportWidth - gutter - menuWidth),
      )

      const spaceBelow = viewportHeight - gutter - rect.bottom - gap
      const spaceAbove = rect.top - gutter - gap
      const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow

      if (openUpward) {
        setMenuPosition({
          left,
          minWidth: menuWidth,
          maxHeight: Math.min(320, Math.max(96, spaceAbove)),
          bottom: viewportHeight - rect.top + gap,
        })
      } else {
        const top = rect.bottom + gap
        setMenuPosition({
          left,
          minWidth: menuWidth,
          maxHeight: Math.min(320, Math.max(96, viewportHeight - gutter - top)),
          top,
        })
      }
    }

    updatePosition()
    const syncPosition = () => updatePosition()
    window.addEventListener('resize', syncPosition)
    window.addEventListener('scroll', syncPosition, true)
    return () => {
      window.removeEventListener('resize', syncPosition)
      window.removeEventListener('scroll', syncPosition, true)
    }
  }, [open, minWidth])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        title={triggerTitle}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          open
            ? 'border-[color:var(--accent-soft)] bg-[color:var(--accent-soft)]/15 text-accent'
            : 'border-base bg-surface text-muted hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent'
        }`}
      >
        {triggerContent}
      </button>

      {open && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              className="fixed z-[170] overflow-y-auto rounded-2xl border border-base bg-app p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]"
              style={{
                left: menuPosition.left,
                minWidth: menuPosition.minWidth,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
