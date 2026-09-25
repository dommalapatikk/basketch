# RCA — missing product images (ALDI, Volg, SPAR) — Tech Lead

**Date:** 2026-09-25 · **Author:** Tech Lead · **Phase:** root-cause analysis only (no code, no commits, no DB writes)
**Input:** `docs/qa/2026-09-25-missing-images.md` · run `35983172760` (2026-09-24, head `8cc8beb`) · production DB (read with the public anon key) · live retailer responses fetched once each on 2026-09-25 with an honest UA.
**Cross-review:** the Architect is investigating in parallel; this document is written to be compared line by line.

---

## Summary

| # | Problem | Proven root cause | Regression? | Class |
|---|---|---|---|---|
| 1 | ALDI 211/211 no picture | `findPageImageUrls` parses a response shape ALDI's `data.json` **has never had**. It was written from the Publitas **REST v1 API docs** (a different, authenticated API) and tested only with synthetic JSON copied from those docs. The page images live in `spreads.json`. | **No. The Sept 16 fix never worked.** 0 of 517 ALDI rows have ever had a crop. | Parser built from docs, not from a captured response |
| 2 | Volg 17/17 URLs 404 | Volg's CMS (TYPO3) regenerates `_processed_/csm_*` renditions with a **new hash overnight** and deletes the old ones. We store the rendition URL and keep it for 3–6 days. | n/a (design gap since day one) | Ephemeral reference stored as if durable |
| 3 | SPAR 60 no picture | The premise "no evidence SPAR publishes page images" is **false**. iPaper serves `Pages/{n}/{Thumb\|Normal\|Zoom}.jpg`, but **only with a signed policy token that expires after ~24h** (403 without it). | n/a | Ephemeral reference + a legal question → **PM** |
| 4 | Nothing alerted | There is no image-coverage measurement or rule. The ALDI adapter **did** detect the fault, but only as a free-text warning. That warning was cut from the log by a 20-item cap and does not count toward any alert. | Missing check | Missing invariant/metric |

Problems 2 and 3 are the same class: a reference that stops working before the Offer's validity window ends. They should be fixed with one concept, not two patches.

---

## 1. ALDI — every card empty

### Where the crop is lost: at collection, not at transform, enrichment or the frontend

I traced every stage with evidence:

| Stage | Evidence | Verdict |
|---|---|---|
| **Frontend** | `supabase-provider.ts:155-164` maps `page_image_url + crop_*` to a `CropRegion`. `product-image.tsx:75-93` renders it as a plain `<img>`. **Migros takes the same path and works on production (49/49 crops).** | Not the break |
| **DB row** | Anon REST: `store=eq.aldi&page_image_url=not.is.null` → **`*/0`**, across all 517 ALDI rows ever stored (valid_from 04-23 … 09-28). Live: 211 rows, `page_image_url` null on all; `sale_price_rappen` set on all, `updated_at 2026-09-24T11:11…11:23`. | The rows were written with no crop |
| **Enrichment** | `sale_price_rappen` and `price_basis` come **only** from `writeEnrichment` (`write-enrichment.ts:96-106`). They are set on all 211 ALDI rows, so enrichment **did** match every ALDI row. It wrote `page_image_url: null` because the offer carried none (`offer-to-unified.ts:84,95`). | Not the break — it faithfully wrote a null |
| **"451 of 1631 matched NO row"** | Attempt 1 held back 451 products (`held back by reason: not-attempted=451`, log line 1653). The deadline forced a retry (line 2529). Attempt 2: 69 unmatched, `enriched 1561/1631`. | Unrelated to ALDI (a red herring) |
| **Collection** | Offline repro (below): the repo's own `findPageImageUrls` returns an **empty map** for the real KW39 `data.json`. Every `pageImageUrl(n)` then returns `''` (`live-sources.ts:429`). `cropRegionFromPoints` rejects `''`, so `tileToCropRegion` returns null (`tile-locator.ts:140`) and every offer has `image: null` (`aldi-flyer-source.ts:191`). | **The break** |

### The exact defect

`pipeline/collection/infrastructure/aldi/aldi-flyer-source.ts:314`
```ts
const PAGE_IMAGE_PATH = /"(\/\d+\/\d+\/pages\/[0-9a-f]{40})"/g
```
It is applied to `data.json` (`live-sources.ts:418`). Here is what ALDI actually serves, fetched 2026-09-25:

