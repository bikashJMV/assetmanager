import { useMemo } from 'react'

import { useInStockAssetsQuery } from '../../../queries/assets'
import { getUserFacingMessage } from '../../../utils/errors'
import ChartPanel from './ChartPanel'
import InStockByLocationBar from './InStockByLocationBar'
import { ANALYTICS_LABELS } from './analyticsLabels'
import { groupInStockByLocation } from './analyticsTransforms'

const L = ANALYTICS_LABELS.inStockByLocation
const PANEL_HEIGHT = 320

/** Owns the in-stock read so the chart itself stays a pure view. Renders its own
 * loading / error / empty states — the rest of the report is unaffected either way. */
export default function InStockByLocationPanel() {
  const query = useInStockAssetsQuery()
  const groups = useMemo(() => groupInStockByLocation(query.data ?? []), [query.data])

  if (query.isPending) {
    return (
      <ChartPanel title={L.title} subtitle={L.subtitle} isEmpty={false} emptyMessage={L.empty} height={PANEL_HEIGHT}>
        <div className="h-full animate-pulse rounded-lg bg-[var(--surface-2)]" role="status" aria-busy="true">
          <span className="sr-only">{L.title}</span>
        </div>
      </ChartPanel>
    )
  }

  if (query.isError) {
    return (
      <ChartPanel
        title={L.title}
        subtitle={L.subtitle}
        isEmpty
        emptyMessage={getUserFacingMessage(query.error, 'Unable to load in-stock assets right now.')}
        height={PANEL_HEIGHT}
      >
        {null}
      </ChartPanel>
    )
  }

  return <InStockByLocationBar data={groups} height={PANEL_HEIGHT} />
}
