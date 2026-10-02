# Supabase migrations

Each `.sql` file in this folder is a SQL script that brings the production
Supabase project up to a target schema state. Filename convention:
`YYYYMMDD_descriptive_snake_case.sql`.

## How to apply a migration

Two options. Most migrations here are written to be idempotent
(`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, guarded `DO` blocks),
but **idempotent is not the same as safe to re-run in isolation** — see
"Re-applying an older migration" below.

### Option A — Supabase Dashboard SQL editor (recommended for one-offs)

1. Open https://supabase.com/dashboard → select the basketch project.
2. Left sidebar → **SQL Editor** → **+ New query**.
3. Paste the entire `.sql` file content.
4. Click **Run**.
5. The "Results" panel should show "Success. No rows returned." for DDL
   statements and a row count for INSERT statements. If anything errors,
   copy the error verbatim into the rollout PR — do NOT silently retry.
6. **Run `supabase/checks/anon-privileges.sql`** (see below). Every row must
   be PASS.

### Option B — Local runner (when the project has an exec_sql RPC)

```sh
cd pipeline
npx tsx scripts/apply-taxonomy-migration.ts
```

The runner falls back to printing a paste-instruction if `exec_sql` isn't
exposed (which is the default on Supabase managed projects). Step 6 above
still applies.

## After every migration: run the access check

`supabase/checks/anon-privileges.sql` is a single read-only `SELECT` that
returns one row per access-model invariant (anon never writes, every public
base table has RLS, no `SECURITY DEFINER` function is executable by anon,
new functions are not executable by the public roles by default, new tables
and sequences are not writable by them by default, anon can
read `deals`, the pipeline's service role can still write). Run it in the SQL
editor after applying any migration, after any hand-run SQL, and after
rebuilding a database from this folder. **Every row must be PASS.**

If a row FAILs, re-apply `20261002_least_privilege_baseline.sql` (idempotent)
and run the check again. If it still FAILs, a new object needs an explicit
access decision in its own migration (see "Access model" below).

## Access model (declared in `20261002_least_privilege_baseline.sql` and `20261002_least_privilege_default_tables.sql`)

- The anon key only ever **reads**. No public role holds INSERT / UPDATE /
  DELETE / TRUNCATE on any relation in `public`.
- Every base table in `public` has **RLS enabled**. Catalogue tables the site
  reads get an explicit `FOR SELECT TO anon, authenticated` policy; anything
  else has no public policy (service role only).
- New functions are **not executable** by `PUBLIC`, `anon` or `authenticated`
  by default. A migration that adds an RPC the frontend must call has to
  `GRANT EXECUTE` on it explicitly — a permission error on a new RPC means
  that GRANT is missing.
- New tables and sequences are **not writable** by `anon` or `authenticated`
  by default (`20261002_least_privilege_default_tables.sql`). They can still
  be read until RLS is on, so a migration that creates a table must enable RLS
  on it in the same file — `pipeline/architecture.test.ts` fails otherwise.
- The pipeline uses the service role (`BYPASSRLS`), so none of the above
  restricts it.

A new migration that creates a table, view or function must state its access
explicitly (RLS + policy + GRANT for anything the site reads). Relying on
platform default grants is not allowed.

## Migration order and re-applying an older migration

Migrations are applied chronologically by filename.

**Do not re-apply a single older migration on its own.** Several files written
before the baseline (`20260416_secure_favorites_rls.sql`,
`20260427_v3_concept_layer.sql`, `20260916_mv_validity_window.sql`,
`20260917120000_mv_price_basis.sql`, and the legacy
`shared/migrations/002-email-lookup-rpc.sql`) re-grant privileges or
re-create policies that `20261002_least_privilege_baseline.sql` removes; each
carries a header saying so. If an older file must be re-run (for example while
rebuilding a database from scratch), apply the whole folder in order — the
baseline then runs after it — and finish with the access check. If you re-run
one older file against an existing database, re-apply the baseline afterwards.

Some migrations also carry their own ordering constraints in their header
(e.g. `20260916_mv_validity_window.sql` must never be applied after
`20260917120000_mv_price_basis.sql`). Read the header before running a file.

## Current migrations (newest last)

| File | What it does |
|---|---|
| `00000000000000_baseline.sql`               | Schema that existed before migrations were tracked (shape only) |
| `20260414_add_offer_dates_to_products.sql` | Adds offer_start/offer_end to products |
| `20260416_secure_favorites_rls.sql`         | Legacy favourites RPCs (superseded for access control by 20261002) |
| `20260422_v4_deal_format_fields.sql`        | v4 format/container/canonical-unit columns + taxonomy_confidence |
| `20260425_taxonomy_4level.sql`              | 4-level taxonomy: type / category / subcategory + alias map + unknown-tag log |
| `20260426_taxonomy_backfill.sql`            | Backfills deals.category_slug |
| `20260427_v3_concept_layer.sql`             | v3 concept layer (superseded for access control by 20261002) |
| `20260910_classification_cache.sql`         | Classification cache + traceability |
| `20260911_offer_fields.sql`                 | Offer fields that deals could not hold |
| `20260916120000_quantity_requirement.sql`   | deals.min_quantity (QuantityRequirement) |
| `20260916_mv_validity_window.sql`           | Materialised views honour full validity window (superseded by 20260917120000) |
| `20260917120000_mv_price_basis.sql`         | Materialised views carry price basis / min quantity |
| `20260917130000_pipeline_run_metrics.sql`   | pipeline_runs.metrics jsonb |
| `20260917153000_attributes_version.sql`     | product_classification_cache.attributes_version |
| `20260925000000_products_store_source_name_unique.sql` | UNIQUE index on products(store, source_name) |
| `20261002_least_privilege_baseline.sql`     | Least-privilege baseline: RLS declared in migrations, no public write, legacy favourites RPC grants retired, fail-closed function defaults |
| `20261002_least_privilege_default_tables.sql` | Fail-closed defaults for new tables and sequences: no write privilege for anon/authenticated |
