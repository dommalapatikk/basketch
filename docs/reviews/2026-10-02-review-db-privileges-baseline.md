# Code Review: PR #5 — least-privilege baseline for the public roles

- Branch: `chore/db-privileges-baseline` (reviewed at `ac22539`)
- Reviewer: code-reviewer agent
- Date: 2026-10-02

## Summary

| Area | Verdict |
|---|---|
| `supabase/migrations/20261002_least_privilege_baseline.sql` | **Approved** |
| `supabase/checks/anon-privileges.sql` | **Approved** (SHOULD-FIX items below, no false PASS on the current model) |
| Superseded headers on older migrations / setup scripts | **Approved** |
| `supabase/migrations/README.md` | **Approved** |
| `pipeline/architecture.test.ts` (static guard) | **Needs Changes** (2 MUST-FIX) |

**Overall: Needs Changes.** The SQL that was applied to production is correct, idempotent and recorded faithfully. The static guard is blind to two realistic violating migrations. Both fixes are test-only and need no database change.

What was verified, and how:

- `cd pipeline && npm test`: 74 files, 1528 tests pass.
- `cd pipeline && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`: exit 0.
- Migration vs applied draft: stripped comments and blank lines from both files, with draft section 8 uncommented and section 7 left commented out, then ran a `diff`. The executable SQL is identical apart from two `RAISE NOTICE` message strings (2b and 5). Those only change log text.
- Mutation probes against the architecture test: 17 temporary migration files, each deleted afterwards. The working tree was clean after the probes.
- Public-wording scan of every added line, the PR body and the commit message.

## Per-file review

### `supabase/migrations/20261002_least_privilege_baseline.sql` — Approved

- **Matches what was applied.** Sections 1–6 and 8 of the private draft are present, and draft section 7 (data / drop) is correctly left out.
- **Idempotent.** Every object reference is guarded (`to_regclass`, `to_regprocedure`, `pg_proc`/`pg_policies` loops). Policies are `DROP IF EXISTS` then `CREATE`. `REVOKE` and `ALTER DEFAULT PRIVILEGES ... REVOKE` are naturally repeatable. A re-run only emits NOTICEs.
- **Nothing the live site or pipeline needs is revoked:**
  - web-next reads exactly one relation with the anon key: `deals` (`web-next/src/server/data/supabase-provider.ts:268`). Section 4 creates `deals_public_read` before dropping the legacy policy, inside the same transaction. `server/data/concepts.ts` reads `concept_family`, `concept` and `pipeline_run`, but nothing imports it. Their SELECT is not touched anyway.
  - The pipeline (`pipeline/supabase-client.ts`, `product-resolve.ts`) and the keep-alive `rpc/select_1` (`.github/workflows/pipeline.yml:168`) both use `SUPABASE_SERVICE_ROLE_KEY`. No statement revokes from `service_role`, and `exec_refresh_mv(text)` is explicitly re-granted to it.
  - `pipeline_runs_public` (the owner-rights view from 20260416) keeps its anon SELECT, because section 6 only removes write privileges. That is intended.
- Good: section 1 loops `pg_proc` by name, so it covers overloads the repo does not know about. Section 2 correctly names `anon, authenticated`, because `REVOKE ... FROM PUBLIC` alone does not remove Supabase's direct grants. Section 7 is correctly outside the transaction.
- Note (no action): the file has its own `BEGIN`/`COMMIT`. That is fine in the SQL editor. If it is ever applied through `supabase db push`, the CLI's own transaction handling gives a warning, not an error.

### `supabase/checks/anon-privileges.sql` — Approved

- **Read-only:** a single `WITH ... SELECT`. It has no DML, no DDL and no function with side effects.
- **No false PASS for the current model.** A-1 (definer functions callable by anon) catches the legacy favourites RPCs, which are all `SECURITY DEFINER`. A-7 treats "no global default-ACL row" as FAIL, which is correct: with no row, the built-in default applies and PUBLIC may EXECUTE. A-7's `actual` and `ok` columns agree. S-4's `IS NULL OR ...` is safe even when the function is absent (`true OR NULL` = true).
- SHOULD-FIX items are listed under S-3 to S-5 below. They are gaps for future drift, not wrong results today.

