# Tech Lead cross-review, Coop RCA, and unified work plan

**Date:** 2026-09-25 · **Author:** Tech Lead · **Status:** Draft plan. Rulings on technical disagreements are final unless the PM overrides. PM questions are listed in §8 and are **not** decided here.
**Scope:** analysis and design only. No source edits, commits, workflow triggers or database writes. Database access was read-only (`GET` through PostgREST with the service-role key from `.env`, the same method the SRE used). Run logs were read with `gh run view <id> --log`.
**Inputs:** `2026-09-25-architect-missing-images.md` (ARCH-IMG), `2026-09-25-architect-cross-review.md` (ARCH-X), my `2026-09-25-tech-lead-missing-images.md` (TL-IMG) and `2026-09-25-tech-lead-max-chunk-ms.md` (TL-BUDGET), `2026-09-25-sre-post-monday-runs.md` (SRE), `docs/qa/2026-09-25-missing-images.md`.
**Log citations:** R1 = run 35589218267 (09-21), R2 = 35711077054 (09-22), R3 = 35983172760 (09-24). `R3:L4899` means run R3, log line 4899.

---

## 0. Summary

| # | Question | Answer |
|---|---|---|
| A | Is "write the image in the main upsert only" (ADR-IMG-1) safe? | **Yes, with three conditions** (§1.1): the image type must be branded so it can only come from the constructors; `dealToRow` must always emit all five image columns; one test must prove every row it emits satisfies the three image CHECKs. I verified the domain rule is stricter than the DB CHECK and that **0 live rows** break any image rule today. |
| A | Is the "reason for no picture" value object justified? | **Yes, but only if the reason is used**, meaning genuine absences are taken out of the coverage denominator. One label is wrong: SPAR is not `retailer-publishes-none`. Both reports prove SPAR does publish images. It needs its own reason, `withheld-by-policy` (§1.2). |
| B | Does product resolution create duplicate Coop products? | **No. The "Created N new coop products" lines are false counts.** `resolveProducts` reads "all existing products for the store" without paging. PostgREST returns at most **1,000** rows, and Coop has **7,793**. So ~90% of this week's products look new and are **re-upserted onto their existing rows**. Table: **0 duplicate `(store, source_name)` rows in any store**. Real inserts: 09-21 logged 1,248, actual **332**; 09-22 logged 758, actual **3**; 09-24 logged 1,668, actual **147**. The same bug affects Migros, Denner and LIDL (each has more than 1,000 rows). |
| B | Does it drive the v3 slowdown? | **No.** v3 never reads `products` (ARCH-X §1.4 is right). Taxonomy, resolve and storeDeals together take **12–14 s**. The v3 cost is about two awaited round trips per deal, at 128–195 ms each (§2.4). The real duplication is in the **v3 `sku` layer**: 511 store products have skus under more than one concept (532 extra rows, 294 of them Coop), because the concept key includes the classifier's sub-category (§2.5). |
| B | Coop and aktionis | Coop **is** still collected from aktionis. This is deliberate: `coop-aktionis-source.ts:6-19` explains that coop.ch sits behind DataDome. All **1,003/1,003** live Coop deals have an aktionis `source_url` and an image on `storage.cpstatic.ch`. `CLAUDE.md` says "aktionis.ch is dropped", which is wrong for Coop. That is unrelated to the false count, but it matters for D-6 (§2.6). |
| C | One design | Four principles (§3): **one row, one write**; **resolve identity by key set, in batches**; **derive budgets from their inputs, at a declared capacity**; **signals that matter are typed and counted, never free text**. |
| D | `\|` key, dead `offerToRow`, 20-warning cap | Each one resolves inside the four principles (§4). |
| ARCH-X | Five disagreements | **I concede 1, 2, 3 and 4, and agree with 5** (§5). |
| New | Migros garbled names; the orphaned "Worth a look" view | **16 of 49 live Migros names are run together** (e.g. `migrosbiolachsfilets`). The Migros deal *does* have a valid crop in the DB. It shows no picture on the homepage because `worth-picking-up.ts:186` selects only `image_url` (§6). |

---

## 1. Cross-review of the Architect's image design (Task A)

### 1.1 ADR-IMG-1 ("the image is written by the main upsert only"): safe, with conditions

I checked it against the three risks the brief names.

**(a) The existing enrichment path.** Its own reason for being separate is `write-enrichment.ts:8-12`: "the two halves fail independently … folding it into the main write would put every deal at risk to gain a crop rectangle." That is the real risk, and the Architect's answer (ARCH-X §2.5, "the constructors enforce the invariants") is right, **but only partly proven**. What I verified:

