# RCA: HANDOVER §8 items 6, 7, 8 and 9

**Author:** Tech Lead agent · **Date:** 2026-09-15 · **Scope:** root cause analysis only. No code, workflow or
config was changed, and no pipeline run was triggered.
**Companion:** `docs/rca/2026-09-15-architect-items-1-2-5.md` covers items 1, 2 and 5. Several findings here
depend on those, and the cross-references are explicit.

## Evidence base, and its limits

| Source | What it gave | How it matches production |
|---|---|---|
| `gh run view 34833209176 --log` (Mon 2026-09-14, schedule) and `34718508157` (Sat 2026-09-12, dispatch) | Every count quoted below from "the logs" | The production logs themselves. Kept in the session scratchpad, not in the repo. |
| The live site, `https://basketch.vercel.app/de/deals` (1,523 deals in the embedded snapshot) | What visitors actually see: names, `storage`, `attributes`, `isUncertain`, validity | The page served to users |
| The production Migros parser (`parseFlyer`) run offline via `npx tsx` over the committed OCR fixture `migros/__fixtures__/ocr-kw36-zh-pages2-5.json` | Stage-by-stage Migros attrition | The same code and a real OCR capture. Only 4 of 24 pages, so extrapolation is indicative. |
| Committed aktionis captures: `collection/infrastructure/coop/__fixtures__/vendors-coop-page1.html` (Sept, 6 cards) and `pipeline/aktionis/fixtures/coop-page-1.html` (April, 51 cards) | Where Coop truncation comes from, and whether collisions happen | Real aktionis HTML. I made no new fetch, which respects one fetch per store per week. |

**Not verified, and why:** I wrote a read-only script to query `product_classification_cache` with the
pipeline's own `supabase-js` client, and **the permission system denied running it**. I did not work around
that. So the exact "19.3% of cache keys" figure is unverified. The live-site numbers below measure the same
phenomenon from the user's side. The query for a human to run is in the appendix.

---

## Summary

| # | Verdict | Root cause (one line) | Fix (one line) |
|---|---|---|---|
| 6 | **CONFIRMED, and worse than stated.** 350 and 365 enrichment 429s per run. Backfill succeeded on **0 of 255** and **1 of 277** calls. **82.6%** of live deals have no attributes, **94.9%** have no `storage`. "Fills on warm runs" is **refuted**: warm runs are exactly where backfill fails. | The Gemini quota is per project and per model. Only one of the three callers of that model (the classifier) has a rate limiter. The enricher bursts with no pacing and no retry. An empty result cannot be recorded, so the owed set never drains. | One shared quota gate per (provider, model), used by the classifier, reflector and enricher. Honour Google's `retryDelay`. Add an explicit "enriched" state. Pace backfill. Put enrichment coverage in stats and alerts. |
| 7 | **CONFIRMED, but "OCR-limited" is refuted.** 34 offers (Sat) and **0** (Mon, HTTP 404), against about 100–120 statt-priced offers in a 24-page flyer. On the fixture, OCR loses **1 of 18** offers. The parser and the week key lose the rest. | (a) On Mon/Tue runs the ISO week is one ahead of the Migros flyer week (Thu–Wed), so the adapter asks for next week's unpublished flyer. (b) Parser geometry: it takes the *tallest* price in the column rather than the nearest, and the name search has no right-hand bound. (c) Two price forms are not modelled: inline multi-buy and whole-franc. (d) The discount tolerance is in percentage points, not rappen. | Map the run date to the Migros flyer week. Assign price and name within the offer's tile. Parse inline and `14.--` prices. Express the discount guard in rappen. Keep per-offer validity. Emit per-stage funnel counts. Calibrate the yield floor. |
| 8 | **PARTIALLY CONFIRMED.** The cache figure is unverified (DB query denied). On the live site, **274 of 923 Coop deals (29.7%)**, which is **18.0% of all deals**, end in `...`. | aktionis truncates the `<h3 class="card-title">` server-side at about 42–59 characters. Our adapter reads that h3 (`coop-aktionis-source.ts:106`). The full name sits on the same card, in the link's `title="Mehr Infos über …"`. | The ACL reads the full name from the same fetch, cross-checked against the h3 prefix. Add a port-contract test that no adapter emits a name ending in an ellipsis. Fix the test that encodes the bug. |
| 9 | **REFUTED as a throughput lever.** 25 to 100 saves 3 Gemini calls per 100 products, about 15 s of about 1,000 s, roughly **1.5%, not 4×**. Truncation **would not be detected correctly.** | The binding constraint is the **sequential judge**, at about 10.3 s per product. With about 400 misses a week, that is about 69 min against a 45-min step. **Attempt 1 timed out in both "successful" runs.** | Keep 25 for now. Add truncation guards (`finishReason`, index completeness, a non-retryable failure kind). Measure output tokens. The real lever is bounded judge concurrency plus caching uncertain outcomes. |

**PM decisions needed (flagged, not decided). Labelled TP-* so they do not collide with the architect report's P1–P11 (AP-*):**
- **TP-7a:** publish Migros "ab 2 Stück" multi-buy prices with a label, or exclude them?
- **TP-7b:** withhold Migros offers until the pairing fix lands? Wrong names are live, and so is an expired weekend offer.
- **TP-6:** hide the Storage facet while coverage is about 5%?
- **TP-8:** may aktionis' appended descriptor text (for example "– Weisswein, Italien (0.75l)") be displayed?
- **TP-9:** only if judge *sampling* on warm runs is chosen instead of concurrency.

### Cross-cutting finding: "Pipeline success" is really "attempt 2 success"

Both runs cited as green died in attempt 1, on the same fatal line:

```
34718508157  21:47:22  ##[warning]Attempt 1 failed. Reason: Timeout of 2700000ms hit
34833209176  11:18:01  ##[warning]Attempt 1 failed. Reason: Timeout of 2700000ms hit
```

Each attempt 1 finished 2 chunks (200 products) before the kill. Attempt 2 resumed from the cache and
finished. This is the regime HANDOVER §3 thought it had fixed. The cause is no longer the cache (hits were
75% and 75%). The cause is judge latency, covered in item 9. It also means **every run triggers item 1's
re-fetch of all seven retailers**. Items 6, 8 and 9 all add work to that same 45-minute budget, so they
**must be sequenced** (see the end of the report).

---

# Item 6: Enrichment 429s leave attributes sparse

## 6.1 Symptom and verdict: CONFIRMED (with the "fills on warm runs" part refuted)

**Quantified from the logs** (every `enrich <sub-category>: HTTP 429` line, grouped by phase):

| Run / attempt | In-chunk enrichment | Backfill of cached products | 429 lines |
|---|---|---|---|
| 34833209176 · 1 | `enriched 3/95` (36×429) · `enriched 10/93` (23×429) | never reached (timeout) | 59 |
| 34833209176 · 2 (published) | `enriched 0/80` (35×429) · `enriched 9/22` (1×429) | **1,107 owed → 12 batches, all `backfilled 0/N (0 tokens)`, 255×429** | 291 |
| 34718508157 · 1 | `enriched 0/83` (25×429) · `enriched 41/95` (18×429) | never reached (timeout) | 43 |
| 34718508157 · 2 (published) | `enriched 0/82` (31×429) · `enriched 16/59` (14×429) | **1,132 owed → `backfilled 1/100 (537 tokens)` then 0 × 11; 277 calls, 276×429** | 322 |
| **Totals** | | | **350 · 365** |

