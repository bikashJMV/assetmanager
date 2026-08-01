import { AppIcon } from '../ui'

/**
 * Asset Manager logo: a brand-tinted rounded mark holding the package glyph + a two-weight
 * wordmark. Sizes: 'sm' for the topbar, 'lg' for auth/marketing screens.
 */
export function BrandLogo({ size = 'sm', className = '' }: { size?: 'sm' | 'lg'; className?: string }) {
  const lg = size === 'lg'
  const mark = lg ? 'h-11 w-11' : 'h-8 w-8'
  const iconSize = lg ? 24 : 18
  const text = lg ? 'text-2xl' : 'text-lg'
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid place-items-center rounded-lg ${mark} text-white shadow-md`}
        style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-active)))' }}
        aria-hidden
      >
        <AppIcon name="assets" size={iconSize} strokeWidth={2.2} />
      </span>
      <span className={`font-bold tracking-tight ${text} whitespace-nowrap`}>
        <span className="text-primary">Asset</span>
        <span className="text-accent">Manager</span>
      </span>
    </span>
  )
}
