export type ThemeMode = 'light' | 'dark'
export type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
export type FontMode = 'claude' | 'clean' | 'mono' | 'serif'
export type TextScale = number

export const DEFAULT_TEXT_SCALE = 1
export const MIN_TEXT_SCALE = 0.9
export const MAX_TEXT_SCALE = 1.2
export const TEXT_SCALE_STEP = 0.01

function normalizeTextScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_SCALE
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Number(value.toFixed(2))))
}

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('ams-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getInitialDensity(): DensityMode {
  if (typeof window === 'undefined') return 'normal'
  const stored = localStorage.getItem('ams-density')
  if (stored === 'compact' || stored === 'normal' || stored === 'large' || stored === 'spacious') return stored
  return 'normal'
}

export function getInitialFont(): FontMode {
  if (typeof window === 'undefined') return 'claude'
  const stored = localStorage.getItem('ams-font')
  if (stored === 'claude' || stored === 'clean' || stored === 'mono' || stored === 'serif') return stored
  return 'claude'
}

export function getInitialTextScale(): TextScale {
  if (typeof window === 'undefined') return DEFAULT_TEXT_SCALE
  const stored = localStorage.getItem('ams-text-scale')
  if (!stored) return DEFAULT_TEXT_SCALE
  return normalizeTextScale(Number.parseFloat(stored))
}

export function applyDocumentPreferences(
  theme: ThemeMode,
  density: DensityMode,
  font: FontMode,
  textScale: TextScale = DEFAULT_TEXT_SCALE,
) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.density = density
  document.documentElement.dataset.font = font
  document.documentElement.style.setProperty('--user-text-scale', String(normalizeTextScale(textScale)))
}

export function applyStoredPreferences() {
  applyDocumentPreferences(
    getInitialTheme(),
    getInitialDensity(),
    getInitialFont(),
    getInitialTextScale(),
  )
}
