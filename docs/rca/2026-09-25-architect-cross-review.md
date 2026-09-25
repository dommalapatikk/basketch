# Architect cross-review: Tech Lead and SRE reports of 2026-09-25

**Date:** 2026-09-25 · **Author:** Solution Architect · **Status:** Proposed. The Tech Lead rules on the technical disagreements. The PM rules on the items in §6.
**Scope:** analysis and design only. No source edits, commits, workflow triggers or database writes.
**Reviewed:** `2026-09-25-tech-lead-missing-images.md` (TL-IMG), `2026-09-25-tech-lead-max-chunk-ms.md` (TL-BUDGET), `2026-09-25-sre-post-monday-runs.md` (SRE), set against my own `2026-09-25-architect-missing-images.md` (ARCH-IMG).
**Code read for this review:** `pipeline/v3-cutover.ts` (all of it), `run-pipeline.ts:464-479, 801-890`, `store.ts:88-140`, `storage/infrastructure/write-enrichment.ts`, `transformation/domain/resilience.ts:280-420`, `config.test.ts:200-219`, `collection/infrastructure/live-sources.ts:57-90, 251-264, 395-430`, `collection/infrastructure/port-contract.test.ts:1-60`, `supabase/migrations/20260427_v3_concept_layer.sql:94-160`, `model-registry.ts` (rpm lines), `.github/workflows/pipeline.yml:135`.

---

## 0. Verdict in one table

| # | Claim or proposal | Source | Verdict |
|---|---|---|---|
| 1 | `MAX_CHUNK_MS` is 1.9× too high, and the config test passes only because two errors cancel out | TL-BUDGET §3 | **Agree.** Verified: `resilience.ts:308` (19.5 min), `:334` (9.5 min), `config.test.ts:218` |
| 2 | Work `MAX_CHUNK_MS` out from the rate limits instead of copying a measurement | TL-BUDGET §3 option C | **Agree, with two amendments** (§1.2) |
| 3 | Raise `WRITE_TAIL_MS` to ~18 min, giving 28+12+18+2 = 60 | TL-BUDGET §3 | **Disagree.** It repeats the root cause TL-BUDGET itself diagnosed (§1.1) |
| 4 | Do not raise `RUN_DEADLINE_MS` | TL-BUDGET §3 | **Agree** |
| 5 | Batch the per-deal round trips in v3 cutover and enrichment | TL-BUDGET §5 "not fixed" item 1 | **Agree, and move it to first place.** Design in §2 |
| 6 | Coop duplicate products "would inflate the v3 input" | TL-BUDGET §4 risk 5 | **Disagree on this mechanism.** v3 iterates deals, not products (§1.4). The duplicates still need their own RCA |
| 7 | The drift warnings are plain `console.warn`, not annotations | TL-BUDGET §4 risk 2 | **Agree.** `run-pipeline.ts:873` is `console.warn`. The SRE's "`##[warning]`-equivalent" is wrong |
| 8 | Runs over 60 minutes are working as designed (the limit is per attempt) | TL-BUDGET §4, SRE #3 | **Agree.** `pipeline.yml:135` (the SRE cites `:139`, which is off by four lines) |
| 9 | ALDI root cause, and the "tested on doc JSON" diagnosis | TL-IMG §1 | **Agree, identical to mine** |
| 10 | Aspect-ratio guard per ALDI page, and keeping both `data.json` and `spreads.json` fixtures | TL-IMG §1 | **Concede and adopt** (§3.1) |
| 11 | Image alert: absolute, per retailer, critical | TL-IMG §4 | **Agree on absolute and per retailer. Severity is a PM decision** (§3.2) |
| 12 | Post-run reachability probe (HEAD a sample) | TL-IMG §4 | **Concede.** It is the only thing that catches rot. It is gated by the fetch rule (§3.2) |
| 13 | `ProductImage` gains stable identity plus `durability`, and the storage boundary nulls expired renditions | TL-IMG §2 | **Half agree.** Identity: yes. A storage-side expiry rule: no (§3.3) |
| 14 | Generic "reference refresh" step shared by Volg and SPAR | TL-IMG §2, §3 | **Disagree for now.** It would be built for a SPAR case the PM may never allow (§3.3) |
| 15 | Retiring the enrichment pass is a separate work package, "tech debt" | TL-IMG side finding 2 | **Disagree.** It is the same root cause as the write-tail growth (§2.5) |
| 16 | Captured-fixture rule "enforced in review" | TL-IMG decisions | **Agree with the rule, disagree that review is enough.** Mechanical guard in §4 |
| 17 | SRE: write-tail growth is "monotonically up as stored-deal count rises" | SRE #1 | **Partly wrong.** The deal counts it lists (1313 → 1366 → **1161** → 1562) are not monotonic, yet the tail rose every time. Cost **per deal** is rising (0.52 → 0.74 s, TL-BUDGET §4). That strengthens the batching case |
| 18 | SRE: `MAX_CHUNK_MS` "healthier than feared" | SRE, "No failures found in" | **Agree, and it is the same finding as TL-BUDGET item 1 from the other side** |

