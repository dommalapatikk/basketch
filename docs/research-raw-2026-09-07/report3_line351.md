<task-notification>
<task-id>af331d79ce71c1a4d</task-id>
<tool-use-id>toolu_01GiGaMZbWin3pcN2HK1uG6o</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/af331d79ce71c1a4d.output</output-file>
<status>completed</status>
<summary>Agent "Research Denner Spar Volg promos" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Research Report: Denner, Spar Schweiz, Volg — Programmatic Access to Weekly Promotions

### 1. DENNER (denner.ch)

**Official API / open data:** None public. Denner (and its digital agency **detailnet**) publish **API specs on GitHub** that look official but require provisioned credentials:
- `detailnet/denner-portal-api-spec` (Denner Portal 2.0, App-ID/App-Key auth, last push 2024-09-09) — endpoints `GET /articles`, `GET /article-groups`, `GET /advertised-articles`, `GET /promotion-types`.
- `detailnet/denner-client` (PHP client for above) — **last push 2026-02-09**, actively maintained.
- `detailnet/denner-mobile-api-spec` (2024-09-09), `detailnet/denner-shop-api-spec` (2023-11-21, wine shop only), `detailnet/denner-public-api-docs` (**archived 2021**, turns out to just be a generic Swagger-UI fork, not real content — dead end).
- Auth model: `securityDefinitions` require `App-ID`/`App-Key` headers — no evidence of self-service signup for this one; likely issued to Denner's marketing/agency partners.

**Unofficial API (works today):** `nicktcode/swissgroceries-mcp` (GitHub, 30 stars, **pushed 2026-06-07, updated 2026-09-06 — very actively maintained**) reverse-engineered Denner's **iOS app backend**: `https://app-api.denner.ch`, anonymous flow `POST /api/auth/m/signup {appId}` → `clientId`, then `POST /api/auth/m/signin` → JWT (~1yr validity, no user identity). Fully self-service/automatable. Host has no Cloudflare/Akamai/Imperva — just Azure App Insights + standard security headers.

**Category field — NO (in the promo feeds actually usable without special credentials):**
- The unofficial mobile API's `normalizeProduct()` in swissgroceries-mcp extracts only `name/size/price/tags/imageUrl/productUrl` — **no category field is exposed** in `app-api.denner.ch` promo responses.
- The public website's embedded Nuxt payload (`__NUXT_DATA__`) on `/de/aktionen/` only carries `sku, price, itemType, trackingCode, attributeInfo, displayInfo` per item — grepped for `categoryId/categoryName/categoryPath/warengruppe/gtin/ean/brand` → all 0 hits.
- The credentialed Portal 2.0 API **does** have real taxonomy: `article_group` object with `code/name` + `parent` (e.g. `"article_group":{"code":"60-56","name":"Italien Rot 70 cl","parent":{"code":"60","name":"Weine"}}`) — but that's gated behind App-ID/App-Key.
- **Workaround (verified live):** `sitemap.product_category.xml` lists 19 category-filtered promo URLs, e.g. `https://www.denner.ch/de/aktionen/getraenke~c1144372`, `.../lebensmittel~c1144362`, `.../fleisch/wurst/fisch~c1144364`, `.../milch/kaese/eier~c1144365`, etc. I fetched `getraenke~c1144372` live → returned 57 SKUs. **Fetching each of the 19 category pages and tagging items by which page they came from is a working substitute for a per-item category field.**

**Structured data:** Nuxt 3 SSR app (not Shopware — confirmed via `nuxt-robots` plugin signature, `window.__NUXT__`, `__NUXT_DATA__` devalue-array payload). One `application/ld+json` tag present but generic. Product recommendation engine is **Prediggo** (`detailData/api/product/prediggo-list` internal call path visible in payload).

**Bot protection:** nginx, custom CSP/HSTS headers, Kameleoon (A/B testing) — no Cloudflare/Akamai/Imperva/Fastly. robots.txt allows everything except `/checkout`, `/shopping-list`, `/headless-brick-preview/`.

**URLs tested:** `/robots.txt` 200 · `/de/aktionen/` 200 · `/de/sortiment/` **404** (no generic catalog path; use `/sitemap.product_category.xml` category URLs instead) · `/sitemap.xml` 200 (sitemap index → `sitemap.product.xml`, `sitemap.product_category.xml`).

**Difficulty: Medium** — site itself is easy to fetch (no WAF), but per-item category requires either the credentialed Portal API or the category-URL-fetch workaround; the free mobile API has no category field.

---

### 2. SPAR SCHWEIZ (spar.ch)

**Official API/open data:** None found — no developer portal, no GitHub org repos, no open data.

