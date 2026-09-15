# Tech Lead review of the Architect RCA (items 1, 2, 5), and the merged build plan

**Author:** Tech Lead agent · **Date:** 2026-09-15 · **Reviews:** `docs/rca/2026-09-15-architect-items-1-2-5.md`
**Companion:** `docs/rca/2026-09-15-tech-lead-items-6-9.md`. No code, workflow or config was changed.

**PM decision labels.** Both reports used P-numbers, and they collided. From here on:
- **AP-n** means the architect's P-n.
- **TP-n** means mine (renamed in my own report: TP-6, TP-7a, TP-7b, TP-8, TP-9).
- **AP-8 (the monthly ceiling) is set by the PM: USD 5 per month.**

## 0. Summary

| Area | Verdict | Decision |
|---|---|---|
| Item 1 diagnosis | **CONFIRMED, and larger than inferred.** 25 full seven-retailer collections in 4 days, not "about 10". | |
| Collection ledger (`collection_edition` with `offers jsonb`, `CollectedEditions`, `decideFetch`) | **WEAKENED.** The policy is right. Storing the offers in the database and rebuilding them from there is the over-built part. | Keep `COLLECTION_CADENCE`, `decideFetch`, the `IsoWeek` value object and a **slim fetch log** (no offers). Move offers **within a run by artifact** (collect job → transform job). Re-use across runs is **explicit** (`reuse_run_id`). |
| Item 2 diagnosis | **CONFIRMED.** Production printed `✅ no alerts` on a run that stored 400 deals and on both attempt-1 timeouts. | `Measured<T>` + `instrument-missing` and `buildRunSnapshot`: **right size, adopt.** `runPipeline(deps)`: **adopt, reshaped** into `runCollect` / `runTransform` to fit the job split. |
| Item 5 diagnosis | **CONFIRMED**, with one factual premise **not established**: OpenRouter documents that reasoning tokens do *not* count toward `max_tokens`. | `SpendAccount` via `GET /api/v1/key`: **adopt** (fields verified). `SpendBudget` arithmetic: **adopt, simplified**. `Reservation` branded per-call type: **replace** with a paid gate that is a *required constructor dependency*. `ModelSpec.billing` invariant: **downgrade to a registry data test.** |
| Item 5, inventory row 8 (Actions minutes) | **REJECTED.** The repo is public (`dommalapatikk/basketch PUBLIC`), and standard runners are free. | |
| **T1** exit codes | **Adopt 75 = retryable, 1 = not.** **Verified in the action's source: with `retry_on_exit_code: 75`, a timeout is NOT retried.** | That makes the change unsafe on its own, because today's green runs *depend* on the timeout retry. It must ship with an **in-process deadline** and **after** the judge throughput fix. |
| **T2** run metrics | | **`pipeline_runs.metrics jsonb`.** The per-store `pipeline_run` columns stay untouched and are marked deprecated in the ADR. |
| Ordering | "Exit codes first" (architect) vs "judge throughput first" (mine) | **Both constraints hold, and they are compatible:** composition root → throughput → exit contract → everything else → alerts enforcing last. See §6. |

---

## 1. Verifying the architect's INFERRED claims (I have shell and logs; the architect did not)

**The `COLLECTION_MODE` variable:** `live`, set `2026-09-11T14:10:33Z`. So scheduled runs **are** live.

