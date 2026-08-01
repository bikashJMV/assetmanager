import { useEffect, useRef, useState } from 'react'
import type { AssetFilters, AssetInventoryRecord } from '../../types/api'
import { exportAssetQrLabelsPdf, exportAssetsXlsx, listAssets } from '../../services/assetService'
import { buildAssetQrDataUri } from '../../utils/qr'
import { useToast } from '../../hooks/useToast'
import { getErrorDebugDetail, getUserFacingMessage, logDevError } from '../../utils/errors'
import {
  getAssetQrLabel,
  QR_EXPORT_BATCH_SIZE,
  type AssetQrModalState,
  type AssetQrPdfTabFallbackState,
} from './allAssetsConfig'
import { LOADING } from '../../constants/loading'

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

type ExportParams = {
  filters: AssetFilters
  searchParam: string | undefined
  onError: (message: string, debug?: string) => void
}

/** All QR + XLSX export behaviour for the assets list, extracted from AllAssets. */
export function useAssetExports({ filters, searchParam, onError }: ExportParams) {
  const { showToast } = useToast()
  const [qrModal, setQrModal] = useState<AssetQrModalState | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [bulkQrExporting, setBulkQrExporting] = useState(false)
  const [bulkXlsxExporting, setBulkXlsxExporting] = useState(false)
  const [qrPdfTabFallback, setQrPdfTabFallback] = useState<AssetQrPdfTabFallbackState | null>(null)
  const qrPdfTabFallbackRef = useRef<AssetQrPdfTabFallbackState | null>(null)

  useEffect(() => {
    qrPdfTabFallbackRef.current = qrPdfTabFallback
  }, [qrPdfTabFallback])

  useEffect(() => () => {
    const pending = qrPdfTabFallbackRef.current
    if (pending) URL.revokeObjectURL(pending.blobUrl)
  }, [])

  const handleViewQR = async (e: React.MouseEvent, asset: AssetInventoryRecord) => {
    e.stopPropagation()
    const assetTag = asset.asset_tag?.trim() || null
    if (!assetTag) return onError('Asset tag missing, unable to load QR')
    setQrLoading(true)
    try {
      const qrCode = await buildAssetQrDataUri(assetTag)
      setQrModal({ assetTag, assetLabel: getAssetQrLabel(asset), qrCode })
    } catch (err) {
      logDevError('assets.qr', err)
      onError(getUserFacingMessage(err, 'Unable to load QR right now.'), getErrorDebugDetail(err))
    } finally {
      setQrLoading(false)
    }
  }

  const handleDownloadQr = () => {
    if (!qrModal) return
    triggerDownload(qrModal.qrCode, `${qrModal.assetTag}-qr.png`)
  }

  const handleDirectDownloadQr = async (e: React.MouseEvent, assetTag: string | null) => {
    e.stopPropagation()
    if (!assetTag) return onError('Asset tag missing, unable to download QR')
    setQrLoading(true)
    try {
      const qrCode = await buildAssetQrDataUri(assetTag)
      triggerDownload(qrCode, `${assetTag}-qr.png`)
    } catch (err) {
      logDevError('assets.qr.download', err)
      onError(getUserFacingMessage(err, 'Unable to download QR right now.'), getErrorDebugDetail(err))
    } finally {
      setQrLoading(false)
    }
  }

  const collectAssetTagsForQrExport = async (): Promise<string[]> => {
    const collectedTags: string[] = []
    const MAX_TAGS = 10_000
    let page = 1
    let total = 0
    let totalVerified = false
    const category = filters.category_slug?.trim() || undefined
    const search = searchParam?.trim() ? searchParam.trim() : undefined
    const status = filters.status?.trim() || undefined

    do {
      const result = await listAssets({ page, limit: QR_EXPORT_BATCH_SIZE, search, status, category, exclude_category_slugs: undefined })
      if (page === 1) {
        total = result.total
        if (typeof total !== 'number' || (result.items.length > 0 && total < result.items.length)) {
          total = Number.MAX_SAFE_INTEGER
        }
        totalVerified = true
      }
      collectedTags.push(...result.items.map((a) => a.asset_tag?.trim() || '').filter(Boolean))
      page += 1
      if (result.items.length === 0) break
      if (collectedTags.length >= MAX_TAGS) break
    } while (totalVerified && (page - 1) * QR_EXPORT_BATCH_SIZE < total)

    return [...new Set(collectedTags)]
  }

  const closeQrPdfTabFallbackModal = () => {
    setQrPdfTabFallback((current) => {
      if (current) URL.revokeObjectURL(current.blobUrl)
      return null
    })
  }

  const confirmQrPdfTabFallbackDownload = () => {
    let started = false
    setQrPdfTabFallback((current) => {
      if (!current) return current
      started = true
      triggerDownload(current.blobUrl, current.fileName)
      setTimeout(() => URL.revokeObjectURL(current.blobUrl), 120000)
      return null
    })
    if (started) showToast({ variant: 'success', message: 'Download started.' })
  }

  const handleDownloadQrLabels = async () => {
    if (bulkQrExporting) {
      showToast({ variant: 'warning', message: LOADING.EXPORT_IN_PROGRESS })
      return
    }
    setBulkQrExporting(true)
    onError('')
    try {
      const assetTags = await collectAssetTagsForQrExport()
      const { pdfBlob, fileName, emptyExport } = await exportAssetQrLabelsPdf(assetTags)
      const blobUrl = URL.createObjectURL(pdfBlob)
      const viewer = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      if (viewer) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
        if (emptyExport) showToast({ variant: 'info', message: 'Opened a summary PDF — there are no QR labels to print for this export.' })
        return
      }
      setQrPdfTabFallback({ blobUrl, fileName, emptyExport })
    } catch (err) {
      logDevError('assets.qr.export', err)
      onError(getUserFacingMessage(err, 'Unable to export QR labels right now.'), getErrorDebugDetail(err))
    } finally {
      setBulkQrExporting(false)
    }
  }

  const handleDownloadAssetsXlsx = async () => {
    if (bulkXlsxExporting) {
      showToast({ variant: 'warning', message: LOADING.EXPORT_IN_PROGRESS })
      return
    }
    setBulkXlsxExporting(true)
    onError('')
    try {
      const { xlsxBlob, fileName } = await exportAssetsXlsx()
      const blobUrl = URL.createObjectURL(xlsxBlob)
      triggerDownload(blobUrl, fileName)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      showToast({ variant: 'success', message: 'Assets XLSX download started.' })
    } catch (err) {
      logDevError('assets.xlsx.export', err)
      onError(getUserFacingMessage(err, 'Unable to export XLSX right now.'), getErrorDebugDetail(err))
    } finally {
      setBulkXlsxExporting(false)
    }
  }

  return {
    qrModal,
    setQrModal,
    qrLoading,
    bulkQrExporting,
    bulkXlsxExporting,
    qrPdfTabFallback,
    handleViewQR,
    handleDownloadQr,
    handleDirectDownloadQr,
    handleDownloadQrLabels,
    handleDownloadAssetsXlsx,
    closeQrPdfTabFallbackModal,
    confirmQrPdfTabFallbackDownload,
  }
}
