import AnimatedNavIcon from './AnimatedNavIcon'

type Props = {
  onClick: () => void
  loading?: boolean
  className?: string
  label?: string
  iconOnly?: boolean
  ariaLabel?: string
  title?: string
}

export default function RefreshButton({
  onClick,
  loading = false,
  className = '',
  label = 'Refresh',
  iconOnly = false,
  ariaLabel,
  title,
}: Props) {
  const resolvedLabel = loading ? 'Refreshing...' : label
  const resolvedAriaLabel = ariaLabel || (loading ? 'Refreshing data' : 'Refresh data')
  const resolvedTitle = title || (loading ? 'Refreshing...' : 'Refresh')

  return (
    <button
      onClick={onClick}
      disabled={loading}
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
    </button>
  )
}
