# QA Test Report — basketch live data
Date: 2026-09-16
Tested by: QA Tester Agent (read-only — no pipeline runs, no Supabase writes)

Scope: `https://basketch.vercel.app` + linked Supabase project `ziqqgfhyruagmkbcwcgm`, queried via
`supabase db query --linked` (read-only; every query below can be re-run verbatim). 1,523 active
deals across 7 retailers, matching HANDOVER.md's last recorded total — confirms the pipeline has
not written since before this session, as briefed.

---

## Q1 — Pictures

### Per-retailer coverage (active deals, `is_active = true`)

| Store | Deals | image_url | CropRegion | Neither | Sample HTTP check | Live-site render |
|---|---|---|---|---|---|---|
| Coop | 923 | 923 (100%) | 0 | 0 | 15/15 sampled → `storage.cpstatic.ch` HTTP 200 | **Works** |
| Denner | 272 | 272 (100%) | 0 | 0 | 15/15 sampled → `denner.imgix.net` HTTP 200 | **Works** |
| Migros | 29 | 0 | 29 (100%) | 0 | `image.isu.pub` sample HTTP 200, `content-type: image/jpeg`; all 29 crop rectangles pass bounds check (0≤x,y; x+w≤1; y+h≤1; no zero-area; no duplicate crop on same page) | **Works** (geometry validated arithmetically; could not visually confirm crop placement — downloading/rendering the image was out of scope per instructions) |
| SPAR | 76 | 0 | 76 (100%) | 0 | The one `page_image_url` all 76 rows share, `https://angebote.spar.ch/.../GetPDF.ashx`, returns **HTTP 404**, `content-type: text/html` | **Broken — every SPAR card** |
| ALDI | 127 | 0 | 0 | 127 (100%) | n/a — no image data of any kind | **Empty grey square, by design fallback** (not a crash, but zero coverage) |
| LIDL | 74 | 74 (100%) | 0 | 0 | 15/15 sampled → `imgproxy-retcat.assets.schwarz` HTTP 200 **upstream**, but the host is not allow-listed in `next.config.ts`, so `basketch.vercel.app/_next/image?...` returns **HTTP 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`** | **Broken — every LIDL card** |
| Volg | 22 | 16 (73%) | 0 | 6 (27%) | 15/16 real `www.volg.ch/fileadmin/_processed_/...` URLs → **HTTP 404** upstream; the 16th is `https://www.volg.ch/.../logo-footer.svg` (the site's own footer logo, not a product photo) attached to "volg küchenreiniger spray" | **Broken — effectively 0/22** |

**Net: of 1,523 live deals, 1,224 (80%) — Coop, Denner, Migros — show a real picture as designed. 299 (20%) — ALDI, SPAR, LIDL, Volg — show nothing or a broken image**, for three distinct, independently-confirmed root causes (not one shared bug):

