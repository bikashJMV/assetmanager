import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSetBreadcrumbOverride } from '../../hooks/useBreadcrumbOverride'
import type { AssetAssignmentRecord, AssetDetailRecord, EmployeeRecord } from '../../types/api'

import { useAdminAccessQuery } from '../../queries/authz'
import { useAssetDetailQuery, useProtectedAssetScanQuery } from '../../queries/assets'
import { assignAsset, returnAsset, validateAssignment, type AssignValidateResult } from '../../services/assignmentService'
import { exportAssetAuditTrailPdf, exportAssetHistoryPdf } from '../../services/assetService'
import { buildAssetQrDataUri } from '../../utils/qr'
import AssetForm from '../form/AssetForm'
import Error from '../common/Error'
import Loader from '../common/Loader'
import ConfirmDialog from '../common/ConfirmDialog'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDateMedium, formatDateTime, formatDisplay, formatEnumLabel } from '../../utils/formatDisplay'
import AssetChangeHistory from '../asset/AssetChangeHistory'
import InventoryStatusBadge from '../common/InventoryStatusBadge'
import AnimatedNavIcon, { type IconName } from '../common/AnimatedNavIcon'
import { useToast } from '../../hooks/useToast'
import EmployeeAssignLookup from '../common/EmployeeAssignLookup'
import Tooltip from '../common/Tooltip'

