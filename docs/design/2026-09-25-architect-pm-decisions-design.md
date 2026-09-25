# Architect design for the 2026-09-25 PM decisions (D-1, D-2, D-3, P-7/P-8, P-9)

**Date:** 2026-09-25 · **Author:** Solution Architect · **Status:** Proposed. The Tech Lead cross-reviews it. The one open product question is in §4.6.
**Scope:** design only. No source edits, commits, DB writes or workflow triggers. One read-only DB query (per-unit price coverage) was refused by the session's permission layer, so that figure is marked **UNVERIFIED** below, and the query to measure it is given.
**Inputs:** `docs/decisions/2026-09-25-pm-decisions.md`, the Tech Lead plan (`docs/rca/2026-09-25-tech-lead-cross-review-and-plan.md` §7, cited as TL-PLAN), `docs/rca/2026-09-25-architect-missing-images.md` (ARCH-IMG), `docs/rca/2026-09-25-architect-cross-review.md` (ARCH-X), `docs/design/2026-09-25-data-source-facts.md`, `docs/design/2026-09-25-data-source-copy-rework.md`, the code, and the live SPAR KW39 flyer.
**Live evidence gathered today (2026-09-25, ~18:43Z, honest UA, one fetch per resource):** the SPAR KW39 viewer page (1 GET, 93 KB), iPaper page 1 `Zoom.jpg` and `Normal.jpg` with and without the token (3 GETs), and the SPAR KW39 PDF (1 GET, 27.6 MB). Work files are in the session scratchpad, not the repo.
**Binding PM decisions I do not re-open:** D-3 (SPAR must show pictures), D-6 (retailer photos through `next/image` are accepted, and the legal concern is closed by the PM). Free tiers only.

---

## 0. Summary

| # | Item | Recommendation | Work package |
|---|---|---|---|
| 1 | SPAR pictures (D-3) | **Option (b): crops rendered from the flyer PDF we already download, stored in Supabase Storage (free tier), and served as plain source-url images.** Reject (a), iPaper signed-token hotlinks: the token lives about **23 h**, so every SPAR picture breaks the first day a refresh is missed. Both options need the new **photo locator** (§1.3). With the crop rule we use today, only about half of the 65 KW39 crops show the product. Pairing each price tile with the flyer's embedded photo box gets that to **about 60 of 65**. | **WP-8a** photo locator (shared with ALDI), **WP-8b** hosted SPAR crops |
| 2 | ALDI (D-1) | **WP-6 is ready to build as designed.** One addition: ALDI crops use the same `padTopPt = 110` rule, so they adopt WP-8a when it lands. | WP-6 (unblocked), then WP-8a |
| 3 | Volg (D-2) | A **separate daily workflow** at 02:30 UTC re-reads the Volg offers page with the **same adapter** and updates only the image columns of live Volg rows, matched on the same natural key `storeDeals` uses. It shares the pipeline's concurrency group, then revalidates the web cache. Browser fallback: `onError` shows a **designed** no-picture card (store dot + category icon), never a grey square. | **WP-7c** (after WP-7a/b and WP-1d) |
| 4 | "Cheapest" (P-7, P-8) | "Cheapest" = **the lowest price per kg / litre / piece among the in-effect, non-member, non-uncertain offers in the section that have a trustworthy unit price, compared only inside one unit.** No tag when fewer than two such offers exist. **Do not use the concept/sku layer:** concepts are effectively one per store product, so they compare nothing across stores. Recommendation to the Tech Lead: **stop writing `sku`/`concept`/`deals.sku_id`** (retire the sku part of WP-1b). One question for the PM (§4.6). | **WP-12** (web + one pipeline fix), in parallel with WP-1 |
| 5 | Contact form (P-9) | A **Next.js route handler + Resend free tier** (3,000 emails/month, 100/day). The recipient sits in the `CONTACT_TO_EMAIL` Vercel env var, and the key in `RESEND_API_KEY`. Spam defence: honeypot, time trap, same-origin check, size cap, and Resend's hard daily cap as the ceiling. | **WP-13**, in parallel with WP-1 |
| — | Side finding (legal) | The SPAR adapter **does not detect SPAR Friends member-only prices**. KW39 page 3 prints "ANGEBOT NUR GÜLTIG FÜR SPAR FRIENDS." above the Cervelas offer. `PriceBasis` already has `'SPAR Friends'`, but `spar-flyer-source.ts` never sets it. CLAUDE.md requires member-only prices to be labelled. | **WP-8c** (small, can go first) |
| — | Doc follow-up | D-3 and D-6 contradict the URG note in `product-image.tsx:47-56` and CLAUDE.md § Legal ("Never copy product photographs … never reproduced on basketch infrastructure"). Update both to record the PM decisions, as the PM asked for D-6. | Fold into **WP-0** |

Cost: **CHF 0.** No new paid service. One new free account (Resend). One new public Storage bucket inside the existing Supabase free project.

---

## 1. SPAR pictures (D-3)

### 1.1 Evidence from the live KW39 flyer

