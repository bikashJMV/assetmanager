/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: origin used in QR codes (`https://your.app` or `http://192.168.x.x:5173`). See `getScanPageBaseUrl()`. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