---

## 1. The time budget

### 1.1 Is 28 + 12 + 18 + 2 = 60 sound? No.

The Tech Lead's own diagnosis of `MAX_CHUNK_MS` is: *"a hand-copied measurement of something the code already knows"* (TL-BUDGET TL;DR 4). Raising `WRITE_TAIL_MS` to 18 min does exactly that again, and to a term that is worse behaved:

1. **18 min is already exceeded by a volume we have seen.** TL-BUDGET §4 risk 1 computes that an attempt is killed once the write tail passes ~21.7 min, which happens at ~2,100 deals at 0.62 s/deal. The 2026-09-17 run collected **2,060 offers**. At the per-deal cost measured on run R3 (982.8 s / 1,562 deals = 0.63 s; 861.8 s / 1,161 deals = 0.74 s), 18 min (1,080 s) covers only about **1,460 to 1,710 deals**. So on a 2,060-offer week the constant is false the day it ships. The `config.test.ts:218` inequality would then be green while reality is `28 + 10.3 + ~22 + 2 ≈ 62 > 60`, which is the same "green for the wrong reason" TL-BUDGET §3 point 3 warns about.
2. **"Zero slack" is not what it looks like.** `SAFETY_MARGIN_MS` (2 min) is the only slack. It was sized as noise on two stable constants (`resilience.ts:337`). It was never meant to absorb the growth of a term that scales with an input we do not control.
3. **The failure is the worst kind.** Breaching the 60 minutes is a SIGTERM that nick-fields does not retry (`resilience.ts:379-387`), and it lands during the write tail, so `revalidate` and `logRun` do not run. A budget with no real slack protecting an unretried kill is not acceptable.
4. **A constant cannot bound a term that is linear in an unbounded input.** 9.5 min drifted to 16.4 min in four days (`resilience.ts:326-332` predicted it). 18 min will drift the same way.

**Position.** The write tail must stop depending on deal count **before** it gets a new constant. Then the constant is derived the same way the Tech Lead derives `MAX_CHUNK_MS`: from a declared capacity, not from the last observation.

### 1.2 Amendments to option C for `MAX_CHUNK_MS` (otherwise agreed)

- **Take the bound over the whole judge chain, not `JUDGE_CHAIN[0]`.** The proposal uses `judgePhaseBoundMs(CHUNK_SIZE, JUDGE_CHAIN[0])`. A chunk can fall over to the next judge in the chain. Today both entries are 20 rpm (`model-registry.ts:142, :171`), so the numbers are the same. A future edit that adds a slower fallback would make the bound silently optimistic. Use `max` over the chain. It costs one line and closes the same class of drift the proposal exists to close.
- **Label the Gemini residual as what it is.** The 320 s `GEMINI_PHASE_RESIDUAL_MS` is still a copied maximum. One of its two samples includes a transient retry (R3:L3250). That is acceptable, since it is the only latency-bound term, but its docstring should say "measured, may drift" and keep `checkChunkDuration` as its tripwire. Do not present the whole of `MAX_CHUNK_MS` as derived.

### 1.3 The budget design I recommend

```
WRITE_TAIL_MS = writeTailBoundMs(DEAL_CAPACITY)          // derived, like MAX_CHUNK_MS
writeTailBoundMs(n) = FIXED_STEPS_MS + ceil(n / BATCH) × PER_BATCH_MS × WRITE_STEPS
DEAL_CAPACITY = a declared number (proposal: 4,000, ≈ 2× the largest week seen, 2,060)
```

