# SRE report — the three post-2026-09-21 Deal Pipeline runs

Investigated: 35589218267 (2026-09-21), 35711077054 (2026-09-22), 35983172760 (2026-09-24).
Method: `gh run view <id> --json …`, `gh run view <id> --log`, `.github/workflows/pipeline.yml`,
`pipeline/transformation/domain/resilience.ts`, direct read-only REST queries against Supabase
(`pipeline_runs`, `deals`), and an unauthenticated `curl` against `basketch.vercel.app`.
Read-only throughout — no code edited, no workflow dispatched, no DB write.

---

## Failures found (ranked by severity)

### 1. HIGH (drift, not yet a break) — `WRITE_TAIL_MS` is stale on every run since it was set; the deadline's own safety invariant is eroding
`WRITE_TAIL_MS = 9.5 min` (`pipeline/transformation/domain/resilience.ts:334`) was measured on run `34833209176` at ~1,500 deals. All three runs' attempts that reached the write tail exceeded it, and the code's own self-check (`checkWriteTailDuration`, `resilience.ts:364`) fired a `[WARN]` every time:
- Run 1, attempt 2: **588.0s** (log line 3775, `35589218267.log`)
- Run 2, only attempt: **770.4s** (log line 1323/3777-equiv, `35711077054.log`)
- Run 3, attempt 1: **861.8s**; attempt 2: **982.8s** (`35983172760.log:2527,4923`)
Trend: 588s → 770s → 862s → 983s, monotonically up as stored-deal count rises (1313 → 1366 → 1161 → 1562). The constant's own comment (`resilience.ts:326-332`) predicted this: "at 0.37s/deal, ~3,000 deals ≈ 18.5 min, which alone would break the F1 inequality." Run 3's 982.8s (16.4 min) at 1,562 deals is already tracking toward that. **Not yet a broken invariant per attempt** (28+chunk+16.4+2 still fits under 60 in these three runs because chunks stayed short — see #3), but the margin that "45→60/28 F1 ruling" was built on is visibly consumed. Every occurrence was logged as `##[warning]`-equivalent `[pipeline] [WARN]`, not silent.

### 2. MEDIUM — root cause of the write-tail growth is concentrated in one step: `v3 cutover`
Run 2 (`35711077054.log:1308-1318`): `[v3] cutover step — resolving concepts + skus for 1378 deals` at `09:45:04.6129988Z`, next v3 log line `[v3] linked 62 deals.sku_id` at `09:53:31.0811135Z` — **8m27s** for one step, out of the run's 770s (12m50s) write tail. Same pattern in run 3 (`4909` → next v3 line inferred from the 982.8s total write tail spanning `11:07:10` upsert to `11:23:19` warn). This step, not enrichment or storeDeals, is where the write-tail budget is being spent. Not previously called out in the session summary's WRITE_TAIL_MS breakdown.

### 3. MEDIUM (capacity risk, currently masked) — judge (OpenRouter) rate-limit pacing dominates two of the three runs' wall-clock time, and is why two runs took 78–98 minutes total despite a 60-minute per-attempt budget
`openrouter:openai/gpt-5-nano: per-minute cap reached, waiting 60s` fired **1,269 times** in run 1 and **1,690 times** in run 3, versus only **78 times** in run 2 (grep counts, all three logs). This is `checkRate`'s designed 90%-of-published-limit pacing (`resilience.ts:211-229`), not a bug — but it is the direct reason chunks 1-4 in runs 1 and 3 each took 390–620s and the in-process deadline (`RUN_DEADLINE_MS`, 28 min) fired before all classification chunks completed, forcing a second attempt via `retry_on_exit_code: 75`. Run 2 needed only 1 chunk (87 products — most were cache hits from the shared week, consistent with per-retailer publication weeks) and finished in one attempt. **This is why "60 minutes" was exceeded**: `timeout_minutes: 60` in `pipeline.yml:139` (nick-fields/retry) is a **per-attempt** ceiling on the retried step, not a job or overall-workflow timeout — the job itself carries GitHub's default (no `timeout-minutes:` set on the job). Two attempts, each individually finishing inside its own ~60-minute allowance plus ~7-9 minutes of setup steps (checkout/npm ci/apt/pip) and a 60s `retry_wait_seconds`, sum to the observed 1h19m and 1h38m. GitHub reports "success" correctly — no step or job exceeded its own configured timeout; the wall-clock total is simply attempt-1-time + 60s + attempt-2-time + setup overhead, which was never bounded at 60 minutes in the first place. **This is expected under the current design** (documented in `pipeline.yml:120-131`), not a bug, but it means "the pipeline finishes in under an hour" is not currently true for any run with >1 chunk deferred.

### 4. LOW (already tracked, confirmed still open) — `benchmarkMacroF1` fallback still runs off a stale/undecided benchmark
Run 1: `[pipeline] [WARN] falling back to gemini-3.1-flash-lite: macro-F1 0.842 vs 0.855 (-0.013)` (`35589218267.log:337`). Runs 2 and 3 did not fall back (`classifier model: gemini-3.5-flash-lite` used directly). This matches session-summary §10 pending item 2 (AP-6 undecided) — not new, still open, PM action pending.

### 5. LOW (already tracked, confirmed still open) — taxonomy category_slug coverage is ~60-65% on every run, not improving
`Taxonomy alias: N/M deals got a category_slug` across all 5 logged instances: 653/1039 (63%), 851/1325 (64%), 844/1378 (61%), 677/1173 (58%), 955/1579 (60%). Consistent with the still-open T1 taxonomy-divergence work item (session-summary §5/§10) — flagged here only for completeness, not a new defect.

### 6. LOW — `alerts: 🟡 instrument-missing` fires every run, as expected/documented
`benchmarkMacroF1 could not be evaluated: benchmark not wired` and (run 1 only) `cache-hit-rate comparison could not be evaluated: no previous run to compare against yet`, both logged as `##[warning]` in every run. This is the wired-but-silent alert pair from session-summary §10 pending item 2 — expected until AP-6 is decided, not a new failure.

### 7. OBSERVABILITY GAP, not a production failure — the anon key cannot read `pipeline_runs`
A read-only query with `NEXT_PUBLIC_SUPABASE_ANON_KEY` (via RLS) against `pipeline_runs` returned `[]` (empty, not an error) — RLS appears to block anon SELECT on that table. The SRE runbook (`sre.md`, "Pipeline Health" table) says to check `pipeline_runs` but doesn't name which credential; verified this check only works with `SUPABASE_SERVICE_ROLE_KEY`. Recorded so the next SRE check doesn't waste time on a silently-empty anon query.

### 8. COSMETIC, no impact — ONNX runtime stderr on Migros OCR
`[migros] ocr.py stderr (unparsed): ... Skipping pci_bus_id for PCI path ...` (`35983172760.log:2537`) — a `device_discovery.cc` warning from `onnxruntime` about the absence of a GPU PCI bus on the GitHub-hosted runner. Expected on CPU-only CI, no effect on OCR output (migros still returned 55-56 offers every run, matching prior weeks).

### No failures found in:
- **Retailer collection** — all 7 retailers returned `ok` status on all 3 runs, offer counts within the range of recent weeks (denner 216-268, coop 839-1018, volg 25, spar 65-84, aldi 137-163, lidl 70-73, migros 55-56). No `BelowExpectedYield`, no source errors.
- **Spend guard** — `spend account` logged and decreasing monotonically and modestly every run: $3.3537 → $3.3377 → $3.3260 → $3.3233 → $3.3073 (of $5.0000/period). No overspend, no guard trip, no `spendNearCeiling: true` (confirmed `false` in the DB `metrics` blob for the 09-24 run).
- **Judge behaviour** — every judge call logged `verdict defensible`, no judge errors, no daily-quota trips (`rate-limited-daily` never appeared in any log).
- **Backfill deadline honouring (WP-P9 MUST-FIX 3)** — confirmed working on every deadline hit: backfill logged `⚠ run-deferred: in-process deadline reached before backfilling — N of N products still owing attributes carried forward`, and the run exited 75 (not silently exiting 0 with an incomplete backfill) each time it was cut short. No repeat of the 09-17 "17-minute unbounded backfill."
- **MAX_CHUNK_MS** — no `chunk took … longer than MAX_CHUNK_MS` warning fired in any of the 3 runs; the longest observed chunk was 618.8s (run 3, chunk 3/5) against the 1,170s constant. The staleness concern raised in session-summary §6 did not reproduce here — worth noting for the pending "re-measure after 09-21" task, since the numbers now look healthier than feared, not worse.
- **Healthcheck ping** — logged `healthcheck ping ok` on every exit, both `(exit 75)` and `(exit 0)`, on all 3 runs. Dead-man's switch is being fed correctly.
- **CI (non-pipeline)** — `gh run list` shows no failed runs since the already-documented 09-17 failure (35207519113); all `CI` (push-triggered) runs since are `success`.
- **Site availability** — `basketch.vercel.app` returns HTTP 200, served from Vercel's edge cache (`x-vercel-cache: HIT`, `age: 251`).

---

## Per-run table

| Run ID | Date | Wall time (job) | Attempts | Exit codes | Deadline fired? | Backfill bounded? | Offers collected (7 retailers) | Deals stored (final) | Write tail | Judge cap hits |
|---|---|---|---|---|---|---|---|---|---|---|
| 35589218267 | 2026-09-21 | 1h19m07s (10:31:44→11:50:51) | 2 | 75 → 0 | Yes, both attempts | Yes — 467/467 then 82/482 deferred | 1,435 (denner 222, coop 848, volg 25, spar 84, aldi 137, lidl 73, migros 55) | 1,313 (upsert: 1,313/1,325, 12 dup-collapsed) | 588.0s (WARN, >570s) | 1,269 |
| 35711077054 | 2026-09-22 | 19m50s (09:33:50→09:53:40) | 1 | 0 | No | N/A (no chunks deferred) | 1,425 (denner 221, coop 839, volg 25, spar 84, aldi 137, lidl 73, migros 55) | 1,366 (upsert: 1,366/1,378, 12 dup-collapsed) | 770.4s (WARN, >570s) | 78 |
| 35983172760 | 2026-09-24 | 1h37m56s (09:45:29→11:23:25) | 2 | 75 → 0 | Yes, both attempts | Yes — 28/28 then 28/28 deferred | 1,650 (denner 268, coop 1,018, volg 25, spar 65, aldi 163, lidl 70, migros 56) | 1,562 (upsert: 1,562/1,579, 17 dup-collapsed) | 861.8s attempt 1, 982.8s attempt 2 (both WARN) | 1,690 |

Sources: `gh run view <id> --json jobs` (timings), `gh run view <id> --log` (all counts, exit codes, warnings — line numbers cited inline above), Supabase `pipeline_runs` table read via service-role key (cross-checked `total_stored` and `store_results` against the logs — matched exactly, e.g. run 3's `ae0070a7…` row: `total_stored: 1161`, `duration_ms: 2805258` = attempt 1; `eed81ed5…` row: `total_stored: 1562`, `duration_ms: 2973120` = attempt 2/final).

---

## Answers to the four investigation questions

**1. Did they publish? Counts? Exit codes? Did the deadline fire, did backfill honour it?**
Yes, all three published (1,313 / 1,366 / 1,562 deals respectively — see table). Runs 1 and 3 hit `RUN_DEADLINE_MS` on their first attempt (exit 75), retried, and hit it again on the final attempt (published what was classified, exit 0 per `isFinalAttempt` logic in `run.ts`). Run 2 never reached the deadline (single small chunk, exit 0 directly). Backfill honoured the deadline in every case it was reached — it deferred a bounded remainder and logged it, rather than running unbounded (confirms WP-P9 MUST-FIX 3 is working as designed; no repeat of the 09-17 17-minute unbounded backfill).

**2. Why did two runs exceed 60 minutes while GitHub reports success? Is 60 min pipeline-internal, job timeout, or something else?**
`timeout_minutes: 60` (`pipeline.yml:139`) is the **nick-fields/retry action's per-attempt** timeout on the "Categorize and store (with retry)" step — not `jobs.<job>.timeout-minutes` (not set; defaults to GitHub's 360-min job cap) and not a workflow-level timeout. `RUN_DEADLINE_MS` (28 min, `resilience.ts:395`) is a separate, in-process deadline that the pipeline code itself enforces to exit(75) before the external 60-minute timeout would SIGTERM it. With `max_attempts: 2`, a run needing both attempts sums two independent ~28-40 min attempts plus a 60s `retry_wait_seconds` plus ~7-9 minutes of setup steps (checkout, `npm ci`, `apt-get install poppler-utils`, `pip install` OCR deps) — none of which count against the per-attempt `timeout_minutes`. That arithmetic accounts for the observed 1h19m and 1h38m totals. Per-phase durations: setup steps ~20-24s each run; classify+judge chunks (the dominant cost, see Failure #3) 390-620s each; write tail 588-983s (Failure #1); collection itself is not separately logged with a duration in the top-level summary line but retailer counts appear within ~1 min of container start each time.

**3. Did the spend guard, judge, and healthcheck behave? Warnings/errors?**
Spend guard: behaved correctly, monotonically decreasing, well under the $5/period cap, `spendUnguarded: false` and `spendNearCeiling: false` confirmed in the DB metrics row. Judge: functioned (all verdicts "defensible"), no daily-quota trips, but its per-minute rate-limit pacing is the dominant time cost on two of three runs (Failure #3). Healthcheck: pinged successfully on every exit (75 and 0) on all three runs — the dead-man's switch is fed. `MAX_CHUNK_MS` self-warning: did not fire on any of the 3 runs (all chunks ≤ 618.8s vs the 1,170s constant) — no evidence of chunk-duration regression in this sample, contrary to the concern raised after 09-17. `WRITE_TAIL_MS` self-warning: fired on every run that reached the write tail (Failure #1) — this is the constant that is now stale, not `MAX_CHUNK_MS`.

**4. Is the live site healthy and fresh?**
Yes. `https://basketch.vercel.app/` returns HTTP 200 (edge-cache HIT, `age: 251s`). `/de` returns an expected 307 locale redirect. Supabase `deals` table: 1,623 active rows (read via anon key, RLS-scoped), consistent with the 09-24 run's 1,562 newly-stored deals plus still-active older-cycle deals (aldi/lidl/spar publication weeks). `pipeline_runs` (service-role read) shows the latest row at `2026-09-24T11:23:21Z`, matching the last scheduled run exactly — no run is missing, no run is stuck. No Thursday/Monday run was due between 09-24 and today (09-25 is a Friday; next scheduled run is Monday 09-28 05:00 UTC), so today's absence of a new run is expected, not stale data.

---

## Unverified / out of scope
- `OPENROUTER_API_KEY` currency at openrouter.ai (session-summary §10 pending item 1) — not checked here, out of this investigation's scope.
- Frontend rendering/images — explicitly excluded per PM instruction (handled separately).
- Whether `WRITE_TAIL_MS`'s growth will actually break the `RUN_DEADLINE_MS` invariant on a future run — extrapolated from 3 data points and the constant's own comment, not measured beyond 1,562 deals.
