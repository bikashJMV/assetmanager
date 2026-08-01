#!/usr/bin/env bash
# db.sh — no-GUI Postgres management for AMS (replaces pgAdmin).
# Runs everything through the `ams-postgres-docker` container; reads creds from ./.env.
#
# Usage:
#   scripts/db.sh                      # interactive psql shell
#   scripts/db.sh "SELECT count(*) FROM assets;"   # run one SQL statement
#   scripts/db.sh tables               # list tables
#   scripts/db.sh apply DB/init.sql    # apply a .sql file (schema/migration)
#   scripts/db.sh backup               # pg_dump -> DB/backups/ams_YYYYmmdd_HHMMSS.sql
#   scripts/db.sh restore <file.sql>   # restore from a dump (DESTRUCTIVE)
set -euo pipefail

CONTAINER="ams-postgres-docker"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

getenv() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r'; }
DB_USER="$(getenv POSTGRES_USER)"
DB_NAME="$(getenv POSTGRES_DB)"

psql_exec() { docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

cmd="${1:-shell}"
case "$cmd" in
  shell)   docker exec -it "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" ;;
  tables)  psql_exec -c "\dt" ;;
  apply)   psql_exec -v ON_ERROR_STOP=1 < "$ROOT/${2:?usage: db.sh apply <file.sql>}" ;;
  backup)
    mkdir -p "$ROOT/DB/backups"
    out="$ROOT/DB/backups/ams_$(date +%Y%m%d_%H%M%S).sql"
    docker exec -i "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$out"
    echo "backup -> $out" ;;
  restore) psql_exec -v ON_ERROR_STOP=1 < "${2:?usage: db.sh restore <file.sql>}" ;;
  *)       psql_exec -c "$cmd" ;;   # treat any other arg as a SQL statement
esac