- `catalog.aldi-suisse.ch/aldiwoche_kw39-2026_de/data.json` → 200, 33 KB. The top-level keys are `id, groupId, …, coverScreenshot, numPages (38), cacheToken, …`. There are **0** `/pages/` substrings and **0** `.jpg`. The only image is `coverScreenshot`, which is page 1 only.
- The viewer's own bundle loads the pages from `${url}/spreads.json?version=${cacheToken}`. That file is 200, 195 KB: 20 spreads, **38 pages**. Each page has an explicit `number` and `images.{at200…at2400}`, e.g.
  `/resize/rev-95488569/<sig>/fit-in/1272x2012/filters:quality(90)/production-revolution-publitas-com/95562/3359945/pages/80bc7678-…-downscaled.jpg`.
  That path returns **200 image/jpeg** at both `view.publitas.com` and `catalog.aldi-suisse.ch`. The image aspect (1272/2012 = 0.632) matches the PDF page aspect (502/794 = 0.632), so the stored crop fractions line up without conversion.
- The regex's shape (40-hex hash under `/pages/`) matches **neither** file. The page ids are UUIDs.

**Offline reproduction**, using the repo's own functions on the captured responses (`tsx`, scratchpad):
```
data.json    -> findPageImageUrls map size 0
spreads.json -> findPageImageUrls map size 0
pageImageCoverageWarning(38 pages) -> "page-image count (0) does not match the PDF's own page count (38) — …"
```

### Why the Sept 16 fix passed review and still shipped broken

- `aldi-flyer-source.test.ts:57-67` builds its input from the **documented REST v1 example** (`{ spreads: [{ pages: ['/1230/10323/pages/<40hex>'] }] }`), not from a captured ALDI response. d061a30's commit message says the host was "verified live via one HEAD request against Publitas' own published example". That verified the *docs' example image*, not ALDI's descriptor. The test proved the regex matches the docs, which it does.
- This breaks the approved TDD rule "adapter by adapter against **captured** fixtures". Every other adapter in `__fixtures__/` uses real captures. ALDI's `data.json` was never captured.
- After the merge, three scheduled runs (09-21, 09-22, 09-24) stored ALDI deals with 0 crops. The fault surfaced four days late, through manual QA.

**WP-J1 / P9:** I found no effect. `editionFor` resolved KW39 correctly: the catalogue fetched, 163 offers, all three cycles present in the DB. P9 (`attributes_version`) does not touch images. The DB also shows no ALDI crop **before** WP-J1, so there is nothing for it to have regressed.

### Domain concept at stake (DDD)

`ProductImage` / `CropRegion` must reference a **page rendition that exists**. The anti-corruption layer's job is to translate Publitas' *real* vocabulary (`spreads[].pages[].number`, `images.atNNNN`). Here it translated an imagined one. There is also a latent mapping hazard: the current code assigns page numbers by **order of regex hits** (`aldi-flyer-source.ts:345-351`), when the real response carries an explicit `number`. Order-based numbering is exactly the wrong-photo risk MUST-FIX 2a worried about. Keying on the explicit `number` removes that risk.

### Test that must fail first (TDD)

1. **Fixture:** commit a trimmed capture of the real KW39 `spreads.json` (a few spreads, `text` removed) and the real `data.json`, under `aldi/__fixtures__/`.
2. **Red:** `findPageImageUrls(realSpreadsJson)` returns one URL per page, keyed on `page.number`, with a `view.publitas.com` URL at the chosen width tier. Today it returns size 0.
3. **Red, named after the defect:** `'2026-09-25 regression: data.json carries no page images — they come from spreads.json'`. It asserts `findPageImageUrls(realDataJson).size === 0` and that the source still produces crops when `spreads.json` is supplied.
4. **Red, composition:** `live-sources.test.ts`: `createAldiSource` requests `spreads.json` for the **same edition** (URL derived from `catalogPageUrl`, never a separate constant), and `parseFlyer` over the committed PDF-bbox fixture yields ≥ 1 offer with `image.kind === 'crop-region'`.
5. Delete the synthetic-docs tests (lines 57-92) or rename them honestly. They currently protect a shape that does not exist.

### Proposed fix

