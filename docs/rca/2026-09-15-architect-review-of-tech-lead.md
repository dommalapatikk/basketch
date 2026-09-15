# Architect review of the Tech Lead RCA (items 6–9)

**Reviewed:** `docs/rca/2026-09-15-tech-lead-items-6-9.md` · **Reviewer:** architect agent · **Date:** 2026-09-15
**Scope:** challenge only. No code, workflow or config was changed.
**Method:** every verdict below comes from reading the cited file at the cited line. I cannot check the
Tech Lead's log-derived numbers myself, because I have no shell. Where a verdict depends on them I say so,
and I judge only whether the reasoning from those numbers holds.

Verdicts use three words:

- **CONFIRMED** means the evidence holds and the fix is right as written.
- **WEAKENED** means the direction is right, but the reasoning or the design needs a change I name.
- **REJECTED** means I believe it is wrong.

## Orchestrator facts, and how they change the picture

| Fact (verified by the orchestrator) | Consequence |
|---|---|
| `COLLECTION_MODE = live` since 2026-09-11 | My item 1 path (b) is now **CONFIRMED**: every Mon, Tue and Thu cron fetches all seven retailers. The Tech Lead's 7.2(a) rests on the same mechanism. |
| Attempt 1 hit the 45-minute timeout in both "successful" runs (34833209176, 34718508157) | The Tech Lead's cross-cutting finding is **CONFIRMED**. **Every run so far has re-collected all seven retailers at least twice.** Item 1 is not a latent risk; it happens on every run. |
| `gultig vom10.9.bis13.9.2026` is live on 2026-09-15 | The Tech Lead's 7.1 UWG exposure is **CONFIRMED in production**. Two defects combine here (see 7-b below): the validity text became the product *name*, **and** the offer carries the flyer-wide window. |

---

## Verdict summary

| Item | Claim | Verdict |
|---|---|---|
| 6 | Root cause: the quota's scope is (project, model), but the limiter's scope is one port instance | **CONFIRMED** |
| 6 | Root cause: the retry cap overrides the provider's `retryDelay` | **CONFIRMED** |
| 6 | Root cause: "stated nothing" cannot be recorded, so the owed set never drains | **CONFIRMED** |
| 6 | Root cause: the reflect burst drains the bucket just before enrichment | **WEAKENED, and correctly labelled "probable" by the Tech Lead.** Their diagnostic-first test is the right move. |
| 6 | Fix: one quota gate per (provider, model) | **CONFIRMED in substance, WEAKENED on layering and granularity.** It should be merged with items 5 and 9 into one `ModelGate` (§A). |
| 6 | Fix: obey `retryDelay` up to a separate ceiling | **CONFIRMED.** Also: OpenRouter's `Retry-After` header is lost today (new finding). |
| 6 | Fix: `attributes_enriched_at` column | **WEAKENED.** It should be a version plus a per-item enrichment outcome, not a timestamp. |
| 6 | Fix: paced backfill with a time budget, and enrichment stats | **CONFIRMED**, provided the step timeout has one definition |
| 7 | Root cause: the ISO week is one ahead of the Migros week on Mon/Tue | **CONFIRMED.** The claim "only Migros is affected" is **WEAKENED**. |
| 7 | Root cause: parser geometry picks the tallest price, and the name search has no right bound | **CONFIRMED** |
| 7 | Root cause: inline multi-buy and whole-franc prices are not modelled | **CONFIRMED** |
| 7 | Root cause: the discount guard is in percentage points, not rappen | **CONFIRMED** |
| 7 | Root cause: blind by construction (no telemetry, floor of 10) | **CONFIRMED** |
| 7 | Latent: double image download; OCR page numbers are argv positions | **CONFIRMED, both** |
| 7 | Fix: `migrosFlyerWeek(runDate)` in the adapter or composition root | **WEAKENED.** It should be merged with my `Edition` design into a port method, `editionFor(date)` (§B). |
| 7 | Fix: tile-based geometry in the Migros anti-corruption layer (ACL) | **CONFIRMED.** That is the right layer. |
| 7 | Fix: rappen tolerance in `discount.ts` | **CONFIRMED with conditions**: parameterise the price step, apply it to printed discounts only, and add boundary tests |
| 7 | Fix: `MinimumQuantity(n)` as a `PriceBasis` variant | **REJECTED as placement; the concept is right.** It is a separate axis. |
| 7 | Fix: conversion guard (50% of anchors), per-offer validity, fetch once | **CONFIRMED** |
| 8 | Root cause: the ACL reads the truncated h3 | **CONFIRMED** |
| 8 | Fix: take the full name from `title=`, cross-checked against the h3 | **CONFIRMED** |
| 8 | Fix: put aktionis' appended text into `sourceDescriptor` | **REJECTED as written.** It breaks the provenance contract of `descriptor`. |
| 8 | Reject a domain invariant; use a port-contract test | **CONFIRMED that a *rejecting* invariant is wrong. WEAKENED that the contract test is "the system-level fix."** It needs a domain predicate plus a runtime guard plus a dedupe rule. |
| 8 | Fix: storage reports `collapsed` separately from `rejected` | **CONFIRMED** |
| 9 | Batch 25 → 100 refuted as a throughput lever | **CONFIRMED.** The reasoning holds; the numbers are the Tech Lead's. |
| 9 | Truncation would be misread as transient and silently held back | **CONFIRMED.** It is the same dropped-reason defect as my item 2. |
| 9 | Fix: `output-truncated` / `source-changed` become permanent | **WEAKENED.** It contradicts the project's own measured non-determinism, and truncation should split the batch. |
| 9 | Fix: bounded judge concurrency | **CONFIRMED with four conditions** (§A.4) |
| 9 | Fix: cache `uncertain` outcomes | **CONFIRMED with a caveat** |