1. **Batch first (§2).** After that the write tail is O(number of batches). At 100 rows per batch, 4,000 deals is 40 batches per step instead of about 8,000 round trips.
2. **Re-measure** `FIXED_STEPS_MS` and `PER_BATCH_MS` on the first run after batching lands. Only then write the constant, as a function with a cited run.
3. **`config.test.ts`** asserts the inequality at `DEAL_CAPACITY`, not at "today's count". Mutation check: doubling `PER_BATCH_MS` or `DEAL_CAPACITY` must turn it red.
4. **At run time**, if the resolved deal count exceeds `DEAL_CAPACITY`, emit an alert (`capacity-exceeded`) into the snapshot, not a `console.warn`. That is a declared limit being crossed, which is different from a drifting estimate.
5. **Target real slack of at least 10% (6 min)** before anyone raises `RUN_DEADLINE_MS`. The expected arithmetic after batching is roughly `28 + 12 + ~5 + 2 = 47`. That is 13 minutes of honest slack, and it is the only safe place for the P6 dividend to come from.

**Alternatives considered**

| Option | Verdict |
|---|---|
| A. TL's constant only, 18 min | Rejected (§1.1). False at a volume already observed |
| B. Honest interim constant (~22 min at 2,100 deals) and lower `RUN_DEADLINE_MS` to 24 | **Fallback only.** Correct arithmetic, but it costs a classification chunk per attempt. Use it only if batching cannot land before a high-volume week. Tech Lead's call |
| C. Deadline computed per run from the deal count known after collection: `min(28, 60 − maxChunk − writeTailBound(n) − margin)` | Deferred. This is not the N4 anti-pattern, because it uses a static model applied to known input rather than last run's timing, and it stays testable. But once batching lands the slope is tiny, so this becomes unnecessary machinery |
| **D. Batch, then derive at a declared capacity (above)** | **Recommended** |

**Sequencing.** The Monday 2026-09-28 run is the next exposure. The worst attempt so far was 49.6 min, so the real margin is about 10 min. Batching is the fix. If the Tech Lead judges it cannot land and be verified before a week above ~2,000 offers, option B is the honest interim. The 18-minute constant is not an interim, because it changes no runtime behaviour: `RUN_DEADLINE_MS` stays 28, so it only changes what the test claims.

### 1.4 Coop duplicates do not inflate v3 (disagreement on mechanism)

TL-BUDGET §5 puts the Coop RCA *before* batching "because duplicate products would inflate the v3 input". The code says otherwise:

- `run-pipeline.ts:843` calls `v3CutoverStep(deps, resolved)`, and `v3-cutover.ts:260` iterates `deals`. The `products` table is never read by v3.
- The sku natural key is `(concept_id, store, region, source_product_id = productName)` (`v3-cutover.ts:147-155`), built from the deal's name, not from `product_id`.

So duplicate `products` rows can slow `resolveProducts` (the insert at `product-resolve.ts:148`, and a parallel per-row `update` at `:189-197`, which is itself another per-row write in the tail), but they cannot enlarge the v3 loop. **The Coop RCA is still needed**, because it is a data-integrity defect. It should run **in parallel** with batching, not block it.

---

## 2. Design: the batched catalogue-identity write (replaces `v3-cutover.ts:260-289`)

### 2.1 What the current code does per deal (verified)

For every deal: `applyResolver` (in memory), `ensureConceptFamily` (cached per sub-category), **`ensureConcept`** (one upsert per distinct slug, `:118-125`), **`ensureSku`** (one upsert per deal, uncached, `:143-158`). Then `backfillRecentDealsSkuId` reads rows back 100 at a time and runs **one `update` per changed row** (`:199-205`).

That is about 2 round trips per deal. 667 s for 1,579 deals ≈ 0.2 s per call, which matches the enrichment pass's ~0.19 s per call (299 s for ~1,600 rows). **Both halves of the write tail are the same shape: one HTTP round trip per row.**

Three latent defects surfaced while reading, and the redesign removes them:

| # | Defect | Evidence | Consequence |
|---|---|---|---|
| V-a | A failed read of `concept_resolver` returns `[]` and the run carries on | `v3-cutover.ts:72-75` | Every deal falls through to the fallback concept. That is the exact "Almo Thunfisch → fish, not cat food" error the resolver exists to prevent (`:6-8`), caused by a transient error and logged only as one line |
| V-b | `loadValidTaxonomySubcats` ignores its error | `:79-81` | Families are written with `subcategory_slug: null` |
| V-c | `ensureSku` writes `regular_price: deal.originalPrice ?? null` | `:152, :282` | A week without a printed reference price (ALDI, most weeks) **erases** a previously observed shelf price. The column comment says "null if never observed" (migration `:136`) |

