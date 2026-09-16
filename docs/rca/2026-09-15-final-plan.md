# Final build plan: HANDOVER §8 items 1, 2, 5–10

**Author:** Tech Lead agent · **Date:** 2026-09-15 · **Status:** ready for builders. No code was changed in writing this plan.

**Supersedes the build orders in:**
- `2026-09-15-architect-items-1-2-5.md`
- `2026-09-15-tech-lead-items-6-9.md`
- `2026-09-15-tech-lead-review-of-architect.md` §6
- `2026-09-15-architect-review-of-tech-lead.md` §C

Those files remain the evidence.

**Working rule until WP-J3 lands:** **no dispatch-driven debugging.** Between 11 and 14 September, dispatch
runs caused 15 of the 25 full collections. Verify through the composition-root tests and fixtures, not live
runs.

---

## Part 1: Decisions log

### 1.1 PM decisions (final, baked in, not re-opened)

| Id | Decision | Lands in |
|---|---|---|
| AP-1 | "One fetch per store per week" means **one fetch per publication**. ALDI and Volg twice a week (Mon + Thu), every other retailer once. Never refetch a publication. CLAUDE.md wording updated. | WP-J1–J3 |
| AP-2 | Max **2 attempts per publication** for transient failures (timeout, 5xx). **Never** retry after a refusal (403, robots). | WP-J2 |
| AP-3 | **Retire** the legacy aktionis matrix job | WP-P4 |
| AP-5 | Out-of-band dead-man's switch (healthchecks.io free tier). The code pings a URL from a GitHub secret; if the secret is absent it logs a warning and does not fail. | WP-0, WP-P3 |
| AP-7 | Critical alerts **fail the run immediately** (no report-only week). The exit-code split lands first. | WP-P3 then WP-P7 |
| AP-8 | Ceiling **USD 5 per month** | WP-0, WP-P8 |
| AP-10 | Spend account unreadable, or key has no provider limit → run **without the judge**, with a loud alert | WP-P8 |
| AP-11 | Re-benchmark the judge (291 rows, under USD 1) before capping tokens. Approved within the USD 5. | WP-P8 |
| TP-6 | **Keep** the Storage facet visible | none (WP-P9 makes it fill) |
| TP-7a | **Publish** Migros "ab 2 Stück" prices with a visible "from 2 items" label | WP-C4, WP-W4 |
| TP-7b | **Leave** current Migros offers live. The parser fix is prioritised. | WP-C1 starts first in its lane |
| TP-8 | aktionis' appended text: identity only. Keep the full product name (vintage, shade), **strip** the appended descriptor. Do not display it; do not feed it to the classifier. | WP-C3 |
| #3 | Remove "Pick a starter pack to make this personal." from `worth_picking_up.subtitle_cold_start` in en/de/fr/it | WP-W1 (**already done in the working tree, uncommitted**) |
| #4 | Done (key moved to local `.env`) | none |
| #5 | Rewrite `CLAUDE.md:162` with the USD 5 cap and three-layer enforcement, **in the same change as the spend guard** | WP-P8 |
| #10 | Future-dated deals: **show** them with a "from `<weekday> <date>`" label, and **exclude** them from today's cheapest-store verdict until they start | WP-P1, WP-W2, WP-W3 |
| TP-10 | Member-only prices (Lidl Plus etc.): **listed with their label, but do not vote** in the verdict and cannot be "Cheapest" (same rule as future-dated and multi-buy). Decided by PM 2026-09-15. | WP-W2 |
| #10b | The 292 current-week ALDI/LIDL/SPAR rows swept on 14.9 are **not** restored by hand (they expire 16.9). | none |
| Ship | Each WP is committed **and pushed** to `main` as soon as the Code Reviewer reports zero open findings. | all |

**Not decided by the PM, so not built:**
- AP-4 (audited forced re-fetch): WP-J3 ships **no** `force_refetch` input.
- AP-6 (what the classifier-quality metric measures): the field stays `not-measured`, which is a warning,
  never a failure.

### 1.2 Tech Lead rulings on the Architect's escalations

**D1: Gate placement. The Architect's placement is adopted, with one boundary rule.**
One `ModelGate` per (provider, model) lives in **infrastructure**, as a **required argument of `postJson`**.
Its decisions stay pure in the domain (`resilience.ts`, plus `spend.ts` later).
- I proposed an application-level decorator at the port. The Architect showed why that is wrong: one
  `enrich()` port call makes 20–36 HTTP calls inside the adapter (`gemini-enricher.ts:78-116`). A port-level
  gate therefore reproduces the exact scope mismatch that caused item 6.
- `postJson` is already the single choke point, with a build-failing test against direct `fetch`
  (`model-http.ts:15-16`). Making the gate impossible to omit there, like the timeout (`:35`), turns "every
  model call is gated" into a property of the code, not a habit.
- **Boundary rule (mine):** the gate owns **transport and quota** concerns only: rate, `Retry-After`,
  circuit, in-flight limit, spend. **Content** concerns stay in the adapter: truncation, unparseable output,
  answer completeness. Otherwise the gate would need to understand every provider's response body.
- `resilientClassifier`'s rate and retry loop is retired into the gate; `guardClassifier` stays.
- This supersedes my review's "required constructor argument", because the `postJson` choke point is
  strictly stronger. It also supersedes both reports' per-call `Reservation`: reservation happens inside
  the gate.

**D2: `QuantityRequirement` as a separate concept. Adopted.**
- `PriceBasis` is defined as *who* may pay (`price-basis.ts:1`); "from 2 items" is *how many*.
- A union would make "Lidl Plus price, from 2 items" unrepresentable. Two independent value objects model
  two independent facts, with no special case.
