import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { ZoneContextManager } from '@opentelemetry/context-zone'

/**
 * Initializes the OpenTelemetry Web SDK.
 * This acts as an independent middleware check: it will ONLY initialize if
 * VITE_OTEL_GRAFANA_ENABLED is explicitly set to 'true'.
 *
 * NOTE (2026-07-19): browser fetch/XHR auto-instrumentation was REMOVED — every frontend API
 * call was being traced into observability, which is noise. Observability should reflect
 * server-side operations only (see the [timing] logs in the backend). The provider is left in
 * place (registers no auto-instrumentation) so custom manual spans can still be added later if
 * ever needed; with nothing instrumented it emits nothing on its own.
 */
export function startOtelTelemetry() {
  const isEnabled = import.meta.env.VITE_OTEL_GRAFANA_ENABLED === 'true'

  if (!isEnabled) {
    console.debug('[OTel] Tracing is disabled via VITE_OTEL_GRAFANA_ENABLED')
    return
  }

  const exporterEndpoint = import.meta.env.VITE_OTEL_EXPORTER_ENDPOINT || 'http://localhost:11400/v1/traces'

  try {
    const provider = new WebTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'ams-client',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        'telemetry.sdk.name': 'opentelemetry',
        'telemetry.sdk.language': 'webjs',
      }),
    })

    const exporter = new OTLPTraceExporter({
      url: exporterEndpoint,
      // No headers needed for local Alloy
    })

    provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
      maxQueueSize: 100,
      maxExportBatchSize: 10,
      scheduledDelayMillis: 2000,
      exportTimeoutMillis: 10000,
    }))

    provider.register({
      contextManager: new ZoneContextManager(),
    })

    // Intentionally NO fetch/XHR auto-instrumentation — frontend API calls must not flood
    // observability. Server-side [timing] logs carry the operation durations instead.

    console.info('[OTel] Web SDK initialized (no auto-instrumentation) →', exporterEndpoint)
  } catch (err) {
    console.error('[OTel] Failed to initialize OpenTelemetry:', err)
  }
}
