<task-notification>
<task-id>a53bcff0020277c6f</task-id>
<tool-use-id>toolu_01NZHqAgQvrvZiTgNKyf2BF4</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/a53bcff0020277c6f.output</output-file>
<status>completed</status>
<summary>Agent "Swiss flyer aggregators research" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>Research complete. Here are the verified findings.

---

# Swiss flyer aggregators — primary-evidence findings (checked 2026-09-07)

## Headline: 3 of the 5 named platforms have no Swiss presence at all

| Domain | DNS | HTTP | What is actually there |
|---|---|---|---|
| `prospektangebote.ch` / `www.` | A 37.97.254.27 | 200 (TLS cert mismatch, plain HTTP only) | **Parked.** `&lt;title&gt;TransIP - Reserved domain&lt;/title&gt;` |
| `aktionsprospekte.ch` / `www.` | **NXDOMAIN** (`dig @8.8.8.8`) | — | Does not exist |
| `marktguru.ch` / `www.` | A 217.26.48.101 | 200 (cert mismatch) | **Parked.** `&lt;title&gt;Hello, this domain has been purchased at Hostpoint&lt;/title&gt;` |
| `kaufda.ch`, `www.kaufda.ch` | NOERROR, **no A record** | — | Domain held, no site |
| `bonial.ch`, `www.bonial.ch` | NOERROR, **no A record** | — | Domain held, no site |
| `api.bonial.com` | **NXDOMAIN** | — | Lead is dead |
| `api.marktguru.io` | **NXDOMAIN** | — | Lead is dead |
| `api.marktguru.ch` | A 217.26.48.101 (wildcard on parked domain) | **404** Apache default | Not an API |

`bonial.com` homepage (HTTP 200) contains **zero** occurrences of "Schweiz"/"Switzerland"/`.ch`. Bonial/kaufDA operate DE/FR/ES only as far as I can verify. `prospektangebote.de` (Cloudflare 202 challenge) and `aktionsprospekte.de` (167.235.89.124) are live German sites — the `.ch` counterparts are not.

**Marktguru DE API for reference only** (proves the data model exists, but not for CH):
- `https://api.marktguru.de/api/v1/offers?limit=3&amp;zipCode=10115` → **HTTP 401** `"Invalid or missing api key"` without headers; **HTTP 200** with `x-apikey: 8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=` + `x-clientkey: WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=` + `x-apiversion: 20` (keys are in plaintext in `www.marktguru.de` `__NEXT_DATA__` under `config.apiHostAddress`/`apiKey`).
- Fields observed: `description, price, oldPrice, referencePrice, brand{}, product{}, advertisers[], categories, industries, unit, volume, validityDates[{from,to}], leafletFlightId, images`. `/api/v1/industries` → 200, 30 industries incl. `Supermarkt`, `Discounter`.
- `/api/v1/offers/search?q=…` → 404; the search path is different (not found).
- **There is no CH equivalent** — `api.marktguru.ch` is a parked-domain 404.

---

## Aktionis.ch — the only true product-level Swiss offer database

- **Swiss grocers:** Coop, Coop Megastore, Denner, LIDL, Migros, OTTO'S, SPAR, Volg — all with live Sept-2026 deals. **ALDI Suisse** exists as a vendor card (`/vendors/aldi-suisse`, logo `aldi-suisse-e6714b60--1879.webp`) but `/vendors/aldi-suisse` renders **0 deals** (page falls through to the vendor list). Current deal counts on page 1 (`price-new` occurrences): Coop 51 (6 pages), Denner 51, LIDL 51, SPAR 22, Migros 19, Volg 11.
- **Structured JSON:** **No general JSON API.** Verified 404s: `/deals.json`, `/api/deals`, `/api/v1/deals`, `/deals/&lt;slug&gt;.json`, `/feed`, `/rss`. `?format=json` is ignored (returns HTML 200). Only AJAX endpoint in `main_bottom.js` is `/setlocation.json`. `/vendors/coop/export.pdf` and `.csv` return **HTTP 200 but `text/html`** — not real exports.
  - **However**, every deal page carries `application/ld+json` schema.org: verified on `https://www.aktionis.ch/deals/coca-cola-zero-1864` → `{"@type":"Product","name":"Coca-Cola Zero","description":"24 x 33 cl","offers":{"@type":"Offer","price":"12.95","priceCurrency":"CHF","priceValidUntil":"2026-09-09T21:59:59Z"}}`. Old price is **not** in the JSON-LD.