- It enters `offerKey`, so a multi-buy price never dedupes against the single-item price.
- It gets a storage column (a migration, and a one-way-ish door, hence an ADR).
- **Verdict treatment (a technical ruling that follows the PM's own #10 principle, flagged for PM
  information):** a conditional price is **listed with its label but does not vote** in the category
  verdict and cannot be the "Cheapest" card. That is the same "listed but does not vote" rule the code
  already applies to uncertain deals (`algorithm.ts:21-26`). One boolean, reversible.

**D3: `attributes_version` plus a per-item enricher outcome. Adopted, replacing my `attributes_enriched_at`.**
- The Architect found the failure my design invited. If "enrichment ran" sets a timestamp, a 429'd batch
  is marked done and **never asked again**. That swaps "re-ask forever" for "never ask", and the second is
  worse because it is silent.
- A version also expresses "enriched under schema 1, now schema 2" without bumping the cache key's
  `schemaVersion`. That bump would force a classification cold start (HANDOVER §5).
- The enricher port returns `stated(attrs) | statedNothing | failed(reason)` per item. Only the first two
  set the version.

**D4: Truncation → split and retry; unparseable → one retry; neither counts toward the circuit. Adopted.**
- My "permanent" rested on the premise that temperature 0 is deterministic. The project measured the
  opposite (`alerts.ts:13-15, 48-55`: 16 errors one run, 18 the next).
- Truncation is length-driven, so an identical retry is pointless, but **half the batch** is a different,
  shorter request. Bisect at most twice (25 → 13 → 7). Below that, hold the products back **with the reason
  recorded**.
- Unparseable output gets one retry.
- Neither says anything about provider health, so neither counts toward the circuit breaker.

**D5: `OfferSource.editionFor(date): Edition` + `fetchOffers(edition)`. Adopted, replacing my
`fetchOffers(asOf)`.**
- The enforcement point (the ledger) must know **which publication** *before* it fetches.
- My version hid that inside the adapter. The Architect's exposes it as a domain value while the calendar
  knowledge ("Migros weeks start Thursday") still lives in the ACL.
- It is the **single source of "which publication"**, and it removes the cadence table.
- **Semantics (mine, to make it testable):** `editionFor(date)` returns the publication **in effect** on
  `date`. Upcoming publications are not pre-fetched. Where one publication carries a later-starting cycle
  (ALDI's Monday cycle, Volg's fresh section), those offers arrive future-dated and are handled by #10's
  label and verdict rule.
- **Evidence the builder must record:** on Mon 14.9 the ALDI catalogue carried both the 17.9 and 21.9 cycles
  (live: 70 + 57 offers). If both cycles always arrive in one catalogue, the Monday "cycle-edition" is
  already covered by the Thursday fetch. The ledger then records it as covered and makes **no second
  network fetch**, which is what "never refetch a publication" (AP-1) requires. **This implements the PM's
  rule; it does not re-open it.** The builder reports the observed publication facts per retailer in the
  WP-J1 ADR.

**D6: The Architect's extra requests. All adopted.**
- **Per-retailer price grid:** `printedDiscount(p, { priceStepRappen })`, declared by each ACL (Migros and
  Coop 5; Lidl 1, because of 1.49). Applied **only to printed** discounts, with boundary tests at each
  fixture's cheapest real price. The low-price looseness is documented as a backstop behind tile geometry.
- **Coop truncation guard in three parts:**
  - `isDisplayTruncated(name)` in the shared kernel, next to `normalizeProductName`.
  - A **runtime** guard: more than 5% truncated names from one source makes it degraded, and it feeds the
    alert snapshot.
  - A dedupe rule: two offers with display-truncated names and different `sourceUrl`s are never merged.
  - Also: `offerKey` uses `normalizeProductName` (one definition of name identity, HANDOVER §5).
- **aktionis appended text:** not in `sourceDescriptor`, **stripped** (TP-8).
- **Also adopted:**
  - `postJson` surfaces OpenRouter's `Retry-After` (today it is dropped, `model-http.ts:83-90`).
  - One definition of the step timeout (config test against `pipeline.yml`).
  - Per-call judge token logging.
  - Gemini `maxInFlight = 1`, with the test "backfill does not begin until the last classification chunk
    has finished".
  - Cache only `uncertain` outcomes that **carry a classification**.
  - `findValidity` prefers the "Angebote gelten" line.
  - A hand-verified golden master for Migros.
- **The Architect's D6 ("only Migros is affected" is unproven) was right.** See #10: LIDL, SPAR and ALDI were
  fetched a week early *and* this week's rows were swept.

**T1 (amended from my review): exit codes 0 / 75 / 1, with a final-attempt flag.**
- Verified in `nick-fields/retry` (`index.ts:96-98, 116-120, 147`): with `retry_on_exit_code: 75`, **a timeout
  is not retried**.
- The action also supports `new_command_on_retry` (`index.ts:80-82`). So:
  - **Attempt 1:** at the in-process deadline (35 of 45 min), persist and `exit 75`, so it is retried.
  - **Attempt 2** runs `PIPELINE_FINAL_ATTEMPT=1`: at the deadline it publishes everything classified or
    cached, defers the rest with a `run-deferred` warning, and exits 0.
  - Transient infrastructure failures (Supabase or cache unreadable) → 75. Deterministic failures, bugs and
    critical alerts → 1.
  - The step timeout remains a hang backstop only.
- **This makes the exit-code split independent of the judge speed-up**, so it can land first, as the
  Architect and AP-7 require. It preserves today's resume-on-retry behaviour exactly, without relying on
  timeout retry.

