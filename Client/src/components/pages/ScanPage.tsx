import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicScanAsset, scanAsset } from '../../api'
import { getUserFacingMessage, logDevError } from '../../utils/errors'
import { formatDisplay } from '../../utils/formatDisplay'

type ScanAsset = {
  asset_tag: string | null
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
  const detectorRef = useRef<any>(null)
  const frameRef = useRef<number | null>(null)
  const scannerBusyRef = useRef(false)
  const [manualTag, setManualTag] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [asset, setAsset] = useState<ScanAsset | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setAsset(null)
      setError('')
      return
    }
    const resolver = protectedRoute ? scanAsset : getPublicScanAsset
    resolver(id)
      .then((data) => setAsset(data as ScanAsset))
      .catch((err) => {
        logDevError('scan.asset', err)
        setError(getUserFacingMessage(err, 'Asset not found'))
      })
  }, [id, protectedRoute])

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
    void navigate(`/assets/scan/${encodeURIComponent(resolved)}`)
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
          void navigate(`/assets/scan/${encodeURIComponent(resolved)}`)
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
      const BarcodeDetectorCtor = (window as any).BarcodeDetector
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (protectedRoute && !id) {
    return (
      <main className="min-h-screen bg-app text-primary px-4 py-8">
        <div className="max-w-xl mx-auto bg-surface-2 border border-base rounded-xl p-5">
          <p className="text-accent text-xs uppercase tracking-widest mb-1">Scanner</p>
          <h1 className="text-xl font-bold">Scan or Enter Asset Tag</h1>
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
              className={`mt-3 w-full rounded-lg border border-base bg-black/40 ${scannerActive ? 'block' : 'hidden'}`}
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

  const customEntries = Object.entries(asset.custom_fields || {})
  const heading = [asset.manufacturer, asset.model]
    .map((value) => formatDisplay(value))
    .filter((value) => value !== '-')
    .join(' ')

  return (
    <main className="min-h-screen bg-app text-primary px-4 py-8">
      <div className="text-center mb-8">
        <p className="text-accent text-xs uppercase tracking-widest mb-1">Asset Passport</p>
        <h1 className="text-2xl font-bold">{heading || '-'}</h1>
        <p className="text-subtle text-sm mt-1">{formatDisplay(asset.asset_tag)}</p>
      </div>

      <div className="flex justify-center mb-8">
        <span className="bg-accent text-on-accent border border-[color:var(--accent-soft)] px-4 py-1.5 rounded-full text-sm font-medium">
          Inventory Status: {asset.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-xl mx-auto">
        <Field label="Category" value={formatDisplay(asset.category)} />
        <Field label="Location" value={formatDisplay(asset.location)} />
        <Field label="Current Holder" value={formatDisplay(asset.holder)} />
        <Field label="Holder ERP/HR Status" value={asset.holder_erp_status} subtle />

        {customEntries.map(([key, value]) => (
          <Field key={key} label={key} value={formatDisplay(value)} />
        ))}
      </div>

      {asset.holder_erp_status.toLowerCase().includes('inactive') && (
        <p className="text-center text-subtle text-xs mt-6">
          Holder ERP/HR inactive flag is an admin audit signal.
        </p>
      )}

      <p className="text-center text-subtle text-xs mt-10">Powered by AMS</p>
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

function Field({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className="bg-surface-2 border border-base rounded-xl px-4 py-3 flex justify-between items-start gap-4">
      <span className="text-subtle text-xs uppercase">{label}</span>
      <span className={`text-sm font-medium text-right ${subtle ? 'text-subtle' : 'text-primary'}`}>{value}</span>
    </div>
  )
}
