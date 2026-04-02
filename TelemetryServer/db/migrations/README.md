# Telemetry database migrations

Run scripts in order on the **dedicated telemetry Supabase** (or Postgres) project.

| File | Purpose |
|------|--------|
| `001_telemetry_schema.sql` | Creates schema `telemetry` and all tables + indexes expected by `TelemetryServer`. |

After applying, set `TELEMETRY_DATABASE_URL` in `TelemetryServer/.env` and start the app.
