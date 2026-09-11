# Collection & Processing module — design

**Date:** 2026-09-08
**Status:** **APPROVED by user** — domain-driven design + test-driven approach + modular structure.
**Depends on:** [`data-source-research-2026-09-07.md`](./data-source-research-2026-09-07.md) — all endpoints, legal position and per-field source matrix.

---

## Approved decisions

| Decision | Value |
|---|---|
| Design method | **Domain-driven design** |
| Development method | **Test-driven** |
| Structure | **Modular** |
| Data source | **Direct from retailers — except Coop.** |
| **Coop** | **aktionis** (decided 2026-09-09). coop.ch is DataDome-blocked and its flyer is a measured **11% subset** (~195 of ~1006 weekly promotions). aktionis is the only source with Coop's full set. See research Part 4c. |
| Migros OCR | **Free** — `rapidocr-onnxruntime`, CPU-only, 2× upscale, ~4s/page. No paid API. See research Part 4d. |
| Fixtures | Commit **extracted artefacts** (API JSON, `pdftotext -bbox` XML) — never the 38 MB / 28 MB source PDFs |
| Language | **TypeScript throughout**, shelling out to poppler |
| `UnifiedDeal` | **Replaced outright** by `Offer` — no bridge, since the site has no users |
| Migration | **All at once.** No parallel pipeline. |
| Categorisation | **Our model**, not a borrowed taxonomy |
| Category ground truth | **Denner's own categories**, scored every run |
| Migros | **Kept** — Issuu flyer, never the blocked API |
| Regional pricing | **Does not exist.** One edition per retailer, prices national. |
| **Product images** | **Required on every card.** |
| **Image storage** | **Option B — store coordinates, crop in the browser. Never copy the photo.** |

---

## Bounded context: Deal Collection

One module, two responsibilities: acquire offers from seven retailers, and turn them into validated domain objects. Categorisation sits downstream.

## Ubiquitous language

| Term | Type | Meaning |
|---|---|---|
| **Retailer** | Entity | Migros, Coop, Denner, Lidl, Aldi, Spar, Volg |
| **Offer** | **Aggregate root** | One promoted product, one retailer, one period |
| **Money** | Value object | Amount + CHF. No floats in the domain. |
| **Discount** | Value object | Percent — *and whether it was printed or derived* |
| **ValidityPeriod** | Value object | from → to |
| **ProductImage** | Value object | **Either** `SourceUrl` **or** `CropRegion` — never both |
| **CropRegion** | Value object | page image URL + x, y, w, h |
| **SourceCategory** | Value object | The retailer's own label, where it exists |
| **PriceBasis** | Value object | `Everyone` \| `MemberOnly(programme)` |

## Ports & adapters

One port, seven adapters. Each adapter is an **anti-corruption layer** — it translates a retailer's shape into the domain, and nothing retailer-specific leaks outward.

```
OfferSource (port)
  fetchOffers(week: IsoWeek): Promise<CollectionResult>

  ├── DennerApiSource      JSON API, paginate prd_page 1..11
  ├── VolgHtmlSource       HTML parse
  ├── CoopFlyerSource      PDF text + bbox → CropRegion
  ├── SparFlyerSource      PDF text + bbox → CropRegion
  ├── AldiFlyerSource      PDF text + bbox → CropRegion
  ├── LidlFlyerSource      JSON + PDF cross-check (member prices)
  └── MigrosFlyerSource    page JPEGs + vision → CropRegion
```

**Shared domain services** — used by several adapters, owned by none:
`PdfWordExtractor` · `ProductTileLocator` (words → CropRegion) · `SwissPriceParser` (`"statt 2.25"`, `"–.99"`, `"½ PREIS"`) · `ValidityParser`

## Invariants — every bug found becomes a rule

```
salePrice > 0
originalPrice === null  ⟺  discountPercent === null      ← the Aldi rule
originalPrice !== null  →   originalPrice > salePrice
validTo >= validFrom
ProductImage is exactly one of SourceUrl | CropRegion
PriceBasis.MemberOnly must name its programme            ← the Lidl rule
```

An `Offer` cannot be constructed in an invalid state. Aldi cannot invent a discount it has no original price for; Lidl cannot smuggle a member price through as a normal one.

## Error handling

The existing rule stands — **sources return a result, never throw**. But "empty" is exactly how the categorisation failure hid for months, so empty is no longer allowed to mean "fine":

