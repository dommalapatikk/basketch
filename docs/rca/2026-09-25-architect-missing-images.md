# Missing product images: architect's investigation and design

**Date:** 2026-09-25 · **Author:** Solution Architect · **Status:** Proposed. The Tech Lead cross-reviews it, then the PM decides the items in §9.
**Scope:** investigation and design only. No source edits, commits, workflow triggers or database writes were made. Database access was read-only `SELECT` through PostgREST. Live-site probes were single GETs/HEADs with an honest UA.
**Inputs:** `CLAUDE.md`, `docs/collection-module-design.md`, `docs/data-source-research-2026-09-07.md`, `docs/qa/2026-09-25-missing-images.md`, GitHub Actions logs for runs 35983172760, 35711077054 and 35589218267, live `deals` and `pipeline_runs`, and the live retailer endpoints.

> **Independence note.** I reached every conclusion below from my own evidence. After I had finished, I saw that `docs/rca/2026-09-25-tech-lead-missing-images.md` exists. I only read its one-line ALDI summary, which matches §2.1. Cross-review comes next.

---

## 0. Summary

| # | Symptom | Root cause (verified) | Where the image became null | Class |
|---|---|---|---|---|
| 1 | ALDI 211/211 imageless | `findPageImageUrls` looks for a page-image shape that the live catalogue `data.json` **does not contain**. The shape came from Publitas REST docs, and the only test fixture is synthetic. The real per-page images are in `spreads.json`. **No ALDI row has ever had a crop: 0 of 517.** | Collection ACL (the adapter). Nothing downstream lost it. | Built against documentation, not a captured response. The shortfall warning existed but was cut off by the telemetry cap. |
| 2 | Volg 17 URLs 404, 7 null | Volg regenerates `fileadmin/_processed_/…csm_promo_<id>_de_<hash>.jpg` with a **new hash** at least once a day. The 7 nulls are **genuine**: Volg's own page has an empty image slot for them. | Nowhere in our code. The URL is correct when collected and goes stale after that. | Treating a source URL as an identity when it is only a short-lived rendition. |
| 3 | SPAR 60 imageless | By design since c337031. Per-page images **do exist** (`cdn.ipaper.io/…/Pages/<n>/Zoom.jpg`), but only with a **signed token that expires within about 23h**. Without it they return 403. | By choice, at the ACL. | Access-controlled asset. Legal and product call. |

Three independent causes, and one systemic gap. **In the domain, "no picture" is a bare `null` that carries no reason, and no run-level invariant measures image coverage per retailer.** So a retailer that never had an image and a retailer that just lost them both look like "ok".

---

## 1. Evidence base

### 1.1 Production state (read-only, 2026-09-25)

Counts are live (`is_active=true`, `valid_to>=2026-09-25`) and "with image" means `image_url` or `page_image_url` is not null. These match the QA table exactly.

| Store | Live | With image |
|---|---|---|
| coop | 1003 | 1003 |
| denner | 241 | 241 |
| lidl | 35 | 35 |
| migros | 49 | 49 |
| **aldi** | **211** | **0** |
| **spar** | **60** | **0** |
| volg | 24 | 17 (all 404) |

- `deals?store=eq.aldi&page_image_url=not.is.null` → `content-range: */0`. `store=eq.aldi` → `/517`. **No ALDI row in history has ever had a crop.**
- ALDI rows *were* touched by enrichment. Sample row `cashew- erdnuss-mix`: `sale_price_rappen=299`, `updated_at 2026-09-24T11:11:22Z`, `page_image_url=null`. The second write reached the row and wrote a null crop, so **the crop was already null when collection produced it.**
- The 69 SPAR rows that have `page_image_url` are all `GetPDF.ashx` URLs with `is_active=false` (valid_from 2026-09-10). They are left over from before c337031 and are not live.

### 1.2 Run 35983172760 (2026-09-24), two attempts

- Collection: `ok aldi 163 offers 35 warnings`, `ok volg 25`, `ok spar 65 offers 15 warnings` (log L369–375).
- NDJSON span for ALDI: `"warningCount":35`, and the `warnings` array holds **20** entries, all of them `price … has no product name below it` (L364).
- Attempt 1: `enrichment: 451 of 1631 matched NO row` (L2508), with `held back by reason: not-attempted=451` (L1653). **The misses equal the held-back count exactly.** They are the cold-start deferral, not a key defect.
- Attempt 2: `69 of 1631 matched NO row`, then `enriched 1561/1631`.
- Both attempts: `enrichment failed for "disney stitch plüschtier sound and scent small plush": invalid input syntax for type date: " 15 cm "` (L2506). This is a real, separate key defect: the product name contains `|`, and `write-enrichment.ts:81` splits the key on `|`.

