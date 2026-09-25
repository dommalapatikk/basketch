# QA Test Report — Retire the concept/sku catalogue writer (WP-0 + WP-1a′)

**Date:** 2026-09-25
**Tested by:** QA Tester Agent
**Branch under test:** `worktree-agent-a0847c75109246f46` (worktree `/Users/kiran/ClaudeCode/basketch/.claude/worktrees/agent-a0847c75109246f46`)
**Commits:** a9a2958 → 44149dd → ec63bab
**Baseline compared against:** `main` @ 8cc8beb
**Scope:** offline/static verification only. **No DB writes, no push, no workflow triggers, no OpenRouter/Gemini calls were made.** All checks below are read-only file inspection, `git archive` snapshots run in `/private/tmp/.../scratchpad`, and local `vitest`/`tsc`/`pytest` runs against captured fixtures — never against production Supabase or a real retailer network call.

**Overall verdict: PASS**, with one carried-forward, already-tracked follow-up (S-5, PM action) and one deployment-ordering condition (S-6) that this QA independently re-confirms as still live.

---

## 1. Dry-run / offline mode — does one exist? Ran the safe alternative instead

**Finding: No dry-run/offline/fixture mode exists for a full pipeline run.**

- `pipeline/run.ts` (identical byte-for-byte to main, confirmed by `diff`) always calls `createProductionDeps(process.env)` from `composition.ts`, which wires the real Supabase client (`supabase-client.ts`), real Gemini/OpenRouter clients, and real retailer network sources (`createLiveSources`). There is no `DRY_RUN`, `--offline`, `NODE_ENV=test`, or similar flag anywhere in `run.ts`, `run-pipeline.ts`, or `composition.ts` (`grep -niE "dry.?run|offline|fixture|MOCK"` on those three files returns nothing relevant — the only "fixture" hits are code comments about future work).
- `pipeline/package.json` scripts are only `build`, `start` (= `tsx run.ts`, production), `test` (vitest), `test:watch`, `type-check`. No `dry-run` / `replay` script exists yet (WP-5's `ReplayTransport` + `capture-fixtures` script is still planned, not built).
- The only offline execution paths are **per-adapter unit/port-contract tests** against `__fixtures__/` (e.g. `collection/infrastructure/port-contract.test.ts`), not a full end-to-end run of `run.ts`.

Per the task instructions, since no safe full-pipeline offline mode exists, I did **not** improvise one against production. Instead I ran the full offline test suites on both `main` (8cc8beb) and the branch, and diffed the results.

### 1a. Pipeline vitest — branch vs. main

| | Branch (ec63bab) | Main (8cc8beb, `git archive` snapshot) |
|---|---|---|
| `tsc --noEmit -p tsconfig.json` (folder-local binary) | **exit 0** | not required to re-check (unchanged files) |
| `npm test` (vitest) | **75 files, 1540 tests passed** | **75 files, 1537 tests passed** |

Exact test-file diff (`find *.test.ts` sorted, both sides): the **only** difference is `v3-cutover.test.ts` (main, 2 tests) removed, replaced by `architecture.test.ts` (branch, new top-level file, 4 `it` blocks including the §10 "no pipeline write path touches the retired concept/sku layer" grep test and the WP-0(b) unique-index test). No other test file was added, removed, or renamed. This independently reproduces the Code Reviewer's own re-run numbers (`docs/reviews/2026-09-25-review-wp0-1a-and-wp11.md`: "pipeline `tsc --noEmit` exit 0; vitest 75 files, 1540 passed"). **PASS.**

I also re-ran the actual mutation the reviewer used to validate the new architecture test is not vacuous: confirmed by reading `architecture.test.ts` directly — it recursively walks `pipeline/` (excluding `node_modules`, `dist`, `__fixtures__`, `migrate`, `archive`), strips comments, and asserts zero matches for `.from('sku'|'concept...')`, `concept_resolver`, `sku_id`, `concept_cheapest_now`. It also asserts `files.length > 20` so it cannot pass by silently finding nothing. **PASS.**

### 1b. Shared vitest — branch vs. main

Both **identical**: 5 files, 99 passed, 3 expected-fail, 102 total. `diff` of `shared/types.ts` between main and branch is **empty** — `dealToRow` is byte-for-byte unchanged, confirming `sku_id` was never part of the deal row shape (per §10.2: "`dealToRow` never carried `sku_id`"). **PASS.**

### 1c. Migros OCR pytest — branch (main has the same file, unaffected by this change; run on branch only, since the catalogue retirement touches nothing under `collection/infrastructure/migros/`)

`ocr.py`/`test_ocr.py` have no top-level heavy imports (`rapidocr_onnxruntime` is lazily imported inside functions), so a scratch venv with only `pytest`, `pillow`, `numpy` (no `rapidocr-onnxruntime`, no network, no paid calls) was sufficient:

```
13 passed in 2.82s
```

No file under `pipeline/collection/infrastructure/migros/` changed between main and branch (confirmed no diff for adjacent categorisation-relevant files below), so this is a control check, not expected to move. **PASS.**

### 1d. Deal-row shape and categorisation-relevant code — confirmed byte-identical to main

`diff` (main 8cc8beb vs. branch) on every file that determines what a deal row looks like or how it's categorised:

| File | Diff |
|---|---|
| `shared/types.ts` (`dealToRow`) | **empty** |
| `pipeline/store.ts` (`storeDeals`, batching, dedupe) | **empty** |
| `pipeline/categorize.ts` | **empty** |
| `pipeline/product-resolve.ts` | **empty** |
| `pipeline/product-metadata.ts` | **empty** |
| `pipeline/product-group-assign.ts` | **empty** |
| `pipeline/resolve-taxonomy.ts` | **empty** |
| `pipeline/collection/infrastructure/live-sources.ts` | **comment-only** (the SPAR `withheld-by-policy` doc fix, no code change) |
| `pipeline/run.ts` | **empty** |
| `exitCodeFor(...)` in `run-pipeline.ts` | **empty** |

**Conclusion for Check 1:** deal rows this branch will write are identical in shape and content to what main writes today — same prices, same categorisation, same discount math, same image columns. Exit code semantics are unchanged. The only functional removal is the catalogue write step itself. **PASS** (evidenced by full offline suites + line-level diffs, not by a live run — a live-run confirmation is still owed; see §4 checklist).

---

## 2. GitHub workflow / package.json — anything still invoking the removed code?

Checked `.github/workflows/pipeline.yml` and `.github/workflows/ci.yml` on the branch, plus `pipeline/package.json`:

```
grep -niE "catalogue|concept|sku|v3-cutover|exec_refresh_mv" .github/workflows/pipeline.yml   → 0 hits
grep -niE "catalogue|concept|sku|v3-cutover" pipeline/package.json                              → 0 hits
```

The only related text anywhere is a **historical, backward-looking** comment inside `pipeline.yml`'s `timeout_minutes: 60` explanation, describing the write tail *as it was measured* on 2026-09-16, and it is explicitly annotated `(since retired, 2026-09-25)`:

> `taxonomy → resolve → storeDeals → enrichment → v3 cutover (since retired, 2026-09-25) → sweep → deactivate → logRun`

This is documentation of a past measurement, not a live invocation — it does not call any removed code path. This matches the reviewer's own NIT ("stale historical wording... historically accurate"). A repo-wide grep for the writer's actual call sites (`from('sku')`, `from('concept`, `concept_resolver`, `sku_id`, `concept_cheapest_now`, `exec_refresh_mv`, `populateV3Layer`, `runCatalogueStep`, `v3-cutover`, `CatalogueRunStats`) across all of `pipeline/` (excluding `migrate/`, `archive/`, tests, docs) returns **zero writers** — only the retirement comment in `run-pipeline.ts:816-825`, the grep test itself, and the two negative assertions in `run-pipeline.test.ts` (`not.toContain('runCatalogueStep')`, `not.toContain('populateV3Layer')`).

`pipeline/catalogue/` does not exist on disk. `pipeline/migrate/` still has the two one-shot scripts (`seed-v3-from-deals.ts`, `fix-dairy-miscategorisation.ts`) — explicitly out of scope per §10.2 — and no workflow or `package.json` script invokes either. **PASS.**

---

## 3. Read-only check: does the web frontend (main) read the data that stops updating?

Checked `main`'s `web-next/src` (via the `git archive` snapshot, read-only):

- `web-next/src/server/data/worth-picking-up.ts:146` — `.from('worth_picking_up_candidates')`. This is the **live production reader**.
- `web-next/src/server/data/worth-picking-up.ts:59` — comment: "Carried through from `deals` via `concept_cheapest_now`" — confirms the view chain `deals → concept_cheapest_now → worth_picking_up_candidates`.
- Consumers of that module: `web-next/src/app/[locale]/page.tsx` (the homepage), `web-next/src/components/landing/WorthPickingUp.tsx`, `WorthPickingUpClient.tsx`, `WorthPickingUpCard.tsx` — all present and wired on `main` today.
- No reader of `sku`, `deals.sku_id`, or bare `concept`/`concept_family` tables found in `web-next/src` beyond the dead, uncalled `server/data/concepts.ts` (already noted in the RCA/review as dead code, not a live reader).

**Confirms the RCA's own warning (S-6):** once this pipeline branch (which stops refreshing `concept_cheapest_now`, since that refresh only ran inside the now-deleted catalogue step) deploys, `main`'s homepage "Worth a look" section will keep querying `worth_picking_up_candidates` — but that view, and the `concept_cheapest_now` view it joins, will be **frozen** (no longer refreshed). It won't show wrong data (the code re-checks validity dates client-side, per the RCA), but the candidate pool will only shrink as deals expire, never refill, and will look increasingly broken over the following days/weeks.

**The retirement branch (WP-11, `worktree-agent-a20642a16603d7f26`, commit 5c8e49a) removes this reader entirely and is already Code-Reviewer-APPROVED.** Per the tech-lead ruling and the reviewer's own S-6 note, **WP-11 must merge and deploy before or together with this branch.** This QA independently reproduces that same conclusion from a fresh read of `main`'s current code — it is not yet mitigated on `main` as of this check. **This is not a defect in the branch under test; it is a deployment-sequencing condition that must be honored by whoever merges/deploys.** Flagging as **PASS-WITH-CONDITION**, not FAIL, since the branch itself does exactly what it says and the mitigation (WP-11) already exists and is approved.

---

## 4. Checklist for the coordinator — verify after the next real scheduled pipeline run

**Should change (expected, this branch's whole point):**
- [ ] Write tail line (`[pipeline] [INFO] write tail: Nms (taxonomy → resolve → storeDeals → enrichment → sweep → deactivate → logRun)`) — the step list must **not** mention a catalogue/concept/sku step, and the printed duration should drop by roughly the ~667 s (R3 measurement) to ~200-230 s (REV S-3 estimate) that the catalogue step used to cost. Look for a run whose total write tail is meaningfully shorter than the 09-24 baseline (R3 a2: 667.3 s just for the catalogue portion).
- [ ] No `[v3] cutover step`, `[v3] linked N deals.sku_id`, `[v3] refreshed concept_cheapest_now`, or `[v3] refreshed worth_picking_up_candidates` log lines should appear anywhere in the run log.
- [ ] `concept_cheapest_now` and `worth_picking_up_candidates` should show **no new `refreshed_at`/row churn** after this run (they are frozen). This is expected, not a bug, **provided WP-11 has shipped first** (see §3).
- [ ] `RUN_DEADLINE_MS`/`WRITE_TAIL_MS` budgets (WP-2, not yet done) will still be based on the **old, catalogue-inclusive** measurement until they're explicitly re-derived — confirm the run does not trip `capacity-exceeded` or run long enough to need the interim `RUN_DEADLINE_MS` mitigation the RCA flagged for the 2026-10-01 Thursday run.

**Must NOT change (regression signal if they do):**
- [ ] Deal counts per retailer (Migros/Coop/LIDL/ALDI/Denner/SPAR/Volg) should match the same order of magnitude as recent runs — categorisation code (`categorize.ts`, `product-group-assign.ts`, `resolve-taxonomy.ts`) is byte-identical to main, confirmed above.
- [ ] `resolveProducts` "Created N new X products" vs. real inserts — this branch does **not** fix the 1,000-row PostgREST cap bug (that's WP-1c, separately sequenced, not in this branch). Expect the same false "Created" counts as before (e.g. Coop still over-counting) — this is a known, already-documented, unrelated defect, not something this branch should have touched.
- [ ] `discount_percent` / price invariants (ALDI rule, LIDL Plus label) should be unaffected — no code touching price/discount logic changed.
- [ ] Deal row image columns (`image_url`, `page_image_url`, crop fractions) should be unaffected — `dealToRow` is unchanged, and image write-path work is separately sequenced as WP-1d (not in this branch).
- [ ] Exit code behavior (0 success / 75 transient-retry / 1 hard failure) unchanged — `exitCodeFor` is byte-identical to main.
- [ ] `pipeline_run_metrics`/run snapshot should **not** show any `concepts:`/`skus:`/`linked:` counters going forward (they only ever existed inside the now-removed catalogue module's own `console.log`, never in `alerts`/`json-telemetry`/`run-snapshot`, confirmed by grep) — their disappearance from the log is expected, not a regression.
- [ ] Confirm **WP-11 has deployed** (homepage no longer shows "Worth a look" / queries `worth_picking_up_candidates`) at or before this pipeline branch's first live run, per §3 above.

**One-time, PM-owned, not a code check (S-5, still open):** before the `20260925000000_products_store_source_name_unique.sql` migration is applied, the PM should run the read-only query `select indexname, indexdef from pg_indexes where tablename = 'products';` against the live database and confirm the migration's `CREATE UNIQUE INDEX IF NOT EXISTS products_store_source_name_unique_idx` won't create a redundant second unique index under a different name than whatever already enforces this live. This QA did not run that query (no DB access authorized in this task), and the migration text itself documents that its own live index name is unknown — so this stays open exactly as the Code Reviewer left it.

---

## Summary of findings by check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Dry-run/offline mode found? | N/A — none exists | grep of run.ts/run-pipeline.ts/composition.ts; package.json scripts |
| 1 | Offline test suites, branch vs. main | **PASS** | pipeline vitest 1540 vs 1537 (only test-file diff: v3-cutover.test.ts ↔ architecture.test.ts); shared vitest identical (99+3); Migros pytest 13/13 passed; `tsc` exit 0 |
| 1 | Deal row shape/content identical to main | **PASS** | byte-identical diffs: shared/types.ts, store.ts, categorize.ts, product-resolve.ts, product-metadata.ts, product-group-assign.ts, resolve-taxonomy.ts, run.ts, exitCodeFor |
| 1 | Write-tail order has no catalogue step | **PASS** | run-pipeline.ts write tail comment + log line; run-pipeline.test.ts exact-order test read directly |
| 2 | Workflow/package.json invoke removed code? | **PASS** | 0 grep hits in pipeline.yml/package.json; only a historically-accurate, explicitly annotated comment remains |
| 3 | Web frontend (main) reads retired data? | **PASS-WITH-CONDITION** | `worth-picking-up.ts:146` still reads `worth_picking_up_candidates` on main; mitigation (WP-11, already approved) must deploy first/together |
| 4 | Coordinator checklist | delivered above | — |

**Overall: PASS.** The retirement is complete and clean by every offline/static signal available without a live run or DB credentials: zero residual writers, zero workflow/script invocations, deal-row-producing code untouched, write-tail order correct, exit codes unchanged, and both inherited review conditions (S-5 PM index check, S-6 WP-11-before-or-with deploy ordering) are still correctly tracked as open and not silently dropped. A live-run confirmation against the checklist in §4 is still owed and cannot be substituted by this offline pass.