### Superseded headers (`docs/supabase-setup.sql`, `shared/supabase-setup.sql`, `shared/migrations/002-email-lookup-rpc.sql`, `20260416`, `20260427`, `20260916_mv`, `20260917120000_mv`) — Approved

- Comment-only, and no SQL changed. Each header names the specific thing that file would re-grant. I cross-checked them against a grep of `GRANT`/`CREATE POLICY` (for example 20260917120000 line 211 `GRANT SELECT ... worth_picking_up_candidates TO anon, authenticated`, and 20260427 lines 381–387 `user_interest` policies). They are accurate.

### `supabase/migrations/README.md` — Approved

- It removes the false "re-applying any file is safe" claim. That was the right call.
- The migrations table matches `ls supabase/migrations` exactly (16 files), in filename sort order.
- The access-model section is accurate. One gap: it states "relying on platform default grants is not allowed" for tables, but nothing enforces that yet (see S-1).

### `pipeline/architecture.test.ts` — Needs Changes

Probe results (each probe was a temporary file in `supabase/migrations/`, deleted afterwards):

| Probe file content | Expected | Result |
|---|---|---|
| `GRANT INSERT, UPDATE ON public.foo TO anon;` | fail | fail (caught) |
| `GRANT ALL PRIVILEGES ON TABLE public.foo TO authenticated;` | fail | fail (caught) |
| `CREATE POLICY p ON public.foo FOR INSERT WITH CHECK (true);` | fail | fail (caught) |
| `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;` | fail | fail (caught) |
| `EXECUTE format('GRANT DELETE ON %I TO anon', t);` | fail | fail (caught) |
| `CREATE POLICY p ON public.foo USING (true);` | fail | **pass — missed (M-1)** |
| `GRANT INSERT ON public.foo TO anon;` in file `20261002120000_probe.sql` | fail | **pass — missed (M-2)** |
| `CREATE POLICY "inserts to everyone" ON foo FOR INSERT WITH CHECK (true);` | fail | **pass — missed (S-2)** |
| `CREATE POLICY "writes to pipeline" ON public.foo FOR ALL TO service_role USING (true);` | pass | **fail — false positive (S-2)** |
| `GRANT INSERT (name) ON public.foo TO anon;` | fail | pass — missed (S-3) |
| `ALTER TABLE public.foo DISABLE ROW LEVEL SECURITY;` | fail | pass — not guarded (S-1) |
| `CREATE TABLE public.foo (id int);` (no RLS) | fail | pass — not guarded (S-1) |
| `GRANT SELECT ON public.foo TO anon; -- GRANT INSERT ...` | pass | pass (comment stripping works) |
| `GRANT INSERT ON public.foo TO service_role;` | pass | pass |
| `CREATE POLICY p ON public.foo FOR ALL TO service_role USING (true);` | pass | pass |
| `GRANT EXECUTE ON FUNCTION public.f() TO anon;` | pass (by design) | pass |
| no probe (existing files) | pass | pass (no false positive on current files) |

## MUST-FIX

**M-1. A policy with no `FOR` clause is not detected** (`publicWritePolicies`). The regex requires `FOR (INSERT|UPDATE|DELETE|ALL)`. In Postgres, omitting `FOR` means `FOR ALL`, and omitting `TO` means `PUBLIC`. So `CREATE POLICY p ON t USING (true)` is the most permissive policy possible, and it is a plausible way to write one: this repo's own 20260427 lines 370–375 use `FOR SELECT USING (true)` with no `TO`. Fix: treat a missing `FOR` as `ALL`. Add the self-test case `publicWritePolicies('CREATE POLICY p ON foo USING (true);')` → length 1.

**M-2. A same-day migration named in the 14-digit format sorts before the baseline and is never scanned.** `'20261002120000_x.sql' < '20261002_least_privilege_baseline.sql'`, because `'1' < '_'`. The repo already mixes both formats (`20260916_` and `20260916120000_` both exist), and the obvious follow-up migration from S-1 would most likely be dated today. Fix: freeze the list of pre-baseline files (the 15 current names) and scan every `.sql` file not on that list. That replaces the `slice(indexOf(BASELINE) + 1)` approach.

