import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AnalyticsMonthPoint } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { monthLabel } from './analyticsTransforms'
import { tooltipStyle, useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.cumulative

export default function CumulativeAssetsLine({
  data,
}: {
  data: AnalyticsMonthPoint[]
}) {
  const colors = useChartTheme()
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }))

  return (
    <ChartPanel
      title={L.title}
      subtitle={L.subtitle}
      isEmpty={rows.length === 0}
      emptyMessage={L.empty}
      className="col-span-full"
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            allowDecimals={false}
            label={{
              value: L.yAxis,
              angle: -90,
              position: 'insideLeft',
              fill: colors.muted,
              fontSize: 11,
            }}
          />
          <Tooltip {...tooltipStyle(colors)} />
          <Line
            type="monotone"
            dataKey="total"
            name={L.series}
            stroke={colors.series[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