**T2: `pipeline_runs.metrics jsonb`, append-only, one row per phase.** Unchanged from my review.
- `pipeline_runs_public` lists its columns explicitly, so `metrics` is never exposed to anon readers.
- The per-store `pipeline_run` table is left untouched and marked deprecated in the ADR.

**Ledger (amended by D5):**
- Key: **(retailer, publication)**, not fetch week.
- **No offers payload in the database** (mine). Offers move collect job → artifact → transform job within a
  run. Re-processing an old run is an explicit `reuse_run_id`, which makes zero fetches.

**Schedule (new, Tech Lead, reliability):** replace the Mon/Tue/Thu crons with **one daily cron**.
- Monday's cron started 5 h 26 min late, and Tuesday's had not started by 09:19 UTC. A skipped Thursday
  would leave five retailers with no current publication until Monday.
- Once the ledger exists, a daily run with nothing due makes **zero fetches** and costs about a minute of
  free (public-repo) Actions time.
- This is how "one fetch per publication" and "never miss a publication" both hold.

**Reconciling AP-7 with AP-10:**
- A critical alert fails the run (AP-7).
- "Run without the judge and raise a loud alert" (AP-10) must therefore be a **warning**, delivered loudly
  (`::warning::` annotation + step summary + healthcheck log). Otherwise every run with an unreadable spend
  account would fail, which contradicts "run without the judge".
- The same applies to `run-deferred` and `instrument-missing`.

**New observation (PM information, not blocking):** member-only prices (Lidl Plus) currently **vote** in
the category verdict. `algorithm.ts` has no `priceBasis` check. By D2's logic they arguably should not.
Logged as **TP-10** for the PM; not built.

### 1.3 RCA: item #10, future-dated deals

**Symptom (live, 2026-09-15):** 283 of 1,523 deals have `validFrom` after today. **Worse than reported: ALDI
0 of 127, LIDL 0 of 74 and SPAR 0 of 76 deals are in effect today.** Every one of them is next week's
(ALDI 17.9 ×70 and 21.9 ×57; LIDL 17.9 ×74; SPAR 17.9 ×76; plus Volg 16.9 ×6). **Three of seven retailers
have no valid-today offer on the site.**