- **Success rate in the published attempt:** 9 of 1,209 owed-or-new products (0.7%), and 17 of 1,273 (1.3%).
- **The backfill never waits.** All 1,107 products were "processed" between `11:41:41` and `11:42:01`
  (20 s). The other run took 17 s (`22:14:41` to `22:14:58`). About 250 requests were fired back-to-back,
  each 429 returned in about 100 ms, and the loop simply moved on.
- **The owed set grows run over run:** `932 → 1107` (Mon) and `995 → 1132` (Sat), attempt 1 to attempt 2.
- **Every 429 is the per-minute quota, not a daily cap:**
  `quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, `quotaValue: "15"`,
  `retryDelay: "57s"`. So this is not a repeat of HANDOVER §4 #6's per-minute-read-as-per-day error. It is a
  **scope** error: the limit belongs to the *project and model*, while our limiter belongs to *one caller*.

**What visitors see (live site, 1,523 deals):**

| Store | deals | `attributes: {}` | `storage: null` |
|---|---|---|---|
| coop | 923 | 706 | 852 |
| denner | 272 | 246 | 271 |
| aldi | 127 | 118 | 125 |
| spar | 76 | 70 | 75 |
| lidl | 74 | 71 | 74 |
| migros | 29 | 28 | 29 |
| volg | 22 | 19 | 20 |
| **all** | **1,523** | **1,258 (82.6%)** | **1,446 (94.9%)** |

By top-level group, deals that carry a `storage` value: **fresh 5 of 267**, long-life 60 of 761,
household 12 of 495. `storage` is a cross-cutting attribute that applies to every product
(`shared/attribute-schemas.ts:44-50`).

**Is it user-visible? Yes, in two places:**
1. The **Storage facet** (ADR-001's Frozen/Chilled browse) in `FilterRail.tsx` and `FilterSheet.tsx`, fed by
   `storageCounts()` (`web-next/src/server/data/filter-deals.ts:82-101`). A deal with no storage *"drops out
   of a storage filter"* by design (`:30-33`). So "Frozen" shows a handful of products out of 1,523.
2. The **attribute line on deal cards**: `visibleAttributes(primary.attributes)` (`DealsClient.tsx:353`)
   renders nothing for 82.6% of deals.

**"Only fills on warm runs": REFUTED.** Backfill runs *only* on warm runs (`plan.enrich` is false on a cold
start, `run-plan.ts:119, 133`), and on warm runs it achieved 0.1%. The only attributes that land are from
in-chunk enrichment of newly classified products that happen to find spare quota.

## 6.2 Root cause (five whys)

1. **Why are attributes sparse?** Nearly every enrichment request is refused with 429.
2. **Why 429?** The enricher sends requests as fast as HTTP allows. It groups products by sub-category, so
   100 products cost about 20–36 requests, sent in about 5 s. That is against a **15/min** quota
   (`gemini-enricher.ts:78-116`). There is no rate limiter and no retry. A 429 is logged and the batch is
   skipped with `continue` (`:83-92`).
3. **Why no limiter?** The limiter exists, but only as a decorator on the **`Classifier` port**
   (`resilient-classifier.ts:57-133`). Its state is private to that one instance (`:72`). `model-http.ts:23-26`
   says in as many words that it has *"no retry, no rate limiting … Those already exist … applied in
   resilient-classifier.ts"*. That was true when the classifier was the only Gemini caller. Then two more
   callers of **the same model** were wired straight onto `postJson`: the enricher (`run.ts:381-387`) and the
   reflector (`run.ts:371-377`, `gemini-judge.ts:103-116`). Google counts all three against one bucket.
   **The quota's scope is (project, model). The limiter's scope is (port instance).** Nothing forces the two
   to match.
4. **Why does the quota run dry just as enrichment starts, even after 16 quiet minutes?** Enrichment runs
   right after the graph's final node. That node is **reflect**: one un-paced Gemini call per
   judge-disputed product, fired in a burst (`classify-graph.ts:238-272`). The chunks show 5–20 uncached
   (disputed) outcomes per 100, which is at least that many reflect calls just before enrichment. *This link is
   probable, not proven.* The reflector swallows every error with no log (`gemini-judge.ts:159-161`), so
   its own 429s are invisible. The discriminating test is in 6.5. Whichever caller drains the bucket, the
   enricher's own bursts (items 2 and 3) are sufficient to explain the backfill result. The backfill runs
   after both chunks, and all its calls get 429 within 20 s.
5. **Why does it never catch up?** Two structural reasons:
   - **Empty cannot be recorded.** The enricher drops an empty result (`gemini-enricher.ts:111-113`, "not
     worth storing"). The backfill re-saves only products that produced attributes (`classify-deals.ts:476-477`).
     `needsEnrichment` treats `{}` as owed (`classification-cache.ts:118-122`). So a product whose name
     honestly states nothing, like "Emmi Milch 1L" under the never-infer rule, is **re-requested every run,
     forever**. The owed set has a floor that no amount of quota can clear.
   - **The retry cap overrides the provider.** When the enricher's burst starves the *next* chunk's classify
     call, Google says `retryDelay: 57s`. `decideRetry` returns `Math.min(retryAfterMs, policy.maxDelayMs)`
     (`resilience.ts:124-126`) with `maxDelayMs: 30_000` (`:87-91`), so we retry at 30 s, 2 s and 2 s, then
     `giving up after attempt 3` (Mon `11:06:01`, `11:37:01`). That batch then lands in `held back 15`. **The
     enricher's burst costs classification too.** This contradicts the documented rule *"the provider's own
     instruction always wins over our guess"* (`resilience.ts:100-102`).

**Why was it silent?** Enrichment failure is log-only at INFO. `ClassifyDealsResult.stats` has no enrichment
field (`classify-deals.ts:49-86`). The alert snapshot has none either (`run.ts:571-586`). Two further
details made it easy to misread:
- A *different* step uses the same verb and looks healthy: `enriched 1492/1528 deals with
  crop/price-basis/rappen` (`write-enrichment.ts`).
- The 2 KB JSON body of every 429 is printed in full: **12,950 of 14,547 lines (89%)** and **13,505 of 15,041
  (90%)** of the Categorize job log. The signal that matters is buried under the noise.

This is HANDOVER §4's defect class again: *an operation reporting success while doing nothing*
(`backfilled 0/100` has no severity at all).

## 6.3 Why existing tests did not catch it (coverage theatre)

| Test | Problem |
|---|---|
| `gemini-enricher.test.ts:81-95`, *"returns what it has when a batch throws"* | Injects `'HTTP 429'` and asserts `attributes.size` `toBeLessThanOrEqual(1)`, which **passes with 0**. It turns "a 429 is skipped" into the specified behaviour. |
| `gemini-enricher.test.ts:26-31`, *"stores nothing for a product where nothing was stated"* | Correct for the unit, but at system level it is exactly what makes the owed set undrainable. No test crosses the enricher → cache → `needsEnrichment` boundary. |
| `resilient-classifier.test.ts:114-119`, *"waits exactly as instructed rather than guessing"* | Asserts `slept[0]` is `30_000` for an instruction of **37 s**, with the comment `// capped at maxDelayMs`. The test name states the rule; the assertion encodes its violation. `:125-133` does the same with the real Google body. |
| `resilience.test.ts:63-67` | The Retry-After test uses 25 s, **below** the 30 s cap, so it can never detect truncation. `:69-72` tests the cap with `'transient'`, not with a rate limit. |
| `classify-deals.ts:463-491` (backfill loop) | **No test exercises it.** No test file references `owedEnrichment`, "still owe" or "backfilled". |
| Transform wiring in `run.ts:323-390` | Built inline, with no composition function and no test. Nothing can assert that the three Gemini callers share a limiter. This is HANDOVER #10's shape again: *a correct unit that nothing wires up*. |

