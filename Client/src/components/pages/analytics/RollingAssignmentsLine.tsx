import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AnalyticsMonthCount } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS, ROLLING_WINDOW_MONTHS } from './analyticsLabels'
import { buildAssignmentSeries } from './analyticsTransforms'
import { tooltipStyle, useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.rolling

export default function RollingAssignmentsLine({
  data,
}: {
  data: AnalyticsMonthCount[]
}) {
  const colors = useChartTheme()
  const rows = buildAssignmentSeries(data, ROLLING_WINDOW_MONTHS)

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
          />
          <Tooltip {...tooltipStyle(colors)} />
          <Legend wrapperStyle={{ fontSize: 11, color: colors.muted }} />
          <Line
            type="monotone"
            dataKey="count"
            name={L.monthly}
            stroke={colors.series[0]}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="rolling"
            name={L.rolling}
            stroke={colors.series[5]}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
