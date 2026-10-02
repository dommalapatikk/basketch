# Code Review: fail-closed default privileges for new tables and sequences

- **Commit:** `5bdd58f` on `chore/db-default-privileges` ("chore(db): fail-closed defaults for new tables and sequences")
- **Reviewer:** code-reviewer agent, 2026-10-02
- **Follows:** `20261002_least_privilege_baseline.sql` (review `docs/reviews/2026-10-02-review-db-privileges-baseline.md`)
- **Verdict:** **Needs Changes**: one MUST-FIX (a one-character fix plus two test lines), three SHOULD-FIX, four NIT
- **No production access was used.** All findings come from reading the code and running the regex scanners offline.

## Summary

| File | Verdict |
|---|---|
| `supabase/migrations/20261002_least_privilege_default_tables.sql` | Approved for the SQL. The header comment needs a fix (finding 3) |
| `supabase/checks/anon-privileges.sql` (A-9) | Approved |
| `pipeline/architecture.test.ts` | Needs Changes (finding 1) |
| `supabase/migrations/README.md` | Approved with a NIT (finding 8) |

### Verification run by the reviewer

| Gate | Result |
|---|---|
| `cd pipeline && npm test` | 74 files, **1535 passed** (matches the builder's claim) |
| `cd pipeline && ./node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** (matches the builder's claim) |
| Scanner probe (a temporary vitest file running copies of `publicWriteGrants`, `publicWritePolicies` and `tablesWithoutRls` against 19 adversarial inputs, deleted afterwards) | Found finding 1. Confirmed findings 5 and 6 |

## What is done well

- **The A-9 logic is correct.** It takes the union of the global entry (`defaclnamespace = 0`) and the `public` per-schema entry. That is the right model: in PostgreSQL a per-schema default only *adds* to the global one and cannot remove from it, so a write grant in either place is a real exposure. The `LEFT JOIN pg_roles` with `COALESCE(..., 'PUBLIC')` handles grantee 0. "No row means pass" is correct for `r` and `S`, because the built-in defaults for tables and sequences grant nothing to PUBLIC. That differs from functions, and A-7 handles functions separately. The builder also checked the filter against literal ACLs from before the change, which is good negative and positive evidence.
- **The migration is idempotent.** `ALTER DEFAULT PRIVILEGES ... REVOKE` is a no-op when the privilege is already absent. The two statements are independent, so a partial run is safe to re-run. The REVOKE list leaves out `MAINTAIN`, so the file also runs on PostgreSQL 15/16, for example a local `supabase db reset` on an older image. Whether that omission was deliberate is finding 4.
- **The file sorts after the baseline** (`..._b...` < `..._d...`). It is scanned automatically because it is not on the frozen list.
- **The scanners test themselves.** The new RLS scanner has a self-test with positive and negative cases, including DISABLE versus ENABLE and RLS turned on for a different table. `tableKey` folds identifiers correctly: unquoted names are lowercased, quoted names stay exact, `""` is unescaped and the schema defaults to `public`.
- **Quoted-role fix in `publicWriteGrants`:** the builder showed that the new test fails with the old split. That is the right way to prove a regression test works.
- **The README** states the new rule and its enforcement point in one place.

## Findings

### 1. MUST-FIX: `publicWritePolicies` still misses a quoted role unless it is the first and only role
`pipeline/architecture.test.ts:201`. The clause regex still lists `"` as a terminator: `(?:TO\s+([\s\S]+?))?\s*(?:\bUSING\b|\bWITH\s+CHECK\b|['";]|$)`. The lazy `TO` capture therefore stops at the first double quote. Probe results:

| Input | Flagged? |
|---|---|
| `CREATE POLICY p ON foo FOR INSERT TO "anon" WITH CHECK (true);` | 1 (the new test passes only because the leftover `"anon` gets its leading quote stripped) |
| `CREATE POLICY p ON foo FOR INSERT TO service_role, "anon" WITH CHECK (true);` | **0, false negative** |
| `CREATE POLICY p ON foo FOR INSERT TO "service_role", anon WITH CHECK (true);` | **0, false negative** |

