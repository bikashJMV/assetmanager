import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSetBreadcrumbOverride } from '../../hooks/useBreadcrumbOverride'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import Error from '../common/Error'
import Loader from '../common/Loader'
import PageHeaderActions from '../common/PageHeaderActions'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import { useEmployeePortfolioQuery } from '../../queries/employees'
import { useAdminAccessQuery } from '../../queries/authz'
import { useSessionEmployeeQuery } from '../../queries/employees'
import { getUserFacingMessage } from '../../utils/errors'
import { formatDateTime, formatDisplay, formatRoleLabel } from '../../utils/formatDisplay'

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const setBreadcrumb = useSetBreadcrumbOverride()

  const sessionQuery = useSessionEmployeeQuery()
  const adminQuery = useAdminAccessQuery()

  const authLoading = sessionQuery.isPending || adminQuery.isPending
  const sessionEmployeeId = sessionQuery.data?.id ?? null
  const sessionEmployeeRole = sessionQuery.data?.role ?? null
  const viewerHasAdminAccess = adminQuery.data?.allowed ?? false

  // Access gate: employee can only view own profile
  const canView = viewerHasAdminAccess || sessionEmployeeId === id

  const portfolioQuery = useEmployeePortfolioQuery(
    id && canView ? id : '',
  )

  const detail = portfolioQuery.data ?? null
  const dataLoading = canView && portfolioQuery.isPending
  const loading = authLoading || dataLoading

  const error =
    portfolioQuery.error
      ? getUserFacingMessage(portfolioQuery.error, 'Unable to load employee details right now.')
      : !authLoading && id && !canView
        ? 'You do not have permission to view this employee record.'
        : ''

  useEffect(() => {
    if (!detail) return
    const { name, employee_id } = detail.employee
    setBreadcrumb(employee_id ? `${name} (${employee_id})` : name)
  }, [detail, setBreadcrumb])

  const isViewingOwnProfile = sessionEmployeeId === id && sessionEmployeeRole === 'employee'

  if (loading && !detail) {
    return (
      <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
        <Loader embedded />
      </main>
    )
  }

  if (!detail || error) {
    return (
      <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
        <PageHeaderActions
          title="Employee Detail"
          actions={
            isViewingOwnProfile
              ? []
              : [
                  {
                    id: 'back-to-employees',
                    label: 'Back to Employees',
                    icon: 'users' as const,
                    onClick: () => navigate('/employee'),
                  },
                ]
          }
        />
        <Error
          title="Could not load employee"
          message={error || 'Employee not found.'}
          onRetry={() => void portfolioQuery.refetch()}
          fullScreen={false}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
      <PageHeaderActions
        title={isViewingOwnProfile ? 'My Assigned Assets' : detail.employee.name}
        auxiliary={
          <div className="inline-flex items-center rounded-xl border border-base bg-surface px-4 py-2 text-sm font-semibold text-primary">
            {isViewingOwnProfile ? 'Total Assigned' : 'Assigned Total'}: {detail.total_assigned_assets}
          </div>
        }
        actions={
          isViewingOwnProfile
            ? []
            : [
                {
                  id: 'back-to-employees',
                  label: 'Back to Employees',
                  icon: 'users' as const,
                  onClick: () => navigate('/employee'),
                },
              ]
        }
      />

      <section className="w-full">
        <div className="rounded-xl border border-base bg-surface-2 p-4">
          <SectionHeading icon="users" label="Employee Summary" />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Employee ID" value={detail.employee.employee_id} />
            <Info label="Email" value={formatDisplay(detail.employee.email)} />
            <Info label="Department" value={formatDisplay(detail.employee.department)} />
            <Info label="Role" value={formatRoleLabel(detail.employee.role)} />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-base bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center text-accent">
                <AnimatedNavIcon name="boxes" className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold">
                {isViewingOwnProfile ? 'Assets Assigned to You' : 'Assigned Assets'}
              </h2>
            </div>
            {detail.assets.length > 0 ? (
              <p className="mt-1 text-sm text-muted">
                {isViewingOwnProfile
                  ? 'Click any row to view full details for that asset.'
                  : 'Click an asset row to open the asset detail page.'}
              </p>
            ) : null}
          </div>
          <div className="text-sm text-subtle">Showing {detail.assets.length}</div>
        </div>

        {detail.assets.length === 0 ? (
          <div className="mt-3 px-4 py-5 text-center">
            <p className="mt-1 text-sm text-subtle">
              {isViewingOwnProfile
                ? 'No assets are currently assigned to you.'
                : `No assets are currently assigned to ${formatDisplay(detail.employee.name)}.`}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-base">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-surface text-subtle text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Asset Tag</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Serial Number</th>
                  <th className="px-4 py-3">Manufacturer</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Assigned Date</th>
                  <th className="px-4 py-3">Assigned By</th>
                  <th className="px-4 py-3">Inventory Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="cursor-pointer border-t border-base transition hover:bg-[color:var(--accent-soft)]/10"
                    onClick={() => {
                      if (asset.asset_tag) navigate(`/assets/${asset.asset_tag}`)
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-accent">{formatDisplay(asset.asset_tag)}</td>
                    <td className="px-4 py-3 text-primary">{formatDisplay(asset.category_name)}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(asset.serial_number)}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(asset.manufacturer_name)}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(asset.model)}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(asset.assigned_at)}</td>
                    <td className="px-4 py-3 text-muted">{formatDisplay(asset.assigned_by_name)}</td>
                    <td className="px-4 py-3">
                      <InventoryStatusBadge status={asset.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 text-sm font-medium text-primary">{value}</p>
    </div>
  )
}

function SectionHeading({ icon, label }: { icon: 'users' | 'settings'; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-4 w-4 items-center justify-center text-accent">
        <AnimatedNavIcon name={icon} className="h-4 w-4" />
      </span>
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</p>
    </div>
  )
}
