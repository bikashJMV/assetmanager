/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: origin used in QR codes (`https://your.app` or `http://192.168.x.x:5173`). See `getScanPageBaseUrl()`. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string
  /** If `true`, `getQrDataUriForAssetTag` may return stale `asset_logs.qr_code` (e.g. localhost). Default: trust stored only in dev without `VITE_PUBLIC_APP_ORIGIN`. */
  readonly VITE_TRUST_STORED_ASSET_QR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
