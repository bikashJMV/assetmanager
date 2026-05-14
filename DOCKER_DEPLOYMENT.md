# Docker Deployment

This deployment uses env-driven ports and keeps raw infrastructure services private where possible.

## Public Ports

| Port | Service | Notes |
|------|---------|-------|
| `11000` | Client | React app served by nginx |
| `11100` | Server | FastAPI backend |
| `11200` | Grafana | Dashboard UI |
| `11300` | pgAdmin | Database GUI |
| `11400` | OTLP HTTP | Browser trace export endpoint |

## Internal Only

| Port | Service |
|------|---------|
| `5432` | PostgreSQL |
| `3100` | Loki |
| `9090` | Prometheus |
| `3200` | Tempo |
| `4317` | OTLP gRPC |
| `12345` | Alloy UI |

## Required Env Values

Use `assetmanager/.env` on the deployment server. Keep real env files ignored.

```env
CLIENT_PUBLISH_PORT=11000
SERVER_PUBLISH_PORT=11100
PGADMIN_PUBLISH_PORT=11300
FRONTEND_URL=https://your-org-host:11000
ALLOWED_ORIGINS=https://your-org-host:11000
VITE_API_URL=http://your-org-host:11100
VITE_PUBLIC_APP_ORIGIN=https://your-org-host:11000
VITE_OTEL_EXPORTER_ENDPOINT=http://your-org-host:11400/v1/traces
VITE_GRAFANA_DASHBOARD_URL_FOR_ITOPS=http://your-org-host:11200
LOKI_BASE_URL=http://loki:3100
```

Observability settings are loaded from `Observability/.env` (copy from `Observability/.env.observability.example`). The root compose file references this file for Grafana (see `docker-compose.yml`).

```env
GRAFANA_PUBLISH_PORT=11200
OTLP_HTTP_PUBLISH_PORT=11400
OTEL_ALLOWED_ORIGIN=http://your-org-host:11000
AMS_SERVER_METRICS_TARGET=ams-server:8000
```

## Start order

The stack is defined in a **single** file: `assetmanager/docker-compose.yml`. It includes Loki, Tempo, Prometheus, Grafana, Alloy, Postgres, the AMS server, the client, and pgAdmin. Docker creates the shared `ams-observability` network when you start services.

```bash
cd assetmanager
cp Observability/.env.observability.example Observability/.env   # fill passwords / ports
# ensure assetmanager/.env is configured (see Required Env Values above)
docker compose up --build -d
```

The server joins `ams-observability` so it can query Loki at `http://loki:3100` without exposing Loki on the public host.

## Client Image

Vite embeds `VITE_*` values at build time. Rebuild the client image after changing frontend env values:

```bash
docker compose build --no-cache client
docker compose up -d client
```

## Smoke Checks

```text
http://your-org-host:11000
http://your-org-host:11100/api/health
http://your-org-host:11200
http://your-org-host:11300
```

For OTLP/HTTP traces, the SDK **POST**s to `http://your-org-host:11400/v1/traces`. Opening that URL in a browser often shows `404 page not found` (no `GET /` handler); that is expected for the collector.

Also check that logs still load through the app via the backend `/observability/logs` endpoint.

## Database Management

### Export Database (Backup)
```bash
docker exec -t ams-postgres-docker pg_dump -U assetmanager_user -d assetmanager_db > backup.sql
```

### Import Database (Restore)
```bash
cat backup.sql | docker exec -i ams-postgres-docker psql -U assetmanager_user -d assetmanager_db
```
