/**
 * Scene palette resolved from the AMS design tokens at runtime.
 *
 * The 3D scene cannot use Tailwind classes, so every colour it draws is read
 * out of the same CSS custom properties the rest of the app uses. Re-resolving
 * on `[data-theme]` change is what makes the diorama dark-mode safe without a
 * second hardcoded palette.
 */

export type DioramaPalette = {
  accent: string
  accentDeep: string
  accentGlow: string
  floorTop: string
  floorLip: string
  plinth: string
  panelShell: string
  panelSurface: string
  panelInk: string
  analyticsShell: string
  staffPrimary: string
  staffAccent: string
  crate: string
  foliage: string
  screen: string
  hemiSky: string
  hemiGround: string
  fillLight: string
}

const HSL_TRIPLET = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/

type Hsl = { h: number; s: number; l: number }

const FALLBACK_PRIMARY: Hsl = { h: 217, s: 91, l: 53 }

function readToken(styles: CSSStyleDeclaration, name: string, fallback: Hsl): Hsl {
  const match = HSL_TRIPLET.exec(styles.getPropertyValue(name))
  if (!match) return fallback
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) }
}

function shift(base: Hsl, deltaL: number, deltaS = 0): Hsl {
  return {
    h: base.h,
    s: Math.min(100, Math.max(0, base.s + deltaS)),
    l: Math.min(100, Math.max(0, base.l + deltaL)),
  }
}

function css({ h, s, l }: Hsl): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.dataset.theme === 'dark'
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function buildPalette(primary: Hsl, background: Hsl, dark: boolean): DioramaPalette {
  const neutral: Hsl = { h: primary.h, s: 14, l: background.l }

  return {
    accent: css(primary),
    accentDeep: css(shift(primary, -16)),
    accentGlow: css(shift(primary, dark ? 12 : 6)),
    floorTop: css(dark ? shift(neutral, 8) : shift(neutral, -2)),
    floorLip: css(dark ? shift(neutral, 3) : shift(neutral, -12)),
    plinth: css(dark ? shift(neutral, 13) : shift(neutral, -6)),
    panelShell: css(dark ? shift(neutral, -4, 8) : { h: primary.h, s: 25, l: 13 }),
    panelSurface: css(dark ? shift(neutral, -6, 10) : { h: primary.h, s: 24, l: 11 }),
    panelInk: css(dark ? shift(neutral, 80, -6) : { h: primary.h, s: 20, l: 97 }),
    analyticsShell: css({ h: primary.h, s: 52, l: dark ? 20 : 24 }),
    staffPrimary: css({ h: primary.h, s: 22, l: dark ? 34 : 24 }),
    staffAccent: css(primary),
    crate: css({ h: 32, s: 42, l: dark ? 44 : 58 }),
    foliage: css({ h: 152, s: 42, l: dark ? 34 : 40 }),
    screen: css(shift(primary, dark ? 6 : 2, -8)),
    hemiSky: dark ? css(shift(neutral, 26)) : '#ffffff',
    hemiGround: css(dark ? shift(neutral, 2) : shift(neutral, -6)),
    fillLight: css({ h: primary.h, s: 60, l: dark ? 52 : 78 }),
  }
}

/**
 * Reads the live token values. Scene-only surfaces (floor slabs, plinths) are
 * derived from `--background` rather than invented, so a theme change moves the
 * whole diorama together with the page around it.
 */
export function resolvePalette(): DioramaPalette {
  const dark = isDarkTheme()
  if (typeof window === 'undefined') {
    return buildPalette(FALLBACK_PRIMARY, { h: 217, s: 20, l: 98 }, dark)
  }

  const styles = window.getComputedStyle(document.documentElement)
  const primary = readToken(styles, '--primary', FALLBACK_PRIMARY)
  const background = readToken(styles, '--background', {
    h: primary.h,
    s: 20,
    l: dark ? 10 : 98,
  })
  return buildPalette(primary, background, dark)
}

/** Fires `onChange` whenever the `[data-theme]` attribute flips. */
export function watchTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined
  }
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
