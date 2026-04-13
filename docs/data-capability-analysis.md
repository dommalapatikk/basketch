# Data Capability Analysis: basketch

**Author:** Technical Infrastructure Advisor (Guide)
**Date:** 12 April 2026
**Purpose:** Document exactly what each data source returns, with field names and example values, so product decisions are grounded in facts.

---

## 1. Source Overview

basketch currently uses two data sources:

| Source | Method | Language | Target |
|---|---|---|---|
| **Migros** | `migros-api-wrapper` npm package (guest OAuth2 tokens) | TypeScript | Promotional deals + regular shelf prices |
| **Coop** | HTML scraping of `aktionis.ch/vendors/coop` | Python (BeautifulSoup) | Promotional deals only |

---

## 2. Migros: What the API Actually Returns

### 2a. Promotional Deals (via `getProductPromotionSearch` + `getProductCards`)

The pipeline fetches promo item IDs in pages of 100, then fetches full product cards in batches of 50.

**Raw product card fields used by the normalizer (`normalize.ts`):**

| Field Path | Type | Example Value | Used As |
|---|---|---|---|
| `title` (or `name` fallback) | string | `"M-Budget Milch UHT 1l"` | `productName` (after normalization) |
| `offer.price.advertisedValue` | number | `3.50` | `originalPrice` (regular shelf price) |
| `offer.promotionPrice.advertisedValue` | number | `2.80` | `salePrice` (promotional price) |
| `offer.badges[]` | array | `[{ type: "PERCENTAGE_PROMOTION", description: "20%" }]` | `discountPercent` (primary source) |
| `offer.promotionDateRange.startDate` | string | `"2026-04-10"` | `validFrom` |
| `offer.promotionDateRange.endDate` | string | `"2026-04-16"` | `validTo` |
| `imageTransparent.url` | string | `"https://image.migros.ch/d/{stack}/hash/name.jpg"` | `imageUrl` (with `{stack}` replaced by `original`) |
| `images[0].url` | string | (fallback image URL) | `imageUrl` (fallback) |
| `breadcrumb[0].name` | string | `"Milchprodukte"` | `sourceCategory` |
| `productUrls` | string | (product page URL) | `sourceUrl` |

**Discount calculation:** Prefers badge percentage (e.g., `"20%"` from `PERCENTAGE_PROMOTION` badge). Falls back to calculating `(originalPrice - salePrice) / originalPrice * 100`.

### 2b. Regular (Shelf) Prices (via `searchProduct` + `getProductCards`)

The pipeline (`fetch-prices.ts`) also fetches non-promotional shelf prices. This uses a different flow:

1. Loads all product groups from Supabase (with their `search_keywords`)
2. For each keyword, calls `MigrosAPI.products.productSearch.searchProduct` to get product IDs
3. Fetches product cards via `getProductCards` (same as deals)
4. Extracts `offer.price.advertisedValue` as the regular price (not the promo price)

**Key point:** The Migros API returns BOTH the regular price (`offer.price.advertisedValue`) AND the promotional price (`offer.promotionPrice.advertisedValue`) on the same product card. This means for Migros, we have:
- Regular shelf price: YES
- Sale price during promotion: YES
- Both on the same product card: YES

### 2c. Other Migros API Capabilities (available but not currently used)

| Capability | Available? | Notes |
|---|---|---|
| Full product catalog search | YES | `searchProduct` API returns product IDs for any keyword query |
| Product categories (breadcrumbs) | YES | Hierarchical breadcrumb array on each product card |
| Brand | In product name only | No separate brand field; extracted via regex (M-Budget, M-Classic, aha!, Naturaplan, etc.) |
| Organic flag | In product name only | Detected via keywords: "bio", "naturaplan", "demeter", "knospe" |
| Unit/quantity | In product name only | Parsed via regex: `"6 x 1.5 L"` -> `"6x1.5l"` |

---

## 3. Coop (via aktionis.ch): What the HTML Actually Provides

### 3a. Promotional Deals (scraped from `aktionis.ch/vendors/coop`)

The scraper parses `div.card.dealtype-deal` elements from paginated pages (up to 20 pages).

**Raw HTML fields extracted by `parse_deal_card()` (`normalize.py`):**

