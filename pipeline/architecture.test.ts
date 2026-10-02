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

// 2026-09-25 §10 (tech-lead ruling after PM decisions:
// docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md §10). Nothing in the
// product reads the concept/sku catalogue layer — verified across web-next,
// the pipeline and the database (§10.1). The batched writer built for WP-1a
// (commit a9a2958, `pipeline/catalogue/`) was retired the same day it landed,
// because a writer with no reader buys nothing: it cost ~667s of the write
// tail for zero product value. The tables, columns and views are NOT
// dropped — this is a two-way door, reversible by reverting one commit — but
// no pipeline code may write or read them going forward. `pipeline/migrate/`
// is excluded: its two one-shot scripts (`seed-v3-from-deals.ts`,
// `fix-dairy-miscategorisation.ts`) are historical artifacts of the original
// backfill, not part of any run path, and are explicitly out of scope for
// ruling 1 (§10.2).
describe('2026-09-25 §10: no pipeline write path touches the retired concept/sku layer', () => {
  // 2026-09-25 re-review (docs/reviews/2026-09-25-review-wp0-1a-and-wp11.md,
  // "Grep gaps (C, D)"): a literal substring search for `from('sku')` missed
  // two realistic rewrites of the exact same call — `from("sku")` (double
  // quotes, plausible from a copy-paste in a codebase with no formatter) and
  // a wrapped call with the table name on its own line. `\s` inside the
  // regex matches a newline, so this catches both — proven by scratch
  // mutations (not committed) before this fix and after; see the commit
  // message.
  const FROM_RETIRED_TABLE = /\.from\(\s*['"`](sku|concept[a-z_]*)['"`]/
  const BARE_TOKEN_PATTERNS = ['concept_resolver', 'sku_id', 'concept_cheapest_now']
  const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '__fixtures__', 'migrate', 'archive'])

  function pipelineSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        out.push(...pipelineSourceFiles(join(dir, entry.name)))
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
        out.push(join(dir, entry.name))
      }
    }
    return out
  }

  // Comments are stripped before matching — the same discipline
  // `collection/domain/architecture.test.ts` uses for retailer vocabulary and
  // personal-data fields. A comment explaining that this layer was retired
  // (this very file, or run-pipeline.ts's write-tail note) is documentation,
  // not a reader.
  function withoutComments(src: string): string {
    return src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
  }

  const files = pipelineSourceFiles(__dirname)

  it('finds pipeline source files to check — guards against a silently empty test', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('no non-test pipeline file outside migrate/ or archive/ references the retired layer', () => {
    const violations: string[] = []
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'))
      const rel = file.slice(file.indexOf('/pipeline/') + 1)
      const fromMatch = code.match(FROM_RETIRED_TABLE)
      if (fromMatch) violations.push(`${rel} matches '${fromMatch[0].replace(/\s+/g, ' ')}'`)
      for (const token of BARE_TOKEN_PATTERNS) {
        if (code.includes(token)) violations.push(`${rel} references '${token}'`)
      }
    }
    expect(violations).toEqual([])
  })
})

// Least-privilege baseline (supabase/migrations/20261002_least_privilege_baseline.sql,
// checked live by supabase/checks/anon-privileges.sql). The anon key only ever
// reads. These static checks keep a database rebuilt from this folder from
// drifting away from that: the baseline must keep declaring the model, and no
// migration that sorts AFTER it may hand a write privilege or a write policy
// to the public roles. SQL comments are stripped first so prose cannot trip it.
describe('least-privilege baseline is declared in migrations', () => {
  const BASELINE = '20261002_least_privilege_baseline.sql'
  const PUBLIC_ROLE = /\b(anon|authenticated|public)\b/i

  function sqlWithoutComments(src: string): string {
    return src
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n')
  }

  function sortedMigrations(): string[] {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  }

  // Each scanner returns one string per offending statement, so a failure
  // names exactly what to fix.
  function publicWriteGrants(sql: string): string[] {
    const out: string[] = []
    for (const m of sql.matchAll(/GRANT\s+([A-Z_,\s]+?)\s+ON\b[^;]*?\bTO\s+([^;]+)/gi)) {
      const privileges = m[1] ?? ''
      const grantees = m[2] ?? ''
      if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(privileges) && PUBLIC_ROLE.test(grantees)) {
        out.push(m[0].replace(/\s+/g, ' ').trim())
      }
    }
    return out
  }

  function publicWritePolicies(sql: string): string[] {
    const out: string[] = []
    for (const m of sql.matchAll(/CREATE\s+POLICY[^;]*?\bFOR\s+(INSERT|UPDATE|DELETE|ALL)\b[^;]*/gi)) {
      const stmt = m[0]
      // A policy with no TO clause applies to PUBLIC.
      const to = stmt.match(/\bTO\s+([\s\S]+?)(\bUSING\b|\bWITH\s+CHECK\b|$)/i)
      if (!to || PUBLIC_ROLE.test(to[1] ?? '')) out.push(stmt.replace(/\s+/g, ' ').trim())
    }
    return out
  }

  it('the baseline migration exists', () => {
    expect(sortedMigrations()).toContain(BASELINE)
  })

  it('the baseline revokes every public write privilege, sweeps RLS on, and fails closed for new functions', () => {
    const sql = sqlWithoutComments(readFileSync(join(MIGRATIONS_DIR, BASELINE), 'utf8'))
    expect(sql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE,\s*REFERENCES,\s*TRIGGER\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    )
    expect(sql).toMatch(/NOT\s+c\.relrowsecurity/i)
    expect(sql).toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+PUBLIC/i)
    expect(sql).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+anon,\s*authenticated/i,
    )
  })

  it('no migration after the baseline grants a write privilege or a write policy to anon/authenticated/PUBLIC', () => {
    const files = sortedMigrations()
    const later = files.slice(files.indexOf(BASELINE) + 1)
    const violations: string[] = []
    for (const f of later) {
      const sql = sqlWithoutComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      for (const g of publicWriteGrants(sql)) violations.push(`${f}: ${g}`)
      for (const p of publicWritePolicies(sql)) violations.push(`${f}: ${p}`)
    }
    expect(violations).toEqual([])
  })

  it('the scanners catch the patterns they exist for (guards against a silently blind regex)', () => {
    expect(publicWriteGrants('GRANT INSERT, UPDATE ON foo TO anon;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT ALL ON TABLE foo TO authenticated;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT SELECT ON foo TO anon, authenticated;')).toHaveLength(0)
    expect(publicWriteGrants('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;')).toHaveLength(0)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR INSERT WITH CHECK (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR UPDATE TO anon USING (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR ALL TO service_role USING (true) WITH CHECK (true);')).toHaveLength(0)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR SELECT TO anon USING (true);')).toHaveLength(0)
  })
})
