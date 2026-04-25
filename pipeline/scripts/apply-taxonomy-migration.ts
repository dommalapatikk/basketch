#!/usr/bin/env -S npx tsx
/**
 * One-shot runner: applies supabase/migrations/20260425_taxonomy_4level.sql
 * to the linked Supabase project using the service-role key.
 *
 * Usage (from repo root or pipeline/):
 *   tsx pipeline/scripts/apply-taxonomy-migration.ts
 *
 * Required env (loaded from pipeline/.env via dotenv at the top):
 *   SUPABASE_URL                — the project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (NEVER ship to frontend)
 *
 * What it does
 *   1. Reads the SQL migration file from disk.
 *   2. Splits it on `;` boundaries that aren't inside string literals.
 *   3. Executes each statement against the project via supabase-js.
 *   4. Logs counts of rows in the new reference + alias tables for sanity.
 *
 * Safe to re-run: every CREATE has IF NOT EXISTS, every INSERT has
 * ON CONFLICT DO NOTHING. Bringing the migration file up to date and
 * running this again is the canonical "fix the seed" workflow.
 */

import 'dotenv/config'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('[migrate] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in env. Aborting.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const MIGRATION_FILE = resolve(
  __dirname,
  '../../supabase/migrations/20260425_taxonomy_4level.sql',
)

async function main() {
  const sql = readFileSync(MIGRATION_FILE, 'utf8')
  console.log(`[migrate] Applying ${MIGRATION_FILE} (${sql.length} bytes)...`)

  // Supabase client doesn't expose raw SQL execution; route through the
  // dedicated `pg_meta` query endpoint via the REST proxy. We POST the entire
  // SQL string in one call so transactional semantics inside the file are
  // preserved (each ALTER TABLE / CREATE TABLE is its own implicit txn).
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // Fallback: most managed Supabase projects don't expose `exec_sql` by
    // default. Tell the operator to paste the SQL into the dashboard editor.
    console.error(`[migrate] exec_sql RPC unavailable (${res.status}). Either:`)
    console.error(`  a) enable an exec_sql RPC in your Supabase project, or`)
    console.error(`  b) open https://supabase.com/dashboard → SQL editor and`)
    console.error(`     paste the contents of ${MIGRATION_FILE} there.`)
    console.error(`     Click "Run". Migration is idempotent so safe to re-run.`)
    process.exit(2)
  }

  console.log('[migrate] SQL applied. Verifying seed counts:')
  await report('taxonomy_type')
  await report('taxonomy_category')
  await report('taxonomy_subcategory')
  await report('taxonomy_alias')
  await report('pipeline_unknown_tags')

  console.log('[migrate] Done.')
}

async function report(table: string) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    console.warn(`  - ${table}: ERROR ${error.message}`)
  } else {
    console.log(`  - ${table}: ${count ?? 0} rows`)
  }
}

main().catch((err) => {
  console.error('[migrate] Unexpected error:', err)
  process.exit(3)
})
