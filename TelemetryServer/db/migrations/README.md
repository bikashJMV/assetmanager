# Telemetry Database Migrations

Apply these migrations to the dedicated telemetry database, not the main AMS database.

## Order

1. `001_telemetry_schema.sql`

## What it creates

- Schema `telemetry`
- Dedup table for ingest keys
- Success, error, and general event tables
- Dead-letter table
- Access-audit table
- Supporting indexes used by `TelemetryServer/`

## When to run it

- Before starting `TelemetryServer/` for the first time
- Before testing browser or server telemetry ingest against a fresh database

## Apply methods

- Supabase SQL editor
- `psql`
- Any migration runner you already use for the telemetry database

## Related docs

- [`../../TELEMETRY_SERVER_README.md`](../../TELEMETRY_SERVER_README.md)
