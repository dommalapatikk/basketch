# RCA — HANDOVER §8 items 1, 2 and 5

**Date:** 2026-09-15 · **Author:** architect agent · **Scope:** root cause analysis only. No code, workflow or config was changed.
**Method:** every claim below comes from reading the file at the cited line. Nothing comes from memory or from the HANDOVER summary alone.

> **Evidence caveat (per HANDOVER §3 lesson "never declare a hypothesis confirmed from evidence that doesn't match production").**
> I had no shell in this session, so I read **no production logs** and could not run `gh`. Everything
> marked **CONFIRMED** is confirmed *from the code and workflow that production runs*. Anything about
> how often production actually did something is marked **INFERRED**, with the command that would verify it.
> One fact decides how big Item 1's breach is: **the value of the `COLLECTION_MODE` repo variable**
> (`gh variable list`). The last successful run was clearly in `live` mode, because Migros, ALDI and SPAR
> link to flyers and only the collection module produces flyer URLs. I could not see whether *scheduled*
> runs are `live` or only dispatched ones.

---

## Summary

| # | Verdict | Root cause (the one that, fixed, prevents recurrence) | Fix, one line |
|---|---|---|---|
| 1 | **CONFIRMED, and the retry is the smaller breach.** The cron stagger re-fetches all seven retailers 3× a week *before* any retry. | "One fetch per store per week" was only ever enforced by the legacy matrix job's `days:` filter in YAML. When collection moved into `run.ts`, the rule stayed behind in the job it no longer runs in. The domain has no idea of "already collected". | Domain `FetchPolicy` + cadence, plus an application-level **collection ledger** (a persisted per-edition snapshot) that every fetch path goes through. Workflow tweaks are extra protection, not the enforcement. |
| 2 | **PARTIALLY CONFIRMED, and worse than reported.** 7 of 9 rules are dead because of their inputs, but 2 of those 7 are dead for a different reason than "a literal". A further rule (`run-slow`) can never fire in CI. **8 of 9 can never fire; only one warning is live.** `shouldFailRun` is correct as a unit but can never be true in production. `exit(1)` is unreachable. | `RunSnapshot` cannot tell "measured 0" from "never measured". Metrics are dropped at module boundaries. `previous` is null forever because nothing saves a snapshot. The composition root (`run.ts main()`) has zero tests. | Build the snapshot from real outputs in a pure `buildRunSnapshot()`. Add a `NotMeasured` state that raises its own alert. Save one snapshot per run and read the previous one back. Move staleness detection out of the process. Use an exit code that fails the run without triggering a retry. |
| 5 | **CONFIRMED stale prose, plus real unbounded spend.** | The budget was designed for "free tier only". When the PM approved a paid judge, the premise changed and the guardrail did not. Money (`rappen`) has no producer anywhere. The budget lasts one process attempt, not a month. The paid call has no `max_tokens`. | A domain `SpendBudget` with the allowed number of paid calls **derived from** the remaining monthly money. A `Reservation` that a paid call cannot be made without. Remaining money read from OpenRouter's own key endpoint. A provider-side key cap, which the PM sets by hand. |

---

## Cross-item interactions (read before fixing any one item)

1. **The exit-code channel is shared by Item 1 and Item 2.** `nick-fields/retry` retries on *any* failure
   (`retry_on` defaults to `any`, and `retry_on_exit_code` is unset, `pipeline.yml:184-221`). Wiring
   `shouldFailRun → process.exit(1)` naively would turn every critical alert into a retry. A classifier
   regression is deterministic, so attempt 2 re-fetches all seven retailers and hits the same regression.
   The same already happens today with the reachable exits: `run.ts:245` (no data), `run.ts:605`
   (storage ratio), `run.ts:645` (crash). The crash case includes `classify-deals.ts:259` throwing when
   the Supabase cache is unreadable, so **a Supabase outage makes the run re-fetch every retailer and
   fail again.**
2. **The retry resets the spend budget (Items 1 and 5).** `classify-deals.ts:283` and `:383` start every
   process at `ZERO_SPEND`. Attempt 2 is a new process, so it gets a fresh budget. The per-run budget is
   really a per-attempt budget.
3. **One persistence decision serves both Item 2 and Item 5.** Both need "what did the last run(s) do"
   in storage. Decide once, not twice (see the Tech Lead decision T2).
4. **Ordering.** Fix Item 1's exit-code scheme **before** Item 2 makes `exit(1)` reachable. Otherwise the
   first real critical alert triggers a full re-fetch.

---

# Item 1 — Retry re-fetches every retailer

## 1.1 Symptom and verdict

**Reported:** when "Categorize & Store Deals" retries, attempt 2 re-runs collection, so all seven retailers are fetched again. This breaches "one fetch per store per week".

**Verdict: CONFIRMED. The reported path is one of seven re-fetch paths, and not the largest.**

How collection and transform are coupled today:

| Evidence | What it shows |
|---|---|
| `pipeline.yml:184-221` | The retried step's `command` is `cd pipeline && npx tsx run.ts` (`:221`). `max_attempts: 2` (`:219`), `timeout_minutes: 45` per attempt (`:216`), `retry_wait_seconds: 300` (`:220`). The step's own comment admits it: *"the step re-runs collection first"* (`:214`). |
| `run.ts:181-187` | When `COLLECTION_MODE` is `shadow` or `live`, `main()` calls `collectOffers(createLiveSources({kw, year}), week, …)` inside the same process that classifies and stores. |
| `run.ts:187-233` | The collected `Offer`s exist **only in memory**. They are mapped to `UnifiedDeal` in place (`:215-220`) and never written anywhere. |
| `collect-offers.ts:104` | Telemetry defaults to `noopTelemetry`, and `run.ts:187` passes none, so even the trace is not saved. |
| `collect-offers.ts:99-148` | No idea of prior collection. Every source passed in gets `fetchOffers()` unconditionally (`:116`). |
| `live-sources.ts:135-210` | Always returns all seven sources. There is no retailer or day filter. |
| `collection-mode.ts:26-30` | The mode is the only switch. It has no idea of cadence. |

**Does collection already save its output somewhere a transform-only retry could use?** No.
- Live-mode offers are never saved before classification. The only persisted form is the `deals` table
  *after* classification and storage, and that form is lossy (`UnifiedDeal` plus the enrichment pass).
- The GitHub artifacts (`pipeline.yml:122-129`, downloaded at `:175-179`) hold the **legacy aktionis
  JSON**. Live mode ignores it apart from the comparison table and the `safeToCutOver` fallback
  (`run.ts:198-206`).
- `nick-fields/retry` runs every attempt inside one step on one runner, so a file written by attempt 1
  *would* still be there for attempt 2. Nothing writes one.

**All re-fetch paths I found:**