**Unofficial API/scraper:** **None found.** Searched GitHub/npm/PyPI for "spar.ch api/scraper" — no hits. `swissgroceries-mcp` explicitly does **not** cover Spar (only Migros, Coop, Aldi, Denner, Lidl, Farmy, Volgshop, Otto's). No reverse-engineered mobile-app client exists in public repos as far as could be found.

**Category field — NO / unknown:** Real page `/aktuelles/angebote` (the `/aktionen` path 404s) fetched live (1.7MB, TYPO3-based). Only one JSON-LD block, `{"@type":"WebPage"}` — no `Product` schema. Individual offer detail pages (found via `sitemap.xml?sitemap=offers`, e.g. `/aktuelles/angebote/detail/coca-cola`) also carry **only WebPage-type JSON-LD, no Product schema, no category filter markup** (`data-category`, `data-filter*` all absent). Offer URLs have no category segment (flat `/detail/{slug}`). No category taxonomy exposed anywhere I could find.

**Structured data:** TYPO3 CMS confirmed. Sitemap index cleanly exposes sub-sitemaps: `products`, `pages`, `blog`, `markets`, `wines`, `regions`, `offers`, `offers-eurospar`, `recipes`, `ideas` — the `offers` sitemap gives individual promo product URLs but with no category info in the URL or markup.

**Bot protection:** Apache, no CDN/WAF headers (no Cloudflare/Akamai/Imperva/Fastly detected). robots.txt permissive (blocks only `/typo3/` admin and tracking query params).

**URLs tested:** `/robots.txt` 200 · `/aktionen` **404** → real path is `/aktuelles/angebote` (200) · `/sitemap.xml` 200.

**Difficulty: Hard** — no API, no embedded structured product/category data found on either the listing or detail pages; would require raw HTML scraping with heuristic category inference (e.g., from page section headings) rather than a real taxonomy field.

---

### 3. VOLG (volg.ch) — plus VOLGSHOP.CH (important distinction)

**volg.ch (corporate/store site) — weekly Aktionen is PDF-ONLY:** Confirmed live: `/aktionen` 404s; real path from homepage nav is `/sortiment/wochenaktionen/` (200, TYPO3, only 54KB, zero product-tile markup, zero flipbook viewer). The page's actual content is a **download link to a static PDF flyer**: `/fileadmin/user_upload/dorfplatz/wochenaktionen/de/2026/Volg_Wochenaktionen_KW37.pdf`. No JSON-LD, no `__NEXT_DATA__`/`__NUXT__`, no API calls, no product grid. This confirms the "PDF/flipbook only" concern — **volg.ch itself is not a viable structured-data source.**

**volgshop.ch (separate delivery-shop domain) — this is the real find:** `nicktcode/swissgroceries-mcp` (same actively-maintained repo as above) runs a `volgshopAdapter` against `https://www.volgshop.ch` using the **standard WooCommerce Store API**: `GET /wp-json/wc/store/v1/products`, `?on_sale=true`, `?search=`, `/products/{id}`. **I live-tested this myself** (`curl "https://www.volgshop.ch/wp-json/wc/store/v1/products?per_page=2"` → HTTP 200) and it returned full product JSON including a native `categories` array, e.g.:
```json
"categories": [
  {"id":148,"name":"Käse &amp; Frischkäse","slug":"kaese-frischkaese","link":".../produkt-kategorie/.../kaese-frischkaese/"},
  {"id":141,"name":"Milchprodukte, Eier &amp; frische Fertiggerichte","slug":"milchprodukte-eier-frische-fertiggerichte","link":"..."},
  {"id":151,"name":"Mozzarella &amp; Feta","slug":"mozzarella-feta","link":"..."}
]
```
This is a genuine 3-level retailer taxonomy per item, no auth required. `?on_sale=true` returned an empty result at test time (0 items currently flagged on_sale via that filter — worth testing again during an active promo cycle, or filtering `on_sale:true` field on the general product listing instead).

**Category field — YES**, confirmed live. Field name: `categories` (array of `{id, name, slug, link}`), e.g. `"Käse &amp; Frischkäse"`.

**Bot protection:** volgshop.ch is nginx/PHP (Plesk), no CDN/WAF headers detected. robots.txt only disallows `/wp-admin/` and log/upload paths — `/wp-json/` is not blocked. volg.ch (main site) robots.txt additionally has a specific `User-agent: GPTBot / Disallow: /` rule (blocks OpenAI's crawler by name) but doesn't block generic bots/curl.

**URLs tested:** `volg.ch/robots.txt` 200 · `volg.ch/aktionen` **404** → real path `/sortiment/wochenaktionen/` (200, PDF-only) · `volg.ch/sitemap.xml` 200 (minimal, only a `pages` sub-sitemap) · `volgshop.ch/wp-json/wc/store/v1/products` 200 (live-verified, JSON, category-tagged).

**Difficulty: Easy** (via volgshop.ch, not volg.ch) — standard, unauthenticated, well-known WooCommerce REST API with a native category field; **Not feasible** via volg.ch itself for structured/categorized data (PDF flyer only). Caveat: volgshop.ch is Volg's **online delivery shop** — its on-sale/catalog data should closely track Volg's physical-store weekly promotions but is not guaranteed to be 100% identical; worth spot-checking against the PDF flyer once.

---

### Summary table

| Retailer | Official API | Unofficial API (working) | Category per item | Bot protection | Difficulty |
|---|---|---|---|---|---|
| Denner | No (GitHub specs exist but need App-ID/Key) | Yes — `app-api.denner.ch`, anonymous JWT auth, actively maintained repo (last push 2026-02/06) | Not in free API; workaround via 19 category-filtered `~cNNNNNNN` promo URLs (verified live) | None (nginx, no WAF) | Medium |
| Spar Schweiz | No | None found | Not found (no JSON-LD Product, no category markup on listing or detail pages) | None (Apache, no WAF) | Hard |
| Volg (volg.ch) | No | N/A — PDF flyer only | N/A | GPTBot blocked, others not | Not feasible (PDF only) |
| Volgshop.ch (Volg's online shop) | No, but standard WooCommerce Store API is effectively public/documented-elsewhere | Yes — confirmed live, no auth | **Yes** — `categories` array, verified live example `"Käse &amp; Frischkäse"` | None (nginx, no WAF) | Easy |

**Key actionable finding for basketch:** Denner and Volg both have workable, category-tagged paths (Denner via 19 category-filtered promo URLs; Volg via the volgshop.ch WooCommerce API), but only by going one level deeper than the obvious `/aktionen` page. Spar has no discovered path to category-tagged promo data at all — would need manual/heuristic category inference if included in the pipeline.</result>
<usage><subagent_tokens>101437</subagent_tokens><tool_uses>70</tool_uses><duration_ms>806485</duration_ms></usage>
</task-notification>