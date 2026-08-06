import AnimatedNavIcon from '../common/AnimatedNavIcon'
import { activeBadgeStyle, activeDotColor } from '../../utils/formatDisplay'

const LABEL_CLASS =
  'text-[length:var(--text-xs)] uppercase tracking-[0.12em] text-foreground-faint'

function SummaryCell({
  label,
  value,
  truncate = false,
}: {
  label: string
  value: string
  /** long values (email) shrink + ellipsize instead of forcing the row wider */
  truncate?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 py-2 sm:px-4 sm:py-0 ${truncate ? 'min-w-0 flex-1' : 'shrink-0'}`}>
      <p className={LABEL_CLASS}>{label}</p>
      <p
        className={`text-[length:var(--text-sm)] font-medium text-foreground ${truncate ? 'truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Single-row employee facts strip: identity + role + access status on one line.
 * Hierarchy comes from typography and dividers, not nested bordered boxes.
 */
export default function EmployeeSummaryStrip({
  employeeId,
  email,
  department,
  role,
  assignedTotal,
  isActive,
}: {
  employeeId: string
  email: string
  department: string
  role: string
  assignedTotal: number
  isActive: boolean
}) {
  const statusLabel = isActive ? 'Active Employee' : 'Inactive Employee'

  return (
    <section aria-label="Employee summary" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center text-brand">
          <AnimatedNavIcon name="users" className="h-4 w-4" />
        </span>
        <h2 className={`${LABEL_CLASS} font-semibold`}>Employee Summary</h2>
      </div>

      <div className="mt-3 flex flex-col divide-y divide-line sm:flex-row sm:flex-wrap sm:items-center sm:divide-x sm:divide-y-0 sm:[&>*:first-child]:pl-0">
        <SummaryCell label="Employee ID" value={employeeId} />
        <SummaryCell label="Email" value={email} truncate />
        <SummaryCell label="Department" value={department} />
        <SummaryCell label="Role" value={role} />
        <SummaryCell label="Assigned Total" value={String(assignedTotal)} />
        <div className="shrink-0 py-2 sm:py-0 sm:pl-4">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[length:var(--text-sm)] font-medium"
            style={activeBadgeStyle(isActive)}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: activeDotColor(isActive) }}
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        </div>
      </div>
    </section>
  )
}