| DB rule (`20260911_offer_fields.sql`) | Domain rule (`collection/domain/product-image.ts`) | Is the domain rule at least as strict? |
|---|---|---|
| `deals_crop_fractions` (:89-95): all four NULL, or x,y ∈ [0,1], 0 < w,h ≤ 1 | `cropRegionImage` (:51-63): all four finite in [0,1], w,h ≠ 0, **x+w ≤ 1, y+h ≤ 1**, http(s) URL | **Yes, stricter** |
| `deals_one_image_kind` (:100-102): not both `image_url` and `page_image_url` | `ProductImage` is a two-member union (:28-31) | **Yes, by construction** |

So a `ProductImage` built by the constructors cannot poison a batch. **The gap is TypeScript's structural typing.** Once `ProductImage` moves into `shared/` (ARCH-IMG §4.3), any code can write `{ kind: 'crop-region', region: {…} }` as a literal and skip the constructor. One bad literal then rejects a whole upsert batch, and with it **100 deals' prices**. The batch size is `store.ts:14` `BATCH_SIZE = 100`. ARCH-IMG §3 row H says "50-row batch", but that is the enrichment batch (`write-enrichment.ts:54`).

**Conditions (all technical, all mine):**
1. `ProductImage` is a **branded** type. The brand is declared in `shared/product-image.ts`, and only the collection-domain constructors can produce it. A literal does not compile.
2. `imageColumns(image)` in `dealToRow` is total: it always emits **all five** keys, with nulls when there is no image. That keeps the column set identical across a batch.
3. One property test: *"every row `dealToRow` emits satisfies `deals_crop_fractions`, `deals_one_image_kind` and `deals_crop_complete`"*. The three predicates are written in TypeScript next to the test and cite the migration line numbers. This is the check that replaces the safety the second write used to give.

**(b) The `deals_one_image_kind` CHECK.** Today the only way to break it is a row that changes kind between runs from crop to source-url. WRITE 1 then sets `image_url` on a row that still has `page_image_url`, and the whole 100-row batch is rejected. ADR-IMG-1 removes that possibility, because all five columns are written together. Read-only counts today: `image_url AND page_image_url` = **0**, `page_image_url` without `crop_x` = **0**, `crop_x` without `page_image_url` = **0**. So the Architect's optional `deals_crop_complete` CHECK can be added without violations. **Ruling:** add it, but only **after** WP-1 ships, once the single write is the only writer. It is small, and a `DROP CONSTRAINT` undoes it.

**(c) Batch behaviour.** `storeDeals` dedupes on `(store, product_name, valid_from)` and keeps the highest discount (`store.ts:101-110`). Enrichment keeps the *last* offer (`run-pipeline.ts:255-268`). With the image on the row, the winning row carries **its own** picture, so boundaries D and E disappear. A held-back deal is written later with its image in the same statement, so F disappears. **Agreed.** One consequence to accept knowingly: a collection regression now **overwrites** a good stored crop with null on the next run. That is honest, and WP-3's stored-row coverage figure catches it in the same run.

**Ruling on S-A vs S-B (ARCH-IMG left it to me):** **S-A.** The image travels on `UnifiedDeal` into `dealToRow`. The dormant `storage/domain/deal-row.ts` `offerToRow` and `storage/infrastructure/supabase-deal-store.ts` are **deleted**. Grep confirms they have no production caller. First, any invariant their tests pin that `dealToRow`'s tests do not is ported over. Dead code that maps the same value object is not "duplication over the wrong abstraction". It is a trap for the next builder.

### 1.2 The "reason for no picture" value object: justified, with two amendments

**Is it over-engineering?** It would be if the reason only went into a log. It pays for itself only if it changes a decision the system makes. It does: **genuine absences are removed from the coverage denominator.** Without that, every retailer needs a hand-tuned threshold. ARCH-IMG §4.1 proposes Volg 0.6, which is 17/25 from one week, a copied measurement of exactly the kind TL-BUDGET condemned. With it, one expectation (e.g. 0.95 of *eligible* offers) holds for every retailer that publishes pictures. So I keep it, and it must be used that way.

**Amendment 1: SPAR needs its own reason.** ARCH-IMG's reason list maps SPAR to `retailer-publishes-none` (§4.1, ADR-IMG-4). Its own §2.3 proves the opposite: images exist behind a signed token. A metric that records a policy choice as a retailer fact is the "empty is success" pattern again. Add `withheld-by-policy`. It is excluded from the denominator like `retailer-publishes-none`, but counted separately, so a PM decision on D-3 shows up in the numbers.

**Amendment 2: typed reasons, not `degradedReasons: string[]`** (ARCH-IMG §4.1). A string list is how the ALDI warning got lost (it was entry 35 in a list capped at 20). ARCH-X §3.2 has already moved to "one typed `imageCoverage` on the span, `degraded` derived from it". I accept that version.

**Conceded to the Architect:** my `durability` field and the storage-side expiry rule (TL-IMG §2) are wrong. Storage runs when the URL is fresh, so it cannot null a URL that dies 15 hours later (ARCH-X §3.3). I withdraw both.

