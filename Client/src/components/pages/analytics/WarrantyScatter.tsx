import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import type { AnalyticsWarrantyPoint } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { linearTrend } from './analyticsTransforms'
import { tooltipStyle, useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.warranty

function trendEndpoints(
  points: AnalyticsWarrantyPoint[],
): AnalyticsWarrantyPoint[] {
  const trend = linearTrend(points)
  if (!trend) return []

  const xs = points.map((p) => p.ageDays)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)

  return [minX, maxX].map((x) => ({
    ageDays: x,
    warrantyDays: Math.max(0, Math.round(trend.slope * x + trend.intercept)),
  }))
}

export default function WarrantyScatter({
  data,
}: {
  data: AnalyticsWarrantyPoint[]
}) {
  const colors = useChartTheme()
  const trend = trendEndpoints(data)

  return (
    <ChartPanel
      title={L.title}
      subtitle={L.subtitle}
      isEmpty={data.length === 0}
      emptyMessage={L.empty}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey="ageDays"
            name={L.xAxis}
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
            label={{ value: L.xAxis, position: 'insideBottom', offset: -8, fill: colors.muted, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="warrantyDays"
            name={L.yAxis}
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip {...tooltipStyle(colors)} cursor={{ strokeDasharray: '3 3', stroke: colors.grid }} />
          <Scatter name={L.points} data={data} fill={colors.series[0]} fillOpacity={0.7} />
          {trend.length === 2 ? (
            <Scatter
              name={L.trend}
              data={trend}
              line={{ stroke: colors.series[7], strokeWidth: 2 }}
              shape={() => <g />}
              legendType="none"
            />
          ) : null}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
