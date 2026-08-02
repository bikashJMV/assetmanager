import { ArrowUpRight, PackagePlus, QrCode, ScanLine, Undo2, Upload, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { DASHBOARD_SECTIONS, QUICK_ACTION_LABELS } from '../dashboardLabels'
import SectionShell from '../ui/SectionShell'

type QuickAction = {
  icon: LucideIcon
  title: string
  hint: string
  to: string
  privileged: boolean
}

// Every destination is an existing route. Assign and return are per-asset
// actions with no route of their own, so they open the list you pick from.
const ACTIONS: readonly QuickAction[] = [
  {
    icon: PackagePlus,
    title: QUICK_ACTION_LABELS.addAsset,
    hint: QUICK_ACTION_LABELS.addAssetHint,
    to: '/assets/new',
    privileged: true,
  },
  {
    icon: UserPlus,
    title: QUICK_ACTION_LABELS.assignAsset,
    hint: QUICK_ACTION_LABELS.assignAssetHint,
    to: '/assets',
    privileged: true,
  },
  {
    icon: Undo2,
    title: QUICK_ACTION_LABELS.returnAsset,
    hint: QUICK_ACTION_LABELS.returnAssetHint,
    to: '/assets',
    privileged: true,
  },
  {
    icon: QrCode,
    title: QUICK_ACTION_LABELS.generateQr,
    hint: QUICK_ACTION_LABELS.generateQrHint,
    to: '/qr-generate/batches',
    privileged: true,
  },
  {
    icon: Upload,
    title: QUICK_ACTION_LABELS.bulkImport,
    hint: QUICK_ACTION_LABELS.bulkImportHint,
    to: '/assets/new',
    privileged: true,
  },
  {
    icon: ScanLine,
    title: QUICK_ACTION_LABELS.scanQr,
    hint: QUICK_ACTION_LABELS.scanQrHint,
    to: '/assets/scan',
    privileged: false,
  },
]

export default function QuickActions({ isPrivileged }: { isPrivileged: boolean }) {
  const visible = ACTIONS.filter((action) => !action.privileged || isPrivileged)
  if (visible.length === 0) return null

  return (
    <SectionShell
      title={DASHBOARD_SECTIONS.actions.title}
      subtitle={DASHBOARD_SECTIONS.actions.subtitle}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {visible.map((action) => (
          <Link
            key={action.title}
            to={action.to}
            className="group flex flex-col rounded-lg border border-base bg-surface p-4 transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:shadow-focus"
          >
            <span className="flex items-center justify-between">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                <action.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <ArrowUpRight
                className="h-4 w-4 text-subtle transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="mt-3 text-sm font-medium text-primary">{action.title}</span>
            <span className="mt-0.5 text-xs leading-5 text-subtle">{action.hint}</span>
          </Link>
        ))}
      </div>
    </SectionShell>
  )
}
