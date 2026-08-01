export default function Field({
  label,
  value,
  required = false,
  type = 'text',
  disabled = false,
  options = [],
  placeholder,
  suggestions,
  onChange,
}: {
  label: string
  value: string
  required?: boolean
  type?: string
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  suggestions?: string[]
  onChange: (value: string) => void
}) {
  const fieldId = `employee-form-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const listId = suggestions && suggestions.length > 0 ? `${fieldId}-suggestions` : undefined

  return (
    <div>
      <label htmlFor={fieldId} className="block text-muted text-xs mb-1">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {type === 'select' ? (
        <select
          id={fieldId}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-surface-2 text-primary">
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={fieldId}
            type={type}
            value={value}
            disabled={disabled}
            list={listId}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-app border border-base rounded-lg px-3 py-2.5 text-primary placeholder:text-subtle text-sm outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {listId ? (
            <datalist id={listId}>
              {suggestions!.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
    </div>
  )
}
