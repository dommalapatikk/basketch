# Tech Lead RCA — `MAX_CHUNK_MS` re-measurement after WP-P6

**Date:** 2026-09-25 · **Author:** Tech Lead agent · **Status:** Analysis only — nothing edited, triggered or pushed.
**Carried forward from:** `session-summary.md` §6 ("`MAX_CHUNK_MS` is stale … re-measure after the 2026-09-21 run") and §11.
**Evidence:** `gh run view <id> --log` for runs 35589218267 (09-21), 35711077054 (09-22), 35983172760 (09-24).
A log citation is written `R1:L678`, meaning run 35589218267 at log line 678. R2 is 35711077054 and R3 is 35983172760.

---

## TL;DR

1. **`MAX_CHUNK_MS` is now wrong in the safe direction.** It says 19.5 min. Since P6 landed, the slowest of 17 measured chunks took **10.3 min** (618.8 s, R3:L3584), and the median was 6.9 min.
2. **`WRITE_TAIL_MS` is now wrong in the dangerous direction.** It says 9.5 min, but the measured write tail was **16.4 min** (982.8 s, R3:L4922). It went over the constant on 4 of the 5 attempts, and it is growing.
3. **The two errors cancel out.** The config test still passes (19.5 + 9.5 = 29 against a real 10.3 + 16.4 = 26.7), but only by coincidence. The P3 docstring expects P6 to free up room so `RUN_DEADLINE_MS` can go up (`resilience.ts:287-291`). **Do not raise it.** The write tail has already used up that room.
4. **Root cause: `MAX_CHUNK_MS` is a hand-copied measurement of something the code already knows.** The judge phase is set almost exactly by the rate limits in `model-registry.ts`. P6 changed those limits and nothing linked the constant to them, so it went stale without anyone noticing. The fix is to **work the number out from the registry when the code is written**, not to re-measure it at runtime. The N4 ruling was right to reject runtime self-adjustment.
5. **Runs over 60 minutes are working as designed.** The 60-minute limit applies to each **attempt**, not to the whole run. Both long runs were attempt 1 (hit the deadline, exit 75), then a 60 s wait, then attempt 2. The longest single attempt was 49.6 min. The risk is the write tail's growth: the margin to the 60-minute kill is about 10 min and shrinking.

---

## 1. What `MAX_CHUNK_MS` is and how it interacts with the rest

| Item | Where | Value | Role |
|---|---|---|---|
| `MAX_CHUNK_MS` | `pipeline/transformation/domain/resilience.ts:308` | 19.5 min | **Not used to control anything at runtime.** It appears only (a) in the deadline inequality in `config.test.ts:218` and (b) in the observation warning `checkChunkDuration` (`resilience.ts:354-361`, called at `classify-deals.ts:669-670`). |
| `RUN_DEADLINE_MS` | `resilience.ts:395` | 28 min | Checked **before each chunk starts** (`classify-deals.ts:603-610`) and before each backfill batch (`:733-750`). It is measured from `startTime` (`run-pipeline.ts:812`, `:904`), which includes collection. |
| `WRITE_TAIL_MS` | `resilience.ts:334` | 9.5 min | The work after classification: taxonomy → resolve → storeDeals → enrichment → v3 cutover → sweep → logRun (`run-pipeline.ts:834-873`). Warned by `checkWriteTailDuration` (`resilience.ts:364-371`). |
| `SAFETY_MARGIN_MS` | `resilience.ts:337` | 2 min | Headroom. |
| `RUN_TIMEOUT_MS` | `resilience.ts:293` | 60 min | Must equal `timeout_minutes: 60` (`pipeline.yml:135`). This is checked by `config.test.ts:143-145`. |
| Retry shape | `pipeline.yml:138, 146-147, 151` | 2 attempts, retry only on exit 75, 60 s wait | Attempt 2 runs with `PIPELINE_FINAL_ATTEMPT=1`. |
| Job `timeout-minutes` | `pipeline.yml:34-37` | **not set** → GitHub default of 360 min | Does not limit the run in practice. |

**Why the constant matters.** The deadline check only happens between chunks, so a chunk that starts one second before the deadline still runs to the end. The worst-case overshoot past `RUN_DEADLINE_MS` is therefore one full chunk. After that comes the whole write tail. `MAX_CHUNK_MS` exists only to make this inequality honest:

```
RUN_DEADLINE_MS + MAX_CHUNK_MS + WRITE_TAIL_MS + SAFETY_MARGIN_MS ≤ timeout_minutes   (config.test.ts:218)
      28        +     19.5     +      9.5      +        2         = 59 ≤ 60
```

