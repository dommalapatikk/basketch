# Data source research — where basketch should get its deals

**Date:** 2026-09-07 · all HTTP status codes below are real responses received that day
**Status:** Research complete. No decisions made, no code changed. Brainstorming session.
**Sources:** 8 research agents, ~900k tokens, ~500 tool calls. Recovered verbatim from the session transcript.
**Why this exists:** The pipeline's product categorisation has failed repeatedly (~10–15 attempted fixes). Root cause found. This records the research into replacing the data source.

---

# PART 0 — The root cause

**`pipeline/aktionis/normalize.py` line 336:**

```python
"sourceCategory": None,
```

Hardcoded `None`, unconditionally, for every deal from all 8 stores.

`pipeline/categorize.ts` → `matchCategory` has three tiers: brand → **retailer's source category** → keyword fallback on the product name. Tier 2 never fires, so everything falls through to guessing from a name string. That is the whole explanation for tomato purée → "vegetables", hair dryer → beer, nectarine → meat, and for `MIN_TAXONOMY_CONFIDENCE` being lowered 0.4 → 0.3 when 42% of deals landed in the fallback tier.

**The taxonomy is fine.** `shared/types.ts` already has `pantry-canned` with `subCategories: ['canned', 'condiments']`. Tomato purée has a correct home. The matching is broken, not the categories.

**This capability was built, then discarded.** `pipeline/archive/migros/normalize.test.ts:73`:

```js
expect(d.sourceCategory).toBe('Milchgetränke')
```

The archived direct-Migros integration returned real retailer categories. Commit `9e9933a` — *"feat: multi-store expansion — 7 Swiss stores via aktionis.ch"* — traded one store with rich category data for eight with none. Categorisation has been broken since.

---

# PART 1 — Direct retailer access

## Denner — the best direct source in Switzerland

```
POST https://www.denner.ch/search-api/simplePageContent   → 200, application/json, 216 KB
Content-Type: application/json
{"moduleVersion":"D2.0","sessionId":"<any-uuid>","region":"de_CH",
 "advanced":{"device":"COMPUTER"},"parameters":{},"pageId":12}
```

- **No auth, no cookie.** An arbitrary UUID as `sessionId` works.
- `pageId:12` = current week · `pageId:13` = next week (200, 219 KB)
- **Real taxonomy** — `_tracking_item_category2`, verified values: `Fleisch/Wurst/Fisch` (15), `Früchte und Gemüse` (7), `Getränke/Säfte`, `Milch/Käse/Eier`, `Brot/Backwaren`, `Kaffee/Tee/Kakao`, `Waschen/Haushalt`, `Fertigprodukte`, `Sonstiges`. Plus a numeric `category` ID array resolvable via `/api/product-category/{id}` (untested).
- **Both prices** — `price` (float), `priceFormatted` (`"1.67"`, `"–.99"`), `insteadPriceText` (`"statt 2.25"`), `discount_text` (`"25%"`, `"½ PREIS"`), `unit_price`, `promotionFrom`/`promotionTo` (unix ts), `sku`, `navisionId`, `imageUrl`, `itemUrl`. 20 of 24 sampled had an old price (the 4 without were multibuy/assortment promos).
- **Coverage** — `stats.totalResults` = **246** current-week + 8 "Weekstart highlights"; next week **294** + 8. Far more than the Issuu flyer.
- `buying_channel` (observed `["all","stores"]`) and `has_online_specials` make channel machine-readable.

> ⚠️ **Unsolved:** the API returns 24 items/page (`resultsPerPage:24`, `totalPages:11`). Pagination strings exist in `pages[].refiningId` (`&prd_page=N&prd_nbResultsPerPage=…&prd_constraints=…`) but the correct request-body key to advance pages was **not found** — passing them as `parameters:{"2":…}` or top-level `refiningId` both returned page 1, and SSR `?prd_page=2` returned identical products. **How to page past 24 is unknown.**

Also: `POST /search-api/pageContent` → 200 but `nbItems:0`. `GET /api/product/prediggo-list` → 200 but metadata only, no products. Use `simplePageContent`.

Route map from `/_nuxt/CQKtmSlb.js`: bases `/api/` and `/search-api/`; also `/api/store/list?locale={locale}`.

**robots.txt permissive** — `Allow: /`, blocks only checkout, shopping-list, preview, OIDC auth.

## Migros — technically the richest, legally the worst

`migros-api-wrapper` **v1.1.37, published 2026-03-02**, alive and verified live end-to-end:

- `GET /authentication/public/v1/api/guest` → guest token, 200
- `POST /product-display/public/web/v2/products/promotion/search` → 200, week 2026-09-03 → 09-09
- `POST /product-display/public/v4/product-cards` → **4-level breadcrumb** per item:
  `Milchprodukte, Eier & frische Fertiggerichte → Milch, Butter & Eier → Milch & Milchgetränke → Milchgetränke`
- Category is a **queryable facet** — 16 top-level categories, `filters: {"category": ["7494731"]}`

> ⚠️ **Trap:** the unfiltered promo search reports only `numberOfItems: 111`. Iterating the 16 category IDs yields **1168** — facet counts matched actuals on all 16. **The unfiltered call silently under-returns by 90%.** Against 115 Migros deals on aktionis, direct is a **10× volume increase.**

**But the wrapper's "bypass" is a TLS trick** — `minVersion: TLSv1.3`. Plain curl gets a 403 "maintenance" wall; TLS-1.3-pinned requests get 200. **That is circumvention of a technical protection measure** — see Part 4.

## Coop — hard blocked

- `curl -sI https://www.coop.ch/` → **403**, `Server: DataDome`, `X-DataDome: protected`
- `https://www.coop.ch/robots.txt` → **403**, body is a DataDome CAPTCHA interstitial (`geo.captcha-delivery.com`)
- WebFetch on a different IP → also 403

Blocking occurs **before** robots.txt is served, so it triggers on connection/TLS/JA3 fingerprint, not path. robots.txt contents are **unknown** — could not be retrieved at all.

Because the wall intercepts before any markup, whether coop.ch runs Hybris `occ/v2`, JSON-LD, or `__NEXT_DATA__` is **unknown**.

`github.com/WanderingMike/coop-scraper` — last commit **2022-08-12**, HTML-based, almost certainly dead. Paid resellers exist (Apify `studio-amba/coop-ch-scraper`, Pepesto) — Pepesto's documented schema has **no category field at all**, and both conflict with zero-paid-services.

**Verdict: Hard, bordering not-feasible for a free approach.**

## Aldi Suisse — hard blocked, and the only store with no fallback

