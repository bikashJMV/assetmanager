/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: overrides default QR link origin (`https://web-assetmanager.vercel.app`). See `getScanPageBaseUrl()`. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
