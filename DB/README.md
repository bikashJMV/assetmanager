# DB — Database

PostgreSQL 15 schema and bootstrap configuration for Asset Manager. The `init.sql` file is a full `pg_dump` of the database schema including tables, views, functions, triggers, sequences, and seed category data.

## What this folder contains

| File / Folder | Description |
| --- | --- |
| `init.sql` | Full schema dump (pg_dump format). Apply this to a fresh database to create all tables, views, functions, and seed categories. |
| `.env.example` | Template for Postgres and pgAdmin environment variables |
| `.env` | Local env file (git-ignored) |
| `.env.production` | Production env file (git-ignored) |
| `postgres/` | Postgres data directory (git-ignored; created by Docker) |

## Database schema

### Tables

| Table | Description |
| --- | --- |
| `assets` | Core asset records: `asset_tag`, `category_id`, `serial_number`, `status`, `purchase_date`, `warranty_expiry`, `custom_fields` (JSONB), `metadata` (JSONB), `is_deleted`, `qr_code` |
| `asset_categories` | Asset categories: `slug`, `name`, `description`, `is_active` |
| `asset_assignments` | Assignment history: `asset_id`, `employee_id`, `assigned_at`, `returned_at`, `source`, `notes`. Open assignment = `returned_at IS NULL` |
| `asset_components` | Sub-components of an asset: `component_type`, `model`, `serial_number`, `manufacturer_id` |
| `asset_events` | Structured audit events: `event_type` (enum), `actor_id`, `payload` (JSONB), `ip_address`, `user_agent` |
| `asset_logs` | Human-readable audit log: `actor_employee_id`, `note`, `qr_code`, `metadata` (JSONB) |
| `employees` | Employee directory: `employee_id` (business code), `name`, `email` (citext), `department_id`, `auth_user_id`, `role`, `is_active`, `erp_active`, `is_deleted` |
| `departments` | Department names |
| `manufacturers` | Manufacturer names and websites |
| `locations` | Location codes and addresses |
| `custom_field_definitions` | Per-category custom field schema: `field_key`, `label`, `data_type`, `is_required`, `options`, `sort_order` |
| `recycle_bin_entries` | Soft-deleted entities: `entity_type` (`asset` or `employee`), `entity_id`, `label`, `payload` (JSONB snapshot), `deleted_by_employee_id`, `restored_at` |
| `admin_audit_log` | Admin action audit log: `admin_id`, `target_user_id`, `action` (enum) |
| `role_audit_log` | Role change audit log: `actor_employee_id`, `target_employee_id`, `old_role`, `new_role`, `action` (enum) |

### Views

| View | Description |
| --- | --- |
| `v_asset_inventory` | Joins `assets` with `asset_categories`, `manufacturers`, `locations`, open `asset_assignments`, `employees`, and `departments`. Excludes soft-deleted assets (`is_deleted = false`). This is the primary read view for the assets API. |
| `v_employee_directory` | Joins `employees` with `departments`. Excludes employees with an active (non-restored) `recycle_bin_entries` row. |
| `v_recycle_bin` | Simple view over `recycle_bin_entries`. |
| `v_warranty_notifications` | Assets with non-null `warranty_expiry` that are not deleted. Computes `days_remaining`, `severity` (`expired` or `due_soon` within 30 days), and a human-readable `message`. |

### Functions

| Function | Description |
| --- | --- |
| `fn_next_asset_tag()` | Returns the next `AST-#####` tag by scanning existing non-deleted asset tags matching `^AST-[0-9]+$`. Returns `AST-00001` if no tags exist. |
| `fn_set_updated_at()` | Trigger function that sets `updated_at = now()` on row update. |

### Enums