- **Product-level offers:** **YES — fully.** Per-deal: product name, size/description, vendor, validity dates, and the full branch list with addresses.
- **Categories:** **YES — a real food taxonomy**, exactly what you want. `/q/Früchte-Gemüse`, `/q/Milchprodukte-Eier`, `/q/Getränke` group, `/q/Mineralwasser`, `/q/Softdrinks`, `/q/Fleisch-Wurstwaren`, `/q/Fisch-Meeresfrüchte`, `/q/Tiefkühlprodukte`, `/q/Süsses-Snacks`, `/q/Backwaren-Patisserie`, `/q/Bio`, `/q/Cerealien`, `/q/Vorräte`, `/q/Fertiggerichte`, `/q/Vegetarisch-Vegan`, `/q/Kaffee-Tee`, `/q/Bier`, `/q/Wein`, `/q/Frucht-Gemüsesäfte`. Live counts rendered in the facet sidebar (e.g. Nahrungsmittel 628, Getränke 429, Früchte/Gemüse 60, Milchprodukte/Eier 66, Wein 257).
- **Prices incl. crossed-out original:** **YES.** Explicit markup `&lt;span class="price-new"&gt;4.45&lt;/span&gt;&lt;span class="price-old"&gt;9.95&lt;/span&gt;&lt;span class="price-discount"&gt;55%&lt;/span&gt;` (Coop, Lindt Matcha Strawberry). Deal page: `12.95` / `26.25` / `50%` / "noch 3 Tage".
- **PDF vs images:** Neither — **no flyer pages at all.** It is a per-product deal DB with individual product photos (`storage.cpstatic.ch/storage/deal_card_defaultx2/*.webp`). Deals link out via `/dealtarget/&lt;id&gt;` → 301 to the retailer shop URL (verified redirect to `ottos.ch/.../p/327585`).
- Caveat: **HTML scraping only.** `robots.txt` disallows `/admin/, /lost, /login, /profile/, *.pkpass, *.pdf, /dealtarget/` — `/deals`, `/q/*`, `/vendors/*` are **not** disallowed.

---

## Kimbino.ch — flyer images + partial product-level offers with prices

Operated by Kimbino Green s.r.o. on the Hyperia platform (`tracker.ext.prod.ams3.k8s.hyperia.sk/api/v1` in the bundle). Nuxt 3 SSR.

- **Swiss grocers:** Migros (shop_id 1), Coop (2), Aldi (4), Denner (5), SPAR (6), Lidl (7), plus Otto's, Prodega, TopCC, Aligro, Radikal, Coop City. **Volg: absent** (0 occurrences). Flyers current: Coop 03.09–09.09.2026, Migros 02/03.09–08/09.09.2026, Aldi 10.09–16.09.2026, Denner 03.09–09.09.2026.
- **Structured JSON:** **No public REST API.** Verified: `/_payload.json` → **404**, `/&lt;brochure&gt;/_payload.json` → **404**, `/api/v1/brochures` and `/api/brochures` → **301** (empty). Entry bundle `https://www.kimbino.ch/_nuxt/20260907102859/entry.Dl_5DzbJ.js` (200, 788 KB) contains no `/api/*` data routes.
  - **But every SSR page embeds a full `__NUXT_DATA__` devalue JSON blob** (`&lt;script type="application/json" id="__NUXT_DATA__"&gt;`, ~160 KB on the homepage). This is the practical structured source and it is complete.