Server: **`AkamaiGHost`**. Every direct curl → **403 Access Denied** with an Akamai reference ID, including:
`robots.txt`, `/` , `/de/aktionen/`, `/sitemap.xml`, `/de/aktionen-und-angebote`

Realistic Chrome UA, `Accept-Language: de-CH`, full `sec-fetch-*` headers, `-L` — none helped. Edge filtering on TLS/JA3 or IP/ASN reputation.

**Oddity worth knowing:** WebFetch (different infrastructure) *did* get through, and Aldi's robots.txt **explicitly allows** `Claude-Web`, `ClaudeBot`, `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `Google-Extended`, `Cohere-Ai`, `PerplexityBot` — Akamai allow-lists named AI crawlers while blocking generic scripted traffic.

UI shows categories (Fleisch, Fisch, Getränke, Tiefgekühlte Produkte, Süssigkeiten + thematic filters), so a taxonomy exists — but the JSON field name is **unverified**. Nuxt.js, no `__NUXT__` blob surfaced, no Product JSON-LD detected.

No CH-specific repos. `stiles/aldi` (2025-12-15) is German-market; `AviBackToBlack/lidaldi` (2026-08-25) is Ireland-only.

## Lidl — easiest direct target, one unsolved piece

- `GET https://www.lidl.ch/p/api/gridboxes/CH/de` → **200**, JSON array, each object has a **`"category"`** string
- Server: **`myracloud`** — no bot-blocking encountered anywhere; plain curl got 200 on homepage, weekly-offer page, robots.txt and the API
- robots.txt blocks `/q/search`, `/cc.js*`, `/1*`–`/9*`, `/cdn/assets/cwv/`; **does not** block `/c/`, `/p/`, `/p/api/`
- Product URLs: `/p/de-CH/<slug>/p<itemId>`; sitemap index includes `product_sitemap.xml.gz`
- `EvickaStudio/lidl-discounts` — pushed **2026-05-08**, working, store-offer routes need no login

> ⚠️ **Unsolved:** `gridboxes` returned a fixed 25-item sample, all `category:"Non Food"`. Passing product IDs via `ids=` did not filter. **The mechanism for pulling the current week's actual offer set is unsolved** — needs the right query param or a store-context cookie. Weekly path is `/c/de-CH/wochenaktion/a<id>` with a campaign ID that changes; `/c/de-CH/aktionen/` → 404.

## Spar — no usable JSON

- `https://www.spar.ch/aktionen` → **404**. Correct: `https://www.spar.ch/aktuelles/angebote` → 200
- That page is only an iframe; **zero offer markup** (1 occurrence of "statt" in 1.7 MB)
- `Search.asmx/Search?query=Fleisch` → 200 JSON but **page numbers only**: `{"PageResults":{"Data":[{"Page":3,…}]},"ResultCount":2}` — no names, no prices, no categories
- `Index.asmx/GetIndexJson` → 200 `{"Status":"ERROR","Data":"No longer supported"}`
- iPaper Enrichments JSON → **403** via curl with full browser headers *and* WebFetch. **Contents unknown.**
- TYPO3, only `WebPage` JSON-LD, no Product schema

## Volg — no JSON needed

`https://www.volg.ch/aktionen` → **404**. Correct: `https://www.volg.ch/sortiment/wochenaktionen/` → 200.

No API, but the HTML is already structured:

```html
<div class="c-product"><h3 class="c-product__title ">Findus Plätzli</h3>
  <div class="c-product__reduction">-25%</div>
  <div class="c-product__description">div. Sorten, z.B. Chäs, 8er-Pack<small>(100 g = 1.44)</small></div>
  <div class="c-product__price"><span class="c-product__price-main">6.90</span>
    <span class="u-text-nowrap"> statt 9.20</span></div>
```

All 25 products have promo price + old price + discount % + unit price. robots.txt blocks `/typo3/` only — but `GPTBot: Disallow: /`.

> **Correction logged:** `volgshop.ch`'s WooCommerce API (`/wp-json/wc/store/v1/products`) returns a lovely 3-level `categories` array — but `?on_sale=true` returns **`x-wp-total: 0`**. Volgshop is a *catalog*, not a promo feed. Still useful as a **category lookup table** to enrich items by product name.

## Direct-access summary

| Retailer | Official API | Own category? | Bot protection | Difficulty |
|---|---|---|---|---|
| **Migros** | No | **Yes** — 4-level breadcrumb + queryable facet | TLS-fingerprint wall, defeated by TLS 1.3 pinning | Easy *(but see legal)* |
| **Coop / Megastore** | No | Not via any found source | **DataDome** — 403 on everything incl. robots.txt | **Hard** |
| **Lidl CH** | No | **Yes**, `category` field | Myracloud, no blocking | Medium |
| **Aldi Suisse** | No | Unknown (UI only) | **Akamai** — 403 on everything | **Hard** |
| **Denner** | No | **Yes**, named | nginx, none | **Easy** |
| **Spar CH** | No | No | Apache, none | Hard |
| **Volg** | No | No | none | Easy (HTML) |

---

# PART 2 — Digital flyers

| Retailer | Format | JSON behind viewer | Category | Prices | PDF text or image |
|---|---|---|---|---|---|
| **Lidl** | In-house SPA + real PDF | **Yes** — `GET endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw36` → 200, 299 KB | Weak — `categoryPrimary` Food/Non-Food only (117/105) | JSON: promo only. PDF: both (74 `-NN%`) | **TEXT**, 41 pp — but glyph-spaced (`Zitr o n e n`) and `pdftotext -bbox` **crashes** (poppler `std::out_of_range`) |
| **Aldi** | **Publitas** + real PDF | Partial — `data.json` 200, `spreads.json` 200 with per-page raw text. `hotspots_data.json` **404**, `shoppingList: null` | **No** — headers are campaign bands ("AKTIONEN AB DONNERSTAG") | Current yes; **old price mostly absent** — 14 `PREISSENKUNG` + 2 `statt` in 44 pp (63 `-NN%`) | **TEXT**, 44 pp, `-bbox` works |
| **Coop** | COMINTO on `epaper.coop.ch` + real PDF | No product JSON — `menu/toc.xml` empty, `maps/bk_N.xml` empty, zero hotspots. But per-page `text/bk_N.txt` → 200 each | **No** headings — p5 is entirely meat, unlabelled | **Best of all** — 195 `statt <old price>` across 28 pp | **TEXT**, 28 pp, `-bbox` gives clean word coords → tile clustering realistic |
| **Migros** | **Issuu only** | **No** — `pageTexts: []`, `reader3.isu.pub` 403, `api.issuu.com` 404, no PDF | **Only retailer printing real category tabs** ("Brot & Backwaren" p9) — locked in JPEGs | Yes, both (`9.90 statt 14.85`, `33%`) | **Neither** — page JPEGs (1091×1489). **OCR mandatory** |
| **Denner** | Issuu, image-only, no PDF | Yes — but on the *site*, not the flyer | **Yes** (site API) | Both | n/a |
| **Spar** | **iPaper** + real PDF, `GetPDF.ashx` → 302 → 200, **28 MB** | No | **No** — titles are slogans ("Vielfalt zu attraktiven Preisen") | Both — 96 `statt`, 85 `SPAREN` | **TEXT**, 17 pp, iTextSharp |
| **Volg** | **Real PDF** + full HTML | No, HTML suffices | Only 3 promo-type sections | Both, all 25 | **TEXT**, 1 p, InDesign |