V-c changes stored data, so the fix is a Tech Lead call. I list it so it is not lost. The obvious remedy is to omit the column when null.

### 2.2 Domain boundaries

v3 is a separate bounded context: **catalogue identity** (`ConceptFamily`, `Concept`, `Sku`). It is not part of the `Offer` aggregate. It maps a published deal to "which product is this, across stores". Today it lives in one file that mixes rules, I/O and orchestration. The split:

```
pipeline/catalogue/
  domain/
    sku-key.ts                 SkuKey value object {conceptId, store, region, sourceProductId}
                               with equals/toString; replaces the '|'-joined string (v3-cutover.ts:196, :291)
    concept-resolution.ts      applyResolver (moved as is) + slug rules. Pure
    catalogue-plan.ts          planCatalogueIdentity(deals, rules, validSubcats) → CataloguePlan
                               { families[], concepts[], skuDrafts[], skuKeyByDeal: Map<DealKey, SkuDraftRef>,
                                 skipped: {noSubCategory, …} }
                               Pure. Dedupes every draft by its natural key.
  application/
    resolve-catalogue.ts       resolveCatalogueIdentity(deals, store: CatalogueStore) → CatalogueLinks
                               orchestrates: load rules → plan → upsert families → concepts → skus
                               → returns Map<DealKey, skuId> + counts. Never throws.
  infrastructure/
    supabase-catalogue-store.ts   implements the CatalogueStore port: batched upserts, ids mapped back by natural key
```

`DealKey` is the same natural key storage already uses (`store, product_name, valid_from`, `store.ts:101-106`). It should be one value object shared by `store.ts` and this module, not a third string format.

### 2.3 The write: one owner, in the main upsert

The precedent already exists. `resolveProductIds` runs **before** `storeDeals`, and `product_id` rides the main upsert (`run-pipeline.ts:838-840`, `store.ts:88-92`). The sku link should follow the same pattern:

```
taxonomy → resolveProductIds → resolveCatalogueIdentity → storeDeals(rows carry product_id AND sku_id)
         → sweep → deactivate → refresh MVs → logRun
```

The post-write read-back (`backfillRecentDealsSkuId`, with its `.in('product_name', 100 names)` query and per-row update) is **deleted**. This is the same principle as ADR-IMG-1: one domain value, one write, no re-join by string key.

**Round trips.** Families: 1. Concepts: ⌈n/100⌉. Skus: ⌈n/100⌉. Rules and sub-categories: 2. MV refresh: 2 (unchanged). About 40 calls for 1,600 deals instead of about 3,500.

### 2.4 Idempotency and failure semantics

| Concern | Rule |
|---|---|
| **Natural keys** | `concept.slug` (UNIQUE, migration `:96`). `sku (concept_id, store_slug, region_slug, source_product_id)` (UNIQUE, `:142`). `deals unique_deal`. Every write is an upsert on one of these, so attempt 2 and next week's run converge on the same ids |
| **In-batch duplicates** | `planCatalogueIdentity` dedupes drafts by natural key **before** sending. Postgres rejects the whole statement if one `ON CONFLICT DO UPDATE` touches a row twice. The per-row loop could never hit this; a batch can |
| **Id mapping** | Upserts `.select('id, <natural key columns>')`, and ids are mapped back **by natural key, never by response order**. PostgREST does not promise to return rows in input order |
| **Getting ids for existing rows** | Concepts use `DO UPDATE` (merge), not `ignoreDuplicates`, because an ignored row returns no id. Families keep `ignoreDuplicates` because nothing reads their id |
| **Rules unreadable (V-a)** | **Abort catalogue resolution for this run.** No concept or sku writes. Deals are still stored, **without the `sku_id` column**, so existing links stay. Reported as `catalogue: skipped (resolver rules unreadable)`. Wrong concepts are worse than stale ones |
| **One batch fails** | The affected deals have no `skuId` this run. `storeDeals` groups rows by column set: rows with a `skuId` are written with `sku_id`, and rows without one are written **without the column**, so a failure never nulls an existing link. PostgREST's uniform-column rule holds per batch |
| **Atomicity** | Not transactional across the three tables, **by choice**. Every step is an idempotent upsert that moves forward, so a partial run leaves at worst an unused concept or sku, and the next run fills in the gaps. A transaction would buy nothing that idempotency does not already give |
| **Never throws** | Same contract as today (`run-pipeline.ts:470-478`). Counts (`resolved`, `skipped`, `failedBatches`) go into the run snapshot, not only into a log line |
| **Deals must never depend on catalogue** | A total catalogue failure degrades to today's behaviour when v3 fails: legacy columns are stored and links are unchanged |

