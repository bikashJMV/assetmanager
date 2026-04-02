import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'

type Crumb = { label: string; to?: string }

function labelForSegment(seg: string): string {
  const map: Record<string, string> = {
    assets: 'Assets',
    employee: 'Employees',
    'new': 'New',
    analysis: 'Analysis',
    notifications: 'Notifications',
    'recycle-bin': 'Recycle Bin',
    guide: 'Guide',
    scan: 'Scan',
    'assets': 'Assets',
  }
  return map[seg] ?? seg
}

function buildCrumbs(pathname: string): Crumb[] {
  const clean = pathname.split('?')[0]?.split('#')[0] ?? '/'
  const segments = clean.split('/').filter(Boolean)
  if (segments.length === 0) {
    return [{ label: 'Home', to: '/' }]
  }

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }]
  let pathAcc = ''
  segments.forEach((seg, idx) => {
    pathAcc += `/${seg}`
    const isLast = idx === segments.length - 1
    const baseLabel = labelForSegment(seg)
    let label = baseLabel

    // Special cases for common flows
    if (segments[0] === 'assets' && isLast && seg === 'new') {
      label = 'New Asset'
    } else if (segments[0] === 'employee' && isLast && seg === 'new') {
      label = 'New Employee'
    } else if (
      seg.match(/^[a-z0-9-]+$/i) &&
      isLast &&
      segments.length > 1 &&
      !['assets', 'employee'].includes(seg)
    ) {
      label = `${baseLabel === seg ? 'Detail' : baseLabel}: ${seg}`
    }

    crumbs.push({ label, to: isLast ? undefined : pathAcc })
  })
  return crumbs
}

export default function Breadcrumbs() {
  const location = useLocation()
  const crumbs = useMemo(() => buildCrumbs(location.pathname), [location.pathname])

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="px-4 py-2 sm:px-6 text-sm text-subtle">
      <ol className="flex items-center flex-wrap gap-1">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${idx}`} className="flex items-center gap-1">
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="hover:text-accent hover:underline hover:decoration-accent hover:decoration-2 hover:decoration-solid underline-offset-4 transition"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-muted">{crumb.label}</span>
              )}
              {!isLast && <span className="text-[10px] text-muted">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
