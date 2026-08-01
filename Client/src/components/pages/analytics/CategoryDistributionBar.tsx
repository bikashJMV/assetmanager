import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AnalyticsLabelCount } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { tooltipStyle, useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.distribution

export default function CategoryDistributionBar({
  data,
}: {
  data: AnalyticsLabelCount[]
}) {
  const colors = useChartTheme()

  return (
    <ChartPanel
      title={L.title}
      subtitle={L.subtitle}
      isEmpty={data.length === 0}
      emptyMessage={L.empty}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            allowDecimals={false}
          />
          <Tooltip {...tooltipStyle(colors)} cursor={{ fill: colors.grid, opacity: 0.3 }} />
          <Bar dataKey="count" name={L.yAxis} radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={entry.label} fill={colors.series[idx % colors.series.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
