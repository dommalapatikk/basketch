// WP-0(b), 2026-09-25 tech-lead cross-review §2.3.
//
// `product-resolve.ts` upserts with `onConflict: 'store,source_name'`. An
// ON CONFLICT target needs a UNIQUE index or constraint on exactly those
// columns, or Postgres rejects the upsert with 42P10. That index was never
// declared in `supabase/migrations` — see the baseline's own note that
// indexes were not captured — so a database rebuilt from this repository
// alone would stand up `products` without it and fail on the first write.
// This test makes the dependency executable so it cannot go stale again
// unnoticed, the same reasoning as `collection/domain/architecture.test.ts`.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(MIGRATIONS_DIR, f))
}

describe('product-resolve depends on a declared unique index', () => {
  it('resolveProducts upserts onConflict: store,source_name', () => {
    const src = readFileSync(join(__dirname, 'product-resolve.ts'), 'utf8')
    expect(src.includes("onConflict: 'store,source_name'")).toBe(true)
  })

  it('some migration declares a UNIQUE index on products(store, source_name)', () => {
    const pattern = /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+products\s*\(\s*store\s*,\s*source_name\s*\)/is
    const matches = migrationFiles().filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(matches.length).toBeGreaterThan(0)
  })
})