## 6.4 Proposed fix (DDD)

**Domain (`transformation/domain/`), pure.**
- `resilience.ts` already *decides* rate, retry and circuit (`checkRate`, `decideRetry`, `recordFailure`).
  Keep it. Change one rule: for `rate-limited-short`, **obey `retryAfterMs` up to a separate ceiling**
  (for example 90 s) rather than `maxDelayMs`. Google's 57 s is the bucket refill time. Waiting 30 s buys one
  more 429.
- Make "enriched, nothing stated" representable. Add an additive column
  `product_classification_cache.attributes_enriched_at TIMESTAMPTZ NULL` and make
  `needsEnrichment` test that instead of `{}`. Rejected alternative: a sentinel key inside the jsonb, which
  would leak into `visibleAttributes`. **This is a schema change, so write an ADR.** It is additive and
  reversible by dropping the column.

**Application.**
- **One quota gate per (provider, model), owned by the composition root and injected into every caller of
  that model.** This is an extraction from `resilientClassifier`, not a new framework. Its rate/retry/circuit
  loop becomes `withQuota(gate, call)`, used by the classifier, reflector and enricher. Three callers is the
  Rule of Three, so the extraction has earned its place. There is no event bus and no new abstraction layer.
- **Pace the backfill; never burst it.** Enrich owed products at the gate's pace until a
  **time budget** runs out (for example, stop when the step has less than 10 min left). Report
  `enriched N of owed M` and carry the rest forward. Express the guard in products per run, not in chunks
  (HANDOVER §5).
- Add `stats.enrichment = { attempted, enriched, statedNothing, rateLimited, failed }` and feed it into the
  alert snapshot. That depends on item 2's alert revival, per the architect report.

**Infrastructure.**
- `gemini-enricher.ts` stops calling `postJson` directly and goes through the injected gate. So does the
  reflector.
- Log **one line per phase** (`enrich: 36 requests, 3 ok, 33 rate-limited, retryDelay 57s`), not 2 KB per call.
- Rename the storage step's log from "enriched … crop/price-basis/rappen" to "offer fields written …", so one
  word does not mean two things.

**Rejected as over-engineering:** a token-bucket service, a queue, or a separate worker. One gate object with
the existing pure policy is enough for one developer and 15 req/min.

## 6.5 TDD plan

First failing tests, each named after the real defect:

| Layer | Test name | Notes |
|---|---|---|
| composition root | `classifier, reflector and enricher for the same model share ONE quota — backfill of 1,107 products fired ~250 requests in 20 s and got 255×429 (run 34833209176)` | Extract `createTransformDeps(env, clock, http)` from `run.ts:323-390`. A fake HTTP counts requests per 60 s window across all three ports. Assert ≤13 per window. **Mutation:** give the enricher its own gate → red. |
| domain | `obeys Google's retryDelay of 57s instead of cutting it to 30s` | Use the real 429 body from this run (`retryDelay: "57s"`) as a new fixture beside `transformation/__fixtures__/google-429.ts`. **Mutation:** restore `Math.min(retryAfterMs, maxDelayMs)` → red. Rewrite `resilient-classifier.test.ts:114-133` so the assertions match their names. |
| application | `a product whose name states nothing is enriched once, not re-requested every run` | Enricher returns `{}`. The next `classifyDeals` must not list it as owed. **Mutation:** revert `needsEnrichment` to the emptiness test → red. |
| application | `a rate-limited backfill reports what it owed — "backfilled 0/100" is not success` | Asserts `stats.enrichment.rateLimited > 0` and a WARN. **Mutation:** drop the stat → red. |
| application | `backfill stops at its time budget and carries the rest forward` | Injected clock. |
| infrastructure (diagnostic, first) | `a reflector failure is logged, not swallowed` | Also closes the evidence gap in 6.2 step 4: the next run will show how many reflect calls 429. |

**Fixtures:** the real 57 s per-minute 429 body, from this log. One captured successful enrich response,
using real Gemini output shape: one request made with the free key, committed as JSON.

## 6.6 Blast radius, risks, cost

- **Blast radius:** every Gemini call site. Pacing makes the classifier slightly slower *only* when enrichment
  competes. Today the enricher's burst makes it fail instead.
- **Wall-time risk:** a paced one-time backfill of about 1,100 products is about 75–100 grouped requests.
  At 13/min that is 6–8 min. It must fit a 45-minute step that the judge already overruns (item 9).
  **Sequence after the judge fix**, or give the backfill a time budget. Do not ship it into today's budget
  without one.
- **Quota/spend:** Gemini free tier only. Wasted 429 calls drop from about 350 per run to near zero. Useful
  calls are about 100–150 one-time, then about 20–40 per run, well inside 1,000/day. **No OpenRouter spend
  change.**
- **Migration:** one additive column. It needs an ADR (Tech Lead), not a PM decision.
- **PM decision TP-6:** while `storage` coverage is about 5%, should the Storage facet stay visible? Today
  "Frozen" shows near-empty counts. That is a UX call about what users see.

---

# Item 7: Migros yields few deals

## 7.1 Symptom and verdict: CONFIRMED low yield; "OCR-limited" REFUTED

**Collected vs realistic.**

| | Migros |
|---|---|
| Sat 34718508157 (ISO W37, correct flyer) | `ok migros 34 offers 85 warnings` · `Resolved 29/34` · **29 live today** |
| Mon 34833209176 (ISO W38) | `FAIL migros 0 offers … source-unavailable: migros: issuu document fetch failed: HTTP 404` |
| Flyer size | 24 pages (`issuu-fetcher.ts:56-57`, KW37 verified) |
| Density on the fixture (KW36 pp. 2–5) | 18 "statt" price anchors on 4 pages, about 4.5 per page |
| Candidates in production | 34 offers + 85 warnings = **about 119 anchors seen**. Each anchor yields exactly one offer or one warning. |
| Independent benchmark | aktionis carried **115** Migros deals (research Part 3) |

