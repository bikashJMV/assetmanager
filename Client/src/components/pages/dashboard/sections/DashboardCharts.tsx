import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatEnumLabel } from '../../../../utils/formatDisplay'
import ChartPanel from '../../analytics/ChartPanel'
import { tooltipStyle, useChartTheme } from '../../analytics/chartTheme'
import { CHART_LABELS, DASHBOARD_SECTIONS } from '../dashboardCharts.labels'
import { useDashboardChartColors } from '../dashboardChartColors'
import type { DashboardOverview } from '../useDashboardOverview'
import SectionShell from '../ui/SectionShell'
import { SectionError } from '../ui/SectionState'

const CHART_HEIGHT = 260

function CategoryBars({ overview }: { overview: DashboardOverview }) {
  const colors = useChartTheme()
  const brand = useDashboardChartColors()
  // One measure, one hue: darkest bar is the largest category.
  const data = overview.categoryMix.slice(0, brand.ramp.length)

  return (
    <ChartPanel
      title={CHART_LABELS.category.title}
      subtitle={CHART_LABELS.category.subtitle}
      isEmpty={data.length === 0}
      emptyMessage={CHART_LABELS.category.empty}
      height={CHART_HEIGHT}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
          <XAxis type="number" tick={{ fill: colors.muted, fontSize: 11 }} stroke={colors.border} />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fill: colors.muted, fontSize: 11 }}
            stroke={colors.border}
          />
          <Tooltip cursor={{ fill: colors.grid, opacity: 0.3 }} {...tooltipStyle(colors)} />
          <Bar dataKey="count" name={CHART_LABELS.category.seriesName} radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={brand.ramp[index % brand.ramp.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

function StatusDonut({ overview }: { overview: DashboardOverview }) {
  const colors = useChartTheme()
  const brand = useDashboardChartColors()
  // Slices reuse the status tokens the badges use, so a colour means the same
  // thing here as it does in the asset list.
  const data = overview.statusMix.map((item) => ({
    ...item,
    status: item.label,
    label: formatEnumLabel(item.label),
  }))

  return (
    <ChartPanel
      title={CHART_LABELS.status.title}
      subtitle={CHART_LABELS.status.subtitle}
      isEmpty={data.length === 0}
      emptyMessage={CHART_LABELS.status.empty}
      height={CHART_HEIGHT}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            label={{ fill: colors.muted, fontSize: 11 }}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={brand.statusColor(entry.status)} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11, color: colors.muted }} />
          <Tooltip {...tooltipStyle(colors)} />
        </PieChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

function AssignmentTrend({ overview }: { overview: DashboardOverview }) {
  const colors = useChartTheme()
  const brand = useDashboardChartColors()
  const data = overview.assignmentTrend

  return (
    <ChartPanel
      title={CHART_LABELS.trend.title}
      subtitle={CHART_LABELS.trend.subtitle}
      isEmpty={data.length === 0}
      emptyMessage={CHART_LABELS.trend.empty}
      height={CHART_HEIGHT}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: colors.muted, fontSize: 11 }} stroke={colors.border} />
          <YAxis allowDecimals={false} tick={{ fill: colors.muted, fontSize: 11 }} stroke={colors.border} />
          <Tooltip {...tooltipStyle(colors)} />
          <Line
            type="monotone"
            dataKey="count"
            name={CHART_LABELS.trend.seriesName}
            stroke={brand.accent}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

export default function DashboardCharts({ overview }: { overview: DashboardOverview }) {
  return (
    <SectionShell
      title={DASHBOARD_SECTIONS.analytics.title}
      subtitle={DASHBOARD_SECTIONS.analytics.subtitle}
    >
      {overview.hasChartsError ? (
        <SectionError message={CHART_LABELS.error} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <CategoryBars overview={overview} />
          <StatusDonut overview={overview} />
          <AssignmentTrend overview={overview} />
        </div>
      )}
    </SectionShell>
  )
}
