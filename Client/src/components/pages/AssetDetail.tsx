import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  assignAsset,
  getAssetDetail,
  hasActiveAdminAccess,
  returnAsset,
  softDeleteAssetById,
  type AssetAssignmentRecord,
  type AssetDetailRecord,
  type EmployeeRecord,
} from '../../api'
import AssetForm from '../form/AssetForm'
import Error from '../common/Error'
import Loader from '../common/Loader'
import ConfirmDialog from '../common/ConfirmDialog'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDateTime, formatDisplay, formatEnumLabel } from '../../utils/formatDisplay'
import AssetChangeHistory from '../asset/AssetChangeHistory'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import { useToast } from '../common/ToastProvider'
import EmployeeAssignLookup from '../common/EmployeeAssignLookup'

// function formatInventryStatus=(status:string)=>{
//   if(status.toLowerCase()==='in_stock'){
//     return 'In Stock'
//   } else if(status.toLowerCase()==='assigned'){
//     return 'Assigned'
//   }
//   else if(status.toLowerCase()==='lost'){
//     return 'Lost/Can\'t Locate'
//   }
  
//   else if(status.toLowerCase()==='retired'){
//     return 'Retired/Decommissioned'
//   }
//   else if(status.toLowerCase()==='lost'){
//     return 'Lost/Can\'t Locate'
//   }
//   else if(status.toLowerCase()==='disposed'){
//     return 'Disposed'
//   }
  