### 1.3 Live source probes (2026-09-25)

| Probe | Result |
|---|---|
| `catalog.aldi-suisse.ch/aldiwoche_kw39-2026_de/data.json` | 200, 33 KB. Top-level keys include `sizes`, `coverScreenshot`, `numPages:38`, but **no `/pages/<40-hex>` path anywhere** (grep count 0) |
| `findPageImageUrls(<that data.json>)`, run with the repo's own code via tsx | **size 0**. `pageImageCoverageWarning(38 pages)` returns `"page-image count (0) does not match the PDF's own page count (38)…"` |
| `…/spreads.json` (KW39) | 200, 195 KB, 20 spreads, **38 pages**. Each page has an explicit `number` and `images.{at200…at2400}`, e.g. `/resize/rev-95488569/<sig>/fit-in/1272x2012/…/95562/3359945/pages/<uuid>-downscaled.jpg` |
| That at1600 path on `view.publitas.com` and on `catalog.aldi-suisse.ch` | 200 `image/jpeg`, `cache-control: public, max-age=31536000, immutable` |
| KW37 and KW38 `spreads.json` → page-2 at1600 | both still 200, so the URLs are **durable for at least two weeks after publication** |
| Aspect check | at1600 is 1272×2012 = 0.6322, and the `data.json` page size is 501.73×793.70 pt = 0.6321. Crop fractions from PDF points map onto it directly |
| Stored Volg URL `…/csm_promo_76055_de_31525dee73.jpg` (written 2026-09-24 11:11Z) | **404**, direct and through `basketch.vercel.app/_next/image` |
| Live Volg page, same product | `…/csm_promo_76055_de_cf7a155d33.jpg` → 200, `last-modified: Fri, 25 Sep 2026 01:19:37 GMT`. **Same promo id, new hash**, regenerated overnight |
| Live Volg page, all 25 `c-product` blocks | 17 have an `<img>`. 7 (Langnese, Traubenzucker, Ferrero, Cailler, Coca-Cola, Trockenfrüchte ×2) have an **empty `c-product__image` div**. The last block (Finish) only picks up the footer logo, which the adapter already filters |
| Original-file guesses (`fileadmin/user_upload/promo_76055_de.jpg` etc., 4 paths) | all 404. There is no stable original to point at |
| SPAR viewer `angebote.spar.ch/flugblatt/2026/spar-angebote-kw39-2026/` | 200. The embedded config has `aws.url = cdn.ipaper.io/iPaper/Papers/1ef1c2d6-…/` and `policy = token=…&token_path=/iPaper/Papers/<guid>/Pages/&expires=1790422558` (= 2026-09-26T11:35:58Z, about 22.6h after the probe) |
| `…/Pages/1/Zoom.jpg` / `Normal.jpg` / `Thumb.jpg` | **403 without the token**, 200 `image/jpeg` with it (357 KB / 172 KB / 12 KB) |

---

## 2. Root cause per retailer

### 2.1 ALDI: the collection ACL reads a shape that does not exist

The chain, with citations:

1. `live-sources.ts:409-429` (`createAldiSource`) fetches `data.json`, calls `findPageImageUrls(data)`, and returns `pageImages.get(n) ?? ''`.
2. `aldi-flyer-source.ts:314` looks for `PAGE_IMAGE_PATH = /"(\/\d+\/\d+\/pages\/[0-9a-f]{40})"/g`. The live `data.json` has no match (§1.3), so the map is empty.
3. `aldi-flyer-source.ts:191`: `image: pageImageUrl ? tileToCropRegion(…) : null`. Since `''` is falsy, `image` is null for all 163 offers. The domain accepts that because `offer.ts:36` types it as `readonly image: ProductImage | null`.
4. `aldi-flyer-source.ts:406-407` does push the coverage warning. It is pushed **after** the 34 parse warnings, and `json-telemetry.ts:49-51` keeps only `span.warnings.slice(0, 20)`. **The one warning that named the defect sat in position 35 and was never shown.** No alert reads warnings.
5. The tests pass because `aldi-flyer-source.test.ts:56-91` builds JSON "doc example verbatim" from `developers.publitas.com/docs/rest-v1.html`, which is a different, authenticated API. There is **no captured `data.json` fixture**: `aldi/__fixtures__/` holds only `catalog-kw37-pages3-6.xml`. That breaks the approved TDD rule "adapter by adapter against captured fixtures" (`CLAUDE.md` § TDD step 3).

