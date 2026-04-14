import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { searchAssignableEmployees, type EmployeeRecord } from '../../api'

type FloatingMenuPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

type Props = {
  id: string
  label: ReactNode
  value: string
  onChange: (value: string) => void
  selectedEmployee: EmployeeRecord | null
  onSelectedEmployeeChange: (employee: EmployeeRecord | null) => void
  placeholder?: string
  hint?: ReactNode
  required?: boolean
  disabled?: boolean
  hideLabel?: boolean
}

const SEARCH_DEBOUNCE_MS = 250
const RESULT_LIMIT = 10

function formatSelectedEmployeeLabel(employee: Pick<EmployeeRecord, 'name' | 'employee_id'>): string {
  const name = employee.name.trim()
  const code = employee.employee_id.trim()
  if (name && code) return `${name} - ${code}`
  return name || code
}

export default function EmployeeAssignLookup({
  id,
  label,
  value,
  onChange,
  selectedEmployee,
  onSelectedEmployeeChange,
  placeholder,
  hint,
  required = false,
  disabled = false,
  hideLabel = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState<EmployeeRecord[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null)
  const listboxId = useId()

  const selectedLabel = useMemo(
    () => (selectedEmployee ? formatSelectedEmployeeLabel(selectedEmployee) : ''),
    [selectedEmployee],
  )

  const normalizedQuery = value.trim()
  const showMenu = open && !disabled

  useEffect(() => {
    if (!showMenu) return

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
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
  }, [showMenu])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setLoading(false)
      setSearchError('')
      setResults([])
      setActiveIndex(-1)
      return
    }

    if (!showMenu) return

    if (selectedEmployee && normalizedQuery === selectedLabel) {
      setLoading(false)
      setSearchError('')
      setResults([selectedEmployee])
      setActiveIndex(0)
      return
    }

    if (!normalizedQuery) {
      setLoading(false)
      setSearchError('')
      setResults([])
      setActiveIndex(-1)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setSearchError('')

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const nextResults = await searchAssignableEmployees(normalizedQuery, { limit: RESULT_LIMIT })
          if (requestId !== requestIdRef.current) return
          setResults(nextResults)
          setActiveIndex(nextResults.length > 0 ? 0 : -1)
          setSearchError('')
        } catch {
          if (requestId !== requestIdRef.current) return
          setResults([])
          setActiveIndex(-1)
          setSearchError('Unable to load employee suggestions right now.')
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false)
          }
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [disabled, normalizedQuery, selectedEmployee, selectedLabel, showMenu])

  useLayoutEffect(() => {
    if (!showMenu) {
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
      const maxMenu = 320

      const width = Math.min(rect.width, Math.max(260, viewportWidth - gutter * 2))
      const left = Math.min(
        Math.max(gutter, rect.left),
        Math.max(gutter, viewportWidth - gutter - width),
      )

      const spaceBelow = viewportHeight - gutter - rect.bottom - gap
      const spaceAbove = rect.top - gutter - gap
      const openUpward = spaceBelow < flipThreshold && spaceAbove > spaceBelow

      if (openUpward) {
        const maxHeight = Math.min(maxMenu, Math.max(72, spaceAbove))
        setMenuPosition({
          left,
          width,
          maxHeight,
          bottom: viewportHeight - rect.top + gap,
        })
      } else {
        const top = rect.bottom + gap
        const maxHeight = Math.min(maxMenu, Math.max(72, viewportHeight - gutter - top))
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
  }, [showMenu, results.length, loading, searchError])

  const selectEmployee = (employee: EmployeeRecord) => {
    onSelectedEmployeeChange(employee)
    onChange(formatSelectedEmployeeLabel(employee))
    setSearchError('')
    setResults([employee])
    setActiveIndex(0)
    setOpen(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => {
        if (results.length === 0) return -1
        return Math.min(current + 1, results.length - 1)
      })
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => {
        if (results.length === 0) return -1
        if (current <= 0) return 0
        return current - 1
      })
      return
    }

    if (event.key === 'Enter' && showMenu && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      selectEmployee(results[activeIndex])
    }
  }

  return (
    <div ref={rootRef}>
      {!hideLabel ? (
        <label htmlFor={id} className="block text-muted text-xs mb-1">
          {label}
          {required ? <span className="text-accent"> *</span> : null}
        </label>
      ) : null}
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
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value
            onChange(nextValue)
            if (selectedEmployee) {
              onSelectedEmployeeChange(null)
            }
            setSearchError('')
            setOpen(true)
          }}
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onKeyDown={handleInputKeyDown}
          className="min-w-0 flex-1 bg-surface-2 border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show employee suggestions"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (disabled) return
            setOpen((current) => !current)
          }}
          className="shrink-0 rounded-lg border border-base bg-surface-2 px-2.5 text-muted outline-none transition hover:border-[color:var(--accent-soft)] hover:text-primary focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)] disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 transition ${showMenu ? 'rotate-180' : ''}`}
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
              aria-label="Employee suggestions"
              className="fixed z-[150] overflow-y-auto rounded-xl border border-base bg-app p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
              style={{
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              {loading ? (
                <div className="px-3 py-2.5 text-sm text-muted">Searching employees...</div>
              ) : searchError ? (
                <div className="px-3 py-2.5 text-sm text-accent">{searchError}</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2.5 text-sm text-muted">
                  {normalizedQuery
                    ? "Not found, possibly employee is inactive or doesn't exist." // "Not found or possibly inactive."
                    : 'Type a user name or employee ID to search.'}
                </div>
              ) : (
                results.map((employee, index) => {
                  const isActiveRow = index === activeIndex
                  const isSelected =
                    selectedEmployee?.id === employee.id ||
                    selectedEmployee?.employee_id === employee.employee_id

                  return (
                    <button
                      key={employee.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        selectEmployee(employee)
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`group flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        isActiveRow || isSelected
                          ? 'bg-[color:var(--accent-soft)]/15 text-primary'
                          : 'text-primary hover:bg-surface-3'
                      }`}
                    >
                      <span className="min-w-0 truncate underline decoration-transparent underline-offset-[3px] transition group-hover:underline group-hover:decoration-[color:var(--accent)]">
                        {employee.name.trim() || employee.employee_id}
                        {employee.employee_id.trim() ? ` / ${employee.employee_id.trim()}` : ''}
                        {employee.department?.trim() ? ` / ${employee.department.trim()}` : ''}
                      </span>
                    </button>
                  )
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