If the inequality is false in reality, the step's own timeout kills the process with SIGTERM. That run is **not retried**, because the exit code is never set and so never matches 75 (`resilience.ts:379-387`, which cites nick-fields `index.ts:96-98,147`). The kill would also land during the write tail, so revalidate and logRun would not run.

The backfill loop also overshoots by at most one batch. Backfill only starts after the classify loop has finished, so at most one of the two ever overshoots. The largest backfill batch observed took 172 s (R1:L2975→L2979), which is smaller than a chunk, so `MAX_CHUNK_MS` covers it.

---

## 2. Measured per-chunk durations (judge concurrency active)

17 chunks across 5 attempts. The per-chunk numbers `classify+judge`, `enrich` and `total` come straight from the logged line (`classify-deals.ts:658-664`). **The split between classify and judge is inferred:** the graph times them together (`classify-deals.ts:647-649`), so I split them at the last `classify: N tokens` line before the judge calls. Treat the classify column as approximate. One chunk (R3:L1052) comes out negative because a classify line was logged out of order.

| Run / attempt | Chunk | Log line | Judged | classify* | judge* | classify+judge | enrich | **total** |
|---|---|---|---|---|---|---|---|---|
| R1 a1 | 1/8 | R1:L678 | 100 | 15.5 | 304.4 | 319.9 | 85.2 | **406.0** |
| R1 a1 | 2/8 | R1:L1018 | 100 | 42.3 | 303.9 | 346.2 | 126.9 | **473.9** |
| R1 a1 | 3/8 | R1:L1357 | 100 | 12.7 | 304.3 | 317.0 | 93.8 | **411.4** |
| R1 a1 | 4/8 | R1:L1606 | 84 | 40.3 | 245.4 | 285.8 | 106.3 | **392.7** |
| R1 a2 | 1/4 | R1:L2401 | 68 | 11.2 | 185.6 | 196.8 | 66.4 | **264.0** |
| R1 a2 | 2/4 | R1:L2581 | 70 | 11.1 | 186.1 | 197.3 | 64.2 | **262.1** |
| R1 a2 | 3/4 | R1:L2784 | 75 | 10.9 | 241.9 | 252.9 | 82.5 | **336.3** |
| R1 a2 | 4/4 (72 products) | R1:L2967 | 71 | 50.5 | 187.2 | 237.7 | 68.8 | **307.3** |
| R2 a1 | 1/1 (87 products) | R2:L489 | 62 | 9.4 | 184.0 | 193.4 | 13.0 | **207.3** |
| R3 a1 | 1/9 | R3:L721 | 99 | 52.2 | 304.3 | 356.5 | 163.2 | **520.6** |
| R3 a1 | 2/9 | R3:L1052 | 99 | (−7.7) | 303.6 | 326.8 | 178.7 | **506.7** |
| R3 a1 | 3/9 | R3:L1391 | 100 | 40.8 | 304.1 | 344.9 | 126.1 | **472.1** |
| R3 a1 | 4/9 | R3:L1650 | 86 | 11.3 | 245.7 | 257.0 | 144.3 | **402.2** |
| R3 a2 | 1/5 | R3:L2907 | 100 | 11.0 | 305.0 | 316.1 | 124.1 | **441.0** |
| R3 a2 | 2/5 | R3:L3246 | 100 | 10.9 | 304.5 | 315.4 | 131.7 | **448.3** |
| R3 a2 | 3/5 | R3:L3584 | 100 | 63.7 | 305.1 | 368.8 | 248.9 | **618.8** |
| R3 a2 | 4/5 | R3:L3833 | 84 | 71.4 | 244.9 | 316.2 | 124.0 | **441.0** |

**Distribution** (seconds; 17 chunks, of which 15 are full 100-product chunks):

| Phase | min | median | p90 | max | sd |
|---|---|---|---|---|---|
| classify+judge (graph) | 193.4 | 316.1 | 346.2 | **368.8** | 56 |
| enrich | 13.0 | 124.0 | 163.2 | **248.9** | 52 |
| **total, all 17** | 207.3 | **411.4** | 506.7 | **618.8** | 102 |
| total, full chunks only (15) | 262.1 | 441.0 | 520.6 | 618.8 | 90 |

Before P6, chunk totals were 1042.9 to 1295.8 s (`resilience.ts:299-300`; `session-summary.md` §6). **P6 cut the median chunk by about 2.6×.**

### The judge phase is almost perfectly predictable

Judge time depends only on how many products were judged:

| Judged | Measured judge phase | `(⌈n/18⌉ − 1) × 60 s` |
|---|---|---|
| 100, 99 | 303.6–305.1 s (9 chunks) | 300 s |
| 84, 86, 75 | 241.9–245.7 s | 240 s |
| 62, 68, 70, 71 | 184.0–187.2 s | 180 s |

The reason is that the gate uses a **fixed one-minute window** capped at `floor(0.9 × requestsPerMinute)`, which is `floor(0.9 × 20) = 18` for gpt-5-nano (`resilience.ts:211-229`, `model-registry.ts:142`). Every chunk opens with a burst of "per-minute cap reached, waiting 60s" lines (R3:L2573-2600). There are 3,037 such lines across the three runs. `maxInFlight: 4` (`model-registry.ts:161`) is not the constraint. **The rate is.** The registry comment already predicted this at `:148-160`, although it estimated 333 s against the 300 s measured.

Nearly all of the variance is in the Gemini-paced parts:

- **Classify:** 9 to 71 s. It goes up when the previous chunk's enrichment has already used up the Gemini minute.
- **Enrich:** 64 to 249 s, plus 13 s on a small chunk. The 248.9 s case includes a transient retry (R3:L3250).

Both share Gemini's gate: 15 rpm, ceiling 13 (`model-registry.ts:94-96`).

---

## 3. Is the constant wrong, and what should replace it?

**The value is wrong.** 19.5 min is 1.9× the observed maximum and 2.8× the median. The warning (`classify-deals.ts:669-670`) can no longer fire, so it catches nothing: no `MAX_CHUNK_MS` warning appears in any of the three runs.

**The design is the root cause, not the number.** Walking back through the "why" chain:

1. Why is it stale? P6 changed how fast the judge runs.
2. Why didn't changing the rate update the constant? `MAX_CHUNK_MS` is a literal copied from one run's log (`resilience.ts:299-300`: "the MAX of four chunks … on run 34833209176"), with no link to the inputs that decide it.
3. Why is that a design flaw? Those inputs are compile-time constants the codebase already owns: `CHUNK_SIZE` (`classify-deals.ts:183`), judge rpm and Gemini rpm (`model-registry.ts`), the 0.9 pacing factor (`resilience.ts:220`), and the maximum `Retry-After` honoured (`PROVIDER_WAIT_CEILING_MS` = 90 s, `resilience.ts:107`). Section 2 shows the judge phase is a closed-form function of them.
4. So any future edit will cause the same drift silently: a different judge model, rpm, chunk size, or the J3 daily cron changing batch sizes. **This is a system defect, not an instance** (Larson). The same constant has now drifted twice: first too low (1295.8 s against 1170 s, `session-summary.md` §6), then too high.

**Option comparison (a reversible decision; the recommendation is below):**

| Option | Verdict |
|---|---|
| A. Put in a new measured literal (for example 11 min) | Rejected on its own. It fixes this instance, and the next registry edit makes it stale again. |
| B. Adjust it at runtime from the last run's measured chunk time | **Rejected.** This is the N4 ruling (`resilience.ts:338-349`), and it was right. A regression would silently raise the bound instead of failing, and the safety inequality would become unfalsifiable in CI. |
| **C. Work it out once, as a pure function of the registry, CHUNK_SIZE and the retry policy, with a measured residual for the latency-bound parts** | **Recommended.** It is static and testable. It changes automatically when a rate changes, and the config test goes red when that change would break the 60-minute budget. The warning remains as the check that the formula still matches reality. |

**What the evidence supports for option C:**

```
judgePhaseBound   = (ceil(CHUNK_SIZE / floor(0.9 × judgeRpm)) − 1) × 60 s + judge latency tail
                  = (ceil(100/18) − 1) × 60 + ~10       ≈ 310 s    (measured max 305.1)
geminiPhaseBound  = measured residual: max(classify + enrich) observed = 71.4 + 248.9 ≈ 320 s
retryAllowance    = one maximum Retry-After wait (`PROVIDER_WAIT_CEILING_MS` = 90 s, `resilience.ts:107`)
MAX_CHUNK_MS      ≈ 310 + 320 + 90 = 720 s ≈ 12 min
```

That gives about 16% headroom over the observed maximum (618.8 s) and more than two standard deviations above the observed mean (406.6 + 2×102 = 611). The margin comes from a named source (one maximum `Retry-After`), not a percentage guessed after the fact. A **percentile is the wrong statistic here.** A breach means a kill that is not retried, so the bound has to be a maximum, not a p90.

**Re-derive the whole inequality at the same time. Do not update only one term.**

```
Current constants:   28 + 19.5 + 9.5  + 2 = 59   ✅ passes (by cancelling errors)
Measured reality:    28 + 10.3 + 16.4 + 2 = 56.7 (worst observed attempt was 49.6 min)
Corrected constants: 28 + 12   + 18   + 2 = 60   ✅ passes with zero slack
```

