import { Link } from 'react-router-dom'
import { useSessionEmployeeQuery } from '../../queries/employees'
import { BrandLogo } from './BrandLogo'

const BRAND = 'Asset Manager'
const TAGLINE = 'Built for accountability, easy handover and asset management.'
const WORDMARK = 'ASSET MANAGER'

type FooterLink = { label: string; to: string }

const NAVIGATE_LINKS: FooterLink[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Assets', to: '/assets' },
  { label: 'Settings', to: '/settings' },
]

const MANAGE_LINKS: FooterLink[] = [
  { label: 'Employees', to: '/employee' },
  { label: 'Analysis', to: '/analysis' },
  { label: 'Notifications', to: '/notifications' },
]

function LinkColumn({ title, links }: { title: string; links: FooterLink[] }): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
        {title}
      </span>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="footer-link text-sm transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AppFooter(): React.ReactElement {
  const year = new Date().getFullYear()
  const { data: sessionEmployee } = useSessionEmployeeQuery()
  const isPrivileged = Boolean(sessionEmployee?.is_active && sessionEmployee.role !== 'employee')

  return (
    <footer
      className="relative w-full overflow-hidden border-t"
      style={{ background: 'var(--bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
    >
      {/* Ambient accent glow — subtle in both themes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 80% at 85% 0%, var(--accent-soft), transparent 60%)',
          opacity: 0.6,
        }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 pt-12 pb-6 sm:px-8">
        {/* Top: brand + link columns */}
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <BrandLogo />
            <p className="mt-3 text-sm" style={{ color: 'var(--subtle)' }}>
              {TAGLINE}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <LinkColumn title="Navigate" links={NAVIGATE_LINKS} />
            {isPrivileged && <LinkColumn title="Manage" links={MANAGE_LINKS} />}
          </div>
        </div>

        {/* Giant faded wordmark */}
        <div
          aria-hidden
          className="pointer-events-none mt-8 select-none overflow-hidden text-center leading-none"
          style={{ containerType: 'inline-size' }}
        >
          <span
            className="block whitespace-nowrap font-black tracking-tight"
            style={{ fontSize: 'clamp(1.25rem, 11cqw, 9rem)', color: 'var(--text)', opacity: 0.07 }}
          >
            {WORDMARK}
          </span>
        </div>

        {/* Divider + copyright */}
        <hr className="mt-4 border-t" style={{ borderColor: 'var(--border)' }} />
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--subtle)' }}>
          {BRAND} © {year} — All rights reserved
        </p>
      </div>
    </footer>
  )
}