---

## 2. Root-cause analysis: "Created 528 / 720 new coop products" (Task B)

### 2.1 The symptom (logs)

| Run / attempt | Log line | "Created N new coop products" | "Updated offer dates on N existing" | Resolved |
|---|---|---|---|---|
| R1 a1 | R1:L2164-2166 | 528 | 38 | 566/566 |
| R1 a2 | R1:L3753-3755 | 720 | 40 | 760/760 |
| R2 | R2:L1300-1302 | 758 | 56 | 814/814 |
| R3 a1 | R3:L2500-2502 | 752 | 65 | 817/818 |
| R3 a2 | R3:L4899-4901 | 916 | 86 | 1002/1004 |

No `Failed to insert product batch` line appears in any of the three logs (grep count 0).

### 2.2 The cause: an unpaged read hits PostgREST's 1,000-row cap

`product-resolve.ts:47-50`:
```ts
const { data: existingProducts } = await supabase
  .from('products').select('id, source_name, product_group').eq('store', store)
```
There is no `.range()`, and PostgREST's `max-rows` is 1,000. Verified read-only:

| Check | Result |
|---|---|
| `products?store=eq.coop` with `Prefer: count=exact` | **7,793** rows |
| The same query without a Range header | **1,000** rows returned |
| `first_seen_at` of those 1,000 | 675 from April, 154 May, 49 June, 44 July, 8 Aug, **70 Sept** |
| Other stores | migros 2,859 · denner 2,728 · lidl 2,583 · aldi 479 · spar 501 · volg 275 |

So the in-memory `existing` map (`:58-61`) holds a mostly-April slice. This week's products are missing from it, go to `newProducts` (`:95-131`), and are sent to `upsert(batch, { onConflict: 'store,source_name' })` (`:148-151`). **The upsert merges them onto their existing rows.** The log at `:169-171` prints `toInsert.length`, which is the number *sent*, not the number *inserted*. This is the third write in this codebase that reports what it intended rather than what the database did. The first two were `writeEnrichment` on 09-11 and the offer-date `Promise.all` (`:176-181`).

### 2.3 Proof that there are no duplicate rows, and what really happened

- **Every row of all 7 stores was paged (1,000 at a time).** Duplicate `(store, source_name)` pairs: **0 in every store** (coop 7,793 rows / 7,793 distinct). So a unique index on `(store, source_name)` exists live. Without one, `ON CONFLICT (store, source_name)` would fail with 42P10 and the logs would show `Failed to insert`. **The repository does not know about that index.** `00000000000000_baseline.sql:68` declares a *non-unique* index, and the baseline says it could not capture indexes (`:14-21`). A rebuild from the repo would break `resolveProducts`. (Added as WP-0.)
- **Real inserts come from `first_seen_at`**, which defaults to `NOW()` and is not in the upsert payload (`:119-130`), so a merge preserves it:

| Date | Coop "Created" (logged) | Coop rows first seen | Migros logged / real | Denner logged / real | LIDL logged / real |
|---|---|---|---|---|---|
| 09-21 | 528 + 720 | **332** | 34+51 / 35 | 89+132 / 32 | 10+19 / 1 |
| 09-22 | 758 | **3** | 51 / **0** | 143 / **0** | 19 / **0** |
| 09-24 | 752 + 916 | **147** | 19+48 / 38 | 124+185 / 91 | 9+33 / 30 |

  Stores under 1,000 rows log honestly. ALDI 09-24: 99 + 47 logged, 146 real.
- Corroboration: 1,002 Coop product rows carry `updated_at` 2026-09-24, which equals R3 a2's 916 "created" plus 86 "updated". That is consistent with every "created" row being an existing row rewritten.
- **Near-duplicates** (same name after NFKC, lowercasing and punctuation stripping): coop 13, migros 43, denner 20, lidl 11, aldi 13, spar 1, volg 0. There are also **2,070 Coop names ending in "…"**, legacy rows from aktionis' title truncation before WP-C3 (the last one was first seen on 09-12). Only **52** of them have a full-name twin so far. So semantic duplication in `products` is under 1%. It is not the cause of anything measured here.

### 2.4 Does it drive the write-tail slowdown? No

| Evidence | Value |
|---|---|
| Taxonomy + resolve + storeDeals (tail start → `Upserted`) | R2: 09:40:43.1 → 09:40:54.8 = **11.7 s**; R3 a2: 11:06:57.2 → 11:07:10.7 = **13.5 s** |
| v3 reads `products`? | **No.** `v3-cutover.ts:260` loops `deals`; the sku key is `deal.productName` (`:276-284`) |

The v3 cutover measured per attempt (from its first and last log lines):