### 2.5 Fold the enrichment pass into the same main upsert

The enrichment pass (`write-enrichment.ts:73-106`) is the other ~300 s of the tail, and it is per-row for the reason its own comment gives: PostgREST cannot express a multi-row update with different values per row (`:76-79`). That is only true because it is an **update after the fact**. As part of the **upsert** it costs zero extra round trips.

Its stated reason for being separate (`:8-12`, "folding it in would put every deal at risk to gain a crop rectangle") no longer holds once the values are built by constructors that enforce the invariants. A `ProductImage` that violates `deals_one_image_kind` cannot be built (ARCH-IMG VO-1, T-7). So:

- **Rappen, price basis, loyalty programme and image** all move to `dealToRow`. `writeEnrichment`, `DealEnrichment`, the `|` key (defect G) and the Map-versus-dedupe mismatch (D/E) all go away together.
- This **reclassifies my ARCH-IMG D-5 as a technical decision, not a PM one.** It is about how we write, not what we show, so I withdraw it from the PM list. The UWG exposure (a Lidl Plus label lost in the second pass) is a reason to do it, not a product choice.
- TL-IMG side finding 2 calls this "tech debt, a separate WP". **I disagree.** It is the same root cause as the write-tail growth (per-row second-pass writes) and as image-loss boundaries D, E, F, G and H. Fixing the budget and leaving the enrichment pass would fix half of one defect twice.

### 2.6 TDD: red first

| # | Suite | Test name | Red today because |
|---|---|---|---|
| C-1 | `catalogue/domain/catalogue-plan.test.ts` | `two deals with the same store and normalised name produce ONE sku draft` | no plan exists; a batch would be rejected by Postgres |
| C-2 | same | `a resolver rule wins over the fallback concept (Almo Thunfisch → cat food)` | the logic is inside I/O code |
| C-3 | same | `a deal with no sub-category is skipped with a counted reason` | today it is a silent `continue` (`:262`) |
| C-4 | `catalogue/application/resolve-catalogue.test.ts` | `2026-09-24: v3 cutover took 667 s for 1,579 deals — round trips are O(batches), not O(deals)` (fake store counts calls; n = 2,000 → ≤ 50) | one call per deal |
| C-5 | same | `ids are mapped by natural key, not response order` (fake returns rows reversed) | n/a today; guards the new code |
| C-6 | same | `resolver rules unreadable → no concept or sku written, and the result says why` (V-a) | falls back to wrong concepts |
| C-7 | `store.test.ts` | `sku_id rides the main upsert; no per-row UPDATE is issued` | read-back + per-row update |
| C-8 | same | `a deal whose sku batch failed is written without the sku_id column, so its existing link survives` | n/a |
| C-9 | same | `rappen, price basis and crop ride the main upsert (the enrichment pass is gone)` | second pass |
| C-10 | `resolve-catalogue.test.ts` | `a re-run with the same deals issues only upserts and returns the same ids` | idempotency pinned |

Domain tests C-1 to C-3 need no mocks. The existing `v3-cutover.test.ts` "keyed on the NORMALISED name" regressions stay meaningful and are re-expressed as `DealKey` tests: the defect they guard (a raw-name key) is still possible in the new code.

**Blast radius.** New `pipeline/catalogue/` (moved from `v3-cutover.ts`, which is then deleted), `run-pipeline.ts` (step order), `store.ts` (grouping by column set, `sku_id`), `shared/types.ts` `dealToRow`, `write-enrichment.ts` (deleted), `offer-to-unified.ts`. **No schema change.** The web reads `sku_id` through the MVs, which are refreshed after the write as now.

---

## 3. Images: reconciling with TL-IMG

### 3.1 ALDI: concede two points