## Deterministic weekly URL patterns (all verified 200)

```
Lidl    endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw{NN}
        KW36 ✓ KW37 ✓ KW38 404  (~1 week lookahead)
        PDF: assets.leaflets.schwarz/leaflets/pdfs/{uuid}/…pdf

Aldi    catalog.aldi-suisse.ch/aldiwoche_kw{NN}-{YYYY}_{de|fr|it}/{data.json|spreads.json}
        KW36/37/38 all live  (2 weeks lookahead)

Coop    epaper.coop.ch/catalogs/AM_AKMA_W{NN}_{YYYY}_{LANG}_{REGION}--SHORTTERM/
              {xml/catalog.xml | text/bk_N.txt | pdf/complete.pdf | large/bk_N.jpg}
        Editions: DE_ZZ, DE_NW, DE_OS, DE_BE, FR_SR, IT_TI
        W33–W36 all still 200 (back-catalogue survives); W37 404 until Wed/Thu

Migros  issuu.com/m-magazin/docs/migros-wochenflyer-{KW}-{YYYY}-{d|f|i}-{aa|bl|lu|ne|os|vs|zh|ge|vd|ti}

Spar    angebote.spar.ch/flugblatt/{YYYY}/spar-angebote-kw{NN}-{YYYY}/GetPDF.ashx
        → 302 → cdn.ipaper.io/…/Download.pdf  (must follow redirect; curl -L)

Volg    volg.ch/fileadmin/user_upload/dorfplatz/wochenaktionen/de/{YYYY}/Volg_Wochenaktionen_KW{NN}.pdf
        KW37 ✓ 1.19 MB · KW36 ✓ · KW38 404 (not yet published) · FR path unknown
```

## The flyer route is the legal unlock for Coop and Aldi

Both block their main sites hard. But `epaper.coop.ch` and `catalog.aldi-suisse.ch` **serve openly** with deterministic weekly URLs. Walking through an open door is not circumvention — which matters directly for the 2023 Federal Supreme Court condition in Part 4.

## Two data-quality landmines

**1. Lidl's JSON reports the loyalty price without flagging it.**

| | |
|---|---|
| `Trauben rot kernlos` JSON | `price: 1.39` |
| PDF base promo | **1.49**, with 1.39 only *"Mit Lidl Plus"* |
| "Lidl Plus" in the PDF | **47×** |
| "Lidl Plus" in the JSON | **0×** |

Ingesting blindly makes Lidl look ~7% cheaper than a non-member pays. This is the Art. 3(1)(e) UWG exposure in Part 4, arriving through a data bug.

**2. Coverage gaps.** Coop's flyer is clean (0 "Supercard" in 28 pp) but Coop runs separate Digitale Bons / Sammelpässe / Aktionsalarm / online-only freebies that never enter the magazine. Spar states verbatim: *"exklusive Rabattcodes, die du nur in der App findest"*. Denner's API has 246 vs a far smaller flyer. **Volg is the only one where flyer == full offer set** (identical 25 offers in PDF and HTML).

---

# PART 3 — Aggregators

## aktionis.ch — the only Swiss aggregator with the full triple

Per-product offers **+ real food taxonomy + crossed-out old price + discount %**.

**The category pages exist — but not at the guessed path.** `/vendors/<store>/q/<Category>` → **404**; vendor+category cannot be combined. But `/q/<Category>` alone → **200**, cross-vendor, carrying the vendor logo (`div.card-merchant > img[alt]`) **and the same `data-upox-id` join key the pipeline already parses.** Card markup is identical to what `parse_deal_card` already handles. Pagination works (`/q/<Cat>/2`, verified distinct IDs).

A full crawl of all 39 categories (139 fetches, ~2 min) joined against full vendor crawls:

| Vendor slug | Deals | With category | Coverage |
|---|---|---|---|
| migros | 115 | 115 | **100%** |
| coop | 931 | 823 | 88.4% |
| coop-megastore | 80 | 80 | **100%** |
| denner | 264 | 264 | **100%** |
| lidl | 174 | 146 | 83.9% |
| spar | 22 | 22 | **100%** |
| volg | 11 | 11 | **100%** |
| **aldi-suisse** | **0** | 0 | **not carried at all** |
| **Total** | **1597** | **1461** | **91.5%** |

Vendor list is 8 slugs: `coop, coop-megastore, denner, lidl, migros, otto-s, spar, volg`.

> ⚠️ **Two real caveats.** (a) It is *aktionis'* 39-label taxonomy, not the retailer's own. (b) **1633 of 2147 deals sit in multiple categories** — `Bio`, `Vegetarisch-Vegan`, `Nahrungsmittel` are cross-cutting — **so a priority rule is needed to pick one primary label.**

Other verified detail: no JSON API (all `/api`, `.json`, `/feed`, `/rss` probes 404; `?format=json` ignored; `/vendors/coop/export.pdf|.csv` return 200 but `text/html`). Every deal page carries schema.org JSON-LD — `{"@type":"Product","name":"Coca-Cola Zero","offers":{"price":"12.95","priceCurrency":"CHF","priceValidUntil":"2026-09-09T21:59:59Z"}}` — but **old price is not in the JSON-LD**; it needs DOM parsing of `.price-old`. Markup: `<span class="price-new">4.45</span><span class="price-old">9.95</span><span class="price-discount">55%</span>`. robots.txt disallows `/admin/, /lost, /login, /profile/, *.pkpass, *.pdf, /dealtarget/` — `/deals`, `/q/*`, `/vendors/*` are **not** disallowed.

## kimbino.ch — best structured flyer source