```
CollectionResult =
  | Ok(offers, warnings[])
  | Failed(reason, detail)

reason = SourceUnavailable    network / HTTP
       | SourceChanged        fetched fine, parsed nothing → schema drift
       | BelowExpectedYield   got 12, this source normally yields ~200
       | PartiallyParsed      n of m items dropped, with reasons
```

**`BelowExpectedYield` is the important one.** Each adapter declares an expected floor. Coop returning 3 offers is a *failure*, not a quiet success.

All outcomes land in `pipeline_runs` — the table already written every run that nothing reads. This gives it something worth reading.

One adapter failing never stops the others.

## Test-driven plan

Real captured fixtures already exist (Denner JSON, Volg HTML, Coop PDF, Spar PDF, Migros JPEGs) so tests run offline, fast and deterministic.

1. **Domain first** — `Money`, `Discount`, `ValidityPeriod`, `PriceBasis`, `ProductImage`, `Offer` invariants. Pure, no I/O. Red → green before any adapter exists.
2. **Port contract test** — one shared suite every adapter must pass: returns a `CollectionResult`, never throws, every `Offer` satisfies its invariants.
3. **Adapter by adapter against fixtures** — Denner first (simplest, and it is the marking scheme), then Volg, Coop, Spar, Aldi, Lidl, Migros.
4. **Regression tests named after the real bugs:**
   - Lidl grapes → surfaces `1.49` with `MemberOnly(Lidl Plus)` at `1.39`; never a bare `1.39`
   - Aldi item with no `statt` → `originalPrice` and `discountPercent` both null
   - Coop page 5 → yields a `CropRegion`, not an empty image
   - Denner → 246 offers across 11 pages, no duplicates

---

## Solved during this session

### Denner pagination — SOLVED

`refiningId` goes **inside `parameters`**, with no leading `&`:

```json
{"moduleVersion":"D2.0","sessionId":"<uuid>","region":"de_CH",
 "advanced":{"device":"COMPUTER"},"pageId":12,
 "parameters":{"refiningId":"prd_page=2&prd_nbResultsPerPage=-1&prd_sorting=MY_SELECTION&prd_constraints=itemType%3APRODUCT_%2F_promo_current_week%3Atrue_%2F_weekend_highlight%3Afalse"}}
```

Verified: pages 1, 2, 3, 11 return **distinct** products (zero overlap), page 11 returns the final 6 → 10 × 24 + 6 = **246**, matching `stats.totalResults`. Loop `prd_page=1..11`.

Item shape: `blocks.searches[blockName="Weekly special"].slots[].item`, with `sku`, `price`, and `attributeInfo[]` entries keyed by `attributeName` — `_tracking_item_name`, `_tracking_item_category2`, `insteadPriceText`, `discount_text`, `imageUrl`.

Found in the client bundle:
```js
getParameters(){ ... n.refiningId = this.getRefiningId(); return n }
getRefiningId(){ /* collects route query params starting with prd_ */ }
```

### Product images — SOLVED for all seven stores

| Store | Image source |
|---|---|
| Denner | `imageUrl` attribute — `denner.imgix.net/...` |
| Lidl | `imageUrl` in flyer JSON |
| Volg | `<img>` in HTML — 16 of 23 products |
| Coop | **Crop from flyer** — proven working |
| Spar | Crop from flyer — text PDF |
| Aldi | Crop from flyer — text PDF, `-bbox` confirmed |
| Migros | Crop from flyer — page JPEGs, model locates regions visually |

**Proven end-to-end for Coop:**
```bash
curl .../pdf/complete.pdf -o coop.pdf
pdftotext -f 5 -l 5 -bbox coop.pdf -     # 128 words with xMin/yMin/xMax/yMax
pdftoppm -f 5 -l 5 -r 150 -jpeg coop.pdf p5
# cluster words per product → expand box upward for the photo → crop
```
Produced a clean tile: photo + `27%` badge + `1.95` + `statt 2.70` + *"Naturafarm Speck geräuchert"*. Page is 595×842 pt → 1241×1754 px at 150 dpi, scale 2.08.

**Approved storage model — option B.** Persist `{pageImageUrl, x, y, w, h}`; the browser crops via CSS `background-position`. Zero storage cost, and the photograph is never reproduced on basketch infrastructure — it is fetched by the visitor's browser from the retailer, exactly as if they opened the flyer.

> **Legal note, recorded honestly.** Art. 2 Abs. 3bis URG protects Swiss product photographs by default, so displaying them is the most exposed element of this design. The user has decided images are required. Option B is what makes that defensible: referencing and cropping is not reproduction. Do **not** switch to saving crops without revisiting this.