| # | Path | Evidence | Status |
|---|---|---|---|
| a | **Transform retry**, attempt 2 | `pipeline.yml:219-221`, `run.ts:181-187` | CONFIRMED (code). Applies whenever the mode is `live` or `shadow`. |
| b | **Cron stagger.** Three scheduled runs a week (Mon, Tue, Thu, `pipeline.yml:4-10`). `process-and-store` has **no day gate** (`:131-135`: `needs` plus `if: always() && !cancelled()`). Every in-process collection builds all seven sources. | `pipeline.yml:131-135`, `live-sources.ts:141-209` | CONFIRMED (code), **provided `vars.COLLECTION_MODE == 'live'`**. Then every retailer is fetched **3× a week on schedule alone**, or 6× if each run retries. On Monday, `isoWeekOf` resolves to the new ISO week, so Thursday-launch retailers (Migros, Lidl) are asked for a flyer that is not published until Thursday. The design doc says the opposite: *"each retailer is still fetched only on its own cycle days, honouring one-fetch-per-store-per-week"* (`docs/component-2-agent-design.md:906-908`). That was true of the legacy matrix and stopped being true when collection moved. |
| c | **Manual `workflow_dispatch`**. Bypasses the matrix day gate (`pipeline.yml:94`) and, in live mode, fetches all seven. No limit on how often. | `pipeline.yml:11, 94` | CONFIRMED (code). **INFERRED:** the five-run outage in HANDOVER §3 was debugged by dispatching runs. Each died at the 45-minute timeout and retried once, which suggests **~10 full collections of all seven retailers within a few days**, plus the matrix. Verify with `gh run list --workflow=pipeline.yml --created ">=2026-09-08"` and, per run, `gh run view <id> --log \| grep -c "collected .* offers"`. |
| d | **Re-run from the UI or `gh run rerun`** (with or without `--failed`). Collection sits inside `process-and-store`, so re-running that job always re-collects. | structure of `pipeline.yml` | CONFIRMED (structure). |
| e | **The legacy matrix itself.** It still fetches aktionis.ch for 8 slugs, up to **3 attempts with 300 s waits** (`pipeline.yml:113-120`). In live mode its output only feeds a comparison table. **Coop via aktionis is fetched twice in one run**: by Python (`coop`, `coop-megastore`) and by `coop-aktionis-source.ts`. | `pipeline.yml:49-57, 113-120`; `live-sources.ts:152-157` | CONFIRMED (code). HANDOVER §3 ("All eight collectors succeeded every time") shows the matrix still runs. |
| f | **Duplicate fetch inside one collection.** The Lidl flyer JSON is fetched by `fetchFlyer` (`live-sources.ts:193`) and again inside `fetchPdfText` (`:195`). The adapter calls both (`lidl-flyer-source.ts:269, 276`). | as cited | CONFIRMED (code). |
| g | **Local runs** of `npx tsx run.ts` with `COLLECTION_MODE=live`. Nothing guards them. | `run.ts:181` | CONFIRMED (code). |

**One more defect found on the way, which matters for the fix:** the port's `week` argument is
ignored by **all seven** adapters. Each declares `fetchOffers(_week: IsoWeek)` (`volg-html-source.ts:252`,
`lidl-flyer-source.ts:266`, `spar-flyer-source.ts:224`, `aldi-flyer-source.ts:274`,
`coop-aktionis-source.ts:205`, `denner-api-source.ts:327`, `migros-flyer-source.ts:299`). The week
actually fetched is fixed when the source is built (`live-sources.ts:136`), or is simply "whatever is
current" (Denner, Volg, Coop). A guard keyed on the port's `week` argument would be keyed on a value
nobody honours. That is HANDOVER §4 defect #5 again: a guard fed an intent value instead of a real one.

**`retry_wait_seconds: 300`: CONFIRMED wasteful.** With per-chunk caching (`classify-deals.ts:411-420`),
attempt 2 resumes. The only binding provider limit is **per minute** (`resilience.ts:49-57`: 15 requests
per minute, `retryDelay` 31 s). Five idle minutes buy nothing that 60 seconds does not.

## 1.2 Root cause (five whys)

1. *Why does attempt 2 re-fetch?* Collection runs inside the retried process, and its output lives only in memory (`run.ts:181-233`).
2. *Why is collection inside the transform process?* The collection module was wired in as a **mode switch on the input** (`collection-mode.ts`), replacing the JSON files, when it should have **replaced the job that produced those files**. The legacy design had the right seam: fetch job → artifact → process job. The cutover collapsed it.
3. *Why did nobody notice the fetch count going up?* The rule was enforced in exactly one place: the legacy matrix's `days:` filter (`pipeline.yml:53-87, 89-99`). That is a property of one YAML job, not of the collection module. New code that does not pass through that job silently escapes it.
4. *Why was it only in YAML?* The rule exists as prose (`CLAUDE.md` Legal Constraints; `docs/data-source-research-2026-09-07.md:412` *"Don't slow the source. One fetch per store per week is far inside it — document that"*). A design doc also *asserted* that it holds (`component-2-agent-design.md:906-908`). No type, no test and no domain object encodes it.
5. **Root cause:** there is **no enforcement point for fetch frequency in the path every fetch shares**. The domain has no concept of an *edition* or of *already collected*: `IsoWeek` is a bare `string` (`offer-source.ts:13`), `fetchOffers` is unconditional (`collect-offers.ts:116`), and the week argument is decorative. So every execution path that builds sources (retry, cron, dispatch, re-run, laptop) fetches. Fixing only the retry would leave paths b to g open.

This is the recurring shape from HANDOVER §4: a correct unit (the matrix `days:` gate) that nothing on the new path wires up.

Note the legal framing. The research doc lists "Don't slow the source" under **"Tier 1 — these are the ruling"** and says to *document* the one-fetch rule. If we cite that measure while not honouring it, our own documentation is false. That is worse than having no measure.

## 1.3 Why existing tests did not catch it

| Test | Why it passed while the defect was live |
|---|---|
| `live-sources.test.ts:55-60` *"creates one source per retailer, and no more"* | It **encodes the defect as a requirement**: every build returns all seven, whatever the day. Same shape as the `toBe('dairy')` test in HANDOVER §2. |
| `live-sources.test.ts:89-93` *"asks Lidl for the flyer of the requested week"* | The recording transport already logs **every URL** (`:13-47`), but the assertion is `urls.some(...)`, which checks presence and not count. The duplicate Lidl fetch (path f) passes. |
| `live-sources.test.ts:77-99` | Passes `'2026-W37'` to `fetchOffers` **and** `kw=37` to the constructor. Because the two always agree, the fact that every adapter ignores the week argument never shows. |
| `collect-offers.test.ts` (whole file) | Tests fan-out, timeout and containment across the sources it is given. There is no notion of a previous collection, so "don't fetch twice" is untestable at that level. |
| *(none)* | `pipeline.yml` has no test. The only encoding of the rule has no test. |
| *(none)* | No test imports `run.ts`. `grep` across `pipeline/**/*.test.ts` finds zero imports. `main()` is not exported (`run.ts:120, 644`). |

## 1.4 Proposed fix (DDD) — the smallest correct design

**What enforces the rule? Not prose (already failed), not the workflow (it cannot see paths c, d, f and g),
but the application service every fetch goes through, driven by a domain policy.** The workflow changes
are cheap extra protection.

### Alternatives considered

| Criteria (weight) | A. Workflow split (collect job → artifact → transform job) | B. Domain cadence filter only | **C. Domain policy + persisted collection ledger** | D. GitHub Actions cache as ledger |
|---|---|---|---|---|
| Closes path a, retry (3) | 5×3=15 | 1×3=3 | 5×3=15 | 5×3=15 |
| Closes b, cron stagger (3) | 1×3=3 | 5×3=15 | 5×3=15 | 3×3=9 |
| Closes c, d, g: dispatch, re-run, laptop (3) | 2×3=6 | 1×3=3 | 5×3=15 | 1×3=3 (invisible to laptop runs) |
| Size of change (2) | 3×2=6 | 5×2=10 | 3×2=6 | 3×2=6 |
| Observable in SQL (1) | 1 | 1 | 5 | 1 |
| **Total** | **31** | **32** | **56** | **34** |

D is rejected: the cache is branch-scoped, evicted after 7 days without access, and invisible to local runs.
A is worth having as extra protection but does not enforce anything.

### Domain (`collection/domain/`, pure, no I/O)

- **`IsoWeek` becomes a value object.** `createIsoWeek(s)` accepts only the canonical `YYYY-Www`. *Why:*
  it becomes part of a persisted key, and a non-canonical key (`2026-W7` vs `2026-W07`) would mean "not
  yet fetched" and bypass the guard. That is HANDOVER §4 defect #4 (raw key vs normalised key) in a new place.
