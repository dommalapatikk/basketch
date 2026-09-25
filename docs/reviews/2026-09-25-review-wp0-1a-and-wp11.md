# Code review: WP-0 + WP-1a (a9a2958) and WP-11 (760a8b4)

**Reviewer:** Independent Code Reviewer (`.claude/agents/code-reviewer.md`)
**Date:** 2026-09-25
**Scope:** review only. No code edited, nothing committed, no DB writes. The mutation checks ran in a scratch copy outside the repo.

**Gates re-run by the reviewer:**

| Branch | `tsc --noEmit` (folder-local binary) | vitest |
|---|---|---|
| `worktree-agent-a0847c75109246f46` (pipeline) | exit 0 | 78 files, 1552 passed |
| `worktree-agent-a20642a16603d7f26` (web-next) | exit 0 | 31 files, 340 passed |

---

## Branch 1: WP-0 + WP-1a, batched catalogue identity (a9a2958)

**Verdict: CHANGES REQUIRED** (2 MUST-FIX, both about tests. The production code in the batched path is sound.)

### What is good

- `planCatalogueIdentity` is pure: no I/O, and `now` is passed in. Drafts are deduped by natural key before any batch is sent (C-1). A resolver rule short-circuits family and concept creation (C-2). Skips are counted (C-3).
- The V-a/V-b abort is correct and tested. **Mutation M4** removed the rules-unreadable abort, and C-6 went red.
- C-4 genuinely constrains the application layer. **Mutation M5** called `upsertSkus` once per input, and C-4 went red (2,000 calls > 50).
- Concepts use `DO UPDATE` and families use `ignoreDuplicates`, as §2.4 says. Concept ids are mapped by slug, and a reversed-order fake proves it.
- `DealKey` and `SkuKey` replace the old `'|'` strings. `catalogue/domain` was added to the domain-import architecture test.
- `sku_id` is not in `dealToRow` (`shared/types.ts`), so `storeDeals` can never null a link. An aborted catalogue run really does leave existing links alone.
- The old `sourceProductId` was the raw name and the new one is the normalised name. There is **no drift in production**: `run-pipeline.ts:811` already normalises every name before this step, and `normalizeProductName` is idempotent over `UNIT_MAP`.
- **WP-0(c) claim verified.** `supabase/migrations/20260917120000_mv_price_basis.sql:165-192` holds the `worth_picking_up_candidates` definition. It is the latest `CREATE` of that view in the repo; it drops and recreates the views from `20260916_mv_validity_window.sql` and `20260427_v3_concept_layer.sql`. Live-vs-repo drift was not checked because there are no credentials. Stopping was correct.

### MUST-FIX

**M-1. The deal→sku linking step has zero tests. The named regression test for a real production defect was deleted, not ported.**
`catalogue/infrastructure/supabase-catalogue-store.ts:173-219` (`linkDealsToSkus`) and `:232-241` (`runCatalogueStep`).

- The deleted `v3-cutover.test.ts` held *"sets sku_id on the row storeDeals wrote, which is keyed on the NORMALISED name"*. That test guarded the 2026-09-11 defect class, where a lookup key mismatch produced `linked:0` with no error.
- No test anywhere references `linkDealsToSkus` or `runCatalogueStep`. The key also now has a new equality dimension, `valid_from`, compared as a string.
- **Mutation M3** replaced `row.valid_from` with a constant at `:198`. Every catalogue test stayed green. The only failures in the full run were `config.test.ts`, which reads `.github/` and was not copied to the scratch copy.
- **Failure scenario:** a `valid_from` serialisation change (a timestamp instead of `YYYY-MM-DD`) or a normalisation change on one side. Every run would then link 0 deals. The only signal would be a `console.error`, and the run would still exit green.
- **Fix:** port the old fake (its `.in()` really filters and its update returns the affected rows). Add tests for:
  1. The link lands on the normalised-name row with a matching `valid_from`.
  2. A row with the same name but a different `valid_from` is **not** relinked (this is the new intended behaviour).
  3. Zero rows read back reports `linked: 0`.

**M-2. Two key infrastructure guards cannot fail.**
`catalogue/infrastructure/supabase-catalogue-store.test.ts`

- **C-5 for skus (`:150-153`)** only asserts `toBeDefined()`.
  - **Mutation M1** mapped ids **positionally** (batch[i] ↔ data[i]) against the reversed fake response. Every deal got some other deal's sku id, and the test stayed green.
  - Failure scenario: a refactor to positional mapping silently cross-links deals to the wrong products. That is a data-integrity defect this test exists to catch.
  - Fix: assert `result.value.get(key) === skuTable.find(<same natural key>).id`, as the concept test at `:122` already does.