- **Aspect-ratio guard: adopted.** TL-IMG §1 "Risk": refuse a crop when the page image's aspect is not within ±2% of the PDF page. I verified the same ratios (0.6322 vs 0.6321) but did not turn them into a rule. It belongs in the ACL as an invariant check that yields `absent('region-rejected')` and counts toward coverage. That is better than trusting page numbers alone.
- **Fixtures: capture both `data.json` and `spreads.json`.** I proposed `spreads.json` only. TL is right: the named regression (`data.json carries no page images`) needs the real `data.json` to assert "size 0" against.
- **TL's open measurement** ("does the signed `/resize/rev-…/<sig>/` path stay stable for the week?"). My probe answers the part that matters to us: KW37 and KW38 at1600 URLs still return 200 two weeks later (ARCH-IMG §1.3). We store what we read, so a later rotation of the signature in `spreads.json` does not break an already-stored URL. A 24h re-read diff is still cheap and worth doing once.
- **`spreads.json?version=<cacheToken>`**: agreed. That is what the viewer itself requests.

### 3.2 Alert design

| Element | ARCH-IMG | TL-IMG | Reconciled |
|---|---|---|---|
| Absolute, per retailer, not relative | yes | yes | **Agreed** |
| Name of the declared field | `imageExpectation.minCoverage` | `expectedImageCoverage` | **Concede to `expectedImageCoverage`.** It sits next to `expectedMinimumOffers` in the same naming family (ubiquitous language) |
| Typed measurement, never a string warning | via `degraded` + `degradedReasons` | typed field on the span | **Same idea.** Use one typed `imageCoverage` on the span, and let `degraded` be derived from it, so there are not two carriers |
| Coverage from stored rows too | count query to our own DB | "second figure from stored rows" | **Agreed**, zero retailer fetches |
| Reachability probe (HEAD a sample of stored URLs) | I said "only a liveness sample catches rot" but did not propose one | 3 per retailer after the run | **Concede.** It is the only detector for Volg/SPAR-class rot and for a future ALDI URL change. About 21 HEADs per run to retailers, so it needs the PM's fetch-rule answer (D-1/D-2) |
| Severity | warning, critical only at 0% for a retailer expecting > 0.5 | critical | **Not ours to settle.** Failing the run is a product choice (session summary, PM decision 4). I keep my recommendation: a single-point miss (Coop 0.94 vs 0.95) failing the run would train people to ignore red runs |

### 3.3 Volg: identity yes, storage-side expiry no, generic refresh not yet

- **Agree:** the ACL must model the retailer's stable image identity (Volg `promo_<id>`) separately from the rendition URL. TL-IMG's test "the promo id survives a rendition-hash change" (two fixtures) is a better test than my T-13, and I adopt it.
- **Disagree with "the storage boundary sets `image_url` null when a rendition is older than its expected life".** Storage runs at write time, when the URL is fresh. It cannot null something that dies 15 hours later without a scheduled job. And "expected life" is a guess, since the regeneration cadence is unmeasured (both reports say so). The honest zero-fetch interim belongs **at render**: `product-image.tsx` falls back to the no-image card on `onError`. That handles rot of any cadence for any retailer, needs no schema field, and costs no fetch.
- **Disagree with building a generic reference-refresh step now.** It has two customers. One (SPAR) is behind a legal question the PM may answer "no" (ADR-IMG-4). Build the Volg daily refresh (V-1) if D-2 allows it, reusing the adapter and the normal upsert. If SPAR is approved later, extracting the shared step then costs one refactor. `durability: { expiresAt }` is only needed for SPAR tokens, so it waits for D-3 too.

---

## 4. The guard against adapter tests built on non-captured data

### 4.1 Why the current contract test could not catch ALDI

`port-contract.test.ts:52` calls `parseAldiFlyer(aldiPages, REFERENCE, null)`. It tests the **pure parser** and passes `null` where the page-image lookup goes. The code that actually broke, `createAldiSource` → `findPageImageUrls(data)` (`live-sources.ts:407-429`), is the **composition**, and no test runs it against a real response. My own ARCH-IMG T-5 made the same mistake: "every adapter meets its declared expectation on its committed fixture" would still have called the parser directly. **I correct T-5 here.**

### 4.2 The rule

> **Every adapter is tested at least once through its production composition (`createLiveSources`), fed only by captured responses. A resource the composition requests that has no capture fails the test.**

The source of truth for "what does ALDI read" is the composition code itself. There is no second list to keep in sync.

### 4.3 The mechanism (uses the existing `Transport` port)

`live-sources.ts:57-90` already injects every network call through `Transport` (`options.transport`, `:77`). So:

