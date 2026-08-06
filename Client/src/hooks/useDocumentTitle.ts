import { useEffect } from 'react'

const BASE_TITLE = 'AssetManager'

const EXACT_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/assets': 'All Assets',
  '/assets/new': 'New Asset',
  '/employee': 'All Employees',
  '/analysis': 'Analysis',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
  '/qr-generate/batches': 'QR Batches',
  '/logs': 'Live Telemetry Logs',
  '/login': 'Sign In',
  '/callback': 'Signing In',
  '/404': 'Not Found',
}

function pageLabel(pathname: string): string {
  const path = pathname.split('?')[0]?.split('#')[0] ?? '/'
  const exact = EXACT_TITLES[path]
  if (exact) return exact
  if (/^\/assets\/scan(\/.*)?$/.test(path)) return 'Scan'
  if (/^\/assets\/[^/]+$/.test(path)) return 'Asset Details'
  if (/^\/employee\/[^/]+$/.test(path)) return 'Employee Details'
  return ''
}

export function useDocumentTitle(pathname: string): void {
  useEffect(() => {
    const label = pageLabel(pathname)
    document.title = label ? `${BASE_TITLE} | ${label}` : BASE_TITLE
  }, [pathname])
}