`WRITE_TAIL_MS` must go up to about 18 min: 16.4 min observed plus room for one more week's growth. Once it does, **there is no room left to raise `RUN_DEADLINE_MS`.** The expected P6 dividend has already been used by the write tail.

---

## 4. Why two runs went over 60 minutes and still succeeded

**This matches the design. It is not a defect.** The 60-minute limit is `timeout_minutes` on the nick-fields step, and it applies **per attempt** (`pipeline.yml:135`). `max_attempts: 2` (`:138`) with a 60 s wait (`:151`) means a run can last up to about 121 min. The job has no `timeout-minutes`, so GitHub's 360-minute default applies (`pipeline.yml:34-37`). The phrase "60-minute wall" in the notes is accurate for an attempt, not for a run.

| Attempt | Start → end (process) | Duration | Deadline overshoot (the unit running when the deadline passed) | Write tail | Exit |
|---|---|---|---|---|---|
| R1 a1 | 10:32:17 → 11:10:32 (R1:L305, L2190) | 38.3 min | 76 s (chunk 4, R1:L1606) | 537.8 s (R1:L2188) | 75 → retried (R1:L2192) |
| R1 a2 | 11:11:36 → 11:50:48 (R1:L3793) | 39.2 min | 83 s (backfill batch, R1:L2979-2980) | 588.0 s ⚠ (R1:L3774-3775) | 0, "Command completed after 2 attempt(s)" (R1:L3795) |
| R2 a1 | 09:34:51 → 09:53:35 (R2:L1331) | 18.7 min | — (not reached) | 770.4 s ⚠ (R2:L1322-1323) | 0 (R2:L1333) |
| R3 a1 | 09:45:59 → 10:32:45 (R3:L355, L2529) | 46.8 min | 262 s (chunk 4, R3:L1650-1651) | 861.8 s ⚠ (R3:L2526-2527) | 75 → retried (R3:L2531) |
| R3 a2 | 10:33:48 → 11:23:21 (R3:L4935) | **49.6 min** | 309 s (chunk 4, R3:L3833-3834) | **982.8 s** ⚠ (R3:L4922-4923) | 0 (R3:L4937) |

`startTime` for the a2 attempts and R2 is calculated as the time of "Pipeline complete" minus the logged `ms`. That lands consistently about 2.5 s after the `##[group]Attempt` line, and the same offset was used for the a1 attempts.

R1 and R3 were partial cold starts: cache 624/1413 (R1:L339) and 758/1626 (R3:L389). That is exactly the case T1 exists for. Attempt 1 persisted and exited 75, and attempt 2 resumed from the cache and published. R3 published 1,562 deals but still held back 47 products (R3:L3834) and left 28 owing attributes (R3:L3835). That is correct final-attempt behaviour (`run-deferred`, exit 0, R3:L4925).

**The risks, highest first:**

1. **The write tail is the term that is growing, and it is unbounded.** It went 537.8 → 588.0 → 770.4 → 861.8 → 982.8 s over five attempts in four days. Per deal it went from 0.52 to 0.74 s, so it is growing faster than the deal count alone would explain. It breaks down as:
   - **v3 cutover:** 346 → 667 s (R1:L2172→L2173; R3:L4909→L4910). This is a serial per-deal `await ensureConcept` / `await ensureSku` loop (`v3-cutover.ts:260-289`), an N+1 query pattern.
   - **Enrichment write:** 181 → 299 s (R3:L4903→L4908), also per row (`storage/infrastructure/write-enrichment.ts:73-94`).

   An attempt gets killed when 28 + overshoot (up to about 10.3) + write tail > 60, so **when the write tail passes about 21.7 min**. At the latest 0.62 s/deal, that happens at about 2,100 deals. The 2026-09-17 run collected **2,060 offers** (`session-summary.md` §6), so a large week is already close to the edge.
2. **The warnings are not acted on.** `WRITE_TAIL_MS` warned on 4 of 5 attempts, and every run was still marked green. The N4 assumption that a log warning is enough (`resilience.ts:338-349`) turned out to be wrong in practice. The warning is a plain `console.warn` (`run-pipeline.ts:873`), not a `##[warning]` annotation, unlike `run-slow` (R3:L4934).
3. **The config test is green for the wrong reason** (§3). One wrong term hides the other.
4. **`run-slow` measures only one attempt.** It reported "39 minutes" and "50 minutes" (R1:L3786, R3:L4930). Nothing reports the total run time (79 and 98 minutes) or the fact that each attempt collects every retailer again (R1:L2207, R3:L2546). That is a one-fetch cost, deferred to J3 by the plan (`2026-09-15-final-plan.md:668-669`).
5. **A separate finding, not investigated here:** "Created N new coop products" appears on **every attempt**: 528 then 720 in the same run on the same 848 Coop deals (R1:L2164, L3753), then 758, 752 and 916 (R2:L1300; R3:L2500, L4899). If product resolution is creating duplicate rows, that could explain part of the growth in the v3 and enrichment tails. This needs its own RCA before anyone assumes a cause.