| Probe | Result |
|---|---|
| Viewer `angebote.spar.ch/flugblatt/2026/spar-angebote-kw39-2026/` | 200. The embedded `policy` is `token=…&token_path=/iPaper/Papers/1ef1c2d6-…/Pages/&expires=1790444186` = **2026-09-26 17:36:26Z, 22.9 h after the request**. ARCH-IMG's probe on the same day got an expiry 22.6 h out. **The token is minted per request with a lifetime of about 23 h.** |
| `…/Pages/1/Zoom.jpg` with the token | 200, `image/jpeg`, 357 KB, **1143×1617 px**. `Normal.jpg` is 172 KB, 703×995 |
| Same URL without the token | **403** |
| `GetPDF.ashx` | 302 to a **signed** `cdn.ipaper.io/…/Download.pdf?token=…&expires=…`, 200, 27.6 MB, 18 pages, A4 (595.28×841.89 pt). The pipeline already follows this redirect every run (`live-sources.ts` `sparPdfUrl`) |
| Current parser (`parseFlyer`) over the KW39 PDF | **65 offers, 15 warnings**, validity 2026-09-24 → 2026-09-30. Matches the run log (`ok spar 65 offers 15 warnings`) |
| Crops with today's rule (`tileToCropRegion`, 110 pt above the text tile) rendered from the PDF | Contact sheet of all 65: **about 34 show a recognisable product photo**. The rest show only the price text, a slice of a neighbouring photo, or a banner. The photo is not always directly above the caption: it can sit beside it, higher up, or the tile is a full-width banner |
| Embedded image placements (`pdfplumber`, which reads positions without decoding pixels) | **206 placements in 2.1 s** for all 18 pages. On page 3 every product photo is a separate image whose box sits directly above or beside its tile (e.g. Wienerli photo at x 47–263, y 148–257 pt, and its caption tile starts at y ≈ 256 pt) |
| Prototype pairing (each tile → nearest photo placement ≥ 3,000 pt², ≤ 50% of the page, sharing an axis, gap ≤ 60 pt; crop = union of photo and tile) | **65/65 paired; on inspection about 60 show the right product.** About 5 are wrong: two small offers under a "Praktisches für jeden Tag" banner, Lauch, Kartoffeln, and a Findus banner tile |
| Render cost (PDFium, `pypdfium2`), all 18 pages at 150 dpi | **5.5 s** locally (1241×1754 px per page). Poppler `pdftoppm` at 100 dpi took 31.6 s. A single poppler crop takes 0.7 s. `pdftohtml -xml` (placements plus image extraction) took **more than 120 s**, so it is rejected |

**Conclusion from the evidence:** the crop geometry, not the image source, decides whether SPAR cards show the product. Whichever option is chosen, the photo locator (§1.3) is needed. It applies to ALDI crops too.

### 1.2 Options compared

| | (a) Hotlink iPaper page images with the signed token + CSS crop | (b) Render crops from the PDF we already hold, store them on Supabase Storage, serve as source-url | (b′) Render **whole pages** from the PDF, store them, keep the CSS crop |
|---|---|---|---|
| How | Each run and each day: GET the viewer page, read `policy`, write `…/Pages/<n>/Zoom.jpg?<policy>` into `page_image_url` for every live SPAR row, then revalidate | During collection: placements → pair → render each crop at 150 dpi → JPEG ≤ 480 px wide, q80 → upload with a content-hash key → the offer's image becomes `SourceUrl(storage url)` | Same, but 18 page JPEGs per edition; the web keeps using `FlyerCrop` |
| **Reliability** | **Poor.** The token lives ~23 h. SPAR offers are live 7 days (Thu → Wed, and they are collected Mon/Tue/Thu before that). A single missed or late daily run (GitHub documents that scheduled runs can be delayed or dropped under load) turns **every** SPAR picture into a 403, all at once. The refresh has to succeed ~7 times a week, forever | **Good.** Once written, a crop does not expire. It depends only on Supabase being up, which the whole site already depends on. A failed upload affects one offer, which is marked `absent('image-publish-failed')` | Good, same as (b) |
| Retailer fetches | +7 viewer GETs/week (93 KB) on top of the PDF | **0 extra.** Uses the PDF already downloaded | 0 extra |
| Cost at CHF 0 | 0 | Storage ~65 × ~35 KB ≈ **2.3 MB per edition**. With a 14-day retention sweep, steady state is **< 10 MB of the 1 GB** free. Egress: 50 visitors × 65 crops × 35 KB ≈ **115 MB/month of the 5 GB** free egress (+5 GB cached). Supabase free-plan limits verified today at supabase.com/pricing: 1 GB storage, 5 GB egress + 5 GB cached egress, 50 MB max per file, no image transformations (not needed) | ~2.7 MB per edition. But each card downloads a **whole page** (~150 KB at 100 dpi), so ~5× the egress of (b), and 100 dpi makes blurry crops on phones |
| Runtime added per run | ~1 s | Placements 2.1 s + render 5.5 s + encode ~1 s + 65 uploads (concurrency 4) ~4 s + `pip install pypdfium2 pdfplumber` ~10 s. **About 25 s locally; I estimate 40–60 s on the Actions runner** (not measured on the runner) | Similar |
| Visitor experience | Each card loads a 357 KB page to show a 300 px slice. A SPAR-heavy page loads several MB | One ~35 KB image per card. Sharp at 150 dpi | Heavier and blurrier than (b) |
| Web change | None (`FlyerCrop`) | None in the component: it is an ordinary `imageUrl`. One `remotePatterns` entry for the Supabase host, and render these with `unoptimized` (they are already the right size), so they use **0** of Vercel Hobby's 5,000 image transformations a month (limit verified today at vercel.com/docs/image-optimization/limits-and-pricing) | None |
| Matches the PM's words | "Just use their pictures" | "**if you have PDF, just pass the PDF and truncate and show those pictures**", which is exactly this | Partly: it truncates in the browser |
| Needs a daily job | **Yes**, a second writer every day | No | No |

