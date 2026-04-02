-- Run this in the dedicated Supabase (telemetry) project: SQL editor or psql.
-- Schema keeps telemetry tables isolated from any other app objects in the same DB.

CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.telemetry_ingest_keys (
  source text NOT NULL,
  event_id text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  PRIMARY KEY (source, event_id)
);

CREATE TABLE IF NOT EXISTS telemetry.telemetry_events_success (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  event_domain text,
  route_pattern text,
  method text,
  status_code integer,
  duration_ms integer,
  error_category text,
  operation_name text,
  table_or_rpc text,
  actor_role text,
  session_id text,
  request_id text,
  trace_id text,
  environment text NOT NULL,
  priority text NOT NULL,
  sample_rate double precision NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry.telemetry_events_error (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  event_domain text,
  route_pattern text,
  method text,
  status_code integer,
  duration_ms integer,
  error_category text,
  operation_name text,
  table_or_rpc text,
  actor_role text,
  session_id text,
  request_id text,
  trace_id text,
  environment text NOT NULL,
  priority text NOT NULL,
  sample_rate double precision NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry.telemetry_events_general (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  event_domain text,
  route_pattern text,
  operation_name text,
  table_or_rpc text,
  actor_role text,
  session_id text,
  request_id text,
  trace_id text,
  environment text NOT NULL,
  priority text NOT NULL,
  sample_rate double precision NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry.telemetry_dead_letter (
  id bigserial PRIMARY KEY,
  received_at timestamptz NOT NULL,
  failure_stage text NOT NULL,
  failure_reason text NOT NULL,
  source text,
  event_id text,
  schema_version integer,
  sanitized_payload text NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry.telemetry_access_audit (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  endpoint text NOT NULL,
  environment text,
  query_window text,
  result_size integer,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_tes_created_at ON telemetry.telemetry_events_success (created_at);
CREATE INDEX IF NOT EXISTS ix_tee_created_at ON telemetry.telemetry_events_error (created_at);
CREATE INDEX IF NOT EXISTS ix_teg_created_at ON telemetry.telemetry_events_general (created_at);
CREATE INDEX IF NOT EXISTS ix_tes_env_created_at ON telemetry.telemetry_events_success (environment, created_at);
CREATE INDEX IF NOT EXISTS ix_tee_env_created_at ON telemetry.telemetry_events_error (environment, created_at);
CREATE INDEX IF NOT EXISTS ix_tes_route_created_at ON telemetry.telemetry_events_success (route_pattern, created_at);
CREATE INDEX IF NOT EXISTS ix_tee_route_created_at ON telemetry.telemetry_events_error (route_pattern, created_at);
CREATE INDEX IF NOT EXISTS ix_tes_request_id ON telemetry.telemetry_events_success (request_id);
CREATE INDEX IF NOT EXISTS ix_tee_request_id ON telemetry.telemetry_events_error (request_id);