| Attempt | Deals | v3 duration | Linked | ≈ calls (2/deal + links + read-backs) | ms per call |
|---|---|---|---|---|---|
| R1 a1 (L2172→L2173) | 1,039 | 345.8 s | 618 | ~2,707 | ~128 |
| R1 a2 (L3761→L3762) | 1,325 | 388.2 s | 278 | ~2,942 | ~132 |
| R2 (L1308→L1309) | 1,378 | 506.5 s | 62 | ~2,832 | ~179 |
| R3 a1 (L2510→L2511) | 1,173 | 550.7 s | 470 | ~2,828 | ~195 |
| R3 a2 (L4909→L4910) | 1,579 | 667.3 s | 401 | ~3,575 | ~187 |

The tail grows because **calls scale with deal count** and **per-call latency rose from ~130 to ~190 ms** between 09-21 and 09-22. I cannot attribute the latency rise from here (runner-to-Supabase round-trip time? free-tier load?). I record it as **unexplained**. Batching makes it irrelevant, because the call count drops from ~3,500 to ~40.

**Side effect that is real:** a fix to the 1,000-row cap alone would move ~900 Coop rows per attempt from the upsert path into the **per-row offer-date update** path (`:186-205`, `Promise.all` in waves of 100). That adds round trips to the tail. So the cap fix must ship together with batching the offer-date update (WP-1c), not on its own.

**Data-integrity side effect of the bug:** the merge rewrites `canonical_name`, `brand`, `category`, `product_group` and `product_form` on ~900 existing rows per attempt. Any hand curation (for example `20260414_add_offer_dates_to_products.sql:59-90`, `berries → strawberries`) is overwritten by `assignProductGroup` again. **Impact today: none visible to users.** Grep shows the web reads `deals.product_id` only (`supabase-provider.ts:69,132`) and never uses `productId` after mapping it. All 1,623 live deals have a `product_id` (null count 0). It is still a silent-rewrite defect.

### 2.5 The duplication that does exist: v3 `sku` and `concept`

| Table | Rows |
|---|---|
| `concept` | 10,152 |
| `sku` | 10,422, for 9,890 distinct `(store, source_product_id)` |
| store products whose skus sit under **more than one concept** | **511** (532 extra sku rows): coop 294, denner 171, lidl 10, aldi 10, migros 9, spar 9, volg 8 |

Mechanism: `ensureConcept` slugs `subCategory + productName` (`v3-cutover.ts:115`). When the classifier gives the same product a different sub-category in a later run, a new concept and a new sku are minted, and the old sku is orphaned. The "linked N" re-links (R2 62, R3 a2 401) are partly this churn. Coop leads because it has the most products. **This does not slow v3** (the calls are per deal, not per row in the table). It is an identity-design issue for the catalogue context. §3 P2 records it, and it gets a follow-up ADR. It is **not** fixed inside WP-1, because changing the concept key migrates concept ids (a one-way door).

### 2.6 Coop and aktionis

