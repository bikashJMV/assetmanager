import AnimatedNavIcon from './AnimatedNavIcon'

type Props = {
  onClick: () => void | Promise<void>
  loading?: boolean
  disabled?: boolean
  className?: string
  label?: string
  iconOnly?: boolean
  ariaLabel?: string
  title?: string
  loadingAriaLabel?: string
}

export default function RefreshButton({
  onClick,
  loading = false,
  disabled = false,
  className = '',
  label = 'Refresh',
  iconOnly = false,
  ariaLabel,
  title,
  loadingAriaLabel = 'Refreshing data',
}: Props) {
  const resolvedLabel = label
  const resolvedAriaLabel = ariaLabel || (loading ? loadingAriaLabel : 'Refresh data')
  const resolvedTitle = title || resolvedAriaLabel

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`group nav-item inline-flex items-center rounded-lg border border-base bg-surface text-sm font-semibold text-primary hover:bg-surface-3 transition disabled:opacity-60 disabled:cursor-not-allowed ${iconOnly ? 'h-10 w-10 justify-center px-0' : 'gap-2 px-3 py-2.5'
        } ${className}`}
      aria-label={resolvedAriaLabel}
      title={resolvedTitle}
      type="button"
    >
      <span className={`h-4 w-4 flex items-center justify-center ${loading ? 'refresh-spin' : ''}`}>
        <AnimatedNavIcon name="refresh-cw" />
      </span>
      {!iconOnly && <span>{resolvedLabel}</span>}
      {loading ? <span className="sr-only">Refreshing</span> : null}
    </button>
  )
}
