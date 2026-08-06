import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import type { FilterSelectOption } from './FilterSelect'

export type FloatingMenuPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

type FilterSelectMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>
  listboxId: string
  ariaLabel: string
  menuPosition: FloatingMenuPosition
  options: ReadonlyArray<FilterSelectOption>
  value: string
  onChange: (value: string) => void
  onClose: () => void
  /** When set, re-clicking the currently-selected option resets to this value (toggle-off). */
  deselectValue?: string
}

type FilterSelectOptionRowProps = {
  option: FilterSelectOption
  selected: boolean
  onSelect: () => void
}

function FilterSelectOptionRow({ option, selected, onSelect }: FilterSelectOptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
        selected
          ? 'bg-[color:var(--accent-soft)]/15 text-primary'
          : 'text-primary hover:bg-surface-3'
      }`}
    >
      <span className="inline-flex items-center gap-2 underline decoration-transparent underline-offset-[3px] transition group-hover:decoration-[color:var(--accent)] group-hover:underline">
        {option.dotColor ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.dotColor }} aria-hidden="true" />
        ) : null}
        <span>{option.label}</span>
      </span>
      {selected ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      ) : null}
    </button>
  )
}

export default function FilterSelectMenu({
  menuRef,
  listboxId,
  ariaLabel,
  menuPosition,
  options,
  value,
  onChange,
  onClose,
  deselectValue,
}: FilterSelectMenuProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
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
      {options.map((option) => (
        <FilterSelectOptionRow
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={() => {
            const alreadySelected = option.value === value
            if (alreadySelected && deselectValue !== undefined && option.value !== deselectValue) {
              onChange(deselectValue)
            } else {
              onChange(option.value)
            }
            onClose()
          }}
        />
      ))}
    </div>,
    document.body,
  )
}
