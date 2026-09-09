<task-notification>
<task-id>ada2707e365d14c06</task-id>
<tool-use-id>toolu_017w4uCTFL4JxGtgGx3Giaxh</tool-use-id>
<output-file>/private/tmp/claude-501/-Users-kiran/5a310252-d722-41cb-89a0-d9350e2b8434/tasks/ada2707e365d14c06.output</output-file>
<status>completed</status>
<summary>Agent "Research Lidl and Aldi CH promo APIs" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>All old/dead — good confirmation that the actively-maintained repos are `EvickaStudio/lidl-discounts` (2026-05-08) and `stiles/aldi` (2025-12-15). I now have sufficient primary evidence for both retailers. Final report below.

---

## LIDL SCHWEIZ (lidl.ch)

**1. Official API/developer portal:** None found. No `api.lidl` or Schwarz-Gruppe developer portal exists. Confirmed by DNS: `curl` to `api.lidl.com` fails to resolve (exit code 6, "could not resolve host"). WebSearch confirms consensus: "Lidl does not offer a public developer API in Germany or any other market."

**2. Unofficial APIs / repos:**
- **`EvickaStudio/lidl-discounts`** (github.com/EvickaStudio/lidl-discounts) — last push **2026-05-08**, not archived. Python CLI/wrapper hitting public **Lidl Plus** endpoints (store-offer routes need no login). Confirmed working per README example output (store search, per-store weekly offers with price/discount/validity dates). Output columns: Product, Offer, Regular, Deal, Unit, Valid — **no explicit category column** in this tool's output.
- **`Andre0512/lidl-plus`** (PyPI: `lidl-plus`) — Lidl Plus loyalty-app API wrapper (receipts, coupons), supports country codes incl. CH via login. Last PyPI release Feb 2024; focused on receipts/coupons, not weekly-offer browsing.
- **`KoenZomers/LidlApi`** — .NET Lidl Plus wrapper, **archived**, last push 2022-12-18. Dead.
- **`hackerstolz/foodhacks-apis`** — last push 2016. Dead.
- Several commercial scraper-as-a-service wrappers exist (ShoppingScraper, Piloterr, Apify actors) but these are paid, not free APIs.

