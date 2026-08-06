import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartPanel from './ChartPanel'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { useChartTheme, type ChartColors } from './chartTheme'
import type { InStockLocationGroup } from './analyticsTransforms'

const L = ANALYTICS_LABELS.inStockByLocation

/** One measure, so one hue — bar color must not vary by rank. */
const SERIES_SLOT = 0
const DIM_OPACITY = 0.35

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Recharts types its tooltip payload too loosely to narrow by assertion alone,
 * so the entry is validated field-by-field before being read as a group. */
function toGroup(payload: unknown): InStockLocationGroup | undefined {
  if (!Array.isArray(payload)) return undefined
  const first: unknown = payload[0]
  if (!isRecord(first) || !isRecord(first.payload)) return undefined
  const inner = first.payload
  if (typeof inner.key !== 'string' || typeof inner.total !== 'number') return undefined
  if (typeof inner.fullLabel !== 'string' || !Array.isArray(inner.categories)) return undefined
  // every field is checked above; the cast only re-attaches the named type
  return inner as unknown as InStockLocationGroup
}

function InStockTooltip({
  group,
  colors,
}: {
  group: InStockLocationGroup | undefined
  colors: ChartColors
}) {
  if (!group) return null

  return (
    <div
      className="max-w-[15rem] rounded-lg border p-2.5 text-xs shadow-md"
      style={{ background: colors.surface, borderColor: colors.border, color: colors.text }}
    >
      <p className="font-semibold" style={{ color: colors.text }}>{group.fullLabel}</p>
      <p className="mt-1" style={{ color: colors.muted }}>
        {L.tooltipTotal}: <span className="font-semibold" style={{ color: colors.text }}>{group.total}</span>
      </p>
      <p className="mt-1.5 uppercase tracking-wide" style={{ color: colors.muted, fontSize: 10 }}>
        {L.tooltipBreakdown}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {group.categories.map((category) => (
          <li key={category.name} className="flex justify-between gap-3" style={{ color: colors.muted }}>
            <span className="truncate">{category.name}</span>
            <span className="tabular-nums font-medium" style={{ color: colors.text }}>{category.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** In-stock counts per stock location. Clicking a bar pins its category breakdown
 * below the plot for keyboard and touch users, who get no hover tooltip. */
export default function InStockByLocationBar({ data, height }: { data: InStockLocationGroup[]; height: number }) {
  const colors = useChartTheme()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = data.find((group) => group.key === selectedKey) ?? null

  return (
    <ChartPanel title={L.title} subtitle={L.subtitle} isEmpty={data.length === 0} emptyMessage={L.empty} height={height}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18, right: 12, bottom: 4, left: 0 }}>
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
                width={36}
              />
              <Tooltip
                cursor={{ fill: colors.grid, opacity: 0.3 }}
                content={({ active, payload }) => (
                  <InStockTooltip group={active ? toGroup(payload) : undefined} colors={colors} />
                )}
              />
              <Bar
                dataKey="total"
                name={L.yAxis}
                radius={[4, 4, 0, 0]}
                maxBarSize={64}
                onClick={(entry: unknown) => {
                  const group = entry as InStockLocationGroup
                  setSelectedKey((current) => (current === group.key ? null : group.key))
                }}
                className="cursor-pointer"
              >
                <LabelList dataKey="total" position="top" fill={colors.muted} fontSize={11} />
                {data.map((group) => (
                  <Cell
                    key={group.key}
                    fill={colors.series[SERIES_SLOT]}
                    fillOpacity={selected && selected.key !== group.key ? DIM_OPACITY : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs" aria-live="polite">
          {selected ? (
            <>
              <p className="font-semibold text-[var(--text)]">{selected.fullLabel}</p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--muted)]">
                {selected.categories.map((category) => (
                  <li key={category.name}>
                    {category.name}{' '}
                    <span className="font-semibold tabular-nums text-[var(--text)]">{category.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[var(--subtle)]">{L.expandHint}</p>
          )}
        </div>
      </div>
    </ChartPanel>
  )
}
