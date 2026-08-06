---
paths: ["**/migrations/**", "**/*.sql", "**/db/**", "**/models/**"]
---

# Database Conventions

Generic guidance — applies when the project has a relational store. Adapt table/column specifics to
the project's actual schema. Migration rows are gated on a real migrations dir
(`config.integrations.migrations.dir`); if the project has none, the migration-specific rules are inert.

## Query layer

- Prefer the project's established query layer (ORM / query builder). **Never build SQL strings from
  user input** — use parameterised queries / bound parameters. String concatenation in a SQL context
  is a security bug.
- Centralise connection/pool creation; import the shared client rather than instantiating new ones.

## Schema changes

- Every new table declares its primary key, the columns the primary access pattern needs, and an
  index for that pattern. Add foreign keys where relationships are real.
- **Every table carries `created_at` and `updated_at`** (UTC).
- If the data is scoped to a user/account/tenant, carry that scoping column **NOT NULL** and index it,
  and filter on it explicitly in every query — do not rely on an implicit default.
- **Soft delete by default** — `is_deleted` + `deleted_at`, filtered out of normal queries. Hard
  delete only when explicitly required and documented (or the project opts out in its context docs).

## Migration files

Numbered, forward-only files, named `{sequence}_{what_it_does}` (never auto-push against a real
database):

```
migrations/
  0001_initial.sql
  0002_add_asset_status_index.sql
```

Each migration:

- Includes a **down / rollback** block (as a comment header at minimum).
- Runs inside a transaction — a partial migration is a production incident.
- One logical change per migration.

## Tests travel with schema

Adding or changing a table/query? Add or update the corresponding tests in the same change (see
`testing-conventions.md`). If the project keeps an isolation/scoping test suite
(`config.integrations.migrations.testDir`), extend it for any new scoped table.