### Open Food Facts — REJECTED, measured

Tested against 14 real current Denner deal names: **2 hits, one of them wrong** — "Bohnen" (beans) matched *"Erdnussbutter, creamy"* (peanut butter). Swiss private label (Denner-brand, Naturaplan, IP-SUISSE) and fresh produce all missed. HTTP 503 rate-limiting after ~6 requests; unusable at 1500+ deals/week. **A wrong image is worse than none.**

---

---

## BUILT — steps 1–2 (2026-09-08)

`pipeline/collection/` · **88 tests passing** · clean `tsc --noEmit` under strict · layering verified mechanically.

```
collection/
  domain/          money · validity-period · discount · price-basis
                   product-image · offer (aggregate) · offer-source (port) · result
  application/     telemetry (port) · collect-offers (orchestrator)
  infrastructure/
    telemetry/     json-telemetry (NDJSON + GH Actions summary)
```

**Verified layering** (re-run these after any change):
```bash
grep -rE "from '\.\./(application|infrastructure)" collection/domain/     # must be empty
grep -rE "from '\.\./infrastructure" collection/application/              # must be empty
grep -rE "from '(node:|fs|path)'|process\." collection/{domain,application}/  # must be empty
```

### Design changes made during review (before any code)

| Finding | Change |
|---|---|
| 🔴 `CropRegion` in PDF points is meaningless once the page renders at a different DPI | **Stores fractions (0–1).** `cropRegionFromPoints()` is the single conversion point. A test asserts a full-page box maps to the unit square at any DPI. |
| 🔴 Real sources repeat rows — Denner's own API returned *Danone Activia* twice on page 2, *Purina ONE* twice on page 11 | **`offerKey()` + `dedupeOffers()`** added. Deliberately excludes image and sourceUrl; deliberately keeps a member price separate from the public one. |
| 🟡 Printed badges are rounded — Migros prints 33% for a real 33.33% | **Provenance (`printed` \| `derived`) + ±1.5pp tolerance.** Printed wins; a wildly wrong badge is rejected as a mis-paired parse. |

### Error handling — implemented in `collect-offers.ts`

1. **One source failing never stops the others.** Run status is `ok` / `degraded` / `failed`.
2. **An adapter that throws is contained.** Adapters are contractually forbidden from throwing; when one does anyway (a bug), it is caught and reported as `source-unavailable` with `adapter threw: …`. Non-`Error` throws handled too.
3. **A hanging source is cut off** by a per-source timeout (default 120s), with no dangling timer.
4. **Empty is not success** — `collectedWithYieldCheck` turns 0 offers into `source-changed`, and 3-when-200-expected into `below-expected-yield`. This is the exact failure mode that hid the categorisation regression for months.

### Observability — implemented

Deliberately **not** OpenTelemetry: no collector, no dependency, no cost. GitHub Actions captures stdout free for 90 days, which is the entire budget.

- **NDJSON to stdout**, every line tagged `runId` so a whole run reassembles with one grep
- **`formatRunSummary()`** → markdown table for `$GITHUB_STEP_SUMMARY`, so a failure is visible without opening the log
- **`toPipelineRunRecord()`** maps a trace onto the existing `pipeline_runs` columns (`store_results`, `total_stored`, `duration_ms`, `error_log`) — no new table, and it finally gives that table something worth reading
- **`combineTelemetry()`** fans out; a hosted backend can be added later as another `Telemetry` adapter with nothing else changing
- Clock and run-ID are injected, so traces are deterministic under test

Sample output:
```json
{"event":"collection.source.finished","runId":"run_...","retailer":"lidl","status":"failed",
 "offerCount":0,"durationMs":0,"failureReason":"source-unavailable",
 "detail":"adapter threw: Cannot read properties of undefined (reading \"price\")"}
```

---

---

## BUILD STATUS — 2026-09-09

Branch `feat/collection-module`. **167 tests, `tsc --noEmit` 0 errors, layering verified by grep.**

### Built and verified against live sources

| Store | Adapter | Live result | Notes |
|---|---|---|---|
| **Denner** | `infrastructure/denner/denner-api-source.ts` | **244 offers, 0.8s**, 2 warnings | 100% carry Denner's own category. 244→231 deduped. The 2 warnings are `auf alle …` promos with `price: 0`, correctly refused. |
| **Volg** | `infrastructure/volg/volg-html-source.ts` | **25 offers, 0.2s**, 0 warnings | All 25 have both prices + discount |
| **Coop** | `infrastructure/coop/coop-aktionis-source.ts` | **924 offers, 2.8s**, 0 warnings | 924→910 deduped. All have original price + image. |

