/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: overrides default QR link origin (`https://web-assetmanager.vercel.app`). See `getScanPageBaseUrl()`. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string
  /** Master on/off switch for telemetry. Set to "true" to enable. */
  readonly VITE_TELEMETRY_ENABLED?: string
  /** Full URL of the TelemetryServer ingest endpoint (e.g. https://…/telemetry/events). */
  readonly VITE_TELEMETRY_INGEST_URL?: string
  /** URL used to fetch a short-lived ingest token. Defaults to /telemetry/ingest-token. */
  readonly VITE_TELEMETRY_TOKEN_URL?: string
  /** Master on/off switch for OpenTelemetry tracing to Grafana stack. */
  readonly VITE_OTEL_GRAFANA_ENABLED?: string
  /** OTLP/HTTP collector endpoint (Alloy). Defaults to http://localhost:14318 */
  readonly VITE_OTEL_EXPORTER_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