- **Coop is collected from aktionis on purpose**: `live-sources.ts:279-285` → `createCoopAktionisSource`. The rationale is at `coop-aktionis-source.ts:6-19` (coop.ch is behind DataDome; Coop's own epaper covers only ~11%). The listing has no week parameter (`docs/decisions/2026-09-17-publication-editions.md:100`).
- Live: **1,003/1,003** active Coop deals have `source_url` on `www.aktionis.ch` and `image_url` on `storage.cpstatic.ch`. No other store has an aktionis `source_url` (0 each).
- **Relation to the false count:** none. The cause is the 1,000-row cap. Coop is simply the first store to pass 1,000 rows, because aktionis carries ~1,000 Coop deals a week against ~195 in the flyer.
- **Two follow-ups:** (1) `CLAUDE.md` line "aktionis.ch is dropped" is wrong for Coop and needs a documented exception (WP-0). (2) Coop pictures are hotlinked from a **third-party host** that is neither Coop nor basketch, and are then re-encoded by `next/image`. That belongs inside PM question **D-6**, and I add it there without deciding it.

---

## 3. One design for write-tail growth, Coop count, stale budgets and invisible drift (Task C)

These are not four problems. They are four instances of four missing principles. The principles are the compass. Each work package applies one or more of them.

| Principle | Rule | Instances it removes |
|---|---|---|
| **P1: One row, one write** | A deal row is fully assembled (prices in rappen, price basis, image, `product_id`, `sku_id`) **before** one batched upsert. No post-write UPDATE, no re-join by string key. | Enrichment second write (~300 s), v3 read-back + per-row link, image-loss boundaries C–H, the `\|` key split, Map-vs-dedupe mismatch, the cross-statement image CHECK |
| **P2: Resolve identity by key set, in batches** | Look up only the keys in this run (chunked `.in()`, as the classification cache already does at `supabase-classification-cache.ts:297-299`). Never read a whole table, and never one call per item. Map ids back **by natural key**, never by response order. Dedupe drafts before sending. | The 1,000-row cap (`product-resolve.ts:47`), ~3,500 v3 calls, per-row offer-date updates |
| **P2a: Offer facts are overwritten; entity facts are only added** | Columns describing *this offer* (price, image, basis) are written as they are now, nulls included. Columns describing a *long-lived entity* (`sku_id`, `sku.regular_price`, `products.product_group`) are omitted when unknown, never set to null. Mechanism: `storeDeals` and the catalogue store **group rows by column set**, one request per group, which keeps PostgREST's uniform-column rule. | ARCH-X V-c (`regular_price` erased), a failed sku batch unlinking deals (ARCH-X C-8), product curation overwritten (§2.4) |
| **P3: Derive budgets from their inputs, at a declared capacity** | `MAX_CHUNK_MS` = f(registry rpm over the **whole** judge chain, `CHUNK_SIZE`, retry ceiling) + one labelled measured residual. `WRITE_TAIL_MS` = `writeTailBoundMs(DEAL_CAPACITY)`, O(batches). `config.test.ts` asserts the inequality **at capacity** with ≥ 6 min real slack. | Stale `MAX_CHUNK_MS`, stale `WRITE_TAIL_MS`, "green for the wrong reason" |
| **P4: Signals that matter are typed and counted** | Budget drift, capacity exceeded, image coverage, source degradation and write shortfalls are **typed fields in the run snapshot** with alert rules and a `##[warning]` annotation. Free-text warnings stay capped at 20 per span. A structural signal never shares that list. Every write log reports **database-confirmed** counts (rows returned by `.select()`). | Invisible `console.warn` drift (`run-pipeline.ts:873`), the truncated ALDI warning, "Created 916" |

Resulting write tail: `taxonomy → resolveProducts (key-set) → resolveCatalogueIdentity (batched) → storeDeals (one upsert per column-set group; carries image, rappen, basis, product_id, sku_id) → sweep → deactivate → refresh MVs → logRun`. The expected cost is about 60 calls for 1,600 deals, against ~5,100 today. This is the ARCH-X §2.3 design, extended with products (P2) and P2a.

---

## 4. The Task D items

| Item | Ruling | Where |
|---|---|---|
| `\|` in a product name breaks the enrichment key (`write-enrichment.ts:81`; R3:L2506 `invalid input syntax for type date: " 15 cm "`) | The split disappears with the enrichment pass (P1). The regression test stays and moves to the storeDeals level: *"2026-09-24: a product name containing '\|' keeps its prices, basis and picture"*. **Also:** `productLookupKey` (`storage/domain/product-key.ts`) and v3's `${store}\|${name}` are the same primitive obsession. They are never split, so they are safe today, but they become one `DealKey` value object (ARCH-X §2.2). | WP-1 |
| `offerToRow` lossless path unwired | **Delete** after porting its useful assertions (§1.1). | WP-1 |
| Warnings truncated at 20 (`json-telemetry.ts:51`) | The cap stays: per-item warnings can number hundreds. Source-level diagnostics (page-image coverage, degraded) become typed span fields and never enter the list (P4). Test T-6: *"a source-level shortfall is visible after 34 per-item warnings"*. | WP-3 |

---

## 5. Rulings on ARCH-X's five open disagreements

| # | Disagreement | Ruling | Why (evidence) |
|---|---|---|---|
| 1 | 18-min `WRITE_TAIL_MS` (28+12+18+2=60) vs. batch first, then derive at `DEAL_CAPACITY` with ≥ 6 min slack | **Architect is right. I withdraw 18 min.** | At the measured 0.63–0.74 s per deal, 1,080 s covers only 1,460–1,710 deals, and 2,060 offers were seen on 09-17. A constant that is false at a volume we have already observed repeats the root cause I diagnosed myself. `DEAL_CAPACITY = 4,000` (about 2× the peak) is a technical sizing assumption, and I accept it. The `capacity-exceeded` alert makes it falsifiable. **Interim:** Monday runs have collected 1,425–1,435 offers, with a worst attempt of 39.2 min. The high-volume runs are Thursdays (1,650; 2,060). So if WP-1 is **not merged and verified before the Thursday 2026-10-01 run**, apply ARCH-X option B (`RUN_DEADLINE_MS` 24 min) before that run. No interim is needed for Monday 09-28. |
| 2 | Coop RCA blocks batching vs. runs in parallel | **Architect is right on the mechanism**, and §2.4 proves it. The RCA is now done. The *fix* (WP-1c) goes **inside** WP-1, not before it, because fixing the cap without batching the offer-date update would lengthen the tail (§2.4). | |
| 3 | Retire the enrichment pass now vs. later as a separate WP | **Architect is right: now, inside WP-1.** | Same root cause as the tail growth (one round trip per row) and as image-loss boundaries D–H. Doing it later would mean touching `storeDeals` twice. **Process note:** ARCH-X withdraws D-5 ("move the Lidl Plus label into the single upsert?") as technical. I agree that it is a HOW question, since nothing users see changes. It was put to the PM, though, so the coordinator should tell the PM it has been reclassified. The price-basis fold is sequenced as WP-1's **last** step (1e), so an objection costs nothing. |
| 4 | Storage-side rendition expiry + generic refresh step vs. render-side `onError` fallback + Volg-only V-1 | **Architect is right on both.** | Storage cannot expire something that is fresh when written. A render-side `onError` → no-image card handles rot at any cadence, for any retailer, with zero fetches. The generic refresh has one customer (SPAR) whose case waits on D-3. Build Volg V-1 only if D-2 allows it. |
| 5 | V-c: `sku.regular_price` overwritten with null | **Agree. Omit the column when null** (P2a). | Migration `20260427_v3_concept_layer.sql:136` says "null if never observed". Writing null on a week without a printed reference price (ALDI, most weeks) erases an observed shelf price. |

I also accept ARCH-X §1.2 (bound over the whole judge chain, with the Gemini residual labelled "measured, may drift"), §3.1 (aspect guard plus both ALDI fixtures), §4 (replay-through-composition guard with capture provenance, which is better than my "enforced in review"), and V-a/V-b (the catalogue aborts when rules are unreadable).

---

## 6. New data-quality items (from the coordinator)

### 6.1 Migros names run together: `coffeebkaffeemaschineglobe`

- Live row: `store=migros`, `valid_from 2026-09-24`, `page_image_url = image.isu.pub/…/page_22.jpg` (**200 image/jpeg**), crop `(0.502, 0.306, 0.371, 0.115)`. The crop is **valid** (x+w = 0.873, y+h = 0.421) and `sku_id` is set. **The DB has the picture.**
- **It is not a one-off:** **16 of 49** live Migros names contain no space, e.g. `migrosbiolachsfilets`, `optigalpouletgeschnetzeltes`, `britawasserfiltermaxtrapro`, `elmexzahnpasta-kariesschutz`, `lindtminipralines`. Earlier weeks' rows have spaces ("coffeeb kaffeemaschine cosmos"). Word boundaries are lost somewhere between the OCR text line (`migros/ocr.py`) and `findOfferName`/`joinNameParts` (`migros-flyer-source.ts:552-600`). `joinNameParts` itself inserts spaces, so my **hypothesis** is that the OCR line text arrives without inter-word spaces. That is **unverified**. First step: reproduce on the committed Migros fixture.
- Why it matters beyond looks: names are the identity key for products, concepts and skus (§2.5), and the classifier input. `migrosbiolachsfilets` will never match `migros bio lachsfilets` across weeks.

### 6.2 Why that deal shows no picture on the homepage

`web-next/src/server/data/worth-picking-up.ts:186` hydrates pictures with `select('id, image_url')`, and `:265` does the same. **Neither reads `page_image_url` or the crop.** So every crop-region deal (all Migros, and ALDI once fixed) is imageless in "Worth a look", while `supabase-provider.ts` renders the same deal correctly elsewhere. This is a sixth, partial copy of the image mapping. **Given the PM's decision to remove the section, the fix is the removal, not a patch.**

### 6.3 Removing "Worth a look" orphans `worth_picking_up_candidates`

Consumers: `web-next/src/app/[locale]/page.tsx`, `components/landing/WorthPickingUp.tsx`, `server/data/worth-picking-up.ts` and its test. The pipeline refreshes the view every run (`v3-cutover.ts:225`). Dropping a materialized view is a one-way door, and **its definition is not in the repo**: the baseline says views were not captured (`00000000000000_baseline.sql:29-31`). So: (1) remove the web consumers; (2) remove the MV from the refresh list (inside WP-1's catalogue module); (3) **capture the view definition** into a migration comment (read-only `pg_get_viewdef`, run by the PM in the SQL editor), then drop it. `user_interest` and `concept_cheapest_now` need a grep for other readers before anything else is touched.

---

## 7. Work plan

Order follows risk: the write tail first (unretried-kill exposure), then the budget that depends on it, then signals, then images. Each WP ends with the Code Reviewer loop, and with the coordinator verifying the effect **in production data after the first run**. That last step is the process gap TL-IMG §4.5 named.

| WP | Content | First failing test (named after the defect) | Blast radius | Status |
|---|---|---|---|---|
| **WP-0** Glue (docs + schema truth) | (a) `CLAUDE.md`: record the Coop-via-aktionis exception. (b) Record the live unique index on `products(store, source_name)` in a migration (`CREATE UNIQUE INDEX IF NOT EXISTS`, a no-op live). (c) Capture the MV definitions before any drop. (d) Correct the SPAR comment at `live-sources.ts:291-299`: images exist, but are token-gated. | n/a (docs). For (b): an `architecture.test.ts` grep that `product-resolve` depends on a unique index declared in `supabase/migrations` | Docs, 1 migration (no-op) | **Proceed now.** (c) needs the PM to run one read-only SQL query |
| **WP-1a** Catalogue identity, batched | New `pipeline/catalogue/{domain,application,infrastructure}` per ARCH-X §2.2–2.4. `DealKey` value object. Abort when rules are unreadable (V-a/V-b). `regular_price` omitted when null (V-c). Drop the `worth_picking_up_candidates` refresh. `v3-cutover.ts` deleted. | C-4: *"2026-09-24: v3 cutover took 667 s for 1,579 deals — round trips are O(batches), not O(deals)"* (fake store counts calls; n = 2,000 → ≤ 50). Then C-1…C-10 | New module; `run-pipeline.ts` step order; `v3-cutover.ts`(+test) removed. No schema change | **Proceed now** |
| **WP-1b** Row assembly + column-set grouping | `storeDeals` takes `sku_id`, groups rows by column set (P2a). The concept-key churn (§2.5) is counted, not fixed. | C-8: *"a deal whose sku batch failed is written without the sku_id column, so its existing link survives"* | `store.ts`, `shared/types.ts` `dealToRow` | **Proceed now** |
| **WP-1c** Products resolve by key set | Chunked `.in('source_name', …)` lookup. Insert only the missing ones (`ignoreDuplicates`). Offer dates for existing rows as a column-set-grouped upsert, not per-row. Log DB-confirmed inserts. No re-write of `product_group`/`canonical_name` on existing rows. | *"2026-09-24: 7,793 Coop products, PostgREST returns 1,000 — 916 logged as created, 147 were new: an existing product is never re-sent as new"* (fake client capping at 1,000) | `product-resolve.ts`(+test) | **Proceed now** |
| **WP-1d** Image on the main row (ADR-IMG-1) | Branded `ProductImage` in `shared/`. `imageColumns` total. Enrichment loses its image fields. `offerToRow` + `SupabaseDealStore` deleted. | T-7: *"dealToRow writes a crop-region's page url and all four fractions in the main row, image_url null"*, plus the §1.1 property test and T-8…T-10 (T-10 = the `\|` regression) | `shared/types.ts`, new `shared/product-image.ts`, `offer-to-unified.ts`, `write-enrichment.ts`, collection domain type import, 9 test files | **Proceed now** |
| **WP-1e** Retire the enrichment pass | Rappen, `price_basis` and `loyalty_programme` move into `dealToRow`. `writeEnrichment` and `DealEnrichment` are deleted. | C-9: *"rappen, price basis and crop ride the main upsert (the enrichment pass is gone)"*, plus *"a Lidl Plus member price keeps its label when held back one run"* | `write-enrichment.ts` deleted, `run-pipeline.ts`, `offer-to-unified.ts` | **Technically ready.** The coordinator informs the PM of the D-5 reclassification (§5 #3). Built last in WP-1 |
| **WP-1f** `deals_crop_complete` CHECK | Optional migration (ARCH-IMG §4.3). 0 violating rows today. | *"a page image without all four fractions is rejected by the database"* (SQL predicate mirrored in the property test) | 1 migration | **After WP-1d ships** |
| **WP-2** Derived budgets | Per ARCH-X §1.3 + §1.2: `judgePhaseBoundMs` over the chain, `writeTailBoundMs(DEAL_CAPACITY=4000)`, ≥ 6 min slack, `capacity-exceeded` alert. `RUN_SLOW_THRESHOLD_MS` follows (`alerts.ts:153`, `alerts.test.ts:291`). `pipeline.yml:113-135` comments. | TL-BUDGET test 1 (*"judge phase is set by the rate limit…"*), then *"WRITE_TAIL_MS is derived at DEAL_CAPACITY, and doubling PER_BATCH_MS turns the inequality red"* | `resilience.ts`, `classify-deals.ts` (`CHUNK_SIZE` move), 3 test files | **After the first production run with WP-1** (the constants need the new measurement). Interim trigger: §5 #1 |
| **WP-3** Typed signals | Drift and capacity as snapshot alerts + `##[warning]`. Typed `imageCoverage` span field, `degraded` derived from it. Stored-row coverage count (our DB only). The absolute `image-coverage-below-expectation` rule. Structural diagnostics out of `warnings`. | T-6 (*"a source-level shortfall is visible after 34 per-item warnings"*), T-11 (*"retailer at 0% image coverage alerts with NO previous snapshot"*) | `json-telemetry.ts`, `run-snapshot.ts`, `alerts.ts`, `run-pipeline.ts:873` | **Proceed now.** Only the **severity** line waits on **D-4** |
| **WP-4** Image domain | `OfferImage` absent reasons, including `withheld-by-policy` (§1.2). `expectedImageCoverage` on each source, measured over *eligible* offers. | T-1 (*"an offer with no picture says why — never a bare null"*), T-2 | `collection/domain/*`, all 7 adapters (one constant plus reasons) | **Proceed now** |
| **WP-5** Replay contract guard | `ReplayTransport` + `capture-fixtures` script + sha provenance (ARCH-X §4). Re-capture 6 retailers now, one fetch per resource. | *"every adapter meets its declared minimum offers and image coverage through createLiveSources on captured responses"* (red for ALDI) | test-support, `port-contract.test.ts`, `__fixtures__/*/captures/` | **Proceed now**, except the ALDI `spreads.json` capture (**D-1**) |
| **WP-6** ALDI pictures from `spreads.json` | Map by explicit page `number`, aspect guard ±2%, both fixtures. | T-3 / TL-IMG §1 red test: *"2026-09-25 regression: data.json carries no page images — they come from spreads.json"* | `aldi-flyer-source.ts`, `live-sources.ts`, fixtures | **BLOCKED on D-1** (third fetch under AP-1) |
| **WP-7** Volg | (a) The ACL models `promo_<id>` identity. (b) `product-image.tsx` `onError` → no-image card. (c) V-1 daily refresh. | (a) *"Volg 2026-09-25: the promo id survives a rendition-hash change"* (two fixtures). (b) *"a photo that 404s renders the no-image card, not a broken image"* | `volg-html-source.ts`, `product-image.tsx` | (a)(b) **proceed now** ((b) gets a quick Designer check, since it reuses the existing no-image card). (c) and the V-0 cadence probe are **BLOCKED on D-2** |
| **WP-8** SPAR pictures | Token-gated iPaper pages. | (only if approved) *"a page reference whose policy expires before validity.to is refused"* | — | **BLOCKED on D-3** |
| **WP-9** `next/image` and URG | Plain `<img>` for all retailer photos, or a recorded exception. Now also covers Coop photos from a third-party host (§2.6). | — | `product-image.tsx` | **BLOCKED on D-6** (legal) |
| **WP-10** Migros run-together names | RCA first on the committed fixture, then fix at the ACL. | *"Migros KW39: 'CoffeeB Kaffeemaschine Globe' keeps its word boundaries"* | `migros/ocr.py` and/or `migros-flyer-source.ts` | **Proceed now** (RCA, then fix) |
| **WP-11** Remove "Worth a look" | Remove the web consumers, then drop the MV after WP-0(c) capture. | *"the homepage renders without the Worth-a-look section and issues no worth_picking_up_candidates query"* | `page.tsx`, `WorthPickingUp.tsx`, `worth-picking-up.ts`(+test), 1 migration | **Proceed** (the PM has decided removal). The drop waits for WP-0(c) |
| **Follow-up ADR** | Concept identity must not include a classifier output (§2.5; 511 churned identities). A one-way door. | — | catalogue module, data migration | **Design only**, after WP-1 |

**Sequencing (finish before starting):** WP-0 → WP-1a → 1b → 1c → 1d → 1e → *one production run, measured* → WP-2 → WP-3 → WP-4 → WP-5 → (WP-6 when D-1 is answered) → WP-7a/b → WP-10 → WP-11 → WP-1f. WP-10 and WP-11 touch different modules and can go to a second builder in parallel with WP-1 without shared files.

**Cost:** CHF 0. No new paid service, no schema change except the optional CHECK, the no-op index record and the MV drop.

---

## 8. Blocked on PM decisions (not decided here)

| Id | Question | Blocks |
|---|---|---|
| D-1 | ALDI: a third request (`spreads.json`) per publication. Is that within AP-1 "one fetch per store per week"? | WP-6, the ALDI part of WP-5 |
| D-2 | Volg: a daily image-only refresh (+5–6 fetches/week), or accept imageless/rotting cards? Includes the V-0 cadence probe and the post-run HEAD reachability sample (~21 HEADs per run to retailers, ARCH-X §3.2) | WP-7c, the reachability probe |
| D-3 | SPAR: stay imageless, or ask SPAR's permission? (The signed-token route needs a legal view) | WP-8 |
| D-4 | Image-coverage alert severity: warning, or fail the run? | The severity line of WP-3 |
| D-5 | *Proposed for withdrawal as technical* (ARCH-X §6, agreed in §5 #3). The PM only needs to confirm it is not a product question | WP-1e (sequenced last) |
| D-6 | Legal: retailer photos through `next/image` (re-encoded and cached on Vercel), now including Coop photos served from the third-party host `storage.cpstatic.ch` | WP-9 |

## 9. Self-check

- Every number above comes from a log line, a file:line, or a read-only DB count run on 2026-09-25. The only inference is the per-call latency in §2.4, and it is labelled as unattributed.
- No product decision is taken. D-5 is flagged, not decided.
- Where the Architect was right (18 min; storage expiry; durability; generic refresh; enrichment timing; review-only fixture rule), this document says so and withdraws my position.