**Conclusion:** this is not a regression. The 2026-09-16 fix (c337031) never worked in production. Nothing lost the image between the collection and storage modules. The collection module produced null and called it success.

### 2.2 Volg: correct URL, short-lived rendition

- The adapter (`volg-html-source.ts:243-245`) stores exactly what Volg serves. On 2026-09-24 11:11Z the upsert wrote that day's hashes (all 24 rows show `updated_at 2026-09-24T11:11`). By 2026-09-25 01:19Z Volg had regenerated the renditions under new hashes, and the old ones return 404.
- Volg is collected twice a week, Mon and Thu (AP-1, `docs/rca/2026-09-15-final-plan.md:25`). **If** regeneration is nightly (one observation so far, `last-modified 01:19 GMT`), a Volg image lives from about 05:00Z on the run day to about 01:19Z the next day. That is roughly 40 of 168 hours a week, and 0 hours from Friday to Sunday, which is the main shopping window.
- The 7 nulls are not a defect. Volg publishes no picture for those promos (§1.3).
- **Unverified and needed before building:** the regeneration cadence (nightly, or on every CMS publish). A 3-probe measurement over 3 days settles it (§8, V-0).

### 2.3 SPAR: images exist, behind an expiring signed token

- c337031's premise, "no evidence SPAR publishes page images" (`live-sources.ts:291-299`), is **out of date**. They are published, but only through a signed policy (`token`, `token_path`, `expires`), and an unsigned request gets 403.
- A stored URL would carry a token that dies within a day, so it has the same staleness as Volg plus a worse property: **we would be handing visitors an access credential outside the context it was issued for.** `CLAUDE.md` § Legal forbids circumventing a technical protection measure. A signed, expiring URL is at least arguably one. I do not recommend using it (ADR-IMG-4).

---

## 3. The ProductImage journey, and every boundary where it can silently become null

C4 component level. Each arrow is a module boundary.

```
 Retailer ──► [Collection ACL: adapter] ──► Offer.image : ProductImage | null
                   │  (A) '' url / tileToCropRegion err → null, no reason
                   │  (B) coverage warning truncated by telemetry cap
                   ▼
 [run-pipeline buildCollectOutcome]
     ├─ offerToUnifiedDeal ──► UnifiedDeal.imageUrl (source-url ONLY)      (C) CropRegion dropped here by design
     └─ dealStoreEnrichment ─► Map<"store|name|from", DealEnrichment>      (D) Map collision: last offer wins
                   ▼
 [transform: normalise → grocery filter → classify (may HOLD BACK) → taxonomy → resolve]
                   ▼
 [storage WRITE 1: storeDeals upsert] image_url only                        (E) dedupe keeps highest discount — its crop is not the one in (D)
                   ▼
 [storage WRITE 2: writeEnrichment UPDATE … WHERE store,name,valid_from]    (F) held-back row → no match → crop lost this run
                   │                                                        (G) name contains '|' → key split breaks → failed
                   │                                                        (H) CHECK deals_one_image_kind spans two writes
                   ▼
 [deals row] image_url XOR (page_image_url, crop_x..h)
                   ▼
 [web: supabase-provider.toCropRegion → ProductImage component]            (I) invalid crop → null (logged)
                   ▼
 Visitor browser: <Image> (source-url, via /_next/image) | <img> + CSS crop  (J) source URL rotted → broken image
```

