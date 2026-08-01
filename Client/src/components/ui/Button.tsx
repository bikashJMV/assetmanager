import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AppIcon, type AppIconName } from './AppIcon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'soft'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: AppIconName
  loading?: boolean
  children?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-foreground hover:bg-brand-hover active:bg-brand-active focus-visible:shadow-focus',
  secondary: 'bg-surface text-foreground border border-line hover:bg-surface-hover focus-visible:shadow-focus',
  ghost: 'bg-transparent text-foreground-muted hover:bg-surface-hover focus-visible:shadow-focus',
  danger: 'bg-danger text-white hover:brightness-110 focus-visible:shadow-focus',
  'danger-outline':
    'border border-danger bg-transparent text-danger hover:bg-danger hover:text-white active:bg-danger-active active:text-white focus-visible:shadow-focus-danger',
  soft: 'text-brand hover:brightness-105 focus-visible:shadow-focus',
}

const SOFT_STYLE = { backgroundColor: 'hsl(var(--primary) / 0.10)' }

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[length:var(--text-sm)] gap-1.5',
  md: 'h-9 px-4 text-[length:var(--text-base)] gap-2',
}

/**
 * Button primitive (Notes/UI.md §6). Icon+label; GPU-only press (scale); loading
 * reserves width to avoid layout shift; focus ring via token. Destructive actions
 * must pair icon+label and sit behind a confirm dialog (caller's responsibility).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, disabled, children, className = '', style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      style={variant === 'soft' ? { ...SOFT_STYLE, ...style } : style}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium select-none',
        'min-h-[var(--touch-target)] sm:min-h-0',
        'transition-[background-color,transform,filter] duration-fast ease-out',
        'active:scale-[0.97] focus-visible:outline-none',
        'disabled:opacity-60 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        icon && <AppIcon name={icon} size={16} />
      )}
      {children}
    </button>
  )
})
