import { useEffect, useRef, useState } from 'react'
import type { CategoryRecord } from '../../api'
import { AppIcon, type AppIconName } from '../ui'
import { categoryIconName, getCategoryLabelFromSlug, OTHER } from './assetForm.categoryMeta'

/** Read-only category display used when the page locks the category (QR / template flow). */
export function CategoryLocked({ label, slug }: { label: string; slug: string }) {
  return (
    <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-base bg-surface-2 px-3 text-sm text-primary">
      <AppIcon name={categoryIconName(slug)} size={18} className="text-muted shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  )
}

export function CategorySelect({
  options,
  value,
  isOther,
  onPick,
}: {
  options: CategoryRecord[]
  value: string
  isOther: boolean
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const currentLabel = isOther
    ? 'Other'
    : options.find((o) => o.slug === value)?.name || getCategoryLabelFromSlug(value) || 'Select a category'
  const currentIcon: AppIconName = isOther ? 'catOther' : categoryIconName(value)

  const optionClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-primary transition hover:bg-surface-2 ${
      active ? 'bg-surface-2' : ''
    }`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select asset category"
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-base bg-app px-3 text-sm text-primary outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <AppIcon name={currentIcon} size={18} className="shrink-0 text-muted" />
          <span className="truncate">{currentLabel}</span>
        </span>
        <span aria-hidden className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-base bg-app p-1 shadow-xl"
        >
          {options.map((o) => (
            <li key={o.slug}>
              <button
                type="button"
                role="option"
                aria-selected={!isOther && o.slug === value}
                onClick={() => {
                  onPick(o.slug)
                  setOpen(false)
                }}
                className={optionClass(!isOther && o.slug === value)}
              >
                <AppIcon name={categoryIconName(o.slug)} size={18} className="shrink-0 text-muted" />
                <span className="truncate">{o.name}</span>
              </button>
            </li>
          ))}
          <li className="my-1 border-t border-base" aria-hidden />
          <li>
            <button
              type="button"
              role="option"
              aria-selected={isOther}
              onClick={() => {
                onPick(OTHER)
                setOpen(false)
              }}
              className={optionClass(isOther)}
            >
              <AppIcon name="catOther" size={18} className="shrink-0 text-muted" />
              <span>Other</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