Kimbino Green s.r.o. on the Hyperia platform, Nuxt 3 SSR. Migros (shop_id 1), Coop (2), Aldi (4), Denner (5), SPAR (6), Lidl (7) + Otto's, Prodega, TopCC, Aligro, Radikal, Coop City. **Volg absent.**

No public REST API (`/_payload.json` 404, `/api/v1/brochures` 301). **But every SSR page embeds a full `__NUXT_DATA__` devalue JSON blob** (~160 KB on the homepage) — this is the practical structured source and it is complete.

Product-level offers **partial**: `/produkte/pizza/` gives 5 real offers with prices (Denner 6.35, Lidl 1.29, Aldi 4.69, Coop 2.80, Migros 4.10). But `/produkte/milch/` returns 8 leaflets with `price: null` and the *brochure* name — an OCR page hit, not an offer. **No product categories** (`category_id` is the retailer sector). **No old price.** Images only (thumbor WebP, signature required), no PDFs.

## oferlo.ch — same corpus, no prices

Same Hyperia platform, **identical brochure IDs** to Kimbino (Coop 35228, Denner 35225, Aldi 35237, Migros 35204). Volg absent.

Live JSON endpoints, all 200: `/api/get-menu-items/`, `/ajax/get-top-shops/`, `/site/ac-json/?q=milch` (38 KB). But **no products and no prices** — every result card renders a static `<span>Preis im Prospekt</span>`; **zero `CHF` strings in 32 result cards**. Retailer sectors only. Images only.

## Dead in Switzerland

| Domain | DNS | What's there |
|---|---|---|
| `aktionsprospekte.ch` | **NXDOMAIN** | Does not exist |
| `prospektangebote.ch` | A 37.97.254.27 | **Parked** — "TransIP - Reserved domain" |
| `marktguru.ch` | A 217.26.48.101 | **Parked** — "purchased at Hostpoint" |
| `kaufda.ch` | NOERROR, **no A record** | Domain held, no site |
| `bonial.ch` | NOERROR, **no A record** | Domain held, no site |
| `api.bonial.com` / `api.marktguru.io` | **NXDOMAIN** | Dead |

`bonial.com` contains **zero** occurrences of "Schweiz"/"Switzerland"/`.ch`. Marktguru's German API is real (`api.marktguru.de/api/v1/offers`, has `oldPrice` + `categories`, keys published in its own `__NEXT_DATA__`) — **but there is no CH instance.**

---

# PART 4 — Legal

*Not legal advice.* **[SETTLED]** = primary source verified · **[INFERENCE]** = reasoning.

## Verdict

**Swiss law is unusually permissive — two Federal Supreme Court rulings went to the scrapers, including one from 2023.** No database right, no copyright in price facts, no FADP engagement, no criminal exposure on public pages, and **zero recorded enforcement against any Swiss promotion aggregator in twenty years.**

**But the risk is not where intuition puts it.**

## The three findings that changed the analysis

**1. "Non-commercial" is not a shield. [SETTLED]** The UWG requires **no** Wettbewerbsverhältnis. **BGE 120 II 76** ("Mikrowelle") — non-competitors who unfairly influence competition can be sued. **BGE 126 III 198 E. 2c/aa** — the test is purely objective: conduct suitable to affect the market's functioning. Art. 2 UWG's second limb covers *"das Verhältnis … zwischen Anbietern und Abnehmern"* and never mentions competitors.

*Counterweight* **[SETTLED]**: **BGE 133 III 431** — where conduct fails a specific tort's elements, Art. 2's general clause may **not** be used as a catch-all; *besondere Umstände* are required.

**2. The real exposure is publication, not acquisition — Art. 3(1)(e) UWG.** Price comparisons must rest on **objectively correct and verifiable facts**, for both the own price and the comparison price. The Fribourg defendant lost partly on a "Number 1 in Switzerland" claim built from **expired** listings.

**3. Migros says no four independent ways.**

## Copyright (URG)

**Art. 2 URG** requires *geistige Schöpfungen … die individuellen Charakter haben*. A product name, price, discount % or validity date meets neither limb. **[SETTLED]** The IGE-commissioned study *Zuordnung von Sachdaten* (18 Aug 2020) is explicit that raw factual data are unprotectable.

**Art. 4 URG** protects **only** *"Auswahl oder Anordnung"*, never the content. A comprehensive weekly promotion list has functionally-dictated selection. **[MAJORITY DOCTRINE]**

> ⚠️ **Art. 2 Abs. 3bis URG** (2020 revision) protects *"Fotografische Wiedergaben … dreidimensionaler Objekte … auch wenn sie keinen individuellen Charakter haben"* — **Swiss product photos are protected per se.** Avoiding images is a settled legal requirement, not merely prudent. **[SETTLED]**

**No sui generis database right — triple-confirmed. [SETTLED]** Unlike EU Directive 96/9 Art. 7, Swiss law offers no investment protection for non-creative databases. *sic!*: *"die Schweiz [hat] **bewusst** auf die Umsetzung der sui generis Datenbank-RL … verzichtet"* — a deliberate legislative choice, unique in European comparison. The 2020 URG revision introduced none.

## UWG Art. 5 lit. c — four cumulative elements, construed narrowly

1. a **marktreifes Arbeitsergebnis**
2. taken over **"als solches"**
3. by a **technisches Reproduktionsverfahren**
4. **ohne angemessenen eigenen Aufwand**

**[INFERENCE, well-supported]** Elements (1) and (2) are the weak links for basketch. A single price datum is not a market-ready product, and re-keying facts into per-item cheapest-store routing is not takeover "as such."

## Case law — three decisions, that's all there is

**① BGE 131 III 384 (4 Feb 2005) — scraper WON. [SETTLED]**

> *"Die systematische Suche der Beklagten nach veröffentlichten … Immobilien-Inseraten, deren Übernahme in die eigene Website sowie deren Anzeige … **ist als solche nicht unlauter**."*
> *"Mit Art. 5 UWG sollen keine neuen Ausschliesslichkeitsrechte geschaffen werden…"*

All claims rejected. The defendant's own **programming, adapting, monitoring and processing** defeated the *ohne angemessenen eigenen Aufwand* element. Protection also **expires once creation costs are amortised**. The Court warned that restricting such reuse would harm competition on *"completeness, reliability and accessibility"* and ultimately harm end users.

**② KGer Freiburg 102 2015 189 (22 Aug 2016) — scraper LOST.** All four elements found satisfied; expressly distinguished BGE 131 III 384 on technological grounds (*"die Technologie des Spiderings [habe sich] enorm weiterentwickelt"*). **Weak authority:** cantonal, first instance, and the defendant **defaulted entirely** (*"gänzlich untätig geblieben"*) — nothing was contested. Appeal history unconfirmed.