| CSS Selector | Example Value | Used As |
|---|---|---|
| `h3.card-title` | `"Satrap Airfryer Leggero Tower 3.5+6.5l"` | `productName` (after normalization) |
| `.price-new` | `"79.95"` | `salePrice` |
| `.price-old` | `"179.--"` | `originalPrice` (the pre-discount price shown on aktionis.ch) |
| `.price-discount` | `"55%"` | `discountPercent` |
| `.card-date` | `"26.03.2026 - 15.04.2026"` | `validFrom`, `validTo` (parsed from DD.MM.YYYY format) |
| `.card-image img[src]` | `"https://storage.cpstatic.ch/storage/deal_card.../product.webp"` | `imageUrl` |
| `a[href]` | `"/deals/satrap-airfryer-leggero-tower-35-65l"` | `sourceUrl` (prepended with `https://aktionis.ch`) |

**Additional HTML elements present but NOT currently extracted:**

| CSS Selector | Content | Notes |
|---|---|---|
| `.card-description` | Product description text | e.g., `"Hohe Kapazitat dank zwei unterschiedlich grossen..."` |
| `.card-merchant img[alt]` | Store logo + name | Always `"Coop"` when scraping the Coop vendor page |
| `data-upox-id` attribute | Internal aktionis.ch deal ID | e.g., `"1520182"` |

### 3b. What aktionis.ch Does NOT Provide for Coop

| Data Point | Available? | Notes |
|---|---|---|
| Regular (non-sale) shelf prices | **NO** | aktionis.ch only lists promotional deals. The `price-old` field is the "before discount" price shown in the promotion, which IS the regular price for that specific promoted product. |
| Full product catalog | **NO** | Only products currently on promotion appear. No way to browse or search all Coop products. |
| Product categories | **NO** | No category information in the deal card HTML. `sourceCategory` is always set to `None`. |
| Brand | In product name only | Same situation as Migros -- must be extracted via regex. |
| Organic flag | In product name only | Must be detected from keywords in product name. |

**Important clarification on `price-old`:** The `.price-old` value on aktionis.ch represents the original/regular price of the promoted item (i.e., what it costs when not on sale). This IS useful as a regular price reference, but ONLY for products that happen to be on promotion that week. There is no way to get the regular price of a Coop product that is NOT currently on sale.

---

## 4. Capability Comparison Matrix

| Capability | Migros | Coop (via aktionis.ch) | Impact on Product |
|---|---|---|---|
| **Regular (non-sale) prices** | YES -- via `searchProduct` API, any product | PARTIAL -- `price-old` gives regular price, but only for currently promoted items | Cannot do full "which store is cheaper overall" comparison. V1 limited to deal comparison only. |
| **Promotional/sale prices** | YES -- `offer.promotionPrice.advertisedValue` | YES -- `.price-new` from deal cards | Core product works for both stores. |
| **Full product catalog** | YES -- `searchProduct` finds any product by keyword | NO -- only promoted products are listed | Can search Migros catalog for favorites matching; Coop matching limited to products that have been on sale. |
| **Product images** | YES -- transparent images from rokka CDN | YES -- product images from cpstatic.ch CDN | Both stores have images for deal cards. |
| **Product categories** | YES -- `breadcrumb` array (e.g., "Milchprodukte") | NO -- no category data in deal cards | Migros source categories aid auto-categorization. Coop deals must be categorized entirely by keyword rules. |
| **Discount percentage** | YES -- from badges (`PERCENTAGE_PROMOTION`) or calculated | YES -- `.price-discount` (e.g., "55%") | Both stores provide discount info. |
| **Valid dates** | YES -- `promotionDateRange.startDate/endDate` | YES -- `.card-date` (e.g., "26.03.2026 - 15.04.2026") | Both stores have deal validity periods. |
| **Brand information** | In product name only (no separate field) | In product name only (no separate field) | Must extract from product name for both stores. Same regex approach works for both. |
| **Product description** | Not extracted (may be available in API) | Present in HTML (`.card-description`) but not extracted | Not currently used. Could enhance search relevance. |
| **Original price on deals** | YES -- `offer.price.advertisedValue` | YES -- `.price-old` | Both sources provide the "was" price for promoted items. |

---

## 5. aktionis.ch as a Source for Migros Data

**YES -- aktionis.ch lists Migros deals too.**

The fixture HTML confirms vendors listed on aktionis.ch:
- ALDI Suisse (`/vendors/aldi-suisse`)
- **Coop** (`/vendors/coop`)
- Coop Megastore (`/vendors/coop-megastore`)
- Denner (`/vendors/denner`)
- LIDL (`/vendors/lidl`)
- **Migros** (`/vendors/migros`)
- OTTO'S (`/vendors/otto-s`)
- SPAR (`/vendors/spar`)
- Volg (`/vendors/volg`)