A realistic flyer is therefore **about 100–120 statt-priced offers a week**. We publish **29–34 on a good run
(about 25–30%)** and **0 on Monday/Tuesday runs**. The log has **no per-stage counts**: the 85 warnings are
counted and discarded. That absence is itself a finding (7.2e).

**Stage-by-stage, measured by running the production `parseFlyer` over the committed OCR fixture:**

| Stage | Lost | What actually happened |
|---|---|---|
| 18 statt anchors in OCR | | |
| Anchor regex | **1** (6%) | `"statt 14.--"` is Swiss whole-franc notation. `STATT = /statt\s*(\d{1,3}[.,]\d{2})/` (`migros-flyer-source.ts:67`) never matches, so the offer is not even warned about. |
| "no readable display price" | **6** (33%) | **Only 1 is an OCR failure** (`06'6` for 9.90, Eierschwämme). **The other 5 are "ab 2 Stück 33%" multi-buy offers.** Their price is printed **inline**, for example `"Schweiz,Schale,1kg,3.02statt 4.50"` or `"Neuseeland,proStuck,-.94statt1.40"`. There is no big display numeral to find. |
| Discount invariant | **4** (22%) | **3 are parser mis-pairs.** The sale price is chosen as the **tallest** price anywhere above in the column (`:151-156`), and all display prices are about 76–80 px tall. `statt4.30` got **1.90** from a tile 735 px higher; the nearest price above is **2.85** (2.85/4.30 = 33.7%). Likewise `statt7.90` got 1.15 (nearest 5.25) and `statt5.60` got 1.90 (nearest 3.75). **1 is a real offer rejected by the tolerance:** `1.20 statt 1.85`, printed 33%, true 35.1%, verified by eye in research Part 4b Check 4. Migros rounds shelf prices to 5 rappen, and on a CHF 1.85 item one rounding step is 2.7pp, which is more than `PRINTED_DISCOUNT_TOLERANCE_PP = 1.5` (`discount.ts:28`). |
| **Accepted** | **7** (39%) | **2 of the 7 carry the wrong product's name.** The name is the *longest* line anywhere to the right in the vertical band (`:185-196`), with a left bound (`x0 > statt.x0 − 10`) but **no right bound**. So `statt2.25 / 1.50`, which is *Schweinsbraten vom Hals*, is published as **"OptigalPouletgeschnetzeltes"** (name taken at x0 = 1394 for a statt at x0 = 140). `statt7.30 / 4.85`, which is *Migros Poulet Nuggets*, is published as **"natureodergewurzt,Schweiz,perkg,"**. A third accepted offer is named with a descriptor ("Schweiz,Schale,600 g,"). |

**Correct offers published: about 4 of 18 (22%).**

**On the live site, 17 of 29 Migros names (59%) are descriptor lines, not product names.** Examples:
`3x320 g,(100 g=0.89)`, `ca.300g,insonderpackung，`, `erhaltlichindiversenfarben,`,
`ingrosserenfilialenerhaltlich`, `zuchtausnorwegen/lrland,` (salmon, classified `vegetables`), and
**`gultig vom10.9.bis13.9.2026`** (classified `stationery`, CHF 2.85).

**That last one is a live correctness defect.** It is a weekend-only offer valid 10.9 to 13.9. Every live
Migros deal carries `validFrom 2026-09-10, validTo 2026-09-16`, because `parseFlyer` applies the first
validity line found anywhere to every offer (`:261`). **An offer that ended on 13.9 is on the site on
15.9.** That is the Art. 3(1)(e) UWG "expire aggressively" exposure.

## 7.2 Root causes (five whys, several independent chains)

**(a) Zero Migros on Mon/Tue runs: a week-key mismatch.**
Why 404? The adapter requested `migros-wochenflyer-38-2026` on Mon 14.9. Why 38? `run.ts:184-187` computes
one ISO week from the run date (`isoWeekOf`, `:34-40`) and hands the same `kw` to all seven sources
(`live-sources.ts:136, 228`). Why is that wrong for Migros? Migros flyer weeks run **Thursday to Wednesday**:
the live KW37 deals are `2026-09-10 → 2026-09-16`, and the Issuu revision `260908112026-…` shows it was
uploaded on the Tuesday before. So on Mon/Tue the ISO week is already the *next* Migros week, which is not
yet published. Why wasn't this designed in? The scheduled runs are Mon, Tue and Thu (`pipeline.yml:4-10`),
and the live module fetches every retailer on every run. The legacy matrix gated Migros to Thursday.
*Consistent with the architect report §1(b), with one correction:* on Monday **Lidl did not fail**
(`ok lidl 106 offers`). Lidl's KW flyer was already live. Only Migros is affected.

**(b) Wrong prices paired and wrong names attached: tile geometry is not modelled.**
Why mis-pairs? "Tallest price above" assumes the display price is uniquely large. On a Migros page every
display price is about the same height, so "tallest" is arbitrary between tiles. Why wrong names? The search
region has no right edge, and "longest wins" favours the neighbour's longer name. Why wasn't it caught? The
`Discount` invariant catches mis-paired *prices*, and did so 3 times. **A mis-paired *name* has no invariant**:
a consistent price pair with the wrong name passes every domain check.

**(c) Two real price forms are not modelled.** Inline `"X statt Y"` (the multi-buy form) and whole-franc
`"14.--"` / `"9.-"`. The first also has a **domain** gap: an "ab 2 Stück" price is conditional, like a Lidl
Plus price. `PriceBasis` is only `Everyone | MemberOnly(programme)` (CLAUDE.md), so there is nowhere to put
it honestly. That makes it a product and legal question (TP-7a).

**(d) The guard's unit is wrong.** `PRINTED_DISCOUNT_TOLERANCE_PP = 1.5` is in percentage points. Retail
rounding happens in **rappen**. For cheap items, a single 5-rappen rounding exceeds 1.5pp. HANDOVER §5 says:
*express guards in real-world units.*

**(e) Blind by construction.**
- Per-offer warnings exist (`collect-offers.ts:69-70`), but **`collectOffers` defaults to `noopTelemetry`**
  (`:104`). `createJsonTelemetry` (`collection/infrastructure/telemetry/json-telemetry.ts:26`) is referenced
  **only by its own test**. There are zero NDJSON lines in either run log. This is another instance of
  "built, tested, never wired".
- `MIGROS_EXPECTED_MINIMUM = 10` (`migros-flyer-source.ts:51`) is about 10% of a normal flyer. A run that
  loses 70% reports `ok`. That defeats "empty is not success" in all but name.

**Latent defects found on the way** (not yet biting, but same class):
- **Every page image is downloaded twice.** `fetchFlyerImages` downloads all 24 JPEGs
  (`issuu-fetcher.ts:117-129`), and then only the **URLs** are passed to `ocr.py` (`live-sources.ts:233-236`),
  which downloads them again (`ocr.py:51-58`). With three runs a week and a retry each, that is up to 12
  flyer downloads a week against "one fetch per store per week".
- **Page numbers are argv positions, not page numbers.** `ocr.py:123-130` emits `pageNumber` from
  `enumerate(args)`. If `fetchFlyerImages` skips a page (`:123-124`), every later page is numbered one lower,
  so every CropRegion points at the previous page's image. The crop would silently show the wrong product.