- **P2a / V-c grouping (`:164-176`)** is named "groups … into separate batches" but asserts nothing about batches. `toSkuRow` omits the key per row either way.
  - **Mutation M2** replaced `[withPrice, withoutPrice]` with `[skus]` at `:107`. The test stayed green.
  - Failure scenario: in production, supabase-js sends the union of keys as `columns` for a mixed array, and the default is `defaultToNull: true`. The rows without a price then write `regular_price = NULL`, which erases observed shelf prices. That is exactly V-c.
  - Fix: have the fake record each `upsert()` call's rows. Assert that no single call mixes rows with and without `regular_price`, or reject mixed batches the way PostgREST would.

### SHOULD-FIX

**S-1. Batch-failure blast radius is coarser than ARCH-X §2.4 and coarser than the old code.**

- The code:
  - `supabase-catalogue-store.ts:114`: on the first failing sku batch, `upsertSkus` returns `err`. That throws away the ids of batches already written and skips every later batch.
  - `:67` does the same for concepts.
  - `resolve-catalogue.ts:102-105` and `:111-114` then abort the whole run.
- What the spec says: *"One batch fails → the affected deals have no skuId this run."* The old per-deal loop isolated failures per deal.
- **Failure scenario:** one family draft has a `category_slug` that is not in `taxonomy_category`. `concept_family.category_slug` has a foreign key (`20260427_v3_concept_layer.sql:77`), and `docs/rca/2026-09-17-tech-lead-taxonomy-divergence.md:199` already calls that write "safe only because…". Before, one family failed. Now the families statement fails, and **no deal is linked this run**.
- The comment at `resolve-catalogue.ts:127-129` describes a partial concept map ("a chunk PostgREST rejected") that the port can never return.
- **Fix:** each batch loop collects the ids it got plus a `failedBatches` count, returns a partial map, and continues.

**S-2. Skip and failure reasons never reach the run snapshot.**

- `runCatalogueStep` (`:240`) drops `links.skipped`. Only 3 counts leave the module, and "rules unreadable" exists only as a `console.error`.
- ARCH-X §2.4 says *"Counts (`resolved`, `skipped`, `failedBatches`) go into the run snapshot, not only into a log line."*
- **Failure scenario:** `concept_resolver` is unreadable for weeks. Every run logs `catalogue — concepts:0, skus:0, linked:0`, which looks the same as an empty run.
- **Fix:** carry `skipped` and `failedBatches` through `CatalogueRunStats`.

**S-3. The write tail is still O(deals) in production. The C-4 test name and the commit message overstate what 1a delivers.**

- C-4 counts calls to the port only. `linkDealsToSkus` still issues **one UPDATE per deal whose `sku_id` changed**. That is every newly inserted deal row, which is most of a weekly flyer.
- Estimate (from `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md`: 667 s for 1,579 deals ≈ 420 ms per deal):
  - Old cost was about 3 calls per deal: concept upsert, sku upsert and UPDATE.
  - New cost is ⌈N/100⌉ reads, about 40 batched calls, plus about N UPDATEs.
  - So 1a removes roughly two thirds of the round trips, which is around 200–230 s left instead of 667 s. The per-row UPDATE is now more than 95% of the catalogue step's calls.
  - This is a reasoned estimate, not a measurement.
- **Fix:** retitle C-4 as "resolution is O(batches); linking is still O(deals) until WP-1b", or add a linking-cost assertion. Also make sure WP-2's constants are measured only after 1b, as the plan's sequencing already requires.

**S-4. `CLAUDE.md:21` still lists `v3-cutover.ts # concept/sku layer population` in the folder tree, and there is no `catalogue/` entry.** The file was deleted in this commit. By the project's own rule, a restructure updates the instruction file in the same change.

**S-5. The index migration is not guaranteed to be the "no-op live" that §7 WP-0(b) specifies.**

- `supabase/migrations/20260925000000_products_store_source_name_unique.sql`: `IF NOT EXISTS` matches on index **name**. The live index's name is unknown, as the header admits.
- **Failure scenario:** on apply, a second unique B-tree is created on `products(store, source_name)`. That means a brief write-blocking build and permanent double index maintenance on every product insert.
- The header documents this honestly. **Fix:** before applying, the PM runs one read-only query, `select indexname, indexdef from pg_indexes where tablename = 'products'`, and the migration reuses the live name.

