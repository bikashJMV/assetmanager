import type { AnalyticsMatrixCell } from '../../../types/api'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { MONTH_LABELS, buildHeatmapGrid } from './analyticsTransforms'
import { useChartTheme } from './chartTheme'

const L = ANALYTICS_LABELS.heatmap

function cellColor(count: number, max: number, series: string): string {
  if (max <= 0 || count <= 0) return 'var(--surface-2)'
  const ratio = 0.15 + 0.85 * (count / max)
  return `color-mix(in srgb, ${series} ${Math.round(ratio * 100)}%, var(--surface))`
}

export default function MonthlyAcquisitionHeatmap({
  data,
}: {
  data: AnalyticsMatrixCell[]
}) {
  const colors = useChartTheme()
  const { rows, max } = buildHeatmapGrid(data)
  const series = colors.series[0]

  return (
    <ChartPanel
      title={L.title}
      subtitle={L.subtitle}
      isEmpty={rows.length === 0}
      emptyMessage={L.empty}
      height={280}
    >
      <div className="h-full overflow-x-auto">
        <table className="w-full min-w-[440px] border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr>
              <th className="w-10" />
              {MONTH_LABELS.map((m) => (
                <th key={m} className="font-medium text-[var(--muted)]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <td className="pr-1 text-right font-semibold text-[var(--text)]">
                  {row.year}
                </td>
                {row.counts.map((count, idx) => (
                  <td
                    key={idx}
                    title={`${MONTH_LABELS[idx]} ${row.year}: ${count}`}
                    className="h-7 rounded text-center text-[var(--text)]"
                    style={{ backgroundColor: cellColor(count, max, series) }}
                  >
                    {count > 0 ? count : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--muted)]">
          <span>{L.legendLow}</span>
          <span className="h-3 w-6 rounded" style={{ backgroundColor: cellColor(1, 4, series) }} />
          <span className="h-3 w-6 rounded" style={{ backgroundColor: cellColor(2, 4, series) }} />
          <span className="h-3 w-6 rounded" style={{ backgroundColor: cellColor(3, 4, series) }} />
          <span className="h-3 w-6 rounded" style={{ backgroundColor: cellColor(4, 4, series) }} />
          <span>{L.legendHigh}</span>
        </div>
      </div>
    </ChartPanel>
  )
}