| Boundary | Code | What goes wrong | Evidence it happened |
|---|---|---|---|
| A | `aldi-flyer-source.ts:191`, `spar-flyer-source.ts:145`, `migros-flyer-source.ts:850`, `tile-locator.ts:140` | Every failure to build an image becomes `null`, with no reason recorded. "Retailer published none" and "we failed to build it" cannot be told apart. | ALDI 163/163 (§2.1) |
| B | `json-telemetry.ts:51` | A structural warning is dropped because it arrives after 20 per-item warnings | ALDI run log L364 |
| C | `offer-to-unified.ts:42-44` | The CropRegion is removed from the main write. The stated reason, "has no single url", is not a real one: `minQuantity` crosses the same boundary flat (`offer-to-unified.ts:47-58`) | by design |
| D | `run-pipeline.ts:255-268` | `pendingEnrichment.set(key, …)` keeps the last of two offers that share a natural key. `write-enrichment.ts:35-42` already documents this | latent |
| E | `store.ts:101-113` | Upsert dedupe keeps the **highest-discount** row. Enrichment (D) keeps the **last** row. When the two differ, the row gets **another offer's crop**, a wrong picture, which is worse than none | latent: 17 collapses in the 09-24 run (L4903) |
| F | `write-enrichment.ts:120-127` | A row the classifier held back is not in the table yet, so the UPDATE matches nothing and the crop waits for the next run | 451 misses = 451 held back (L1653, L2508) |
| G | `write-enrichment.ts:81` | `e.key.split('|')`: a `|` in the product name shifts the columns | L2506 |
| H | `20260911_offer_fields.sql:100-102` + two writes | The "exactly one kind" invariant spans two statements. If a row's image kind changes between runs (source-url to crop), WRITE 1 violates the CHECK and **rejects its whole 50-row batch** | latent |
| I | `web-next/src/server/data/supabase-provider.ts:154-170` | Defensive by design, and logged. Acceptable | none observed |
| J | `web-next/src/components/ui/product-image.tsx:27-38` | Nothing validates liveness | Volg (§2.2) |

### 3.1 Is image data owned by the right module?

**No, and that is the architectural finding, separate from the ALDI trigger.** `ProductImage` is one value object (`product-image.ts:28-30`, "exactly one of") and the database enforces it as one invariant. The write path splits it in two: the `source-url` half goes through WRITE 1 and the `crop-region` half through WRITE 2. The reason given for the split (`write-enrichment.ts:8-12`: "the two halves fail independently") was about protecting prices from a crop failure. It does the reverse for images: **one domain value now has two owners, two keys, two failure modes, and a cross-statement invariant.**

The CHECK constraint is also incomplete. It forbids both kinds together, but it does not stop a `page_image_url` without coordinates, or coordinates without a page (`20260911_offer_fields.sql:89-102`).

A third, dormant copy also exists: `storage/domain/deal-row.ts:87-126` (`offerToRow`) and `storage/infrastructure/supabase-deal-store.ts:51`. That is a complete single-write Offer→row mapper that already writes all five image columns together. Only its own tests import it, so production never uses it (grep: `composition.ts` wires `writeEnrichment`, not `createSupabaseDealStore`).

**Where the image shape exists today:** (1) `collection/domain/product-image.ts`, (2) `DealEnrichment` in `offer-to-unified.ts:63-74`, (3) `DealRow` in `storage/domain/deal-row.ts:43-48`, (4) `web-next/src/lib/domain/crop-region.ts` (a deliberate mirror), and (5) the web `DealRow` in `supabase-provider.ts:29-43`. The design below **removes two of these (2 and 3) and adds none.**

---

## 4. Domain design (DDD)

### 4.1 Aggregate and value objects

`Offer` stays the aggregate root and keeps sole ownership of its picture. Two changes:

**VO-1: `ProductImage` becomes total, meaning it always says what it is.** The comment at `product-image.ts:1-2` already promises "never neither-when-one-was-expected", but no code enforces it. Absence becomes a value with a reason, not a `null`:

```ts
// collection/domain/product-image.ts
export type ImageAbsenceReason =
  | 'retailer-publishes-none'   // Volg's empty c-product__image slot; SPAR by policy (§9 D-3)
  | 'page-image-unresolved'     // we had a crop box but no page image for that page (the ALDI defect)
  | 'region-rejected'           // tileToCropRegion / cropRegionImage refused the box

export type OfferImage =
  | ProductImage                                        // source-url | crop-region, unchanged
  | { readonly kind: 'absent'; readonly reason: ImageAbsenceReason }
```

`Offer.image` becomes `OfferImage`, and a bare `null` no longer compiles. Adapters must name *why* there is no image. `tileToCropRegion` returns `Result<ProductImage>`, not `ProductImage | null`, so the adapter decides the reason. **No new column.** At the storage ACL, `absent` maps to all image columns null, exactly as today. The reason lives in the run metrics (§6), not the table. That keeps the change reversible (a two-way door).

**VO-2: `ImageExpectation`, declared by each source next to `expectedMinimumOffers`.** The ACL is the only place that knows what its retailer publishes:

```ts
// collection/domain/offer-source.ts  (OfferSource gains one readonly field)
readonly imageExpectation: { readonly minCoverage: number }   // 0..1, share of offers carrying a ProductImage
```