- **Product-level offers: YES but PARTIAL.** Verified on `https://www.kimbino.ch/produkte/pizza/` → `product.leaflets[]` (5 entries), fields: `id, shop_id, shop_name, shop_sef, shop_logo, category_id, name, page, price, date, dateStart, dateEnd, img, sef, valid_from_formatted, valid_to_formatted, phrases, external_url, is_monetized, …`. Actual rows:
  - Denner p.5 — "Buitoni Pizza La Classica, Due Formaggi, 2 x 320 g/…" — **CHF 6.35**
  - Lidl p.9 — "Gefüllter Mini Pizza Donut, Pro 90 g" — **CHF 1.29**
  - Aldi p.24 — "PIZZA, Prosciutto Funghi, 460 g, oder Salame…" — **CHF 4.69**
  - Coop p.19 — "p.ex. Pizza Margherita La Numero Uno Italpizza, 410 g" — **CHF 2.80**
  - Migros p.26 — "Blévita Pizza Style, 6 x 38 g" — **CHF 4.10**
  - **Coverage is uneven.** `https://www.kimbino.ch/produkte/milch/` returns 8 leaflets with `price: null` and `name` = the *brochure* name, i.e. only an OCR page hit, no extracted offer. So some keywords resolve to true offers, others only to page references.
  - Brochure detail pages have `leafletProductsList: []` for Coop and Denner — there is **no** "all offers in this flyer" list. Offers are only reachable via `/produkte/&lt;slug&gt;/`.
  - Product index: `/produkte/&lt;letter&gt;/` returns a large keyword dictionary (`products.names[]`, e.g. Milch, Mehl, Margarine, Mandarinen, Mascarpone…). Homepage/shop pages carry `discountProducts[]` with `min_price_from` strings, e.g. `{"name":"Pizza","sef":"pizza","min_price_from":"ab CHF 1.29"}`, `Kiwi "ab CHF 0.94"`, `Kaffee "ab CHF 0.68"`.
- **Categories:** **NO product categories.** `category_id` on a leaflet is the *retailer sector* (11 = Supermärkte, 15 = Kosmetik/Drogerie, 17 = Andere), not "Früchte &amp; Gemüse". The `/produkte/&lt;slug&gt;` entities are free-text keywords, not a taxonomy.
- **Old / crossed-out price:** **NO.** No `oldPrice`-like field in the payload; zero `&lt;del&gt;`/`&lt;s&gt;` tags and no strikethrough class on the product or brochure pages.
- **PDF vs images:** **Images only.** Thumbor-signed WebP/JPEG from `eu.kimbicdn.com`, e.g. `https://eu.kimbicdn.com/thumbor/B-p1cD8SBu4U5fhISNVKJskc8EE=/full-fit-in/240x240/filters:format(webp):quality(65)/ch/data/2/35228/0.jpg?t=…` → **HTTP 200, `image/webp`**. Path scheme is `ch/data/&lt;shop_id&gt;/&lt;brochure_id&gt;/&lt;page&gt;.jpg`; the thumbor signature is required. No PDFs.

---

## Oferlo.ch — same flyer corpus as Kimbino, but **no prices at all**

Also Hyperia (`eu.leafletscdn.com/ch/…`, `tracker.ext.prod.ams3.k8s.hyperia.sk/api/v1`). Server-rendered PHP/Yii. **Identical brochure IDs to Kimbino** (Coop 35228, Denner 35225, Aldi 35237, Migros 35204 — Kimbino prefixes them with `60`), so it is the same underlying data pipeline.