**This means aktionis.ch could serve as a fallback for Migros deals** if the `migros-api-wrapper` breaks. The same Python scraper architecture would work -- just change the URL from `/vendors/coop` to `/vendors/migros`.

**Trade-off vs. the Migros API:**
- aktionis.ch provides: product name, sale price, original price, discount %, dates, image
- aktionis.ch does NOT provide: source categories (breadcrumbs), full product catalog, regular prices for non-promoted items
- The Migros API provides all of the above plus catalog search

**Recommendation:** Keep `migros-api-wrapper` as primary (richer data). Use aktionis.ch as documented fallback for Migros deals only if the API breaks.

---

## 6. Other Potential Swiss Data Sources

### 6a. oferlo.ch

Mentioned in architecture docs as fallback: "JSON-LD structured data." Not currently implemented. Would provide promotional deals (similar to aktionis.ch) but with structured JSON-LD in the page source, making parsing more reliable.

**Does NOT provide regular prices** -- it's a deal aggregator like aktionis.ch.

### 6b. Rappn.ch

Mentioned as fallback: "Next.js API." Covers 5 Swiss retailers including Migros and Coop. Likely has a client-side API that could be reverse-engineered.

**Does NOT provide regular prices** -- it compares offers/deals, not shelf prices.

### 6c. Pepesto API (paid)

Mentioned as emergency backup at EUR 0.05/request. A paid grocery data API.

**Potentially provides regular prices** but at a cost that conflicts with the CHF 0/month budget requirement.

### 6d. Coop regular prices -- no public source exists

There is no known public source for Coop's regular (non-promotional) shelf prices:
- **coop.ch** uses DataDome bot protection -- scraping is blocked and against project policy
- **aktionis.ch** only lists promotional items
- **oferlo.ch** and **Rappn.ch** are deal aggregators only
- No open-source Coop API wrapper exists (unlike Migros)

---

## 7. Summary of Data Gaps

### Gap 1: Coop regular prices (HIGH IMPACT)

**What's missing:** Regular shelf prices for Coop products that are NOT on promotion.

**Why it matters:** Without this, basketch cannot answer "which store is cheaper overall for my groceries" -- only "which store has deals this week on my items." The PRD explicitly calls this out as a known limitation (Section 10, risk table).

**Possible future solutions:**
- Manual collection for top 30-50 products (labour-intensive, hard to keep current)
- User-contributed prices (requires community, V3+ feature)
- Pepesto API (costs money)
- A future public Coop API (not currently available)

### Gap 2: Coop product categories (MEDIUM IMPACT)

**What's missing:** Source categories for Coop products. The Migros API provides breadcrumb categories (e.g., "Milchprodukte"), but aktionis.ch provides none.

**Why it matters:** Coop deals must be categorized entirely by keyword rules, which is less accurate. The categorizer (`categorize.ts`) handles this, but mis-categorizations will disproportionately affect Coop products.

**Mitigation:** Already in place -- keyword-based category rules in `categorize.ts` and `category-rules.ts`.

### Gap 3: Coop full product catalog (MEDIUM IMPACT)

**What's missing:** Ability to search all Coop products (not just those currently on sale).

**Why it matters:** When a user adds a favorite, Migros products can be found via `searchProduct` API even if not on sale. Coop products can only be matched if they have appeared in a promotion at some point (and thus exist in the products table).

**Mitigation:** Over time, the products table accumulates Coop products as they appear in promotions. The more weeks the pipeline runs, the better Coop product coverage becomes.

---

## 8. Implications for V1 Product Framing

Based on the data capabilities documented above, V1 should be framed as:

> **"Which of MY items are on sale where this week"** -- not "which store is cheaper overall."

This is already the framing in the PRD (Section 10): "V1 ships as deal tracker on favorites."

The data supports:
- Comparing promotional deals across both stores (both have sale price, original price, discount %, dates, images)
- Showing a weekly verdict based on deal count + discount depth per category
- Searching for Migros products at regular prices (even when not on sale)
- Gradually building Coop product knowledge from weekly promotions

The data does NOT support:
- Full regular-price comparison ("Migros milk costs 1.60, Coop milk costs 1.70")
- Complete Coop product catalog browsing
- Category-based analysis for Coop products with the same confidence as Migros