**3. Own category field exposed — YES, confirmed directly.** Lidl's public, unauthenticated JSON endpoint `https://www.lidl.ch/p/api/gridboxes/CH/de` returns HTTP 200 with a JSON array of product objects, each containing a **`"category"`** string field. Live example captured:
```
{"itemId":10000043,"fullTitle":"Swisscom","category":"Non Food", ...}
{"itemId":10000257,"fullTitle":"Gateway","category":"Non Food", ...}
```
25 items returned per call, all `category:"Non Food"` in the sample pulled (this endpoint appears to serve a fixed/example grid rather than being filterable by the `ids` query param I tried — passing specific product IDs from the weekly-offer page did not change the response, so the exact mechanism for pulling *the current week's* offer set through this endpoint needs further reverse-engineering, e.g. correct query-param name or a session/store-context cookie). The field name and richness (also includes `erpNumber`, `image`, `disclaimers`, `ians` (GS1 codes), `gs1Attributes`) strongly indicate a full PIM-backed category taxonomy is present on real weekly-offer items too, not just this sample.

**4. Structured data on site:**
- Homepage (`https://www.lidl.ch/`) and weekly-offer page (`https://www.lidl.ch/c/de-CH/wochenaktion/a10101806`, HTTP 200) both contain exactly **one `application/ld+json` block** — but it's only `Organization`/`MemberProgram` schema (Lidl Plus loyalty info), not Product markup.
- No `__NEXT_DATA__`, no `__NUXT__`, no `window.__*` global JSON blobs found via grep on either page.
- No inline `api`/`graphql` URL strings found in the raw HTML (JS bundles are separately loaded and minified — the `/p/api/gridboxes/...` path was discovered via known Lidl-international convention, not by grepping this page's HTML).
- Product detail links follow a clean, guessable pattern: `/p/de-CH/&lt;slug&gt;/p&lt;itemId&gt;` (e.g. `/p/de-CH/hakle-toilettenpapier/p10058148`), and category/PLP pages follow `/c/de-CH/...`.
- Note: `https://www.lidl.ch/c/de-CH/aktionen/` returned **404** — the correct weekly-offer path uses a `/c/de-CH/wochenaktion/a&lt;id&gt;` pattern (numeric ID that likely changes weekly/per-campaign), not a static `/aktionen/` slug.

**5. Bot protection:** Server header is **`myracloud`** (Myra Security, a German CDN/WAF — not Cloudflare/Akamai/Fastly). No bot-block encountered: plain `curl` with a standard browser User-Agent got HTTP 200 on homepage, weekly-offer page, robots.txt, and the `gridboxes` API, with no CAPTCHA/challenge page. `robots.txt` (`https://www.lidl.ch/robots.txt`, 200) disallows `/q/search`, `/cc.js*`, numeric-prefixed paths (`/1*`...`/9*`), and `/cdn/assets/cwv/`; it does **not** disallow `/c/`, `/p/`, or `/p/api/`. Lists `Sitemap: https://www.lidl.ch/static/sitemap.xml`, which resolves to a sitemap index including `product_sitemap.xml.gz`.

**6. Difficulty: Easy–Medium.** No bot-blocking CDN encountered, category field confirmed present in the public JSON API, and site structure is crawlable via sitemap. Medium (not Easy) only because the exact query mechanics of the `gridboxes` endpoint for a **specific week's live offer set** still need reverse-engineering (the naive `ids=` param didn't filter), and the `wochenaktion` campaign ID in the URL isn't static.

---

## ALDI SUISSE (aldi-suisse.ch)

**1. Official API/developer portal:** None found. WebSearch found no ALDI developer portal for any region; only third-party commercial scrapers (Apify, FoodDataScrape) and an unrelated `github.com/aldi` org with no public grocery API.

**2. Unofficial APIs/repos:** No CH-specific repos found.
- **`stiles/aldi`** (github.com/stiles/aldi) — last push **2025-12-15**, not archived. Automated scraper for **ALDI (German market)** full inventory + "Aisle of Shame"/finds weekly deals, using GitHub Actions on a schedule; uses the (German) ALDI site's own API per its description. Not Swiss-specific — architecture may be adaptable but untested against aldi-suisse.ch.
- **`AviBackToBlack/lidaldi`** — last push **2026-08-25** (most recently active repo found in this whole investigation), Scrapy-based, but scoped to **Ireland** ALDI/LIDL, not Switzerland.
- **`oleksiial/aldi-api`** — last push 2018-07-09. Dead/stale.
- **`clicktechnology/aldi-scrape`**, **`vikram-h-patil/web_scraping`** — small Scrapy exercises, not verified live/current.
- No Home Assistant or n8n integration found for either Lidl CH or Aldi CH.

**3. Own category field exposed — unknown (not directly verified), but strongly indicated.** Direct `curl` access to the site is blocked (see #5), so I could not grep raw HTML/JSON for an actual field name. Via `WebFetch` (which was able to render the page, unlike `curl`), the offers page (`https://www.aldi-suisse.ch/de/aktionen-und-angebote`) visibly organizes products by named department/category filters: **Fleisch, Fisch, Getränke, Tiefgekühlte Produkte, Süssigkeiten**, plus thematic filters (Bad, Heimwerken, Küche, Mode, Proteine, Schule, Haushalt, Garten, Baby, Spielzeug, Sport &amp; Freizeit). This confirms a category taxonomy exists and is used in the UI, but I cannot confirm the underlying JSON field name/example value without bypassing the bot block.

**4. Structured data on site:** Per `WebFetch` rendering: no `application/ld+json` Product markup detected; page is built on **Nuxt.js** (`/_nuxt/` asset paths visible), but no raw `__NUXT__` blob was surfaced in the fetched content and no explicit API/graphql URLs were visible in what WebFetch returned. This is secondary evidence only (WebFetch summarizes via a model, it isn't raw source) — a true `curl`/headless-browser grep was not possible due to the 403 block.

**5. Bot protection — CONFIRMED BLOCKING.** Server header: **`AkamaiGHost`** (Akamai Bot Manager). Every direct `curl` request — with a realistic Chrome User-Agent, `Accept-Language: de-CH`, and `-L` follow-redirects — returned **HTTP 403 "Access Denied"** with an Akamai reference ID, on:
  - `https://www.aldi-suisse.ch/robots.txt` → 403
  - `https://aldi-suisse.ch/robots.txt` (no www) → 403
  - `https://www.aldi-suisse.ch/` → 403
  - `https://www.aldi-suisse.ch/de/aktionen/` → 403
  - `https://www.aldi-suisse.ch/sitemap.xml` → 403
  - `https://www.aldi-suisse.ch/de/aktionen-und-angebote` (the real offers URL) → 403

  This pattern (blocked before any page-specific routing, even on `robots.txt`) indicates Akamai is filtering at the edge on TLS/JA3 fingerprint and/or IP/ASN reputation, not just on User-Agent string — swapping UA and adding full browser-like `Accept`/`sec-fetch-*` headers did not help. Interestingly, `WebFetch` (Anthropic's fetch infrastructure, on a different IP/fingerprint) *did* get through and even reported the `robots.txt` content, which explicitly **allows** `Claude-Web, ClaudeBot, GPTBot, ChatGPT-User, OAI-SearchBot, Google-Extended, Cohere-Ai, PerplexityBot` — i.e., Akamai is allow-listing known AI/search crawlers while blocking generic `curl`/scripted traffic.

**6. Difficulty: Hard.** Akamai Bot Manager blocks plain HTTP clients outright (403 on every URL including robots.txt); scraping this site programmatically would require a real headless browser with a legitimate TLS fingerprint (e.g., Playwright/Puppeteer with stealth patches) or a paid unblocking proxy — not a simple `curl`/`requests` script. No maintained, Switzerland-specific unofficial API/repo exists to shortcut this (the one recently-active related repo, `lidaldi`, is Ireland-only).

---

### Bottom line for basketch
- **Lidl CH is the far easier target**: no CDN bot-block, a live unauthenticated JSON endpoint (`/p/api/gridboxes/CH/de`) that already returns a `category` field per item, and a maintained community repo (`lidl-discounts`, pushed May 2026) proving the Lidl Plus offer endpoints work. Main remaining work: figure out the correct params/session to pull the *current week's actual* offer set (rather than the fixed 25-item sample I got) and confirm category coverage on real grocery items (my sample was all "Non Food").
- **Aldi Suisse is Hard**: Akamai blocks all direct HTTP access; a headless-browser approach or third-party aggregator (oferlo.ch, kimbino.ch, rappn.ch, preispirat.ch — all found via search, already scraping Aldi/Lidl CH circulars) may be a faster path than building your own scraper against Akamai.</result>
<usage><subagent_tokens>77171</subagent_tokens><tool_uses>38</tool_uses><duration_ms>611098</duration_ms></usage>
</task-notification>