## 7.3 Why existing tests did not catch it (coverage theatre)

| Test | Problem |
|---|---|
| `migros-flyer-source.test.ts:52-54`, *"extracts offers"* | `offers.length > 0`. Passes with 1 of 18. |
| `:98-100`, *"never emits an empty product name"* | `"3x320 g,(100 g=0.89)"` is not empty. There is no golden (name, sale, statt) triple from the fixture anywhere. |
| `:72-74`, *"applies the flyer's own validity window to every offer"* | **Asserts the defect.** A weekend offer must *not* get the flyer's window. This is the `'dairy'` pattern from HANDOVER §4. |
| `:56-62`, *"every offer has a verified price pair"* | True, but it says nothing about whether the pair belongs to the named product. |
| `live-sources.test.ts:95-99`, *"asks Migros for the Issuu document of the requested week"* | Passes `kw = 37` straight in. The date-to-publication-week mapping that actually failed (`isoWeekOf`) has **no test** (`run.test.ts` does not reference it). The test checks that the number flows through, not that the number is right. |
| `json-telemetry.test.ts` | Tests a sink that production never constructs. |

## 7.4 Proposed fix (DDD, within the legal constraints)

All changes read the **same openly served Issuu flyer**. No migros.ch, no new endpoints, and images still go
out only as CropRegion.

**Domain (`collection/domain/`).**
- `isConsistentWithPrices`: accept when `|round(original × (1 − p/100)) − sale| ≤ 5 rappen` **or** the
  existing pp rule holds. That keeps the mis-pair rejections: 98, 414 and 185 rappen off. **Blast radius: all
  adapters with printed badges** (Coop, Denner, Volg, Spar, Lidl), so measure acceptance on every committed
  fixture before and after.
- **If TP-7a says publish:** `PriceBasis` gains `MinimumQuantity(n)`, with the same invariant shape as
  `MemberOnly` (must name its n). The UI labels it.

**Infrastructure (Migros ACL).** Retailer vocabulary stays in here.
- **Week:** `migrosFlyerWeek(runDate)` = ISO week of the most recent Thursday on or before the run date.
  "Migros weeks start Thursday" is retailer knowledge, so it belongs in the adapter or composition root, not
  in `run.ts`. **Do not fix this alone:** it would turn today's single 404 request on Mon/Tue into 48 image
  downloads. It must land with item 1's per-retailer schedule, so Migros is fetched once, on Thursday
  (architect report §1.4).
- **Tiles:** assign OCR tokens to the nearest statt anchor, giving each anchor a bounded rectangle. Choose
  the sale price as the **nearest** price above within the tile. Choose the name from lines inside the tile
  only, preferring the first non-descriptor line under the price. Grow `DESCRIPTOR` from the live evidence:
  `ca.`, `Sonderpackung`, `erhältlich`, `gültig`, `Zucht aus`, `Wildfang`, `z.B.`, `in grösseren Filialen`.
- **Price forms:** parse inline `"(\d+[.,]\d{2}|-\.\d{2})\s*statt\s*…"` and whole-franc `"\d+\.[-–]{1,2}"`.
- **Per-offer validity:** a `gültig vom … bis …` line inside a tile overrides the flyer window.
- **Fetch once:** pass the downloaded bytes to OCR (temp files or stdin) and carry real page numbers through.

**Application.**
- Wire `createJsonTelemetry` (or at least print warnings grouped by kind) in `run.ts`.
- Emit a **Migros funnel** per run: anchors, price found, invariant-rejected by reason, accepted.
- Replace the flat floor with a conversion guard in real units: *fail below-expected-yield when accepted
  offers are under 50% of detected anchors*. The absolute floor of 10 stays as a backstop.

**Rejected:** a paid vision API (zero-paid rule, and OCR is not the bottleneck); upscaling (measured to
recover no sale prices, `ocr.py:24-34`); any use of migros.ch offer pages (legal).

## 7.5 TDD plan

| Layer | First failing test | Fixture | Mutation |
|---|---|---|---|
| composition root | `on Monday 2026-09-14 Migros is asked for KW37 (valid Thu 10.9–Wed 16.9), not KW38 which 404s (run 34833209176)` | none, transport stub | revert to `isoWeekOf(runDate)` → red |
| infrastructure | `a sale price is the nearest price above its statt line, not the tallest in the column — Migros Spiesse 2.85 statt 4.30, not 1.90` | existing `ocr-kw36-zh-pages2-5.json` | restore tallest-sort → red |
| infrastructure | `a name comes from the offer's own tile — "Schweinsbraten vom Hals" 1.50 statt 2.25, not "OptigalPouletgeschnetzeltes"` | same | remove the right bound → red |
| infrastructure | golden master: `KW36 pp. 2–5 yield exactly these (name, sale, statt) triples`, with the list hand-verified against the page images | same | any geometry regression → red |
| infrastructure | `"statt 14.--" is 14.00 — Swiss whole-franc notation` (Optigal Poulet-Oberschenkel 9.35) | same | revert regex → red |
| infrastructure | `an inline "3.02statt 4.50" is read, not dropped as an OCR miss`. Blocked on TP-7a for *publishing*; the parse test can land first. | same | |
| infrastructure | `a weekend offer "gültig vom 10.9. bis 13.9." keeps its own window, not the flyer's 16.9`. Also **rewrite `:72-74`**. | **new:** OCR output of the KW37 page carrying that line. Capture it as a CI artifact *from the scheduled run's own fetch*, not with an extra fetch. | restore flyer-wide window → red |
| domain | `1.20 statt 1.85 at a printed 33% is consistent — Migros rounds shelf prices to 5 rappen` and `4.30 → 1.90 at 33% is still rejected` | none | revert to pp-only → first red; widen to ±3pp → second red |
| application | `a Migros run that converts 29% of its statt anchors is below expected yield, not ok` | anchors and offers from the funnel | remove the ratio guard → red |
| infrastructure | `OCR page numbers are the flyer's page numbers even when a page is skipped` | stub fetch skipping page 3 | revert to argv index → red |

## 7.6 Blast radius, risks, cost, decisions

- **Cost:** zero spend. OCR time is unchanged (native 1×). Removing the double download halves Issuu
  bandwidth. More Migros offers (about +60 a week) means about +60 cache misses, about +10 min of judge time
  at today's sequential rate. **Sequence after item 9's judge fix.** OCR spacing noise
  ("OptigalPouletgeschnetzeltes" vs "Optigal Poulet…") also makes Migros cache keys unstable week to week.
  That is tolerable, but it recurs.
- **Risk:** the rappen tolerance is a domain change touching every retailer. Gate it on all fixtures.
- **PM decisions:**
  - **TP-7a:** publish "ab 2 Stück" multi-buy prices with a visible "from 2 items" label (new `PriceBasis`), or
    exclude them? Unlabelled is not an option (UWG 3(1)(e)).
  - **TP-7b (urgent):** today the site shows Migros prices under wrong or descriptor names. On the fixture,
    2 of 7 accepted offers carry another product's name. An offer that expired on 13.9 is also live.
    **Withhold Migros offers until the golden-master test passes?** My technical recommendation is yes.
    It changes what users see, so it is the PM's call.