- **Swiss grocers:** Aldi, Aligro, Coop, Denner, Lidl, Migros, Otto's, Prodega, Radikal, SPAR, TopCC, Coop City. **Volg absent.** Current: Coop 03.09.2026, Migros 03.09.2026, Denner 03.09.2026, Aldi/Lidl 10.09.2026, SPAR 03.09.2026.
- **Structured JSON — verified live endpoints (all HTTP 200):**
  - `https://www.oferlo.ch/api/get-menu-items/` → 200, 922 B, JSON: `{"11":[[["/aldi/","Aldi",4],["/coop/","Coop",2],…]]}` (retailer→category→shop_id map)
  - `https://www.oferlo.ch/ajax/get-top-shops/` → 200, JSON `{"recommendationShops":[{"id":1,"name":"Migros","logo":"https://eu.leafletscdn.com/thumbor/…/ch/data/1/logo.png"},…]}`
  - `https://www.oferlo.ch/site/ac-json/?q=milch` → 200, 38 KB JSON: shops keyed by id with nested `f[]` = brochures `{v: sef, l: label, i: thumbor image, t: "03.09.2026 - 09.09.2026", u: unix_ts}`. **No products, no prices.**
  - `https://www.oferlo.ch/api/get-geolocation/` → 200 `{"status":"error","code":404,"message":"No IP"}`
  - `/api/partner-brochure/` referenced in page JS (not exercised — unknown params).
  - Each brochure page also inlines `var brochureData = {"id":35228,"shop_id":2,"category_id":11,…}` and `window.leafletTrackingContext = {"leafletId":"35228","pageCount":28,"retailer":"coop","country":"ch"}`.
- **Product-level offers: NO.** `/suchen/?q=milch` and `?q=pizza` return brochure-page hits ("Seite 7", "Seite 28") from an OCR index. Every result card renders `&lt;div class="price"&gt;&lt;span&gt;Preis im Prospekt&lt;/span&gt;` — a static label. **Zero `CHF` strings in 32 result cards.** `/produktliste/` is just an A–Z keyword page linking to `/suchen/?q=…`.
- **`/offers/` is empty for CH:** "Wir haben derzeit keine Angebote für Ihre Stadt."
- **Categories:** retailer sectors only (Supermärkte, Elektromärkte, Haus &amp; Gartencenter, Kosmetik und Drogerie, Möbel, Andere). No product categories.
- **Old price:** N/A — no prices at all.
- **PDF vs images:** **Images only**, thumbor WebP/JPEG on `eu.leafletscdn.com`, path `ch/data/&lt;shop_id&gt;/&lt;brochure_id&gt;/&lt;page&gt;.jpg`. Unsigned CDN paths and `leaflet.pdf` / `0.pdf` all → **404**.

---

## Bottom line for your pipeline

1. **aktionis.ch is the only Swiss aggregator with the full triple** you need: per-product offers **+ real food category taxonomy + crossed-out old price + discount %**, covering Migros, Coop, Denner, Lidl, SPAR, Volg, Otto's (Aldi Suisse currently 0 deals). Cost: HTML scraping (schema.org JSON-LD gives name/price/currency/validity; old price and category require DOM parsing of `.price-old` / `/q/` links). No flyer images.
2. **kimbino.ch is the best structured *flyer* source**: full `__NUXT_DATA__` JSON on every page, current Sept-2026 flyers for all six major grocers, page images, and *partial* offer extraction with `price` (no old price, no product categories). Volg missing.
3. **oferlo.ch** = same flyers as Kimbino, several genuinely working JSON endpoints, but **strictly image + OCR-page-index; no product names, no prices**. Use only if you want a second image source.
4. **prospektangebote.ch, aktionsprospekte.ch, marktguru.ch, kaufda.ch, bonial.ch are all dead for Switzerland** — parked, NXDOMAIN, or A-record-less. Do not build on them.
5. **Unknown / not verified:** whether `/api/partner-brochure/` on Oferlo yields anything useful; whether Kimbino's mobile app hits a private backend richer than `__NUXT_DATA__` (bundle inspection found none); whether Aldi Suisse deals on aktionis.ch are seasonal or permanently absent; historical existence of the parked `.ch` domains.</result>
<usage><subagent_tokens>119077</subagent_tokens><tool_uses>52</tool_uses><duration_ms>1575696</duration_ms></usage>
</task-notification>