**Five whys:**
1. **Why is next week's flyer the only one shown?** Monday's run (34833209176) fetched next week's
   LIDL/SPAR/ALDI flyers (the run's ISO week, items 1 and 7). Then
   `Deactivated 316 stale deals (aldi=143, lidl=80, spar=69, …)`. `deactivateStaleForStores` switches off
   every active row of a refreshed store with `updated_at < runStart`, **whatever its validity**
   (`store.ts:182-195`). "Not refreshed by this run" was read as "withdrawn by the retailer", but here it
   meant "superseded by a newer, not-yet-started publication".
2. **Why do future deals count as current in the UI?** No component reads `validFrom`. The category verdict
   (`algorithm.ts`), the "Cheapest" card (`filter-deals.ts:251-269`, highest discount wins), the
   "Only at X" badge (`filter-deals.ts:215`) and the database view `concept_cheapest_now`
   (`20260427_v3_concept_layer.sql:267`, feeding "Worth picking up") all filter on `valid_to` only.
3. **Why only `valid_to`?** The only date rule ever written is CLAUDE.md's "date filter safety net"
   (`:83`, `:227`, `.gte('valid_to', today)`). That is half a validity window, copied verbatim into
   `supabase-provider.ts:174` and the view.
4. **Why was half enough before?** Under the legacy source (aktionis) every listed deal was already running,
   and each per-store job fetched on the retailer's start day. **"Collected ⇒ in effect" held by
   construction of the source**, so no start-date rule was ever needed. The 2026-09-11 cutover moved to the
   retailers' own flyers, which are published up to 1–2 weeks early (research Part 2: Lidl "~1 week
   lookahead", ALDI "2 weeks lookahead"). Nothing encoded the assumption, so nothing noticed it break.
5. **Why did nothing encode it?** The pipeline's `ValidityPeriod` value object has both ends, but
   `web-next` cannot import across the project boundary (`lib/deal-attributes.ts` explains the Turbopack
   rule). So the web's `Deal` is a flat row with two strings and no "in effect" concept. The sweep's pure
   module decides *which stores* (`stale-sweep.ts:66-75`), never *which rows*. The row predicate lives in
   `store.ts`, with no validity awareness.

**Root cause:** "in effect" (`valid_from ≤ today ≤ valid_to`, Zurich date) was never a predicate anywhere,
not in the web and not in the sweep. The source used to guarantee it.

**Why tests missed it:** every web fixture has a past `validFrom` (`algorithm.test.ts:26`,
`filter-deals.test.ts:30`). No test ever had a not-yet-started deal. The sweep tests assert store
selection, never row selection. Also, `today` is the **UTC** date (`supabase-provider.ts:159`), two hours off
the Swiss day boundary in summer.

**Fix:**
- **Pipeline (urgent):** scope the sweep to the publication windows written this run (WP-P1).
- **Web:** one `isInEffect` predicate and a Zurich `today`. "From" labels. Not-yet-started deals do not
  vote, cannot be "Cheapest" and do not decide "Only at" (WP-W2). The same predicate is applied to the
  materialized views (WP-W3).
- **Legal:** the Art. 3(1)(e) UWG exposure (prices not valid today presented as current) closes with WP-W2.
  The data-loss half closes with WP-P1.
- Restoring the swept current-week rows by hand is possible (they expire 16.9). I recommend **not** doing it;
  the value is one day. That is the PM's call if wanted.

---

## Part 2: Work packages

**Conventions for every package:**
- builder → code-reviewer → zero open findings → merge.
- **Every new guard is mutation-tested:** reintroduce the defect, confirm red, restore.
- At least one test **goes through the composition root** once WP-P2 exists.
- Tests are named after the real defect they prevent.
- **MIG** = needs a Supabase migration. **ADR** = needs an ADR in `docs/decisions/`.

### Parallel lanes (no shared source files between lanes)

| Lane | Owns | Sequence |
|---|---|---|
| **P: pipeline core** | `pipeline/run.ts`, `run-pipeline.ts`, `composition.ts`, `pipeline.yml`, `store.ts`, `transformation/**` | P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → J3 |
| **C: collection** | `pipeline/collection/**`, `pipeline/storage/domain/{offer-to-unified,deal-row}.ts`, `storage/infrastructure/write-enrichment.ts`, `shared/types.ts`, `ocr.py` | C1 → C2 → C3 → C4 → J1 → J2 |
| **W: web** | `web-next/**` | W1 → W2 → W3 → W4 (W4 also waits for C4) |
| **Manual** | none | WP-0, now |

- **`CLAUDE.md`** is edited by three packages, each in a **different section**: W2 (date rule), P8 (`:162`),
  J3 (one-fetch rule). Merge them one after another, never in parallel on the same section.
- **Migrations** are separate files. Number them in merge order.
- **One lane-ownership exception:** WP-P4 edits `collection/application/collection-mode.ts`. No lane-C package
  touches that file, so there is no conflict; it is listed so reviewers are not surprised.
- **Critical path:** P1 (urgent) → P2 → P3 → P4 → P5.
- C1 and W1 start **today**, alongside P1.

---

### WP-0: Manual PM actions (no code) — now

1. OpenRouter: a dedicated CI key with credit **limit USD 5**, `limit_reset: monthly`, **auto top-up off**.
   **Blocks P6** (concurrency raises the spend rate) **and P8.**
2. Confirm the Google project behind `GOOGLE_AI_API_KEY` has **no billing account** (so free is a hard 429
   wall).
3. Create a healthchecks.io check (period 1 day, grace 1 day, once the daily cron lands; until then period 3
   days). Add its ping URL as the GitHub secret `HEALTHCHECK_PING_URL`.
4. Read the OpenRouter activity page: actual USD and tokens per judge call since 2026-09-10. Hand the p99 to
   P8.
5. **Permission to delete** `pipeline/aktionis/` and `pipeline/coop/` after P4 has read them (the user's
   "read before delete" rule).

---

### Lane P: pipeline core

**WP-P1: Sweep scoped to the publication window (URGENT, #10)**
- **Goal:** a newer publication never switches off offers still in effect.
- **Files:**
  - `pipeline/storage/domain/stale-sweep.ts` (+ `.test.ts`): a new pure `sweepWindows(writtenRows) → Map<store, Set<validFrom>>`.
  - `pipeline/store.ts` (`deactivateStaleForStores` gains a windows argument and adds `.in('valid_from', …)` per store) + `store.test.ts`.
  - `pipeline/run.ts` (call site only).
- **First failing tests:**
  - `a next-week flyer does not deactivate this week's deals — run 34833209176 deactivated aldi=143, lidl=80, spar=69 and left 0 offers in effect`
  - `a deal that vanished from the same publication window is still swept`
- **Mutation:** drop the `valid_from` scope → the first test goes red.
- **Depends on:** none. **Parallel with:** C1, W1. **MIG/ADR:** no.

**WP-P2: Composition root extraction (behaviour-preserving)**
- **Goal:** the test seam `run.ts` never had.
- **Files:** `pipeline/run.ts` (becomes a thin shell), new `pipeline/run-pipeline.ts` (`runCollect`,
  `runTransform`, `runPipeline`), new `pipeline/composition.ts` (`createProductionDeps(env)`), new
  `run-pipeline.test.ts`.
- **First failing tests:**
  - `a full run through the composition root stores what the fake sources returned — run.ts had zero tests`
  - `the root wires classifier, reflector, judge and enricher from env — nothing built inline`
  - **Carried forward from WP-P1** (code review 2026-09-15, accepted as non-blocking there because
    `run.ts` had no test seam): `live counts are read BEFORE storeDeals — a post-write count makes the
    sweep guard permissive` (mutation: move `activeCountsByWindow()` back below `storeDeals()` → red).
- **Mutation:** skip `storeDeals` inside `runTransform` → red.
- **Depends on:** P1. **Parallel with:** C1–C3, W1–W3.

**WP-P3: Exit contract, deadline, dead-man ping (T1, AP-5; prerequisite for AP-7)**
- **Files:**
  - `run-pipeline.ts` (exit mapping: revalidate before any non-zero exit, fixing `run.ts:605`).
  - `transformation/application/classify-deals.ts` (deadline check before each chunk).
  - `transformation/domain/run-plan.ts` (deferral reason).
  - `transformation/domain/resilience.ts` (**one** timeout definition).
  - New `pipeline/observability/healthcheck-ping.ts`.
  - `.github/workflows/pipeline.yml`:
    - `retry_on_exit_code: 75` and `new_command_on_retry` with `PIPELINE_FINAL_ATTEMPT=1`
    - `retry_wait_seconds: 60`
    - `concurrency: { group: deal-pipeline, cancel-in-progress: false }`
    - `HEALTHCHECK_PING_URL`
    - fix the comments at `:11, :194-195, :212-215`
- **First failing tests:**
  - `attempt 1 at its deadline persists and exits 75 — with retry_on_exit_code set a timeout is never retried (nick-fields index.ts:147)`
  - `the final attempt at its deadline publishes what it has and exits 0 with run-deferred`
  - `an unreadable cache exits 75; a storage-ratio failure exits 1 and still revalidates`
  - Config test: `RUN_DEADLINE_MS < timeout_minutes in pipeline.yml`
  - `a missing HEALTHCHECK_PING_URL warns and never fails the run`
- **Mutation:** map the deadline to exit 1 → red. Remove revalidate-before-exit → red.
- **Depends on:** P2. **Parallel with:** C, W.

**WP-P4: Retire the legacy aktionis matrix (AP-3)**
- **Files:** `pipeline.yml` (the `fetch-deals` job, the artifact download and list steps),
  `run-pipeline.ts` (remove `legacyCounts` / `compareCollection` / the `safeToCutOver` fallback),
  `collection/application/collection-mode.ts` (live-only).
- Delete `pipeline/aktionis/` and `pipeline/coop/` **only with WP-0 #5 permission**.
- **First failing tests:**
  - Config test: `the workflow has no aktionis job — it fetched Coop twice per run (124 legacy jobs since 09-11)`
  - `a live run reads no *-deals.json`
- **Mutation:** restore the artifact read → red.
- **Depends on:** P3 (`pipeline.yml`). **Parallel with:** C, W.

**WP-P5: `ModelGate` (D1) — ADR**
- **Files:**
  - `transformation/infrastructure/model-http.ts` (gate as a required argument; surface `Retry-After` and the status).
  - New `transformation/infrastructure/model-gate.ts`.
  - `transformation/domain/resilience.ts` (`ModelCallPolicy`; `rate-limited-short` obeys `retryAfter` up to 90 s).
  - `transformation/domain/model-registry.ts` (rpm, rpd and `maxInFlight` per spec; Gemini 1).
  - `gemini-classifier.ts`, `gemini-enricher.ts` (one summary line per phase), `gemini-judge.ts` (the reflector **logs** failures).
  - `model-probe.ts`.
  - `resilient-classifier.ts` (rate and retry removed; the guard kept).
  - `composition.ts`.
- **First failing tests:**
  - `classifier, reflector and enricher share ONE Gemini quota — backfill fired ~250 requests in 20 s, 255×429 (run 34833209176)`
  - `obeys Google's retryDelay of 57s instead of cutting it to 30s` (rewrite `resilient-classifier.test.ts:114-133`)
  - `reads OpenRouter's Retry-After header — postJson dropped it`
  - `a reflector failure is logged, not swallowed`
  - `backfill does not begin until the last classification chunk has finished`
  - Architecture test: `no model call can be made without a gate` (extends `model-http.test.ts`)
- **Mutation:** give the enricher its own gate → the first test goes red. Restore `Math.min(…, maxDelayMs)` → the second goes red.
- **Depends on:** P2. **Parallel with:** C, W.

**WP-P6: Judge concurrency + classifier content guards + caching uncertain (item 9, D4)**
- **Files:**
  - `transformation/application/classify-graph.ts` (judge node: bounded `Promise.all` through the gate;
    order preserved by index; sampling applied before dispatch; the ledger is read from the gate rather than
    a loop variable; `Outcome.failure`).
  - `classify-deals.ts` (cache `uncertain` **with** a classification; stats by failure kind).
  - `gemini-classifier.ts` (`finishReason`; bisect on truncation, depth ≤ 2; one retry on unparseable).
  - `classification-prompt.ts` (completeness).
  - `resilience.ts` (content failures do not count toward the circuit).
- **First failing tests:**
  - `judges at most 4 at once through the gate — 100 sequential judgements took ~1,000 s`
  - `a MAX_TOKENS batch is split and retried, never three identical calls, never opens the circuit`
  - `a batch whose answers skip indices reports the missing products with a reason`
  - `an uncertain outcome that carries a classification is cached; a provider-failure uncertain is not`
- **Mutation:** unbounded concurrency → red. Retry the full batch on truncation → red. Drop the `classification !== null` filter → red.
- **Depends on:** P5, **WP-0 #1**. **Parallel with:** C, W.

**WP-P7: Run journal + alerts that fail the run (item 2, T2, AP-7) — MIG + ADR**
- **Files:**
  - Migration: `pipeline_runs.metrics jsonb` + `CHECK (jsonb_typeof(metrics)='object')`.
  - `transformation/domain/alerts.ts` (`Measured<T>`, `instrument-missing`; `run-slow` / `run-deferred`
    derived from the deadline; in-process `pipeline-stale` removed; stale "should be free" text fixed).
  - New `transformation/application/run-snapshot.ts` (`buildRunSnapshot`).
  - New `transformation/infrastructure/supabase-run-history.ts`.
  - `run-pipeline.ts`: a critical alert gives `exitCode 1`, evaluated **after** revalidation. Also
    `$GITHUB_STEP_SUMMARY` + annotations, and `createJsonTelemetry` wired.
  - `store.ts` (report **collapsed** separately from **rejected**; write metrics).
- Coverage compares only retailers **collected in both** runs ("not due" is not "shape changed").
  macro-F1 stays `not-measured` (AP-6).
- **First failing tests:**
  - The Architect's §2.5 list.
  - `a run that stored 400 deals is not "✅ no alerts" (run 34652857097)`
  - `a collapsed duplicate is not a failed write — "48 failed" were collapses`
  - `a budget-exhausting run exits 1, still revalidates, and 1 is not the retryable code`
- **Mutation:** revert any snapshot field to a literal → red. Pass `previous: null` → red.
- **Depends on:** P3 (the exit split first, per AP-7) and P6 (stats fields). **Parallel with:** C, W.

**WP-P8: Spend guard (item 5, AP-8/10/11, #5) — ADR**
- **Pre-step, in the same package:**
  - One call with `max_tokens: 50` to measure whether reasoning tokens are bounded via OpenRouter (the docs
    say they do not count toward `max_tokens`).
  - The AP-11 re-benchmark (291 rows) at the chosen `max_tokens` and `reasoning.effort`.
- **Files:**
  - New `transformation/domain/spend.ts` (`UsdMicros`, `SpendLedger`: reserve at dispatch, settle from
    `usage.cost`, unknown → WP-0 p99 × 2, never 0).
  - New `transformation/infrastructure/openrouter-spend-account.ts` (`GET /api/v1/key`: `limit`,
    `limit_remaining`, `usage_monthly`).
  - `model-gate.ts` (spend policy).
  - `gemini-judge.ts` (`max_tokens` + `reasoning.effort`; per-call token logging).
  - `model-registry.ts` (registry test: every paid model has a price and `maxOutputTokens`).
  - `alerts.ts` (`spend-near-ceiling`, `spend-unguarded` as **warnings**).
  - `composition.ts` (no judge when unreadable or `limit: null`).
  - `CLAUDE.md:162` (the Architect's replacement text, USD 5).
  - Stale texts at `pipeline.yml:194-195` and `guardrails.ts:127-129`.
- **First failing tests:**
  - `a retried attempt starts from the money already spent this month — attempt 2 reset to ZERO_SPEND`
  - `settles a call with no reported cost at the p99 bound, never 0`
  - `runs without the judge and warns when the key has no provider limit (AP-10)`
  - `sends max_tokens and reasoning.effort on every judge call` (asserts the request body)
  - `effective concurrency never lets reservations exceed what remains`
  - Composition root: `3 × allowance → exactly 3 judge calls across two invocations`
- **Mutation:** settle unknown at 0 → red. Start from `ZERO_SPEND` → red.
- **Depends on:** P5, P7, **WP-0 #1, #4**. **Parallel with:** C, W.

**WP-P9: Enrichment completion (item 6, D3) — MIG + ADR**
- **Files:**
  - Migration: `product_classification_cache.attributes_version SMALLINT NULL`.
  - `shared/attribute-schemas.ts` (`CURRENT_ATTRIBUTE_SCHEMA_VERSION`).
  - `transformation/domain/classification-cache.ts` (the `Enrichment` union; `needsEnrichment` reads the version).
  - `gemini-enricher.ts` (per-item outcome).
  - `classify-deals.ts` (backfill paced through the gate, stopping at the deadline; `stats.enrichment`).
  - `supabase-classification-cache.ts`.
- **First failing tests:**
  - `a product whose name states nothing is enriched once, not re-requested every run`
  - `a rate-limited product is still owed next run — never marked done`
  - `backfill stops at the deadline and carries the rest forward`
  - `"backfilled 0/100" raises a warning, it is not success`
- **Mutation:** set the version on a failed item → red. Revert to an emptiness test → red.
- **Depends on:** P3, P5, P7. **Parallel with:** C, W. **Note:** `shared/attribute-schemas.ts` is lane-P-only
  (lane C touches `shared/types.ts`, a different file).

---

### Lane C: collection

**WP-C1: Migros parser correctness (item 7 b–e; prioritised per TP-7b)**
- **Files:** `collection/infrastructure/migros/migros-flyer-source.ts` (+ test), `issuu-fetcher.ts`,
  `ocr.py` (+ `test_ocr.py`), `collection/infrastructure/live-sources.ts` (`createMigrosSource`: pass bytes,
  real page numbers).
- **Scope:**
  - Tile geometry: nearest price above; name bounded to the tile.
  - `DESCRIPTOR` covers `gültig`, `ca.`, `Sonderpackung`, `erhältlich`, `Zucht aus`, `Wildfang`, `z.B.`.
  - Inline `X statt Y` (parsed; publishing waits for C4) and whole-franc `14.--`.
  - Per-offer `gültig vom … bis …`, and `findValidity` prefers "Angebote gelten".
  - Funnel counts plus a 50%-of-anchors yield guard.
  - Fetch once.
- **First failing tests:**
  - `a name comes from the offer's own tile — "Schweinsbraten vom Hals" 1.50, not "OptigalPouletgeschnetzeltes"`
  - `the sale price is the nearest above its statt line — Spiesse 2.85 statt 4.30, not 1.90`
  - `a weekend offer "gültig vom 10.9. bis 13.9." keeps its own window — it was live on 15.9` (rewrite `:72-74`)
  - `a weekend line on page 2 does not become the flyer-wide window`
  - `"statt 14.--" is 14.00`
  - A **hand-verified** golden master of the KW36 pp. 2–5 triples.
  - `OCR page numbers are the flyer's even when a page is skipped`
  - `a run converting 29% of anchors is below expected yield`
- **Mutation:** tallest-price sort → red. Remove the right bound → red. Flyer-wide validity → red.
- **Depends on:** none. **Parallel with:** P1–P9, W.

**Known residuals from WP-C1** (code review 0bc55e0, accepted as non-blocking — both would
*withhold* a valid offer rather than publish a wrong one, and both surface in the Migros funnel
counts, so a second real flyer will show whether they bite):
- The sale-price height ratio of 1.8× could drop a genuine offer printed in a smaller secondary
  price block; it appears as `noDisplayPrice`. Consider 1.5× **and logging the nearest rejected
  candidate**, once a second flyer's funnel says whether it happens at all.
- The multi-buy label's 12%-of-height search band could withhold a valid offer on a denser row
  layout; nearest-anchor-wins would tighten it.

**WP-C2: Discount consistency in rappen, per-retailer grid (D6)**
- **Files:** `collection/domain/discount.ts`, `collection/domain/offer.ts` (consistency call), the
  `printedDiscount` call sites in all seven adapters (each declares `priceStepRappen`).
- **First failing tests:**
  - `1.20 statt 1.85 at a printed 33% is consistent — Migros rounds to 5 rappen`
  - `4.30 → 1.90 at 33% is still rejected`
  - `Lidl's 1-rappen grid does not widen Lidl's tolerance`
  - A before/after acceptance count on every committed fixture.
- **Mutation:** apply the grid to derived discounts → red. A universal 5 for Lidl → red.
- **Depends on:** C1 (Migros file). **Parallel with:** P, W.

**WP-C3: Coop full names + truncation guard (item 8, TP-8, D6)**
- **Files:**
  - `collection/infrastructure/coop/coop-aktionis-source.ts` (+ test; copy the April 51-card fixture into
    `coop/__fixtures__/`).
  - `shared/types.ts` (`isDisplayTruncated`, beside `normalizeProductName`) + the shared tests.
  - `collection/domain/offer.ts` (`offerKey` uses `normalizeProductName`; never merge truncated names with
    different `sourceUrl`s).
  - `collection/domain/offer-source.ts` (>5% truncated → degraded).
  - The port-contract test.
- **Scope:** the full name comes from `title="Mehr Infos über …"`, cross-checked against the h3 prefix. The
  appended ` – <type>, <country> (<volume>)` is **stripped**: not stored, not displayed, not classified.
- **First failing tests:**
  - `keeps both Soave Classico vintages (2024, 2025) — aktionis truncates them to one title` (replaces `:108-111`)
  - `four L'Oréal shades stay four offers`
  - `the aktionis appended descriptor never reaches the name, the descriptor, or the classifier`
  - `a source serving >5% truncated names is degraded`
  - `no adapter emits a display-truncated name`
- **Mutation:** revert to the h3 → red. Remove the dedupe rule → red.
- **Depends on:** C2 (`offer.ts`). **Merge gate:** after **P6** is in production (it adds about 300 one-time
  misses). **Parallel with:** P, W.

**WP-C4: `QuantityRequirement` (D2, TP-7a, pipeline side) — MIG + ADR**
- **Files:**
  - New `collection/domain/quantity-requirement.ts` (`single | minimum(n ≥ 2)`).
  - `offer.ts` (field; `offerKey` includes it).
  - `migros-flyer-source.ts` (emits `minimum(2)` for "ab 2 Stück").
  - `storage/domain/offer-to-unified.ts`, `storage/domain/deal-row.ts`,
    `storage/infrastructure/write-enrichment.ts`.
  - `shared/types.ts`.
  - Migration: `deals.min_quantity SMALLINT NULL`.
- **First failing tests:**
  - `a multi-buy price never dedupes against the single-item price`
  - `a minimum below 2 cannot be constructed`
  - `"ab 2 Stück 3.02 statt 4.50" is published as minimum(2), never bare`
- **Mutation:** drop the field from `offerKey` → red.
- **Depends on:** C1, C3. **Parallel with:** P, W1–W3.

**WP-J1: Editions: `editionFor(date)` on the port (D5, items 1 and 7a)**
- **Files:** new `collection/domain/{edition,iso-week}.ts`, `collection/domain/offer-source.ts` (port:
  `editionFor`, `fetchOffers(edition)`), all seven adapters (each declares its publication calendar),
  `live-sources.ts`, `live-sources.test.ts`.
- **First failing tests:**
  - `on Mon 2026-09-14 Migros's edition is KW37 — it asked for KW38 and got HTTP 404`
  - `on Mon 2026-09-14 Lidl's edition is the one in effect, not next week's — the site showed 0 Lidl offers in effect`
  - `every adapter builds its URL from the edition — the week argument was ignored by all seven`
  - `refuses a non-canonical week key`
  - `fetches the Lidl flyer JSON exactly once` (count, not `.some()`)
- **Mutation:** return the ISO week of the run date → red.
- **Depends on:** C4. **ADR:** the per-retailer publication facts (including ALDI/Volg per D5).

**WP-J2: Fetch ledger (items 1 and AP-2) — MIG + ADR**
- **Files:** new `collection/domain/fetch-policy.ts` (`decideFetch(edition, record) → fetch | skip | refuse`;
  max 2 attempts for transient failures, never after a refusal), `collection/application/collect-offers.ts`
  (consult, then record **per retailer as each finishes**; fail closed), new
  `collection/infrastructure/supabase-collected-editions.ts` (+ an in-memory adapter that honours the
  primary key, and a shared contract test). Migration: `collection_edition(retailer, publication, status,
  attempts, last_failure, last_run_id, collected_at, PRIMARY KEY (retailer, publication))`. No offers
  column. Service role only.
- **First failing tests:**
  - `never refetches a publication — 25 full collections in 4 days`
  - `a 403 is a refusal, never retried`
  - `a third transient attempt at one publication is refused`
  - `fetches nothing when the ledger cannot be read`
  - `records each retailer as it finishes`
  - `the in-memory ledger rejects a duplicate key exactly as Postgres does`
- **Mutation:** skip `decideFetch` → red. Record after the loop → red. Treat unreadable as empty → red.
- **Depends on:** J1.

**WP-J3: Collect/transform split + daily cron (lane P, after P9 and J2)**
- **Files:** new `pipeline/collect.ts`, `run-pipeline.ts`, `composition.ts`, `.github/workflows/pipeline.yml`,
  `CLAUDE.md`.
  - `pipeline.yml`: a collect job → artifact (serialised `Offer[]`, retention 7 days) → transform job
    (retry-safe, no retailer network); **one daily cron**; dispatch inputs `retailers` and `reuse_run_id`
    (**no `force_refetch`**, AP-4 undecided).
  - `CLAUDE.md`: the AP-1 wording "one fetch per publication; ALDI and Volg twice a week; never refetch a
    publication".
- **First failing tests:**
  - Composition root: `runCollect twice on the same date → transport calls per retailer = 1`
  - `the transform job rebuilds offers through createOffer and makes zero retailer requests`
  - `a Monday run that collects only ALDI and Volg does not sweep Coop`
  - `a daily run with nothing due makes zero fetches and exits 0`
  - Verify that a "re-run failed jobs" transform can read the original attempt's artifact.
- **Depends on:** P9 (lane-P files), J2, P4.

---

### Lane W: web

**Standing weakness found during WP-W3 review (own ticket, not blocking):** nine e2e assertions in
`web-next/e2e/v2-acceptance.spec.ts` (`:53, 96, 161, 197, 227, 242, 258, 323, 375`) are
`test.skip(count === 0, …)` / `test.skip(status >= 400, …)` against LIVE Supabase data. A page that
renders zero cards turns them green by skipping — **a test that cannot fail exactly when it matters
most**. WP-W2/W3 make this likelier to bite, because their whole purpose is that fewer deals
qualify. Fix shape: assert a minimum expected count (or fail on zero) instead of skipping, so an
empty site is a red run. Watch for it when reading any "46 passed / 14 skipped" line.

**WP-W1: Commit the #3 copy change (already in the working tree)**
- **Files:** `web-next/src/messages/{en,de,fr,it}.json` (`subtitle_cold_start` = first sentence only;
  `cold_start_cta` removed), `components/landing/WorthPickingUp.tsx`, `WorthPickingUp.test.tsx` (untracked).
- **Test:** `the cold-start subtitle no longer promises a starter pack in any locale`
- **Mutation:** restore the sentence in one locale → red.
- **Depends on:** none. **Parallel with:** everything.

**WP-W2: Validity in the web (#10) — small ADR ("in effect" vs "upcoming")**
- **Files:**
  - New `web-next/src/lib/domain/validity.ts` (`todayInZurich`, `isInEffect`, `startsAfterToday`).
  - `server/data/supabase-provider.ts` (the Zurich `today`).
  - `server/verdict/algorithm.ts` (not-yet-started deals do not vote).
  - `server/data/filter-deals.ts`: the "Cheapest" primary is chosen from in-effect deals only; if none, there
    is no "Cheapest" label. `onlyStoreSubCategories` counts in-effect deals only.
  - `components/deals/DealCard.tsx` (the "from `<weekday> <date>`" label).
  - `app/[locale]/deals/DealsClient.tsx`, `components/list/ListDrawer.tsx`, `lib/share.ts` (the label in
    list and share text).
  - `messages/*.json` (the label in 4 locales).
  - `CLAUDE.md:83, :227` (the date rule becomes "in effect = `valid_from ≤ today ≤ valid_to`, Zurich").
- **First failing tests:**
  - `a deal starting Thursday does not vote in today's verdict — ALDI, LIDL and SPAR voted with next week's prices`
  - `a not-yet-started deal is never labelled Cheapest`
  - `a not-yet-started deal shows "from Thu 17.9"`
  - `"today" is the Zurich date — 00:30 in Zurich is not yesterday`
  - `a not-yet-started Lidl deal does not break "Only at Coop"`
  - Fixture factories get a **future-dated** variant.
- **Mutation:** make `isInEffect` ignore `validFrom` → red. Use the UTC date → red.
- **Depends on:** W1 (messages). **Parallel with:** P, C.

**WP-W3: Materialized views honour validity (#10) — MIG**
- **Files:** migration (`concept_cheapest_now` exposes `valid_from` and filters
  `valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE`), `web-next/src/server/data/worth-picking-up.ts`
  (re-apply `isInEffect` on read, because a materialized view freezes `CURRENT_DATE` at refresh).
- **First failing tests:**
  - `"Worth picking up" never shows a deal that has not started or has expired since the last refresh`
- **Mutation:** remove the read-time filter → red.
- **Depends on:** W2. **Parallel with:** P, C.

**WP-W4: "From 2 items" label + verdict (TP-7a web side, D2)**
- **Files:** `lib/types.ts`, `server/data/supabase-provider.ts` (select `min_quantity`),
  `components/deals/DealCard.tsx`, `server/verdict/algorithm.ts`, `server/data/filter-deals.ts`,
  `messages/*.json`.
- **First failing tests:**
  - `a multi-buy price always shows "from 2 items" — never a bare conditional price`
  - `a conditional price does not vote and is never labelled Cheapest`
- **Mutation:** render without the label → red.
- **Depends on:** W3 (same files), **C4** (migration).

---

## Part 3: Timeline view

```
Today    WP-0 (PM)   P1 ──► P2 ──► P3 ──► P4 ──► P5 ──► P6 ──► P7 ──► P8 ──► P9 ──► J3
                     C1 ──► C2 ──► C3* ─► C4 ──► J1 ──► J2 ───────────────────────┘
                     W1 ──► W2 ──► W3 ──► W4 (needs C4)
          * C3 merges only after P6 is in production (about 300 one-time misses)
```

- **Urgency:**
  - **P1**: live data loss; 3 retailers have no offer in effect Monday to Wednesday.
  - **W2**: UWG, next week's prices shown as today's.
  - **C1**: wrong names and an expired offer are live.
  - All three start today, in three lanes.
- **Spend gates:** P6 (concurrency) and P8 cannot merge before WP-0 #1 (the USD 5 key cap).
- **One-fetch rule:** fully enforced at **J3**. Until then, P4 (legacy retired), P3 (concurrency group), P6 (no
  more attempt-1 timeouts, so no retry re-fetch) and the no-dispatch working rule remove about 90% of the
  excess fetches.