---

# Item 8: Coop ACL truncation

## 8.1 Symptom and verdict: PARTIALLY CONFIRMED

- **Cache figure (19.3%):** *unverified.* The read-only DB query was denied by the permission system. The
  query to run is in the appendix.
- **Live site (verified):** **274 of 923 Coop deals (29.7%)** have names ending in `...`, which is **18.0% of
  all 1,523 deals**, the same magnitude as the reported 19.3%. No other store has any. The truncated
  lengths cluster at 47–58 characters, including the ellipsis (histogram 42–59).
- **Committed captures:**

| Capture | Cards | Truncated h3 | Full name on the same card | Full name starts with the h3 prefix | Untruncated h3 equals full name |
|---|---|---|---|---|---|
| April, `pipeline/aktionis/fixtures/coop-page-1.html` | 51 | **18 (35%)** | **51/51** | 18/18 | 33/33 |
| Sept, `coop/__fixtures__/vendors-coop-page1.html` | 6 | 3 | 6/6 | 3/3 | 3/3 |

## 8.2 Where the truncation originates

- **aktionis serves it.** The `<h3 class="card-title">` text is cut at a word boundary with a literal `...`:
  `Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl...`
- **Our adapter chooses it.** `mapCardToOffer` reads that h3 (`coop-aktionis-source.ts:106`).
- **Normalisation does not truncate.** `normaliseForCache` (`classification-cache.ts:52-58`),
  `normalizeProductName` (`shared/types.ts:1035-1042`) and `sanitiseForPrompt` (`guardrails.ts:61-82`)
  collapse whitespace and lowercase, but never slice (`sanitiseForPrompt` rejects above 200, it does not cut).
- **The full name is in the same fetch.** The card's link has
  `title="Mehr Infos über Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl (2025) – Weisswein, Italien (0.75l)"`.
  It is also in the `href` slug. **Zero extra requests are needed**, so the one-fetch rule holds.

## 8.3 Consequences

**Collisions are real, and they lose the discriminating attribute.**

| Truncated title | Distinct products behind it |
|---|---|
| `Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl...` | 2025 **and** 2024 vintage (aktionis ids 1566602, 1566601; same price 15.90/35.70, same dates) |
| `L'Oréal Paris Lippenstift Brilliant Signature...` | 4 shades: 400, 404, 408, 412 |
| `Pays d'Oc IGP Cuvée Blanc H de l'Hospitalet...` | 2023 **and** 2024 vintage |

Truncation removes the vintage, the shade and the volume, which are exactly what D2 calls product identity
("the same wine at 10 and 15 years old is not the same product").

**Where the collided products go:**
1. **Collection drops them.** `offerKey` = retailer + name + sale + dates + basis (`offer.ts:140-144`). Same
   name at the same price → `dedupeOffers` keeps the first (`:147-156`), called at `collect-offers.ts:131`.
   Mon: `coop 977 offers` collected → **961** after dedupe. Those 16 are a mix of true repeats and
   collisions; the logs cannot separate them.
2. **Storage collapses the rest.** `store.ts:70-79` dedupes on `(store, normalizeProductName(name),
   valid_from)` and keeps the highest discount. The run then logs
   **`[ERROR] Storage shortfall: stored 1494 of 1542 deals (48 failed)`**, and **no batch failed** (no
   `Upsert batch … failed` line). The "failed" count is `resolved.length − storedCount` (`run.ts:524-531`),
   i.e. **rows collapsed in memory reported as write failures**, at ERROR, every run. That is alarm fatigue
   by construction.
3. **Offer fields cross-contaminate.** `writeEnrichment` updates by `(store, product_name, valid_from)`
   (`write-enrichment.ts:58-76`). Every collided sibling writes crop, price-basis and rappen onto the one
   surviving row, and the last one wins.
4. **Classification cache:** one key serves N products. The category is mostly right, because siblings share
   a ≥42-character prefix and so the same family. **The attributes are wrong or empty**, because enrichment
   cannot extract a vintage or volume that was cut off.
5. **Cross-store matching:** a truncated Coop name cannot match Denner's full name for the same product.
6. **Visitors see the ellipsis:** a price shown for "…6x 75cl..." hides the vintage and volume
   (Art. 3(1)(e): the comparison must be verifiable).

## 8.4 Why existing tests did not catch it

| Test | Problem |
|---|---|
| `coop-aktionis-source.test.ts:108-111`, *"de-duplicates the repeated cards aktionis actually serves"* | **Encodes the defect.** Its comment calls the two Soave cards *"duplicate rows from the live page"*. They are two vintages with different aktionis ids and different hrefs. The test asserts that one of two real products is dropped. |
| `:75-81`, `:92-96` | Select the one untruncated card (`startsWith('Lindt Matcha')`), so no test ever inspects a truncated card. |
| Port contract (`port-contract.test.ts`, `offer-source.test.ts`) | No rule that a product name is a *name* rather than a display truncation. |

## 8.5 Proposed fix (DDD)

- **Infrastructure (ACL, `coop-aktionis-source.ts`).** Read `title="Mehr Infos über (.*)"` from the card
  link. **Accept it only if it starts with the h3 text minus `...`.** That cross-check guards against aktionis
  changing the wording. Otherwise fall back to the h3 with a warning. Split aktionis' appended
  `" – <type>, <country> (<volume>)"` off into `sourceDescriptor`. The name keeps `(2025)`, so vintages stay
  distinct keys. "Mehr Infos über" is aktionis vocabulary and must not leave the adapter.
- **Port contract (shared suite).** `no adapter emits a product name ending in an ellipsis`. That is the
  system-level fix (Larson): every future adapter inherits it. A domain invariant in `createOffer` was
  considered and rejected: if aktionis ever removes the title attribute, it would turn a presentation quirk
  into about 300 dropped offers. The contract test plus a truncated-name count in telemetry is the
  proportionate guard.
- **Storage (`store.ts`, `run.ts`).** Report `collapsed` separately from `rejected`. Only rejects are ERROR.
- **Transition.** About 274–300 Coop cache keys change once (new names). No version bump is needed. The old
  truncated rows become orphans (a few KB against the 500 MB free tier). **At today's judge rate that is
  about 50 extra minutes, which would push a run past both attempts, and deferred products are *held back*
  (not published).** Technical decision (mine): **ship after the item 9 judge fix**, not before.

## 8.6 TDD plan

