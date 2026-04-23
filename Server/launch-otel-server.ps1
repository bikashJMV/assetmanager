#!/usr/bin/env pwsh

$env:OTEL_SERVICE_NAME = "ams-server"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
$env:OTEL_TRACES_EXPORTER = "otlp"
$env:OTEL_METRICS_EXPORTER = "none"
$env:OTEL_LOGS_EXPORTER = "none"

# Start with OTel instrumentation and redirect logs using Out-File to force UTF-8 without losing env vars
opentelemetry-instrument python -m uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | Out-File -FilePath ../logs/ams_server.log -Encoding utf8 -Append
