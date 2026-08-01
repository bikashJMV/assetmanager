import type { AppIconName } from '../ui'

/** Sentinel for the custom ("Other") category — never sent to the API. */
export const OTHER = '__other__'

export function getCategoryLabelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function categoryIconName(slug: string): AppIconName {
  const s = slug.toLowerCase()
  if (s.includes('laptop')) return 'catLaptop'
  if (s.includes('desktop')) return 'catDesktop'
  if (s.includes('mobile') || s.includes('phone')) return 'catMobile'
  if (s.includes('printer')) return 'catPrinter'
  if (s.includes('keyboard')) return 'catKeyboard'
  if (s.includes('mouse')) return 'catMouse'
  if (s.includes('monitor')) return 'catMonitor'
  if (s.includes('pen') || s.includes('drive') || s.includes('usb')) return 'catPenDrive'
  if (s.includes('lock')) return 'catLocker'
  return 'catOther'
}
