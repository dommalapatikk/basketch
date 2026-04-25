# Supabase migrations

Each `.sql` file in this folder is an idempotent SQL script that brings the
production Supabase project up to a target schema state. Filename convention:
`YYYYMMDD_descriptive_snake_case.sql`.

## How to apply a migration

Two options. Both are safe — every migration in this repo uses
`CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING`, so re-running an
already-applied migration is a no-op.

### Option A — Supabase Dashboard SQL editor (recommended for one-offs)

1. Open https://supabase.com/dashboard → select the basketch project.
2. Left sidebar → **SQL Editor** → **+ New query**.
3. Paste the entire `.sql` file content.
4. Click **Run**.
5. The "Results" panel should show "Success. No rows returned." for DDL
   statements and a row count for INSERT statements. If anything errors,
   copy the error verbatim into the rollout PR — do NOT silently retry.

### Option B — Local runner (when the project has an exec_sql RPC)

```sh
cd pipeline
npx tsx scripts/apply-taxonomy-migration.ts
```

The runner falls back to printing a paste-instruction if `exec_sql` isn't
exposed (which is the default on Supabase managed projects).

## Migration order

Migrations are applied chronologically by filename. Re-applying any single
file is safe; applying them out of order is also safe because each one only
adds new objects — none rename or drop.

## Current migrations (newest last)

| File | What it does |
|---|---|
| `20260414_add_offer_dates_to_products.sql` | Adds offer_start/offer_end to products |
| `20260416_secure_favorites_rls.sql`         | Tightens RLS on favorites table |
| `20260422_v4_deal_format_fields.sql`        | v4 format/container/canonical-unit columns + taxonomy_confidence |
| `20260425_taxonomy_4level.sql`              | 4-level taxonomy: type / category / subcategory + alias map + unknown-tag log |
