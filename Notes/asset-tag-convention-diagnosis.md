# Diagnosis — Why asset tags are `AST-00001` instead of `JMV-LAP-00001`

**Date:** 2026-08-01 · **Type:** Diagnosis only — **no code changed**

## Verdict

**The `JMV-[ALIAS]-[SEQ]` convention was never implemented.** It exists only as a written spec
(`Notes/ASSET_TAG_NOMENCLATURE.md`). Every tag generator in the codebase hard-codes the literal
string `'AST-'` plus one global sequence. This is **not a regression or a bug** — the feature was
specified but the code was never built, and the spec's own implementation checklist is still
**entirely unchecked**.

Evidence: **88 of 88** assets in the DB carry the `AST-` prefix — zero exceptions. If the convention
had ever worked, even briefly, there would be mixed prefixes. There are none.

---

## What the spec requires (`Notes/ASSET_TAG_NOMENCLATURE.md`)

```
JMV-[ALIAS]-[SEQUENTIAL#]      e.g. JMV-LAP-00001, JMV-DES-00042
```
| Component | Spec |
|---|---|
| Company code | fixed `JMV` (3 chars) |
| Alias code | 3 uppercase letters **per category**, globally unique (LAP, DES, SRV, MCH…) |
| Sequence | 5 digits, **restarting per category** ("Unique identifier per category") |

Spec §8 checklist — **every box unchecked**, including:
- `[ ] Create Master Category Table` · `[ ] Create initial category list with aliases`
- `[ ] Create auto-assign function` · `[ ] Implement validation logic (format + global uniqueness)`

---

## What the code actually does

All four generators hard-code `AST-` and share **one global** sequence (`asset_tag_seq`):

| # | Location | Code | Used by |
|---|---|---|---|
| 1 | `Server/repositories/asset_repository.py:133` | `select 'AST-' \|\| lpad(nextval('asset_tag_seq')::text, 5, '0')` | **Form auto-assign** (`GET /api/v1/assets/next-tag`) and `asset_service.create_asset` fallback |
| 2 | `Server/repositories/qr_repository.py:183` | same literal `'AST-' \|\| lpad(nextval('asset_tag_seq')…)` | **QR batch reservation** → the scan-to-log flow |
| 3 | `DB fn_next_asset_tag()` (`DB/init.sql:131`) | returns `'AST-00001'`, filters `asset_tag ~ '^AST-[0-9]+$'` | legacy DB function (app no longer calls it) |
| 4 | `Server/scripts/pg_seed_dummy.py:61` | `f"AST-{n:05d}"` | dummy seed script |

Both entry paths you described — **auto-assign on the form** and **scan QR → log asset** — go through
generators 1 and 2 respectively. Both are hard-coded, so both produce `AST-`.

---

## Why it *cannot* currently produce `JMV-LAP-00001` (three blockers)

**1. No alias data exists.** `asset_categories` columns are:
`id, slug, name, description, is_active, metadata, created_at, updated_at` — there is **no `alias`
(3-letter code) column**. The spec (§ line 416) assumed a `categories` table carrying that alias. So
there is nothing in the database from which `LAP` could be derived.

**2. No company prefix is configured anywhere.** No env var, setting, or constant holds `JMV` for tag
purposes. (`JMV10728` etc. are *employee* business IDs — unrelated.)

**3. The sequence is global, not per-category.** The spec wants `LAP-00001` and `DES-00001` to count
independently. The implementation has a single `asset_tag_seq` (currently at **105**) shared by every
asset, so per-category numbering is structurally impossible without new sequences or a counter table.

Additionally, the tag generator is called **without any category context** —
`get_next_asset_tag()` takes no arguments, and in `asset_service.create_asset` the tag is resolved
*before/independently of* the resolved `category_id`. So even with alias data present, the current
call signature could not select the right alias.

---

## Secondary observation (not the cause)

`fn_next_asset_tag()` (generator 3) is a **max-scan** implementation
(`ORDER BY asset_tag DESC LIMIT 1`) while the app uses the **sequence** (generators 1–2). These two
strategies can drift apart: the sequence is at **105** while only 88 assets exist (gaps from deleted
assets and QR reservations that were never consumed). Not user-visible today because the app only
uses the sequence, but it is dead, divergent code worth deleting.

---

## Summary table

| Question | Answer |
|---|---|
| Was the convention ever implemented? | **No** — spec only, checklist unchecked |
| Is this a regression? | **No** — no commit ever contained category-aware tag logic |
| Why `AST-`? | Literal string hard-coded in all 4 generators |
| Does the DB support aliases? | **No** — `asset_categories` has no alias column |
| Is per-category numbering possible now? | **No** — single global `asset_tag_seq` |
| Affected paths | Form auto-assign **and** QR scan-to-log (both hard-coded) |
| Assets already tagged `AST-` | **88 of 88** |

## What implementing it would require (scope, not a plan)
1. Add `alias char(3) UNIQUE` to `asset_categories` + populate for every existing category.
2. Add a company-prefix setting (`ASSET_TAG_COMPANY_CODE=JMV`).
3. Per-category counters (sequence-per-category or a `category_counters` table, allocated atomically).
4. Pass `category_id` into tag generation; update **both** generators (form + QR reservation).
5. Decide the fate of the **88 existing `AST-` tags** — the spec calls tags *immutable*, and QR labels
   are already printed, so a migration would invalidate physical labels. Most likely: leave legacy
   tags as-is and apply the new convention only to new assets.
