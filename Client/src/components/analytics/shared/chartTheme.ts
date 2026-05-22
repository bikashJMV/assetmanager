export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export const STATUS_HEX: Record<string, string> = {
  assigned:  '#10b981',
  in_stock:  '#facc15',
  in_repair: '#14b8a6',
  retired:   '#3f3f46',
  lost:      '#ef4444',
  disposed:  '#d1d5db',
}

export const PALETTE = [
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f97316',
  '#ec4899',
  '#f59e0b',
]

function isDark(): boolean {
  return document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getChartColors() {
  const dark = isDark()
  return {
    bg:          getCssVar('--bg')        || (dark ? '#1a1a1a'              : '#ffffff'),
    surface:     getCssVar('--surface-2') || (dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
    textPrimary: getCssVar('--text')      || (dark ? '#f0f0f0'              : '#000000'),
    textMuted:   getCssVar('--muted')     || (dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)'),
    textSubtle:  getCssVar('--subtle')    || (dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)'),
    // border is intentionally stronger so leader lines stay visible in both modes
    border:      getCssVar('--muted')     || (dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'),
    accent:      getCssVar('--accent')    || '#f97316',
    status:      STATUS_HEX,
    palette:     PALETTE,
  }
}