Proposed values (thresholds are PM-visible, see §9 D-4): coop 0.95, denner 0.95, lidl 0.95, migros 0.8, aldi 0.8, volg 0.6 (17/25 measured), spar 0 (unless D-3 changes). `collected()` (`offer-source.ts:103-112`) already turns one quality ratio into `degraded` (`truncatedNameShare`). Image coverage becomes the second ratio in the **same** mechanism, so there is no new channel. `degraded: boolean` gains `degradedReasons: readonly string[]` so the step summary (`json-telemetry.ts:115-135`, which already renders degraded sources) can say *why*.

### 4.2 ACL fixes per retailer

**ALDI (ADR-IMG-2).** `AldiSourceDeps` gets page images from `spreads.json` (same publication, deterministic URL `catalogPageUrl(y,kw)+'spreads.json'`). Map each page by its **explicit `number`** field, never by order, which removes the "shifted mapping" risk that `findPageImageUrls` guards with dedupe plus a count check. Use the `at1600` rendition on the host the catalogue itself uses (`catalog.aldi-suisse.ch` or `view.publitas.com`, both 200). Delete `findPageImageUrls` and `PAGE_IMAGE_PATH`: that shape does not exist. Keep a page-count cross-check against the PDF, but it now degrades the source (VO-2) instead of appending a warning.

**Volg (ADR-IMG-3).** The ACL records the *stable* identity it already sees (`promo_<id>_de`) as part of the image provenance, and each absent slot as `retailer-publishes-none`. How the URL stays fresh is a PM decision (§9 D-2), because every durable option costs fetches that AP-1 currently forbids.

**SPAR (ADR-IMG-4).** No change to behaviour. The adapter emits `absent('retailer-publishes-none')` and the comment at `live-sources.ts:291-299` is corrected: images exist but are token-gated.

### 4.3 Storage boundary (ADR-IMG-1): one owner, one write

`ProductImage` crosses into storage **once, in the main upsert**:

- `UnifiedDeal` (`shared/types.ts:465-487`) gets `image: ProductImage | null` in place of `imageUrl: string | null`. `ProductImage`/`CropRegion` **move into the shared kernel** (`shared/product-image.ts`). `collection/domain/product-image.ts` keeps the constructors and invariants, and re-exports nothing (no barrel) but imports the type. The collection domain already depends on `shared/types` (`offer.ts:17`, `offer-source.ts:12`), so the import direction is unchanged. **This is a move, not a copy.**
- `dealToRow` (`shared/types.ts:952-1002`) writes all five image columns from one function, `imageColumns(image)`, the single place that maps `width/height` to `crop_w/crop_h`. Because every row in a batch carries the same column set, PostgREST's uniform-column rule holds.
- `DealEnrichment` loses its five image fields. WRITE 2 keeps rappen and price basis for now (see §9 D-5 about moving those too).
- `storage/domain/deal-row.ts` + `supabase-deal-store.ts`, the unwired third copy, is deleted, or else becomes the single write path. That is the Tech Lead's call (alternative S-B in ADR-IMG-1).

Result: boundaries C, D, E-for-images, F-for-images, G-for-images and H disappear. The upsert's dedupe keeps the winning row **with its own image**. A held-back deal is written later with its image in the same statement.

**Optional migration (a small one-way door, verify zero violating rows first):**
```sql
ALTER TABLE deals ADD CONSTRAINT deals_crop_complete CHECK (
  (page_image_url IS NULL) = (crop_x IS NULL) AND (crop_x IS NULL) = (crop_y IS NULL)
  AND (crop_y IS NULL) = (crop_w IS NULL) AND (crop_w IS NULL) = (crop_h IS NULL));
```

---

## 5. ADRs

### ADR-IMG-1: ProductImage is written by the main upsert, never by a second pass
**Status:** Proposed · **Door:** two-way (no schema change, reversible in one PR)
**Context:** §3, §3.1. One VO, two owners, a cross-statement CHECK, a string key that breaks on `|`, and a Map/dedupe mismatch that can attach the wrong picture.
**Decision:** The image travels on `UnifiedDeal` into `dealToRow`. The enrichment pass no longer carries image columns.

| Criteria (weight) | S-A: image in main upsert (**chosen**) | S-B: wire `offerToRow`/`SupabaseDealStore` as the only write | S-C: keep 2nd pass, harden (structured key, per-retailer miss count, retry held-back) |
|---|---|---|---|
| Removes the loss surface (3) | 5×3=15 | 5×3=15 | 2×3=6 (keeps D/E/H) |
| Blast radius (3) | 4×3=12 (≈2 prod files + tests) | 1×3=3 (classification and v3 operate on `UnifiedDeal`/`Deal`; a rewrite) | 5×3=15 |
| Copies of the image shape (2) | 5×2=10 (−2) | 4×2=8 (−1) | 1×2=2 (+0, keeps all) |
| Fits DDD "invariant in one place" (2) | 5×2=10 | 5×2=10 | 1×2=2 |
| **Total** | **47** | 36 | 25 |

