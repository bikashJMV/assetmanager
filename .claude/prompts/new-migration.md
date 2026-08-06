# Prompt scaffold: new migration

Generic SQL migration. Applies only when the project uses migrations
(`config.integrations.migrations.dir`); otherwise ignore this scaffold.

```sql
-- migrations/000N_<change>.sql
--
-- Down / rollback:
--   DROP TABLE IF EXISTS <table>;
--
BEGIN;

CREATE TABLE <table> (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- if this data is scoped to a user/account/tenant, carry that column NOT NULL and index it:
  -- owner_id  UUID NOT NULL REFERENCES <owners>(id),
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- index the primary access pattern (and the scope column, if any)
CREATE INDEX idx_<table>_created_at ON <table> (created_at);

COMMIT;
```

Rules:

- **One logical change per migration**, forward-only, numbered.
- Wrap in a transaction — a partial migration is a production incident.
- Include the rollback as a header comment.
- Add/extend tests in the same change: a test that proves the new schema/query behaves, and — if the
  data is scoped per owner — a test attempting cross-owner access via each public surface and asserting
  it is blocked (see `.claude/rules/db-conventions.md` + `testing-conventions.md`).
