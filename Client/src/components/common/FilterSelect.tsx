import { useEffect, useId, useMemo, useRef, useState } from 'react'

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
}

export default function FilterSelect({
  label,
  value,
  options,
  ariaLabel,
  title,
  onChange,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? { label: '', value: '' },
    [options, value],
  )

  useEffect(() => {
    if (!open) return

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
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

  return (
    <div ref={rootRef} className="space-y-2">
      <span className="block text-sm font-medium text-primary">{label}</span>

      <div className="relative">
        <button
          type="button"
          aria-label={ariaLabel}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={open ? listboxId : undefined}
          onClick={() => setOpen((current) => !current)}
          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm outline-none transition ${
            open
              ? 'border-[color:var(--accent)] bg-surface-2 text-primary'
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

        {open ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="absolute left-0 top-full z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-base bg-app p-2 shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
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
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    selected
                      ? 'bg-[color:var(--accent-soft)]/15 text-primary'
                      : 'text-primary hover:bg-surface-3'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 underline decoration-transparent underline-offset-4 transition hover:decoration-[color:var(--accent)]">
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
          </div>
        ) : null}
      </div>
    </div>
  )
}