---

## §A — One `ModelGate`: merging item 6's quota gate, item 9's judge concurrency and my item 5 `SpendBudget`

### A.1 Is the Tech Lead's layering right?

The Tech Lead puts the gate under "Application… owned by the composition root … `withQuota(gate, call)`."
Two corrections.

**1. The executor is infrastructure, not application.** The gate holds mutable state and sleeps. This
repo's precedent is explicit: decisions live in the domain (`resilience.ts:17`, *"No sleeping inside
the domain: this module DECIDES, the adapter waits"*), and the stateful waiter lives in infrastructure
(`resilient-classifier.ts`, under `transformation/infrastructure/`). An application-layer gate that sleeps
would breach the layering greps (`collection-module-design.md:189-191`, where the same rule is enforced
for collection). So the split is:

| Layer | Owns |
|---|---|
| **Domain** (pure) | `checkRate`, `decideRetry`, `recordFailure` (existing, `resilience.ts`); `SpendLedger.authorise/settle` (item 5); a `ModelCallPolicy` value object built from `ModelSpec` |
| **Infrastructure** | `createModelGate(policy, clock, sleep)`: the one stateful executor, holding rate, circuit, in-flight count and spend ledger |
| **Composition root** | Builds **one gate per (provider, model)** and injects it into every adapter for that model. It does not own the gate as "application logic". |

**2. The gate must sit at the HTTP call, not at the port.** The Tech Lead's `withQuota` is described as an
extraction of `resilientClassifier`'s loop, which today wraps the **port** (`resilient-classifier.ts:80-132`,
one `classify(batch)` per retry). That works for the classifier because one port call is one HTTP call.
It does **not** work for the enricher: one `enrich()` port call makes one HTTP call per sub-category
batch **inside** the adapter (`gemini-enricher.ts:78-116`). A port-level decorator would see one call
where Google sees 20–36, which reproduces the scope mismatch at a different level.

