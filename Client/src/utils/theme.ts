export type ThemeMode = 'light' | 'dark'
export type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
export type FontMode = 'claude' | 'clean' | 'mono' | 'serif'

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

export function applyDocumentPreferences(theme: ThemeMode, density: DensityMode, font: FontMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.density = density
  document.documentElement.dataset.font = font
}

export function applyStoredPreferences() {
  applyDocumentPreferences(getInitialTheme(), getInitialDensity(), getInitialFont())
}
