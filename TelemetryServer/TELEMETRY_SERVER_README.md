# Telemetry Server

Independent FastAPI service for ingesting, storing, and querying Asset Manager telemetry.

This service uses its own Postgres database schema and does not share the main AMS migration set.

## What it does

- Accepts server-to-server and signed browser telemetry ingest
- Stores telemetry in Postgres tables under the telemetry schema
- Uses an in-memory priority queue before persistence
- Exposes protected query endpoints for overview, raw events, alerts, and retention
- Exposes public health and metrics endpoints

## First step

Apply `db/migrations/001_telemetry_schema.sql` to a dedicated telemetry database before starting the service.

## Project map

- `main.py` - FastAPI app, lifespan, DB pool, queue startup
- `core/settings.py` - environment parsing and defaults
- `core/auth.py` - ingest auth and query-key auth
- `core/queue.py` - in-memory priority queue
- `core/ratelimit.py` - in-memory rate limiter
- `core/redaction.py` - metadata sanitization
- `routers/ingest.py` - ingest endpoints
- `routers/query.py` - query, health, metrics, retention endpoints
- `services/storage.py` - async Postgres access
- `services/metrics.py` - process-local counters and gauges
- `models/schemas.py` - Pydantic request and event models

## Environment variables

Set these in `TelemetryServer/.env` or your deployment environment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TELEMETRY_DATABASE_URL` | Yes | Postgres connection string for the telemetry database |
| `TELEMETRY_DATABASE_SCHEMA` | No | Schema name, default `telemetry` |
| `TELEMETRY_DB_POOL_MIN_SIZE` | No | Minimum asyncpg pool size |
| `TELEMETRY_DB_POOL_MAX_SIZE` | No | Maximum asyncpg pool size |
| `TELEMETRY_DB_SSL` | No | TLS toggle; defaults to `true` |
| `TELEMETRY_ENV` | No | Logical environment label |
| `TELEMETRY_QUEUE_MAX_SIZE` | No | Total queue capacity |
| `TELEMETRY_QUEUE_WORKERS` | No | Worker count |
| `TELEMETRY_EVENT_MAX_BATCH` | No | Maximum events per batch request |
| `TELEMETRY_EVENT_MAX_BYTES` | No | Maximum serialized size per event |
| `TELEMETRY_INGEST_MAX_BATCH_BYTES` | No | Maximum serialized size per batch |
| `TELEMETRY_INGEST_SERVER_TOKEN` | For server ingest | Shared header token for trusted server-to-server ingest |
| `TELEMETRY_INGEST_TOKEN_SECRET` | For browser ingest | HMAC secret used to verify browser tokens |
| `TELEMETRY_SAMPLE_SERVER_SUCCESS` | No | Sampling rate for successful server events |
| `TELEMETRY_SAMPLE_CLIENT_DATA_SUCCESS` | No | Sampling rate for successful client data events |
| `TELEMETRY_SAMPLE_CLIENT_ENGAGEMENT` | No | Sampling rate for engagement events |
| `TELEMETRY_CRITICAL_SERVER_ROUTES` | No | Always-keep route patterns |
| `TELEMETRY_CRITICAL_CLIENT_OPERATIONS` | No | Always-keep RPC or operation names |
| `TELEMETRY_RATE_LIMIT_PER_MINUTE` | No | Token bucket refill rate |
| `TELEMETRY_RATE_LIMIT_BURST` | No | Token bucket burst size |
| `TELEMETRY_RETAIN_SUCCESS_DAYS` | No | Retention window for success rows |
| `TELEMETRY_RETAIN_ERROR_DAYS` | No | Retention window for error rows |
| `TELEMETRY_RETAIN_KEYS_HOURS` | No | Retention window for dedupe keys |
| `TELEMETRY_RETAIN_GENERAL_DAYS` | No | Retention window for general rows |
| `TELEMETRY_ALLOWED_ORIGINS` | No | CORS allowlist |
| `TELEMETRY_LOG_LEVEL` | No | Python log level |

## Current implementation note

Protected query routes currently read `settings.ITOPS_QUERY_KEY`, and `TelemetryServer/core/settings.py` populates that value from `TELEMETRY_ITOPS_QUERY_KEY_NEW_NEW`.

That means:

- `TelemetryServer/` currently expects `TELEMETRY_ITOPS_QUERY_KEY_NEW_NEW` for query auth
- `Server/` currently sends `TELEMETRY_ITOPS_QUERY_KEY_NEW`

If those names are not aligned in your environment or code, `/analysis` and direct telemetry query endpoints will fail auth.

## Local development

```bash
cd TelemetryServer
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

Useful URLs:

- `http://localhost:8010/docs`
- `http://localhost:8010/telemetry/health`
- `http://localhost:8010/telemetry/metrics`

## Endpoints

### Ingest

- `POST /telemetry/events`
- `POST /telemetry/events/single`

### Protected query routes

- `GET /telemetry/overview`
- `GET /telemetry/overview/events`
- `GET /telemetry/alerts`
- `POST /telemetry/retention/run`

### Public routes

- `GET /`
- `GET /telemetry/health`
- `GET /telemetry/metrics`

## Behavior notes

- The queue is in-memory only. Events not yet flushed to Postgres can be lost on process restart or serverless cold replacement.
- Browser ingest tokens must be signed by the main AMS server with the same `TELEMETRY_INGEST_TOKEN_SECRET`.
- Health and metrics are currently unauthenticated.
- Storage is durable only after rows are written to Postgres.

## Related docs

- [`../README.md`](../README.md)
- [`./db/migrations/README.md`](./db/migrations/README.md)
- [`../Server/SERVER_README.md`](../Server/SERVER_README.md)