| Layer | First failing test | Fixture | Mutation |
|---|---|---|---|
| infrastructure | `keeps both Soave Classico vintages (2024, 2025) — aktionis truncates them to one title` (replaces `:108-111`) | existing Sept fixture | revert to h3 → red |
| infrastructure | `reads the full name from the card, never the ellipsis-truncated title` · `four L'Oréal shades stay four offers` | **copy** the April 51-card page into `collection/infrastructure/coop/__fixtures__/` (the legacy folder will be deleted) | revert → red |
| infrastructure | `falls back to the h3 with a warning when the title attribute does not extend it` | a synthetic mutated card | remove the cross-check → red |
| port contract | `no adapter emits a product name ending in an ellipsis` | each adapter's fixture | reintroduce h3 reading → red for Coop only |
| composition root | `createLiveSources + collectOffers over the Coop fixture keeps 6 of 6 cards` | Sept fixture via `coopFetchPage` stub | revert → 5 of 6, red |
| storage | `a collapsed duplicate is not reported as a failed write` | in-memory rows | restore `resolved − stored` → red |

## 8.7 Blast radius, risks, cost, decisions

- **Blast radius:** Coop only (about 30% of its names change), plus the storage log semantics.
- **Cost:** about 300 one-time classifications, Gemini free (about 12 calls at batch 25). Judge: about 300
  OpenRouter calls one-time, which is spend. See architect report item 5, which has no spend cap today.
- **Risk:** if aktionis reorders the attribute text, the cross-check falls back safely to today's behaviour.
- **PM decision TP-8:** the full title carries aktionis' own appended descriptor ("– Weisswein, Italien
  (0.75l)"). We deliberately refuse aktionis' taxonomy for provenance reasons (`sourceCategory: null`,
  `coop-aktionis-source.ts:150-156`). May that descriptor be *displayed*, or used only for identity and
  matching?

---

# Item 9: `batchSize` 25 → 100

## 9.1 Symptom and verdict: REFUTED as a throughput lever; the truncation concern is CONFIRMED

**Config:** `batchSize: 25` at `run.ts:353`. The call is `gemini-classifier.ts:74-106`.
`generationConfig` is `{ temperature: 0, responseMimeType: 'application/json' }` (`:80-85`). **No
`maxOutputTokens` anywhere in the pipeline.** `finishReason` is declared in the wire type (`:35`) and **never
read**. `onUsage` exists (`:56, :98`) and **`run.ts` never passes it**, so classification output tokens have
**never been measured**.

**What bounds throughput: measured, not assumed.** `classify+judge` seconds per chunk, from the logs:

| chunk | products | judged | seconds | s per judged product |
|---|---|---|---|---|
| Sat a1 c1 | 100 | 100 | 959.1 | 9.6 |
| Sat a1 c2 | 100 | 100 | 1019.9 | 10.2 |
| Sat a2 c1 | 100 | 100 | 903.7 | 9.0 |
| Sat a2 c2 | 64 | 64 | 657.9 | 10.3 |
| Mon a1 c1 | 100 | 100 | 1032.6 | 10.3 |
| Mon a1 c2 | 100 | 100 | 1154.3 | 11.5 |
| Mon a2 c1 | 100 | 99 | 1060.7 | 10.7 |
| Mon a2 c2 | 37 | 25 | 301.6 (−34 s of retry sleep) | 10.7 |

Time is **flat per *judged* product, about 10.3 s**, whatever the number of classify batches (2, 3 or 4). The
last row separates the two hypotheses: per *product* it would be 7.2 s, per *judged* product 10.7 s,
matching the rest. The judge is `openai/gpt-5-nano` via OpenRouter, **sequential**
(`classify-graph.ts:208-228`). Warm runs judge every product (`run-plan.ts:109-119`,
`judgeSampleRate: 1`). Classification is **about 4 Gemini calls per 17 minutes**: the 15 req/min Gemini
limit **is not binding for classification at all.**

**Expected gain from 25 → 100:** 3 fewer Gemini calls per 100 products, about 5 s each. That is about
**15 s per about 1,000 s, roughly 1.5%.** The "4×" in HANDOVER §8 is a 4× reduction in *calls*, which were
never the bottleneck. **Input tokens** (about 600 taxonomy + 100 names × about 15, roughly 2.1k) are trivial.
**Output tokens** at 100 are about 3–3.5k for the answer JSON. Whether `gemini-3.5-flash-lite` spends hidden
"thinking" tokens against its output limit, and what its default limit is, is **unverified**, because we log
neither.

**The real constraint:** judge latency × misses. About 400 misses (Sat: 1598 − 1198; Mon: 1557 − 1173) ×
10.3 s is about 69 min, against a 45-min step. That is why attempt 1 died in both runs. A contributor that
recurs: `persistChunk` caches **only `status === 'classified'`** (`classify-deals.ts:126`). Judge-disputed
(`uncertain`) outcomes are **never cached**, so the same 5–20 per chunk are re-classified and **re-judged
every run**, identically at temperature 0. The cache schema *has* `is_uncertain` for exactly this purpose
(`20260910_classification_cache.sql`). The observed dispute rate (5–20%) is also far above the benchmark's.
That is worth its own look; it is out of scope here.

## 9.2 Would output truncation be detected? Partially, and misread

Trace of a Gemini response cut off at the output limit (`finishReason: "MAX_TOKENS"`,
text `[{"i":0,…},{"i":1,…},…,{"i":57,"cat`):

1. `extractAnswers` (`classification-prompt.ts:179-224`): there is a `[` but no `]`, so path 1 is skipped.
   Path 2 slices from the first `{` to the last `}`, which is several objects, and `JSON.parse` throws →
   **`null`**.
2. The adapter returns `err('source-changed: could not parse a JSON array from the response')` (`:101-102`).
3. `resilientClassifier`: `statusFrom` finds no 3-digit number and returns null (`resilient-classifier.ts:50-55`).
   `classifyFailure(null, …)` falls through to **`'transient'`** (`resilience.ts:75`), so the **same
   deterministic prompt is retried 3×**.
4. It gives up and records a circuit failure. After **5 such batches the circuit opens** (`resilience.ts:217`),
   and every remaining batch in the run fails with `circuit-open`.
5. The graph turns each product into `uncertain` with a null classification (`classify-graph.ts:169-175`).
   `classifyDeals` counts it as **`heldBack`, not published** (`classify-deals.ts:573-577`).
6. The run succeeds. The only traces are `giving up after attempt 3 — exhausted 3 attempts` (INFO, which
   never mentions truncation) and the `held back N` count. The alert snapshot has no held-back field
   (`run.ts:571-586`).

**Silent partial acceptance edge case:** if the cut falls just after the **first** complete object, path 2
parses one lone object (`:215-217`, tested as a feature at `gemini-classifier.test.ts:257`). The batch then
returns **1 classified + 99 `no-answer`**. `alignByIndex` (`:264-273`) has no completeness check, so that
is accepted as a *successful* batch.

**At batch 100 the blast radius of one truncation is a whole chunk (100 products),** and 5 of them close the
circuit for the rest of the run.

## 9.3 Why existing tests did not catch it

| Test | Problem |
|---|---|
| `gemini-classifier.test.ts:168-174`, `:176-181` | `if (!isOk(r)) return` → **can pass with zero assertions** (the pattern `8ff46b7` was meant to remove). |
| `:201-206`, *"fails loudly when the response is not parseable"* | Loud at the adapter; the loudness is lost one layer up (`transient` → retry). No test crosses the adapter → resilience boundary for this case. |
| `:257`, *"parses a lone answer object as a one-item batch"* | Correct for real one-item batches; it also enables the silent partial case above. |
| none | No test with `finishReason: MAX_TOKENS`, and none asserting index completeness. |

