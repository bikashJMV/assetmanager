import type { MouseEventHandler } from 'react'
import AnimatedNavIcon, { type IconName } from './AnimatedNavIcon'

type IconActionButtonVariant = 'base' | 'accent' | 'danger'

type IconActionButtonProps = {
  icon: IconName
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  variant?: IconActionButtonVariant
  showTitle?: boolean
}

export default function IconActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  variant = 'base',
  showTitle = true,
}: IconActionButtonProps) {
  const variantClass =
    variant === 'accent'
      ? 'border border-[color:var(--accent-soft)] text-accent hover:bg-[color:var(--accent-soft)]/20'
      : variant === 'danger'
        ? 'border border-base text-accent hover:bg-surface-2'
        : 'border border-base text-primary hover:bg-surface-2'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={showTitle ? label : undefined}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${variantClass} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <AnimatedNavIcon name={icon} />
      </span>
    </button>
  )
}

