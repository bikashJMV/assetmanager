import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSetBreadcrumbOverride } from '../../hooks/useBreadcrumbOverride'
import AnimatedNavIcon from '../common/AnimatedNavIcon'
import Error from '../common/Error'
import Loader from '../common/Loader'
import PageHeaderActions from '../common/PageHeaderActions'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import {
  getSessionEmployee,
  hasActiveAdminAccess,
  getEmployeeAssetPortfolio,
  type EmployeeAssetPortfolio,
} from '../../api'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDateTime, formatDisplay } from '../../utils/formatDisplay'

function formatRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'it_ops') return 'IT Ops'
  if (normalized === 'admin') return 'Admin'
  return 'Employee'
}

function statusBadgeClass(isActive: boolean): string {
  return isActive
    ? 'border-emerald-500/40 bg-emerald-500/10 text-primary'
    : 'border-red-500/40 bg-red-500/10 text-primary'
}

function statusDotClass(isActive: boolean): string {
  return isActive ? 'bg-emerald-500' : 'bg-red-500'
}

export default function EmployeeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const setBreadcrumb = useSetBreadcrumbOverride()
  const [detail, setDetail] = useState<EmployeeAssetPortfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!detail) return
    const { name, employee_code, is_active } = detail.employee
    const status = is_active ? 'Active' : 'Inactive'
    setBreadcrumb(employee_code ? `${name} (${employee_code} / ${status})` : name)
  }, [detail, setBreadcrumb])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!id) {
        if (mounted) {
          setError('Employee not found.')
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setError('')
        setErrorDebug(undefined)
        const [sessionEmployee, canViewAllEmployees] = await Promise.all([
          getSessionEmployee(),
          hasActiveAdminAccess(),
        ])
        if (!mounted) return

        const canViewRequestedEmployee = canViewAllEmployees || sessionEmployee?.id === id
        if (!canViewRequestedEmployee) {
          setDetail(null)
          setError('You do not have permission to view this employee record.')
          return
        }

        const data = await getEmployeeAssetPortfolio(id)
        if (!mounted) return
        setDetail(data)
      } catch (err) {
        if (!mounted) return
        logDevError('employeeDetail.fetch', err)
        setError(getUserFacingMessage(err, 'Unable to load employee details right now.'))
        setErrorDebug(getErrorDebugDetail(err))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [id])

  if (loading && !detail) {
    return (
      <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
        <Loader embedded />
      </main>
    )
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
        <PageHeaderActions
          title="Employee Detail"
          actions={[
            {
              id: 'back-to-employees',
              label: 'Back to Employees',
              icon: 'users' as const,
              onClick: () => navigate('/employee'),
            },
          ]}
        />
        <Error
          title="Could not load employee"
          message={error || 'Employee not found.'}
          onRetry={() => navigate(0)}
          debugDetail={errorDebug}
          fullScreen={false}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app px-4 py-6 text-primary sm:px-6 sm:py-8">
      <PageHeaderActions
        title={detail.employee.name}
        auxiliary={
          <div className="inline-flex items-center rounded-xl border border-base bg-surface px-4 py-2 text-sm font-semibold text-primary">
            Assigned Total: {detail.totalAssignedAssets}
          </div>
        }
        actions={[
          {
            id: 'back-to-employees',
            label: 'Back to Employees',
            icon: 'users' as const,
            onClick: () => navigate('/employee'),
          },
        ]}
      />

      {error ? (
        <div className="mb-4">
          <Error
            title="Could not refresh employee detail"
            message={error}
            onRetry={() => navigate(0)}
            onDismiss={() => {
              setError('')
              setErrorDebug(undefined)
            }}
            debugDetail={errorDebug}
            fullScreen={false}
          />
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-base bg-surface-2 p-4">
          <SectionHeading icon="users" label="Employee Summary" />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Employee Code" value={detail.employee.employee_code} />
            <Info label="Email" value={formatDisplay(detail.employee.email)} />
            <Info label="Department" value={formatDisplay(detail.employee.department)} />
            <Info label="Role" value={formatRoleLabel(detail.employee.role)} />
          </div>
        </div>

        <div className="rounded-xl border border-base bg-surface-2 p-4">
          <SectionHeading icon="settings" label="Access Status" />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${statusBadgeClass(detail.employee.is_active)}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(detail.employee.is_active)}`} aria-hidden="true" />
              {detail.employee.is_active ? 'Active Employee' : 'Inactive Employee'}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${statusBadgeClass(detail.employee.erp_active)}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(detail.employee.erp_active)}`} aria-hidden="true" />
              {detail.employee.erp_active ? 'ERP Active' : 'ERP Inactive'}
            </span>
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
              <h2 className="text-lg font-semibold">Assigned Total</h2>
            </div>
            {detail.assets.length > 0 ? (
              <p className="mt-1 text-sm text-muted">
                Click an asset row to open the asset detail page.
              </p>
            ) : null}
          </div>
          <div className="text-sm text-subtle">
            Showing {detail.assets.length}
          </div>
        </div>

        {detail.assets.length === 0 ? (
          <div className="mt-3  px-4 py-5 text-center">
            <p className="mt-1 text-sm text-subtle">
              No assets are currently assigned to {formatDisplay(detail.employee.name)}.
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