## 9.4 Proposed fix (DDD)

**Technical decision (mine): do not change `batchSize` now.** The gain is about 1.5%. The risk is an
accuracy shift of unknown size: D12 measured that about 600 extra prompt tokens cost 2.1pp accuracy and
7 parse failures. The quality risk is 4× per failure. Close HANDOVER §8 #9 as misdiagnosed. Add the guards
anyway, because they protect batch 25 too.

- **Infrastructure (Gemini ACL):** read `finishReason`. `MAX_TOKENS` → `err('output-truncated: …')`, and
  `SAFETY`/`RECITATION` → named errors. Log `candidatesTokenCount` (and `thoughtsTokenCount` if present) per
  call through the existing `onUsage`. Wire it in `run.ts`. Google's `finishReason` never leaves the adapter.
- **Domain (`resilience.ts`):** `output-truncated` and `source-changed` are **not `transient`**. Retrying the
  same prompt at temperature 0 returns the same bytes. Treat them as `permanent` for the batch.
- **Application:** a batch-level completeness check. Answers must cover indices 0..n−1. Missing ones are
  counted as `noAnswer` in stats with a WARN, never silently held back.
- **If batch size is ever revisited:** set `maxOutputTokens` from *measured* tokens per answer × batch × 2,
  handle any thinking budget explicitly, and pass the Denner 291 benchmark through the existing
  `evaluatePromptChange` gate (`run-plan.ts:168-178`).
- **The actual throughput fix (recommended next, independent of batch size):**
  1. **Bounded judge concurrency** (for example 4 in flight) behind an OpenRouter quota gate, the same gate
     type as item 6. Expected: about 1,000 s → about 260 s per 100 products. The weekly miss set then fits
     comfortably in one attempt, which removes the retry that triggers item 1's re-fetch.
     **Call count unchanged, so spend per product unchanged; spend *rate* rises.** It must sit under the
     architect report's item 5 `SpendBudget`/`Reservation`.
  2. **Cache `uncertain` outcomes** with `is_uncertain = true`, so they stop recurring.

## 9.5 TDD plan

| Layer | First failing test | Fixture | Mutation |
|---|---|---|---|
| infrastructure | `a response cut off at MAX_TOKENS is output-truncated, not a parse failure` | **new:** one real Gemini response captured with a deliberately tiny `maxOutputTokens` (one free-tier request) | remove the `finishReason` check → red |
| domain | `output-truncated is not transient — the same prompt at temperature 0 truncates identically` | none | map it to transient → red |
| application via `resilientClassifier` | `a truncated batch costs ONE call, not three, and never opens the circuit` | the same fixture | revert either guard → red |
| application | `a batch whose answers skip indices reports the missing products — no silent held-back` | a hand-built 1-of-3 response | remove the completeness check → red |
| composition root | `classify token usage reaches the run log` (proves `onUsage` is wired) | fake HTTP with `usageMetadata` | unwire → red |
| application | `an uncertain outcome is cached, so it is not re-judged next run` | in-memory cache (make it reject duplicates, per HANDOVER §4 coverage-theatre note) | revert the filter → red |
| application | `the judge runs at most N in flight and never exceeds its quota` | fake clock + counting judge | set concurrency to unbounded → red |
| — | Fix `gemini-classifier.test.ts:168-181` to assert `isOk(r)` first. | | |

## 9.6 Blast radius, risks, cost, decisions

- **Truncation guards:** tiny blast radius (the classifier adapter and one failure kind). Zero cost.
- **Judge concurrency:** touches the graph's judge node. Risks: OpenRouter 429s. The judge maps them to
  `unavailable`, which is counted and logged loudly (`classify-deals.ts:583-588`), so a gate is required.
  Spend rate rises; spend per product does not.
- **Caching uncertain:** reduces recurring misses by about 40–60 per run. Uncertain labels stay withheld
  (D3) exactly as today.
- **PM decision TP-9:** none if concurrency is adopted. **If** judge *sampling* on warm runs is preferred as a
  cheaper alternative, that trades label accuracy (the judge is the only escalation trigger, 0% false alarm)
  for time. That is a product-quality decision for the PM.

---

## Sequencing (Tech Lead decision: finish before starting)

> **Superseded.** The merged build order across items 1, 2, 5, 6, 7, 8 and 9 is in
> `docs/rca/2026-09-15-tech-lead-review-of-architect.md` §6 (WP-0 to WP-12). There, the Migros parser moves
> earlier (WP-6), and the judge's spend guard is a paid `ProviderGate` rather than the architect's per-call
> `Reservation`. The list below is kept for the record.

Every fix below adds work to the same 45-minute step, which already overruns. Order:

1. **Item 9 guards + judge concurrency + cache uncertain.** This buys back about 50 minutes a run, and
   everything else spends it.
2. **Item 6 shared quota gate + retryDelay + enrichment state + paced backfill** (ADR for the column).
3. **Item 8 Coop full names.** About 300 one-time misses, now affordable.
4. **Item 7 week mapping, together with item 1's per-retailer schedule.** Not before; alone it adds fetches.
   Then the parser geometry, price forms, per-offer validity and rappen tolerance. The multi-buy
   `PriceBasis` waits on TP-7a. **TP-7b (withhold Migros) can be decided today, independent of all of this.**

## System fixes, so no bug class recurs

| Bug class seen here | Check that would have caught it |
|---|---|
| The quota's scope differs from the limiter's scope | Composition-root test: all callers of one model share one gate |
| An operation "succeeds" doing nothing (`backfilled 0/100`, 48 "failed" that were collapses) | Every phase reports N-of-M with a WARN threshold; stats feed alerts |
| A test encodes the defect (`:72-74` Migros validity, `:108-111` Coop dedupe, `:114-119` "exactly as instructed" = 30 s) | Review rule: a test whose name states a rule must assert that rule at a boundary value |
| A guard in the wrong unit (pp vs rappen) | Guards in real-world units (HANDOVER §5), with boundary tests at the cheapest real price |
| Built, never wired (`createJsonTelemetry`, `onUsage`) | Grep-based test: every exported adapter factory is referenced outside tests |
| Display text used as identity (h3 with `...`) | Port-contract rule: no ellipsis-terminated names |

## Appendix: read-only queries for a human to run (Supabase SQL editor)

```sql
-- Item 8: verify the 19.3% figure on the cache (current versions only)
select count(*)                                                        as total,
       count(*) filter (where normalised_name ~ '(\.\.\.|…)$')         as truncated,
       round(100.0 * count(*) filter (where normalised_name ~ '(\.\.\.|…)$') / count(*), 1) as pct
from product_classification_cache
where cache_key like '%|t3|p1|s1';

-- Item 6: attributes owed vs present in the cache
select count(*) filter (where attributes = '{}'::jsonb)   as owed,
       count(*) filter (where attributes ? 'storage')      as with_storage,
       count(*)                                            as total
from product_classification_cache
where cache_key like '%|t3|p1|s1';
```
