# Observability Consolidation — 5 containers → 1 (`grafana/otel-lgtm`)

**Date:** 2026-07-19
**Goal:** Replace `loki` + `tempo` + `prometheus` + `grafana` + `alloy` (5 containers) with a single
`grafana/otel-lgtm` container, and **fix log collection** (currently broken) in the process.

## Findings (why this is also a bug fix)

- Loki is **empty** — no labels, no streams. In Docker the log pipeline never worked:
  - Server logs to **stdout only** (`logging.basicConfig` in `main.py`), no FileHandler.
  - Alloy tails `./logs/ams_server.log`, but the **server service has no `./logs` mount**, so that
    file is never written in the container. Alloy's file-tail sees nothing.
  - `main.py` never initializes an OTel TracerProvider / LoggerProvider — traces/logs are not exported.
- Server **already ships all OTel deps** (`opentelemetry-sdk`, OTLP http+grpc exporters,
  `opentelemetry-instrumentation-*`). No new dependencies.
- In-app **Logs page** (`routers/observability.py`) queries Loki with labels
  `service="ams-server"` and `level=~"(?i)INFO|ERROR|WARNING|DEBUG"`. Any new pipeline must produce
  matching labels, OR the router's LogQL is realigned to lgtm's label scheme.
- Frontend telemetry is **off** (`VITE_OTEL_GRAFANA_ENABLED` not 'true') → no browser→collector CORS
  needed. `otel-telemetry.ts` already no-ops when disabled.

## Target architecture

```
ams-server ──OTLP(4317 gRPC)──▶ observability (grafana/otel-lgtm)
   logs  ── LoggerProvider + OTLPLogExporter        ├─ OTel Collector → Loki (logs)
   traces── FastAPI/httpx/asyncpg auto-instrument    ├─ Tempo (traces)
   metrics─ (Prometheus /metrics scrape OR OTLP)     ├─ Prometheus (metrics)
                                                      └─ Grafana (UI :3000 → publish 11200)
observability router ──HTTP :3100──▶ lgtm Loki  (in-app Logs page)
```

lgtm listens OTLP on 4317/4318, serves Grafana on 3000, Loki on 3100, Tempo 3200, Prometheus 9090
— all inside one container.

## Steps (small, verified)

### S1 — Server OTel bootstrap (`Server/core/observability.py`, new)
- `init_observability(app)` called from `create_app()` guarded by `settings.OTEL_GRAFANA_ENABLED`.
- Resource: `service.name=ams-server`, `service.namespace=ams`, `deployment.environment=<ENV>`.
- **Logs:** `LoggerProvider` + `BatchLogRecordProcessor(OTLPLogExporter)`; attach a
  `LoggingHandler(level=INFO)` to the **root logger** so every `logger.info(...)` (incl. the
  `[timing]` logs) is exported. Keep the existing stdout handler.
- **Traces:** `TracerProvider` + `BatchSpanProcessor(OTLPSpanExporter)`;
  `FastAPIInstrumentor`, `HTTPXClientInstrumentor`, `AsyncPGInstrumentor` (asyncpg) if available.
- **Metrics:** keep `prometheus_fastapi_instrumentator` `/metrics` (pull) — lgtm scrapes it (S3),
  or add OTLP metric export. Prefer keeping `/metrics` + lgtm scrape (least churn).
- Endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://observability:4317`).
- **Verify:** `pytest -q` still green; server boots with `OTEL_GRAFANA_ENABLED=true`.

### S2 — docker-compose (PROTECTED — human-owned; LOOP_ALLOW_PROTECTED)
- Delete services `loki`, `tempo`, `prometheus`, `grafana`, `alloy` and volumes
  `loki_data`, `tempo_data`, `prometheus_data`, `grafana_data` (keep `grafana_data`? no — lgtm uses
  its own path; optionally add `lgtm_data` for persistence).
- Add service `observability`:
  ```yaml
  observability:
    image: grafana/otel-lgtm:latest
    container_name: ams-observability
    ports:
      - "${GRAFANA_PUBLISH_PORT}:3000"   # Grafana
      - "4317"                            # OTLP gRPC (internal)
      - "4318"                            # OTLP HTTP (internal)
    volumes:
      - lgtm_data:/data                   # persist TSDB/loki/tempo across restarts
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 12
      start_period: 40s
    networks: [ams-observability]
    restart: unless-stopped
  ```
- `server.depends_on`: replace the 3 obs deps with `observability: { condition: service_healthy }`.
- `server.environment`: `LOKI_BASE_URL=http://observability:3100`,
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://observability:4317`, keep `OTEL_GRAFANA_ENABLED=true`.
- **Verify:** `docker compose config` valid; `docker compose up -d` → `observability` healthy.

### S3 — Metrics scrape (if kept as pull)
- lgtm supports a custom scrape file mounted at `/otel-lgtm/prometheus.yaml` — add a job scraping
  `ams-server:8000/metrics`. Optional; metrics aren't surfaced in-app.

### S4 — Align Logs-page LogQL to lgtm's Loki labels (`routers/observability.py`)
- lgtm's collector loki-exports OTLP logs; label keys are typically `service_name` (from
  `service.name`) and severity surfaces as `detected_level` / `severity_number`, **not** `service`
  and `level`. Bring lgtm up, push one log, then inspect real labels:
  `GET :3100/loki/api/v1/labels` and `/label/service_name/values`.
- Update the selector to the observed labels (e.g. `{service_name="ams-server"}` and level via
  `detected_level`), keeping the `LEVEL_MAP` mapping to whatever casing lgtm emits.
- **Verify:** `GET /api/observability/logs?service=ams-server` returns the just-emitted lines;
  `[timing]` logs from qr-batch/assign/return show up.

### S5 — End-to-end verification
- Bring stack up, hit a few endpoints (health, list assets, create a QR batch) to generate logs +
  the `[timing]` INFO lines + traces.
- Assert lgtm Loki has `service_name=ams-server` streams; in-app Logs page (Playwright) renders rows.
- Grafana on `:11200` shows Loki/Tempo/Prometheus datasources auto-provisioned.
- Confirm exactly one observability container is running (`docker compose ps`).

## Rollback
Old service defs are in git history; revert `docker-compose.yml` + remove `core/observability.py`
import to restore the 5-container stack.

## Notes
- Grafana dashboards: the in-app Grafana link was already removed; lgtm auto-provisions datasources.
  Custom dashboards (if any under `Observability/grafana/provisioning/dashboards`) can be mounted
  into lgtm at `/otel-lgtm/grafana/...` later — not required for the app to function.
- `Observability/{loki-config,tempo-config,prometheus.yml,alloy/config.alloy}` become dead after S2;
  leave on disk for rollback, delete in a follow-up once lgtm is proven.
