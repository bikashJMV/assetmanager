import AnimatedNavIcon from './AnimatedNavIcon'

type Props = {
  onClick: () => void
  loading?: boolean
  className?: string
  label?: string
}

export default function RefreshButton({
  onClick,
  loading = false,
  className = '',
  label = 'Refresh',
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`group nav-item inline-flex items-center gap-2 rounded-lg border border-base bg-surface px-3 py-2.5 text-sm font-semibold text-primary hover:bg-surface-3 transition disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      aria-label={loading ? 'Refreshing data' : 'Refresh data'}
      title={loading ? 'Refreshing...' : 'Refresh'}
      type="button"
    >
      <span className={`h-4 w-4 flex items-center justify-center ${loading ? 'refresh-spin' : ''}`}>
        <AnimatedNavIcon name="refresh-cw" />
      </span>
      <span>{loading ? 'Refreshing...' : label}</span>
    </button>
  )
}