**Consequences:** image columns are rewritten on every upsert (the correct behaviour, since that is today's truth). A regression in collection now *overwrites* a good stored crop with null on the next run. That is honest, and §6 alerts on it.

### ADR-IMG-2: ALDI page images come from `spreads.json`, keyed by explicit page number
**Status:** Proposed · **Door:** two-way
**Alternatives:** (a) keep scanning `data.json`: it has no page images (§1.3); (b) `coverScreenshot`/`/screenshots?…&s=<sig>`: page 1 only, and signed with a `ts`; (c) render the PDF and host the crops: forbidden by URG and ADR "Option B" (`collection-module-design.md` § Product images).
**Consequences:** one extra GET per ALDI publication. It fetches a different resource of the same publication once, not the same one again, so **in my reading it is within AP-1, but the PM should confirm (§9 D-1).** The URLs are immutable for at least two weeks (KW37 is still 200), which covers each offer's life.

### ADR-IMG-3: Volg image freshness. Options for the PM, with my recommendation
**Status:** Needs PM decision (D-2) · **Door:** two-way

| Option | How | Fetches | Verdict |
|---|---|---|---|
| V-1 Daily Volg image refresh | A Volg-only daily job (about 03:00Z, after regeneration) re-parses the same page and upserts `image_url` by natural key through the **normal** path | +5 per week to Volg | **Recommended if D-2 allows.** It reuses the adapter and the write path. Volg has no terms document (research §369-371) |
| V-2 Resolve at render | web-next fetches Volg HTML server-side (cached), maps promo id to the current URL | per cache window | **Rejected.** It puts collection inside the web tier (a boundary violation) and makes the fetch count depend on traffic |
| V-3 Validate at collection (HEAD each URL) | — | +17 per run | **Rejected as a fix.** The URLs are valid at collection time and die afterwards |
| V-4 Honest empty for Volg | the ACL emits `absent`, or the web hides a failed `<img>` | 0 | Fallback if D-2 says no |
| V-5 Crop from the Volg PDF | — | — | **Rejected.** A PDF is not a hotlinkable raster, and rendering it would re-host the image (URG) |

### ADR-IMG-4: SPAR stays imageless. Do not hotlink token-gated iPaper pages
**Status:** Proposed. Legal reading for the PM (D-3). **Door:** one-way in legal exposure.
**Context:** §2.3. The images exist, gated by a signed URL with an `expires` about 23h out, and return 403 without it.
**Alternatives:** (a) scrape a fresh token each run and store tokenised URLs: dead within a day, and it redistributes an access credential; (b) re-fetch the token at render time: same concern plus a web-tier scrape; (c) ask SPAR for permission or a feed: the only clean route to images.
**Decision:** keep `absent('retailer-publishes-none')`. Correct the misleading comment.

### ADR-IMG-5: image coverage is a declared, absolute, per-retailer run invariant
See §6.

---

## 6. Observability: the invariant that would have caught "a whole retailer lost every image"

**Why the existing rule could not have caught ALDI.** `alerts.ts:269-279` (`source-shape-changed`) is **relative**: it only fires when coverage *was* above 0.5 in the previous snapshot. ALDI never had an image, so a relative rule stays silent forever. The invariant has to be **absolute, against a declared expectation.**

**Design (no new table, no new channel, no new copy):**

1. **At the source (collection).** `collectedWithYieldCheck` computes `imageCoverage = offers with a ProductImage / offers` and marks the source `degraded` with reason `image-coverage 0.00 < 0.80` when below `imageExpectation.minCoverage`. This reuses `degraded` (`offer-source.ts:111`), and it already reaches the NDJSON (`json-telemetry.ts:54`) and the step summary (`json-telemetry.ts:115,131-135`). Nothing can truncate it, because it is not a warning.
2. **In the run snapshot.** `run-snapshot.ts` adds `imageCoverage: Partial<Record<Retailer, number>>`, computed exactly like `publishedDataCoverage` (`run-snapshot.ts:92-108`) from `collectedOffers`, plus a per-retailer count of absence reasons. It is stored in `pipeline_runs.metrics` (JSON), so no migration is needed.
3. **Alert rule.** In `alerts.ts`, `image-coverage-below-expectation` fires when `imageCoverage[r] < expectation[r]`, **with no dependency on the previous snapshot**. Severity is PM decision D-4. Under AP-7 a *critical* fails the run.
4. **End to end (recommended, cheap).** After the write, one `count=exact` HEAD request per retailer for "live rows with an image" (7×2 requests to our own Supabase, zero to retailers), compared with (2). It catches any future loss **after** collection. It is the automated version of the QA measurement that found this.
5. **Telemetry fix.** `json-telemetry.ts:51`: the 20-warning cap is fine for per-item warnings, but a source-level diagnostic must never share that list. Point 1 makes this structural by construction. The regression test is §7 T-6.

What each loss would have produced:

| Loss | Caught by |
|---|---|
| ALDI data.json shape (this incident) | 1 (degraded run on 2026-09-17), 3 (alert) |
| A crop lost in storage (a future D/E/F/H) | 4 |
| Volg URL rot | none of the above. Only a liveness sample catches rot, and that costs retailer fetches (§9 D-2). V-1 removes the need |

---

## 7. TDD: the failing tests that pin each behaviour (write these red first)

Named after the real defect, per `CLAUDE.md` § TDD step 4.

| # | Suite | Test | Red today because |
|---|---|---|---|
| T-1 | `collection/domain/product-image.test.ts` | `an offer with no picture says why: absent(reason) — never a bare null` | `Offer.image` accepts `null` (`offer.ts:36`) |
| T-2 | `collection/domain/offer-source.test.ts` | `image coverage below the declared expectation degrades the source, with the reason` | `collected()` only checks truncated names |
| T-3 | `aldi/aldi-flyer-source.test.ts` | `ALDI 2026-09-25: data.json carries no page images — page images come from spreads.json by explicit page number` against a **captured KW39 `spreads.json` fixture** (strip `text` to keep it small; commit the extracted artefact per `collection-module-design.md` "Fixtures") | the fixture and the parser do not exist |
| T-4 | same | `ALDI 2026-09-25: 211/211 cards empty — a real KW39 fixture run yields ≥ 80% crop-region images` | today 0% |
| T-5 | `infrastructure/port-contract.test.ts` | `every adapter meets its own declared imageExpectation on its committed fixture` | `imageExpectation` does not exist. This is the guard against "tested against docs" |
| T-6 | `telemetry/json-telemetry.test.ts` | `a source-level shortfall is visible even after 34 per-item warnings` | the coverage warning is at index 34 and gets sliced off |
| T-7 | `storage/domain/offer-to-unified.test.ts` / `shared/types.test.ts` | `dealToRow writes a crop-region's page url and all four fractions in the main row, image_url null` and the reverse | `dealToRow` writes `image_url` only (`shared/types.ts:976`) |
| T-8 | `store.test.ts` | `a deal held back one run and written the next keeps its crop` | the crop only rides WRITE 2 |
| T-9 | `store.test.ts` | `two offers colliding on (store,name,valid_from): the stored row carries the winner's own picture` | Map-last vs dedupe-highest mismatch (D/E) |
| T-10 | `store.test.ts` | `2026-09-24: a product name containing '\|' keeps its picture` | `split('\|')` (G) |
| T-11 | `transformation/domain/alerts.test.ts` | `retailer at 0% image coverage with expectation 0.8 alerts with NO previous snapshot` | only the relative rule exists |
| T-12 | `transformation/application/run-snapshot.test.ts` | `imageCoverage is per retailer and counts absence reasons` | the field does not exist |
| T-13 | `volg/volg-html-source.test.ts` | `an empty c-product__image slot is absent('retailer-publishes-none'), not a failure` | currently null |
| T-14 | `collection/domain/architecture.test.ts` | the existing layering grep, extended: `shared/product-image.ts` imports nothing from pipeline or web | new file |

The domain tests (T-1, T-2, T-11, T-12) need no mocks. If one needs a mock, the layering is wrong.

---

## 8. Blast radius, migration, rollout

**Blast radius (production code).** `UnifiedDeal.imageUrl` has **two** production references (`offer-to-unified.ts:44`, `shared/types.ts:976`). The rest are test fixtures in 9 test files (grep). The changes: `shared/types.ts` (UnifiedDeal, DealRow, dealToRow), a new `shared/product-image.ts` (moved, not copied), `collection/domain/{product-image,offer,offer-source}.ts`, the ALDI, Volg, SPAR, Migros and Coop/Denner/LIDL adapters (the `absent` reason, and `imageExpectation` on each source), `live-sources.ts` (ALDI deps), `offer-to-unified.ts`, `write-enrichment.ts`, `run-snapshot.ts`, `alerts.ts`, `json-telemetry.ts`. Web: **no change needed**. Its row contract and `ProductImage` component already handle both kinds.

**Database.** No schema change is required. The `deals_crop_complete` CHECK is optional (§4.3). Run a read-only violation count first. `pipeline_runs.metrics` is JSON, so the new fields need no migration.

**Backfill.** None. The next ALDI run's upsert writes the crops (ADR-IMG-1). The 69 inactive SPAR rows with `GetPDF` URLs can stay, since the web never reads inactive rows.

**Order (each step independently shippable and green):**
- V-0 Measure Volg's regeneration cadence: 3 probes over 3 days, read-only.
- 1 Domain: T-1, T-2, T-12, T-11, then VO-1/VO-2, then the shared-kernel move.
- 2 Storage: T-7…T-10, then ADR-IMG-1.
- 3 ALDI: capture the fixture, T-3, T-4, T-5, then ADR-IMG-2.
- 4 Telemetry: T-6.
- 5 Volg per D-2.
- 6 Code review and QA re-measure against the §1.1 table.

**Rollback.** Every step is a revert with no data migration.

**Cost.** CHF 0. One more GET per ALDI publication. With V-1, 5 more GETs per week to Volg.

---

## 9. Decisions that belong to the PM (not made here)

| Id | Question | Architect's input |
|---|---|---|
| D-1 | Is fetching `spreads.json` *in addition to* `data.json` and the PDF for the same ALDI publication consistent with AP-1 ("one fetch per publication, never refetch")? | I read it as yes: it fetches a different file once, and refetches nothing. Your call |
| D-2 | Volg: allow a daily image-only refresh (V-1, +5 fetches/week), which **changes AP-1 for Volg**, or accept imageless or rotting Volg cards (V-4)? | Recommend V-1 **after** V-0 confirms nightly regeneration |
| D-3 | SPAR: keep imageless, or ask SPAR for permission or a feed? | Recommend keeping it imageless. Do not hotlink token-gated pages (ADR-IMG-4) |
| D-4 | Should image-coverage-below-expectation be **critical** (fails the run under AP-7) or **warning**? And the per-retailer thresholds in §4.1 | Recommend *warning* at the source level and *critical* only at 0% for a retailer that expects more than 0.5. A missing picture is a product-quality issue, not a price-correctness one |
| D-5 | Move `price_basis` and rappen off the second pass too? | Out of scope for images, but the same loss surface applies to the **Lidl Plus member-price label**, which is a UWG Art. 3(1)(e) exposure. Recommend a follow-up WP using the same pattern |
| D-6 | Adjacent legal inconsistency: source-url photos (Coop, Denner, LIDL, Volg) render through `next/image`, which **fetches, re-encodes and caches them on Vercel**. `product-image.tsx:53-56` itself says that is "the one thing the constraint above forbids" for crops. `CLAUDE.md` § Legal says photos are "never reproduced on basketch infrastructure" | Not caused by this incident. It needs a PM/legal reading: `unoptimized` plain `<img>` for all retailer photos, or an explicit recorded exception |

---

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Publitas changes the `spreads.json` shape | Low to medium | T-5 fixture contract, plus the §6 source-level degraded signal on the first bad run |
| Volg changes its cadence, or V-1 is declined | Medium | §6 cannot see rot. It is an accepted risk under V-4, and the PM should know that |
| Image columns rewritten every run overwrite a good crop after a collection regression | Medium | Intended: truth over staleness. §6 point 3/4 alerts within the same run |
| A `ProductImage` in the shared kernel pulls domain logic into `shared/` | Low | Only the *type* moves. Constructors and invariants stay in `collection/domain`. The T-14 layering test pins it |

## 11. Self-check (architect rubric)

- [x] Every claim is cited: file:line, log line, DB query, or live response.
- [x] At least two alternatives for every decision (ADR-IMG-1…4).
- [x] Failure mode for each external dependency: Publitas (T-5, §6), Volg (V-0/V-1/V-4), iPaper (ADR-IMG-4).
- [x] No new table, no new telemetry channel, and the image shape goes from 5 copies to 3 (collection VO, the web mirror, the web row), with one of those moved into the shared kernel.
- [x] Domain layer stays free of infrastructure. Layering grep extended (T-14).
- [x] Right-sized: no event bus, no new service, CHF 0.
- [x] Product and legal choices flagged to the PM (§9), not made.