---

## 5. Recommended fix (DDD + TDD)

**Classification:** reversible. It touches only constants and pure functions. It does not change runtime behaviour, because `RUN_DEADLINE_MS` and `timeout_minutes` stay the same. No database or workflow change is needed.

### Domain

- Move `CHUNK_SIZE` from `application/classify-deals.ts:183` into `transformation/domain/` (next to `resilience.ts`), so domain code can use it without importing from the application layer.
- Add a pure function to `resilience.ts`: `judgePhaseBoundMs(chunkSize, spec)`, which returns `(ceil(chunkSize / floor(0.9·rpm)) − 1) × 60_000 + JUDGE_LATENCY_TAIL_MS`. It should reuse the same `0.9` that `checkRate` uses, pulled out as one named constant so the two cannot drift apart.
- Define `MAX_CHUNK_MS = judgePhaseBoundMs(CHUNK_SIZE, JUDGE_CHAIN[0]) + GEMINI_PHASE_RESIDUAL_MS + PROVIDER_WAIT_CEILING_MS`. The residual (about 320 s) is the only hand-measured term, and it is documented against R3:L3584.
- Change `WRITE_TAIL_MS` to 18 min, citing R3:L4922.
- Update the run references in the warning text (`resilience.ts:358`, `:369`) to the new source runs.

### Tests that go red first, in this order

1. `resilience.test.ts`: **`judge phase is set by the rate limit, not maxInFlight — 100 judged took 305 s, 84 took 245 s, 68 took 186 s (runs 35589218267, 35983172760)`**. This asserts `judgePhaseBoundMs(100/84/68, gpt-5-nano)` ≈ 300/240/180 s plus the tail. It is red because the function does not exist yet.
2. `config.test.ts`: **`MAX_CHUNK_MS is derived from the registry — P6 changed the judge's rate and a copied 19.5-min literal went stale while chunks fell to ≤10.3 min`**. This asserts `MAX_CHUNK_MS === judgePhaseBoundMs(CHUNK_SIZE, JUDGE_CHAIN[0]) + …`. It is red against the literal.
3. `config.test.ts`: **`WRITE_TAIL_MS covers the measured write tail — 982.8 s on run 35983172760 against a 570 s constant`**. It is red at 9.5 min.
4. The existing inequality (`config.test.ts:218`) stays as it is and must stay green with the new terms: 28 + 12 + 18 + 2 = 60.

**Mutation checks:**
- Setting the judge `requestsPerMinute` to 10 should turn the inequality red. This is the systems-level win: a registry edit that breaks the time budget fails in CI instead of in production.
- Putting a literal back in place of the derived `MAX_CHUNK_MS` should turn test 2 red.

### Blast radius

- `resilience.ts`, `classify-deals.ts` (the import of `CHUNK_SIZE` only), and three test files.
- **`alerts.ts:153`** sets `RUN_SLOW_THRESHOLD_MS = RUN_DEADLINE_MS + WRITE_TAIL_MS`, so this change moves it from 37.5 to 46 min. That breaks `alerts.test.ts:291` (`< 40 min`), which has to be updated on purpose. This is also correct in itself: `run-slow` currently fires on runs that are within budget.
- The comments in `pipeline.yml` at `:113-135` cite 19.5 min and need updating. The value itself (`:135`) does not change.
- No database migration, no workflow behaviour change, no change to spend.

### What this does **not** fix (next, in priority order)

1. **The write tail's growth is what actually limits the budget.** Batch the per-deal round trips in `v3-cutover.ts:260-289` and `write-enrichment.ts:73-94`. Name the regression test after R3's 667 s v3 cutover. This is where the budget can be won back, and **only after it lands** should `RUN_DEADLINE_MS` be re-derived upward.
2. **Investigate the "Created N new coop products on every attempt" finding** (§4, risk 5) before item 1, because duplicate products would inflate the v3 input.
3. **Make the two drift warnings visible:** emit them as `##[warning]` annotations and include them in the alert snapshot (a P7 extension). A warning that fired 4 times in 4 days and changed nothing is only a comment.
