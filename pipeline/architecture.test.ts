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
// migration written after it may hand a write privilege or a write policy to
// the public roles. SQL comments are stripped first so prose cannot trip it.
describe('least-privilege baseline is declared in migrations', () => {
  const BASELINE = '20261002_least_privilege_baseline.sql'

  // FROZEN: the migrations that existed before the baseline. Everything NOT on
  // this list is scanned — the baseline itself and every later file. A list,
  // not a filename comparison: the folder mixes `YYYYMMDD_` and
  // `YYYYMMDDHHMMSS_` names, and '20261002120000_x.sql' sorts BEFORE
  // '20261002_least_privilege_baseline.sql' ('1' < '_'), so "sorts after the
  // baseline" would silently skip a same-day migration. Never add to this list.
  const PRE_BASELINE_MIGRATIONS: ReadonlySet<string> = new Set([
    '00000000000000_baseline.sql',
    '20260414_add_offer_dates_to_products.sql',
    '20260416_secure_favorites_rls.sql',
    '20260422_v4_deal_format_fields.sql',
    '20260425_taxonomy_4level.sql',
    '20260426_taxonomy_backfill.sql',
    '20260427_v3_concept_layer.sql',
    '20260910_classification_cache.sql',
    '20260911_offer_fields.sql',
    '20260916120000_quantity_requirement.sql',
    '20260916_mv_validity_window.sql',
    '20260917120000_mv_price_basis.sql',
    '20260917130000_pipeline_run_metrics.sql',
    '20260917153000_attributes_version.sql',
    '20260925000000_products_store_source_name_unique.sql',
  ])

  const PUBLIC_ROLES: ReadonlySet<string> = new Set(['anon', 'authenticated', 'public'])
  const WRITE_COMMANDS: ReadonlySet<string> = new Set(['ALL', 'INSERT', 'UPDATE', 'DELETE'])
  // An SQL identifier as it appears in a migration: "quoted" (with "" escapes),
  // bare, or a format() placeholder such as %I inside an EXECUTE string.
  const IDENT = String.raw`(?:"(?:[^"]|"")*"|[\w$%]+)`

  function sqlWithoutComments(src: string): string {
    return src
      .split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n')
  }

  function migrationNames(): string[] {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  }

  function filesToScan(names: readonly string[]): string[] {
    return names.filter((f) => !PRE_BASELINE_MIGRATIONS.has(f))
  }

  function namesAPublicRole(roleList: string): boolean {
    return roleList
      .split(',')
      .map((r) => r.trim().replace(/^"|"$/g, '').toLowerCase())
      .some((r) => PUBLIC_ROLES.has(r))
  }

  // Each scanner returns one string per offending statement, so a failure
  // names exactly what to fix.
  function publicWriteGrants(sql: string): string[] {
    const out: string[] = []
    // Privilege list may carry column lists: GRANT INSERT (col) ON ...
    for (const m of sql.matchAll(/GRANT\s+([\w\s,()"]+?)\s+ON\b[^;]*?\bTO\s+([^;]+)/gi)) {
      const privileges = (m[1] ?? '').replace(/\([^)]*\)/g, ' ')
      const grantees = (m[2] ?? '').replace(/\bWITH\s+GRANT\s+OPTION\b[\s\S]*$/i, '')
      // Stop at anything that is not part of a role list (e.g. the closing
      // quote of an EXECUTE format('...') string).
      const roleList = grantees.split(/['")]/)[0] ?? ''
      if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(privileges) && namesAPublicRole(roleList)) {
        out.push(m[0].replace(/\s+/g, ' ').trim())
      }
    }
    return out
  }

  // Parsed by statement structure:
  //   CREATE POLICY <name> ON <table> [AS ...] [FOR <cmd>] [TO <roles>] [USING | WITH CHECK]
  // so a quoted policy name or the `public.` schema prefix is never read as a
  // clause. A missing FOR means ALL; a missing TO means PUBLIC.
  function publicWritePolicies(sql: string): string[] {
    const out: string[] = []
    const policy = new RegExp(String.raw`CREATE\s+POLICY\s+${IDENT}\s+ON\s+${IDENT}(?:\s*\.\s*${IDENT})?([^;]*)`, 'gi')
    for (const m of sql.matchAll(policy)) {
      const rest = m[1] ?? ''
      const clauses = rest.match(
        /^\s*(?:AS\s+\w+\s+)?(?:FOR\s+(\w+)\s*)?(?:TO\s+([\s\S]+?))?\s*(?:\bUSING\b|\bWITH\s+CHECK\b|['";]|$)/i,
      )
      const command = (clauses?.[1] ?? 'ALL').toUpperCase()
      const roles = clauses?.[2]
      const appliesToPublicRole = roles === undefined || namesAPublicRole(roles)
      if (WRITE_COMMANDS.has(command) && appliesToPublicRole) out.push(m[0].replace(/\s+/g, ' ').trim())
    }
    return out
  }

  it('the baseline migration exists and is not on the frozen pre-baseline list', () => {
    expect(migrationNames()).toContain(BASELINE)
    expect(PRE_BASELINE_MIGRATIONS.has(BASELINE)).toBe(false)
  })

  it('every name on the frozen pre-baseline list is a real migration (no stale entries)', () => {
    const names = new Set(migrationNames())
    expect([...PRE_BASELINE_MIGRATIONS].filter((f) => !names.has(f))).toEqual([])
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

  it('no migration from the baseline on grants a write privilege or a write policy to anon/authenticated/PUBLIC', () => {
    const violations: string[] = []
    for (const f of filesToScan(migrationNames())) {
      const sql = sqlWithoutComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      for (const g of publicWriteGrants(sql)) violations.push(`${f}: ${g}`)
      for (const p of publicWritePolicies(sql)) violations.push(`${f}: ${p}`)
    }
    expect(violations).toEqual([])
  })

  it('scans a same-day migration whose name sorts before the baseline', () => {
    expect(filesToScan(['20260416_secure_favorites_rls.sql', '20261002120000_x.sql', BASELINE])).toEqual([
      '20261002120000_x.sql',
      BASELINE,
    ])
  })

  it('the grant scanner catches the patterns it exists for (guards against a silently blind regex)', () => {
    expect(publicWriteGrants('GRANT INSERT, UPDATE ON foo TO anon;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT ALL ON TABLE foo TO authenticated;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT ALL PRIVILEGES ON TABLE public.foo TO authenticated;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT INSERT (name) ON public.foo TO anon;')).toHaveLength(1)
    expect(publicWriteGrants('GRANT UPDATE (a, b) ON public.foo TO PUBLIC;')).toHaveLength(1)
    expect(publicWriteGrants("EXECUTE format('GRANT DELETE ON %I TO anon', t);")).toHaveLength(1)
    expect(publicWriteGrants('GRANT SELECT ON foo TO anon, authenticated;')).toHaveLength(0)
    expect(publicWriteGrants('GRANT SELECT (name) ON public.foo TO anon;')).toHaveLength(0)
    expect(publicWriteGrants('GRANT INSERT ON public.foo TO service_role;')).toHaveLength(0)
    expect(publicWriteGrants('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;')).toHaveLength(0)
  })

  it('the policy scanner catches the patterns it exists for (guards against a silently blind regex)', () => {
    // missing FOR = ALL, missing TO = PUBLIC: the most permissive policy there is
    expect(publicWritePolicies('CREATE POLICY p ON foo USING (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON public.foo USING (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR INSERT WITH CHECK (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR UPDATE TO anon USING (true);')).toHaveLength(1)
    expect(publicWritePolicies('CREATE POLICY p ON foo AS PERMISSIVE FOR DELETE TO authenticated USING (true);')).toHaveLength(1)
    // a quoted name containing the word "to" is not a TO clause
    expect(publicWritePolicies('CREATE POLICY "inserts to everyone" ON foo FOR INSERT WITH CHECK (true);')).toHaveLength(1)
    // the `public.` schema prefix is not the PUBLIC role
    expect(
      publicWritePolicies('CREATE POLICY "writes to pipeline" ON public.foo FOR ALL TO service_role USING (true);'),
    ).toHaveLength(0)
    expect(publicWritePolicies('CREATE POLICY p ON public.foo FOR ALL TO service_role USING (true) WITH CHECK (true);')).toHaveLength(0)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR SELECT TO anon USING (true);')).toHaveLength(0)
    expect(publicWritePolicies('CREATE POLICY p ON foo FOR SELECT USING (true);')).toHaveLength(0)
    // the baseline's own format() string: SELECT only
    expect(
      publicWritePolicies("EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t, t);"),
    ).toHaveLength(0)
  })
})
