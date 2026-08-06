import { formatEnumLabel, getInventoryStatusTone } from '../../utils/formatDisplay'

type InventoryStatusBadgeProps = {
  status: string | null | undefined
  size?: 'sm' | 'md'
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
    <span
      className={`inline-flex items-center ${gapClass} border font-medium ${textSizeClass} ${shapeClass} ${tone.text}`}
      style={{ borderColor: tone.borderColor, backgroundColor: tone.bgColor }}
    >
      <span className={`${dotSizeClass} rounded-full`} style={{ backgroundColor: tone.dotColor }} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