Weighted matrix (weights: reliability 3, zero cost 3, runtime 1, fit with the PM's instruction 2, simplicity 2):

| Criterion (weight) | (a) | (b) | (b′) |
|---|---|---|---|
| Reliability (3) | 1×3=3 | 5×3=15 | 5×3=15 |
| Cost at 0 (3) | 5×3=15 | 5×3=15 | 4×3=12 |
| Runtime (1) | 5 | 3 | 3 |
| PM fit (2) | 3×2=6 | 5×2=10 | 4×2=8 |
| Simplicity (2) | 2×2=4 (daily job, token plumbing, revalidation) | 3×2=6 | 3×2=6 |
| **Total** | **33** | **49** | **44** |

### ADR-SPAR-1: SPAR pictures are crops rendered from the SPAR flyer PDF and hosted on Supabase Storage

**Status:** Proposed · **Context:** D-3, D-6, the evidence in §1.1. · **Decision:** option (b). · **Alternatives:** (a) rejected on reliability (23 h token); (b′) rejected on egress and sharpness. · **Consequences:** basketch now hosts derived images. This is the PM's accepted legal position (D-6/D-3), and CLAUDE.md § Legal plus `product-image.tsx` must say so (WP-0). Reversible (two-way door): delete the bucket and stop the step. Any SPAR row that loses its crop then shows the no-picture card.

### 1.3 Design (DDD)

**Bounded contexts touched.** Collection (the SPAR ACL, unchanged in spirit) and a new small **imagery** module that turns a crop region on a page nobody can fetch into a hosted image.

```
pipeline/collection/infrastructure/pdf/photo-locator.ts      (NEW, pure)
    pairTileWithPhoto(tile, placements, page) → PhotoBox | NoPhoto(reason)
    — geometry only; used by SPAR (WP-8b) and ALDI (WP-6 follow-up)
pipeline/collection/infrastructure/pdf/pdf_images.py          (NEW, like migros/ocr.py)
    placements <pdf>                 → line-JSON {page, x0, top, x1, bottom}
    crop <pdf> <jobs.json> <outdir>  → line-JSON {jobId, file, widthPx, heightPx}
pipeline/imagery/
  domain/        HostedImageKey (value object: retailer, publication, sha256)
                 ImageStore port  (put(key, bytes, 'image/jpeg') → Result<SourceUrl>)
                 PageRasterizer port (crop(pdfPath, jobs) → Result<CropFile[]>)
  application/   withHostedCrops(source, deps): OfferSource   ← decorator
  infrastructure/SupabaseImageStore (Storage REST, service-role key), PdfiumRasterizer
```

- **Aggregate:** `Offer` stays the root. The decorator never mutates it. It builds a **new** `Offer` through `createOffer` with the image replaced, so every invariant runs again. `ProductImage is exactly one of SourceUrl | CropRegion` still holds.
- **The SPAR ACL stays honest.** It is given `pageImageUrl(n) = https://cdn.ipaper.io/iPaper/Papers/<paperId>/Pages/<n>/Zoom.jpg` (the retailer's real, stable page identity, **without** the token). It emits `CropRegion` as today, with the geometry now from `pairTileWithPhoto`. The paper id comes from the redirect target of `GetPDF.ashx`, which the fetcher already follows, so no extra fetch is needed. iPaper vocabulary (`policy`, `token_path`, `Enrichments`) never leaves the adapter.
- **`withHostedCrops`** wraps only the SPAR source at the composition root (`live-sources.ts`). For each offer with a crop region, it renders that region from the PDF the source already downloaded, uploads it, and swaps the image to `SourceUrl`. If rendering or uploading fails, the image becomes `absent('image-publish-failed')`, never the tokenless URL that answers 403. The source result stays `collected`. Image coverage counts it (WP-3), and under D-4 a drop warns but still publishes.
- **Value objects:** `HostedImageKey` = `flyer-crops/spar/<publication ISO date>/<sha256 of JPEG bytes>.jpg`. A re-run in the same week produces the same bytes and the same key, so an upsert (`x-upsert: true`) overwrites instead of piling up. The key is immutable, so it is served with `cache-control: public, max-age=31536000, immutable`. `PhotoBox` holds fractions of the page and is checked like `CropRegion`.
- **Retention:** the same step deletes `flyer-crops/spar/<date>/` prefixes whose publication ended more than 14 days ago (a list plus a remove). Rows that point at them are already inactive, and the web never reads inactive rows.
- **Domain imports no infrastructure:** `imagery/domain` has no fetch, Supabase or PDF import. Add it to the existing ESLint `no-restricted-imports` rule.
- **PDF on disk:** `fetchFlyerPages` currently returns only words. It returns the temp PDF path as well, for the decorator's lifetime, and deletes it afterwards. Blast radius: `flyer-fetcher.ts` and its tests.
- **Bucket:** a migration `insert into storage.buckets (id, name, public) values ('flyer-crops','flyer-crops', true) on conflict do nothing`. Public read, service-role write (the service role bypasses RLS). **No new secret:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist in the pipeline.
- **Web:** `next.config.ts` `remotePatterns` += `<project>.supabase.co` path `/storage/v1/object/public/flyer-crops/**`. `ProductImage` passes `unoptimized` when the URL is on that host (our crops are already sized), so they cost 0 Vercel transformations.
- **Workflow:** `pipeline.yml` adds `pip install pypdfium2 pdfplumber` beside the Migros OCR requirements (both free, pure wheels). Poppler stays for `pdftotext`.

### 1.4 Failing tests first (TDD)

| # | File | Test (named after the defect) |
|---|---|---|
| S-1 | `pdf/photo-locator.test.ts` | `SPAR KW39 2026-09-25: the crop is the tile's own photo, not 110pt of whatever sits above the caption` (committed fixture: page-3 placements + bbox XML; expect Wienerli's crop to contain photo box 47,148–263,257) |
| S-2 | same | `a tile with two equally near photos refuses to guess: NoPhoto('ambiguous')` (the "Praktisches für jeden Tag" banner case) |
| S-3 | same | `a page-sized background image is never a product photo` |
| S-4 | `imagery/domain/hosted-image-key.test.ts` | `the same crop bytes in the same week always produce the same key` (so re-runs overwrite) |
| S-5 | `imagery/application/with-hosted-crops.test.ts` (fake store + fake rasterizer) | `a SPAR crop region becomes a hosted source-url image; the tokenless iPaper URL never reaches a row` |
| S-6 | same | `an upload failure makes that offer absent('image-publish-failed') and the source still counts as collected` |
| S-7 | same | `crops of publications older than 14 days are deleted; this week's are not` |
| S-8 | `pdf/test_pdf_images.py` | `placements are reported in PDF points with a top-left origin, like pdftotext -bbox` (so the two coordinate systems cannot drift) |
| S-9 | `live-sources.test.ts` | `SPAR is wrapped in withHostedCrops and passes the paper's page url without a token` |
| S-10 | `web-next product-image.test.tsx` | `an image on the flyer-crops host renders unoptimized` |

### 1.5 Blast radius

`spar-flyer-source.ts` (pageImageUrl dep, pairing), `tile-locator.ts` (crop from photo+tile), new `photo-locator.ts`, new `pdf_images.py` + requirements, `flyer-fetcher.ts` (return the PDF path), new `pipeline/imagery/**`, `live-sources.ts` (SPAR wiring), `pipeline.yml` (pip install), 1 migration (bucket), `next.config.ts`, `product-image.tsx`, CLAUDE.md § Legal + Environment (bucket). **Before building, correct `live-sources.ts:291-299`** (WP-0(d)).

### 1.6 Work-package slot

- **WP-8c — SPAR Friends label** (side finding). Detect "NUR GÜLTIG FÜR SPAR FRIENDS" / "SPAR FRIENDS" inside or directly above a tile, and set `PriceBasis.MemberOnly('SPAR Friends')`. Red test: `SPAR KW39: Cervelas under 'ANGEBOT NUR GÜLTIG FÜR SPAR FRIENDS' is a member-only price`. **Proceed now.** It is small, it is a legal-accuracy fix, and it touches only the SPAR adapter. How many SPAR offers are affected overall is **UNVERIFIED**: on other pages the card graphic may be an image, not text, and that needs checking in the RCA.
- **WP-8a — photo locator.** After WP-6 (shares `tile-locator.ts`), before WP-8b.
- **WP-8b — hosted SPAR crops.** After WP-1d (the image rides the main row), WP-4 (the `image-publish-failed` reason) and WP-8a.
- **WP-2 budgets** must count the extra ~40–60 s in the collection phase. Measure it on the first run with WP-8b.

---

## 2. ALDI (D-1 yes): WP-6 is ready

Checked against ARCH-IMG ADR-IMG-2 and TL-IMG §1:

- **Source verified:** `spreads.json` (KW39) is 200, 195 KB, 38 pages, each with an explicit `number` and `images.at200…at2400`. The KW37 and KW38 renditions still answered 200, so the URLs last at least two weeks (ARCH-IMG §1 table).
- **Design:** `loadPages` fetches `data.json` (PDF url + `cacheToken`), then `spreads.json?version=<cacheToken>`, for the **same edition**, in the same closure. Pages are mapped by explicit `number`, never by order. `findPageImageUrls`'s imagined REST shape is deleted. Aspect guard ±2% between the rendition and the PDF page. A page-count mismatch degrades the source (VO-2), not a warning.
- **Tests:** unchanged from TL-PLAN WP-6 (T-3 named regression, the composition test in `live-sources.test.ts`, fixtures captured once under WP-5, now unblocked).
- **One addition:** ALDI crops come from the same `tileToCropRegion(padTopPt = 110)` rule that picks the wrong region for about half of SPAR's tiles (§1.1). When WP-8a lands, ALDI uses `pairTileWithPhoto` too. Add one ALDI red test then: `ALDI: the crop is the tile's own photo`. Whether ALDI's Publitas PDF has separate photo placements is **UNVERIFIED**: check it on the WP-5 capture before relying on it.
- **Open measurement (Tech Lead, not PM):** re-read `spreads.json` 24 h and 72 h after capture to confirm the signed `/resize/rev-…/<sig>/` path does not rotate (TL-IMG §1, still open).

**Slot:** WP-5 (ALDI capture now allowed) → WP-6, as sequenced in TL-PLAN §7. **Status: ready to build.**

---

## 3. Volg (D-2: no empty boxes, daily refresh approved)

### 3.1 Mechanism

| Option | Verdict |
|---|---|
| **V-1a: separate daily workflow `volg-images.yml`**, a light entry point `pipeline/refresh-volg-images.ts` | **Chosen** |
| V-1b: add a daily cron to `pipeline.yml` and branch inside `run.ts` | Rejected. It puts a 1-minute job behind a 60-minute timeout and the full classification setup, and it risks a daily run collecting all seven retailers by mistake (the dispatch rule in `pipeline.yml:11-17`) |
| V-2: resolve at render time in web-next | Rejected (ARCH-IMG ADR-IMG-3: collection inside the web tier, fetches depend on traffic) |

**Flow of `refresh-volg-images.ts`** (application service `refreshSourceImages(source, store, revalidate)`):
1. `createVolgHtmlSource({ fetchPage: net.volgFetchPage }).fetchOffers(edition)`: the **same ACL**, one GET to `volg.ch/sortiment/wochenaktionen/`.
2. For each offer, compute the natural key that `storeDeals` already dedupes on, `(store='volg', normalised product_name, valid_from)`, by reusing the same normaliser (no second copy).
3. Read live Volg rows (`is_active`, `valid_to ≥ today`), matching the key set in one `.in()` query.
4. For each row whose image changed, update **only** the five image columns through `imageColumns(image)`. That is the total mapper required by TL-PLAN §1.1 condition 2, so the three image CHECKs hold by the same property test. This is a **recorded, narrow amendment to ADR-IMG-1**: a second writer that may only write source-url images for `store = 'volg'`, and only through `imageColumns`. Nothing else (price, dates, category) is touched.
5. If anything changed, call `WEB_REVALIDATE_URL` (existing secret). **Without this step the fix does nothing**, because the web serves the cached snapshot (`server/data/snapshot.ts`, `use cache`) with yesterday's dead URLs.
6. Log counts: `volg-images: read 25, matched 24, changed 17, unmatched 1, absent 7`. The daily "changed" count **is** the V-0 cadence measurement, so no separate probe is needed.

Promo identity: WP-7a (the ACL models `promo_<id>`) is the precondition. Matching is on the row's natural key, and `promo_<id>` is kept as image provenance so a test can prove the same promo got a new rendition. **No schema change.**

### 3.2 Schedule and minutes

- **Cron `30 2 * * *`** (02:30 UTC = 04:30 Zurich), after the one observed regeneration (`last-modified 01:19 GMT`, ARCH-IMG §1). It runs every day, including the Mon/Tue/Thu pipeline days. On those days the 05:00 run writes the same URLs again, which is harmless and costs one extra GET.
- **Interaction with the weekly run:** `concurrency: { group: deal-pipeline, cancel-in-progress: false }`, the same group as `pipeline.yml`, so the refresh never races an upsert. If a pipeline run is still in flight it queues. Timeout 10 min.
- **Fetch count to Volg:** 3 pipeline runs + 7 refreshes = **10 GETs/week**, within D-2's approval.
- **GitHub Actions minutes:** the repo `dommalapatikk/basketch` is **PUBLIC** (checked with `gh repo view`), and standard runners on public repos are free and unmetered. Each job is about 1 minute (checkout, `npm ci` for `pipeline/`, one tsx run). No poppler, no Python.
- **Known risk:** GitHub disables scheduled workflows after 60 days without repo activity (memory note `project_basketch_pipeline_inactivity`). This job adds no commits, so it has the same exposure as the weekly pipeline. Keep-alive stays the SRE's concern.

### 3.3 Browser fallback (WP-7b) and "no empty boxes"

- `ProductImage` becomes a client component (it needs `onError`). On error, **both** the `next/image` path and the `FlyerCrop` `<img>` render `<NoPictureCard store category />`.
- **Today's "no image" state is an empty grey square** (`DealCard.tsx:164`, `bg-[var(--color-page)]` with `ProductImage` returning `null`). That is exactly the empty box D-2 forbids. The no-picture card must be a **designed** state: store dot + category icon + "No photo from Volg", not colour-only (WCAG). **Designer task**, reusing `IconHeading` icons.
- **Honest limit to tell the PM:** about **7 of 25 Volg promos have no picture on Volg's own page** (empty `c-product__image` div, ARCH-IMG §1). No refresh can invent one. Those cards show the designed no-picture card, never an empty box, and never a picture of a different product.

### 3.4 Tests first

| # | Test |
|---|---|
| V-T1 | `Volg 2026-09-25: the promo id survives a rendition-hash change` (WP-7a, two fixtures) |
| V-T2 | `refresh-volg-images updates only image columns: price, dates and category of the row are untouched` (fake store records the column set) |
| V-T3 | `a refreshed row still satisfies deals_one_image_kind, deals_crop_fractions, deals_crop_complete` (reuses the §1.1 property test) |
| V-T4 | `the refresh revalidates the web cache when at least one image changed, and not otherwise` |
| V-T5 | `the refresh writes to no store other than volg` |
| V-T6 | `volg-images.yml shares the deal-pipeline concurrency group` (workflow YAML read in `config.test.ts`, like the timeout inequality) |
| V-T7 | web: `a photo that 404s renders the no-picture card, not a broken image and not an empty square` |

**Blast radius:** new `pipeline/refresh-volg-images.ts` + application service + test, `volg-html-source.ts` (WP-7a), new `.github/workflows/volg-images.yml`, `product-image.tsx` (client, `onError`), new `NoPictureCard.tsx`, `DealCard.tsx` and `ListDrawer.tsx` call sites. **Slot:** WP-7a → 7b → **7c** (after WP-1d, because it writes through `imageColumns`).

---

## 4. "Cheapest" must mean the lowest price (P-7), keeping the category comparison (P-8)

### 4.1 Where the tag is computed today

`web-next/src/server/data/filter-deals.ts`: `buildSections` groups by `subCategory` and sorts by `discountPercent` desc (`:326`). `pickPrimary` (`:297-301`) takes the first deal that `votesInVerdict` and sets `primaryIsCheapest = true`. It is rendered in `DealsClient.tsx:256/382` → `DealCard isCheapest`. **No price or unit price is looked at.** The category verdict (`server/verdict/algorithm.ts`, average discount per category) is **P-8: unchanged**.

### 4.2 What data we actually have

| Signal | State |
|---|---|
| `price_per_unit` + `canonical_unit` on `deals` | Computed by `pipeline/format-extract.ts:196-219`. Units: `L`, `kg`, `100g`, `piece`. Coverage per store: **UNVERIFIED** (my read-only query was refused by the permission layer; the fact sheet §3c also lists it as unverified) |
| Defect in that data | For `piece`, `canonicalValue = packSize ?? 1` (`:211`). **An offer whose pack size was never parsed gets a "per piece" price equal to its whole price.** A 6-pack at 8.95 would claim 8.95/piece. It must not be used for a "cheapest" claim until fixed |
| `price_per_unit` is a bare `number` | A value-object smell (CLAUDE.md DDD). The unit and its provenance are separate nullable columns |
| Sub-categories | Broad: `meat` holds mince and fillet, `dairy` holds milk (L) and cheese (kg) |
| Concept / sku layer | `concept` 10,152 rows vs 9,890 distinct store products (TL-PLAN §2.5). The concept key is `slug(subCategory + productName)` (`v3-cutover.ts:115`), and product names differ between retailers, so **a concept is in practice one store's product**. It cannot tell us "the same milk at Coop and at Denner". The share of concepts spanning ≥ 2 stores is **UNVERIFIED** but, from that key, expected to be near zero (query in §4.7) |

### 4.3 Definition options

| Option | Definition | Honest limits | Verdict |
|---|---|---|---|
| **C-1 Lowest unit price within the section** | Among the section's offers that **vote** (in effect today, not member-only, not uncertain: the existing `votesInVerdict`) **and** have a trustworthy `UnitPrice`, group by unit. Take the unit group with the most offers (tie order kg, L, 100g, piece). "Cheapest" = the lowest CHF-per-unit in that group. **No tag if that group has fewer than 2 offers** (a claim with no comparison is not a comparison) | Offers with no parsed quantity cannot win. In a broad section it compares, say, mince and fillet per kg: true as stated ("lowest price per kg among these meat offers"), but not like-for-like. It is relative to **the offers shown** (filters apply), never "in Switzerland" | **Recommended** |
| C-2 Lowest shelf price in the section | min `salePrice` | A 100 g pack "beats" a 1 kg pack. Literally true, misleading in effect, so an Art. 3(1)(e) UWG risk | Rejected |
| C-3 Lowest price for the same product across stores (concept/sku) | min price per concept | The data has no cross-store identity (§4.2). Building it is the "follow-up ADR" one-way door, and it is per-item routing, which P-8 said not to build now | Rejected for now |
| C-4 No tag at all | — | Honest but drops a feature the PM kept | Fallback only when C-1 finds < 2 comparable offers |

### 4.4 Design (DDD)

- **Value object `UnitPrice`** in `web-next/src/lib/domain/unit-price.ts` (and its pipeline twin in `shared/`): `{ perUnit: Money, unit: 'kg'|'L'|'100g'|'piece' }`. It can only be built from a **parsed** quantity. The constructor rejects `piece` without a parsed pack size. `compare(a, b)` refuses different units (it returns a Result, not a number).
- **Pure function `cheapestInSection(deals, today): DealId | null`** in `lib/domain/cheapest.ts`, applying C-1. `pickPrimary` stops deciding "cheapest". `DealsSection` gets `cheapestId: string | null` in place of `primaryIsCheapest`.
- **Pipeline fix:** `format-extract.ts` emits `pricePerUnit` for `piece` only when `packSize` was parsed. The next run rewrites the rows (no backfill needed; offers turn over weekly).
- **Label:** it stays "Cheapest" (PM). The basis must be verifiable, so the card that wears the tag shows its `CHF x.xx / kg` line (already rendered at `DealsClient.tsx:376-378`) next to the tag. Designer check.

### 4.5 Tests first

| # | Test |
|---|---|
| CH-1 | `2026-09-25 P-7: "Cheapest" goes to the lowest price per kg, not the biggest discount` (40% off at 24.00/kg vs 10% off at 9.00/kg → the 9.00/kg offer) |
| CH-2 | `offers in different units are never compared` (kg vs L section → group with most offers wins, the other unit is untagged) |
| CH-3 | `a single comparable offer is not called Cheapest` |
| CH-4 | `a not-yet-started, member-only or uncertain offer never wears Cheapest even when it is cheapest per kg` (keeps the existing rule) |
| CH-5 | pipeline: `2026-09-25: a pack with no parsed size gets no per-piece price (it was the whole price)` |
| CH-6 | `UnitPrice cannot be built for 'piece' without a parsed pack size` |

**Blast radius:** `filter-deals.ts` (+test), new `lib/domain/unit-price.ts` + `cheapest.ts`, `DealsClient.tsx` (prop rename), `DealCard.tsx` (unchanged API), `pipeline/format-extract.ts` (+test). Category verdict: **untouched**. **Slot: new WP-12.** Web-only plus one pipeline file, no shared files with WP-1, so it can go to the second builder in parallel.

**Step 0 of WP-12 (measure before building, read-only):**
```sql
select store,
       count(*) filter (where price_per_unit is not null and canonical_unit is not null) as with_unit_price,
       count(*) as live
from deals
where is_active and valid_to >= (now() at time zone 'Europe/Zurich')::date
group by store order by store;
```
If coverage is low (e.g. under ~40% in most sections), most sections will show no tag. The PM should see that number before WP-12 ships.

### 4.6 The one product question for the PM

> **In each section, which card should be at the top?**
> (A) The cheapest-per-kg/litre offer goes to the top and wears "Cheapest". The section is sorted by price per unit.
> (B) The biggest discount stays at the top as today, and the "Cheapest" tag goes on whichever card is cheapest per kg/litre, even if it is further down the list.

My lean is **(A)**: the headline card and the headline claim then agree. It is the PM's call.

### 4.7 Coordinator's question: should "cheapest" use concepts/skus? **No.** Recommendation on WP-1b

- C-1 needs **no** concept, sku or `concept_cheapest_now`. It works on `deals` alone.
- The concept key makes concepts per-store (§4.2), so `concept_cheapest_now` compares one store with itself. It has **no reader** since WP-11 (Code Reviewer finding).
- **Recommendation to the Tech Lead:** retire the sku part of WP-1b (`sku_id` linking) and **stop writing `concept`, `sku` and `deals.sku_id`** in WP-1a's catalogue module. That is a two-way door: the tables stay, nothing is dropped. It also removes the v3 write-tail cost (TL-PLAN §2.4, about two round trips per deal). Drop the tables and MVs only later, after WP-0(c) captures their definitions, under the follow-up ADR. Revive cross-store identity only if the PM ever asks for per-item routing (P-8).
- Confirming query (read-only): `select count(*) filter (where n >= 2) as multi_store, count(*) as concepts from (select concept_id, count(distinct store_id) n from sku group by concept_id) t;`

---

## 5. Contact form (P-9)

### 5.1 Options

| | **Resend free + Next.js route handler** | Gmail SMTP app password + route handler (nodemailer) | Formspree free |
|---|---|---|---|
| Free limit | 3,000/month, **100/day** (resend.com/pricing, checked today). Without a verified domain, `onboarding@resend.dev` delivers **only to the Resend account owner's address**. That fits: the PM signs up with her Gmail | Gmail sending limits; free | 50 submissions/month |
| Recipient secret | `CONTACT_TO_EMAIL` Vercel env var | Same | Held in Formspree's dashboard (not in repo) ✓ |
| Credential blast radius if leaked | An API key that can only send mail (to the PM, while unverified). Revocable | **An app password gives send access as the PM's Gmail account.** Much worse | None in our code |
| Code | ~1 `fetch` to `api.resend.com`, no SDK | Adds `nodemailer`, SMTP from serverless | None server-side, but the browser posts to a third party |
| Privacy | Message passes through Resend (US) | Google (already the PM's mailbox) | Formspree stores submissions |
| Verdict | **Recommended** | Rejected (credential scope) | Rejected (third-party storage, 50/month, browser → third party) |

### 5.2 Design (DDD, small)

- `web-next/src/lib/domain/contact-message.ts`: **value object `ContactMessage`**. Constructor: `body` trimmed, 10–2,000 chars. `replyTo` optional, a valid email, **rejects CR/LF** (header injection). No other fields.
- Port `Mailer.send(msg): Promise<Result<void>>`. Adapter `ResendMailer` (POST `https://api.resend.com/emails`, `from: 'basketch <onboarding@resend.dev>'`, `to: process.env.CONTACT_TO_EMAIL`, `reply_to: msg.replyTo`, subject `basketch feedback`, plain text).
- `app/api/contact/route.ts` (POST, Node runtime) is the application: origin check → size cap (4 KB body) → honeypot → time trap → build `ContactMessage` → send.
- **Spam, free only:** hidden honeypot field `website` (filled → respond 200 and send nothing, so bots learn nothing); a time trap (form render timestamp; submitted < 3 s later → silent drop); `Origin` must equal `NEXT_PUBLIC_SITE_URL`; body cap. **Ceiling:** Resend's 100/day hard cap. The worst case is 100 spam mails in a day, then sending stops, with no charge (the free plan does not bill). Escalation only if spam actually arrives: Cloudflare Turnstile (free, not a paid captcha), which adds a third-party script and a privacy-note line.
- **Secrets:** `RESEND_API_KEY` and `CONTACT_TO_EMAIL` are server-only (no `NEXT_PUBLIC_`). If either is missing, the route returns 503 and the form shows "The contact form is unavailable right now." The recipient is never echoed in any response, log line or page.
- **UI:** replace `about.contact.body` (`en.json:34`, `de.json:34`) with a heading, a short line and the form: message (required), email (optional, "only if you'd like a reply"), send. Three states (idle/sending, error, sent). 44 px targets, labels, focus rings. Designer + copy.
- **Privacy copy impact:** add a Privacy bullet (Designer wording). Draft: "If you use the contact form, your message, and your email address if you give one, is sent to us by email through Resend, an email service based in the US. We keep it only in our inbox, not on basketch." The existing "No tracking cookies" stays true (no script is added).

### 5.3 Tests first

| # | Test |
|---|---|
| CF-1 | `P-9: the contact address never appears in the page or the messages files` (grep `messages/*.json`, the rendered About page, and repo-wide for `hello@basketch.app`) |
| CF-2 | `a filled honeypot returns 200 and sends nothing` (fake Mailer) |
| CF-3 | `a reply-to containing a line break is rejected` (header injection) |
| CF-4 | `missing RESEND_API_KEY or CONTACT_TO_EMAIL → 503, and the response never contains the recipient` |
| CF-5 | `a message under 10 or over 2,000 characters is rejected with 400` |
| CF-6 | `a cross-origin POST is rejected with 403` |
| CF-7 | e2e (Playwright, mailer stubbed): `the About page form sends and shows the sent state; axe passes` |

**Blast radius:** new `app/api/contact/route.ts`, `lib/domain/contact-message.ts`, `server/mail/resend-mailer.ts`, a `ContactForm.tsx` client component, `about` page, `en.json`/`de.json`, CLAUDE.md Environment Variables table (two new server secrets). **Slot: new WP-13**, web-only, parallel to WP-1.

---

## 6. Updated plan slots (additions to TL-PLAN §7)

| WP | Change | Status |
|---|---|---|
| WP-0 | + record D-3/D-6 in CLAUDE.md § Legal and the `product-image.tsx` URG note; + document the `flyer-crops` bucket and the contact secrets | Proceed now |
| WP-1a/1b | **Recommend:** stop writing concept/sku/`sku_id` (§4.7). Tech Lead decides | Tech Lead ruling |
| WP-5 | ALDI `spreads.json` capture now allowed (D-1) | Proceed |
| WP-6 | Ready as designed (§2) | Unblocked |
| WP-7c | Daily Volg refresh, separate workflow (§3) | Unblocked; after 7a/7b and WP-1d |
| WP-8a | Photo locator (shared SPAR/ALDI) | After WP-6 |
| WP-8b | Hosted SPAR crops (ADR-SPAR-1) | After WP-1d, WP-4, WP-8a |
| WP-8c | SPAR Friends member-price label | **Proceed now** (legal accuracy) |
| WP-9 | Closed, no code change (D-6); the doc update moves to WP-0 | Closed |
| WP-12 | "Cheapest" = lowest unit price | Step 0 measure → PM answers §4.6 → build. Parallel builder |
| WP-13 | Contact form | After the PM's manual steps (§8). Parallel builder |

Sequencing (unchanged core): WP-0 → WP-1a…1e → measured run → WP-2 → WP-3 → WP-4 → WP-5 → WP-6 → WP-7a/b → **WP-7c** → **WP-8a → WP-8b** → WP-10 → WP-11 → WP-1f. **WP-8c, WP-12 and WP-13** go to the second builder in parallel. They share no files with WP-1.

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Wrong photo paired to a SPAR price (~5/65 on KW39) | Medium | S-2 refuses ambiguous pairs; the no-picture card is better than a wrong picture. Coverage is watched by WP-3 |
| Supabase free project paused after 1 week inactive | Low (3 runs/week + keep-alive) | Existing keep-alive job |
| Vercel Hobby 5K transformations/month already stretched by ~1,500 other retailer photos a week | **UNVERIFIED**: the PM can see actual usage in the Vercel dashboard | Our SPAR crops use `unoptimized` (0 transformations). If the quota is exceeded, new images fail with 402 and the WP-7b fallback shows the no-picture card |
| Volg regenerates at a different time | Medium | The daily "changed" count exposes it; move the cron |
| Resend changes its free tier | Low | `Mailer` port; switching to a different adapter is one file |

## 8. Manual steps for the PM

Only WP-13 (contact form) needs you. Nothing else here requires a manual step: the Storage bucket is created by a migration, and the Volg workflow uses secrets that already exist.

1. Go to **resend.com** and click **Sign up**. Sign up with **the Gmail address where you want to receive feedback**. This matters: without your own domain, Resend only delivers to the address you signed up with.
2. Confirm the address by clicking the link in the email Resend sends you.
3. In Resend, click **API Keys** in the left menu, then **Create API Key**. Name it `basketch-contact`, set Permission to **Sending access**, and click **Add**. Copy the key (it starts with `re_`). It is shown only once.
4. Go to **vercel.com** → open the **basketch** project → **Settings** (top bar) → **Environment Variables** (left menu).
5. Add a variable: Key `RESEND_API_KEY`, Value = the key from step 3, Environments **Production** and **Preview**, tick **Sensitive**, then click **Save**.
6. Add another: Key `CONTACT_TO_EMAIL`, Value = the same Gmail address as in step 1, the same environments, **Sensitive**, then **Save**.
7. Tell the coordinator "contact secrets are set". The builder then deploys, and you send one test message from the About page.

Optional, for the "Cheapest" work (WP-12): answer the question in §4.6 (A or B).
