import QRCode from 'qrcode'

const PRODUCTION_QR_APP_ORIGIN = 'https://web-assetmanager.vercel.app'

/**
 * Origin embedded in asset QR codes (`/scan/{tag}`).
 * Defaults to production so scans work from a phone even when the admin UI runs on localhost.
 * Prefer `FRONTEND_URL` (matches server `FRONTEND_URL`); fall back to `VITE_PUBLIC_APP_ORIGIN`.
 */
export function getScanPageBaseUrl(): string {
  const raw = import.meta.env.FRONTEND_URL ?? import.meta.env.VITE_PUBLIC_APP_ORIGIN
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/\/$/, '')
    if (trimmed && /^https?:\/\//i.test(trimmed)) {
      return trimmed
    }
  }
  return PRODUCTION_QR_APP_ORIGIN
}

export async function buildAssetQrDataUri(assetTag: string): Promise<string> {
  const normalizedTag = assetTag.trim()
  if (!normalizedTag) {
    throw new Error('Asset tag is required to generate QR')
  }

  const base = getScanPageBaseUrl()
  const scanUrl = `${base}/scan/${encodeURIComponent(normalizedTag)}`
  return QRCode.toDataURL(scanUrl, { margin: 2, width: 320 })
}

