import { useEffect, useState } from 'react'
import {
  applyDocumentPreferences,
  getInitialDensity,
  getInitialFont,
  getInitialTextScale,
  getInitialTheme,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
} from '../../utils/theme'
import { applyThemeWithReveal } from '../../utils/themeTransition'

export type ThemeMode = 'light' | 'dark'
export type DensityMode = 'compact' | 'normal' | 'large' | 'spacious'
export type FontMode = 'claude' | 'clean' | 'mono' | 'serif'

/** Single owner of the appearance preferences: applies to <html> and persists to localStorage
 * (same keys the boot script + cross-tab listener read). Mirrors the old sidebar behaviour. */
export function usePreferences() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [density, setDensity] = useState<DensityMode>(getInitialDensity)
  const [font, setFont] = useState<FontMode>(getInitialFont)
  const [textScale, setTextScale] = useState<number>(getInitialTextScale)

  useEffect(() => {
    applyDocumentPreferences(theme, density, font, textScale)
    localStorage.setItem('ams-theme', theme)
    localStorage.setItem('ams-density', density)
    localStorage.setItem('ams-font', font)
    localStorage.setItem('ams-text-scale', String(textScale))
  }, [theme, density, font, textScale])

  const changeTextScale = (value: number) => {
    if (!Number.isFinite(value)) return
    setTextScale(Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, Number(value.toFixed(2)))))
  }

  const changeTheme = (next: ThemeMode) => applyThemeWithReveal(next, setTheme)

  return { theme, setTheme, changeTheme, density, setDensity, font, setFont, textScale, changeTextScale }
}