**③ Ryanair v. Bravo Next / lastminute.com — Federal Supreme Court, two parallel rulings reported 2 May 2023. Scrapers WON; Ryanair ordered to pay CHF 140,000.**

> **The rulings are conditional: scraping is lawful provided (a) no technical protection measures are circumvented and (b) the source site is not slowed down.**

**This is the operative rule, and it maps exactly onto Coop's DataDome and the Migros wrapper's TLS pinning.** *(Docket numbers not located — sourced from practitioner reporting, not the judgment text.)*

## FADP / nDSG — does not apply [SETTLED]

Art. 5 lit. a DSG: *"alle Angaben, die sich auf eine bestimmte oder bestimmbare **natürliche Person** beziehen."* Product/price data is out of scope. The total revision also **removed legal persons** — so Migros and Coop cannot invoke the DSG against a scraper **at all**.

**Live edge case:** incidentally scraped **reviews, usernames, named contacts** *are* personal data. EDÖB, verbatim: *"Der Schutz von Personendaten endet nicht an der Schwelle zur Öffentlichkeit"* (24 Aug 2023; closing statement 31 Oct 2024). **Filter at parse time, not at the display layer.**

## Criminal law — not engaged [SETTLED]

Art. 143 and 143bis StGB both require data/systems **"gegen seinen Zugriff besonders gesichert"**. A page served to any anonymous GET is not. A robots.txt or ToS is a *declaration*, not a *Sicherung*. Art. 143 additionally requires **Bereicherungsabsicht**, and requires the data be *"nicht für ihn bestimmt"* — data deliberately published to the public *is* intended for the reader.

**No "virtuelles Hausrecht" exists in Swiss law [SETTLED, negative finding]** — a German construct (§§ 858 ff./1004, § 903 BGB) with no Swiss statutory basis and no Swiss decision importing it.

> ⚠️ **The line [INFERENCE]:** credentials, CAPTCHA, rate limiter, IP block, token-gated internal API — each is plausibly a *besondere Sicherung*. **Coop's DataDome is exactly that.**

## Terms of use — per retailer

### Migros — the decisive find [VERIFIED verbatim, `migros.ch/de/content/rechtliche-hinweise`, updated Feb 2023]

> "Das (vollständige oder teilweise) Reproduzieren, Übermitteln, Modifizieren, Verknüpfen oder Benutzen der Webseiten **mittels elektronischen oder anderen Hilfsmitteln (wie Webcrawler-/Spider-Programme, Metasuchmaschinen, Framing)** für **öffentliche, geschäftliche und/oder kommerzielle Zwecke** ist ohne vorherige schriftliche Zustimmung des Betreibers untersagt."

**The only terms page among all eight that names crawlers, spiders and metasearch engines explicitly.** Note *"öffentliche"* — publishing at a public URL is caught **regardless of non-commercial status**.

Scope clause: *"Diese rechtlichen Hinweise gelten für diese Webseite sowie alle darauf bezugnehmenden Webseiten der Migros-Gruppe."*

**robots.txt disallows exactly the promotion paths:**
```
User-agent: *
Disallow: */offers/instore/
Disallow: */offers/coupons/
Disallow: */promotion/
```
Weekly in-store promotion detail pages sit at exactly `migros.ch/de/offers/instore/<id>` (verified `/2380967`, `/2450021`). Corroboration the disallow is honoured: search engines return those URLs as **bare URLs with no title or snippet**. The **listing** page `/de/offers/home` is *not* disallowed.

**And Migros refused programmatic access on the record** (Migipedia forum, staffer "Philipp"): *"Unfortunately, we are currently unable to grant access to our product data API. However, I have been able to find out that **this may change in the future**."*

**So: robots.txt + an explicit crawler prohibition + "öffentliche Zwecke" + a direct API refusal. No other retailer comes close.**

### The rest

| Site | Anti-automation clause | Anti-commercial-reuse | Acceptance |
|---|---|---|---|
| **Coop** | **None found** in anything readable; shop T&C **unread** | Unverified | Browsewrap |
| Coop City | No | IP-ownership only | Browsewrap |
| Interdiscount | **No clause found** (contrary to expectation) | No | Browsewrap |
| **Migros** | **YES — names Webcrawler/Spider/Metasuchmaschinen/Framing** | Yes | Browsewrap |
| **Denner** | Indirect; crawler words absent from Denner's own text, **but its Impressum links to the Migros page — pulling the clause in by incorporation** | Yes, express | Browsewrap |
| Lidl CH | **No general ToS exists.** Friendly Captcha + reCaptcha declared in privacy policy | Lidl Plus: private use only | Browsewrap |
| **Aldi Suisse** | Partial — ban on *"Software oder sonstige Scripts"* | **Yes, strongest** — *"nur zu privaten Zwecken … Datennutzungen, die bezwecken, Inhalte gewerblich … zu verwenden, sind Nutzern verboten"* | Clickwrap, **but § 1.1 scopes it to *user-account* use — arguably never attaches to anonymous fetching** |
| SPAR | No | *"Jede weitere Nutzung bedarf der vorherigen schriftlichen Zustimmung"* | Browsewrap + **deemed acceptance on access** |
| **Volg** | **No terms document exists at all** | None | **None** |
| **Aktionis** | **No clause found** (verified term-by-term) | Reproduction requires prior written consent | Browsewrap + deemed acceptance |

**Legal weight of all of these, honestly:** browsewrap. Swiss doctrine holds AGB bind only if **validly incorporated**; a footer link with no acceptance step generally forms no contract, and a bot that never registers is not in a contractual relationship. **[INFERENCE for CH — no Swiss decision found on browsewrap enforceability against a scraper.]** Migros' clause is unambiguous *notice of non-consent* rather than a contract — but that notice erodes the good-faith posture the case law turns on.

> ⚠️ **Open gap: `coop.ch/de/termsAndConditions` remains unread** after ~6 proxy routes (jina, translate.goog, allorigins, codetabs, microlink, archive.org — all failed or hit CAPTCHA). It is the one Coop page that plausibly carries an IP/reuse clause. **Do not treat "Coop has no clause" as established.** 30 seconds in a normal browser settles it.

## How the Swiss market actually works [VERIFIED]