**Every pipeline run since 2026-09-08** (`gh run list` plus a grep of each run's log):

| run | event | mode | live collections | transform attempts | legacy aktionis slug jobs | fatal |
|---|---|---|---|---|---|---|
| 34208976318 | schedule | legacy | 0 | 1 | 3 | |
| 34460634052 | schedule | legacy | 0 | 1 | 7 | |
| 34608576963 | dispatch, **re-run (run_attempt=2)** | LIVE | 2 | 2 | 8 | `Timeout of 900000ms` |
| 34618604577 | dispatch | LIVE | **3** | 3 | 8 | 3× `Timeout of 900000ms` |
| 34632020480 | dispatch (cancelled) | LIVE | 1 | 2 | 8 | `Timeout of 2700000ms` |
| 34636908819 | dispatch (cancelled) | LIVE | 1 | 1 | 8 | |
| 34642001127 | dispatch (cancelled) | LIVE | 2 | 2 | 8 | |
| 34647259242 … 34683185223 (6 runs) | dispatch | LIVE | 1 each | 1 each | 8 each | |
| 34703713179 | dispatch | LIVE | 2 | 2 | 8 | 2× `Timeout of 2700000ms` |
| 34715758294, 34717803608 | dispatch | LIVE | 2 each | 2 each | 8 each | |
| 34718508157 | dispatch | LIVE | 2 | 2 | 8 | `Timeout of 2700000ms` |
| 34833209176 | schedule | LIVE | 2 | 2 | 4 | `Timeout of 2700000ms` |

- **25 full live collections of all seven retailers between 2026-09-11 14:10 and 2026-09-14**, where the rule
  allows 1 a week.
  - By path: **15 dispatch** first attempts, **9 transform retries**, **1 schedule**.
- On top of that, **124 legacy aktionis slug jobs** (8 per dispatch, 4 on Monday). Coop is fetched twice in
  each of those runs, as the architect found.
- Path (d), a manual re-run, was **observed**, not only structural: 34608576963 has `run_attempt=2`.
- The "about 10" estimate (AP report §1.1 row c) **undercounted by 2.5×**.

**Scheduled runs are not punctual.** Monday's 05:00 UTC cron started at 10:26 UTC. At 09:19 UTC on Tuesday,
the Tuesday 05:00 cron had not started. **Cadence must key on the run's actual date, never on the cron
slot.**

**Alert output in production:** `✅ no alerts` in 34718508157, 34833209176 and 34652857097. The last
one **stored 400 deals** (`Pipeline complete in 614861ms — stored 400 deals`), against about 1,500 normally.

---

## 2. Finding-by-finding verdicts

### Item 1

| Finding | Verdict | Evidence |
|---|---|---|
| (a) The transform retry re-fetches | **CONFIRMED** | 9 of 25 collections are attempt 2 or 3. Both "green" runs' attempt 1 died at `Timeout of 2700000ms hit`. |
| (b) Cron stagger fetches all seven, 3× a week | **CONFIRMED** (mode verified) | `pipeline.yml:131-135` has no day gate. The Monday schedule run collected all seven, twice. |
| (b) sub-claim: "Thursday retailers (Migros, **Lidl**) are asked for an unpublished flyer on Monday" | **WEAKENED** | Monday log: `ok lidl 106 offers`. Only Migros failed: `FAIL migros … HTTP 404`. The Lidl KW flyer is live about a week ahead (research doc, "KW37 ✓ KW38 404 (~1 week lookahead)"). |
| (c) Dispatch | **CONFIRMED, and the largest real path** | 15 of 25 |
| (d) Re-run | **CONFIRMED (observed)** | `run_attempt=2` on 34608576963 |
| (e) Legacy matrix, Coop fetched twice | **CONFIRMED** | 8 slug jobs per dispatch, including `coop` and `coop-megastore` |
| (f) Lidl flyer JSON fetched twice | **CONFIRMED** | `live-sources.ts:193` and `:195` |
| (g) Local runs unguarded | **CONFIRMED** | `run.ts:181` |
| All seven adapters ignore `fetchOffers(_week)` | **CONFIRMED** | 7 grep hits |
| `retry_wait_seconds: 300` is wasteful | **CONFIRMED** | Per-minute quota only. `retryDelay` observed as 56–57 s. |
| Root cause: no enforcement point that every fetch passes through | **CONFIRMED** | |
| Tests encode the defect (`live-sources.test.ts:55-60`, `.some()` at `:89-93`) | **CONFIRMED** | I found the same pattern on the Migros week test (my report §7.3) |

### Item 2

| Finding | Verdict | Evidence |
|---|---|---|
| 8 of 9 rules can never fire; only `uncertainty-spike` is live | **CONFIRMED** | `alerts.ts:153` (`previous !== null` gate), `:163` (`45 * 60_000`, equal to the step kill), snapshot literals `run.ts:571-586` |
| `shouldFailRun` is correct as a unit and unreachable in production | **CONFIRMED** | `run.ts:593-595` |
| The reachable exits retry and so re-fetch | **CONFIRMED.** Line numbers are `run.ts:245, 605, 646` (the AP report says 645) | `grep process.exit` |
| The root cause is `previous = null` forever, plus "measured 0" being indistinguishable from "not measured" | **CONFIRMED** | Also true of my items: `backfilled 0/100` and `tokensUsed: 0` are the same shape |
| The `pipeline_run` per-store columns are never written | **CONFIRMED** | No writer references `pipeline_run`. `store.ts` writes `pipeline_runs`. |
| `pipeline_runs_public` would leak a new column | **REJECTED as a risk** | The view lists its columns explicitly (`20260416_secure_favorites_rls.sql:209-211`), so `metrics` is excluded by construction. Keep the architect's instruction anyway; it costs nothing. |
| `macroF1` from live Denner offers | **WEAKENED** | Denner publishes about 9 coarse categories. Scoring against them measures **top-level agreement**, not macro-F1 over our 76 sub-categories. Name the metric honestly (`dennerTopLevelAgreement`). AP-6 still stands. |

### Item 5

| Finding | Verdict | Evidence |
|---|---|---|
| `CLAUDE.md:162` and four other places are stale | **CONFIRMED** | The judge is wired (`run.ts:364-370`). `pipeline.yml:194-195` says "Not yet wired". |
| No `max_tokens` on the paid call; tokens recorded as 0 on error | **CONFIRMED** | `gemini-judge.ts:56`, `:87-89` |
| The budget lasts one attempt, is not injectable, and has no money producer | **CONFIRMED** | `classify-deals.ts:24, 283, 383`, `guardrails.ts:151` |
| **"With reasoning models the cap includes reasoning tokens"** (AP §5.4 infrastructure) | **NOT ESTABLISHED** | OpenRouter's reasoning docs: *"Reasoning tokens are counted as output tokens and billed accordingly. They do not count toward `max_tokens` for the final response."* For OpenAI-native `max_completion_tokens` the opposite holds. **So whether `max_tokens` bounds a gpt-5-nano call via OpenRouter is unknown.** The "worst case $0.051 per call" and a `SpendBudget` derived from it therefore rest on an assumption. One experiment settles it: one call with `max_tokens: 50`, then read `usage.completion_tokens_details.reasoning_tokens`. It costs a fraction of a cent. The effort control that *is* documented is `reasoning.effort` (`minimal` … `high`, supported for the GPT-5 series). |
| `GET /api/v1/key` returns `limit`, `limit_remaining`, `usage_monthly` | **CONFIRMED** (OpenRouter docs) | Also `limit_reset`, `usage_daily`, `usage_weekly`, `is_free_tier`, and the `byok_*` fields. `limit_remaining` is null when no limit is set. Exhaustion returns **402**. |
| Per-call cost must be computed from a price table | **WEAKENED** | OpenRouter now returns `usage.cost` (in credits, i.e. USD) **on every response, by default**. **Settle from the provider's reported cost.** A price is needed only to *estimate before* the call. |
| Actions-minutes risk (inventory row 8) | **REJECTED** | The repo is public |
| A retry resets the spend budget | **CONFIRMED** | Also true of the Gemini rate state (my item 6) |
| Gemini "free" is an assumption | **CONFIRMED** | AP-9: confirm no billing account on the Google project |

---

## 3. Design challenges and decisions

### 3.1 The collection ledger: smallest correct design?

**What the architect got right, which I adopt:** the rule must be enforced in code that every fetch passes
through, not in YAML. Cadence is domain knowledge. `decideFetch` is a pure policy. An unreadable ledger
fails **closed**. A refusal (401/403) is final. `IsoWeek` becomes a value object.

**What is over-built:** `offers jsonb` in Supabase, `recordCollected(edition, offers)`, and rebuilding every
offer from the database on "reuse". That machinery exists only to let a *different* run re-use offers
automatically. Within one run, a GitHub artifact already carries them between jobs. Across runs, the only
legitimate reason to reprocess an already-fetched retailer is debugging the transform. That should be an
explicit, audited act, not an automatic one.

**Decision (Tech Lead):** domain policy + slim fetch log + job split.

| Element | Keep / change |
|---|---|
| `IsoWeek` value object, `COLLECTION_CADENCE`, `editionsDue(asOf)`, `decideFetch(edition, record) → fetch \| skip \| refuse` | **Keep** (architect). `reuse` becomes **`skip`**: the retailer's deals from that week are already live; nothing is re-fetched or reprocessed. |
| `collection_edition(retailer, fetch_week, cycle, status, attempts, last_failure, last_run_id, collected_at)` | **Keep, without the `offers jsonb` column.** It is a fetch log, a fact about our load on the source, which is exactly the legal unit. Written **per retailer, as each source finishes** (HANDOVER §4 #1). |
| `CollectedEditions` port, with an in-memory adapter that honours the primary key and a shared contract test | **Keep**, minus `recordCollected(…, offers)`. It becomes `recordFetched(edition, status, count, runId)`. |
| Offers crossing from collect to transform | **Artifact**: a collect job writes serialised `Offer[]`; the transform job reads it and **rebuilds each offer through `createOffer`** (architect's rule, kept). Retention 7 days. |
| Re-processing an old collection | Dispatch input `reuse_run_id` makes the transform download that run's artifact (`actions/download-artifact@v4` `run-id` + `github-token`). |
| Forced re-fetch | Dispatch input `force_refetch` + reason, recorded in the log (**AP-4**) |
| Port signature | `fetchOffers(asOf: CalendarDate)`. Each adapter derives **its own publication key**: Migros is "the Thursday on or before `asOf`", which is my item 7(a). The fetch log keys on `IsoWeek(asOf)`. That removes the decorative week argument **and** puts publication calendars in the ACLs, where retailer knowledge belongs. |

**How each path closes:**
- **(a) retry:** the transform job never builds a source.
- **(b) cron stagger:** `editionsDue`.
- **(c) dispatch:** `skip`, unless `force_refetch`.
- **(d) re-run all jobs:** the collect job reads the log and skips. *Re-run failed jobs* re-runs only the
  transform, which reads the artifact. **Verify in WP-9 that a re-run attempt can download the original
  attempt's artifact.**
- **(e) legacy matrix:** retire it (**AP-3**).
- **(f) Lidl:** fetch once (code fix).
- **(g) laptop:** reads the same log. An unreadable or missing log fails closed.

**Why this is smaller:** no `offers` payload, no database rehydrate path, no "stored edition with zero
offers" failure mode, and no invariant drift on reload from Supabase. The artifact path still rehydrates
through `createOffer`, but only within a run, where invariants cannot have changed.

**What it gives up:** automatic cross-run re-use. That was a debugging convenience, and `reuse_run_id`
covers it explicitly.

**Partial runs are safe today:** `storesSafeToSweep` sweeps only `collectionSucceeded` stores
(`stale-sweep.ts:66-75`). A Monday run that collects only ALDI and Volg cannot deactivate Coop. Keep a
composition-root test for this (WP-9).

### 3.2 `Measured<T>` / `instrument-missing`, and `runPipeline(deps)`

- **`Measured<T>`: adopt as specified, scoped to `RunSnapshot` fields only.** Do not thread it through
  `classifyDeals` stats. Stats stay plain numbers; `buildRunSnapshot` is where "not produced" becomes
  `not-measured`. One union type and one invariant in `evaluateAlerts` close the class for items 2, 6 and 9
  at once: `backfilled 0/100` and `tokensUsed: 0` would both have surfaced.
- **`buildRunSnapshot`, `RunHistory`, report-only first cycle, the step-summary annotations: adopt.**
- **`runPipeline(deps)`: adopt, reshaped.** Because of §3.1's job split, the seam is:
  - `runCollect(deps)` (collect job)
  - `runTransform(deps, offers)` (transform job)
  - `runPipeline` = both (local runs)
  - `createProductionDeps(env)` = the single composition function. It replaces my proposed
    `createTransformDeps` and the architect's inline wiring. **One extraction, built once (WP-1).**

### 3.3 Item 5 at USD 5 a month

**Budget arithmetic.** These are estimates. The input that decides them, actual $/call, is measurable once
the OpenRouter activity page is read (WP-0).
- The architect's realistic cost: $0.0002–0.0006 per judge call. At about 10.3 s per call (my item 9),
  real reasoning is probably 1–2k tokens, so **about $0.0005–0.0009 per call**.
- Steady state is about 2,000–3,000 judge calls a month (weekly misses about 400–600, plus recurring
  uncertain outcomes, which WP-3 removes). That is **about $1–2.7 a month**, inside USD 5.
- **The debugging binge of 2026-09-11 to 14** (16 live runs, about 300 judge calls each) is **about 4,800
  calls in 4 days, about $2.4–4.3**. **One such week can spend most of the month.** The provider cap is
  therefore not optional.

**Decisions (Tech Lead):**
1. **Hard wall: the provider key limit** (AP-9: USD 5, `limit_reset: monthly`, auto top-up off). The only
   guard that survives our own bugs. **WP-0, before any code.**
2. **Run guard (application):** at start, read `limit_remaining`. The run's allowance is
   `min(limit_remaining − floor reserve, monthly ceiling ÷ expected runs this month)`.
   - **Settle each call from `usage.cost`.**
   - A call with no reported cost (error, timeout) settles at a **measured p99 cost × 2**, never 0
     (architect's invariant, kept). The p99 comes from WP-0's activity data. Until measured, use a
     conservative constant (for example $0.005).
   - When the allowance is spent, the judge path returns "not judged" (`judgeSkippedForBudget`), counted and
     alerted.
   - `limit_remaining: null` or unreadable → **no judge** (AP-10 pending; architect recommends this; I agree
     technically).
3. **No per-call `Reservation` brand.** The paid gate (§4, F1) is a **required constructor argument** of
   every paid adapter (`createOpenRouterJudge({ …, gate })`). Wiring without it does not compile. The gate
   authorises before each call and settles after. **The graph and the `Judge` port stay unchanged**: one code
   path for free and paid judges (fewer special cases). The architect's goal ("a paid call without a budget
   check does not compile") is met at construction instead of at every call.
4. **`ModelSpec.billing` as a registry data test:** "every OpenRouter model not ending in `:free` in any
   chain has `price` and `maxOutputTokens`." No smart constructor needed.
5. **`max_tokens` + `reasoning.effort`:** send both, but only after **AP-11** (re-benchmark on the
   291-row set). Measure first whether `max_tokens` bounds reasoning via OpenRouter (§2 item 5).
   **`reasoning.effort: "low"` or `"minimal"` is also the cheapest judge-throughput lever** (10 s → a few
   seconds per call). It may make concurrency unnecessary, so benchmark it inside AP-11.
6. **Keep `UsdMicros`.** Integer money matches `Money` in rappen, and floats never carry money.
7. The `CLAUDE.md:162` replacement text: **adopt**, with `<CEILING>` = USD 5. It lands **in the same change
   as the guard** (architect's rule: prose describes enforced code).

---

## 4. One shared foundation (so builders build it once)

| Id | Foundation | Serves | Replaces / merges |
|---|---|---|---|
| **F0** | `createProductionDeps(env)` + `runCollect` / `runTransform` / `runPipeline`; `run.ts` (and a new `collect.ts`) as thin shells returning `{ exitCode }` | Items 1, 2, 5, 6, 9 | AP `runPipeline(deps)` + my `createTransformDeps` |
| **F1** | **`ProviderGate`**, one instance per quota (Gemini: one per model; OpenRouter: one per key). It holds rate state (per minute and per day), a retry policy that **obeys `retryAfter` up to a separate 90 s ceiling**, a circuit breaker (opens at once on 401/402/daily cap, otherwise after 5 consecutive failures), a **max in-flight** limit, and for paid providers the spend ledger. Decisions stay pure in `resilience.ts` and a new `spend.ts`. The stateful wrapper is an infrastructure decorator, extracted from `resilient-classifier.ts` (Rule of Three: classifier, reflector, enricher, judge). **A required constructor argument** of every model adapter. | Item 6 (quota scope), item 9 (judge concurrency), item 5 (circuit, spend) | AP "wrap the judge in the circuit breaker" + "pace the reflector and enricher" + `Reservation`; my "shared quota gate" |
| **F2** | **Run journal:** `pipeline_runs.metrics jsonb` + `RunHistory` port (T2). **Fetch log:** slim `collection_edition` + `CollectedEditions` port (§3.1). Two grains, two homes. | Items 1, 2, 5 (per-run spend, informational), 6, 9 (metrics) | AP ledger (slimmed) + AP `RunHistory` + my "stats into alerts" |
| **F3** | **Exit contract and deadline** (T1) | Items 1, 2, 9 | AP exit-code split + my timeout finding |
| **F4** | **Visibility:** `$GITHUB_STEP_SUMMARY` + `::warning::`/`::error::` annotations, `createJsonTelemetry` wired into `collectOffers`, one-line-per-phase summaries instead of 2 KB 429 bodies | Items 2, 6, 7 | AP visibility channel + my "never-wired telemetry" |

---

## 5. The two Tech Lead decisions

### T1: exit codes, 75 = retryable, 1 = not

**Verified in the action's source**, `nick-fields/retry` at the pinned SHA `ce71cc2…` (`src/index.ts`,
`src/inputs.ts`):
- On a timeout the child is killed. The `exit` handler returns early on `SIGTERM` (`index.ts:96-98`), so
  **`exit` stays 0** (`:74`). The action throws `Timeout of …ms hit` (`:116-120`).
- In the catch, `inputs.retry_on_exit_code && inputs.retry_on_exit_code !== exit` (`:147`) is
  `75 !== 0` → **rethrow → no retry.**
- `retry_on_exit_code` is parsed as an integer (`inputs.ts:77`). `retry_on` defaults to `any` (`:72`).

**So with `retry_on_exit_code: 75`, only an explicit `exit 75` is retried: not a timeout, not a crash
(1).** Today both "green" runs succeeded *only because* the attempt-1 timeout was retried and attempt 2
resumed from the cache. **Shipping the exit-code change alone would turn those runs red.**

**Decision:**

| Code | Meaning | Examples |
|---|---|---|
| 0 | Success, **including deferred work** | Deadline reached → stop starting new chunks, publish everything classified or cached, defer the remainder (`heldBack` + a `run-deferred` warning). This is planRun's existing deferral concept. |
| **75** | **Transient infrastructure failure where a retry within minutes can succeed** | Supabase unreachable. The classification cache unreadable (`classify-deals.ts:259`). Collection artifact download failed. |
| 1 | Deterministic failure or critical alert. **Never retried.** | No data (`run.ts:245`). Storage ratio (`:605`). An invariant breach. An unknown exception (a bug is not transient). A critical alert (WP-12). |

- **The in-process deadline:** `RUN_DEADLINE_MS` = step timeout − 10 min (35 of 45), checked before each
  chunk and before backfill. A config test asserts `RUN_DEADLINE_MS < timeout_minutes` in `pipeline.yml`
  (the architect's "threshold at the kill line" lesson). The step timeout becomes a **hang backstop**. It is
  correctly not retried, because a hang is not known progress.
- `retry_wait_seconds: 60`.
- `concurrency: { group: deal-pipeline, cancel-in-progress: false }`.
- **Ordering:** T1 lands **after** the judge throughput fix (WP-2). Otherwise the deadline defers about 35%
  of weekly misses every run. It lands **before** alerts can fail the run (WP-12), which satisfies the
  architect's constraint.

### T2: `pipeline_runs.metrics jsonb` vs per-store `pipeline_run` columns

**Decision: `pipeline_runs.metrics jsonb`.**
- `pipeline_runs` is one row per run and is already written every run (`store.ts:128-137`).
- `pipeline_run` is per store (`store_slug NOT NULL`, `20260427_v3_concept_layer.sql:216-226`), has no
  writer, and is the wrong grain for a run snapshot.
- Guards:
  - `CHECK (jsonb_typeof(metrics) = 'object')`.
  - The payload carries `schemaVersion`.
  - A domain decoder turns it into `RunSnapshot`, and an unknown version becomes `instrument-missing`.
- **Two rows per workflow run** (append-only, `metrics.phase = 'collect' | 'transform'`), so neither job
  updates the other's row.
- `pipeline_run` is **left in place** (additive-only rule) and marked deprecated in the ADR.
- **One ADR covers F2:** run journal + fetch log.

---

## 6. Merged build order (builder-sized work packages)

Each package follows the loop: builder → code-reviewer → zero open findings → next. Every new guard gets
a mutation test (reintroduce the defect, confirm red, restore). Every package has at least one test
**through the composition root** (F0).

**WP-0 — Provider caps and measurement (manual, no code)**
- **Scope:**
  - **AP-9:** OpenRouter CI key limit USD 5, `limit_reset: monthly`, auto top-up off.
  - Confirm the Google project behind `GOOGLE_AI_API_KEY` has no billing account.
  - Read the OpenRouter activity page for actual $/call and tokens/call since 2026-09-10. That calibrates
    WP-8's p99 settle value and §3.3.
  - Decide **TP-7b** (withhold Migros now).
- **Depends on:** nothing. **Blocks:** WP-2 (concurrency raises the spend *rate*, so the hard wall must exist
  first).

**WP-1 — Composition root extraction (F0), behaviour-preserving**
- **Scope:** `createProductionDeps(env)`, `runCollect`, `runTransform`, `runPipeline`. `run.ts` becomes a
  thin shell returning `{ exitCode }`. No behaviour change; the literals in the alert snapshot stay (WP-7
  flips them).
- **Files:** `pipeline/run.ts`, new `pipeline/run-pipeline.ts`, `pipeline/composition.ts`.
- **First failing tests:**
  - `a full run through the composition root stores what the fake sources returned — run.ts had zero tests`
  - `the root wires one classifier, one judge, one enricher from env — nothing built inline`
    (characterisation)
- **Depends on:** nothing.

**WP-2 — `ProviderGate` (F1) and judge throughput**
- **Scope:**
  - One Gemini gate shared by the classifier, reflector and enricher.
  - One OpenRouter gate for the judge: max in-flight 4, circuit opens on 401/402.
  - Obey `retryAfter` up to 90 s.
  - The reflector logs its failures.
  - Enricher 429s become one summary line.
  - The judge node runs up to N judgements concurrently through the gate.
- **Files:** `transformation/domain/resilience.ts`, new `transformation/infrastructure/provider-gate.ts`
  (extracted from `resilient-classifier.ts`), `gemini-enricher.ts`, `gemini-judge.ts`,
  `application/classify-graph.ts`, `composition.ts`.
- **First failing tests:**
  - `classifier, reflector and enricher share ONE Gemini quota — backfill fired ~250 requests in 20 s, 255×429 (run 34833209176)`
  - `obeys Google's retryDelay of 57s instead of cutting it to 30s` (rewrite `resilient-classifier.test.ts:114-133`)
  - `judges at most 4 at once and never exceeds the OpenRouter gate — 100 sequential judgements took ~1,000 s`
  - `the judge circuit opens on 402 — out of credit is not transient`
  - `a reflector failure is logged, not swallowed`
- **Depends on:** WP-1, WP-0.

**WP-3 — Classifier truncation guards + caching uncertain outcomes**
- **Scope:**
  - Read `finishReason` → `output-truncated`.
  - `output-truncated` and `source-changed` are not `transient`.
  - An index-completeness check.
  - Wire `onUsage` (token metrics for WP-7).
  - `persistChunk` also caches `uncertain` outcomes with `is_uncertain = true`.
- **Files:** `gemini-classifier.ts`, `classification-prompt.ts`, `resilience.ts`, `classify-deals.ts`.
- **First failing tests:**
  - `a response cut off at MAX_TOKENS costs one call, not three, and never opens the circuit`
  - `a batch whose answers skip indices reports the missing products`
  - `an uncertain outcome is cached, so it is not re-judged next run`
  - Fix the `if (!isOk(r)) return` vacuous tests at `gemini-classifier.test.ts:168-181`.
- **Depends on:** WP-1.

**WP-4 — Exit contract, deadline, workflow hygiene (T1, F3)**
- **Scope:**
  - Exit codes 0/75/1.
  - `RUN_DEADLINE_MS` → defer and publish.
  - `retry_on_exit_code: 75`, `retry_wait_seconds: 60`, a `concurrency` group.
  - Fix the stale comments at `pipeline.yml:11, 194-195, 212-215`.
  - Revalidate before any non-zero exit (fixes `run.ts:605`).
  - Retire the legacy aktionis matrix **if AP-3 = yes**.
- **Files:** `run-pipeline.ts`, `classify-deals.ts`, `run-plan.ts`, `.github/workflows/pipeline.yml`.
- **First failing tests:**
  - `a run that reaches its deadline publishes what it has and exits 0 — a timeout is not retried once retry_on_exit_code is set (nick-fields/retry index.ts:147)`
  - `an unreadable cache exits 75; a storage-ratio failure exits 1 and still revalidates`
  - Config test: `RUN_DEADLINE_MS is below the step timeout in pipeline.yml`
- **Depends on:** WP-1, WP-2. **PM:** AP-3 (optional part only).

**WP-5 — Cadence and publication calendars (item 1 b, item 7 a)**
- **Scope:**
  - `IsoWeek` value object.
  - `COLLECTION_CADENCE`, `editionsDue(asOf)`.
  - Port `fetchOffers(asOf)`, with each adapter mapping to its own publication key (Migros: Thursday on or
    before).
  - Lidl flyer JSON fetched once.
- **Files:** `collection/domain/{offer-source,iso-week,cadence}.ts`, all seven adapters,
  `live-sources.ts`, `live-sources.test.ts`.
- **First failing tests:**
  - `on Monday 2026-09-14 only Monday retailers are due — the cron stagger fetched all seven three times a week`
  - `on Monday 2026-09-14 a forced Migros fetch asks for KW37, not KW38 which 404s`
  - `refuses a non-canonical week key — 2026-W7`
  - `fetches the Lidl flyer JSON exactly once` (count, not `.some()`)
- **Depends on:** WP-1. **PM:** **AP-1** (what ALDI Mon+Thu, Volg and Coop "stragglers" mean).

**WP-6 — Migros parser correctness (item 7 b–e)**
- **Scope:**
  - Tile geometry: nearest price above; name bounded to the tile.
  - Inline `X statt Y` and whole-franc `14.--`.
  - Per-offer `gültig vom … bis …` validity.
  - A funnel in the span, and a yield-ratio guard.
  - Pass the downloaded bytes to OCR (no second download), with real page numbers.
  - **Domain:** discount consistency guard in rappen, gated on every retailer's fixtures.
- **Files:** `migros-flyer-source.ts`, `issuu-fetcher.ts`, `ocr.py`, `live-sources.ts`,
  `collection/domain/discount.ts`.
- **First failing tests:** see my report §7.5, e.g.
  - `a name comes from the offer's own tile — "Schweinsbraten vom Hals" 1.50, not "OptigalPouletgeschnetzeltes"`
  - A golden master of the KW36 pp. 2–5 triples.
  - Rewrite `migros-flyer-source.test.ts:72-74`.
- **Depends on:** WP-1. The week part lives in WP-5. **PM:** **TP-7a** blocks only *publishing* multi-buy
  prices (new `PriceBasis`); the parse can land first.

**WP-7 — Run journal and alerts in report-only mode (item 2 core, T2, F2 part 1, F4)**
- **Scope:**
  - Migration `pipeline_runs.metrics jsonb` + CHECK.
  - `RunHistory` port.
  - `buildRunSnapshot`, `Measured<T>`, `instrument-missing`.
  - `classifyDeals` returns `halted`, budget, `invalidCategoryRejected`, `judgeUnavailable`, `heldBack`,
    `deferred`, and enrichment counts.
  - `run-slow` / `run-deferred` derived from the deadline.
  - Step summary + annotations; `createJsonTelemetry` wired.
  - Storage reports **collapsed** vs **rejected** separately (my item 8: "48 failed" were collapses).
- **Files:** `transformation/domain/alerts.ts`, new `run-snapshot.ts`, `classify-deals.ts`,
  `classify-graph.ts` (`Outcome.failure`), `store.ts`, `run.ts`, migration.
- **First failing tests:** the architect's §2.5 list, plus:
  - `a run that stored 400 deals is not "✅ no alerts" (run 34652857097)`
  - `a collapsed duplicate is not reported as a failed write`
- **Depends on:** WP-1 (WP-3 for token metrics, soft).

**WP-8 — Spend guard (item 5, §3.3)**
- **Scope:**
  - `SpendAccount` (`GET /api/v1/key`).
  - A run allowance from `limit_remaining`.
  - Settle from `usage.cost` (unknown → p99 × 2).
  - The paid gate as a required constructor dependency.
  - A registry test for paid models.
  - `max_tokens` + `reasoning.effort` **after AP-11**.
  - `spend-near-ceiling` / `spend-unguarded` alerts.
  - `CLAUDE.md:162` replacement + the five stale texts.
- **Files:** new `transformation/domain/spend.ts`, `transformation/infrastructure/openrouter-spend-account.ts`,
  `provider-gate.ts`, `gemini-judge.ts`, `model-registry.ts`, `alerts.ts`, `CLAUDE.md`.
- **First failing tests:**
  - `a retried attempt starts from the money already spent this month — attempt 2 reset to ZERO_SPEND`
  - `settles a call with no reported cost at the p99 bound, never 0`
  - `runs without the judge when the key reports no provider-side limit`
  - `sends max_tokens and reasoning.effort on every judge call` (asserts the request body)
  - Composition-root test: 3 × allowance → exactly 3 judge calls **across two invocations**.
- **Depends on:** WP-0, WP-2, WP-7. **PM:** AP-8 = **USD 5 (set)**, **AP-10**, **AP-11**.

**WP-9 — Collection split and fetch log (item 1, remaining paths; F2 part 2)**
- **Scope:**
  - Collect job → artifact (serialised `Offer[]`, rehydrated through `createOffer`) → transform job.
  - Slim `collection_edition` + `CollectedEditions` + `decideFetch` (skip/refuse, fail closed).
  - Dispatch inputs `retailers`, `reuse_run_id`, `force_refetch` + reason.
  - Verify that a re-run attempt can download the original attempt's artifact.
- **Files:** `collection/domain/fetch-policy.ts`, `collection/application/collect-offers.ts`, new
  `collection/infrastructure/supabase-collected-editions.ts`, new `pipeline/collect.ts`, `pipeline.yml`,
  migration.
- **First failing tests:** the architect's §1.5 list, adapted:
  - `never refetches a retailer already fetched this ISO week — 25 full collections in 4 days`
  - `fetches nothing when the fetch log cannot be read`
  - `a Monday run that collects only ALDI and Volg does not sweep Coop`
  - Composition root: `runCollect twice with the same clock → transport calls per retailer = 1`
- **Depends on:** WP-1, WP-4, WP-5. **PM:** **AP-2** (attempts per edition), **AP-4** (forced re-fetch).

**WP-10 — Enrichment completion (item 6 rest)**
- **Scope:**
  - Migration `product_classification_cache.attributes_enriched_at`.
  - `needsEnrichment` reads it.
  - A paced backfill with a time budget (the deadline).
  - `stats.enrichment` → snapshot.
- **Files:** `classification-cache.ts`, `classify-deals.ts`, `supabase-classification-cache.ts`, migration.
- **First failing tests:**
  - `a product whose name states nothing is enriched once, not re-requested every run`
  - `a rate-limited backfill reports what it owed — "backfilled 0/100" is not success`
  - `backfill stops at its time budget and carries the rest forward`
- **Depends on:** WP-2, WP-4, WP-7. **PM:** TP-6 (facet visibility) is independent.

**WP-11 — Coop full names (item 8)**
- **Scope:**
  - The ACL reads `title="Mehr Infos über …"`, cross-checked against the h3 prefix.
  - The aktionis descriptor is split into `sourceDescriptor`.
  - A port-contract test that no name ends in an ellipsis.
  - Copy the April 51-card fixture into `coop/__fixtures__/`.
  - Rewrite `coop-aktionis-source.test.ts:108-111`.
- **First failing tests:**
  - `keeps both Soave Classico vintages (2024, 2025) — aktionis truncates them to one title`
  - `no adapter emits a product name ending in an ellipsis`
- **Depends on:** WP-2 (to absorb about 300 one-time misses). **PM:** **TP-8** (whether the descriptor may be
  *displayed*; identity use does not wait on it).

**WP-12 — Alerts enforce (item 2 exit)**
- **Scope:** after **one clean report-only run** of WP-7, a critical alert → `exitCode 1`, evaluated after
  revalidation. Out-of-band staleness per AP-5.
- **First failing test:** composition root:
  `a budget-exhausting run exits 1, still revalidates, and 1 is not the retryable code`
  (architect's test (b)).
- **Depends on:** WP-4, WP-7. **PM:** **AP-5**, **AP-7**.

**Parallelism:** WP-1 → WP-2 → WP-4 is the critical path. WP-3, WP-5, WP-6 and WP-7 can proceed in parallel
after WP-1 if more than one builder is available. Each still finishes before its dependants start.

**Interim containment until WP-9** (the legal posture is the high-priority part of item 1):
- WP-2 removes the attempt-1 timeouts, which removes the retry re-fetches (9 of 25).
- WP-4's concurrency group, plus retiring the legacy matrix (AP-3), cuts the next largest share.
- WP-5's cadence cuts scheduled fetches from 3× to 1× a week.
- **Until then, avoid dispatch-driven debugging (15 of 25 collections):** debug the transform locally
  against a captured collection instead.

---

## 7. PM dependency map (not decided here)

| Decision | Blocks |
|---|---|
| AP-1 cadence meaning (ALDI, Volg, Coop) | WP-5 |
| AP-2 attempts per edition; failures count as the fetch? | WP-9 |
| AP-3 retire the legacy matrix | WP-4 (optional part) |
| AP-4 audited force re-fetch | WP-9 |
| AP-5 out-of-band staleness detector | WP-12 |
| AP-6 what the classifier-quality metric measures | WP-7 (field stays `not-measured` until decided) |
| AP-7 critical alert fails the run | WP-12 |
| **AP-8 = USD 5 / month (decided)** | WP-8 |
| AP-9 provider caps (manual) | WP-0 → WP-2, WP-8 |
| AP-10 judge off when the spend account is unreadable or uncapped | WP-8 |
| AP-11 re-benchmark before `max_tokens` / `reasoning.effort` | WP-8 (the cap part) |
| TP-6 Storage facet while coverage is low | none (UI only) |
| TP-7a publish multi-buy with a label | WP-6 (publishing only) |
| TP-7b withhold Migros now | WP-0 (decide), a small toggle if yes |
| TP-8 display the aktionis descriptor | WP-11 (display only) |
| TP-9 judge sampling instead of concurrency | only if WP-2's concurrency is rejected |

## Sources (external facts verified in this review)

- `nick-fields/retry` source at the pinned SHA `ce71cc2ab81d554ebbe88c79ab5975992d79ba08`, `src/index.ts` and
  `src/inputs.ts` (read via `gh api repos/nick-fields/retry/contents/...`)
- OpenRouter key limits and `GET /api/v1/key` fields: https://openrouter.ai/docs/api_reference/limits
- OpenRouter usage accounting (`usage.cost` on every response): https://openrouter.ai/docs/use-cases/usage-accounting
- OpenRouter reasoning tokens (`reasoning.effort`; "do not count toward max_tokens"): https://openrouter.ai/docs/use-cases/reasoning-tokens
- Run data: `gh run list --workflow=pipeline.yml --created ">=2026-09-08"`, `gh run view <id> --log`,
  `gh api repos/{owner}/{repo}/actions/runs/<id>` (`run_attempt`), `gh variable list`, `gh repo view`