1. **`ReplayTransport`** (test support): serves each request from `__fixtures__/<retailer>/captures/`, looked up by URL. **A URL with no capture throws `UncapturedRequest(url)`.** No fallback, no synthetic default.
2. **`capture-fixtures` script** (the only writer of that folder): runs `createLiveSources` with a recording transport, one honest fetch per resource, applies the documented trim (for example, strip `text` from `spreads.json`), and writes each file next to a generated `captures.json` entry: `{url, fetchedAt, status, contentType, sha256 of the trimmed bytes, trim}`. That is metadata about the capture, not a copy of the data.
3. **`ReplayTransport` checks `sha256`.** A hand-written or hand-edited capture fails with "not a capture". Edge-case unit tests may still use literals. The rule only says the contract run must use captures.
4. **Contract suite** (`port-contract.test.ts`, extended): for each source from `createLiveSources({ transport: ReplayTransport })`, run `collect()` and assert its own declared `expectedMinimumOffers` and `expectedImageCoverage`. The thresholds are read from the adapter, so they are not restated.

**What it would have done on 2026-09-16:** `createAldiSource` requests `data.json`, gets the real capture, `findPageImageUrls` returns an empty map, image coverage is 0 against an expected 0.8, and the test is **red**. If someone had hand-written a `data.json` in the docs' shape, the sha check would have flagged it.

**Alternatives considered**

| Option | Verdict |
|---|---|
| Reviewer checklist line only (TL-IMG) | Keep it, but it is prose. The d061a30 review passed with a reviewer present |
| A lint that bans inline JSON in adapter tests | Rejected. It blocks legitimate edge-case tests and does not prove a capture exists |
| A hand-maintained list of "resources each adapter reads" | Rejected. A duplicate source of truth that drifts from the composition. That is the exact failure we are guarding against |
| **Replay through the composition + generated provenance (above)** | **Recommended.** CHF 0, offline, reuses the existing port |

**Cost:** one script, one test helper, and re-capturing 7 retailers once (about one fetch per resource, inside the weekly allowance). **Plus** the process step TL-IMG §4 point 5 names: a data-path fix is not done until the first production run shows the effect in the DB. The stored-row coverage figure (§3.2) makes that automatic.

---

## 5. Unified order of work (proposal for the Tech Lead's plan)

Each step is independently green and revertable.

1. **Catalogue batching (§2.2 to §2.4) and enrichment folded into the main upsert (§2.5).** C-1 to C-10, then ARCH-IMG T-7 to T-10. This removes about 950 s from the tail and closes image-loss boundaries D to H.
2. **Re-measure the write tail on the next run. Then derive `WRITE_TAIL_MS` at `DEAL_CAPACITY` and `MAX_CHUNK_MS` from the registry (TL option C plus §1.2), in one change.** Assert the inequality with at least 6 min of real slack.
3. **Replay contract guard (§4)**, then **ALDI** from `spreads.json` with the aspect guard, against the new captures.
4. **Image coverage**: typed span metric, stored-row figure, absolute alert (severity per the PM).
5. **Volg**: promo identity in the ACL, `onError` fallback now, V-1 refresh if D-2 allows.
6. **In parallel with step 1:** the Coop duplicate-products RCA (Tech Lead), and the V-c `regular_price` erasure ruling.

Interim, only if step 1 cannot be verified before a week above ~2,000 offers: §1.3 option B (lower `RUN_DEADLINE_MS` to 24). Not the 18-minute constant.

---

## 6. Changes to the PM decision list

- **Withdrawn:** ARCH-IMG D-5 ("move the Lidl Plus label into the single upsert?"). This is technical and is folded into §2.5. The Tech Lead decides.
- **Unchanged:** D-1 (ALDI `spreads.json` under AP-1), D-2 (Volg daily refresh), D-3 (SPAR), D-4 (alert severity), D-6 (`next/image` and URG).
- **Added to D-1/D-2:** the post-run reachability probe (§3.2) is about 21 HEAD requests per run to retailers. It needs the same fetch-rule answer.

## 7. Open disagreements for the Tech Lead to rule on

1. §1.1: the 18-minute `WRITE_TAIL_MS` against "batch first, then derive at a declared capacity".
2. §1.4: the Coop RCA blocking batching, against running in parallel.
3. §2.5: the enrichment pass retired now, against a separate WP later.
4. §3.3: a storage-side rendition expiry and a generic refresh step, against a render-side `onError` fallback and Volg-only V-1.
5. §2.1 V-c: stop overwriting `sku.regular_price` with null.