- **`Edition` value object** = `{ retailer, fetchWeek: IsoWeek, cycle? }`. The key means **"we fetched
  retailer R during ISO week W"**. That is a fact about *us*, not about which flyer the source served.
  This is deliberate: it matches the legal rule (our load on the source per week), and it does not depend
  on the week argument that every adapter ignores. `cycle` exists only if the PM decides dual cycles are
  legitimate (decision P1).
- **`COLLECTION_CADENCE: Record<Retailer, readonly Weekday[]>`** and `editionsDue(date): Edition[]`.
  This is **one definition** that replaces `pipeline.yml`'s matrix `days:`. The matrix, if it survives,
  should derive from it or be deleted.
- **`decideFetch(edition, record | null): 'fetch' | 'reuse' | 'refuse'`**. Invariants:
  - A `collected` record → `reuse`. **Never** `fetch`.
  - A record whose last failure was a **refusal** (401/403/robots) → `refuse`. Legal: an honest client
    that is blocked has been refused (CLAUDE.md, "Never circumvent").
  - `attempts >= MAX_ATTEMPTS_PER_EDITION` → `refuse`. The number is decision P2.
  - Otherwise → `fetch`.

### Application (`collection/application/`)

- **Port `CollectedEditions`** (a noun, no `I` prefix):
  - `read(editions): Promise<Result<ReadonlyMap<Edition, EditionRecord>>>`
  - `recordCollected(edition, offers, runId): Promise<Result<void>>`
  - `recordAttempt(edition, failureReason, runId): Promise<Result<void>>`
- **`collectOffers` takes the ledger as a dependency.** For each due edition it asks `decideFetch`:
  - **reuse** → load the saved offers and **rebuild each through `createOffer`** (`offer.ts:58`), so
    saved data is re-checked against the invariants rather than trusted.
  - **fetch** → call the source, then **record it the moment that source finishes**, not at the end of
    the run. This applies HANDOVER §4 defect #1 (cache saved once at the very end).
  - **refuse** → report it, visibly.
- **An unreadable ledger fails closed: fetch nothing, and fail the run loudly.** This is HANDOVER §4
  #10 ("an error returned is not an error handled") and the lookup lesson from §3: an unreadable ledger
  is **not** an empty ledger.
- **A present record with zero saved offers is a failure, not a reuse.** Empty is not success (CLAUDE.md).

### Infrastructure

- **`SupabaseCollectedEditions`**: one table, `collection_edition(retailer, fetch_week, cycle, status,
  attempts, last_failure, last_run_id, collected_at, offers jsonb, PRIMARY KEY (retailer, fetch_week, cycle))`.
  RLS: service role only, no anon policy. Size: ~1,600 offers × ~600 B ≈ **~1 MB a week**. Delete rows
  older than 4 weeks; that is trivial against the 500 MB free tier.
- **An in-memory adapter that honours the same primary key**, including rejecting duplicate inserts.
  This applies HANDOVER §4: `createInMemoryCache` was a `Map` that silently absorbed duplicates and hid
  defect #7. One shared contract test runs against both adapters.
- **Fix path f:** fetch the Lidl flyer JSON once and hand the result to both consumers.
- **Make adapters honour `fetchOffers(week)`** so the week has one source of truth. Build URLs from the
  argument, not from the constructor's `kw/year`. This is adjacent to the item and small; do it in the same pass.

### Workflow (extra protection, not enforcement)

- `retry_wait_seconds: 300 → 60` on the transform step.
- **Separate exit codes:** `run.ts` exits `75` (EX_TEMPFAIL) for transient failures and `1` for
  deterministic failures and critical alerts. The retry step then gets `retry_on_exit_code: 75`.
  ⚠️ **Read the action's source before relying on this.** The README says it *"will only retry for the
  given error code"*, but it does not say whether a **timeout** is still retried when that input is set.
  That is the HANDOVER §3 lesson: read the library source on failure #1.
- `concurrency: { group: deal-pipeline, cancel-in-progress: false }` at workflow level. A dispatch
  cannot then overlap a cron run, and there is no race on the ledger.
- Correct three misleading comments: `:11` ("runs all stores"), `:194-195` ("Judge … Not yet wired",
  which is false because `run.ts:364-370` wires it), and `:212-215`.
- Once the ledger exists, **splitting the step is optional**: attempt 2 re-enters `collectOffers`, finds
  every edition `collected`, and makes zero network calls.

**Rejected as over-engineering:** a scheduler service, a distributed lock, an event bus, a separate
"fetch service". One table, one port, four small domain files.

## 1.5 TDD plan

**First failing tests, each named after the real defect it prevents:**

| Layer | Test |
|---|---|
| domain | `does not fetch a Thursday retailer on a Monday run — the cron stagger fetched all seven three times a week` |
| domain | `refuses a non-canonical week key — 2026-W7 would bypass the collection ledger` |
| domain | `never refetches an edition already collected — retry attempt 2 refetched all seven (pipeline.yml:219)` |
| domain | `never re-attempts a retailer that refused us — a 403 is a refusal, not a transient` |
| application | `reuses the stored offers on a second run in the same week, making zero fetches` (fake source counting `fetchOffers` calls, in-memory ledger) |
| application | `records each retailer as it finishes — a run killed mid-collection must not refetch the ones already done` |
| application | `fetches nothing when the ledger cannot be read — an unreadable ledger is not an empty one` |
| application | `rejects a stored offer that breaks an invariant on reload — a stored row is not trusted` |
| application | `a stored edition with zero offers is a failure, not a reuse` |
| infrastructure | `fetches the Lidl flyer JSON exactly once per collection — live-sources fetched it twice` (**count** URLs in `recordingTransport`, not `.some()`) |
| infrastructure | shared contract: `the in-memory ledger rejects a duplicate key exactly as Postgres does` |

**Mutation test for every new guard** (reintroduce the defect, confirm red, restore):
- Remove the `decideFetch` call in `collectOffers` → "zero fetches on second run" goes red.
- Move `recordCollected` to after the loop → "killed mid-collection" goes red.
- Replace the unreadable-ledger branch with "treat as empty" → "unreadable ledger" goes red.
- Return all seven from `editionsDue` → "Thursday retailer on a Monday" goes red.
- Restore the second `fetchJson(lidlFlyerUrl(kw))` → "Lidl exactly once" goes red.

**Through the composition root (mandatory):** extract `main()` into an exported
`runPipeline(deps): Promise<RunOutcome>` with `run.ts` as a thin shell. The test builds the **real**
`createLiveSources({ transport: countingTransport })`, which is the existing seam at `live-sources.ts:52-72`,
plus the in-memory ledger. It calls `runPipeline` twice with the same clock and asserts
**transport calls per retailer across both invocations = 1**. That test goes through
`createLiveSources → collectOffers → ledger`, which is exactly the wiring that was missing.

## 1.6 Blast radius, risks, decisions

**Blast radius:** a new migration and table; `collectOffers` signature (its tests change); `run.ts`; the
seven adapter constructors (week argument); `pipeline.yml`.

**Risks:**
- **The opposite failure.** A ledger bug that says "collected" when nothing was saved would hide a
  retailer for a week. Mitigations: a record is written only **after** the offers are saved in the same
  row, and "record present, zero offers" is a failure.
- **Invariant drift.** Rehydrating through `createOffer` can reject offers that passed at collection
  time if an invariant is tightened mid-week. That is acceptable, because it fails loudly.
- **Removing the matrix** (if the PM chooses to) removes the `COLLECTION_MODE=off` escape hatch and the
  `safeToCutOver` fallback (`run.ts:204-206`).

**PM decisions (flagged, not decided):**
- **P1.** What does "one fetch per store per week" mean for **ALDI (Mon + Thu)**, **Volg (Mon general +
  Thu fresh)** and **Coop (Mon/Tue/Thu "stragglers")** (`pipeline.yml:52-87`)? Is the unit the ISO week
  or the publication? The rule as written is already broken by the legacy matrix design for these three.