**S-6. Deploy order.** This branch stops refreshing `worth_picking_up_candidates`, while `main`'s homepage still reads it until WP-11 ships. If this deploys first, the section serves a frozen view. It never shows expired rows, because `inEffectCandidateRows` re-checks dates, but it shrinks to empty as the week turns. **Fix:** ship WP-11 first or in the same deploy.

### NIT

- `CatalogueRunStats` is declared twice: `run-pipeline.ts:82` and `supabase-catalogue-store.ts:221`. Import one.
- The log metrics changed meaning. `concepts:` now counts deduped sku drafts, not deals, and `skus:` counts unique ids. Before/after run logs are not comparable, so note it in the run notes.
- `runCatalogueStep`, which is composition, lives in `infrastructure/` and calls the application use case. That is an infrastructure→application dependency, and wiring belongs in `composition.ts`. This is minor.
- Dedupe is by `PendingSkuKey`, not by the final `SkuKey`. Two different refs that resolve to the same concept id would put one conflict target in one statement twice, and Postgres rejects the whole batch. This cannot happen today, because both resolver matching and `sourceProductId` work on pre-normalised names. A three-line final-key dedupe before `upsertSkus` would make it impossible by construction.
- Behaviour change, intended: older-window active rows with the same store and name are no longer relinked, whereas the old key was `(store, name)`. Worth one line in the WP-1b notes.
- `Result` is imported from `collection/domain/result` across bounded contexts. As a shared kernel this is acceptable. If a third context needs it, consider moving it to `shared/`.

---

## Branch 2: WP-11, remove "Worth a look" (760a8b4)

**Verdict: CHANGES REQUIRED** (1 small MUST-FIX. Everything else is clean.)

### Verified

- **No residual code references.** `grep` for `WorthPickingUp`, `worth-picking-up`, `worth_picking_up`, `hidden_suggestions`, `settings/hidden`, `HiddenSuggestions`, `coldStartCandidates` and `inEffectCandidateRows` across `web-next/src`, `web-next/e2e`, the pipeline and the root returns only:
  - migrations
  - pipeline MV refresh lists, which are out of scope per the spec (§2 "Keep"); branch 1 removes the `v3-cutover.ts` one
  - the doc-only hits listed under NITs
  - No sitemap, cache tag (`wpu`) or e2e test references the removed route or section.
- **Locale JSON is valid in all 4 files.** Only the `worth_picking_up` and `hidden_suggestions` namespaces were removed. All other top-level namespaces are byte-identical in value before and after (en/de: 15→13, fr/it: 9→7).
- **The `page.tsx` and `MethodologyStrip.tsx` edits match spec §2 exactly.** The `Link` import was removed correctly, since it had no other use. `user_interest` and `AvailabilityCellSheet` are untouched.
- **The pre-existing biome debt claim holds.** The 2 biome errors in `page.tsx` (import grouping, multi-line signature format) come from lines this commit did not change; the same blank-line import groups and signature exist at `HEAD~1`. `MethodologyStrip.tsx` is clean. The `messages.test.ts` format error is in an untouched file. Project-wide: 73 errors and 18 warnings. The base total was not independently recounted.

### MUST-FIX

**M-1. `page.tsx` now has zero tests, and the WP-11 test named in the tech-lead plan was never written.**

- Tech-lead plan §7, WP-11 row, names the first failing test: *"the homepage renders without the Worth-a-look section and issues no worth_picking_up_candidates query."*
- The builder deleted `page.test.tsx`, including its working scaffolding (the `@/i18n/navigation` mock, the `setRequestLocale` mock and the snapshot mock). That scaffolding is exactly what this test needs.
- The builder's reasoning is fair: an empty file fails with "No test suite found". The fix, though, is to replace the file's contents, not delete it.
- **Failure scenario:** a later merge or cherry-pick from an older branch that still has `worth-picking-up.ts`, or a revived section, re-adds the fetch. Nothing goes red. More generally, `HomePage` rendering server-side without throwing (snapshot → verdict → methodology) has no test at all.
- **Fix:** restore `page.test.tsx` with one test that:
  - renders `HomePage` with the existing mocks,
  - asserts `MethodologyStrip` output is present and there is no "Worth" section or `/settings/hidden` link,
  - asserts the only data call is `getWeeklySnapshot`, using a mock with a call count.

### NIT

