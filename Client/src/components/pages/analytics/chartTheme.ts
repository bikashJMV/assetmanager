import { type CSSProperties, useEffect, useState } from 'react'

// Recharts needs concrete color strings (many props reject `var(--x)`), and our
// theme tokens are nested `hsl(var(--…))` chains that getComputedStyle won't
// substitute when read directly off :root. So we resolve each token through a
// throwaway probe element whose computed `color` the browser fully flattens to
// rgb(), then re-resolve whenever the [data-theme] attribute flips.

export type ChartColors = {
  series: string[]
  text: string
  muted: string
  grid: string
  surface: string
  border: string
}

const SERIES_TOKENS = [
  '--chart-1', '--chart-2', '--chart-3', '--chart-4',
  '--chart-5', '--chart-6', '--chart-7', '--chart-8',
] as const

const FALLBACK: ChartColors = {
  series: ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'],
  text: '#1f2937',
  muted: '#6b7280',
  grid: '#e5e7eb',
  surface: '#ffffff',
  border: '#e5e7eb',
}

function resolveColors(): ChartColors {
  if (typeof document === 'undefined' || !document.body) return FALLBACK

  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)

  const read = (expr: string): string => {
    probe.style.color = ''
    probe.style.color = expr
    return getComputedStyle(probe).color
  }

  try {
    return {
      series: SERIES_TOKENS.map((t) => read(`var(${t})`)),
      text: read('var(--text)'),
      muted: read('var(--muted)'),
      grid: read('var(--border)'),
      surface: read('var(--surface)'),
      border: read('var(--border)'),
    }
  } finally {
    probe.remove()
  }
}

export function tooltipStyle(colors: ChartColors): {
  contentStyle: CSSProperties
  labelStyle: CSSProperties
  itemStyle: CSSProperties
} {
  return {
    contentStyle: {
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.text,
      fontSize: 12,
    },
    labelStyle: { color: colors.text, fontWeight: 600 },
    itemStyle: { color: colors.muted },
  }
}

export function useChartTheme(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(resolveColors)

  useEffect(() => {
    const root = document.documentElement

    const observer = new MutationObserver(() => setColors(resolveColors()))
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })

    setColors(resolveColors())

    return () => observer.disconnect()
  }, [])

  return colors
}
