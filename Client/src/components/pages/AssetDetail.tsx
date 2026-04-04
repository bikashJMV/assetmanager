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
} from '../../api'
import AssetForm from '../form/AssetForm'
import Error from '../common/Error'
import Loader from '../common/Loader'
import ConfirmDialog from '../common/ConfirmDialog'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDateTime, formatDisplay, formatEnumLabel } from '../../utils/formatDisplay'
import IconActionButton from '../common/IconActionButton'
import AssetChangeHistory from '../asset/AssetChangeHistory'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import { useToast } from '../common/ToastProvider'

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
  const [assignCode, setAssignCode] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [canManage, setCanManage] = useState(false)
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

  const handleAssign = async () => {
    if (!detail?.asset.asset_tag) return
    if (!canManage) {
      setError('Active admin access is required to assign assets')
      return
    }
    if (!assignCode.trim()) {
      setError('Employee code is required for assignment')
      return
    }
    const confirmed = window.confirm('Assign this asset to the entered employee code?')
    if (!confirmed) return

    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const result = await assignAsset({
        asset_tag: detail.asset.asset_tag,
        employee_code: assignCode.trim(),
        notes: assignNotes.trim() || undefined,
      })
      const msg =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : 'Asset assigned successfully.'
      showToast({ message: msg, variant: 'success' })
      setAssignCode('')
      setAssignNotes('')
      await refresh()
    } catch (err) {
      logDevError('assetDetail.assign', err)
      setError(getUserFacingMessage(err, 'Unable to assign this asset right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!detail?.asset.asset_tag) return
    if (!canManage) {
      setError('Active admin access is required to return assets')
      return
    }
    const confirmed = window.confirm('Return this asset and close the current assignment?')
    if (!confirmed) return

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
      setAssignNotes('')
      await refresh()
    } catch (err) {
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

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 ">
        {canManage ? (
          <div className="ml-auto flex items-center gap-2">
            <IconActionButton
              icon="edit"
              label="Edit Asset"
              onClick={() => setShowEdit(true)}
              variant="accent"
              disabled={actionLoading}
            />
            <IconActionButton
              icon="trash"
              label="Delete Asset"
              onClick={() => setDeleteDialogOpen(true)}
              variant="danger"
              disabled={actionLoading}
            />
            {/* Add a refresh button without lebel refresh */}
            <IconActionButton
              icon="refresh-cw"
              label="Refresh"
              onClick={() => void refresh()}
              variant="base"
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

        <section className="bg-surface border border-base rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle mb-2">Assign or return</h2>
          <p className="text-xs text-subtle mb-3 leading-relaxed">
            {canManage
              ? 'Move custody by assigning to an employee code, or close the open assignment to return the asset to stock. Assignments are exclusive—one active holder at a time.'
              : 'Read-only: you can view this asset but cannot change custody. Admin or IT Ops access is required to assign or return.'}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <input
              value={assignCode}
              onChange={(e) => setAssignCode(e.target.value)}
              placeholder="Employee Code (e.g., EMP0001)"
              disabled={!canManage}
              className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2.5 text-sm"
            />
            <input
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="Optional notes"
              disabled={!canManage}
              className="w-full bg-surface-2 border border-base rounded-lg px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void handleAssign()}
                disabled={actionLoading || !canManage}
                className="flex-1 bg-accent text-white font-semibold px-3 py-2.5 rounded-lg text-sm disabled:opacity-60"
                type="button"
              >
                Assign
              </button>
              <button
                onClick={() => void handleReturn()}
                disabled={actionLoading || !openAssignment || !canManage}
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
            <Info label="Inventory Status" value={formatDisplay(asset.status)} />
            <Info label="Purchase Date" value={formatDisplay(asset.purchase_date)} />
            <Info label="Warranty Expiry" value={formatDisplay(asset.warranty_expiry)} />
            <Info label="Created by (auth user)" value={formatAuthUserRef(asset.created_by)} />
            <Info label="Last updated by (auth user)" value={formatAuthUserRef(asset.updated_by)} />
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