- `HANDOVER.md:262` and `:294` still reference `WorthPickingUp.tsx`. Close item #3 there ("Cold-start CTA copy mismatch"), since the component is gone.
- `web-next/src/server/data/supabase-provider.test.ts:37` has a `biome-ignore` comment that "mirrors worth-picking-up.test.ts's fakeDealsClient", which is a deleted file. Reword it.
- Spec follow-up (non-blocking): mark `docs/design-3-new-surfaces.md` §3 as retired.

### Note for the Tech Lead (not a finding on either branch)

After WP-11, **no web code reads `concept_cheapest_now`, `sku` or `deals.sku_id`**. Only `server/data/concepts.ts` reads `concept` and `concept_family`.

That means two costs now serve no reader in the product:
- the per-row `sku_id` UPDATE tail (branch 1, S-3), which is the dominant remaining write cost;
- the `concept_cheapest_now` refresh on every run.

Before investing in WP-1b's "sku_id rides the main upsert", it may be worth deciding whether linking should stay at all. That is a Tech Lead/PM call, not the reviewer's.

---

## Mutation log (scratch copy, not committed)

| # | Mutation | Location | Result |
|---|---|---|---|
| M1 | sku ids mapped by response position | `supabase-catalogue-store.ts:123-129` | **Survived** (→ M-2) |
| M2 | `[withPrice, withoutPrice]` → `[skus]` | `supabase-catalogue-store.ts:107` | **Survived** (→ M-2) |
| M3 | link key `valid_from` → constant | `supabase-catalogue-store.ts:198` | **Survived** (→ M-1) |
| M4 | no abort on unreadable rules | `resolve-catalogue.ts:86-89` | Killed by C-6 |
| M5 | one `upsertSkus` call per sku | `resolve-catalogue.ts:144` | Killed by C-4 |

---

## Re-review: Branch 2, WP-11 fixes (5c8e49a)

**Verdict: APPROVED.** Zero open findings. One optional NIT is carried forward below and does not block.

I checked only the items flagged earlier, plus anything new in the fix commit.

**Gates re-run by the reviewer:** `tsc --noEmit` (folder-local binary) exit 0. vitest: 32 files, 341 passed. Biome on `page.test.tsx` and `supabase-provider.test.ts`: 0 diagnostics. Working tree clean.

### M-1 (page.tsx untested, named test missing): FIXED

`web-next/src/app/[locale]/page.test.tsx` is restored and carries the tech-lead §7 name verbatim. It renders `HomePage` through `NextIntlClientProvider` with the real `en.json` messages. It asserts that:
- the methodology heading is present;
- there is no "worth a look", "worth picking up" or "hidden suggestions" text;
- there is no `/settings/hidden` link;
- `getWeeklySnapshot` is called exactly once.

I ran my own mutations in a scratch copy (none committed). All were killed:

| Mutation | Result |
|---|---|
| Full WP-11 revert: `page.tsx`, `worth-picking-up.ts`, 3 WPU components, `/settings/hidden`, old `MethodologyStrip.tsx` and `en.json` restored from `8cc8beb` | **Red**, but only because `cacheLife()` throws outside Next (see NIT) |
| Old `MethodologyStrip` plus old `en.json` only (Hidden Suggestions link back) | **Red**: `a[href="/settings/hidden"]` is not null |
| Static `<h2>Worth a look this week</h2>` injected into `page.tsx` | **Red**: text assertion |
| Second `getWeeklySnapshot` call added | **Red**: call count |
| `<MethodologyStrip />` removed | **Red**: heading assertion |

### Minors: FIXED

- `HANDOVER.md:262` no longer lists `WorthPickingUp`.
- `HANDOVER.md:294`, item #3, is marked closed and cites 760a8b4.
- `supabase-provider.test.ts:37`: the `biome-ignore` reason now stands on its own and no longer points at a deleted file.

### New issues introduced by the fix

None.

### NIT (optional, non-blocking)

The "issues no `worth_picking_up_candidates` query" half of the test holds only incidentally.
- A full revert goes red because the real `worth-picking-up.ts` calls `cacheLife()`, which throws under vitest. No assertion catches it.
- The call-count assertion only covers `getWeeklySnapshot`. A second data source that neither throws nor renders text would pass. For example, a reintroduced fetch whose module does not use `cacheLife`, returning 0 candidates.
- A sturdier guard would mock the Supabase server client and assert that `from('worth_picking_up_candidates')` is never called.
- The test's own header comment already names the throw path, so this is acceptable as-is.

---

## Re-review (Branch 1, after §10): net diff 8cc8beb..44149dd

**Verdict: APPROVED.** No open code findings.