- **P2.** Does a *failed* attempt count as "the fetch"? How many attempts per edition (I suggest 2), and never after a refusal?
- **P3.** Retire the legacy aktionis matrix now that live works? This removes Coop's double fetch and 6
  pointless aktionis fetches, and also removes the fallback. *(Tech Lead and PM together.)*
- **P4.** Should a PM be able to force a re-fetch (a `force_refetch` dispatch input, recorded in the
  ledger with a reason)? I suggest yes, audited.

---

# Item 2 — The alerting layer is dead

## 2.1 Symptom and verdict

**Reported:** (i) 7 of 9 alert rules are fed hard-coded literals; (ii) `shouldFailRun` can never return true; (iii) `process.exit(1)` is unreachable.

The alerting code is `pipeline/transformation/domain/alerts.ts` (9 rule blocks, 10 alert codes), wired at `pipeline/run.ts:566-596`.

**How `run.ts:571-591` feeds the snapshot:**

| Field | Value passed | Line | Real value exists? |
|---|---|---|---|
| `finishedAtMs` | `Date.now()` | 573 | Tautological: compared with `Date.now()` again at `:591` |
| `totalProducts`, `classified`, `uncertain`, `rejected`, `cacheHits`, `cacheMisses`, `durationMs` | real (`stats.*`, `durationMs`) | 574-580, 583 | yes |
| `invalidCategoryRejected` | **`0`** | 578 | **Produced** at `classification-prompt.ts:252` (`reason: 'invalid-category'`), then **dropped** at `classify-graph.ts:177-179`: `Outcome` keeps `detail` but not `reason` |
| `tokensUsed` | **`0`** | 581 | Partly produced: the graph budget (`classify-deals.ts:409`) is never returned in `stats` (`:590-604`). Tier-1 tokens are recorded as **0** at `classify-graph.ts:164`. |
| `rappenSpent` | **`0`** | 582 | **Never produced anywhere.** `recordSpend`'s `rappen` parameter (`guardrails.ts:151`) is never passed. |
| `benchmarkMacroF1` | **`null`** | 584 | **Never produced.** `scoreBenchmark` / `macroF1` (`benchmark.ts:66, 137`) have no production caller. |
| `publishedDataCoverage` | **`{}`** | 585 | **Computed 387 lines earlier** in the same function: `compareCollection` → `withPublishedData` per retailer (`run.ts:198`, `collection-mode.ts:90-92`), then discarded |
| `halted` | **`null`** | 586 | **Produced** (`classify-deals.ts:440-443` logs it and breaks) and **not returned** in `stats` |
| `previous` argument | **`null`** | 591 | Nothing saves a snapshot. The `pipeline_run` metric columns added for this (`20260910_classification_cache.sql:100-120`) are **never written**. `logPipelineRun` writes 4 fields to the *other* table (`store.ts:120-137`). |

**Rule by rule, in CI:**

| # | Rule (severity) | `alerts.ts` | Can it fire in CI? | Why |
|---|---|---|---|---|
| 1 | `pipeline-stale` (critical) | 76 | **No** | `nowMs - finishedAtMs` ≈ 0 ms against an 8-day threshold. Tautological, not a literal. It is also **structurally impossible in-process**: a pipeline that has stopped cannot report that it has stopped. |
| 2 | `run-halted` (critical) | 86 | **No** | Literal `null` |
| 3 | `classifier-regression` (critical) / `classifier-drift` (warning) | 96 | **No** | Literal `null` for both current and previous |
| 4 | `source-shape-changed` (critical) | 116-118 | **No** | Literal `{}`, and previous is `null` |
| 5 | `uncertainty-spike` (warning) | 129-131 | **Yes** | Real inputs. **The only live rule.** |
| 6 | `invalid-category-spike` (warning) | 142 | **No** | Literal `0` |
| 7 | `cache-hit-rate-low` (warning) | 153 | **No** | Inputs are **real**, but the rule is gated on `previous !== null`, and previous is literal `null`. Dead by a gate, not a literal. |
| 8 | `run-slow` (warning) | 163 | **No, in CI** | Real input, but the threshold (45 min) **equals the per-attempt kill** (`pipeline.yml:216`). A run that slow is killed before `evaluateAlerts` runs. Can fire only locally. |
| 9 | `spend-unexpected` (warning) | 173 | **No** | Literal `0`, and no producer exists |

- **Claim (i): PARTIALLY CONFIRMED.** The count "7" is right for rules dead because of their inputs
  (1, 2, 3, 4, 6, 7, 9). But for two of them the mechanism is not "a literal field": #1 is tautological
  and #7 is killed by the literal `previous`. And the claim understates the problem: **#8 is also dead in
  CI**, so **8 of 9 can never fire. Only `uncertainty-spike`, a warning, is live.**
- **Claim (ii): CONFIRMED for the composition root; the unit is correct.** `shouldFailRun`
  (`alerts.ts:186-188`) returns true for any critical alert, and `alerts.test.ts:50, 56, 64, 97` prove
  it. But all four critical rules (1, 2, 3, 4) are dead in production, so `shouldFailRun(alerts)` at
  `run.ts:593` is always false.
- **Claim (iii): CONFIRMED.** `process.exit(1)` at `run.ts:595` is guarded by (ii). The run can still
  fail through `:245`, `:605` and `:645`, but **never because of an alert**.

The same defect shape turns up next door and is part of the same finding:
- `json-telemetry.ts` (`createJsonTelemetry`, `formatRunSummary`), `toPipelineRunRecord`
  (`telemetry.ts:96`), `withinLatencyBudget` / `RUN_TIMEOUT_MS` (`resilience.ts:250, 271`) and
  `evaluatePromptChange` (`run-plan.ts:178`) are all **built, tested and never called** (grep: only test
  files import them).
- `classification-prompt.ts:87-88` defers the repair loop *"WIRE THIS IF … `invalid_category_rejected`
  non-zero in pipeline_run — the alert for that already exists"*. A deliberate design decision is
  **conditioned on an instrument that does not exist.**

## 2.2 Root cause (five whys)

Before believing the loudest symptom, the fatal one: the loudest symptom is "literals". The fatal one is
**`previous = null` forever**. It alone kills four rules, two of them critical. Replacing the six literals
with real values would still leave regression, drift, shape-change and cache-rate dead.

1. *Why can't the rules fire?* Their inputs are literals, a tautology, or gated on a `previous` that is always null.
2. *Why literals?* Each metric is either **dropped at a module boundary** (halted and budget at
   `classify-deals.ts:590-604`; invalid-category at `classify-graph.ts:177-179`; coverage at
   `run.ts:198` → `:585`), **never produced** (macro-F1, money), or **needs history that nothing keeps**
   (`previous`).