**~1,193 offers collecting today.**

### Not built

- ❌ **Spar** — flyer PDF; needs `PdfWordExtractor` + `ProductTileLocator`
- ❌ **Aldi** — same PDF services; no categories anywhere, often no original price
- ❌ **Lidl** — flyer JSON + the Lidl Plus member-price correction pass
- ❌ **Migros** — Issuu JPEGs → OCR (proven free, not yet integrated)
- ❌ **Categorisation model** — the reason this project started
- ❌ **`run.ts` wiring** — nothing imports the collection module
- ❌ **`pipeline.yml`** — still runs the old Python scrapers
- ❌ **Frontend CropRegion rendering**

> ⚠️ **Nothing runs on a schedule yet.** The live site is still fed by the old pipeline with `sourceCategory = None` hardcoded, so the tomato-purée bug is still in production.

### Adapter-specific knowledge worth keeping

**Denner** — `refiningId` goes inside `parameters`, no leading `&`; top-level and `prd_*` placements silently return page 1. `pageId:12` current week, `13` next. Items at `blocks.searches[blockName="Weekly special"].slots[].item`, fields under `attributeInfo[]` keyed by `attributeName`. Badge `SPECIAL` carries no percentage → no discount (the ALDI rule catches it).

**Volg** — three sections with **different validity windows** (`Frische-Aktionen` Wed–Sat, others Mon–Sat). Dates carry **no year**; inferred from an injected reference with Dec→Jan rollover handling. The date sits **inside** the `c-section__subtitle` element, not after it. No per-product links; `sourceUrl` is the page.

**Coop/aktionis** — everything is on the listing card (`data-upox-id`, `price-new`, `price-old`, `price-discount`, `card-date`, image, href), so **no per-deal fetches** — ~20 requests instead of ~1000. The pagination widget shows only **6 links though ~20 pages exist**, so walk until a page yields no unseen id. Validity is **per-deal** (`27.08–09.09` alongside `07.09–09.09`, all ending together). `sourceCategory` deliberately null — aktionis' 39 labels are a third party's, not Coop's.

*Open question:* manual count found 1006 unique Coop deals; the adapter collected 924. Likely offers expiring on the last valid day — unconfirmed, re-check on a mid-week run.

### Vercel — resolved 2026-09-09

Preview deployments failed with `supabaseUrl is required` while prerendering `/de`. **Not caused by this module** — zero files under `web-next/` or `shared/` differ from main.

Real cause: env vars existed for Preview but were **pinned to the `redesign` git branch**, so other branches got none.

Two fixes:
1. **Code** (`8c13c10`) — `createAnonClient()` no longer throws on missing config; it names the missing variable and returns a client pointed at an RFC 2606 `.invalid` host so existing fail-soft paths handle it. Protects every future branch.
2. **Config** — the three variables added scoped to `feat/collection-module` (purely additive; Vercel rejects an all-branches Preview entry while branch-scoped ones exist).

Preview now Ready and serving real data.

*Still latent:* each new branch needs its own env scoping, or someone removes the `redesign` pin. The code fix means a missed one renders empty rather than failing the build.

### Next steps, in order

1. **Spar + Aldi together** — they share the PDF services; first real exercise of `CropRegion`
2. **Lidl** — including the member-price correction
3. **Migros** — wire in `rapidocr-onnxruntime` at 2× upscale
4. **Categorisation model** — scored against Denner's categories every run
5. **Wire it up** — `run.ts`, `pipeline.yml`, retire the Python scrapers. *This is the step that changes what visitors see.*

---

## Open — to decide with the agent team

1. **Language** — TypeScript throughout (matches the domain model and `shared/types.ts`) vs Python for collection (matches existing scrapers). Lean: TS for the domain, Python only where a scraper needs it.
2. **Does `UnifiedDeal` survive?** `Offer` is richer — `PriceBasis` and `CropRegion` have no home in the current type. Extend `UnifiedDeal`, or map `Offer` → `UnifiedDeal` at the module boundary so nothing downstream changes yet?
3. **Module layout** — modular approach approved; exact folder structure still to be set.
4. Lidl member-price correction pass — design not yet written.
5. Coop coverage: aktionis carried ~931 Coop deals vs a 28-page flyer. Gap unmeasured.