**Recommendation:** make the gate a **required argument of `postJson`** (`model-http.ts:60`), in the same
way `postJson` already makes a timeout impossible to omit (`:35`, *"There is deliberately no way to ask
for 'no timeout'"*). `model-http.test.ts` already fails the build if any infrastructure file calls
`fetch` directly (`model-http.ts:15-16`). Together that makes "every model call is gated" a property of
the codebase rather than a habit. The Tech Lead's composition-root test (§6.5, "≤13 per 60 s window
across all three ports") stays exactly as they wrote it.

### A.2 What the merged gate enforces

`ModelCallPolicy` is built only by `createModelCallPolicy(spec: ModelSpec)`. Its invariants are checked at construction:

| Concern | From | Invariant / rule |
|---|---|---|
| Rate | item 6 | `requestsPerMinute > 0`, taken from the spec, not from `KNOWN_LIMITS[inner.name]` (`resilient-classifier.ts:65`), so one limit per model is guaranteed by construction |
| Retry | item 6 | `rate-limited-short`: obey `retryAfterMs` up to `PROVIDER_WAIT_CEILING` (Tech Lead: 90 s), **not** `maxDelayMs` (`resilience.ts:124-126`) |
| Circuit | items 6 and 9 | existing `recordFailure`; 402 and 401 open immediately (402 = out of credit, from OpenRouter's limits docs) |
| Concurrency | item 9 | `maxInFlight ≥ 1`. **Gemini's policy is 1**, which keeps today's sequential behaviour and makes priority between callers unnecessary (see A.3). The judge policy is N (Tech Lead: 4). |
| Spend | item 5 | **paid ⇒ price and `maxOutputTokens` are required.** Before each call, `authorise()` reserves the **worst case** and fails if `remaining − Σ outstanding reservations < worstCase`. `settle()` records actual usage, or the worst case if usage is unknown. |

**This amends my own item 5 report (§5.4).** There I put a `Reservation` parameter on the `Judge` port.
With the gate required at `postJson`, the reservation moves **inside the gate**, so the port signatures do
not change. Enforcement is now at a single choke point that already has a build-failing test. The
invariants are the same; the change is smaller.

### A.3 Things the merge makes visible that neither report covered

- **OpenRouter's `Retry-After` is discarded today.** `postJson` throws `HTTP ${status}: ${body}` and drops
  the response headers (`model-http.ts:83-90`). `resilience.ts:100-102` claims *"OpenRouter [sends] a
  `Retry-After` header"* and that it always wins over our guess. For OpenRouter it can never be read.
  The gate needs `postJson` to surface `Retry-After` in the error. **This is required before judge
  concurrency ships**, because concurrency is exactly what provokes upstream 429s.
- **Priority between callers of one shared gate.** If Gemini calls ever become concurrent, a queued
  backfill could delay classification. Today every Gemini caller is sequential, so I recommend
  `maxInFlight = 1` for Gemini and **no priority mechanism yet** (YAGNI). Add one test:
  `backfill does not begin until the last classification chunk has finished`.
- **The step timeout has two definitions.** `RUN_TIMEOUT_MS = 45 min` (`resilience.ts:250`) duplicates
  `pipeline.yml:216`. The Tech Lead's time-budgeted backfill ("stop when the step has less than 10 min
  left") depends on that number. It needs a single source: pass it in via the environment from the
  workflow, or add a config test asserting the two are equal.

### A.4 Item 9 judge concurrency: interaction with the reservation (the question asked)

Judge concurrency is **CONFIRMED as the right lever**, with four conditions:

1. **Reserve at dispatch, not after the call.** Today spend is recorded *after* each sequential call
   (`classify-graph.ts:220-224`), and `mayEscalate` checks the post-call state (`:215`,
   `guardrails.ts:165-167`). With N calls in flight that overshoots by up to N−1 calls. Under the gate,
   **effective concurrency = min(N, ⌊(remaining − outstanding) / worstCase⌋)**, so N calls in flight times
   the worst case always fits what remains. With `max_tokens` set, the worst case is small (for example
   4k output tokens × $0.40/M ≈ $0.0016 a call), so money will rarely throttle concurrency. Without
   `max_tokens` the worst case is ~$0.05 a call, which is still safe for 4 in flight. It is only safe
   because it is *reserved*.
2. **Move budget accumulation out of the graph's sequential loop.** `classify-graph.ts:206-228` threads
   `budget` through a `for` loop into a replace-semantics LangGraph channel (`:100`). With `Promise.all`,
   the gate's ledger becomes the source of truth and the graph reads a snapshot from it. Outcome order
   must be preserved by index. `Promise.all` does that, and the sampling rule `i % Math.round(1/rate)`
   (`:211`) is applied before dispatch.
3. **Surface `Retry-After`** (A.3) before shipping.
4. **Do not ship concurrency before the provider-side OpenRouter cap is set** (my PM decision P9, a
   manual action). Concurrency leaves spend per product unchanged but raises the rate of spend. While
   `SpendLedger` does not yet exist, the provider cap is the only money bound.

**An alternative lever that neither report weighed:** ~10 s per judged product on `gpt-5-nano` suggests
a lot of reasoning tokens. The judge body sets no reasoning effort (`gemini-judge.ts:56`). Lowering the
effort could cut latency **and** cost, but it **changes verdict behaviour**, so it needs the 291-row
re-benchmark (my P11). Concurrency is **behaviour-preserving**: the same calls with the same prompts give
the same verdicts. So concurrency should come first. **Measure before choosing**: log
`usage.completion_tokens` (and the reasoning-token breakdown, if OpenRouter returns it) per judge call.
The Tech Lead's §9.4 already asks for token measurement on the classifier; extend it to the judge.

---

## §B — Reconciling `migrosFlyerWeek` with my `Edition` / fetch-week design

The two designs answer different questions, and one concept covers both:

- **Tech Lead:** *which* publication to request (correctness). `migrosFlyerWeek(runDate)` = the ISO week of
  the most recent Thursday.
- **Me (item 1 §1.4):** *whether* to fetch at all (courtesy and legal). An `Edition` keyed on the ISO week
  in which we fetched, plus a `COLLECTION_CADENCE` table.

**Merged design (this amends my item 1 §1.4):**

- **Add a method to the port: `OfferSource.editionFor(date): Edition`.** Each adapter declares its own
  publication calendar. "Migros weeks start Thursday" stays in the ACL, which is the Tech Lead's point,
  but it is exposed as a **domain value**. That is necessary because the application layer must know the
  edition **before** fetching in order to consult the ledger, which is my point. The Tech Lead's options
  ("the adapter *or* the composition root") both hide it from the one layer that enforces the rule.
- **`fetchOffers(edition)`.** The adapter builds its URL from the edition. This also fixes the defect I
  found: all seven adapters ignore the week argument (`fetchOffers(_week)`, e.g.
  `migros-flyer-source.ts:299`), and the real week is fixed when the source is built
  (`live-sources.ts:136, 228`).
- **The ledger key becomes (retailer, publication), not (retailer, fetch week).** "Due today" is then
  simply "a current edition not yet in the ledger", so **the separate cadence table is no longer needed.**
  On Mon 14.9, `migros.editionFor` returns KW37, which was collected on Thursday, so the adapter is
  skipped. Migros is never asked for the unpublished KW38 (the 404), and no images are downloaded
  (which removes the Tech Lead's "48 downloads" worry). On Thu 17.9 it returns KW38, which is new, so
  it is fetched.
- The ledger tracks `collected → stored`. A retry within the same edition processes editions that are
  collected but not yet stored, from the snapshot, and makes zero fetches.
- **My PM question P1 becomes mostly a factual question:** "Are ALDI's Thursday cycle and Volg's fresh
  section separate publications?" If yes, they are separate editions and the rule reads "one fetch per
  publication". The PM should still confirm that reading of the rule.

**The Tech Lead's condition ("the week fix must land with item 1's schedule") is CONFIRMED.** Under this
design they are literally the same change.

**The claim "only Migros is affected" is WEAKENED.** The Tech Lead reads Monday's `ok lidl 106 offers` for
KW38 as a sign Lidl is fine. It may instead mean **we published next week's Lidl prices early.** The
server data layer filters only on `valid_to` (`web-next/src/server/data/supabase-provider.ts:174`,
`.gte('valid_to', today)`). I found **no `valid_from ≤ today` filter** anywhere in `web-next/src`. So an
offer valid from Thursday would be shown on Monday as current. **Verify before accepting:** check the
live Lidl deals' `validFrom` on a Monday or Tuesday. If they are future-dated, that is an Art. 3(1)(e)
exposure of the same kind as the expired Migros offer, and it raises a PM question: hide future-dated
offers, or show them labelled "from Thursday"?

---

## Item 6 — detail

**Root causes 1–3 and 5: CONFIRMED.**
- The enricher skips on error with no retry (`gemini-enricher.ts:83-92`).
- Empty results are dropped (`:111-113`).
- Backfill re-saves only products that produced attributes (`classify-deals.ts:476-477`).
- `{}` is treated as owed (`classification-cache.ts:118-122`). Its own doc comment (`:110-115`) chose
  "re-ask" on the assumption that *"re-asking costs one batched call on a warm run"*. That assumption is
  falsified by 1,107 owed products per run.
- `Math.min(retryAfterMs, policy.maxDelayMs)` (`resilience.ts:125`) with `maxDelayMs: 30_000` (`:90`).
- The test asserts 30 s under the name "waits exactly as instructed" (`resilient-classifier.test.ts:114-118`, repeated at `:125-133`).
- The reflector and enricher use the classifier's model without its limiter (`run.ts:371-387`).

**Root cause 4 (reflect burst): WEAKENED, as the Tech Lead already labels it.** The reflector's silent
`catch` (`gemini-judge.ts:159-161`) makes it unprovable today. I agree with running the diagnostic test first.

**The `attributes_enriched_at` column: WEAKENED.** Additive, explicit state and no jsonb sentinel are all
right, and it deserves an ADR. But a timestamp answers "when", when the question is "is it done under the
current rules". Two problems:

1. **Schema evolution.** When an attribute is added to a sub-category's schema, every previously enriched
   product should be asked again. The only version available today is `schemaVersion`, **which is part of
   the classification cache key** (`classification-cache.ts:20-32, 60-62`). Bumping it forces a
   **classification cold start** (HANDOVER §5: *"never bump … casually"*). A timestamp cannot express
   "enriched under schema 1, now schema 2".
   → Use **`attributes_version INT NULL`**, independent of the cache key, with
   `needsEnrichment = attributes_version IS NULL OR attributes_version < CURRENT_ATTRIBUTE_SCHEMA_VERSION`.
   A timestamp may be kept alongside it for auditing.
2. **The opposite silent failure.** If the column is set whenever "enrichment ran", a batch that got a
   429 is marked done and **never asked again**. That swaps "re-ask forever" for "never ask", and it is the
   more dangerous of the two. The enricher port must return **a per-item outcome**, `stated(attrs) |
   statedNothing | failed(reason)`, and only the first two may set the version. The Tech Lead's stats
   (`statedNothing`, `rateLimited`, `failed`) imply this, but the port change is not stated. Make it
   explicit. The Map-only return type (`gemini-enricher.ts:30-33`) cannot carry the distinction.
   - Domain model: `Enrichment = { kind: 'owed' } | { kind: 'done'; version; attributes }` on `CachedClassification`.
   - **Mutation test:** set the version on a rate-limited batch → `a rate-limited product is still owed next run` goes red.

**Paced backfill with a time budget: CONFIRMED**, subject to A.3's single definition of the step timeout.

---

## Item 7 — detail

**(a) Week mismatch: CONFIRMED.** `run.ts:184-187` hands one `kw` to all sources (`live-sources.ts:136`),
and Migros builds its URL from it (`:228`). The fix is merged into §B. "Only Migros is affected" is WEAKENED (§B).

**(b) Geometry: CONFIRMED.**
- The "near" filter has only a horizontal bound (`migros-flyer-source.ts:151`).
- The sale price is the tallest price above in the column (`:154-156`), with no nearest-first rule.
- The name has a left bound only and "longest wins" (`:185-196`).

A compounding cause the Tech Lead mentions but does not connect: **`DESCRIPTOR` (`:75-76`) does not match
`gültig`/`gultig`, so the validity line itself wins "longest line" and becomes the product name.** That is
how `gultig vom10.9.bis13.9.2026` became an offer. It also exposes a **second latent defect**:
`findValidity` (`:116-123`) returns the *first* `vom … bis …` match anywhere in the flyer, and the
weekend line matches the same regex (`:106`). If a weekend line ever appears on an earlier page than the
flyer-wide line, **every** Migros offer gets the weekend window. The Tech Lead's per-offer validity fix
must also make `findValidity` prefer the "Angebote gelten …" line explicitly. Add one test:
`a weekend validity line on page 2 does not become the flyer-wide window`.

**Is tile geometry in the ACL the right layer? CONFIRMED.** OCR boxes, pixel heights and `statt` are
Migros vocabulary, and they die in the adapter. There is **no domain invariant that can catch a
mis-paired name**; the Tech Lead is right that a consistent price pair with the wrong name passes every
check. The golden-master triples test is therefore the guard, and it must be a hand-verified list, never
generated from the parser's output.

**Rappen tolerance in `discount.ts`: CONFIRMED with conditions.** The rule is
`|round(original × (1 − p/100)) − sale| ≤ 5 rappen`, OR the existing pp rule.

- **Sound:** the unit is real-world (rappen, as `Money` already is, `discount.ts:39`). The OR keeps
  every rejection the pp rule makes today. The three mis-pairs are 98, 414 and 185 rappen off, and would
  still fail.
- **Condition 1: the 5 is a retailer fact, hard-coded as universal.** Migros and Coop price on a
  5-rappen grid. Lidl does not: CLAUDE.md's own example is 1.49 / 1.39. A universal 5 is merely looser
  for Lidl, not wrong, but the number should be declared by the ACL that knows the grid:
  `printedDiscount(p, { priceStepRappen })`. The `Discount` value object then checks consistency against
  its own declared semantics. Retailer knowledge stays in the adapter and the invariant stays in the domain.
- **Condition 2: at low prices the rappen arm dominates.** At a CHF 0.50 sale price, 5 rappen is 10%
  relative, so a coincidental mis-pair within one step would pass. Acceptable only because the tile fix
  is the primary pairing guard and this invariant is a backstop. Say so in the constant's comment.
- **Condition 3:** apply it only to `provenance: 'printed'`. A derived discount needs no tolerance.
- The Tech Lead's measurement across all fixtures (before and after) is required. Add boundary tests at
  the cheapest real price in each fixture.

**`MinimumQuantity(n)` as a `PriceBasis` variant: REJECTED as placement.** The concept (a conditional
price must name its condition, and must never render bare) is exactly right. The placement is wrong:

- `PriceBasis` is defined as **"WHO can actually pay this price"** (`price-basis.ts:1`). "From 2 items"
  answers **how many**, not who. Ubiquitous language: the type's own definition excludes it.
- A union makes the two mutually exclusive, so it **cannot represent "Lidl Plus price, from 2 items"**.
- **Model instead** a separate value object on `Offer`:
  `QuantityRequirement = { kind: 'single' } | { kind: 'minimum'; n }`, with the invariant **n ≥ 2**
  enforced in the constructor.
- **Knock-on effects the Tech Lead's fix omits.** These are what make it a one-way-ish door:
  - `offerKey` must include it (`offer.ts:140-144`), or a multi-buy price dedupes against the
    single-item price, just as member prices were kept separate.
  - `UnifiedDeal` needs a new storage column.
  - `web-next/src/server/verdict/algorithm.ts` must not route a conditional per-unit price as if it were
    unconditional. **This is the product's core feature (cheapest store per item).**
- PM P7a stands. If the PM says "exclude", none of this is built.

**Conversion guard, per-offer validity, fetch-once, real page numbers: CONFIRMED.**
- The double download: `issuu-fetcher.ts:117-129` downloads every image, then `ocr.py:51-58` downloads it again.
- The page numbering: `ocr.py:123, 130` numbers pages by argv position, while `issuu-fetcher.ts:123-127` skips pages.
- "Accepted under 50% of detected anchors" is a real-world unit, exactly as HANDOVER §5 asks.

**P7b (withhold Migros until the golden master passes):** I endorse the Tech Lead's technical
recommendation. It is the PM's call.

---

## Item 8 — detail

**Root cause: CONFIRMED.** `mapCardToOffer` reads the `card-title` h3 (`coop-aktionis-source.ts:106`), and
the full name is on the same card. **The ACL fix (the `title=` text cross-checked against the h3 prefix,
falling back with a warning) is CONFIRMED.** It is zero extra requests, and the Soave / L'Oréal collisions
show why it matters for identity.

**Splitting the appended text into `sourceDescriptor`: REJECTED as written.**
- `ClassificationRequest.descriptor` is documented as *"the retailer's own free-text line … genuine
  published context … not something we inferred"* (`classifier.ts:16-20`).
- The text aktionis appends (`– Weisswein, Italien (0.75l)`) is **aktionis' own**, not Coop's. It is the
  same provenance problem for which the adapter deliberately sets `sourceCategory: null`
  (`coop-aktionis-source.ts:150-156`).
- Putting it in `descriptor` feeds a third party's labelling to the classifier under the name
  "retailer's own". Either:
  - drop it, and keep only what identifies the product (the vintage `(2025)` is part of the name and
    already survives), or
  - add a distinct, explicitly third-party provenance field.
- **Widen PM decision P8** from "may it be *displayed*" to "may it be *used at all*, including as
  classifier input".

**Port-contract test vs domain invariant:**
- **I agree with rejecting a *rejecting* invariant.** The Tech Lead's reasoning holds: if aktionis drops
  the `title` attribute, `createOffer` would drop ~300 real prices. That trades a naming defect for a
  missing-price defect.
- **WEAKENED on "the contract test is the system-level fix".** A contract test runs on **committed
  fixtures**. The scenario it exists for (aktionis changing its markup, so the fallback serves truncated
  names again) happens **live**, while the fixtures stay green. The proportionate guard has three parts:
  1. **A domain predicate, not an invariant.** `isDisplayTruncated(name)` belongs in the shared kernel
     next to `normalizeProductName`, so there is one definition. It is used by (2), (3) and the contract test.
  2. **A runtime guard.** More than *x*% truncated names from one source is `partially-parsed` / degraded,
     and it feeds the alert snapshot. The Tech Lead mentions "a truncated-name count in telemetry", but
     telemetry is unwired (their 7.2e, my item 2). An unread count is the defect class again.
  3. **A dedupe rule.** `dedupeOffers` must not merge two offers with **truncated** names whose
     `sourceUrl`s differ (`offer.ts:137-144` deliberately ignores `sourceUrl`, which is correct only for
     untruncated names). Then even the fallback path cannot silently drop a vintage.
- **Adjacent:** `offerKey` normalises names its own way (`offer.ts:141`), while storage dedupes with
  `normalizeProductName` (`store.ts:70-79`). That is two definitions of name identity, which violates
  HANDOVER §5. Collapses therefore happen at two layers under two rules, which contributes to the Tech
  Lead's 48 "failed". Unify them.

**Collapsed vs rejected in storage: CONFIRMED.** `run.ts:524-531` reports `resolved − stored` as a
"shortfall" at ERROR. **Sequencing after the judge fix: CONFIRMED.**

---

## Item 9 — detail

**"Refuted as a throughput lever": CONFIRMED.** The reasoning is sound: time is flat per *judged* product,
not per batch. The judge loop is sequential (`classify-graph.ts:208-228`), and warm runs judge every product
(`run-plan.ts:109-121`). The numbers are log-derived and I cannot re-check them, but the discriminating
row (Mon a2 c2: 37 products, 25 judged) is the right test, and the conclusion follows from it.

**The truncation trace: CONFIRMED.**
- `finishReason` is never read (`gemini-classifier.ts:35`, and no read site).
- `statusFrom` returns null, so the failure is classified `transient` (`resilience.ts:75`).
- `alignByIndex` has no completeness check (`classification-prompt.ts:264-273`).
- The missing items become `no-answer` and are then **held back with the reason dropped**
  (`classify-graph.ts:177-179`). **This is the same line as my item 2 root cause for
  `invalidCategoryRejected`.** One fix covers both: `Outcome` carries `failure: ClassificationFailure`,
  and stats count each failure kind. The two reports should reference each other there.

**Making `output-truncated` / `source-changed` permanent: WEAKENED.**
- The justification, *"retrying the same prompt at temperature 0 returns the same bytes"*, **contradicts
  this project's own measurement**: *"temperature 0 is NOT deterministic"*, 16 errors one run and 18 the
  next (`alerts.ts:13-15, 50-55`).
  - `output-truncated` is length-driven, so a retry of the same prompt will very likely truncate again.
    That makes "no identical retry" right. But the remedy is **split the batch and retry the halves**,
    not "permanent" (which holds back up to 25 products). And it must **not count toward the circuit
    breaker**: it says nothing about the provider's health.
  - `source-changed` (unparseable output): keep **one** retry, given the measured non-determinism, and
    don't count it toward the circuit.

**Judge concurrency: CONFIRMED with the four conditions in §A.4.**

**Caching `uncertain`: CONFIRMED, with a caveat.** Cache only uncertain outcomes that **carry a
classification** (judge-disputed or reflection-held). Never cache the provider-failure `uncertain` whose
classification is null. `persistChunk`'s `classification !== null` filter (`classify-deals.ts:126`) must
stay when `uncertain` is added. Accept that a cached `uncertain` is not re-judged until a version bump;
the human review queue is its resolution path (D3).

---

## §C — Sequencing: merged proposal (for the Tech Lead to decide)

Both reports put the same pressure on one 45-minute step. The orders are compatible:

0. **Today, PM only:** P7b (withhold Migros). P9 (OpenRouter key cap, auto top-up off, Google project with no billing).
1. **Workflow, tiny:** exit-code split + `retry_on_exit_code`, `retry_wait_seconds: 60`, `concurrency` group (my item 1).
2. **`ModelGate` (§A):** rate, retry obeying `retryDelay`, circuit, surfaced `Retry-After`, per-model
   concurrency. Then **judge concurrency and caching `uncertain`** (item 9) and the truncation guards
   (amended as above). Condition: P9 done first. This buys back ~50 minutes, as the Tech Lead says.
3. **Item 2's `buildRunSnapshot` + `NotMeasured`, report-only.** Every later fix (enrichment coverage,
   Migros funnel, truncated-name share, spend) reports through it. Without it they become more unread
   numbers.
4. **Item 6:** enrichment outcome port, `attributes_version` (ADR), paced backfill.
5. **Item 5:** `SpendLedger` / `SpendAccount` inside the gate, and judge `max_tokens` after the P11 re-benchmark.
6. **Ledger + `editionFor` (§B):** items 1 and 7(a) as one change.
7. **Item 8:** Coop full names.
8. **Item 7:** geometry, price forms, per-offer validity, rappen tolerance. `QuantityRequirement` only if P7a says publish.

## Amendments to my own report (`2026-09-15-architect-items-1-2-5.md`)

- **§1.4 is superseded by §B here.** The `COLLECTION_CADENCE` table and the fetch-week key are replaced by
  `OfferSource.editionFor(date)` and a (retailer, publication) ledger key.
- **§5.4 is superseded by §A here.** The `Reservation` moves from the `Judge` port signature into the
  gate, enforced by making the gate a required argument of `postJson`. The invariants are unchanged.
- **Item 1 path (b) is now CONFIRMED** (orchestrator fact).

## Disagreements for escalation

The Tech Lead authored the work under review, so by CLAUDE.md's loop a disagreement they do not accept goes to the PM.

| # | Disagreement | Type | Suggested decider |
|---|---|---|---|
| D1 | Gate layering and granularity: infrastructure executor at `postJson` (mine) vs an application `withQuota` at the port (Tech Lead) | technical | Tech Lead (likely resolvable without escalation) |
| D2 | `MinimumQuantity` as a separate `QuantityRequirement`, not a `PriceBasis` variant; plus the `offerKey` / storage / verdict-algorithm knock-ons | technical, with a UWG impact | Tech Lead, PM informed via P7a |
| D3 | `attributes_version` plus a per-item enrichment outcome, instead of `attributes_enriched_at` | technical | Tech Lead (ADR) |
| D4 | Truncation → split and retry the batch, not "permanent"; `source-changed` keeps one retry (measured non-determinism) | technical | Tech Lead |
| D5 | aktionis' appended text must not become `sourceDescriptor`; widen P8 to "used at all" | provenance / product | **PM** |
| D6 | "Only Migros is affected" is unproven: possible future-dated Lidl offers, and no `valid_from` filter in the web data layer | fact check, then product | Verify first; then **PM** (hide, or label "from Thursday") |
