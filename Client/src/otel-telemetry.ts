import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request'

/**
 * Initializes the OpenTelemetry Web SDK.
 * This acts as an independent middleware check: it will ONLY initialize if
 * VITE_OTEL_GRAFANA_ENABLED is explicitly set to 'true'.
 */
export function startOtelTelemetry() {
  const isEnabled = import.meta.env.VITE_OTEL_GRAFANA_ENABLED === 'true'
  
  if (!isEnabled) {
    console.debug('[OTel] Tracing is disabled via VITE_OTEL_GRAFANA_ENABLED')
    return
  }

  const exporterEndpoint = import.meta.env.VITE_OTEL_EXPORTER_ENDPOINT || 'http://localhost:14318/v1/traces'

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

    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          ignoreUrls: [/localhost:14318/],
          clearTimingResources: true,
        }),
        new XMLHttpRequestInstrumentation({
          ignoreUrls: [/localhost:14318/],
        }),
      ],
    })

    console.info('[OTel] OpenTelemetry Web SDK initialized, exporting to', exporterEndpoint)
  } catch (err) {
    console.error('[OTel] Failed to initialize OpenTelemetry:', err)
  }
}