- `findPageImageUrls` reads `spreads.json`'s `spreads[].pages[]`, maps `number → https://view.publitas.com + images.at1600` (tier constant kept), and ignores anything that is not a page.
- `createAldiSource.loadPages` fetches `data.json` (PDF url + `cacheToken`) and then `spreads.json?version=<cacheToken>`, in that order, in the same edition-driven closure.
- Keep `pageImageCoverageWarning`, but see §4: it must become a typed measurement, not a string.
- **Blast radius:** 2 pipeline files plus fixtures and tests. No DB migration, no frontend change. The live rows heal on the next ALDI run, because enrichment already matches every ALDI row.
- **Risk:** a wrong page→image mapping would show the wrong product. Mitigations: key on the explicit `number`; assert image aspect ≈ PDF page aspect (±2%) per page and refuse the crop otherwise; keep the count check.
- **To measure before trusting (Tech Lead action, not PM):** whether the signed `/resize/rev-…/<sig>/` path stays stable for the whole publication week. Re-read `spreads.json` 24h and 72h later and diff. If it rotates, ALDI joins the ephemeral-reference class in §2/§3.
- **PM flag:** this adds a **third request** per ALDI publication (`data.json`, `spreads.json`, PDF). My reading of "one fetch per store per week" is "one publication read per week", which this satisfies (it is the same request every visitor's viewer makes). Because the rule sits under *Legal Constraints*, the PM should confirm that reading.

---

## 2. Volg — stored URLs go stale overnight

### Proven cause

- The DB holds 24 live Volg deals and 17 image URLs, all captured by run 35983172760 (`updated_at 2026-09-24T11:11`). The deals are valid through **2026-09-26**.
- The live page, fetched 2026-09-25 ~13:00 UTC, still promotes **the same 17 promo ids** (76196, 76137, …, 76120). **Every one has a different hash suffix**, e.g. `csm_promo_76180_de_b436a894e6.jpg` (stored, **404**) → `csm_promo_76180_de_e038c9db55.jpg` (live, **200**, `last-modified: Fri, 25 Sep 2026 01:19:05 GMT`).
- So Volg's TYPO3 regenerated its processed renditions at about **01:19 UTC**, about 15h after our capture, and deleted the old files. The promo id is stable. The rendition URL is not.
- The capture code is `volg-html-source.ts:242-245`. It stores `<img src>` verbatim as a `SourceUrl`, and nothing re-reads it until the next scheduled Volg run.
- **The 7 missing URLs are correct output.** Today's page has 25 image slots, and 8 contain no `<img>` (already documented at `volg-html-source.ts:184-201`). Volg publishes no photo for those products.
- **Not yet known:** the regeneration cadence (nightly? on every CMS publish?). One observation proves it happens within a day. That is enough to show a weekly capture cannot hold, but not enough to design a refresh schedule.

### Domain concept at stake

The domain conflates two things:
- the retailer's **stable image identity**: Volg promo `76180`, SPAR paper GUID + page, ALDI page `number`;
- the **rendition URL** that currently serves it, which may be short-lived.

`ProductImage` stores only the rendition, with no notion of how long it is valid. Missing invariant: **a stored image reference must be expected to resolve until `offer.validity.to`**. Volg breaks it within a day.

### Test that must fail first

- Domain: `productImage` carries a `durability` (`'stable' | { expiresAt } | 'rendition'`). A new rule at the storage boundary, `'refuses to treat a rendition reference as stable past its capture day'`, fails today because the type does not exist.
- Adapter (fixture-based): `'Volg 2026-09-25: the promo id survives a rendition-hash change'`. Parse the committed fixture and a second fixture with rotated hashes; assert the same `promoId` for both and different URLs.

### Options (the fetch-policy trade-off belongs to the PM)

| Option | What | Cost | Who decides |
|---|---|---|---|
| **A. Daily image refresh** | A small daily job re-reads the Volg page (one ~53 KB GET) and rewrites `image_url` by promo id for live Volg rows. It runs after the observed 01:19 UTC regeneration. | +6 fetches per week to Volg. There is still a window between Volg's regeneration and our refresh. | **PM** (changes "one fetch per store per week") |
| B. Resolve at request time | Store the promo id; the web server resolves the current URL from a cached Volg page. | Server-side fetches from Vercel, frequency tied to traffic/ISR | PM + me; I advise against it (more moving parts) |
| C. Honest empty | Drop Volg image URLs; show the no-image card | 0 fetches; Volg loses 17 photos | **PM** |

**Tech Lead recommendation:** build the domain concept (identity + durability) first, whichever option is chosen. Then A, as a generic **reference refresh** step that SPAR can share (§3). Until the PM decides, the storage boundary should stop presenting a known-dead URL: set `image_url` to null when a rendition is older than its expected life. An empty card is honest; a broken one is not.

---

## 3. SPAR — the premise does not hold

### Evidence

- `angebote.spar.ch/flugblatt/2026/spar-angebote-kw39-2026/` embeds `staticSettings.aws = { url: "https://cdn.ipaper.io/iPaper/Papers/1ef1c2d6-…/", policy: "token=…&token_path=/iPaper/Papers/1ef1c2d6-…/Pages/&expires=1790417660" }`.
- The iPaper viewer bundle (`cdn.ipaper.io/Cache/509/509.46.0.0/Frontend-Desktop/desktop_gzip.js`) builds page images as `${aws.url}Pages/${n}/${size}.jpg?${aws.policy}`, with sizes `Thumb | Normal | Zoom`.
- `Pages/1/Normal.jpg?<policy>` → **200** image/jpeg 703×995. `Zoom.jpg` → **200**, 1143×1617. **Without the policy → 403.** The image aspect (0.7069) matches the PDF page (595.28×841.89 = 0.7071), so crops would line up.
- The policy **expires 2026-09-26 10:14 UTC**, measured at 12:58 UTC on 09-25: roughly a **24h signed token**, reissued each time someone loads the viewer page.

So SPAR **does** publish page images. The reason to hold back is **not** "no evidence". It is that access is gated by a signed, expiring token.

### Domain concept and the legal question

This is the same ephemeral-reference class as Volg, with one addition: the token is an **access control**. The URG design (`product-image.tsx:45-58`: store coordinates, the visitor's browser fetches from the retailer, never re-host) is satisfied technically, because the pixels would still come from iPaper. The open question is whether storing and handing out an iPaper-issued token beyond the session it was minted for counts as working around a technical measure (CLAUDE.md, "Never circumvent a technical protection measure"). Every anonymous visitor receives the token freely, so it is not a wall being broken. It is still a line the project has said it will not approach without a decision.

**→ PM decision (with the legal note):** is SPAR crop display allowed via a token refreshed daily (shared refresh step, §2 option A), or does SPAR stay an honest empty card? **Tech Lead position:** technically feasible with the same refresh mechanism as Volg, and never by re-hosting. I would not ship it without the PM's explicit legal sign-off, and I would never persist a token past its `expires`.

**Test that fails first, if approved:** `'SPAR 2026-09-25: page image reference carries its policy expiry, and the storage boundary refuses one that expires before validity.to without a refresh'`.

---

## 4. Why nothing alerted

### Proven gaps

1. **No image metric exists.** The alert catalogue (`transformation/domain/alerts.ts`: `pipeline-stale, run-halted, classifier-*, source-shape-changed, uncertainty-spike, invalid-category-spike, cache-hit-rate-low, run-slow, spend-*`) has nothing about images. The run snapshot's `publishedDataCoverage` (`run-snapshot.ts:92`) measures `sourceAttributes`, not images.
2. **Even the analogous rule could not have fired.** `source-shape-changed` (`alerts.ts:269-279`) fires only on a *collapse* from a previous value above 0.5. ALDI's image coverage was never above 0, so a relative rule is blind to "never worked". An **absolute per-retailer floor** is needed, the way `expectedMinimumOffers` already works for counts.
3. **The adapter detected the fault, and it was lost twice.** `pageImageCoverageWarning` fires on real data (offline repro above). But (a) it is a free-text warning inside an `ok` span, and warnings feed no alert; and (b) it is pushed **last** (`aldi-flyer-source.ts:406-407`), while `json-telemetry.ts:51` logs only `warnings.slice(0, 20)` of ALDI's 35. It is therefore absent from the run log. The QA doc's "35 warnings, all 'no product name'" came from the 20 visible ones.
4. **No reachability check on stored references.** Volg's 404s and a future SPAR token expiry cannot be seen from collection-time data. Only a probe after storage can see them.
5. **No post-merge verification.** d061a30 was "manually verified red → green" against synthetic input. Nobody checked for ALDI crops in the DB after the next run. This is a process gap: the builder checklist needs a "prove it on production data after the first run" step for data-path fixes.

### The missing invariant

> **Every retailer that promises images delivers them, and the references still resolve.** Per retailer: `imageCoverage ≥ expectedImageCoverage` (declared by the adapter, like `expectedMinimumOffers`), and a sampled reachability rate ≥ a floor.

### Proposed system fix

- `OfferSource` declares `expectedImageCoverage` (ALDI/Migros/Coop/Denner/LIDL ≈ 0.9; Volg ≈ 0.6, since ~7 of 25 have no photo; SPAR 0 until the PM decides).
- The run snapshot gains `imageCoverage: Measured<Partial<Record<Retailer, number>>>`, computed from **collected offers**, plus a second figure from **stored rows** (catches boundary loss).
- A new alert: `image-coverage-below-floor`, **critical**, **absolute**, not relative to the previous run.
- Adapter image diagnostics become a typed field on the span (`imageCoverage`), not a string in `warnings`. The telemetry cap stays, but typed metrics are never truncated.
- A post-run reachability probe: HEAD a small sample (e.g. 3 per retailer) of stored image/page URLs → `image-unreachable` alert. It is a few extra requests per week, and the PM should acknowledge that under the fetch rule.
- **TDD, red first:** `alerts.test.ts`: `'2026-09-25: ALDI at 0% image coverage raises image-coverage-below-floor even with no previous run'`. Port contract test: `'an adapter declaring expectedImageCoverage > 0 yields that coverage on its captured fixture'` (this would have failed for ALDI on 09-16).
- **Blast radius:** `offer-source.ts` (port field), all 7 adapters (one constant each), `run-snapshot.ts`, `alerts.ts`, telemetry span shape, and one new probe step. No schema change if the snapshot is stored in the existing run record.

---

## Side findings (found while tracing; not the cause of this incident)

1. **The enrichment key is a `|`-joined string** (`offer-to-unified.ts:26-27`, split at `write-enrichment.ts:81`). A product name that contains `|` shifts the split. Proof: run log lines 2506 and 4905, `enrichment failed for "disney stitch plüschtier…": invalid input syntax for type date: " 15 cm "`. This is primitive obsession; the key should be a struct. Low blast radius; fix in the same pass as §2's storage-boundary work.
2. **The lossless single-write path is built but unused.** `offerToRow` (`deal-row.ts:87`) carries crops and price basis in one row. Its only caller, `createSupabaseDealStore`, has **no production caller**. Crops still cross the lossy `UnifiedDeal` boundary and are re-joined by string key. Not the ALDI break, but it is why an image can silently fall on the floor between stages. Record as tech debt; retiring the enrichment pass is a separate WP.
3. **URG consistency, PM/legal:** `product-image.tsx:53-57` forbids `next/image` for crops because it "would fetch the page onto Vercel, re-encode it, and serve a derived copy from our own domain". The **photo** path (`product-image.tsx:27-37`, Coop/Denner/LIDL/Volg) does exactly that through `/_next/image` (the QA doc confirms the 200 via `/_next/image`). The same legal reasoning applies to both paths. I am flagging this, not deciding it.
4. **The write-tail budget is exceeded:** 861.8s and 982.8s against `WRITE_TAIL_MS` 570s (log lines 2527, 4923). This is already covered by the separate `2026-09-25-tech-lead-max-chunk-ms.md` work.

---

## Decisions needed from the PM

1. **Fetch policy:** does "one fetch per store per week" mean one *publication read* (ALDI's three requests for one catalogue are fine), and may a daily image-refresh read be added (Volg, and SPAR if approved)?
2. **SPAR:** display crops through iPaper's daily-refreshed signed page URLs, or stay an honest empty card? Needs the legal view on token reuse.
3. **Volg:** daily refresh (option A), or honest empty (option C)?
4. **URG consistency** of the `next/image` photo path (side finding 3).

## Technical decisions I am taking (two-way doors)

- ALDI image source → `spreads.json`, keyed on the explicit page `number`, with an aspect-ratio guard.
- `ProductImage` gains a stable identity + durability. The storage boundary refuses to present an expired reference.
- An image-coverage floor per adapter, and an absolute critical alert.
- Captured-fixture rule enforced in review: no adapter parser test may use a hand-written stand-in for a retailer response the adapter reads in production.

## Suggested order (finish before starting)

1. ALDI (proven, self-contained, heals 211 cards). 2. The §4 image-coverage invariant + alert, so the class cannot hide again. 3. The domain durability concept. 4. Volg/SPAR per the PM's decisions.