const ASSIGNABLE_STATUSES = new Set(['in_stock', 'assigned'])

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const setBreadcrumb = useSetBreadcrumbOverride()
  const ref = (id || '').trim()

  const adminAccessQuery = useAdminAccessQuery()
  const canManage = Boolean(adminAccessQuery.data?.allowed)

  const protectedScan = useProtectedAssetScanQuery(ref)
  const redirect = (() => {
    const data = protectedScan.data
    if (!data || typeof data !== 'object') return null
    if (!('redirect' in data)) return null
    const resolved = data as { redirect?: unknown; asset_tag?: unknown; view_only?: unknown }
    if (resolved.redirect !== true) return null
    return {
      asset_tag: typeof resolved.asset_tag === 'string' ? resolved.asset_tag : ref,
      view_only: resolved.view_only === true,
    }
  })()

  const detailRef = redirect?.asset_tag?.trim() || ref
  const detailQuery = useAssetDetailQuery(detailRef, Boolean(ref && redirect))

  const detail: AssetDetailRecord | null = detailQuery.data ?? null
  const [error, setError] = useState('')
  const [errorDebug, setErrorDebug] = useState<string | undefined>(undefined)
  const [showEdit, setShowEdit] = useState(false)
  const [historyPdfExporting, setHistoryPdfExporting] = useState(false)
  const [auditTrailPdfExporting, setAuditTrailPdfExporting] = useState(false)
  const [assignQuery, setAssignQuery] = useState('')
  const [selectedAssignee, setSelectedAssignee] = useState<EmployeeRecord | null>(null)
  const [assignNotes, setAssignNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)

  const [qrDataUri, setQrDataUri] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [deptValidation, setDeptValidation] = useState<AssignValidateResult | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (!detail) return
    const { asset_tag, category_name, status } = detail.asset
    const name = category_name || asset_tag
    const statusLabel = formatEnumLabel(status)
    setBreadcrumb(asset_tag ? `${name} (${asset_tag} / ${statusLabel})` : name ?? '')
  }, [detail, setBreadcrumb])

  useEffect(() => {
    if (!ref) return
    if (!protectedScan.isFetched) return
    if (redirect) return
    void navigate(`/assets/scan/${encodeURIComponent(ref)}`, { replace: true })
  }, [navigate, protectedScan.isFetched, redirect, ref])

  useEffect(() => {
    const assetTag = detail?.asset.asset_tag?.trim()
    if (!assetTag) {
      setQrDataUri(null)
      setQrError(null)
      setQrLoading(false)
      return
    }

    let cancelled = false
    setQrDataUri(null)
    setQrError(null)
    setQrLoading(true)

    void buildAssetQrDataUri(assetTag)
      .then((uri) => {
        if (!cancelled) setQrDataUri(uri)
      })
      .catch((err) => {
        if (!cancelled) setQrError(getUserFacingMessage(err, 'Unable to load QR'))
      })
      .finally(() => {
        if (!cancelled) setQrLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [detail?.asset.asset_tag])

  const openAssignment = useMemo(
    () => detail?.assignments.find((entry) => entry.returned_at === null) || null,
    [detail]
  )
  const currentHolderCode = openAssignment?.employee?.employee_id.trim().toUpperCase() ?? ''
  const selectedAssigneeCode = selectedAssignee?.employee_id.trim().toUpperCase() ?? ''
  const isAssignableStatus = ASSIGNABLE_STATUSES.has(detail?.asset.status ?? '')
  const hasAssignmentHistory = (detail?.assignments.length ?? 0) > 0
  const visibleLifecycleEvents = useMemo(
    () =>
      detail?.lifecycle_events.filter(
        (evt) => evt.event_type?.toLowerCase() !== 'qr_scanned',
      ) ?? [],
    [detail?.lifecycle_events],
  )

  const loading = protectedScan.isLoading || protectedScan.isFetching || detailQuery.isLoading || detailQuery.isFetching
  const fetchError = detailQuery.isError
    ? getUserFacingMessage(detailQuery.error, 'Unable to load asset details right now.')
    : ''
  const fetchErrorDebug = detailQuery.isError ? getErrorDebugDetail(detailQuery.error) : undefined

  const refresh = useCallback(async () => {
    setError('')
    setErrorDebug(undefined)
    try {
      await Promise.all([protectedScan.refetch(), detailQuery.refetch(), adminAccessQuery.refetch()])
    } catch (err) {
      logDevError('assetDetail.refresh', err)
      setError(getUserFacingMessage(err, 'Unable to refresh asset details right now.'))
      setErrorDebug(getErrorDebugDetail(err))
    }
  }, [adminAccessQuery, detailQuery, protectedScan])

  const openAssignDialog = async () => {
    const assetTag = detail?.asset.asset_tag
    if (!assetTag) return
    if (!canManage) {
      setError('Active admin access is required to assign assets')
      return
    }
    if (!isAssignableStatus) {
      setError(`Cannot assign — this asset is currently marked as "${formatEnumLabel(detail.asset.status)}". Please update its inventory status before assigning.`)
      return
    }
    if (!selectedAssignee?.employee_id.trim()) {
      setError('Select an employee from the suggestions before assigning this asset')
      return
    }
    if (currentHolderCode && selectedAssigneeCode === currentHolderCode) {
      setError(
        openAssignment?.employee?.name?.trim()
          ? `${assetTag || 'This asset'} is already assigned to ${openAssignment.employee.name.trim()}.`
          : 'This asset is already assigned to the selected employee.',
      )
      return
    }
    setError('')
    setErrorDebug(undefined)
    setActionLoading(true)
    try {
      const result = await validateAssignment({
        asset_tag: assetTag,
        employee_id: selectedAssignee.employee_id.trim(),
      })
      setDeptValidation(result)
    } catch (err) {
      logDevError('assetDetail.validateAssignment', err)
      setDeptValidation(null)
    } finally {
      setActionLoading(false)
    }
    setAssignDialogOpen(true)
  }

  const closeAssignDialog = () => {
    if (actionLoading) return
    setAssignDialogOpen(false)
    setDeptValidation(null)
  }

  const handleAssign = async (force_dept_move = false) => {
    const assetTag = detail?.asset.asset_tag
    if (!assetTag) return
    if (!selectedAssignee?.employee_id.trim()) return
    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const result = await assignAsset({
        asset_tag: assetTag,
        employee_id: selectedAssignee.employee_id.trim(),
        notes: assignNotes.trim() || undefined,
        force_dept_move,
      })
      const msg =
        typeof result?.message === 'string' && result.message.trim()
          ? result.message.trim()
          : 'Asset assigned successfully.'
      showToast({ message: msg, variant: 'success' })
      setAssignDialogOpen(false)
      setDeptValidation(null)
      setAssignQuery('')
      setSelectedAssignee(null)
      setAssignNotes('')
      await refresh()
    } catch (err) {
      setAssignDialogOpen(false)
      setDeptValidation(null)
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
    const assetTag = detail?.asset.asset_tag
    if (!assetTag) return
    setActionLoading(true)
    setError('')
    setErrorDebug(undefined)
    try {
      const result = await returnAsset({
        asset_tag: assetTag,
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

  const handleExportHistoryPdf = async () => {
    if (!detail?.asset.asset_tag) return
    setHistoryPdfExporting(true)
    try {
      const { pdfBlob, fileName } = await exportAssetHistoryPdf(detail.asset.asset_tag)
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      logDevError('assetDetail.exportHistoryPdf', err)
      showToast({ message: getUserFacingMessage(err, 'Unable to export history PDF.'), variant: 'error' })
    } finally {
      setHistoryPdfExporting(false)
    }
  }

  const handleExportAuditTrailPdf = async () => {
    if (!detailRef) return
    setAuditTrailPdfExporting(true)
    try {
      const { pdfBlob, fileName } = await exportAssetAuditTrailPdf(detailRef, { limit: 100 })
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      logDevError('assetDetail.exportAuditTrailPdf', err)
      showToast({ message: getUserFacingMessage(err, 'Unable to export audit trail PDF.'), variant: 'error' })
    } finally {
      setAuditTrailPdfExporting(false)
    }
  }

  const pageLoadError = error || fetchError
  const pageLoadDebug = error ? errorDebug : fetchErrorDebug

  if (pageLoadError && !detail) {
    return (
      <Error
        title="Could not load asset"
        message={pageLoadError}
        onRetry={() => {
          void refresh()
        }}
        debugDetail={pageLoadDebug}
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

  const handleDownloadQr = () => {
    if (!qrDataUri || !detail?.asset.asset_tag) return
    const link = document.createElement('a')
    link.href = qrDataUri
    link.download = `${detail.asset.asset_tag}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 sm:px-6 py-4 sm:py-5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 py-2">
        <h1 className="sr-only">{formatDisplay(asset.asset_tag)}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2 flex-1">
          <div className="flex items-center gap-1">
            {canManage ? (
              <HeaderActionButton
                icon="edit"
                label="Edit Asset"
                onClick={() => setShowEdit(true)}
                disabled={actionLoading}
              />
            ) : null}
            <HeaderActionButton
              icon="refresh-cw"
              label="Refresh"
              onClick={() => void refresh()}
              disabled={actionLoading}
            />
            <HeaderActionLabelButton
              icon="download"
              label="QR"
              onClick={handleDownloadQr}
              disabled={actionLoading || !qrDataUri}
            />
          </div>
          {canManage && (
            <>
              <div className="border-l border-base mx-1 h-5 self-center" />
              <div className="flex items-center gap-1">
                <HeaderActionLabelButton
                  icon="download"
                  label="Audit"
                  onClick={() => void handleExportAuditTrailPdf()}
                  disabled={actionLoading || auditTrailPdfExporting}
                />
                {hasAssignmentHistory ? (
                  <HeaderActionLabelButton
                    icon="download"
                    label="History"
                    onClick={() => void handleExportHistoryPdf()}
                    disabled={actionLoading || historyPdfExporting}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_0.8fr] gap-3 items-start">
          <section className="relative rounded-xl border border-base bg-gradient-to-br from-[color:var(--surface-2)] to-[color:var(--surface)] p-3 sm:p-4 flex flex-col gap-3 before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-accent/5 before:to-transparent before:pointer-events-none">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <InventoryStatusBadge status={asset.status} size="md" />
              <span className="font-mono text-xs px-2 py-0.5 rounded-full border border-base bg-surface-3">{asset.asset_tag}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-2xl sm:text-3xl font-bold leading-tight">{assetTitle}</p>
              <p className="text-sm text-subtle">{asset.category_name} &middot; {formatDisplay(asset.location_name)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="rounded-lg border border-base bg-surface px-3 py-1.5 text-xs">
                <span className="text-subtle mr-1.5">Dept:</span>
                <span className="font-medium">{formatDisplay(asset.asset_department_name)}</span>
              </div>
              <div className="rounded-lg border border-base bg-surface px-3 py-1.5 text-xs">
                <span className="text-subtle mr-1.5">Purchase:</span>
                <span className="font-medium">{formatDateMedium(asset.purchase_date)}</span>
              </div>
              <div className="rounded-lg border border-base bg-surface px-3 py-1.5 text-xs">
                <span className="text-subtle mr-1.5">Warranty:</span>
                <span className="font-medium">{formatDateMedium(asset.warranty_expiry)}</span>
              </div>
            </div>
          </section>

          <section className="bg-surface border border-base rounded-xl p-4 flex items-center justify-center">
            {qrLoading ? (
              <div className="h-36 w-36 rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 animate-pulse" />
            ) : qrError ? (
              <div className="text-xs text-accent text-center space-y-1">
                <p>{qrError}</p>
                <button
                  type="button"
                  className="text-accent font-semibold hover:underline"
                  onClick={() => {
                    if (!detail?.asset.asset_tag) return
                    setQrError(null)
                    setQrLoading(true)
                    void buildAssetQrDataUri(detail.asset.asset_tag)
                      .then((uri) => setQrDataUri(uri))
                      .catch((err) => setQrError(getUserFacingMessage(err, 'Unable to load QR')))
                      .finally(() => setQrLoading(false))
                  }}
                >
                  Retry
                </button>
              </div>
            ) : qrDataUri ? (
              <img
                src={qrDataUri}
                alt={`QR for ${asset.asset_tag}`}
                className="h-36 w-36 rounded-lg bg-white shadow-md"
              />
            ) : null}
          </section>
        </div>

        <div className={`grid grid-cols-1 gap-3 ${Object.keys(asset.custom_fields || {}).length > 0 ? 'md:grid-cols-2' : ''}`}>
          <Section
            title="Inventory Details"
            description="Identity, classification, location, warranty, and audit hints."
          >
            <dl className="divide-y divide-[color:var(--border)]">
              <InfoRow label="Asset Tag" value={formatDisplay(asset.asset_tag)} />
              <InfoRow label="Category" value={formatDisplay(asset.category_name)} />
              <InfoRow label="Manufacturer" value={formatDisplay(asset.manufacturer_name)} />
              <InfoRow label="Model" value={formatDisplay(asset.model)} />
              <InfoRow label="Serial Number" value={formatDisplay(asset.serial_number)} />
              <InfoRow label="Location" value={formatDisplay(asset.location_name)} />
              <InfoRow label="Department" value={formatDisplay(asset.asset_department_name)} />
              <InfoRow label="Inventory Status" value={formatEnumLabel(asset.status)} />
              <InfoRow label="Purchase Date" value={formatDisplay(asset.purchase_date)} />
              <InfoRow label="Warranty Expiry" value={formatDisplay(asset.warranty_expiry)} />
              <InfoRow
                label="Created by"
                value={formatAuditActorWithTimestamp(detail.audit_actors.created_by, asset.created_at)}
              />
              <InfoRow
                label="Last updated by"
                value={formatAuditActorWithTimestamp(detail.audit_actors.updated_by, asset.updated_at)}
              />
            </dl>
          </Section>

          {Object.keys(asset.custom_fields || {}).length > 0 && (
            <Section
              title="Custom Fields"
              description="These fields capturing additional data beyond inventory."
            >
              <dl className="divide-y divide-[color:var(--border)]">
                {Object.entries(asset.custom_fields || {}).map(([key, value]) => (
                  <InfoRow key={key} label={key} value={formatDisplay(value)} />
                ))}
              </dl>
            </Section>
          )}
        </div>

        {canManage ? (
          <section className="bg-surface border border-base rounded-xl p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-subtle mb-2">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Assign or return
            </h2>
            <p className="text-xs mb-3 text-muted font-medium leading-relaxed">
              {canManage
                ? 'Assign a holder for temporary ownership, or return to stock. One active holder at a time.'
                : 'View-only access. Contact an Admin to assign or return this asset.'}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-lg focus-within:ring-2 focus-within:ring-accent/40 transition-all duration-150">
                <EmployeeAssignLookup
                  id="asset-detail-assignee"
                  label="Employee"
                  value={assignQuery}
                  onChange={setAssignQuery}
                  selectedEmployee={selectedAssignee}
                  onSelectedEmployeeChange={setSelectedAssignee}
                  placeholder="Search by name or employee code"
                  hideLabel
                  disabled={actionLoading}
                />
              </div>
              <input
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Note (optional)"
                disabled={actionLoading}
                className="w-full bg-surface-2 border border-base rounded-lg px-1 py-1 text-sm focus-visible:ring-2 focus-visible:ring-accent/40 focus:border-accent transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={openAssignDialog}
                  disabled={actionLoading}
                  className="flex-1 bg-accent text-on-accent font-semibold px-3 py-2.5 rounded-lg text-sm disabled:opacity-60 shadow-sm hover:shadow-accent/20 hover:shadow-md active:scale-[0.98] transition-all"
                  type="button"
                >
                  Assign
                </button>
                <button
                  onClick={openReturnDialog}
                  disabled={actionLoading || !openAssignment}
                  className="flex-1 border border-base text-muted px-3 py-2.5 rounded-lg text-sm hover:bg-surface-2 disabled:opacity-60 hover:border-accent/30 transition"
                  type="button"
                >
                  Return
                </button>
              </div>
            </div>
            <p className="text-xs text-muted mt-2 leading-relaxed">
              Reassigning to a different code ends the previous holder’s assignment automatically and opens a new row in history.
            </p>
            {error ? (
              <p className="text-accent text-sm mt-2 flex items-start gap-1.5">
                <span className="flex h-4 w-4 shrink-0 mt-0.5 items-center justify-center">
                  <AnimatedNavIcon name="alert-triangle" />
                </span>
                <span>{error}</span>
              </p>
            ) : null}
          </section>
        ) : null}

        {/* {asset.current_employee_id ? (
          <Section
            title="Assignment Summary"
            description="Current holder, employee ID, and when the assignment started."
          >
            <dl className="flex flex-wrap items-center divide-x divide-[color:var(--border)]">
              <AssignmentSummaryField label="Current Holder" value={formatDisplay(asset.current_employee_name)} />
              <AssignmentSummaryField label="Current Holder ID" value={formatDisplay(asset.current_employee_business_id)} />
              <AssignmentSummaryField label="Assigned At" value={formatDateTime(asset.assigned_at)} />
            </dl>
          </Section>
        ) : null} */}

        {detail.components.length > 0 && (
          <Section
            title="Components"
            description="Sub-items bundled with this asset—such as modules, docks, or accessories—each stored as its own line with type and serials where tracked."
          >
            <div className="overflow-x-auto ring-1 ring-[color:var(--border)] rounded-xl">
              <table className="w-full min-w-[680px] text-xs sm:text-sm">
                <thead className="bg-surface-2/80 border-b-2 border-[color:var(--border)]">
                  <tr>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Type</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Manufacturer</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Model</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Serial</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {detail.components.map((component) => (
                    <tr key={component.id} className="hover:bg-surface-2/60 transition-colors duration-100 even:bg-surface/50">
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
          </Section>
        )}

        {canManage && (
          <Section
            title="Assignment History"
            // description="All assigns/returns in order with holder ERP status."
            action={
              hasAssignmentHistory ? (
                <button
                  type="button"
                  onClick={handleExportHistoryPdf}
                  disabled={actionLoading || historyPdfExporting}
                  className="inline-flex items-center gap-2 rounded-lg border border-base bg-surface px-3 py-1.5 text-xs font-medium text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Export History PDF"
                  title="Export History PDF"
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    <AnimatedNavIcon name="download" />
                  </span>
                  <span>{historyPdfExporting ? 'pdf...' : 'PDF'}</span>
                </button>
              ) : null
            }
          >
            <div className="overflow-x-auto ring-1 ring-[color:var(--border)] rounded-xl">
              <table className="w-full min-w-[720px] text-xs sm:text-sm">
                <thead className="bg-surface-2/80 border-b-2 border-[color:var(--border)]">
                  <tr>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">S No.</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Employee</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Employee ID</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Serial Number</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Assigned At</th>
                    <th className="px-3 py-2 text-left uppercase text-xs font-semibold tracking-wider text-subtle">Returned At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {detail.assignments.map((entry, idx) => (
                    <AssignmentRow key={entry.id} entry={entry} index={idx + 1} serialNumber={asset.serial_number ?? null} />
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
        )}

        {canManage ? (
          <Section
            title="Lifecycle log"
            description={
              <>
                Append-only timeline of changes, assignments, and returns.
              </>
            }
            action={
              <button
                type="button"
                onClick={() => void handleExportAuditTrailPdf()}
                disabled={actionLoading || auditTrailPdfExporting}
                className="inline-flex items-center gap-2 rounded-lg border border-base bg-surface px-3 py-1.5 text-xs font-medium text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Download audit trail PDF"
                title="Download audit trail PDF"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  <AnimatedNavIcon name="download" />
                </span>
                <span>{auditTrailPdfExporting ? 'pdf...' : 'PDF'}</span>
              </button>
            }
          >
            <div className="mt-1 rounded-lg overflow-hidden">
              <AssetChangeHistory events={visibleLifecycleEvents} isCapped={detail.lifecycle_is_capped} />
            </div>
          </Section>
        ) : null}
      </div>

      {canManage && showEdit && (
        <AssetForm
          isStatusDisabled={asset.status === 'assigned'}
          isDepartmentDisabled={asset.status === 'assigned'}
          prefill={{
            asset_tag: asset.asset_tag || undefined,
            category_slug: asset.category_slug,
            manufacturer_name: asset.manufacturer_name || undefined,
            model: asset.model || undefined,
            serial_number: asset.serial_number || undefined,
            location_name: asset.location_name || undefined,
            purchase_date: asset.purchase_date || undefined,
            warranty_expiry: asset.warranty_expiry || undefined,
            department_id: asset.asset_department_id || undefined,
            status: asset.status,
            custom_fields: asset.custom_fields,
            metadata: (asset as Record<string, unknown>).metadata as Record<string, unknown> ?? undefined,
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
        message={
          deptValidation?.case === 'mismatch' ? (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs leading-relaxed space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5 text-sm">
                  ⚠️ Department Mismatch Detected
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="block text-subtle text-[10px] uppercase font-semibold">Asset Department</span>
                    <span className="font-bold">{deptValidation.asset_dept_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-subtle text-[10px] uppercase font-semibold">Employee Department</span>
                    <span className="font-bold">{deptValidation.employee_dept_name || 'N/A'}</span>
                  </div>
                </div>
                <p className="text-[11px] pt-1.5 border-t border-amber-500/10">
                  Confirming will move this asset to the employee's department (<strong>{deptValidation.employee_dept_name || 'N/A'}</strong>) and complete the assignment.
                </p>
              </div>
              <p className="text-sm">
                Assign <strong>{detail.asset.asset_tag || 'this asset'}</strong> to <strong>{selectedAssigneeLabel || assignQuery.trim()}</strong>?
                {assignNotes.trim() && <span className="block mt-2 text-xs italic">Notes: {assignNotes.trim()}</span>}
              </p>
            </div>
          ) : (
            <p className="text-sm">
              Assign <strong>{detail.asset.asset_tag || 'this asset'}</strong> to <strong>{selectedAssigneeLabel || assignQuery.trim()}</strong>?
              {assignNotes.trim() && <span className="block mt-2 text-xs italic">Notes: {assignNotes.trim()}</span>}
            </p>
          )
        }
        confirmLabel={deptValidation?.case === 'mismatch' ? 'Confirm & Move Dept' : 'Confirm Assign'}
        loading={actionLoading}
        showDismissIcon
        onClose={closeAssignDialog}
        onConfirm={() => {
          void handleAssign(deptValidation?.case === 'mismatch')
        }}
      />
      <ConfirmDialog
        open={returnDialogOpen}
        title="Return Asset"
        message={`Mark ${detail.asset.asset_tag || 'this asset'} as returned${openAssignment?.employee?.name ? ` from ${openAssignment.employee.name}` : ''}${openAssignment?.employee?.employee_id ? ` (${openAssignment.employee.employee_id})` : ''}?`}
        confirmLabel="Confirm Return"
        loading={actionLoading}
        showDismissIcon
        onClose={closeReturnDialog}
        onConfirm={() => {
          void handleReturn()
        }}
      />
    </main>
  )
}

function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-surface ring-1 ring-[color:var(--border)] shadow-sm rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted border-l-2 border-accent pl-2">{title}</h2>
        {action}
      </div>
      {description ? (
        <div className="text-xs text-subtle mb-3 leading-relaxed max-w-prose">
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
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-base bg-surface text-primary transition-all duration-150 active:scale-95 hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex h-5 w-5 items-center justify-center">
          <AnimatedNavIcon name={icon} />
        </span>
      </button>
    </Tooltip>
  )
}

function HeaderActionLabelButton({
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
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-base bg-surface px-3 text-sm font-semibold text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/15 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <AnimatedNavIcon name={icon} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}


// function AssignmentSummaryField({ label, value }: { label: string; value: string }) {
//   return (
//     <div className="flex items-baseline gap-1.5 px-4 first:pl-0 last:pr-0">
//       <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle shrink-0">{label}:</dt>
//       <dd className="text-sm text-primary">{value}</dd>
//     </div>
//   )
// }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 sm:gap-4 py-2.5 hover:bg-surface-2/50 rounded-md px-1 -mx-1 transition">
      <dt className="font-medium text-[11px] uppercase tracking-[0.12em] text-subtle shrink-0 w-32 sm:w-44">{label}</dt>
      <dd className="text-sm font-medium text-primary break-words min-w-0">{value}</dd>
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
  const employeeId = actor.employee_id?.trim()

  if (name && employeeId) {
    return `${name} - ${employeeId}`
  }

  if (name) return name
  if (employeeId) return employeeId

  return formatAuthUserRef(actor.auth_user_id)
}

function auditActorHasIdentity(
  actor: AssetDetailRecord['audit_actors']['created_by'] | AssetDetailRecord['audit_actors']['updated_by'],
): boolean {
  if (!actor) return false
  return Boolean(actor.name?.trim() || actor.employee_id?.trim())
}

/** Person (if known) plus a locale-formatted timestamp; never show anonymous auth UUID fragments. */
function formatAuditActorWithTimestamp(
  actor: AssetDetailRecord['audit_actors']['created_by'] | AssetDetailRecord['audit_actors']['updated_by'],
  at: string | null | undefined,
): string {
  const when = formatDateTime(at ?? null)
  const who = formatAuditActorDisplay(actor)

  if (auditActorHasIdentity(actor)) {
    if (when === '-') return who
    return `${who} · ${when}`
  }

  // Only an auth user id (or no actor): show readable date/time only, not `621576a6…`.
  if (when !== '-') return when
  return '-'
}

function formatEmployeeAssignSummary(employee: EmployeeRecord | null): string {
  if (!employee) return ''

  const name = employee.name.trim()
  const employeeId = employee.employee_id.trim()

  if (name && employeeId) {
    return `${name} (${employeeId})`
  }

  return name || employeeId
}

function AssignmentRow({ entry, index, serialNumber }: { entry: AssetAssignmentRecord; index: number; serialNumber: string | null }) {
  return (
    <tr className="hover:bg-surface-2/60 transition-colors duration-100 even:bg-surface/50">
      <td className="px-3 py-2 text-subtle">{index}</td>
      <td className="px-3 py-2 text-primary">{formatDisplay(entry.employee?.name)}</td>
      <td className="px-3 py-2 text-primary">{formatDisplay(entry.employee?.employee_id)}</td>
      <td className="px-3 py-2 text-primary font-mono text-xs">{formatDisplay(serialNumber)}</td>
      <td className="px-3 py-2 text-primary">{formatDateTime(entry.assigned_at)}</td>
      <td className="px-3 py-2 text-primary">{entry.returned_at ? formatDateTime(entry.returned_at) : <span className="inline-flex items-center gap-1 text-amber-500 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>With Employee</span>}</td>
    </tr>
  )
}