The commit message says the scanner "no longer misses quoted role names". For policies that is only true when the quoted role is the only role. Live check A-5 would catch such a policy, but only after it is applied, and the static guard exists to catch it before then.
**Fix:** change `['";]` to `[';]`. A quoted *policy name* comes before `ON` and never reaches `rest`, so nothing depends on `"` being a stop. Then add the two false-negative rows above to the self-test at about line 313, both expecting length 1.

### 2. SHOULD-FIX: new views and materialised views are still fail-open for reads, and the new RLS rule cannot see them
The defaults keep `SELECT` for anon/authenticated on `r` objects, and `r` covers views and materialised views as well as tables. Two consequences:
- A view owned by `postgres` runs with its owner's rights, so it skips RLS on the tables underneath unless it is created `WITH (security_invoker = true)`.
- A materialised view has no RLS at all.

So a new view or materialised view in `public` can be read by the anon key from the moment it is created, and enabling RLS cannot fix that. This repo drops and recreates materialised views regularly (`20260916_mv_validity_window.sql`, `20260917120000_mv_price_basis.sql`), and one of them, `worth_picking_up_candidates`, is service-only. A-6 catches that one name after the fact. It would not catch a new service-only view or materialised view with a different name. The probe confirms that `tablesWithoutRls` returns `[]` for both `CREATE VIEW` and `CREATE MATERIALIZED VIEW`, as designed. The gap is that nothing else covers them.
**Fix (pick one, Tech Lead's call):**
- (a) Extend the static rule: every `CREATE [OR REPLACE] [MATERIALIZED] VIEW` in a scanned migration must have, in the same file, either `security_invoker = true` (plain views) or an explicit `REVOKE SELECT ... FROM anon, authenticated` or `GRANT SELECT ... TO anon`.
- (b) Revoke `SELECT` in the defaults as well, so every new relation needs an explicit read grant.
- (c) At minimum, document the view and materialised-view exception in the migration header and the README "Access model".

### 3. SHOULD-FIX: the migration header misstates the read posture
`supabase/migrations/20261002_least_privilege_default_tables.sql:11-12` says: *"After this migration a new table is readable at most, and only once its own migration enables RLS and adds a SELECT policy."* The second half is wrong. Until RLS is enabled, a new table is readable by anon through the default `SELECT`. Enabling RLS is what *restricts* reads; it does not grant them. The README gets this right ("They can still be read until RLS is on"). Reword the header to match the README, and mention the view case from finding 2. This edit is comment-only. The Supabase CLI tracks migrations by version, not by checksum, so changing the comment in an already-applied file is harmless.

### 4. SHOULD-FIX (decision, then document): `MAINTAIN` stays with anon/authenticated
On PostgreSQL 17 the production defaults still hold `anon=rm` and `authenticated=rm`. The `m` is `MAINTAIN`, which allows `LOCK TABLE` in any mode (including ACCESS EXCLUSIVE), `REFRESH MATERIALIZED VIEW`, `VACUUM`, `ANALYZE`, `REINDEX` and `CLUSTER`. The baseline §6 REVOKE and the A-3/A-4/A-9 privilege lists also leave it out, so this gap is not new to this commit. It cannot be reached through PostgREST without a path that runs arbitrary SQL, so the practical risk is low. Still, it is not a read privilege, and "readable at most" is not literally true. `REVOKE MAINTAIN` errors on PostgreSQL 16 and older, so adding it needs a `DO` block guarded by `current_setting('server_version_num')::int >= 170000` to keep older local rebuilds working.
**Ask:** either revoke it with a version guard (new migration, and add `MAINTAIN` to A-9 and A-3/A-4), or record that it is excluded on purpose in the migration header and next to the A-9 privilege list. Escalate to the Tech Lead if the builder disagrees.

### 5. NIT: known false negatives in `tablesWithoutRls`
Confirmed by the probe. The live check A-2 catches all of these after apply, so a short "known limits" comment is enough:
- RLS text inside `/* ... */` or inside a string literal (for example a `COMMENT ON` value) counts as enabled, because `sqlWithoutComments` strips only `--` comments.
- `ENABLE` followed by `DISABLE ROW LEVEL SECURITY` in the same file passes.
- A table created with `SELECT ... INTO foo` is not seen.

### 6. NIT: conservative false positives in `tablesWithoutRls`
These fail safe, so they are acceptable, but they deserve a comment so the next person does not "fix" them the wrong way:
- A table in a non-exposed schema (`CREATE TABLE private.foo`) is flagged.
- `ALTER TABLE foo ADD COLUMN x int, ENABLE ROW LEVEL SECURITY` is flagged.
- RLS enabled through a loop or other dynamic SQL is flagged.

### 7. NIT: hard-coded filename in the fail-closed test
`pipeline/architecture.test.ts:274-275` repeats `'20261002_least_privilege_default_tables.sql'` inline. Lift it into a constant next to `BASELINE` (for example `DEFAULT_TABLES`) so the test and the existence check share one name. The exact privilege order in the regex is brittle, but it is acceptable for a guard on a frozen, already-applied file.

### 8. NIT: the README recovery step points at the wrong file for A-9
`supabase/migrations/README.md:48` says: *"If a row FAILs, re-apply `20261002_least_privilege_baseline.sql`."* A failing A-9 is fixed by re-applying `20261002_least_privilege_default_tables.sql`. Name both files, or map each check to the file that fixes it.

## Cross-cutting

- One bug class (quoted identifiers ending a regex capture) has now appeared in two scanners: the grant scanner, fixed in this commit, and the policy scanner (finding 1). Following Larson's "fix the system", add one shared self-test table of role-list shapes (`anon`, `"anon"`, `a, "anon"`, `"a", anon`) and run it through both scanners, so a third scanner gets the same coverage for free.
- Standards (CLAUDE.md, coding-standards): named functions, no default exports, single quotes, no semicolons in TypeScript, kebab-case SQL filenames that match the folder convention. No secrets and no security detail beyond what tracked files already contain. Compliant.

## Test coverage assessment

The tests sit at the right level: pure static checks plus scanner self-tests, with no mocks. The gaps are the multi-role quoted policy case (finding 1) and any rule at all for views and materialised views (finding 2). The live SQL check A-9 adds runtime coverage that matches the migration.

## Final verdict

**Needs work (small).** Fix finding 1 (MUST-FIX). Resolve findings 2-4 by fixing them or by a documented Tech Lead decision. NITs 5-8 are optional. The migration already applied to production is correct as SQL and does not need a corrective migration. Only its header comment needs changing.

---

## Re-review: commit `c0030ce` (fixed items only)

- **Reviewer:** code-reviewer agent, 2026-10-02
- **Re-review verdict:** **Needs Changes (minor).** The original MUST-FIX is closed and every original finding has been addressed. Two of the fixes introduced new SHOULD-FIX issues, R1 and R2. Each is roughly a one-line fix.

### Verification run by the reviewer

| Gate | Result |
|---|---|
| `cd pipeline && npm test` | **1537 passed** (matches the builder's claim) |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| Scanner probe (temporary vitest file running copies of `viewsWithoutDeclaredAccess` and the new `sqlWithoutComments` against 9 inputs, deleted afterwards) | Found R1 and R2 |

### Disposition of the original findings

| # | Original | Status | Notes |
|---|---|---|---|
| 1 | MUST-FIX: policy scanner stops at `"` | **Closed** | The terminator is now `[';]`. Both multi-role cases are in the self-test, and the builder confirmed the new test fails with the old terminator. |
| 2 | SHOULD-FIX: views fail-open | **Closed, with R1** | `viewsWithoutDeclaredAccess` plus a self-test, and the README documents the rule. Its acceptance condition is weaker than intended (see R1). |
| 3 | SHOULD-FIX: header misstates read posture | **Closed** | The new wording is accurate and matches the README. |
| 4 | SHOULD-FIX: MAINTAIN | **Closed** | The PM decided to revoke it. Notes on the new migration and A-10 are below. |
| 5 | NIT: RLS-scanner false negatives | **Partly closed, accepted** | DISABLE after ENABLE is now flagged (DISABLE *before* ENABLE is also flagged, which fails safe and is fine). Block comments are stripped, but the way they are stripped introduced R2. String literals and `SELECT INTO` are left to A-2, which is acceptable. |
| 6 | NIT: fail-safe false positives | **Closed, no change** | Agreed. |
| 7 | NIT: hard-coded filename | **Closed** | `DEFAULT_TABLES` constant. |
| 8 | NIT: README recovery file | **Closed** | The README and the check header now name the right files for A-9 and A-10. |

**The new migration `20261002_least_privilege_revoke_maintain.sql` is correct.**
- It is idempotent.
- The single `DO` block is atomic.
- The `server_version_num >= 170000` guard combined with `EXECUTE` is the right way to keep PG 15/16 rebuilds parsing, because a static `REVOKE MAINTAIN` would fail at parse time even inside a false `IF`.
- `ON ALL TABLES IN SCHEMA` covers views, materialised views and foreign tables.
- Revoking only the per-schema defaults is enough, because no global table default exists and A-9 would catch one if it appeared.
- A-9 now includes `MAINTAIN` for `r`. A-10 covers existing relations across `rels` (`r, p, v, m, f`).

### New findings

**R1. SHOULD-FIX: the view rule accepts *any* GRANT/REVOKE that names the view, even one that leaves anon's SELECT untouched.**
`pipeline/architecture.test.ts:242`. The probe shows these pass with no violation:
- `CREATE MATERIALIZED VIEW mv AS SELECT 1; GRANT SELECT ON mv TO service_role;`
- `CREATE VIEW v AS SELECT 1; REVOKE INSERT ON v FROM anon;`
- `CREATE VIEW v WITH (security_invoker = false) AS SELECT 1;`

The first is a plausible mistake for a service-only materialised view: the author "declares" access to the service role, and anon keeps the default SELECT. That is exactly the gap finding 2 was meant to close.
**Fix:**
- Count the view as declared only if the GRANT/REVOKE names `SELECT` or `ALL` among its privileges and names `anon`, `authenticated` or `PUBLIC` among its grantees. `namesAPublicRole` can be reused for the grantee check.
- Accept `security_invoker` only when its value is `true` or `on`.
- Add the three inputs above to the self-test, each expecting one violation.

**R2. SHOULD-FIX: block-comment stripping runs before line-comment stripping, so it can swallow real SQL.**
`pipeline/architecture.test.ts:151`. A `/*` inside a `--` comment (for example `-- see dir/*.sql`) opens a "block" that ends at the next `*/` anywhere later in the file. The same happens with a `'/*'` string literal. Probe: `"-- see dir/*.sql\nGRANT INSERT ON foo TO anon;\n-- end */\n"` strips to `"\n"`, which hides the write grant from `publicWriteGrants`. This weakens all four scanners, and it fails open. No scanned migration contains `/*` today, so nothing is broken yet.
**Fix:** strip both comment forms in one left-to-right pass, so whichever form starts first wins:
```ts
return src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, ' ')
```
Add the probe input above as a self-test that expects one write grant.

**R3. NIT: other gaps in the view scanner.**
- Fails safe: a multi-object `GRANT SELECT ON a, b TO anon` only credits `a`, so `b` is flagged. The repo already uses this pattern (`20260917120000_mv_price_basis.sql:211`), so expect a false positive the next time materialised views are recreated. A later `ALTER VIEW v SET (security_invoker = true)` is also not accepted.
- Missed: `CREATE RECURSIVE VIEW` is not matched.
- If R1 is reworked, consider covering these cases too.

**R4. NIT: A-10 relies on the planner to apply the version guard first.**
`supabase/checks/anon-privileges.sql:117`. The version test and `has_table_privilege(..., 'MAINTAIN')` share one `WHERE`. In practice the version test is evaluated first, because it does not depend on any row. PostgreSQL does not guarantee the order of `AND` operands, though. Only PG ≤ 16 rebuilds could be affected (production is 17.6). For a guaranteed short-circuit, use `CASE WHEN current_setting('server_version_num')::int >= 170000 THEN has_table_privilege(...) OR has_table_privilege(...) ELSE false END`.

**R5. NIT: no static guard keeps the MAINTAIN migration's statements.**
`DEFAULT_TABLES` has a test asserting its REVOKEs. The new migration has none. A matching two-assertion test would be consistent.

**On the coordinator's question about A-10 sorting between A-1 and A-2:** this is cosmetic and does not matter. The check passes or fails per row. Renumbering would only churn the IDs that runbooks and reviews already cite. Leave it as it is.

### Re-review final verdict

**Needs Changes (minor).** Fix R1 and R2, each with its self-test rows. R3-R5 are optional. Next round, I will re-check only R1 and R2.

---

## Re-review 2: commit `463a6cb` (R1 and R2 only)

- **Reviewer:** code-reviewer agent, 2026-10-02
- **Verdict:** **Approved.** R1 and R2 are closed, and no finding remains open at MUST-FIX or SHOULD-FIX.

### Verification run by the reviewer

| Gate | Result |
|---|---|
| `cd pipeline && npm test` | **1538 passed** (matches the builder's claim) |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | **exit 0** |
| Probe (temporary vitest file running a copy of the new `viewsWithoutDeclaredAccess` against 8 more inputs, deleted afterwards) | Results below |

### R1: closed

Only a GRANT or REVOKE that covers SELECT or ALL and names a public role now counts. A statement can list several objects. `security_invoker` counts unless it is set to `false`, `off` or `0`. All three of my original probe inputs, plus the multi-object and bare `security_invoker` cases, are now self-tests.

The extra probe inputs behaved as follows:

- **Correctly accepted:**
  - `GRANT SELECT ON v TO service_role, anon`
  - `GRANT ALL PRIVILEGES ON v TO authenticated`
- **Wrongly flagged, which is safe (the author only has to write a plain statement):**
  - `... TO anon WITH GRANT OPTION`
  - `... FROM anon CASCADE`
  - `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`
- **Remaining wrong passes (NIT, not blocking):**
  - `REVOKE GRANT OPTION FOR SELECT ON v FROM anon` counts as declared, but anon keeps SELECT.
  - `security_invoker = f` and `security_invoker = no` count as "on". PostgreSQL also accepts `f`, `n` and `no` as false. Widening the negative lookahead to `(?:false|off|no|f|n|0)` would close this.
  - Both forms are unusual, and live check A-6 is the backstop for service-only relations. These are recorded here and need no further round.

### R2: closed

`sqlWithoutComments` now strips both comment forms in one left-to-right pass. Newlines survive because `--[^\n]*` stops before the newline. The probe input `-- see dir/*.sql … GRANT INSERT … -- end */` is now a self-test expecting one write grant. A `'/*'` inside a string literal can still hide SQL, the same accepted string-literal limitation as finding 5. No scanned migration contains `/*` today.

### R3–R5 (glanced)

- **R4:** the CASE in A-10 is the correct construct.
- **R5:** the static test pins the version guard and both REVOKE statements of the MAINTAIN migration.
- **R3:** handled by the multi-object GRANT support.

### Final verdict

**Approved: ready to merge.** The two remaining R1 NITs are optional.
