import { Link } from 'react-router-dom'
import type { WarrantyNotification } from '../../api'
import { AppIcon } from '../ui'
import WarrantySeverityBadge from './WarrantySeverityBadge'
import {
  WARRANTY_SEVERITY,
  formatWarrantyAge,
  formatWarrantyDate,
  formatWarrantyHeadline,
  resolveWarrantySeverity,
} from './warrantySeverity'

type MetaEntry = { label: string; value: string }

function MetadataLine({ entries }: { entries: MetaEntry[] }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-xs)] text-foreground-muted">
      {entries.map((entry, index) => (
        <div key={entry.label} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-foreground-faint">
              ·
            </span>
          ) : null}
          <dt className="text-foreground-faint">{entry.label}</dt>
          <dd className="font-medium text-foreground-muted">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Inbox-style warranty alert row: severity rail + badge, asset identity, one-sentence
 * message, inline metadata, right-aligned action (drops below content on mobile). */
export default function WarrantyNotificationItem({ item }: { item: WarrantyNotification }) {
  const severity = resolveWarrantySeverity(item)
  const tone = WARRANTY_SEVERITY[severity].varName
  const age = formatWarrantyAge(item)

  const metadata: MetaEntry[] = [
    ...(item.category_name ? [{ label: 'Category', value: item.category_name }] : []),
    { label: 'Warranty End', value: formatWarrantyDate(item.warranty_expiry) },
    age,
    ...(item.current_employee_name ? [{ label: 'Holder', value: item.current_employee_name }] : []),
  ]

  return (
    <li>
      <article
        className="group relative grid gap-2 overflow-hidden rounded-md border border-line bg-surface py-2.5 pl-4 pr-3 transition-[background-color,border-color,box-shadow] duration-fast ease-out hover:border-line-strong hover:bg-surface-hover hover:shadow-md focus-within:border-line-strong focus-within:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3 sm:py-2 sm:pl-5"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: `hsl(var(${tone}))` }}
        />

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <WarrantySeverityBadge severity={severity} />
            <h3 className="min-w-0 truncate text-[length:var(--text-md)] font-semibold leading-tight text-foreground">
              {item.model || 'Asset'}
            </h3>
            {item.asset_tag ? (
              <span className="font-mono text-[length:var(--text-xs)] text-foreground-faint">{item.asset_tag}</span>
            ) : null}
          </div>

          <p className="text-[length:var(--text-base)] leading-snug text-foreground" title={item.message}>
            {formatWarrantyHeadline(item)}
          </p>

          <MetadataLine entries={metadata} />
        </div>

        {item.asset_tag ? (
          <Link
            to={`/assets/${encodeURIComponent(item.asset_tag)}`}
            aria-label={`View asset ${item.model || item.asset_tag}`}
            className="inline-flex min-h-[var(--touch-target)] w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[length:var(--text-sm)] font-semibold text-foreground-muted transition-[background-color,color,border-color] duration-fast ease-out hover:border-brand hover:bg-surface-hover hover:text-brand focus-visible:shadow-focus focus-visible:outline-none sm:h-8 sm:min-h-0 sm:w-auto"
          >
            <AppIcon name="view" size={14} />
            View Asset
          </Link>
        ) : (
          <span className="text-[length:var(--text-xs)] text-foreground-faint sm:pt-1.5">Tag unavailable</span>
        )}
      </article>
    </li>
  )
}