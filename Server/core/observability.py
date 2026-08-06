"""OpenTelemetry bootstrap — exports logs + traces to the grafana/otel-lgtm collector via OTLP.

Enabled only when settings.OTEL_GRAFANA_ENABLED is true. Logs are the product-critical signal:
the in-app Logs page queries the lgtm-bundled Loki, so a LoggingHandler is attached to the root
logger and every logger.info/warning/error (including the `[timing]` lines) is exported over OTLP.
Metrics stay on the existing Prometheus `/metrics` endpoint (scraped by lgtm) — not wired here.
"""

import logging

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry._logs import set_logger_provider

from core.settings import settings

logger = logging.getLogger(__name__)

_initialized = False


def init_observability(app) -> None:
    """Wire OTLP log + trace export. Idempotent; a no-op when telemetry is disabled."""
    global _initialized
    if _initialized or not settings.OTEL_GRAFANA_ENABLED:
        return

    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
    insecure = endpoint.startswith("http://")

    resource = Resource.create(
        {
            "service.name": "ams-server",
            "service.namespace": "ams",
            "deployment.environment": settings.ENV,
        }
    )

    # ── Logs → Loki (via lgtm collector) ──
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(endpoint=endpoint, insecure=insecure))
    )
    set_logger_provider(logger_provider)
    otlp_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    logging.getLogger().addHandler(otlp_handler)

    # ── Traces → Tempo (via lgtm collector) ──
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=insecure))
    )
    trace.set_tracer_provider(tracer_provider)

    _instrument(app)
    _initialized = True
    logger.info("[observability] OTLP export enabled → %s (service.name=ams-server)", endpoint)


def _instrument(app) -> None:
    """Best-effort auto-instrumentation; each guard keeps a missing extra from breaking boot."""
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception as exc:  # pragma: no cover - instrumentation is optional
        logger.warning("[observability] FastAPI instrumentation skipped: %s", exc)

    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception as exc:  # pragma: no cover - instrumentation is optional
        logger.warning("[observability] httpx instrumentation skipped: %s", exc)