| Enum | Values |
| --- | --- |
| `asset_status` | `in_stock`, `assigned`, `in_repair`, `retired`, `lost`, `disposed` |
| `asset_event_type` | `asset_created`, `asset_updated`, `asset_assigned`, `asset_returned`, `asset_deleted`, `asset_restored`, `qr_scanned`, `lifecycle_changed`, `bulk_imported` |
| `admin_audit_action` | `created`, `updated`, `deleted`, `restored`, `bulk_imported` |
| `role_audit_action` | `promoted`, `demoted` |
| `custom_field_data_type` | `text`, `number`, `date`, `boolean`, `select` |

### Extensions

- `citext` — case-insensitive text type (used for `employees.email`)
- `pgcrypto` — cryptographic functions (used for `gen_random_uuid()`)

### Seed data

`init.sql` includes seed rows for `asset_categories`:

| Slug | Name |
| --- | --- |
| `laptop` | Laptop |
| `desktop` | Desktop |
| `monitor` | Monitor |
| `printer` | Printer |
| `pen-drive` | Pen Drive |
| `other` | Other |
| `mouse` | Mouse |
| `keyboard` | Keyboard |
| `mobile` | Mobile |
| `locker` | Locker |

## Local setup

### Option 1: Apply schema to an existing Postgres instance

```bash
# Create the database and user
psql -U postgres -c "CREATE USER assetmanager_user WITH PASSWORD 'your_password';"
psql -U postgres -c "CREATE DATABASE assetmanager_db OWNER assetmanager_user;"

# Apply the schema
psql -U assetmanager_user -d assetmanager_db -f DB/init.sql
```

### Option 2: Docker Compose (from `assetmanager/`)

The root [`docker-compose.yml`](../docker-compose.yml) defines a `postgres` service with `container_name: ams-postgres-docker` and loads `DB/init.sql` on first start. Configure `assetmanager/.env` with `POSTGRES_*` and run:

```bash
cd assetmanager
docker compose up -d postgres
```

Alternatively start the full stack (observability + app + Postgres) as described in [`../DOCKER_DEPLOYMENT.md`](../DOCKER_DEPLOYMENT.md).

## Environment variables

Copy `DB/.env.example` to `DB/.env` and fill in values. These are used by the Docker Compose Postgres and pgAdmin services.

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_DB` | `assetmanager_db` | Database name |
| `POSTGRES_USER` | `assetmanager_user` | Database user |
| `POSTGRES_PASSWORD` | — | **Required.** Use a strong password. |
| `POSTGRES_PUBLISH_PORT` | `5432` | Host port Postgres listens on |
| `PGADMIN_DEFAULT_EMAIL` | `admin@example.com` | pgAdmin login email |
| `PGADMIN_DEFAULT_PASSWORD` | — | **Required.** pgAdmin login password. |
| `PGADMIN_PUBLISH_PORT` | `5050` | Host port pgAdmin listens on |

## pgAdmin

When running via Docker Compose, pgAdmin is available at `http://localhost:{PGADMIN_PUBLISH_PORT}`. The `pgadmin-servers.json` file at the repo root pre-configures the server connection.

## Notes

- `init.sql` is a point-in-time schema dump. It includes sample `asset_assignments` and `asset_events` rows from development. Strip the `COPY` data sections if you want a clean schema-only apply.
- The `postgres/` directory (Postgres data files) is git-ignored.
- The `asset_tag_seq` sequence is present in the schema but `fn_next_asset_tag()` derives the next tag by scanning existing rows rather than using the sequence directly.

## Maintenance: Backup & Restore

### Create a Backup
If running via Docker, run this from the host terminal:
```bash
docker exec -t ams-postgres-docker pg_dump -U assetmanager_user -d assetmanager_db > backup_$(date +%Y%m%d).sql
```

### Restore a Backup
To restore a `.sql` dump into the running container:
```bash
cat your_backup.sql | docker exec -i ams-postgres-docker psql -U assetmanager_user -d assetmanager_db
```

## Related

- [`../README.md`](../README.md) — project overview and setup order
- [`../Server/SERVER_README.md`](../Server/SERVER_README.md) — server database connection configuration