This re-review is against the Tech Lead's §10 ruling (main checkout, `docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` §10). Under that ruling, my earlier Branch 1 findings M-1, M-2, S-1, S-2, S-3 and the catalogue NITs are **closed as moot**: the code they were about is removed.

Two conditions remain, and neither is a code change:
- **S-5:** the PM runs the read-only `pg_indexes` query before the index migration is applied.
- **S-6:** WP-11 (5c8e49a, approved) merges **before or together with** this branch.

**Gates re-run by the reviewer:** `pipeline/` `tsc --noEmit` (folder-local binary) exit 0. vitest: 75 files, 1540 passed. Working tree clean.

### Retirement is complete

- `pipeline/catalogue/` is gone.
- `v3-cutover.ts` and its test are deleted.
- `populateV3Layer`, `V3CutoverStats` and `runCatalogueStep` are gone from the storage port.
- The call is removed from `runTransform`, and `composition.ts` has no wiring left.
- The net diff of `collection/domain/architecture.test.ts` against `8cc8beb` is **empty**, so `DOMAIN_DIRS` is back to 2.
- A repo-wide grep outside `docs/`, `archive/`, `.claude/` and migrations covers `sku_id`, `from('sku`, `from('concept`, `concept_resolver`, `concept_cheapest_now`, `exec_refresh_mv`, `populateV3Layer`, `runCatalogueStep`, `v3-cutover` and `CatalogueRunStats`.
  - The only hits are the two one-shot `pipeline/migrate/` scripts (excluded by §10.2), the new tests, and the retirement comment.
  - No workflow or `package.json` script invokes the `migrate/` scripts.
- **Nothing writes `sku`, `concept*` or `deals.sku_id`, and nothing refreshes `concept_cheapest_now`.**
- `dealToRow` never carried `sku_id`, so existing links stay as they are. No DB object is dropped.

**Revert path.** The comment at `run-pipeline.ts:816-825` names `a9a2958` and says to revert 44149dd. Reverting 44149dd restores exactly the a9a2958 tree: catalogue module, wiring and tests. I checked this with `git archive a9a2958 pipeline/catalogue`. It is correct.

**WP-0 parts are intact.** Relative to `8cc8beb`, the only non-comment change outside the removal is the `CREATE UNIQUE INDEX IF NOT EXISTS` statement. The `live-sources.ts` SPAR change is comment-only. The CLAUDE.md Coop exception is present. The "unique index declared" tests are unchanged.

**S-4: fixed.** The `CLAUDE.md` folder tree no longer lists `v3-cutover.ts`, and no `catalogue/` entry was added.

**S-5: still open, unchanged, and not a code change.** The PM runs `select indexname, indexdef from pg_indexes where tablename = 'products'` and the migration reuses the live index name, before it is applied.

**S-6: stronger.** Once this branch deploys, `concept_cheapest_now` also stops refreshing. `main`'s homepage section would then read two frozen views. WP-11 is approved, so merge it first or in the same deploy.

### Can the new tests fail? Mutations in a scratch copy (none committed)

| # | Mutation | §10 grep test |
|---|---|---|
| A | Restore `pipeline/catalogue/` from `a9a2958` (the realistic revert) | **Red** |
| B | New file with `supabase.from('sku').upsert(...)` | **Red** |
| E | New file with `rpc('exec_refresh_mv', { view_name: 'concept_cheapest_now' })` | **Red** |
| F | Restore `v3-cutover.ts` from `8cc8beb` | **Red** |
| C | Same writer with double quotes: `from("sku")` | Survives |
| D | Same writer, `.from(` and `'sku'` on separate lines | Survives |

The write-tail order test (`run-pipeline.test.ts`, "the write tail has no catalogue step") uses `toEqual` on the full recorded storage call list. Any added storage call, catalogue or otherwise, turns it red by construction. It is correct that it asserts the whole sequence and not only `not.toContain`.

### NIT (non-blocking)

- **Grep gaps (C, D).** `pipeline/` has no formatter or linter enforcing quote style, so `from("sku")` is plausible from a copy-paste. Suggested fix: match `/\.from\(\s*['"`](sku|concept)/` on the comment-stripped source, instead of the literal `from('sku')` and `from('concept`. `sku_id` would still catch most writers that link deals. The comment stripper also drops any code line that starts with `*`, which is an edge case only.
- **Stale historical wording.** `.github/workflows/pipeline.yml:127` and `transformation/domain/resilience.ts:313` still list "v3 cutover" inside the write tail. Both describe the run that was measured back then, so they are historically accurate. A one-word "(since retired)" would stop a reader looking for the step.
