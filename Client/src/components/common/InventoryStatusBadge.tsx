import { formatEnumLabel } from '../../utils/formatDisplay'

type InventoryStatusBadgeProps = {
  status: string | null | undefined
  size?: 'sm' | 'md'
}

export function getInventoryStatusTone(status: string): { dot: string; border: string; bg: string; text: string } {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'assigned') {
    return { dot: 'bg-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-primary' }
  }
  if (normalized === 'in_stock') {
    return { dot: 'bg-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', text: 'text-primary' }
  }
  if (normalized === 'in_repair') {
    return { dot: 'bg-teal-500', border: 'border-teal-500/40', bg: 'bg-teal-500/10', text: 'text-primary' }
  }
  if (normalized === 'retired') {
    return { dot: 'bg-gray-700', border: 'border-gray-600/50', bg: 'bg-gray-600/15', text: 'text-primary' }
  }
  if (normalized === 'lost') {
    return { dot: 'bg-red-500', border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-primary' }
  }
  if (normalized === 'disposed') {
    return { dot: 'bg-gray-300', border: 'border-gray-400/50', bg: 'bg-gray-300/20', text: 'text-primary' }
  }
  return { dot: 'bg-gray-400', border: 'border-base', bg: 'bg-surface', text: 'text-muted' }
}

export default function InventoryStatusBadge({ status, size = 'sm' }: InventoryStatusBadgeProps) {
  const raw = typeof status === 'string' ? status : ''
  const label = formatEnumLabel(raw || '-')
  const tone = getInventoryStatusTone(raw)
  const dotSizeClass = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  const textSizeClass = size === 'md' ? 'text-sm' : 'text-xs'
  const gapClass = size === 'md' ? 'gap-2' : 'gap-1.5'
  const shapeClass = size === 'md' ? 'rounded-lg px-3 py-1' : 'rounded-md px-2 py-0.5'

  return (
    <span className={`inline-flex items-center ${gapClass} border font-medium ${textSizeClass} ${shapeClass} ${tone.border} ${tone.bg} ${tone.text}`}>
      <span className={`${dotSizeClass} rounded-full ${tone.dot}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
