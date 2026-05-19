import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { PublicScanAsset } from '../../api'
import { useProtectedAssetScanQuery, usePublicAssetScanQuery } from '../../queries/assets'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { getErrorStatusCode } from '../../utils/authNexus.api'
import { formatDisplay } from '../../utils/formatDisplay'
import InventoryStatusBadge from '../common/InventoryStatusBadge'

type BarcodeDetectorInstance = {
  detect: (image: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance

/** Logged-in scan (`scanAsset`): full passport fields from `v_asset_inventory`. */
type AuthenticatedScanAsset = {
  asset_tag: string | null
  is_own_asset: boolean
  is_privileged: boolean
  category: string | null
  manufacturer: string | null
  model: string | null
  status: string
  location: string | null
  holder: string | null
  holder_erp_status: string
  custom_fields: Record<string, unknown>
}

export default function ScanPage({ protectedRoute = false }: { protectedRoute?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null)
  const frameRef = useRef<number | null>(null)
  const scannerBusyRef = useRef(false)
  const scannerActiveRef = useRef(false)
  const [manualTag, setManualTag] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const ref = (id || '').trim()
  const publicScan = usePublicAssetScanQuery(ref)
  const protectedScan = useProtectedAssetScanQuery(ref, protectedRoute && Boolean(ref))
  const activeScan = protectedRoute ? protectedScan : publicScan

  useEffect(() => {
    if (activeScan.error) {
      logDevError('scan.asset', activeScan.error)
    }
  }, [activeScan.error])

  useEffect(() => {
    if (!protectedRoute) return

    const data = protectedScan.data
    if (!data || typeof data !== 'object') return

    // ready_to_log redirect — QR is unlinked, send to new asset form with reservation ID only
    if ('kind' in data && (data as { kind?: unknown }).kind === 'ready_to_log') {
      const d = data as { qr_reservation_id?: unknown }
      const reservationId = typeof d.qr_reservation_id === 'string' ? d.qr_reservation_id : ''
      if (reservationId) {
        void navigate(
          `/assets/new?reservation_id=${encodeURIComponent(reservationId)}`,
          { replace: true }
        )
        return
      }
    }

    // EXISTING — unchanged
    if ('redirect' in data && (data as { redirect?: unknown }).redirect === true) {
      const tag =
        typeof (data as { asset_tag?: unknown }).asset_tag === 'string'
          ? (data as { asset_tag: string }).asset_tag
          : ref
      void navigate(`/assets/${encodeURIComponent(tag || ref)}`, { replace: true })
    }
  }, [navigate, protectedRoute, protectedScan.data, ref])

  const isNotFound = getErrorStatusCode(activeScan.error) === 404
  const error = activeScan.error ? getUserFacingMessage(activeScan.error, 'Asset not found') : ''
  const asset = (() => {
    const data = activeScan.data
    if (!data) return null
    if (protectedRoute && typeof data === 'object') {
      // Existing redirect skip
      if ('redirect' in data && (data as { redirect?: unknown }).redirect === true) {
        return null
      }
      // NEW — skip rendering during ready_to_log (redirect effect handles it)
      if ('kind' in data && (data as { kind?: unknown }).kind === 'ready_to_log') {
        return null
      }
    }
    return data as PublicScanAsset | AuthenticatedScanAsset
  })()

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualTag.trim()
    if (!trimmed) return
    const resolved = extractScanRefFromValue(trimmed)
    if (!resolved) {
      setScannerError('Unable to resolve asset tag from input.')
      return
    }
    setScannerError('')
    const target = protectedRoute ? `/assets/scan/${encodeURIComponent(resolved)}` : `/scan/${encodeURIComponent(resolved)}`
    void navigate(target)
  }

  const stopScanner = () => {
    scannerActiveRef.current = false
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    scannerBusyRef.current = false
    setScannerActive(false)
  }

  const detectFrame = async () => {
    if (!scannerActiveRef.current || !videoRef.current || !detectorRef.current || scannerBusyRef.current) {
      if (scannerActiveRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          void detectFrame()
        })
      }
      return
    }

    scannerBusyRef.current = true
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current)
      if (Array.isArray(barcodes) && barcodes.length > 0) {
        const rawValue = String(barcodes[0]?.rawValue || '').trim()
        const resolved = extractScanRefFromValue(rawValue)
        if (resolved) {
          stopScanner()
          const target = protectedRoute ? `/assets/scan/${encodeURIComponent(resolved)}` : `/scan/${encodeURIComponent(resolved)}`
          void navigate(target)
          return
        }
      }
    } catch {
      // Keep scanning loop running unless explicitly stopped.
    } finally {
      scannerBusyRef.current = false
      if (scannerActiveRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          void detectFrame()
        })
      }
    }
  }

  const startScanner = async () => {
    setScannerError('')
    if (!('BarcodeDetector' in window)) {
      setScannerError('Camera QR scanning is not supported in this browser. Use manual entry.')
      return
    }

    try {
      const win = window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
      const BarcodeDetectorCtor = win.BarcodeDetector
      if (!BarcodeDetectorCtor) {
        setScannerError('Camera QR scanning is not supported in this browser. Use manual entry.')
        return
      }
      detectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      scannerActiveRef.current = true
      setScannerActive(true)
      frameRef.current = requestAnimationFrame(() => {
        void detectFrame()
      })
    } catch (err) {
      logDevError('scan.start', err)
      setScannerError('Unable to access camera. Check browser permission and try again.')
      stopScanner()
    }
  }

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  if (protectedRoute && !id) {
    return (
      <main className="min-h-screen bg-app text-primary px-4 py-8">
        <div className="max-w-xl mx-auto bg-surface-2 border border-base rounded-xl p-5">
          <p className="text-accent text-xs uppercase tracking-widest mb-1">Scanner</p>
          <h1 className="text-xl font-bold">Scan or Enter Asset Name</h1>
          <p className="text-sm text-subtle mt-2">
            Use your device camera QR scanner, then open the scanned link, or enter the asset tag manually below.
          </p>

          <div className="mt-4">
            {!scannerActive ? (
              <button
                type="button"
                onClick={() => {
                  void startScanner()
                }}
                className="w-full bg-accent text-on-accent font-semibold px-4 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm"
              >
                Start Camera Scanner
              </button>
            ) : (
              <button
                type="button"
                onClick={stopScanner}
                className="w-full border border-base text-muted font-semibold px-4 py-2.5 rounded-lg hover:bg-surface-3 transition text-sm"
              >
                Stop Scanner
              </button>
            )}
            <video
              ref={videoRef}
              className={`mt-3 w-full rounded-lg border border-base bg-surface ${scannerActive ? 'block' : 'hidden'}`}
              autoPlay
              muted
              playsInline
            />
          </div>

          <form onSubmit={handleLookup} className="mt-4 flex gap-2">
            <input
              value={manualTag}
              onChange={(evt) => setManualTag(evt.target.value)}
              placeholder="e.g. AST-00012"
              className="flex-1 bg-surface border border-base text-primary rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[color:var(--accent)] transition"
            />
            <button
              type="submit"
              className="bg-accent text-on-accent font-semibold px-4 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm"
            >
              Lookup
            </button>
          </form>
          {scannerError ? <p className="text-accent text-xs mt-2">{scannerError}</p> : null}
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-app flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 border border-base text-subtle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h2" />
            <path d="M14 18h2" />
            <path d="M18 14h3" />
            <path d="M18 18h3" />
            <path d="M20 14v4" />
          </svg>
        </div>

        <p className="text-accent text-sm font-semibold uppercase tracking-widest mb-2">
          {isNotFound ? '404' : 'Error'}
        </p>
        <h1 className="text-2xl font-bold text-primary mb-2">
          {isNotFound ? 'Asset Not Found' : 'Something went wrong'}
        </h1>
        <p className="text-subtle text-sm max-w-xs mb-8">
          {isNotFound
            ? ref
              ? `No asset with tag "${ref}" exists in the system.`
              : 'This asset tag does not exist in the system.'
            : error}
        </p>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl border border-base bg-surface px-5 py-2.5 text-sm font-medium text-primary transition hover:border-accent-soft hover:bg-[color:var(--accent-soft)]/10 hover:text-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 5-7 7 7 7" />
          </svg>
          Go back
        </button>
      </main>
    )
  }

  if (!asset) {
    return (
      <main className="min-h-screen bg-app flex items-center justify-center">
        <p className="text-subtle">Loading asset...</p>
      </main>
    )
  }

  // Signed-in users (admin/IT Ops and employees viewing their own asset) are always
  // redirected to /assets/:tag by the resolver effect above. The only time we render
  // here is for public (unauthenticated) scans OR employees viewing an asset not
  // assigned to them â€” both cases use the PublicScanAsset shape.
  const publicAsset = asset as PublicScanAsset
  const heading = formatDisplay(publicAsset.category_name) || formatDisplay(publicAsset.asset_tag) || '-'

  if (typeof activeScan.data === 'object' && activeScan.data !== null && 'kind' in activeScan.data && (activeScan.data as { kind: unknown }).kind === 'unlinked') {
    return (
      <main className="min-h-screen bg-app text-primary flex flex-col items-center justify-center px-4 py-12">
        {/* Card */}
        <div className="w-full max-w-sm bg-surface border border-base rounded-2xl shadow-xl overflow-hidden">
          {/* Header strip */}
          <div className="bg-accent/10 border-b border-accent/20 px-6 py-5 flex flex-col items-center gap-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/15 text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M4 8V5h3" /><path d="M20 8V5h-3" />
                <path d="M4 16v3h3" /><path d="M20 16v3h-3" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </div>
            <p className="text-accent text-xs font-semibold uppercase tracking-widest">Unregistered QR</p>
            <h1 className="text-xl font-bold text-primary text-center">This QR is ready to log</h1>
          </div>

          {/* Body */}
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold">1</span>
                <p className="text-sm text-subtle">Sign in as Administrator.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold">2</span>
                <p className="text-sm text-subtle">Fill in the asset details in the form.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold">3</span>
                <p className="text-sm text-subtle">Submit — the asset tag is auto-generated and this QR gets linked permanently.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = `/assets/scan/${encodeURIComponent(ref)}`
                navigate(`/login?next=${encodeURIComponent(next)}`)
              }}
              className="w-full bg-accent text-on-accent font-semibold py-3 rounded-xl hover:bg-accent-hover transition shadow-accent text-sm"
            >
              Sign In to Log Asset
            </button>
          </div>
        </div>

        <p className="text-subtle text-xs mt-8">Powered by Asset Manager</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-8">
      <div className="text-center mb-8">
        <p className="text-accent text-xs uppercase tracking-widest mb-1">Asset</p>
        <h1 className="text-2xl font-bold">{heading}</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-xl mx-auto">
        {publicAsset.is_assigned ? (
          <>
            <Field label="Asset Tag" value={formatDisplay(publicAsset.asset_tag)} />
            <Field label="Category" value={formatDisplay(publicAsset.category_name)} />
            <Field label="User" value={formatDisplay(publicAsset.holder_name)} />
            <Field label="Department" value={formatDisplay(publicAsset.holder_department)} />
            <Field label="Employee ID" value={formatDisplay(publicAsset.holder_employee_business_id)} />
          </>
        ) : (
          <>
            <Field label="Asset Tag" value={formatDisplay(publicAsset.asset_tag)} />
            <Field label="Category" value={formatDisplay(publicAsset.category_name)} />
            <Field
              label="Inventory Status"
              value={<InventoryStatusBadge status={publicAsset.status} size="md" />}
            />
          </>
        )}
      </div>

      {/* "See more" only for truly unauthenticated visitors (public QR scan route) */}
      {!protectedRoute && publicAsset.asset_tag ? (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => {
              const next = `/assets/${publicAsset.asset_tag}`
              navigate(`/login?next=${encodeURIComponent(next)}`)
            }}
            className="bg-accent text-on-accent font-semibold px-6 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm shadow-accent"
          >
           Login / See More
          </button>
        </div>
      ) : null}

      <p className="text-center text-subtle text-xs mt-10">Powered by Asset Manager</p>
    </main>
  )
}

function extractScanRefFromValue(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const slashMatch = value.match(/\/(?:assets\/scan|scan)\/([^/?#]+)/i)
  if (slashMatch?.[1]) {
    const decoded = safeDecodeURIComponent(slashMatch[1]).trim()
    return decoded || null
  }

  // Fallback: accept plain asset tag payloads.
  return value
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function Field({
  label,
  value,
  subtle = false,
}: {
  label: string
  value: ReactNode
  subtle?: boolean
}) {
  return (
    <div className="bg-surface-2 border border-base rounded-xl px-4 py-3 flex justify-between items-start gap-4">
      <span className="text-subtle text-xs uppercase">{label}</span>
      <span className={`text-sm font-medium text-right ${subtle ? 'text-subtle' : 'text-primary'}`}>{value}</span>
    </div>
  )
}