3. *Why is `previous` null forever?* The comment at `run.ts:589-590` (*"No previous run to compare
   against **yet** … Passing null is honest"*) records a deferral with **no end condition**. The
   snapshot is never saved, so "yet" never ends. The table meant to hold it (`pipeline_run`, per store,
   `store_slug NOT NULL` at `20260427_v3_concept_layer.sql:216-226`) has the wrong shape for a run-level
   snapshot. That is a plausible reason the write was never wired.
4. *Why did the type system and the tests allow it?* **`RunSnapshot` cannot tell "measured zero" from
   "not measured".** `0`, `null` and `{}` are valid measured values, so a literal type-checks. `evaluateAlerts`
   treats "nothing to evaluate" as "nothing wrong" (null skips at `:96`, empty loop at `:116`, gate at
   `:153`). And the composition root is an untestable script (`main()` not exported, `run.ts:120, 644`),
   so no failing test ever drove the wiring.
5. **Root cause:** **an alert rule that cannot evaluate is indistinguishable from one that evaluated and
   found nothing.** The recurring defect (HANDOVER §4: "an operation reporting success while doing
   nothing") is not prevented by type or test here, because "✅ no alerts" (`alerts.ts:192`) is the output
   of both the healthy path and the dead path. Fix that and the class cannot recur silently: any future
   unwired instrument announces itself.

## 2.3 Why existing tests did not catch it (coverage theatre)

| Test | Theatre |
|---|---|
| `alerts.test.ts:12-29` `snap()` fixture | Every field is realistic and **measured**, including three that production **never** supplies: `tokensUsed: 80_000` (`:22`), `benchmarkMacroF1: 0.86` (`:25`), `publishedDataCoverage: {denner: 1.0, lidl: 1.0}` (`:26`). The suite tests the rules in a world that does not exist. |
| `alerts.test.ts:33-41` *"a healthy run is silent"* / *"does not fail CI"* | **Vacuous against this defect.** Silence is both the healthy output and the dead output. Same shape as the `.some()` on `[]` in HANDOVER §4. |
| `alerts.test.ts:44-51` stale | Sets `finishedAtMs` to 9 days ago, a value production **cannot** produce (`run.ts:573` passes `Date.now()`). |
| every rule test except `:48, :82` | Passes `previous = snap()`, so the `previous !== null` gate (`alerts.ts:153`) is never exercised with the `null` production always passes. |
| `alerts.test.ts:128-130` run-slow | Uses 50 minutes, above the CI kill line. Nothing ties the threshold to `pipeline.yml:216`. |
| `classify-graph.test.ts:137-150` *"skips classification once the token budget is exhausted"* | Starts the budget **pre-exhausted** (`:144`). Nothing checks that real calls **accumulate** spend, so `recordSpend(budget, 0)` (`classify-graph.ts:164`) survives. `halted` is asserted on the graph but never on `classifyDeals`' output, where it is dropped. |
| `run-plan.test.ts:103-109` *"never plans beyond what the remaining budget can pay for"* | Tests the `spent` parameter. Production always passes the literal `ZERO_SPEND` (`classify-deals.ts:283`). |
| `collect-offers.test.ts:192-203`, `json-telemetry.test.ts` | Test `toPipelineRunRecord` / `formatRunSummary`, which are never called in production. |
| *(none)* | **Zero tests import `run.ts`.** Every literal lives in the only file with no tests. |

## 2.4 Proposed fix (DDD)

**Domain (`transformation/domain/alerts.ts`)**
- **Make "not measured" representable and loud.** Every measured field becomes
  `Measured<T> = { kind: 'measured'; value: T } | { kind: 'not-measured'; reason: string }`.
  **New invariant in `evaluateAlerts`: every rule either passes, fires, or emits `instrument-missing`
  (warning) naming the field and reason.** "✅ no alerts" is then only possible when every instrument was
  actually read. This is one small union, not a framework, and it closes the defect class rather than
  this instance.
- **`run-slow` threshold derived from `RUN_TIMEOUT_MS`** (for example 0.8 × it), with a test asserting
  `RUN_SLOW_MS < RUN_TIMEOUT_MS`, plus a config test comparing `RUN_TIMEOUT_MS` to
  `pipeline.yml` `timeout_minutes`. A threshold at the kill line cannot be observed.
- **Remove `pipeline-stale` from in-process evaluation.** It cannot be evaluated from inside the run.
  Keep the *gap-since-previous* variant: when a run does happen, report days since `previous.finishedAtMs`.
  Hand the "it stopped" case to an out-of-band detector (decision P5).
- **Fix the stale action text** at `alerts.ts:177-178`, *"this pipeline should be free"*. It is false since the paid judge (see Item 5).

**Application**
- **`buildRunSnapshot(inputs): RunSnapshot`**, a pure function whose parameters are the *real* output
  types: `ClassifyDealsResult['stats']`, `CollectOffersOutcome`, `StoreWriteResult`, `SpendSummary`.
  It leaves nowhere to type a literal. Coverage per retailer comes from `hasPublishedData`
  (`source-attributes.ts:202`) over the collected offers.
- **`classifyDeals` returns what it currently drops:** `halted`, `budget` (tokens, calls, and spend
  after Item 5), `invalidCategoryRejected`. `Outcome` gets an optional `failure: ClassificationFailure`
  so `classify-graph.ts:177-179` stops discarding `o.reason`.
- **Port `RunHistory`**: `lastSuccessful(): Promise<Result<RunSnapshot | null>>`, `save(snapshot)`.
  `null` then means "no successful run ever", not "we never looked". An **unreadable** history returns
  `err` and produces `instrument-missing`, never a silent `null`.
- **`macroF1`:** needs a producer. The smallest honest one scores **this run's Denner offers** against
  Denner's own categories, since the collection design already names Denner as "the marking scheme".
  It costs no extra model calls. Until it is built, the field is `not-measured: 'benchmark not wired'`
  and says so every run. (Decision P6.)
- **Exit policy:** `runPipeline` returns `{ exitCode }` rather than calling `process.exit` mid-flow.
  A critical alert → exit `1` (**not retried**, see the cross-item note), evaluated **after**
  `pingRevalidateWebhook`, so written data and the site cache stay consistent. Today the storage-ratio
  exit at `run.ts:605` skips revalidation after the data has already been written; the same fix applies.

**Infrastructure**
- `SupabaseRunHistory`: I recommend **one `metrics jsonb` column on `pipeline_runs`**. That table is
  already one row per run and already written every run (`store.ts:130-137`). The per-store
  `pipeline_run` metric columns are a schema dead end. Keep `metrics` **out of** the anon view
  `pipeline_runs_public` (`20260416_secure_favorites_rls.sql:209-213`). (Tech Lead decision T2.)
- **Visibility channel at zero cost:** write `formatAlerts` to `$GITHUB_STEP_SUMMARY` and emit
  `::error::` / `::warning::` annotations. This finally wires `formatRunSummary`. GitHub already emails
  the actor when a run fails, so critical alerts become visible by failing the run.

**Rejected:** a metrics backend, OpenTelemetry, a pager integration. The collection design already rejected OTel for the same reasons.

## 2.5 TDD plan

**First failing tests:**

| Layer | Test |
|---|---|
| domain | `reports an instrument it could not read instead of staying silent — 8 of 9 rules were silently unevaluable` |
| domain | `a run is only "healthy and silent" when every instrument was measured` (replaces `:33-41`; the fixture helper must build `Measured` values explicitly) |
| domain | `run-slow fires below the step timeout — a threshold at the kill line can never be observed` |
| domain | `cache-hit-rate-low with no previous run says it could not compare, rather than nothing` |
| application | `buildRunSnapshot carries the halt reason out of classifyDeals — run.ts hard-coded halted: null` |
| application | `buildRunSnapshot computes published-data coverage from the collected offers — run.ts passed {}` |
| application | `classifyDeals reports invalid-category rejections — the graph dropped the reason` |
| application | `classifyDeals returns a halt produced by real accumulation, not a pre-exhausted budget` |
| application | `classify graph counts tier-1 tokens — recordSpend(budget, 0) made the token cap unreachable by classification` |
| application | `compares against the last successful run — previous was hard-coded null, so four rules could never fire` (in-memory `RunHistory`) |
| application | `an unreadable run history is reported as not-measured, never as "no previous run"` |

**Mutation tests:**
- Revert any single `buildRunSnapshot` field to a literal → its test goes red.
- Pass `previous: null` in `runPipeline` → the composition-root regression test goes red.
- Delete the `instrument-missing` branch → the first domain test goes red.
- Set `RUN_SLOW_MS = RUN_TIMEOUT_MS` → the threshold test goes red.

**Through the composition root (mandatory):** `runPipeline` with fakes:
(a) a history whose previous snapshot has 90% cache hits and a cache fake returning 10% → the outcome
contains `cache-hit-rate-low`;
(b) a classifier fake that exhausts the call budget → the outcome is `exitCode: 1`, **and the revalidate
fake was still called**, **and** `1` is not the retryable code.
This is the only test that would have caught all three reported claims at once.

## 2.6 Blast radius, risks, decisions

**Blast radius:** `alerts.ts` types (all alert tests change), `classify-deals.ts` stats, `classify-graph.ts`
`Outcome`, `run.ts` restructure, one migration (`pipeline_runs.metrics`).

**Risks:**
- **Turning alerts on will fail runs that pass today.** First runs will show `instrument-missing` for
  macro-F1, and possibly noisy `cache-hit-rate-low`. I recommend **one cycle in report-only mode**
  (compute, save, annotate, never fail), the same pattern as `COLLECTION_MODE=shadow`, and only then
  enable the exit. (Tech Lead.)
- **Do not make `exit(1)` reachable before Item 1's exit-code split lands**, or a critical alert triggers a full re-fetch.

**Decisions:**
- **P5 (PM).** How is "the pipeline stopped" detected? GitHub disables scheduled workflows after 60 days
  without activity, so any watchdog *in this repo* goes down with it. The options are an external free
  dead-man's switch (a new third-party account, zero cost), or accepting the visitor-facing stale banner
  (`web-next/src/lib/format.ts:16-17`) as the only detector.
- **P6 (PM + Tech Lead).** What should `benchmarkMacroF1` measure: live Denner offers (free), or the
  fixed 291-row benchmark re-classified with the cache bypassed (costs about 12 tier-1 calls a run, plus judge calls)?
- **P7 (PM).** Confirm that a critical alert should fail the run (red X plus GitHub email to the actor), and that the email reaches you.
- **T2 (Tech Lead).** `pipeline_runs.metrics jsonb` vs the per-store `pipeline_run` columns.

---

# Item 5 — Paid-LLM guardrails

## 5.1 Symptom and verdict

**Reported:** `CLAUDE.md:162` says "Zero paid services … No paid LLM", but OpenRouter (the `gpt-5-nano` judge) is a deliberate paid PM decision.

**Verdict: CONFIRMED.** `CLAUDE.md:162` is stale. The judge is wired whenever `OPENROUTER_API_KEY` is set
(`run.ts:364-370`), and the workflow passes that key (`pipeline.yml:196`). The same stale premise is repeated in three places that shape agent behaviour:
- `pipeline.yml:194-195`: *"Judge (tier 2). Not yet wired"*. **False.**
- `alerts.ts:177`: *"this pipeline should be free"*.
- `guardrails.ts:127-129`: *"Should never be approached on free tiers; this is the backstop for the case where someone points it at a paid model **by mistake**"*.

The same text also appears at `docs/data-source-research-2026-09-07.md:663` and `docs/tech-stack-v3-validation.md:6`.

### Inventory: every call site that can spend money or quota

| # | Call site | Provider | Money / quota | Existing limits | Missing |
|---|---|---|---|---|---|
| 1 | Startup probe `probeModels(TIER1_CHAIN)` (`run.ts:306`, `model-probe.ts:29-40`) | Gemini | quota, 1 call a run | 15 s timeout (`model-probe.ts:27`); stops at the first live model (`:83`) | no `maxOutputTokens` (trivial prompt) |
| 1b | `probeOpenRouter` (`model-probe.ts:42-58`) | OpenRouter | would be money | `max_tokens: 5` (`:51`), **the only `max_tokens` in the codebase** | **never called in production**: `JUDGE_CHAIN` is never probed |
| 2 | Tier-1 classifier (`gemini-classifier.ts:74-106`, wrapped at `run.ts:347-356`) | Gemini | quota; money **only if the Google project has billing** | batch 25 (`run.ts:353`); pacing to 90% of 15 requests/min (`resilience.ts:195`); 3 attempts per batch (`:87-91`); circuit after 5 failures (`:217`); 60 s timeout (`:247`); `COLD_START_LIMIT` 800 products (`run-plan.ts:75`) | tokens reported via `onUsage` (`gemini-classifier.ts:98`), but `run.ts` never passes `onUsage`, and the graph records **0 tokens** (`classify-graph.ts:164`); no `maxOutputTokens`; rate state lasts one process (`resilient-classifier.ts:72`) |
| 3 | **Judge** (`gemini-judge.ts:48-59, 69-93`) | **OpenRouter, `openai/gpt-5-nano`, PAID** | **money** | sequential; 60 s timeout; judge rate 1/4 on cold start (`run-plan.ts:90`); **`mayEscalate` stops at 80% of `maxCalls` 500 = 400 calls** (`guardrails.ts:125, 165-167`), **per attempt** | **no `max_tokens`, no reasoning-effort cap** (`gemini-judge.ts:56`) on a reasoning model; no rate limiter; no circuit breaker; **tokens recorded as 0 on any error** (`:87-89`); no price known anywhere; no monthly or cross-run cap |
| 4 | Reflector (`gemini-judge.ts:103-164`) | Gemini | quota | runs only on judge-"wrong" items; `mayEscalate` | not paced; **shares tier-1's per-minute quota** without the limiter knowing |
| 5 | Enricher per chunk (`classify-deals.ts:130-145`, `gemini-enricher.ts:78-116`) | Gemini | quota | batch 15 (`:25`); off on cold start (`run-plan.ts:133`) | not paced; tokens **logged but not counted** against any budget (`classify-deals.ts:138-140`); this is HANDOVER item 6's 429s |
| 6 | Enrichment **backfill** (`classify-deals.ts:463-491`) | Gemini | quota | chunks of 100 | **no per-run cap**: bounded only by how many cached products lack attributes (up to the whole corpus) |
| 7 | Workflow retry (`pipeline.yml:219`) | all of the above | multiplies everything | 2 attempts, 45 min each | each attempt starts with a fresh budget (`ZERO_SPEND`) and fresh rate state |
| 8 | GitHub Actions minutes | GitHub | quota (money only if a spending limit > $0 is set on a private repo) | 45 min × 2 on the transform, plus 8 matrix jobs | **INFERRED risk:** `tech-stack-v3-validation.md:6` implies a private repo (2,000 min/month). Worst case 3 runs/week × ~100 min ≈ 1,300 min/month before CI and dispatches. |

### What is unbounded today

Real-world units throughout. Prices are from `component-2-agent-design.md:923` and OpenAI's
published pricing: **$0.05 per M input tokens, $0.40 per M output tokens, 128,000 max output tokens**.
OpenAI bills reasoning tokens as output tokens.

1. **Tokens per paid call: unbounded** (up to 128,000 output tokens, because there is no `max_tokens`).
   The 60 s timeout does **not** bound the bill: for a non-streamed request the provider can finish and
   bill after we disconnect, and we then record **0** tokens (`gemini-judge.ts:87-89`).
   Worst case: **≈ $0.051 a call**. Realistic: ~1k in + ~0.3-1.5k out ≈ **$0.0002-0.0006 a call**.
2. **Paid calls per month: unbounded.** The 400-call ceiling is per **process attempt**. Attempts per
   month = 3 crons/week × 2 attempts + unlimited dispatches and re-runs. Worst case per attempt ≈
   400 × $0.051 ≈ **$20**. No month-level ceiling exists in our code.
3. **Money: not measured at all.** `rappen` has no producer (`guardrails.ts:151`, never passed), so
   `maxRappen: 500` (`:129`) **can never trip**, and `alerts.ts:173` is fed a literal 0. **The only real
   money ceiling today is the OpenRouter account balance**, plus whatever auto top-up setting the PM has,
   which is unknown to me.
4. **Judge escalation spike:** a "warm" run is any run with a hit rate ≥ 0.3 (`run-plan.ts:93, 109-121`),
   so a run with **70% misses** (~1,100 products) judges **every** product (`judgeSampleRate: 1`) until
   the 400-call stop. A partial cache failure (up to `MAX_UNREADABLE_KEYS` = 200 products, HANDOVER §3) or
   a new retailer lands here.
5. **Cold start after a version bump:** bounded per run (800 products, judge 1/4 ≈ 200 calls). It spans ~3 runs, and each run can retry.
6. **Retry storm:** judge failures are not retried (good), but there is no circuit breaker. A slow 5xx
   OpenRouter means 400 × 60 s ≈ **6.7 h** of sequential timeouts, which exceeds the 45-minute step,
   triggers a retry, and repeats. That costs time and CI minutes, not money.
7. **Gemini "free":** the code *assumes* the free tier (`resilience.ts:160-166`). If billing is ever
   enabled on that Google project, tier 1, the reflector and the enricher become paid silently, with
   tier-1 tokens recorded as 0 and the enricher's not counted at all.

## 5.2 Root cause

1. *Why can a run spend without limit?* There is no per-call token cap, no cross-attempt or monthly cap, and no money measurement.
2. *Why?* `Budget` (`guardrails.ts:110-130`) is a plain literal object built on the premise *"should never be approached on free tiers"*. Its money dimension has no producer, because no model has a price. Its scope is a process attempt (`classify-deals.ts:283, 383`). It is not injectable: `classify-deals.ts:24` imports `FREE_TIER_BUDGET` directly, so the composition root cannot even set it.
3. *Why didn't approving a paid judge change that?* The decision was implemented as wiring (`run.ts:364-370`) and never converted into an enforced constraint. The constraint itself stayed in prose (`CLAUDE.md:162`), which now contradicts the code, and in workflow comments that are false (`pipeline.yml:194-195`).
4. **Root cause:** **the money constraint was never a domain invariant.** It lived in prose and in a free-tier-shaped `Budget` whose money field nothing feeds. When the premise flipped from "nothing is paid" to "one thing is paid", nothing in the code could notice, because the price of a model is not a concept the code has. If a paid model **could not be selected without a price**, and **could not be called without a reservation against remaining money**, this could not recur for the next paid model either.

## 5.3 Why existing tests did not catch it

- `classify-graph.test.ts:137-150`: the budget is only ever tested **pre-exhausted**. No test shows spend accumulating from real calls, so tier-1 recording 0 tokens and rappen never being recorded both go unnoticed.
- `alerts.test.ts:124-126` *"warns when a free pipeline starts spending money"*: feeds `rappenSpent: 250` by hand. The unit works; nothing produces the input. It also encodes the stale premise in its name.
- `gemini-judge.test.ts:135-149` *"the OpenRouter judge sends an abort signal"*: asserts the signal, not the body. No test asserts `max_tokens`. Contrast `model-probe.ts:51`, where the one call that has it is never run in production.
- `run-plan.test.ts:103-109`: the `spent` parameter is tested; production passes `ZERO_SPEND`.
- `run-plan.test.ts:58-61` *"records the judge chain with the measurement that justified it"*: asserts accuracy notes, not price. The registry has no price field to assert.
- No test reads `CLAUDE.md` or `pipeline.yml` comments. The stale prose was only caught when an agent produced a wrong finding (HANDOVER item 5).

## 5.4 Proposed guardrails (DDD)

The layering follows the rule "the domain decides, the adapter waits" already used in `resilience.ts:17`.

### Domain (`transformation/domain/spend.ts`, pure)

- **`UsdMicros`** value object: an integer number of micro-dollars, ≥ 0, finite. *Why USD:* OpenRouter meters and caps in USD. Converting to CHF would add an exchange rate that nobody keeps current. (Currency is decision P8.)
- **`ModelPrice`** value object: `{ inputPerMTok: UsdMicros, outputPerMTok: UsdMicros }`.
- **`ModelSpec` gains `billing: { kind: 'free-tier' } | { kind: 'paid'; price: ModelPrice; maxOutputTokens: number }`**,
  built only through `createModelSpec`. **Invariant: an OpenRouter model not ending in `:free` must be
  `paid`, with a price and a positive `maxOutputTokens` no higher than the model's limit.**
  `selectModel` (`model-registry.ts:102`) refuses a paid spec without them. So the next paid model cannot
  arrive the way this one did.
- **`SpendBudget`**, which replaces `Budget` / `FREE_TIER_BUDGET`. It is built with
  `createSpendBudget({ remainingThisPeriod: UsdMicros, maxPerRun: UsdMicros, price, maxInputTokens, maxOutputTokens })`.
  **Invariant: `allowedPaidCalls = floor(min(remainingThisPeriod, maxPerRun) / worstCaseCallCost)`, and
  it is derived, never configured.** A call cap that contradicts the money ceiling therefore cannot exist.
  It returns `err` if a single worst-case call does not fit.
- **`Reservation`** (a branded type only `SpendLedger.authorise` can create) and **`SpendLedger`**
  (immutable): `authorise(): Result<Reservation>` reserves the **worst case before** the call;
  `settle(reservation, usage | 'unknown')` records the actual cost. **Invariant: a call whose usage is
  unknown (error or timeout) is settled at the worst case, never at 0.** You can check before spending,
  but you cannot un-spend.
- **Port signature:** `Judge.judge(request, answer, reservation: Reservation)`. A paid call without a
  budget check **does not compile**. The compiler does the wiring that the "correct unit nothing wires
  up" defect keeps missing. It is one branded type, not a framework.

### Application

- **`classifyDeals` receives the `SpendBudget` as a dependency.** Delete the direct import at `classify-deals.ts:24`; the composition root owns it.
- **At run start, `run.ts` asks the port `SpendAccount.remaining(): Promise<Result<UsdMicros>>`.**
  This uses what already exists before building anything new: OpenRouter's own `GET /api/v1/key` returns
  `limit`, `limit_remaining` and `usage_monthly`. The provider's ledger is the source of truth, and it is
  correct across attempts, re-runs, dispatches and laptops **without** our own spend table. That closes
  unbounded point 2 and the retry-reset interaction.
- **If the account is unreadable, or reports no provider-side limit, run without the judge**
  (`judge: null` is already supported, `run.ts:364-370`). Emit a loud `instrument-missing` or
  `spend-unguarded` alert. Classification is unaffected. Money fails closed, the product fails open.
  (Decision P10.)
- **Stats return `paidCalls`, `usdSpent` and `judgeSkippedForBudget`**, which feed Item 2's
  `RunSnapshot`. Rename `rappenSpent` → `usdMicrosSpent`. Replace `spend-unexpected` with
  **`spend-near-ceiling`** (warning at, say, 80% of the monthly allowance) and **`spend-unguarded`**
  (critical: a paid call was possible without a provider cap).
- **Wrap the judge in the existing circuit breaker** (`resilience.ts:225-237`): a 402 or 401 opens it
  after one failure, and 5 consecutive failures open it for the run. That closes unbounded point 6.
- **Pace the reflector and the enricher through the same per-model rate state as tier 1**, so one
  limiter sees all Gemini calls, and cap the backfill per run. These are free-tier quota measures
  (HANDOVER item 6); they share the machinery.

### Infrastructure

- **Judge adapter:** send `max_tokens` from `billing.maxOutputTokens` on every call, and use
  provider-reported usage (prompt and completion tokens, and OpenRouter's reported cost where available;
  verify the usage-accounting field against the API before relying on it). **Calibrate `max_tokens`
  from measured usage, not taste.** With reasoning models the cap includes reasoning tokens, so too low
  a cap yields an empty answer, `unavailable`, and a silently unjudged product. `judgeUnavailable`
  (`classify-deals.ts:82`) must feed an alert.
- **`OpenRouterSpendAccount`** adapter for `GET /api/v1/key`, going through `model-http`'s bounded
  request primitive (a GET variant) so it keeps the "no unbounded call" property.

### Provider side (manual PM actions, the only guardrail that survives our own bugs)

1. **OpenRouter:** use a **dedicated key** for CI with a **credit `limit` = the monthly ceiling** and
   **`limit_reset: monthly`**. OpenRouter returns **402** when it is reached. Turn **auto top-up off**.
2. **Google:** confirm the project behind `GOOGLE_AI_API_KEY` has **no billing account attached**. That
   makes "free" a hard wall (429) rather than an invoice.
3. The code then **checks that step 1 happened**: `SpendAccount` reports `limit: null` → no judge.

### Workflow

- `concurrency` group (from Item 1), so two runs cannot spend at once.
- Pass the ceiling as a repository variable (`PAID_LLM_MONTHLY_CEILING_USD`), validated at the boundary
  into `UsdMicros`. **Its value is the PM's (decision P8)**, and it must not exceed the provider-side key limit.

**Rejected as over-engineering:** a billing service, our own spend table (the provider already keeps
one), per-product cost attribution, currency conversion.

### Proposed replacement for `CLAUDE.md:162`

> - **One paid service, capped; everything else free.** GitHub Actions free tier, Supabase free 500 MB,
>   Vercel Hobby, and Gemini on the **free tier** (the Google project behind `GOOGLE_AI_API_KEY` must have
>   **no billing account**). The **only** paid dependency is **OpenRouter** (`openai/gpt-5-nano`, the
>   classification *judge*), approved by the PM on `<DATE>`, capped at **USD `<CEILING>` per month**.
>   The cap is enforced three ways: (1) the CI key's own OpenRouter credit limit, monthly reset, auto
>   top-up off (a PM-owned setting); (2) `SpendBudget` in `transformation/domain/` refuses any paid call
>   that would exceed the remaining monthly allowance, and a paid call cannot be made without a
>   `Reservation`; (3) every paid call sends an explicit `max_tokens`. Adding a paid service, or raising
>   the cap, is a PM decision recorded in an ADR. **No paid unblocking proxy, ever.** That is a legal
>   line, not a budget one (see "Never circumvent" above).

Update in the same change: `pipeline.yml:194-195`, `alerts.ts:177-178`, `guardrails.ts:127-129`,
`docs/data-source-research-2026-09-07.md:663`, `docs/tech-stack-v3-validation.md:6`.

## 5.5 TDD plan

**First failing tests:**

| Layer | Test |
|---|---|
| domain | `refuses a paid model without a price — the judge has been paid since 2026-09-10 and nothing knew its price` |
| domain | `refuses a paid model without max output tokens — the judge call had no max_tokens` |
| domain | `derives the paid-call allowance from the remaining money — a call cap cannot contradict the ceiling` |
| domain | `reserves the worst case before a call and settles the actual usage after` |
| domain | `settles a failed call at the worst case — the judge recorded 0 tokens on any error` |
| domain | `refuses to build a budget when one worst-case call exceeds what is left this month` |
| infrastructure | `sends max_tokens on every judge call — the only max_tokens in the codebase was the unused probe's 5` (asserts the request **body**) |
| infrastructure | `reads remaining credit and the provider-side limit from the key endpoint` |
| infrastructure | `reports the spend account as unreadable, not as zero remaining, when the endpoint fails` |
| application | `a retried attempt starts from the money already spent this month — attempt 2 used to reset to ZERO_SPEND` |
| application | `stops judging when the allowance is used up and reports how many went unjudged` |
| application | `runs without the judge when the key has no provider-side limit` |
| application | `the judge circuit opens on 402 — out of credit is not a transient` |
| type | `// @ts-expect-error — a judge call without a Reservation does not compile` |

**Mutation tests:** remove `max_tokens` from the body → red. Settle unknown usage at 0 → red.
Initialise from `ZERO_SPEND` instead of `SpendAccount` → the "retried attempt" test goes red.
Make `allowedPaidCalls` a constant → the "derives from money" test goes red. Delete the `limit: null`
branch → "no provider-side limit" goes red.

**Through the composition root (mandatory):** `runPipeline` with a fake `SpendAccount` reporting exactly
**3 × worst-case call cost** remaining, a counting judge fake, and 10 cache misses. Assert **exactly 3
judge calls**, 7 `judgeSkippedForBudget`, snapshot `usdMicrosSpent ≤` remaining, and a
`spend-near-ceiling` alert. Run it twice to simulate a retry and assert the **total** is still 3.

## 5.6 Blast radius, risks, decisions

**Blast radius:** `guardrails.ts` (the `Budget` replacement touches `classify-graph.ts`, `run-plan.ts`
and `classify-deals.ts` and their tests), `model-registry.ts`, `gemini-judge.ts`, a new `spend.ts`, a
new adapter, `run.ts`, `alerts.ts`, `CLAUDE.md`, two docs.

**Risks:**
- **Judge coverage falls when money runs out.** The judge catches ~25% of errors with 0% false alarms
  (`classify-graph.ts:9-10`). A tight ceiling means more unjudged products and a quieter review queue.
  This is visible in `judgeSkippedForBudget`, and it is the PM's trade-off to make.
- **Changing judge behaviour invalidates its measurement.** A `max_tokens` cap, or a lower reasoning
  effort, can change the judge's verdicts. The 25% / 0% numbers were measured without either. **Re-run
  the 291-row benchmark before shipping the cap.** (Decision P11.)
- **An extra network call at run start** (the key endpoint). Its failure only disables the judge.

**Decisions:**
- **P8 (PM).** The monthly ceiling, **left as a parameter** `<CEILING>`, and its currency (USD recommended, because the provider enforces in USD). Also the per-run share, if any.
- **P9 (PM, manual).** Set the OpenRouter CI key's credit limit, monthly reset and auto top-up off. Confirm the Google project has no billing. Confirm whether the repo is private (Actions minutes).
- **P10 (PM).** When the spend account cannot be read, or the key has no provider-side limit: run without the judge (recommended), or proceed?
- **P11 (PM + Tech Lead).** Accept a re-benchmark of the judge before capping `max_tokens` or setting reasoning effort.

---

## Suggested order of work

1. **Item 1: exit codes and `retry_wait_seconds` (60 s).** Small, and it removes the retry-refetch coupling that Item 2 would otherwise trigger.
2. **Item 5: provider-side caps (P9).** These are manual PM actions with no code, and they bound the money today.
3. **Item 1: ledger + cadence** (after P1 and P2).
4. **Item 2: `buildRunSnapshot` + `NotMeasured` + `RunHistory`**, one cycle report-only, then enable the exit.
5. **Item 5: `SpendBudget` / `Reservation` / `SpendAccount` + `max_tokens`** (after the P11 re-benchmark).
6. **`CLAUDE.md:162` replacement** and the five stale comments, in the same change as step 5, so the prose describes enforced code.

Every step extracts or uses `runPipeline(deps)`, the test seam `run.ts` has never had. That one refactor
is what makes "test through the composition root" (HANDOVER §4) possible at all.

## Sources (external facts used)

- nick-fields/retry inputs (`retry_on`, `retry_on_exit_code`, `new_command_on_retry`): https://github.com/nick-fields/retry
- GitHub re-runs and artifacts (community discussion; not verified for this repo): https://github.com/orgs/community/discussions/17854
- OpenRouter per-key credit limits, 402 on exhaustion, `GET /api/v1/key` fields: https://openrouter.ai/docs/api_reference/limits
- OpenRouter resettable key limits (daily, weekly, monthly): https://x.com/OpenRouterAI/status/1983226306104885293
- gpt-5-nano pricing and max output: https://developers.openai.com/api/docs/models/gpt-5-nano (also `docs/component-2-agent-design.md:923`)
