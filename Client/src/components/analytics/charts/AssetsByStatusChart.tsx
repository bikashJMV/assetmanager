import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import ChartCard from '../shared/ChartCard'
import { getChartColors, STATUS_HEX } from '../shared/chartTheme'
import type { OverviewAnalysisMetric } from '../../../api'

type Props = {
  data: OverviewAnalysisMetric[]
  loading: boolean
  error?: string
}

const LABEL_BREAKPOINT = 380

function statusLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildOption(data: OverviewAnalysisMetric[], wide: boolean) {
  const colors = getChartColors()

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${statusLabel(p.name)}: <b>${p.value}</b> (${p.percent}%)`,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.textPrimary, fontSize: 12 },
    },
    ...(wide
      ? {}
      : {
          legend: {
            bottom: 0,
            type: 'scroll',
            formatter: (name: string) => statusLabel(name),
            textStyle: { color: colors.textMuted, fontSize: 11 },
            pageTextStyle: { color: colors.textMuted },
            pageIconColor: colors.accent,
            pageIconInactiveColor: colors.border,
          },
        }),
    series: [
      {
        type: 'pie',
        radius: wide ? ['36%', '58%'] : ['38%', '60%'],
        center: wide ? ['50%', '50%'] : ['50%', '44%'],
        data: data.map((item) => ({
          name: item.label,
          value: item.count,
          itemStyle: {
            color: STATUS_HEX[item.label.toLowerCase()] ?? colors.palette[0],
          },
        })),
        avoidLabelOverlap: true,
        label: wide
          ? {
              show: true,
              position: 'outside',
              formatter: (p: { name: string; value: number; percent: number }) =>
                `{name|${statusLabel(p.name)}}\n{val|${p.value}  ${p.percent}%}`,
              rich: {
                name: { fontSize: 11, color: colors.textPrimary, fontWeight: 'bold', lineHeight: 16 },
                val:  { fontSize: 10, color: colors.textMuted,    lineHeight: 15 },
              },
              distanceToLabelLine: 6,
            }
          : { show: false },
        labelLine: wide
          ? {
              show: true,
              length: 12,
              length2: 16,
              smooth: 0.3,
              lineStyle: { color: colors.border, width: 1.5 },
            }
          : { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.3)', scale: true },
          label: wide
            ? { fontSize: 12, fontWeight: 'bold' }
            : {
                show: true,
                fontSize: 12,
                fontWeight: 'bold',
                color: colors.textPrimary,
                formatter: (p: { name: string }) => statusLabel(p.name),
              },
        },
      },
    ],
  }
}

export default function AssetsByStatusChart({ data, loading, error }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  const applyOption = () => {
    if (!containerRef.current || !chartRef.current) return
    const wide = containerRef.current.offsetWidth >= LABEL_BREAKPOINT
    chartRef.current.setOption(buildOption(data, wide), true)
  }

  useEffect(() => {
    if (!containerRef.current || loading || error || data.length === 0) return

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'svg' })
    }

    applyOption()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading, error])

  // Resize observer — re-apply option so label mode switches on breakpoint cross
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize()
      applyOption()
    })
    ro.observe(el)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return (
    <ChartCard
      title="Assets by Status"
      subtitle="Current inventory status distribution"
      loading={loading}
      error={error}
      empty={!loading && !error && data.length === 0}
      emptyMessage="No status data available."
      minHeight="320px"
    >
      <div ref={containerRef} style={{ width: '100%', height: '320px' }} />
    </ChartCard>
  )
}
