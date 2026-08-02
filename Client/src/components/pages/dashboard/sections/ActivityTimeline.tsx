import { PackagePlus, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatEnumLabel, getInventoryStatusTone } from '../../../../utils/formatDisplay'
import type { ActivityEntry } from '../dashboardAggregates'
import { ACTIVITY_LABELS, DASHBOARD_SECTIONS } from '../dashboardLabels'
import { initials, relativeTime } from '../relativeTime'
import type { DashboardOverview } from '../useDashboardOverview'
import SectionShell from '../ui/SectionShell'
import { SectionEmpty, SectionError, SkeletonGrid } from '../ui/SectionState'

function StatusBadge({ status }: { status: string }) {
  const tone = getInventoryStatusTone(status)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.text}`}
      style={{ backgroundColor: tone.bgColor, borderColor: tone.borderColor }}
    >
      {formatEnumLabel(status)}
    </span>
  )
}

function TimelineRow({ entry, now }: { entry: ActivityEntry; now: number }) {
  const Icon = entry.kind === 'added' ? PackagePlus : UserCheck
  const action = entry.kind === 'added' ? ACTIVITY_LABELS.added : ACTIVITY_LABELS.assigned

  return (
    <li className="relative flex gap-3 py-3 pl-8">
      <span
        className="absolute left-0 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full border border-base bg-surface text-brand"
        aria-hidden="true"
      >
        <Icon className="h-3 w-3" />
      </span>

      <span
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
        aria-hidden="true"
      >
        {initials(entry.employeeName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/assets/${encodeURIComponent(entry.assetTag)}`}
            className="truncate text-sm font-medium text-primary hover:text-accent"
          >
            {entry.assetName}
          </Link>
          <span className="font-mono text-[11px] text-subtle">{entry.assetTag}</span>
          <StatusBadge status={entry.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {action}
          {entry.employeeName ? ` · ${entry.employeeName}` : ''}
          {entry.department ? ` · ${entry.department}` : ''}
        </p>
      </div>

      <time className="shrink-0 text-[11px] text-subtle" dateTime={entry.at}>
        {relativeTime(entry.at, now)}
      </time>
    </li>
  )
}

export default function ActivityTimeline({ overview }: { overview: DashboardOverview }) {
  const { activity, isSweepLoading, hasSweepError, now } = overview

  return (
    <SectionShell
      title={DASHBOARD_SECTIONS.activity.title}
      subtitle={DASHBOARD_SECTIONS.activity.subtitle}
    >
      {hasSweepError ? <SectionError message={ACTIVITY_LABELS.error} /> : null}

      {!hasSweepError && isSweepLoading ? (
        <SkeletonGrid count={5} height="h-14" className="space-y-2" />
      ) : null}

      {!hasSweepError && !isSweepLoading && activity.length === 0 ? (
        <SectionEmpty message={ACTIVITY_LABELS.empty} />
      ) : null}

      {!hasSweepError && !isSweepLoading && activity.length > 0 ? (
        <div className="rounded-lg border border-base bg-surface px-4">
          <ul className="relative divide-y divide-[var(--border)]">
            <span
              className="absolute bottom-4 left-3 top-4 w-px bg-[var(--border)]"
              aria-hidden="true"
            />
            {activity.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
          <p className="border-t border-base py-3 text-[11px] text-subtle">
            {ACTIVITY_LABELS.scopeNote}
          </p>
        </div>
      ) : null}
    </SectionShell>
  )
}
