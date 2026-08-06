import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AnalyticsYearCount } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { tooltipStyle, useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.yearly

export default function YearlyAcquisitionBar({
  data,
}: {
  data: AnalyticsYearCount[]
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
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="year"
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            width={48}
          />
          <Tooltip {...tooltipStyle(colors)} cursor={{ fill: colors.grid, opacity: 0.3 }} />
          <Bar dataKey="count" name={L.xAxis} fill={colors.series[1]} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="count" position="right" fill={colors.text} fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
