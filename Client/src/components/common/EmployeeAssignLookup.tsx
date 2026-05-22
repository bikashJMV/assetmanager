import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { EmployeeRecord } from '../../types/api'

import { searchAssignableEmployees } from '../../services/employeeService'

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
  const showMenu = open && !disabled && normalizedQuery.length > 0

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

    // Close when sidebar toggle shifts the layout (body width change).
    // Skip the first callback — it fires immediately on mount before any real shift.
    let mounted = false
    const resizeObserver = new ResizeObserver(() => {
      if (!mounted) { mounted = true; return }
      setOpen(false)
    })
    resizeObserver.observe(document.body)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      resizeObserver.disconnect()
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
      <div ref={triggerRef}>
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
          className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none hover:border-[color:var(--accent-soft)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60"
        />
      </div>
      {hint ? <div className="text-[11px] text-muted mt-1 leading-snug">{hint}</div> : null}

      {showMenu && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label="Employee suggestions"
              className="fixed z-[150] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-surface-2 shadow-[0_24px_56px_rgba(0,0,0,0.28),0_4px_12px_rgba(0,0,0,0.12)] backdrop-blur-md"
              style={{
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              <div className="overflow-y-auto p-1.5" style={{ maxHeight: menuPosition.maxHeight }}>
                {loading ? (
                  <div className="space-y-0.5">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-2.5 rounded-xl px-3 py-2">
                        <div className="h-7 w-7 shrink-0 rounded-full bg-surface-3 animate-pulse" />
                        <div className="flex-1 space-y-1">
                          <div className="h-2.5 w-2/3 rounded-full bg-surface-3 animate-pulse" />
                          <div className="h-2 w-1/3 rounded-full bg-surface-3 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchError ? (
                  <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                    </svg>
                    <p className="text-xs text-muted">{searchError}</p>
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-subtle" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <p className="text-xs text-muted">
                      {normalizedQuery ? "No match found. Employee may be inactive." : 'Type a name or employee ID to search.'}
                    </p>
                  </div>
                ) : (
                  results.map((employee, index) => {
                    const isActiveRow = index === activeIndex
                    const isSelected =
                      selectedEmployee?.id === employee.id ||
                      selectedEmployee?.employee_id === employee.employee_id
                    const highlight = isActiveRow || isSelected
                    const initial = (employee.name.trim() || employee.employee_id.trim() || '?')[0].toUpperCase()

                    return (
                      <button
                        key={employee.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseDown={(e) => { e.preventDefault(); selectEmployee(employee) }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors duration-100 ${
                          highlight
                            ? 'bg-[color:var(--accent-soft)]/20'
                            : 'hover:bg-surface-3'
                        }`}
                      >
                        {/* accent left bar on active */}
                        {highlight && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                        )}

                        {/* avatar */}
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                          highlight
                            ? 'bg-accent text-on-accent'
                            : 'bg-surface-3 text-muted group-hover:bg-accent/20 group-hover:text-accent'
                        }`}>
                          {initial}
                        </div>

                        {/* text */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-primary leading-tight">
                            {employee.name.trim() || employee.employee_id}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {employee.employee_id.trim() && (
                              <span className="font-mono text-[10px] text-subtle">{employee.employee_id.trim()}</span>
                            )}
                            {employee.department?.trim() && (
                              <>
                                <span className="text-[10px] text-subtle/50">·</span>
                                <span className="text-[10px] text-subtle">{employee.department.trim()}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* selected checkmark */}
                        {isSelected && (
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