// }

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<AssetDetailRecord | null>(null)
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [assignQuery, setAssignQuery] = useState('')
  const [selectedAssignee, setSelectedAssignee] = useState<EmployeeRecord | null>(null)
  const [assignNotes, setAssignNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const { showToast } = useToast()

  const refresh = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const data = await getAssetDetail(id)
      setDetail(data)
    } catch (err) {
      logDevError('assetDetail.fetch', err)
      setError(getUserFacingMessage(err, 'Unable to load asset details right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const allowed = await hasActiveAdminAccess()
        if (!mounted) return
        setCanManage(allowed)
      } catch (err) {
        logDevError('assetDetail.access', err)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const openAssignment = useMemo(
    () => detail?.assignments.find((entry) => entry.returned_at === null) || null,
    [detail]
  )

  const openAssignDialog = () => {
    if (!detail?.asset.asset_tag) return
    if (!canManage) {
      setError('Active admin access is required to assign assets')
      return
    }
    if (!selectedAssignee?.employee_code.trim()) {
      setError('Select an employee from the suggestions before assigning this asset')
      return
    }
    setError('')
    setErrorDebug(undefined)
    setAssignDialogOpen(true)
  }

  const closeAssignDialog = () => {
    if (actionLoading) return
    setAssignDialogOpen(false)
  }

  const handleAssign = async () => {
    if (!detail?.asset.asset_tag) return
    if (!selectedAssignee?.employee_code.trim()) return
    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const result = await assignAsset({
        asset_tag: detail.asset.asset_tag,
        employee_code: selectedAssignee.employee_code.trim(),
        notes: assignNotes.trim() || undefined,
      })
      const msg =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : 'Asset assigned successfully.'
      showToast({ message: msg, variant: 'success' })
      setAssignDialogOpen(false)
      setAssignQuery('')
      setSelectedAssignee(null)
      setAssignNotes('')
      await refresh()
    } catch (err) {
      setAssignDialogOpen(false)
      logDevError('assetDetail.assign', err)
      setError(getUserFacingMessage(err, 'Unable to assign this asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setActionLoading(false)
    }
  }

  const openReturnDialog = () => {
    if (!detail?.asset.asset_tag) return
    if (!canManage) {
      setError('Active admin access is required to return assets')
      return
    }
    if (!openAssignment) {
      setError('No open assignment is available to return.')
      return
    }
    setError('')
    setErrorDebug(undefined)
    setReturnDialogOpen(true)
  }

  const closeReturnDialog = () => {
    if (actionLoading) return
    setReturnDialogOpen(false)
  }

  const handleReturn = async () => {
    if (!detail?.asset.asset_tag) return
    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const result = await returnAsset({
        asset_tag: detail.asset.asset_tag,
        notes: assignNotes.trim() || undefined,
      })
      const msg =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : 'Asset returned successfully.'
      showToast({ message: msg, variant: 'success' })
      setReturnDialogOpen(false)
      setAssignNotes('')
      await refresh()
    } catch (err) {
      setReturnDialogOpen(false)
      logDevError('assetDetail.return', err)
      setError(getUserFacingMessage(err, 'Unable to return this asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleSoftDelete = async () => {
    if (!detail?.asset.id || !canManage) return
    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      await softDeleteAssetById(detail.asset.id)
      navigate('/recycle-bin')
    } catch (err) {
      logDevError('assetDetail.soft_delete', err)
      setError(getUserFacingMessage(err, 'Unable to delete this asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setActionLoading(false)
    }
  }

  if (error && !detail) {
    return (
      <Error
        title="Could not load asset"
        message={error}
        onRetry={() => {
          void refresh()
        }}
        debugDetail={errorDebug}
      />
    )
  }

  if (loading && !detail) {
    return <Loader />
  }

  if (!detail) {
    return <Error title="Asset not found" message="We could not find that asset." />
  }

  const { asset } = detail
  const assetTitle = [asset.manufacturer_name, asset.model]
    .map((value) => formatDisplay(value))
    .filter((value) => value !== '-')
    .join(' ') || '-'
  const selectedAssigneeLabel = formatEmployeeAssignSummary(selectedAssignee)

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        {canManage ? (
          <div className="flex items-center gap-2">
            <HeaderActionButton
              icon="edit"
              label="Edit Asset"
              onClick={() => setShowEdit(true)}
              disabled={actionLoading}
            />
            <HeaderActionButton
              icon="trash"
              label="Delete Asset"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={actionLoading}
            />
            <HeaderActionButton
              icon="refresh-cw"
              label="Refresh"
              onClick={() => void refresh()}
              disabled={actionLoading}
            />
          </div>
        ) : null}
      </div>

      <div className="max-w-7xl mx-auto mt-5 space-y-5">
        <div className="bg-gradient-to-r from-[color:var(--surface-2)] via-[color:var(--bg)] to-[color:var(--surface-3)] px-4 sm:p-5 flex flex-col gap-4">
          <p className="text-xs text-subtle leading-relaxed">
            At-a-glance snapshot: lifecycle status, holder ERP entitlement when someone is assigned, and how this device is labeled in
            inventory.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <InventoryStatusBadge status={asset.status} size="md" />
            {asset.current_employee_id ? (
              <span className={`px-3 text-xs font-semibold rounded-full ${asset.current_employee_erp_active ? 'bg-surface border border-base text-muted' : 'bg-surface border border-base text-accent'}`}>
                Holder ERP: {asset.current_employee_erp_active ? 'Active' : 'Inactive'}
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-muted text-xs uppercase tracking-wide">Inventory</p>
            <p className="text-xl sm:text-2xl font-bold leading-tight">{assetTitle}</p>
            <p className="text-sm text-subtle">Location: {formatDisplay(asset.location_name)}</p>
          </div>
        </div>

        {canManage ? (
        <section className="bg-surface border border-base rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle mb-2">Assign or return</h2>
          <p className="text-xs text-subtle mb-3 leading-relaxed">
            {canManage
              ? 'Move custody by assigning to an employee code, or close the open assignment to return the asset to stock. Assignments are exclusive—one active holder at a time.'
              : 'Read-only: you can view this asset but cannot change custody. Admin or IT Ops access is required to assign or return.'}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <EmployeeAssignLookup
              id="asset-detail-assignee"
              label="Employee"
              value={assignQuery}
              onChange={setAssignQuery}
              selectedEmployee={selectedAssignee}
              onSelectedEmployeeChange={setSelectedAssignee}
              placeholder="Search by user name or employee code"
              hideLabel
              disabled={actionLoading}
            />
            <input
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="Optional notes"
              disabled={actionLoading}
              className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={openAssignDialog}
                disabled={actionLoading}
                className="flex-1 bg-accent text-white font-semibold px-3 py-2.5 rounded-lg text-sm disabled:opacity-60"
                type="button"
              >
                Assign
              </button>
              <button
                onClick={openReturnDialog}
                disabled={actionLoading || !openAssignment}
                className="flex-1 border border-base text-muted px-3 py-2.5 rounded-lg text-sm hover:bg-surface-2 disabled:opacity-60"
                type="button"
              >
                Return
              </button>
            </div>
          </div>
          <p className="text-[11px] text-subtle mt-2">
            Reassigning to a different code ends the previous holder’s assignment automatically and opens a new row in history.
          </p>
          {error ? <p className="text-accent text-sm mt-2">{error}</p> : null}
        </section>
        ) : null}

        <Section
          title="Assignment Summary"
          description="The current open assignment only—who holds the asset now, when it started, and whether custody is still open. If no one is assigned, these fields stay empty."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Info label="Current Holder" value={formatDisplay(asset.current_employee_name)} />
            <Info label="Current Holder Code" value={formatDisplay(asset.current_employee_code)} />
            <Info label="Assigned At" value={formatDateTime(asset.assigned_at)} />
            <Info label="Open Assignment" value={openAssignment ? 'Yes' : 'No'} />
          </div>
        </Section>

        <Section
          title="Inventory Details"
          description="Canonical catalog data: identity, classification, location, warranty, in-stock status, and audit hints for who created or last edited this record in the app."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Info label="Asset Tag" value={formatDisplay(asset.asset_tag)} />
            <Info label="Category" value={formatDisplay(asset.category_name)} />
            <Info label="Manufacturer" value={formatDisplay(asset.manufacturer_name)} />
            <Info label="Model" value={formatDisplay(asset.model)} />
            <Info label="Serial Number" value={formatDisplay(asset.serial_number)} />
            <Info label="Location" value={formatDisplay(asset.location_name)} />
            <Info label="Inventory Status" value={formatEnumLabel(asset.status)} />
            <Info label="Purchase Date" value={formatDisplay(asset.purchase_date)} />
            <Info label="Warranty Expiry" value={formatDisplay(asset.warranty_expiry)} />
            <Info label="Created by" value={formatAuditActorDisplay(detail.audit_actors.created_by)} />
            <Info label="Last updated by" value={formatAuditActorDisplay(detail.audit_actors.updated_by)} />
          </div>
        </Section>

        <Section
          title="Custom Fields"
          description="Extra attributes defined for this category (beyond standard columns). They travel with the asset and appear wherever the full record is shown."
        >
          {Object.keys(asset.custom_fields || {}).length === 0 ? (
            <p className="text-sm text-subtle">No custom field data.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(asset.custom_fields || {}).map(([key, value]) => (
                <Info key={key} label={key} value={formatDisplay(value)} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Components"
          description="Sub-items bundled with this asset—such as modules, docks, or accessories—each stored as its own line with type and serials where tracked."
        >
          {detail.components.length === 0 ? (
            <p className="text-sm text-subtle">No components recorded for this asset.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-base">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-surface-2 text-muted uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Manufacturer</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Serial</th>
                    <th className="px-3 py-2 text-left">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.components.map((component) => (
                    <tr key={component.id} className="border-t border-base">
                      <td className="px-3 py-2 capitalize">{formatDisplay(component.component_type)}</td>
                      <td className="px-3 py-2">{formatDisplay(component.manufacturer_name)}</td>
                      <td className="px-3 py-2">{formatDisplay(component.model)}</td>
                      <td className="px-3 py-2">{formatDisplay(component.serial_number)}</td>
                      <td className="px-3 py-2 text-xs text-subtle">
                        {Object.keys(component.metadata || {}).length
                          ? JSON.stringify(component.metadata)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Assignment History"
          description="Every assign and return in order, with each holder’s ERP status on that row. Use it to see who had this asset assigned to them over time—not only who holds it today in the summary above."
        >
          <div className="overflow-x-auto rounded-lg border border-base">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-muted uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">ERP</th>
                  <th className="px-3 py-2 text-left">Assigned At</th>
                  <th className="px-3 py-2 text-left">Returned At</th>
                  <th className="px-3 py-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {detail.assignments.map((entry) => (
                  <AssignmentRow key={entry.id} entry={entry} />
                ))}
                {detail.assignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-subtle">No assignment history</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Lifecycle log"
          description={
            <>
             <b>Note:</b> This timeline records what happened to the asset over time—new records, field changes, assignments and returns. Entries are
              append-only (nothing is deleted or rewritten), so you can reconstruct custody and spot unusual patterns. Admins and IT Ops
              can view the full log; other roles may see a limited or empty history.
            </>
          }
        >
          <AssetChangeHistory events={detail.lifecycle_events} isCapped={detail.lifecycle_is_capped} />
        </Section>
      </div>

      {showEdit && (
        <AssetForm
          prefill={{
            asset_tag: asset.asset_tag || undefined,
            category_slug: asset.category_slug,
            manufacturer_name: asset.manufacturer_name || undefined,
            model: asset.model || undefined,
            serial_number: asset.serial_number || undefined,
            location_name: asset.location_name || undefined,
            purchase_date: asset.purchase_date || undefined,
            warranty_expiry: asset.warranty_expiry || undefined,
            status: asset.status,
            custom_fields: asset.custom_fields,
          }}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false)
            void refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={assignDialogOpen}
        title="Assign Asset"
        message={`Assign ${detail.asset.asset_tag || 'this asset'} to ${selectedAssigneeLabel || assignQuery.trim()}?${assignNotes.trim() ? ` Notes: ${assignNotes.trim()}` : ''}`}
        confirmLabel="Confirm Assign"
        loading={actionLoading}
        showDismissIcon
        onClose={closeAssignDialog}
        onConfirm={() => {
          void handleAssign()
        }}
      />
      <ConfirmDialog
        open={returnDialogOpen}
        title="Return Asset"
        message={`Mark ${detail.asset.asset_tag || 'this asset'} as returned${openAssignment?.employee?.name ? ` from ${openAssignment.employee.name}` : ''}${openAssignment?.employee?.employee_code ? ` (${openAssignment.employee.employee_code})` : ''}?`}
        confirmLabel="Confirm Return"
        loading={actionLoading}
        showDismissIcon
        onClose={closeReturnDialog}
        onConfirm={() => {
          void handleReturn()
        }}
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Move Asset to Recycle Bin"
        message={`Move ${detail.asset.asset_tag || 'this asset'} to Recycle Bin?`}
        confirmLabel="Delete"
        loading={actionLoading}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          setDeleteDialogOpen(false)
          void handleSoftDelete()
        }}
      />
    </main>
  )
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-surface border border-base rounded-xl p-4 sm:p-5">
      <h2 className={`text-sm font-semibold uppercase tracking-[0.14em] text-muted ${description ? 'mb-2' : 'mb-3'}`}>{title}</h2>
      {description ? (
        <div className="text-xs text-subtle mb-3 leading-relaxed">
          {description}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function HeaderActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <AnimatedNavIcon name={icon} />
      </span>
    </button>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</p>
      <p className="text-sm text-primary mt-1 break-words">{value}</p>
    </div>
  )
}

function formatAuthUserRef(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

function formatAuditActorDisplay(
  actor: AssetDetailRecord['audit_actors']['created_by'] | AssetDetailRecord['audit_actors']['updated_by'],
): string {
  if (!actor) return '-'

  const name = actor.name?.trim()
  const employeeCode = actor.employee_code?.trim()

  if (name && employeeCode) {
    return `${name} - ${employeeCode}`
  }

  if (name) return name
  if (employeeCode) return employeeCode

  return formatAuthUserRef(actor.auth_user_id)
}

function formatEmployeeAssignSummary(employee: EmployeeRecord | null): string {
  if (!employee) return ''

  const name = employee.name.trim()
  const employeeCode = employee.employee_code.trim()

  if (name && employeeCode) {
    return `${name} (${employeeCode})`
  }

  return name || employeeCode
}

function AssignmentRow({ entry }: { entry: AssetAssignmentRecord }) {
  return (
    <tr className="border-t border-base">
      <td className="px-3 py-2 text-primary">{formatDisplay(entry.employee?.name)}</td>
      <td className="px-3 py-2 text-primary">{formatDisplay(entry.employee?.employee_code)}</td>
      <td className="px-3 py-2 text-primary">
        {entry.employee ? (
          <span className={`text-xs px-2 py-0.5 rounded ${entry.employee.erp_active ? 'bg-accent text-white' : 'bg-surface border border-base text-muted'}`}>
            {entry.employee.erp_active ? 'Active' : 'Inactive'}
          </span>
        ) : '-'}
      </td>
      <td className="px-3 py-2 text-primary">{formatDateTime(entry.assigned_at)}</td>
      <td className="px-3 py-2 text-primary">{entry.returned_at ? formatDateTime(entry.returned_at) : 'OPEN'}</td>
      <td className="px-3 py-2 text-primary">{formatEnumLabel(entry.source)}</td>
    </tr>
  )
}
