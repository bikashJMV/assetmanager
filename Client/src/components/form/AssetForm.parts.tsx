import { useEffect, useRef } from 'react'
import { AppIcon, type AppIconName } from '../ui'
import { INPUT_CLASS, INPUT_WITH_ICON } from './assetForm.styles'

/** Neutral section: small icon + bold title over a thin divider, then the content. */
export function Section({
  icon,
  title,
  action,
  children,
}: {
  icon?: AppIconName
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-base pb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          {icon ? <AppIcon name={icon} size={16} className="text-muted" /> : null}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Label({
  children,
  required = false,
  htmlFor,
  className = '',
}: {
  children: React.ReactNode
  required?: boolean
  htmlFor?: string
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={`block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5 ${className}`}>
      {children}
      {required ? <span className="text-red-500" aria-hidden="true"> *</span> : null}
    </label>
  )
}

export function Field({
  label,
  required = false,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={INPUT_CLASS}
      />
    </div>
  )
}

/** Text input with a leading icon rendered inside the field. */
export function IconInput({
  icon,
  ...props
}: { icon: AppIconName } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <AppIcon name={icon} size={16} />
      </span>
      <input {...props} className={INPUT_WITH_ICON} />
    </div>
  )
}

/** Date field with a calendar icon inside; clicking the field or icon opens the native picker. */
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const openPicker = () => {
    const el = ref.current
    // showPicker is a user-gesture API; guard for browsers that lack it.
    if (el && typeof el.showPicker === 'function') {
      try {
        el.showPicker()
      } catch {
        /* not supported in this context — the native indicator still works */
      }
    }
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <button
          type="button"
          aria-label={`Open ${label} picker`}
          onClick={openPicker}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        >
          <AppIcon name="calendar" size={16} />
        </button>
        <input
          ref={ref}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={openPicker}
          className={INPUT_WITH_ICON}
        />
      </div>
    </div>
  )
}

/** Textarea that grows with its content instead of scrolling. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
  minRows = 2,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  ariaLabel?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={minRows}
      placeholder={placeholder}
      className="w-full bg-app border border-base rounded-lg px-3 py-2 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition resize-none overflow-hidden"
    />
  )
}
