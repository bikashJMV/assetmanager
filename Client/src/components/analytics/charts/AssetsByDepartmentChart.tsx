import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import ChartCard from '../shared/ChartCard'
import { getChartColors } from '../shared/chartTheme'

type DeptData = { department: string; count: number }

type Props = {
  data: DeptData[]
  loading: boolean
  error?: string
  activeDepartment: string | null
  onDepartmentFilter: (dept: string | null) => void
}

const LABEL_BREAKPOINT = 380

function buildOption(
  data: DeptData[],
  activeDepartment: string | null,
  wide: boolean,
) {
  const colors = getChartColors()
  const dimmed = (dept: string) => activeDepartment !== null && activeDepartment !== dept

  const seriesData = data.map((d, i) => ({
    name: d.department,
    value: d.count,
    itemStyle: {
      color: colors.palette[i % colors.palette.length],
      opacity: dimmed(d.department) ? 0.3 : 1,
    },
    label: { opacity: dimmed(d.department) ? 0.3 : 1 },
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} assets ({d}%)',
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
        data: seriesData,
        avoidLabelOverlap: true,
        label: wide
          ? {
              show: true,
              position: 'outside',
              formatter: (p: { name: string; value: number; percent: number }) =>
                `{name|${p.name}}\n{val|${p.value}  ${p.percent}%}`,
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
            : { show: true, fontSize: 12, fontWeight: 'bold', color: colors.textPrimary },
        },
      },
    ],
  }
}

export default function AssetsByDepartmentChart({
  data,
  loading,
  error,
  activeDepartment,
  onDepartmentFilter,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  // Apply (or re-apply) options based on current container width
  const applyOption = () => {
    if (!containerRef.current || !chartRef.current) return
    const wide = containerRef.current.offsetWidth >= LABEL_BREAKPOINT
    chartRef.current.setOption(buildOption(data, activeDepartment, wide), true)
  }

  useEffect(() => {
    if (!containerRef.current || loading || error || data.length === 0) return

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'svg' })
    }

    applyOption()

    chartRef.current.off('click')
    chartRef.current.on('click', (params) => {
      const clicked = params.name as string
      onDepartmentFilter(activeDepartment === clicked ? null : clicked)
    })

    return () => {
      chartRef.current?.off('click')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading, error, activeDepartment, onDepartmentFilter])

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
  }, [data, activeDepartment])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return (
    <ChartCard
      title="Assets by Department"
      subtitle="Click a slice to filter the dashboard"
      loading={loading}
      error={error}
      empty={!loading && !error && data.length === 0}
      emptyMessage="No department data available."
      minHeight="320px"
      headerRight={
        activeDepartment ? (
          <button
            type="button"
            onClick={() => onDepartmentFilter(null)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] text-[var(--muted)] hover:text-[var(--text)] transition"
          >
            {activeDepartment} ✕
          </button>
        ) : null
      }
    >
      <div ref={containerRef} style={{ width: '100%', height: '320px' }} />
    </ChartCard>
  )
}