- **toppreise.ch: merchant feeds, not crawling.** Its own notice: data *"is provided by the operators of the online shops connected to Toppreise.ch."* Dealer sign-up funnel, XML/CSV feeds, CPC / 2–12% revenue share.
- **comparis.ch premiums are federal open data** — BAG publishes all KVG premiums on opendata.swiss. Its FINMA litigation (lost 5 July 2024, Federal Administrative Court) is about **intermediary registration, not data**. **No provider has ever sued comparis over displaying their data.** comparis is itself a DataDome customer — a scraping *target*.
- **comparis's one crawling incident** (priminfo.ch, 2011) drew a criminal complaint — **for an attempted SQL injection by an employee acting *"eigenmächtig"***, not for the crawling, which was described as ordinary practice. **Exposure attached to circumvention, not crawling.**
- **Migros licenses; Coop does not.** Migros pays into **Profital/Bring!** (Swiss Post-owned — Profital founded by Post's Direct Mail Company Nov 2017 on Offerista tech, sold to Bring! Labs 2022, Post-majority since Sept 2021) *while* robots.txt-excluding `*/offers/`, `*/promotion/` from its own site. A deliberate paid-channel strategy. **Coop licenses nothing and blocks hard** — absent from Profital, no API, DataDome at the edge.
- No Migros/Coop price or promotion data on **opendata.swiss**. The Migros/Opendata.ch tie-up is a *funding* programme, not a data publication.

## The two live analogues that settle the practical question

**aktionis.ch has run since 2006 explicitly *without* retailer cooperation.** Founders (pressetext, 28 Sept 2006) cited *"mangelnder Kooperationsbereitschaft etlicher Anbieter — zu denen auch die Migros zählt"* and said they'd build it *"auch ohne Kooperation der Detailhändler."* Netzwoche (31 Jan 2014): retailers' stance remained *"eher ablehnend, auch die der Migros"* — while aktionis published *regional* Migros promotions that weren't even on Migros's own site. **Twenty years, no legal action.**

**rappn.ch — a direct, currently-operating equivalent of basketch.** Rappn GmbH, Zug, founded 2026. Migros, Coop, Aldi, Lidl, Denner, OTTO'S, Aligro across all 26 cantons, *"over 10,000 deals refreshed every week."* Its own statement: data from *"public sources: flyers, websites and promotional materials"* and **"Rappn has no commercial agreements with any retailer."** Operating openly, no reported trouble.

## Enforcement record

**None. [VERIFIED, negative finding]** Searches of German-language legal and news sources plus the Zurich Commercial Court decision archive found **no Abmahnung, cease-and-desist, injunction or lawsuit** by Migros, Coop, Denner, Lidl or Aldi against any scraper or aggregator, and **no Swiss price-tracking project shut down** under retailer pressure.

Swiss C&D economics differ from Germany: **the cost of the warning letter generally cannot be recovered from the recipient**, so there is no letter-writing industry and no incentive to target a hobbyist.

The only Migros action in this space runs the *other* way: Migros filed a **Lauterkeitskommission complaint against Aldi** over Aldi's comparative price advertising.

**Worst case by likelihood:** IP block (near-certain for Coop) → takedown email (most likely Migros) → cease-and-desist (unlikely) → litigation (very unlikely).

## aktionis vs direct — the agent's call: go direct

aktionis has the **weakest terms of the eight**. But two things make it the worse target: its **compiled dataset *is* its *marktreifes Arbeitsergebnis***, which is the one fact pattern where Art. 5 lit. c actually bites; and it **never states where its data comes from or names a single retailer partner** while republishing Migros and Coop promotions. **Scraping it inherits its upstream exposure — most pointedly against Migros' express metasearch/crawler prohibition — and adds a second party. It launders nothing.**

## Mitigations that materially change the analysis

**Tier 1 — these are the ruling:**

1. **Never circumvent a technical protection measure.** The explicit condition in the 2023 rulings, the line for Art. 143bis, and the sole source of comparis's criminal exposure. **Do not spoof to defeat Coop's DataDome. Do not TLS-pin to defeat Migros' wall.** If an honest bot is blocked, that is a refusal — **accept it.**
2. **Don't fetch `migros.ch/de/offers/instore/` or `*/promotion/`.** Use `/de/offers/home` if sufficient, drop Migros, or **ask** — they said access *"may change in the future."*
3. **Don't slow the source.** One fetch per store per week is far inside it — document that.
4. **Invest visible own effort.** Normalisation, matching, unit-price computation, per-item routing. This is the *literal* statutory test and the exact ground the 2005 defendant won on.

**Tier 2:**

5. **Art. 3(1)(e) UWG is the real exposure.** Show the scrape timestamp and validity window on every item, **expire aggressively**, disclose retailer coverage, never imply exhaustiveness.
6. **No images** — Art. 2 Abs. 3bis URG.
7. **Filter personal data at the parser** — reviews, usernames, named staff.
8. Honest UA with project URL and contact email; weekly cadence; caching; conditional requests; attribution and deep links back.
9. Prominent takedown contact with a stated few-days SLA.

---

# PART 4b — Regional pricing: TESTED, does not exist

**Added 2026-09-08. This was a live question — the user challenged an earlier inference of mine and was right.**

Migros and Coop both publish multiple flyer editions with region codes in the URL. I initially inferred that meant regional *pricing*. **It does not.** Three independent checks:

### Check 1 — Coop epaper, week 36, Zurich (`DE_ZZ`) vs Bern (`DE_BE`), all 20 pages

| | |
|---|---|
| Pages byte-identical | **18 of 20** |
| Page 1 difference | The region stamp only — `ZZ` vs `d BE` |
| Page 5 difference | **One product slot**: ZZ shows *Naturafarm Natura-Veal Kalbsplätzli* 8.– (statt 10.–), BE shows *Naturafarm Natura-Beef Rindshuft* 8.10 (statt 10.15) |
| Same product at a different price | **Zero cases** |

Ostschweiz (`DE_OS`) spot-checked against Zurich on pp. 10 and 14 — identical.

### Check 2 — aktionis, driven through its own regional filter

Mechanism found in `main_bottom.js`: `POST /setlocation.json` with a `location` object (`latitude`, `longitude`, `city`, `address_formatted`), stored as a cookie. Verified working — returns `{"success":true,"city":"Zürich"}`.

Location set to **Zürich (47.3769, 8.5417)**, **St. Gallen (47.4245, 9.3767)** and **Lugano (46.0037, 8.9511)**, then `/vendors/migros` fetched with each cookie:

| | ZH | SG | TI |
|---|---|---|---|
| Migros deals returned | 19 | 19 | 19 |
| Deals present in all three | **19** | | |
| Same deal at a different price | **0** | | |
| Deals unique to one region | **0** | **0** | **0** |

Page sizes did differ (164025 / 162730 / 161858 bytes). Diffing visible text, the **entire** difference is the city label (`Mein Standort (Zürich)` vs `(Gallen)`) and rotating `cpAdSlot_*` ad IDs.

**aktionis' regional filter changes branch listings and ads — not deals, not prices.**

> **Limit of this test:** it proves *aktionis* does not vary Migros prices by region. It cannot fully distinguish "no regional pricing exists" from "aktionis does not model Migros' cooperatives." Check 1 (Coop's own publication) is the evidence that carries the weight.

### Check 3 — rappn.ch FAQ (live competitor, 7 retailers, 26 cantons)

> *"**Offers vary by canton**, some promotions are in-store-only or loyalty-card-only"*
> *"Offers are filtered by your postcode, so you always see the deals that apply in your canton"*
> *"Prices vary **weekly by product and promotion**"*

Offers vary by canton. Prices vary by week and product. **No claim anywhere that the same product costs different amounts in different cantons.**

> ⚠️ **This check was attempted and abandoned — deliberately.** Rendered `/en/offers` in headless Chrome (offers and prices do render). But `?canton=ZH` vs `?canton=TI` produced **0 differing visible-text lines** — the parameter is not honoured. rappn's canton is in-app client state requiring UI interaction (Playwright-class automation), not a URL parameter. Offers are fetched at runtime from `api.rappn.ch` and carry no canton field in the DOM.
>
> **Dropped on purpose:** rappn is a competitor's app. Its canton filter evidences *their product decisions*, not Swiss retail pricing. Checks 1 and 4 are direct from the retailers' own publications and are strictly stronger.

### Check 4 — Migros' own flyer, Zürich vs Ostschweiz ✅ **CLOSES THE OPEN ITEM**

*Run 2026-09-08. This was previously deferred "until OCR lands" — done instead by reading the page images directly.*

Issuu serves **genuinely separate documents per region** (same timestamp prefix, different revision hash):

```
zh  image.isu.pub/260901112018-83f2ee7a2489b9d025c772d68d0f64a7/
os  image.isu.pub/260901112018-245dabb098c3b5f11b6206b716894b06/
```

All four sampled pages differ in bytes. Page 3 of week 36 compared directly:

| Product | Zürich | Ostschweiz |
|---|---|---|
| Eierschwämme, Litauen, Schale 500 g | **9.90** (statt 14.85, 33%) | **9.90** (statt 14.85, 33%) |
| Migros Bio Zucchetti, Schweiz, Bund 500 g | **2.95** | **2.95** |
| Schweins-Geschnetzeltes IP-SUISSE, per 100 g | **1.20** (statt 1.85, 33%) | **1.20** (statt 1.85, 33%) |
| «Aus der Region.» Tomaten Aromatico, 300 g | *absent* | **2.60** (statt 3.90, 33%) |

**Every shared product carries an identical price.** The Ostschweiz edition adds one extra item from Migros' *«Aus der Region.»* regional-produce line, and is footed *"Genossenschaft Migros Ostschweiz"*.

**Same pattern as Coop.** The ten Migros cooperatives publish separate flyers with **regional assortment additions at national prices** — not regional pricing.

*Method note: no OCR toolchain was needed or installed. Page JPEGs were fetched from `image.isu.pub` and read directly.*

## The rule adopted

| | |
|---|---|
| **Price of a given offer** | **National.** No regional variation found in any source. |
| **Which offers run** | **Can vary by canton** — small and real (1 slot in 20 pages) |

**What varies is availability, not price.** Fetch one edition per retailer; do not build a region dimension on price.

**Consequences for the V3 schema** (`supabase/migrations/20260427_v3_concept_layer.sql`): the `region` table and `region_slug` columns are harmless but need not be populated. Do **not** invest in the 10-Migros-region seed. Note line 36's assumption *"only Migros gets regional rows"* was based on the same untested inference — but since regional pricing doesn't exist, the assumption no longer matters either way.

✅ **Closed 2026-09-08.** Migros was the weakest point in this evidence — ten *legally independent* cooperatives, not one company with regional print runs. **Check 4 tested it directly (Zürich vs Ostschweiz) and Migros behaves exactly like Coop: identical prices, regional assortment additions only.** The rule holds across both regionalised retailers. Nothing further outstanding.

---

# PART 4c — Coop coverage gap: MEASURED (2026-09-08/09)

The question: going direct via Coop's flyer, how much coverage is lost against what aktionis carries?

### Measurement 1 — raw counts

| | |
|---|---|
| aktionis unique Coop deals (walked to exhaustion, 20 pages) | **1006** |
| Coop flyer W36, 28 pages, `statt` offers | **195** |

### Measurement 2 — do aktionis deals actually appear in the flyer?

Counting could mislead, so this was tested by name matching: 281 aktionis Coop product names against the full flyer text.

| | |
|---|---|
| Appear in the flyer | **31** |
| Do **not** appear | **250** |
| **Flyer coverage of aktionis** | **11%** |

Found: wine, beer, Persil. Missing: Lenor, Tempo, Ariel, Dash, Coral, Cillit Bang, Lindt — household, cleaning, confectionery.

### Two hypotheses tested and rejected

**(a) "aktionis carries stale offers."** Sampled 25 deals → `priceValidUntil` — **all 25 current**. Rejected.

**(b) "aktionis spans multiple weeks, so comparing to one flyer is unfair."** Sampled 40 deals → **all 40 end exactly `2026-09-09`**, precisely the W36 flyer window. Rejected. The comparison was like-for-like.

### Conclusion

Coop runs roughly **1000 promotions in a given week**, of which only ~195 are printed in the weekly food flyer. The remainder — household, drugstore, confectionery — live on Coop's website/app. **The printed flyer is a ~11% subset, not a near-complete one.**

> **Wording correction.** Earlier notes called Coop's flyer "the best of all" — that referred to *price-data quality* (195 crossed-out prices, richest of any flyer), **not coverage**. Read as a coverage claim it is wrong.

### Competitor benchmark — rappn

Rendered `rappn.ch/en/offers` headless. Claims **"10,000+ offers"** across **7 retailers** ≈ ~1400 each — aktionis-scale, not flyer-scale. Its own sourcing statement is *"flyers, **websites** and promotional materials"*, so it does not rely on flyers alone.

**Notable:** rappn covers Migros, Coop, Aldi, Lidl, Denner, Aligro, Otto's — **zero mentions of Spar or Volg**. basketch covers both, so it wins there.

*Limit: rappn's offer list lazy-loads, so an exact per-retailer count was not verified — only the published "10,000+ across 7" claim and per-render mentions.*

### Other Coop catalogues — not findable

`epaper.coop.ch/catalogs/` → **403** (no index). Guessed sibling codes (`AM_AKMB`, `AM_BAHO`, `AM_CITY`, `AM_MEGA`, `AM_RESTA`, `AM_VITA`, `AM_COOPZ`, `AM_HOBBY`) → **all 404**. Only `AM_AKMA` responds. `coop.ch/de/aktionen/aktuelle-aktionen/c/m_1011` → **403 DataDome**.

**Open decision:** accept ~195 Coop offers, or retain aktionis for Coop alone.

---

# PART 4d — Migros OCR: SOLVED, free and local (2026-09-09)

Earlier assumption — that reading Migros' flyer JPEGs would need a paid vision API — is **wrong**. A free CPU-only model does it.

**`rapidocr-onnxruntime`** — pip-installable, **no system dependencies**, no GPU, runs on a GitHub Actions runner as-is.

Tested on `migros-wochenflyer-36-2026-d-zh` page 3:

| Field | Result |
|---|---|
| Product names, `statt` prices, discount %, unit prices | ✅ |
| Validity line *"Angebote gelten vom 3.9. bis 9.9.2026"* | ✅ |
| Large display price `9.90` at 1× | ❌ read as `06'6` (rotated) |
| Same price at **2× upscale (LANCZOS)** | ✅ **`9.90`** |

Angle classification (`use_angle_cls`) did **not** fix it; **upscaling did**.

| Scale | Image | Time | Clean prices |
|---|---|---|---|
| 1× | 2199×2997 | 1.2s | 1.20, 2.95 |
| **2×** | 4398×5994 | **4.2s** | **1.20, 2.95, 9.90** |

Yield across 4 pages at 1×: 17 `statt` prices, 18 discount badges, 13 clean sale prices, 1 mangled. At 2× the mangled case resolves.

**Cost:** ~4s/page → a 20-page flyer in **under 2 minutes**, against 2,000 free Actions minutes/month. **Zero-paid-services rule holds, and the pipeline stays autonomous.**

**Safety net:** when OCR does mangle a price it emits a token like `06'6`, which fails `createMoney()` validation. The domain rejects it as a warning rather than publishing a wrong price — the invariants built in `pipeline/collection/domain/` are what make free OCR safe to use.

---

# PART 5 — Where AI is actually needed

Once tier 2 of the categoriser is genuinely connected, the classifier's job shrinks to three specific holes:

1. **Aldi** — no category data in any source, and not carried by aktionis at all
2. **Coop flyer** — no category headings printed
3. **Migros** — headings exist but locked in JPEGs (OCR)

Plus the **priority rule** for aktionis' 1633 multi-category deals.

Recommended model if a local classifier is used: **`intfloat/multilingual-e5-small`** — 118M params, ~470 MB, MIT, runs free on a GitHub Actions runner. Multilingual is mandatory for German/French/Italian product names.

**Measurement, without manual labelling:** once the retailer's own category is available, **the store provides ground truth** and the pipeline can grade itself every run. No labelling of 100 deals required.

Two factual corrections recorded:
- A 100 CHF/month Claude Code subscription **cannot** power pipeline API calls — it's a terminal/IDE subscription, not API credits.
- "Andrew Kasup" is **Andrej Karpathy**; nanoGPT/nanochat are for learning LLM internals, not production classification.

---

# PART 6 — Observability: already solved

`pipeline/store.ts` → `logPipelineRun` already writes to the `pipeline_runs` table on **every run**. The data is being collected. Nothing reads it. **This needs a reader, not an architecture change.** Decoupled from the data-source question.

---

# PART 7 — Open decisions (Round 4, unanswered)

**Q13 — What happens to Migros?**
(a) drop it and change what basketch is · (b) OCR the Issuu flyer · (c) email Migros and ask.
➡️ *(c) and (b) together. Send the email — costs nothing, a written "no" beats a guess. Prototype the OCR meanwhile. But pin down whether Migros' terms — which cover "Webseiten der Migros-Gruppe" — reach its own Issuu account, before anything ships publicly. That question is genuinely unresolved.*

**Q14 — Member prices: what does basketch show?**
(a) the price anyone pays · (b) the best price, labelled member-only · (c) both.
➡️ *(b). Hiding it makes you wrong; showing it unlabelled makes you misleading — and misleading is the one thing Art. 3(1)(e) actually punishes.*

**Q15 — Does the 3-part split make sense now?**
Collection goes from one Python scraper to **seven heterogeneous integrations** — a JSON API, an open flyer platform, three PDF text extractors, an OCR pipeline, an HTML parser — each failing independently.
➡️ *Yes. The earlier lean against splitting rested on collection being one scraper. That is no longer true.*

**Also open — the taxonomy fork:** one shared taxonomy (aktionis `/q/`, 91.5%, 7 of 8 stores, one cheap addition to `pipeline/aktionis/fetch.py`, joined on the `data-upox-id` already parsed) **vs** per-retailer native taxonomies plus a mapping layer. The agent's note: *"a single consistent taxonomy across vendors may actually serve you better than each retailer's native labels"* — because per-item cheapest-store routing needs cross-vendor comparability more than it needs retailer fidelity.

---

# Outstanding user action

Open **`coop.ch/de/termsAndConditions`** in a normal browser and report what it says.

---

# Known unknowns

- Denner API pagination past 24 items — mechanism not found
- Lidl `gridboxes` current-week query mechanics — unsolved
- Spar iPaper Enrichments JSON — 403, contents unknown
- Coop robots.txt — never retrieved (blocked before serving)
- Aldi's JSON category field name — unverified behind Akamai
- Volg French PDF path — 404 on the guessed pattern
- Oferlo `/api/partner-brochure/` — params unknown
- Whether Kimbino's mobile app hits a richer private backend — bundle inspection found none
- Whether Aldi's absence from aktionis is seasonal or permanent
- KGer Freiburg appeal history
- Ryanair 2023 docket numbers

---

# Constraints that survive any decision

- **Zero paid services.** GitHub Actions free tier, Supabase free 500 MB, Vercel free. No paid LLM, no paid unblocking proxy.
- No npm workspaces.
- `SUPABASE_SERVICE_ROLE_KEY` never reaches the frontend.
- Pipeline sources return `UnifiedDeal[]` or an empty array — never throw.

---

*Provenance: recovered verbatim from the session transcript (`transcript-backup.jsonl`) after a `/compact`. Original agent reports preserved at `scratchpad/reports/report{1..13}_line*.md`; raw working files (PDFs, JSON captures, HTML) at `scratchpad/flyer*/`. Both locations are session-temporary — copy anything you want to keep into the repo.*
