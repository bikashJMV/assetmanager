import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicScanAsset, scanAsset, type PublicScanAsset } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
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
  const [manualTag, setManualTag] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [asset, setAsset] = useState<PublicScanAsset | AuthenticatedScanAsset | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setAsset(null)
      setError('')
      return
    }

    let cancelled = false

    void (async () => {
      try {
        if (!protectedRoute) {
          // Public / unauthenticated path
          const data = await getPublicScanAsset(id)
          if (!cancelled) setAsset(data)
          return
        }

        // Authenticated path: check role + ownership in one round-trip
        const data = await scanAsset(id)
        if (cancelled) return

        if (data.is_privileged || data.is_own_asset) {
          // Admin/IT Ops or employee viewing their own asset → go straight to asset detail
          void navigate(`/assets/${encodeURIComponent(data.asset_tag ?? id)}`, { replace: true })
          return
        }

        // Employee viewing an asset not assigned to them → show limited public-style view
        const publicData = await getPublicScanAsset(id)
        if (!cancelled) setAsset(publicData)
      } catch (err) {
        if (!cancelled) {
          logDevError('scan.asset', err)
          setError(getUserFacingMessage(err, 'Asset not found'))
        }
      }
    })()

    return () => { cancelled = true }
  }, [id, protectedRoute, navigate])

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualTag.trim()
    if (!trimmed) return
    const resolved = extractAssetTagFromScanValue(trimmed)
    if (!resolved) {
      setScannerError('Unable to resolve asset tag from input.')
      return
    }
    setScannerError('')
    const target = protectedRoute ? `/assets/scan/${encodeURIComponent(resolved)}` : `/scan/${encodeURIComponent(resolved)}`
    void navigate(target)
  }

  const stopScanner = () => {
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
    if (!videoRef.current || !scannerActive || !detectorRef.current || scannerBusyRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        void detectFrame()
      })
      return
    }

    scannerBusyRef.current = true
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current)
      if (Array.isArray(barcodes) && barcodes.length > 0) {
        const rawValue = String(barcodes[0]?.rawValue || '').trim()
        const resolved = extractAssetTagFromScanValue(rawValue)
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
      frameRef.current = requestAnimationFrame(() => {
        void detectFrame()
      })
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
                className="w-full bg-accent text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm"
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
              className="bg-accent text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm"
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
    const isNotFound = error.toLowerCase().includes('not find')
    return (
      <main className="min-h-screen bg-app flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-accent text-5xl font-bold">{isNotFound ? '404' : 'Error'}</p>
          <p className="mt-2 text-subtle">{error}</p>
        </div>
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
  // assigned to them — both cases use the PublicScanAsset shape.
  const publicAsset = asset as PublicScanAsset
  const heading = formatDisplay(publicAsset.category_name) || formatDisplay(publicAsset.asset_tag) || '-'

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
            <Field label="Employee ID" value={formatDisplay(publicAsset.holder_employee_code)} />
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
            className="bg-accent text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-accent-hover transition text-sm shadow-accent"
          >
            See more
          </button>
        </div>
      ) : null}

      <p className="text-center text-subtle text-xs mt-10">Powered by Asset Manager</p>
    </main>
  )
}

function extractAssetTagFromScanValue(raw: string): string | null {
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
