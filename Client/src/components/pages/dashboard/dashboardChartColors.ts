import { useEffect, useState } from 'react'

import { getInventoryStatusTone } from '../../../utils/formatDisplay'

/**
 * Restrained chart colours for the dashboard.
 *
 * The categorical `--chart-1..8` palette is for charts whose series have no
 * inherent meaning. On the dashboard they do: category bars are one measure, so
 * they get a single-hue brand ramp, and status slices reuse the same status
 * tokens the badges elsewhere in the app already use.
 *
 * Recharts needs concrete colour strings, and our tokens are nested
 * `hsl(var(--x))` chains, so each value is flattened through a probe element
 * exactly as `analytics/chartTheme.ts` does.
 */

export type DashboardChartColors = {
  /** Single-hue brand ramp, darkest first. */
  ramp: string[]
  accent: string
  statusColor: (status: string) => string
}

const RAMP_STEPS = 6

const FALLBACK: DashboardChartColors = {
  ramp: ['#0b3d91', '#1450b4', '#1f63d6', '#3d7ee4', '#6b9def', '#9dbdf6'],
  accent: '#2a78d6',
  statusColor: () => '#2a78d6',
}

function flattenWith(probe: HTMLElement, expr: string): string {
  probe.style.color = ''
  probe.style.color = expr
  return getComputedStyle(probe).color
}

function resolve(): DashboardChartColors {
  if (typeof document === 'undefined' || !document.body) return FALLBACK

  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)

  try {
    // Walk lightness across the brand hue so bars stay one colour family.
    const ramp = Array.from({ length: RAMP_STEPS }, (_, index) => {
      const lightness = 34 + index * 9
      return flattenWith(probe, `hsl(var(--hue-brand) 78% ${lightness}%)`)
    })

    const accent = flattenWith(probe, 'hsl(var(--primary))')

    const statusCache = new Map<string, string>()
    const statusColor = (status: string): string => {
      const cached = statusCache.get(status)
      if (cached) return cached
      const resolved = flattenWith(probe, getInventoryStatusTone(status).dotColor)
      statusCache.set(status, resolved)
      return resolved
    }

    // Warm the cache while the probe is still attached; the closure outlives it.
    for (const status of ['assigned', 'in_stock', 'in_repair', 'retired', 'lost', 'disposed']) {
      statusColor(status)
    }

    return {
      ramp,
      accent,
      statusColor: (status: string) =>
        statusCache.get(status.trim().toLowerCase()) ?? accent,
    }
  } finally {
    probe.remove()
  }
}

export function useDashboardChartColors(): DashboardChartColors {
  const [colors, setColors] = useState<DashboardChartColors>(resolve)

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(resolve()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  return colors
}