1. **LIDL + Volg — `next.config.ts` remotePatterns is stale.** `web-next/next.config.ts` allow-lists only `denner.imgix.net`, `storage.cpstatic.ch`, `image.migros.ch`, `image.coop.ch`. The only 4 hosts actually present in `image_url` data today are `storage.cpstatic.ch` (Coop), `denner.imgix.net` (Denner), `imgproxy-retcat.assets.schwarz` (LIDL, 74 rows), `www.volg.ch` (Volg, 16 rows) — **LIDL's and Volg's hosts are absent**. Verified directly against the live optimizer, not inferred:
   ```
   curl "https://basketch.vercel.app/_next/image?url=<denner-url>&w=384&q=75"  → HTTP 200
   curl "https://basketch.vercel.app/_next/image?url=<lidl-url>&w=384&q=75"   → HTTP 400 "Bad request / INVALID_IMAGE_OPTIMIZE_REQUEST"
   curl "https://basketch.vercel.app/_next/image?url=<volg-url>&w=384&q=75"  → HTTP 400 "Bad request / INVALID_IMAGE_OPTIMIZE_REQUEST"
   ```
   This is the **exact same defect class** documented in `web-next/src/lib/image-hosts.test.ts` (the 2026-09-11 Denner incident: "an operation reporting success while doing nothing"). That test's `REQUIRED_HOSTS` array only pins `storage.cpstatic.ch`, `denner.imgix.net`, `image.migros.ch`, `image.coop.ch` — **it does not know LIDL or Volg exist**, so it is green while production is broken (coverage theatre, same shape HANDOVER.md §4 already names). `image.migros.ch` and `image.coop.ch` are themselves dead entries — no live deal uses either host.
   **Fix:** add `imgproxy-retcat.assets.schwarz` and `www.volg.ch` to `next.config.ts` `images.remotePatterns`, and add both to `REQUIRED_HOSTS` in `image-hosts.test.ts` (Volg's URLs still 404 upstream — see below — so Volg needs the second fix too).

2. **SPAR — the crop pipeline points at the wrong object.** `pipeline/collection/infrastructure/live-sources.ts:300`:
   ```ts
   pageImageUrl: () => sparPdfUrl(year, kw),
   ```
   This ignores the `pageNumber` argument `SparSourceDeps.pageImageUrl` is typed to receive and returns the **flyer's PDF download endpoint** (`GetPDF.ashx`) for every tile on every page — which is why all 76 SPAR rows carry the identical `page_image_url` regardless of which of the 17 flyer pages the product is actually on, and why the CSS-crop `<img>` (`web-next/src/components/ui/product-image.tsx`) has nothing renderable to crop: `GetPDF.ashx` 404s and, even if it resolved, is a PDF, not a JPEG a browser `<img>` can display. `spar-flyer-source.ts` itself is correct — `mapTileToOffer` calls `tileToCropRegion(tile, page, pageImageUrl)` per page as designed; the caller just never supplies a real per-page renderer.

3. **ALDI — the crop pipeline is built but never wired up.** `pipeline/collection/infrastructure/aldi/aldi-flyer-source.ts` fully implements the same `pageImageUrl?: (pageNumber: number) => string` dependency as SPAR/Migros (`tileToCropRegion(tile, page, pageImageUrl, 12)` at line 190) — but `live-sources.ts:305-316`'s `createAldiFlyerSource({...})` call **never passes a `pageImageUrl` prop at all**. `deps.pageImageUrl` is `undefined`, so `pageImageUrl?.(page.pageNumber) ?? null` is `null` for all 127 rows, every time. The capability exists; it was never connected.

4. **Volg — the scraped product-image URLs are dead, and one is the wrong asset entirely.** All 15 real `www.volg.ch/fileadmin/_processed_/.../csm_promo_*.jpg` URLs sampled 404 upstream (Volg's CMS appears to regenerate these `_processed_` derivative paths under a new hash after some period, so a URL captured at scrape time goes stale). Separately, one deal ("volg küchenreiniger spray") was written with `image_url = https://www.volg.ch/.../logo-footer.svg` — `VolgHtmlSource`'s image selector picked up the site's own footer logo instead of a product photo for that row; this is a parsing bug distinct from the 404s.

**What a visitor sees today:**
- **ALDI** (no image, no crop, code path returns `null`): a clean, empty `bg-[var(--color-page)]` square — no broken-image icon, no console error visually apparent. Deliberate, graceful, but zero information.
- **SPAR / LIDL / Volg** (a src is emitted but the request fails): the `<img>`/`next/image` element is rendered with a real `src`, so — unlike ALDI — these are **broken image requests**, not designed-empty states. LIDL and Volg fail before the browser even makes the retailer request (Vercel's optimizer 400s client-side); SPAR reaches the retailer and gets a 404 there.

### Invariant check
`ProductImage is exactly one of SourceUrl | CropRegion` — **0 rows violate this** (`image_url IS NOT NULL AND page_image_url IS NOT NULL` → 0 of 1,523).

---

## Q2 — Categories

### Live counts (`category`/`sub_category`, active deals)

fresh: bread 9, cake 4, dairy 66, deli 41, dough 6, eggs 2, fish 25, fruit 25, meat 36, pastry 17, poultry 10, vegetables 26.
long-life: beer 40, canned 29, chocolate 53, coffee 14, coffee-tea 12, condiments 81, drinks 19, frozen 11, juice 7, pasta-rice 17, ready-meals 38, snacks 34, soft-drinks 39, spirits 2, tea 7, water 8, wine 350.
non-food: baby-care 3, body-care 26, books-media 5, cleaning 38, clothing 102, cookware 5, cut-flowers 2, dental-care 13, electronics-accessories 3, facial-care 11, feminine-care 5, food-storage 8, garden-care 1, hair-care 19, home-appliance 22, home-textiles 12, household 19, kitchen-appliance 50, kitchen-tools 6, laundry 31, make-up 1, mens-care 5, office-supplies 5, paper-goods 27, pet-care 6, pet-food 41, plants 6, shoes 3, sports-equipment 1, stationery 4, tools 3, toys 11, waste-bags 1.

**No `sub_category` is NULL** on any active deal (0/1,523) — every deal resolves to a browse category, as D1 requires.

**Every one of the 21 published browse categories (`BROWSE_CATEGORIES` in `shared/types.ts`) has at least one live deal** — none is completely empty. But 14 of the 60 DB sub-categories that `BROWSE_CATEGORIES` maps to have **zero** live deals this week: `catering`, `health-wellbeing`, `personal-care`, `outdoor-living`, `diy-hardware`, `car-accessories`, `games`, `nappies`, `baby-food`, `formula`, `baby-accessories`, `gift-cards`, `prepaid-credit` (`tobacco` is deliberately never published — expected, not a gap). This reads as **thin weekly stock, not a taxonomy bug** — e.g. `baby-kids` has only 3 deals total, all `baby-care` (Johnson's Baby Shampoo) — nothing wrong was found in how those 3 were classified, there just isn't a nappies/formula deal on sale from any retailer this week.

`is_uncertain`: **46 of 1,523 (3.0%)** — aldi 7, coop 8, denner 5, lidl 5, **migros 14 (48% of Migros's own 29 deals)**, spar 7, volg 0. Migros's high rate tracks the known WP-C1 OCR name-garbling directly: e.g. `"erhaltlich in diversensorten,"` → non-food/stationery, `is_uncertain=true`; `"ca.300g,insonderpackung，"` → long-life/canned, `is_uncertain=true`. These are genuinely unreadable fragments and the classifier correctly hedged rather than guessing — this is D3 working as intended, not a new defect.

### Spot-check for miscategorization (~70 deals examined, across all 7 stores, plus targeted trap terms)

Random samples from all 7 stores, plus deliberate substring-collision probes for the known trap patterns (`granatapfel`/`apfel`/`gala`, `schwein`/`wein`, `essig`, `glace`/`schokolade`, `teigwaren`, `baby`/`windel`): **zero miscategorizations found.** Specifically:
- `äpfel gala vv süsslich` → fresh/fruit (correct); `weleda granatapfel straffendes gesichtsöl` → non-food/facial-care (correct, not fruit)
- `schweins cordon bleu`, `schweinskoteletts`, `schweinssteak` → fresh/meat (correct, not wine)
- `hirz joghurt schokolade`, `satrap joghurt/glacemaschine` → fresh/dairy and non-food/kitchen-appliance respectively (correct, not chocolate)
- `mini babybel` / `mini babybel netzli` → fresh/dairy (correct, not baby food)
- `barilla teigwaren napoli` → long-life/pasta-rice (correct)

This is a real improvement over the historical failure modes this taxonomy documents in its own comments (the bakery/donut and Gala-apple cases CLAUDE.md references) — **no new instance of that class was found live.** One soft, non-blocking observation: `duc de coeur glace` (an ice-cream bar) is filed under long-life/snacks with `storage = NULL` rather than frozen/chilled — defensible (it is a snack), but worth a PM call given `storage` exists specifically to answer "where does this live in the shop."

---

## Q3 — Pricing

### ALDI-rule invariant (`original_price IS NULL ⟺ discount_percent = 0` in this NOT-NULL-integer schema)

| Store | Total | Both present (has_both) | Neither (rule OK) | Violations |
|---|---|---|---|---|
| Coop | 923 | 923 | 0 | 0 |
| Denner | 272 | 237 | 35 | 0 |
| Migros | 29 | 29 | 0 | 0 |
| SPAR | 76 | 76 | 0 | 0 |
| Volg | 22 | 21 | 1 | 0 |
| ALDI | 127 | 0 | 127 | 0 |
| **LIDL** | **74** | **0** | **74** | **0** |

**0 invariant violations anywhere** — every row is cleanly either "both present" or "neither," never a half-state.

**LIDL is the one that doesn't look organic.** ALDI printing no original price on 127/127 is the documented, deliberate "ALDI rule." **LIDL printing no original price on 74/74 (100%) is not documented as expected anywhere**, and LIDL's flyer format is not ALDI's — LIDL's own `LidlFlyerSource` exists specifically to run "the Lidl Plus member-price cross-check" (`live-sources.ts` comment: *"The PDF is the ONLY signal that a price is a member price... Publishing one as a normal price is the Art. 3(1)(e) UWG exposure this whole check exists to avoid"*). Every one of the 74 live LIDL rows also has `price_basis = 'everyone'` and `loyalty_programme = NULL` — so **zero LIDL deals are flagged member-only, and zero show a "was" price**, which is implausible for a real Lidl Switzerland weekly flyer (both crossed-out prices and Lidl Plus exclusives are a normal, frequent feature of it). I could not prove a specific wrong row from outside the pipeline, but flag this combination — no discounts detected *and* no member prices detected, on the one retailer whose whole model is built around both — as worth a Tech Lead check of `LidlFlyerSource`'s price/loyalty extraction before the next run is trusted.

### Discount-percent math accuracy (of rows with `original_price IS NOT NULL`)

| Store | Rows checked | \|stored − computed\| > 2.2pp | > 5pp | Max observed diff |
|---|---|---|---|---|
| Coop | 923 | 0 | 0 | 1pp |
| Denner | 237 | 0 | 0 | 1pp |
| Migros | 29 | 0 | 0 | 1pp |
| SPAR | 76 | 0 | 0 | 1pp |
| Volg | 21 | 0 | 0 | 1pp |

**100% of discount badges are within the allowed one-rounding-step tolerance.** This is a clean pass.

### Other invariants
- `sale_price <= 0`: **0 rows**, any store.
- `original_price IS NOT NULL AND original_price <= sale_price`: **0 rows**, any store.
- Member-only price shown without its programme named: **0 rows have `price_basis` other than `'everyone'` in the entire live dataset** (all 1,523). The invariant technically holds because nothing is currently flagged member-only — but given the LIDL finding above, I cannot rule out that this is "no member prices were found" rather than "member prices were found and correctly labelled." Worth the same Tech Lead check.

### Extra check (per coordinator): does "Worth picking up" ever show an unlabelled member price?

**Code-level: yes, this is a real, reproducible gap.** `web-next/src/server/data/worth-picking-up.ts` — both `coldStartCandidates()` (line ~199) and the personal `worth_picking_up_candidates` read (line ~103) — select `price_basis`/`loyalty_programme` from **neither** `deals` nor the materialised view, and `WorthPickingUpCandidate` (`components/landing/WorthPickingUpCard.tsx`) carries no such field. `DealCard.tsx`, by contrast, always renders `memberPriceLabel`. So the moment a member-only-priced deal qualifies for the top-10-by-discount cold-start pool, it will render with no label — a live Art. 3(1)(e) UWG exposure architecturally, confirmed by reading both files.

**Live-site right now: NOT currently visible.** I recomputed the exact cold-start query (`is_active, valid_to >= today, valid_from <= today, discount_percent >= 30`, ordered by discount desc, limit 10) against the database and fetched `https://basketch.vercel.app/de` directly:
```
curl -sL https://basketch.vercel.app/de | grep -o '"conceptName[^,]*'
→ coral flüssig-waschmittel white 2x50 waschgänge
→ asc labeyrie coeur fil.saumon fumé
→ topfuntersetzer edelweiss
→ löwenbräu oktober-fest bier dose 24x50cl
→ barilla pesto rosso 3x200g
→ baumkerzen weiss 60 stück
→ rana girasoli kürbis mit zwiebeln 4x 250g
→ shiraz/cabernet sauvignon australia koonunga hill...
```
All 10 rows returned by the query are **Coop**, all `price_basis = 'everyone'`. Nothing named `memberPriceLabel`/`priceBasis`/`loyaltyProgramme` appears anywhere in the homepage payload — confirming the component carries no such field at all, not just that it's empty this week. **Conclusion: the gap is real and unguarded, but not currently manifesting, because (a) LIDL — the only store in this dataset with a realistic member-price mechanism — has zero in-effect deals right now (see below), and (b) no deal anywhere in the live dataset is flagged member-only regardless.** It will surface silently the first week both those things are no longer true, with no test to catch it — recommend adding `price_basis`/`loyalty_programme` to both `worth-picking-up.ts` reads and a `memberPriceLabel` render + regression test before that week arrives.

---

## The three "listed but does not vote" rules, checked against real rows

Traced end-to-end, not just at the unit level: `web-next/src/app/[locale]/deals/DealsClient.tsx` (client) calls `buildSections(filtered, snapshot.today)` from `server/data/filter-deals.ts`, which calls `pickPrimary()`, which calls `votesInVerdict()` (`lib/domain/votes-in-verdict.ts`) — the single predicate checking `isUncertain`, member-only, and `isInEffect` — and `isCheapest={primaryIsCheapest}` is passed straight into `DealCard`. `snapshot.today` is computed once, server-side, via `todayInZurich()` (not the visitor's local clock), so the "today" used to gate the tag is the same for every visitor within a cache window.

- **Not-yet-started**: confirmed on real, current rows — 277 deals (ALDI 127 + LIDL 74 + SPAR 76) all have `valid_from` in the future (2026-09-17 to 2026-09-21, vs. today 2026-09-16), verified directly:
  ```sql
  select store, count(*) from deals where is_active
    and valid_from <= current_date and valid_to >= current_date
    and store in ('aldi','lidl','spar') group by store;   -- → 0 rows returned for all three
  ```
  By `votesInVerdict`'s logic (traced in source, all three stores currently have zero deals that can win a `pickPrimary` slot), none of these 277 can carry `isCheapest=true` today.
- **Expired (the mirror case, also gates the tag via the same `isInEffect` check)**: Denner's entire live set (272 deals) has `valid_to = 2026-09-15` — yesterday — so it is also currently 0-for-272 "in effect." This is a direct, expected consequence of the pipeline not having run since 2026-09-14 (Denner's window closed and nothing fetched the new one) — not a new defect, but worth stating in numbers: **549 of 1,523 live deals (36%) — ALDI + LIDL + SPAR + Denner — are correctly excluded from the verdict and the "Cheapest" tag right now. Only Coop (923), Migros (29) and Volg (22) — 974 deals (64%) — are actually in effect today.**
- **Member-only**: cannot be evidenced on a real row today because, as established above, **zero live deals are flagged member-only** — so this half of the rule is unverifiable against live data this week, only against its unit tests. Given the LIDL pricing anomaly above, this is the same open thread, not a separate one.
- **Uncertain**: `is_uncertain=true` deals (46 total) are visible with the "unverified" tag (`DealCard`'s `unverifiedLabel` branch) rather than hidden, per D3 — confirmed in source; could not confirm via rendered DOM (no headless browser available in this environment) that one of the 46 is not *also* wearing "Cheapest" on a live page today, but the same single `votesInVerdict` gate that was traced for the other two rules applies uniformly to `isUncertain`, so I have no reason distinct from the above to doubt it — flagged as **traced, not rendered-DOM-verified**, for completeness.

---

## Confirmed as already-known (matches the briefing — not reported as new)

- Migros names are OCR/descriptor-line garbage (`"《ausderregion.>/schweiz,"`, `"schweins-nierstuckplatzli,"`) — WP-C1, unexecuted since pipeline hasn't run.
- Coop names ending in `...`/`…`: **274 of 923 (29.7%)** — exact match to the pre-WP-C3 figure documented in CLAUDE.md/HANDOVER.md.
- ALDI, LIDL, SPAR showing only next week's flyer (`valid_from` 2026-09-17 to 2026-09-21) — WP-P1/WP-W2 not yet executed.
- `storage`: NULL on 1,446/1,523 (95.0%) — matches the ~95% figure given.
- `attributes = '{}'`: 1,258/1,523 (82.6%) — matches the ~82% figure given.

---

## Findings ranked by user impact

### Critical
1. **LIDL's and Volg's image hosts are missing from `next.config.ts`, so every LIDL card (74/74) and most Volg cards (16/22) render broken on the live site.** Evidence: `curl "https://basketch.vercel.app/_next/image?url=<lidl-image-url>&w=384&q=75"` → `HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST`; same for a Volg URL; a Denner URL through the identical endpoint → `HTTP 200`. Root cause: `web-next/next.config.ts` `images.remotePatterns` lists only `denner.imgix.net`, `storage.cpstatic.ch`, `image.migros.ch`, `image.coop.ch` — the two hosts actually present in live LIDL/Volg data (`imgproxy-retcat.assets.schwarz`, `www.volg.ch`) are absent, and `web-next/src/lib/image-hosts.test.ts`'s `REQUIRED_HOSTS` doesn't test for them either, so the guard built for this exact defect class (the 2026-09-11 Denner incident) is green while it recurs. Fix: add both hosts to `remotePatterns` and to `REQUIRED_HOSTS`.
2. **ALDI has zero product images (127/127) because the crop-region dependency is never wired at the call site**, despite full support existing in the adapter. Evidence: `pipeline/collection/infrastructure/aldi/aldi-flyer-source.ts` implements `pageImageUrl?: (pageNumber: number) => string` and calls `tileToCropRegion(...)` when it's supplied; `pipeline/collection/infrastructure/live-sources.ts:305-316`'s `createAldiFlyerSource({...})` never passes `pageImageUrl`. Fix: wire a per-page image URL the same way Migros (`migrosPageImageUrl`) does.
3. **SPAR's crop region points at the flyer's PDF download endpoint, not a page image, so all 76 SPAR cards render broken.** Evidence: `pipeline/collection/infrastructure/live-sources.ts:300` — `pageImageUrl: () => sparPdfUrl(year, kw)` ignores its `pageNumber` argument and returns `GetPDF.ashx` for every product on every page; that URL returns `HTTP 404, content-type: text/html` when fetched directly. Fix: supply a real per-page rendered-image URL (a PDF→JPEG render step, as Migros does via Issuu) instead of the PDF URL itself.

### Major
4. **LIDL shows no "before" price and no Lidl Plus member label on any of its 74 live deals**, despite `LidlFlyerSource` existing specifically to do the member-price cross-check (per its own code comment). Evidence: `select count(*) from deals where store='lidl' and is_active` → 74; same filtered to `original_price IS NOT NULL` → 0; same filtered to `price_basis <> 'everyone'` → 0. Not provably wrong from outside the pipeline, but implausible for a real Lidl flyer and worth a Tech Lead check of the extraction before the next run is trusted — this is an Art. 3(1)(e) UWG labelling question, not cosmetic.
5. **Volg's "product image" for one deal is the site's own footer logo SVG**, not a product photo. Evidence: `product_name = "volg küchenreiniger spray"`, `image_url = "https://www.volg.ch/_assets/.../Images/logo-footer.svg"`. Separately, all 15 of Volg's real per-product image URLs 404 upstream (`www.volg.ch/fileadmin/_processed_/...`) — likely a derivative-path cache that regenerates under a new hash, so scraped URLs go stale.
6. **`worth-picking-up.ts` never reads `price_basis`/`loyalty_programme`** (confirmed by reading both `coldStartCandidates()` and the personal-path query, plus `WorthPickingUpCard`'s prop type) — a member-only price would show on the home page's "Worth picking up" with no label. **Not currently visible live** (verified: today's actual top-10 cold-start set, fetched from `https://basketch.vercel.app/de`, is 100% Coop, 100% `price_basis='everyone'`) — but unguarded, and will surface silently the first week a qualifying member-only deal exists. Recommend adding the field + a regression test now rather than after it ships wrong.

### Minor
7. `duc de coeur glace` (ice cream) classified `long-life/snacks` with `storage = NULL` rather than `frozen` — defensible, but a candidate for the `storage` facet given it's a literally-frozen product; PM call, not a clear error.
8. Migros `is_uncertain` rate is 14/29 (48%) — expected given the known OCR garbling, but worth naming as a number: nearly half of Migros's already-small live catalogue (29 deals) currently carries no confident category label.

## What's working well
- **Discount-percent math is clean everywhere**: 0 of 1,286 checked rows (all stores with an `original_price`) disagree with the computed value by more than 1 percentage point — well inside the ~2.2pp tolerance.
- **No pricing invariant violations anywhere**: 0 `sale_price <= 0`, 0 `original_price <= sale_price`, 0 rows where `original_price`/`discount_percent` are half-null (the ALDI-rule invariant holds structurally across all 1,523 rows).
- **Coop, Denner and Migros images are fully healthy**: 1,224/1,523 deals (80%) render a real product photo or a geometrically-valid flyer crop, sample-verified at the HTTP level.
- **Category assignment held up well under targeted adversarial testing** — the specific substring-collision patterns this taxonomy's own comments warn about (`Granatapfel`/`apfel`, `schwein`/`wein`, dairy-named-like-chocolate, baby-substring false positives) all resolved correctly on live data; ~70 spot-checked deals across all 7 stores, zero miscategorizations found.
- **The "listed but does not vote" rule is correctly and uniformly wired** through one shared predicate (`votesInVerdict`) reached from the one place the main deals page renders `isCheapest`, and the underlying dates check out against the live database — 549 currently-non-voting deals (ALDI/LIDL/SPAR not-yet-started, Denner expired) are excluded from the "Cheapest" tag by construction, not by a query filter that happens to agree.
