import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import ChartCard from '../shared/ChartCard'
import { getChartColors } from '../shared/chartTheme'
import { useChartResize } from '../shared/useChartResize'
import { useAssignmentActivity } from '../hooks/useAssignmentActivity'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toFromDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatMonthLabel(yyyymm: string): string {
  const [, m] = yyyymm.split('-')
  return MONTH_NAMES[parseInt(m, 10) - 1]
}

function buildYearOptions(): number[] {
  const current = new Date().getFullYear()
  return [current, current - 1, current - 2, current - 3]
}

export default function AssignmentActivityChart() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear())

  const fromDate = toFromDate(selectedYear, selectedMonth)
  const { data, loading, error } = useAssignmentActivity(fromDate)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<ECharts | null>(null)
  useChartResize(chartRef, containerRef)

  useEffect(() => {
    if (!containerRef.current || loading || error) return

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'svg' })
    }

    const colors = getChartColors()
    const allZero = data.every((d) => d.count === 0)
    const months  = data.map((d) => formatMonthLabel(d.month))
    const counts  = data.map((d) => d.count)
    const maxVal  = Math.max(...counts, 1)

    chartRef.current.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: colors.surface,
          borderColor: colors.border,
          textStyle: { color: colors.textPrimary, fontSize: 12 },
          formatter: (params: { name: string; value: number }[]) => {
            const p = params[0]
            return `${p.name}<br/><b>${p.value}</b> assignment${p.value !== 1 ? 's' : ''}`
          },
        },
        graphic: allZero
          ? [{
              type: 'text',
              left: 'center',
              top: 'middle',
              style: {
                text: 'No activity recorded in this period',
                fill: colors.textSubtle,
                fontSize: 13,
              },
            }]
          : [],
        grid: { left: '3%', right: '3%', top: '14%', bottom: '12%', containLabel: true },
        xAxis: {
          type: 'category',
          data: months,
          axisLabel: { color: colors.textSubtle, fontSize: 10, interval: 0 },
          axisLine: { lineStyle: { color: colors.border } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: allZero ? 5 : undefined,
          minInterval: 1,
          axisLabel: { color: colors.textSubtle, fontSize: 11 },
          splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
          axisLine: { show: false },
        },
        series: [
          {
            type: 'bar',
            data: counts,
            itemStyle: {
              color: allZero ? colors.border : colors.accent,
              borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 42,
            emphasis: {
              itemStyle: { color: allZero ? colors.border : colors.accent, opacity: 0.8 },
            },
            label: {
              show: !allZero,
              position: 'top',
              formatter: (p: { value: number }) => (p.value > 0 ? String(p.value) : ''),
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: 'bold',
              distance: 4,
            },
            markLine: !allZero && maxVal > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: colors.accent, type: 'dashed', opacity: 0.35, width: 1 },
                  data: [{ type: 'average', name: 'Avg' }],
                  label: {
                    position: 'end',
                    formatter: (p: { value: number }) => `avg ${Math.round(p.value)}`,
                    color: colors.textSubtle,
                    fontSize: 10,
                  },
                }
              : undefined,
          },
        ],
      },
      true, // notMerge — fully replace on every render so stale data never persists
    )
  }, [data, loading, error])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  const totalInPeriod = data.reduce((s, d) => s + d.count, 0)

  const picker = (
    <div className="flex items-center gap-1.5">
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] transition cursor-pointer"
        aria-label="Select month"
      >
        {MONTH_FULL.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>

      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] transition cursor-pointer"
        aria-label="Select year"
      >
        {buildYearOptions().map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )

  const subtitle = !loading && !error && data.length > 0
    ? `12 months from ${MONTH_FULL[selectedMonth - 1]} ${selectedYear} · ${totalInPeriod} total`
    : `12 months from ${MONTH_FULL[selectedMonth - 1]} ${selectedYear}`

  return (
    <ChartCard
      title="Assignment Activity"
      subtitle={subtitle}
      loading={loading}
      error={error}
      empty={false}
      minHeight="280px"
      headerRight={picker}
    >
      <div ref={containerRef} style={{ width: '100%', height: '280px' }} />
    </ChartCard>
  )
}