## SHOULD-FIX

**S-1. Tables are not fail-closed. This is the largest remaining gap, and it needs a follow-up migration, not a change to this PR.** Section 7 makes new *functions* fail closed. Supabase's per-schema defaults still grant ALL on new *tables* (and sequences) in `public` to `anon`/`authenticated`, and a new table starts with RLS off. So a future `CREATE TABLE` with no RLS is anon-writable until someone runs the check. The static guard does not catch this (see the probes above). Recommendation, for the Tech Lead to schedule, with the PM applying it:
- a new migration: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;` plus the equivalent for `SEQUENCES` (USAGE, UPDATE);
- a matching check row (A-9);
- a static rule: every `CREATE TABLE` in a post-baseline migration has an `ENABLE ROW LEVEL SECURITY` for the same table, and no `DISABLE ROW LEVEL SECURITY` appears.

**S-2. The policy `TO`-clause parse is not anchored.** `\bTO\s+` matches the word "to" inside a quoted policy name. Separately, `PUBLIC_ROLE` matches the schema prefix in `public.foo`. Together they cause both a false negative and a false positive (see the probe table). Fix: parse the policy structurally, as `CREATE POLICY <name> ON <table> [AS ...] [FOR <cmd>] [TO <roles>] [USING|WITH CHECK]`, and test `PUBLIC_ROLE` only against the roles list. The `GRANT` scanner already captures grantees after `ON`, so the problem is limited to policies.

**S-3. Column-level grants are invisible to both the test and the check.**
- The test regex `GRANT\s+([A-Z_,\s]+?)\s+ON` cannot match `GRANT INSERT (col) ON ...`.
- In the check, A-3, A-4 and A-6 use `has_table_privilege`, which returns false when only a column-level privilege exists. A future `GRANT SELECT (some_col) ON user_interest TO anon` would PASS A-6. Fix: use `has_any_column_privilege(...)` in those three rows (it is true for table-level or any column-level privilege). Allow `\([^)]*\)` in the test regex.
- The applied migration is unaffected, because a table-level `REVOKE` also revokes the column-level privileges.

**S-4. A-8 ignores a per-schema default that grants EXECUTE to `PUBLIC`.** A-7 only inspects the global row (`defaclnamespace = 0`). A `... IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC` default would pass both A-7 and A-8. Fix: include `a.grantee = 0` in A-8's grantee set.

**S-5. A-3 and A-4 do not assert REFERENCES or TRIGGER,** although the migration revokes them and the header promises "no ... REFERENCES / TRIGGER". Add both privileges to the two CTEs.

## NICE-TO-HAVE

- The check only inspects default ACLs for role `postgres`. That is correct for the SQL editor and the Supabase CLI. Add a comment saying that objects created by another role (for example `supabase_admin`) are outside A-7 and A-8.
- `GRANT EXECUTE ... TO anon` in a later migration is intentionally not flagged, which is consistent with the README. Consider flagging it when the same file also declares that function `SECURITY DEFINER`, so the review happens before deploy rather than at A-1.
- The two NOTICE strings differ from the applied draft. That has no functional effect. A one-line note in the private draft would keep the two files byte-comparable.

## Public-repository wording

Checked every added line, the PR body and the commit message for exploit narrative, counts, or references to stored or purged personal data. **Clean.** The only matches are pre-existing function and file names (`update_favorite_email`, `lookup_favorite_by_email`, `002-email-lookup-rpc.sql`), which cannot be avoided. The README's "retired / internal" wording is neutral.

## Test coverage assessment

- The scanner self-tests are a good idea: they guard against a regex that silently stops matching. They should gain the M-1, S-2 and S-3 cases.
- The live check, rather than a unit test, is the right tool for the runtime model. It was run on production with all 12 rows PASS, per the coordinator.

## Final verdict

**Needs work (small).** The migration, check, headers and README are approved as an accurate record of production. Fix M-1 and M-2 in `pipeline/architecture.test.ts`, then re-review only those items. S-1 should be scheduled as its own follow-up migration (Tech Lead decision, PM to apply).
