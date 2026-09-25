# How basketch works today — source-of-truth fact sheet

**Date:** 2026-09-25 · **Author:** Solution Architect (research only — no code, workflow or DB changed)
**For:** the Designer, who writes the new "Data sources" / "How it works" / footer copy from this sheet.
**Verified against (production code on disk + the latest run), not against design docs:**

- `pipeline/collection/infrastructure/live-sources.ts` (the composition root — the only list of sources that actually run)
- each adapter under `pipeline/collection/infrastructure/*/`
- `.github/workflows/pipeline.yml`
- `pipeline/composition.ts`, `pipeline/transformation/**` (classification)
- `web-next/src/server/verdict/algorithm.ts`, `web-next/src/lib/domain/votes-in-verdict.ts`, `web-next/src/server/data/filter-deals.ts`, `web-next/src/lib/share.ts`, `web-next/src/stores/list-store.ts`, `web-next/next.config.ts`, `web-next/src/components/ui/product-image.tsx`
- Run log `gh run view 35983172760 --log` (scheduled, Thu 2026-09-24, success after one retry)
- Live site, fetched 2026-09-25: `https://basketch.vercel.app/en/about` and `/en` (HTML + response headers)

**Rule for the Designer:** anything marked **UNVERIFIED** must not be published. Anything marked **DO NOT SAY** is verifiably false today.

---

## 0. The one-paragraph truth

Three times a week (Mon, Tue, Thu) an automated job collects the current weekly promotions of seven Swiss retailers. **Six come from the retailer's own public channel** (Denner's website data, Volg's website, and the openly published digital flyers of LIDL, ALDI, SPAR and Migros). **Coop still comes from aktionis.ch**, a third-party deal site, because coop.ch blocks automated access and Coop's own flyer carries only ~11% of its promotions. Each product is sorted into our own category list by an AI model (Google Gemini), with every answer checked by a second AI model (OpenAI gpt-5-nano via OpenRouter); answers the checker disputes are shown but marked "Category unverified". The home page names, per category (Fresh / Long-life / Household), the store with the highest **average discount %**. Visitors add individual deals to a list that lives only in their own browser, grouped by store, and share it by WhatsApp, e-mail or link.

---

## 1. Per retailer — where offers come from today

Counts are from run 35983172760 (publication week 2026-W39), `collection.source.finished` events. "Stored" is after de-duplication and filtering.

| Retailer | Source today (production) | Mechanism | Offers collected (W39) | Product image | "View" link on the card goes to |
|---|---|---|---|---|---|
| **Denner** | **Retailer's own website** — `POST https://www.denner.ch/search-api/simplePageContent` (the JSON the Denner site itself uses; `pageId 12` = current week, 11 pages) | JSON | 268 (255 after dedupe) | Retailer photo, `denner.imgix.net` (Denner's CDN) | denner.ch product page |
| **Coop** | **aktionis.ch** — `GET https://www.aktionis.ch/vendors/coop` and `/vendors/coop/{n}` (~20 listing pages) | HTML listing cards | **1,018** (62% of all offers) | Photo from **aktionis' CDN** `storage.cpstatic.ch` (not Coop's) | **aktionis.ch** deal page (`https://www.aktionis.ch/deals/…`) |
| **Volg** | **Retailer's own website** — `GET https://www.volg.ch/sortiment/wochenaktionen/` | HTML | 25 | Retailer photo from `www.volg.ch` where the page has one (research: 16 of 23; today's share **UNVERIFIED**) | The Volg weekly-offers page (no per-product page) |
| **SPAR** | **Retailer's own flyer** — `angebote.spar.ch/flugblatt/{YYYY}/spar-angebote-kw{NN}-{YYYY}/GetPDF.ashx` → PDF on `cdn.ipaper.io` | PDF text (`pdftotext -bbox`) | 65 (15 warnings: merged tiles) | **None** — `live-sources.ts` deliberately passes no page-image URL (SPAR's page-image scheme is unknown); cards are imageless | SPAR's flyer page on angebote.spar.ch |
| **ALDI** | **Retailer's own flyer** — `catalog.aldi-suisse.ch/aldiwoche_kw{NN}-{YYYY}_de/data.json` (Publitas) → the flyer PDF | PDF text + page coordinates | 163 (162 stored) | **Crop of the flyer page**: coordinates only; the visitor's browser loads the page image from `view.publitas.com` and CSS shows the product's rectangle | ALDI's catalogue page |
| **LIDL** | **Retailer's own flyer** — `endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw{NN}` (JSON) + the flyer PDF for a Lidl Plus check | JSON + PDF text | 70 (135 warnings — mostly dropped Lidl Plus pages, see §4) | Retailer photo, `imgproxy-retcat.assets.schwarz` (Schwarz Group / LIDL CDN) | lidl.ch product URL from the flyer JSON (where present) |
| **Migros** | **Retailer's own flyer on Issuu** — `issuu.com/m-magazin/docs/migros-wochenflyer-{KW}-{YYYY}-d-zh` (Zurich German edition) | Page images read by **free, local OCR** (`rapidocr-onnxruntime` on the GitHub runner); images discarded after reading | 56 (55 stored) — of 137 price anchors found; 60 multi-buy offers withheld | **Crop of the flyer page** from `image.isu.pub`, loaded by the visitor's browser | The Issuu flyer |

**Total this run:** 1,650 collected → **1,562 deals stored** (log: `Pipeline complete … stored 1562 deals`).

### 1a. Does Coop (or anyone else) still depend on aktionis.ch? — **Yes, Coop does. It is not stale.**

- `live-sources.ts` constructs `createCoopAktionisSource(...)` — the Coop source in production is `pipeline/collection/infrastructure/coop/coop-aktionis-source.ts`, whose constant is `SITE = 'https://www.aktionis.ch'`.
- This was a recorded decision, not an oversight: `docs/collection-module-design.md` "Approved decisions" — *"Coop: aktionis (decided 2026-09-09). coop.ch is DataDome-blocked and its flyer is a measured 11% subset (~195 of ~1006 weekly promotions)."*
- Therefore Coop's `sourceUrl` on aktionis.ch is **current and correct**, not a leftover. Coop prices, discount %, validity dates and images all come from aktionis' listing cards; the image is served from aktionis' CDN (`storage.cpstatic.ch`, the same CDN aktionis uses for its own site assets, e.g. `aktionis.cpstatic.ch`).
- **No other retailer** touches aktionis.ch in production. Denner, Volg, SPAR, ALDI, LIDL and Migros are all read from retailer-owned endpoints (flyer hosts Issuu/Publitas/iPaper are the retailers' chosen publishing platforms).
- `CLAUDE.md:7` ("aktionis.ch is dropped") is therefore **inaccurate for Coop** — see §5b.

**Consequence for copy:** "All data comes from aktionis.ch" is false (6 of 7 are direct). "We no longer use aktionis.ch" is **also false**. The truthful statement is: *six retailers direct; Coop via aktionis.ch.* By volume Coop is ~62% of stored offers (1,018 of 1,650 collected), so aktionis still supplies the majority of rows.

### 1b. How prices are obtained

- Sale price, "was" (reference) price and discount % are read from what the source prints/serves. A printed discount badge is kept if it agrees with the prices within ±1.5 percentage points; otherwise the offer is rejected (`collection/domain/discount.ts`).
- If a source prints no reference price (common at ALDI and for Denner "SPECIAL" badges) basketch shows **no** discount rather than inventing one (the "ALDI rule", enforced in the `Offer` constructor).
- OCR'd Migros prices that cannot be parsed as a valid amount are dropped, never guessed (`createMoney` validation).
- Prices are **national**: research found no regional price differences (`docs/data-source-research-2026-09-07.md` Part 4b). Migros is read from the Zurich edition only.

---

## 2. Schedule, freshness, validity

| Fact | Value | Evidence |
|---|---|---|
| Scheduled runs | **Monday, Tuesday, Thursday**, cron `0 5 * * 1/2/4` (05:00 UTC = 07:00 Swiss summer time) | `pipeline.yml` |
| What each run collects | **All seven retailers every run** (no day-of-week gating since WP-P4) | `pipeline.yml` comment; run log `retailers:[denner,coop,volg,spar,aldi,lidl,migros]` |
| Actual start time | GitHub delays scheduled jobs: last 6 scheduled runs **started 09:30–10:30 UTC** (~11:30–12:30 Swiss) | `gh run list` |
| Run duration | 20 min – 1 h 41 min; W39 run finished 11:23 UTC (13:23 Swiss) | `gh run list`, log |
| Reliability | 2 of the last 6 scheduled runs **failed** (15 and 17 Sep); next runs recovered | `gh run list` |
| Site update | Pipeline calls `/api/revalidate` when it finishes; the site's cache also refreshes itself at most hourly | log `revalidate webhook ok`; `snapshot.ts` `cacheLife({revalidate: 900, expire: 3600})` |
| "Updated" date shown to users | The newest `updated_at` among the deals shown — i.e. when the pipeline last wrote, **not** when a retailer published | `supabase-provider.ts:252-256` |
| Stale banner | Appears when that timestamp is **older than 9 days**, or the database read failed | `lib/format.ts:126-131`, `StaleBanner.tsx` |
| Which week is fetched | ISO week of the run date (`isoWeekOf(now)`); each adapter maps that to its own publication (e.g. LIDL/Denner current-week edition) | `run-pipeline.ts:287`, `domain/edition.ts` |
| Offer validity | **Per offer, read from the source**: Denner `promotionFrom/To`; Coop per card (starts vary, ends together); Volg per section (fresh offers Wed–Sat, others Mon–Sat); SPAR the flyer's "Gültig von … bis …" line; ALDI per flyer page; LIDL `offerStartDate/offerEndDate`; Migros the flyer line, overridden by a per-offer line where printed | adapter headers |
| Typical cycle | Most retailers run Thursday → Wednesday; Volg Mon/Wed → Sat (observed in research on specific weeks — describe as "usually", not a guarantee) | research Part 2, adapter comments |
| Expired offers | Hidden (deal queries keep `valid_to ≥ today`, Zurich date) and deactivated by the pipeline (W39: 485 deactivated) | CLAUDE.md, log |
| Not-yet-started offers | **Shown** with a "From <date>" label, but excluded from the category winner and from the "Cheapest" tag | `votes-in-verdict.ts` |

**Copy implications:** "refreshed weekly" understates it (collection runs 3×/week; retailers publish weekly). Do **not** promise a time of day ("every Thursday morning") — actual start drifts by hours and runs occasionally fail.

---

## 3. Categorisation, the verdict, and the list

### 3a. Categorisation — **not our own model; our own category list, classified by third-party AI**

| Step | What happens | Evidence |
|---|---|---|
| 1. Non-grocery filter | A brand blocklist drops LIDL non-food own-brands (Parkside, Silvercrest, Esmara, Lupilu …). W39: 24 dropped | `grocery-filter.ts`, log |
| 2. Classifier (tier 1) | **Google Gemini** (`gemini-3.5-flash-lite`, free tier) assigns each product a category + sub-category **from basketch's own taxonomy** (`shared/types.ts`), using only the **product name** (+ printed descriptor) and a few already-classified similar products as examples | `composition.ts:61`, `classification-prompt.ts`, log `classifier model: gemini-3.5-flash-lite` |
| 3. Judge (tier 2) | **OpenAI `gpt-5-nano` via OpenRouter** (the one paid service, capped at USD 5/month) checks every answer | `composition.ts:71`, log `judge: … (verdict defensible)`, `spend account: $3.32 remaining of $5.00` |
| 4. Disputed → reflect | If the judge disputes, Gemini reconsiders; if still disputed the deal is **published but flagged `is_uncertain`** → card shows "Category unverified", excluded from winner and "Cheapest" | `classify-graph.ts`, `classify-deals.ts`; W39: 59 uncertain |
| 5. Cache | Every product's answer is cached, so each product is classified once (W39 attempt 2: 1,156/1,626 cache hits) | log |
| 6. Held back | Products the run did not reach before its time limit are **not published that run**; they are classified next run (W39: 47 held back) | log `held back 47` |
| 7. Blocked | Tobacco is classified but never shown | `classify-deals.ts` (D10) |
| 8. Top-level group | Each sub-category maps to one of three groups: **Fresh, Long-life, Household** | `lib/category-rules.ts:12` |

- **Retailer categories are not an input.** Every adapter except Denner sets `sourceCategory: null`; Coop deliberately ignores aktionis' labels. Denner's own categories were meant to score accuracy every run, but the log says **`benchmarkMacroF1 could not be evaluated: benchmark not wired`**. → **DO NOT SAY** "accuracy checked against Denner every run".
- The site includes some non-food (household, drugstore, some toys/clothing tags appear in the log as unmapped sub-categories).

### 3b. The category verdict ("X wins Fresh")

`server/verdict/algorithm.ts` + `lib/category-rules.ts`:
- For each group, each store's score = **average discount %** of its deals in that group that "vote".
- A deal votes only if: category is not uncertain, price is not member-only, it is in effect today (Zurich date), and it is not a multi-buy ("from N items") price.
- Winner = top average, only if it beats #2 by **≥ 2 percentage points** and has **≥ 5 voting deals**; otherwise "Tied". One store only → "Only one store". None → "No data".
- It is **not** a basket price comparison and does not use regular shelf prices.

### 3c. The "Cheapest" tag on the deals page — **it means "biggest discount", not "lowest price"**

`filter-deals.ts buildSections`: deals are grouped by sub-category, **sorted by `discountPercent` descending**; the first voting deal is tagged "Cheapest" (`deals.cheapest`). No price or unit-price comparison decides it. → **DO NOT SAY** that "Cheapest" is the lowest price; the Designer should raise this label with the PM (UWG Art. 3(1)(e) accuracy), but that is a product decision, not part of this fact sheet.

Per-unit price ("CHF x/kg") is **displayed** where the database has `price_per_unit` + unit (`DealsClient.tsx:376-378`), but it plays no part in the winner or the "Cheapest" tag. Coverage of per-unit data: **UNVERIFIED**.

### 3d. The list / "per-item cheapest-store routing"

What is live (`stores/list-store.ts`, `components/list/ListDrawer.tsx`, `lib/share.ts`, `app/[locale]/list/page.tsx`):
1. The visitor picks individual deals ("Add to list"). **The visitor chooses the store** by choosing the deal; basketch does **not** automatically find the cheapest store for an item.
2. The list is saved in the visitor's **browser (`localStorage`, key `basketch-list`)** — nothing is sent to a server.
3. "Where to buy" groups the items by store with a per-store and estimated total (sum of sale prices).
4. Share: WhatsApp, copy link, e-mail (`mailto:`). The shared text labels member-only, "from N items" and not-yet-started prices. The link is `/list?items=<deal ids>`; on open, ids still in this week's data are loaded, others silently dropped.

**Not live:** the variant picker, "where each store stands" availability strip, "notify me when this drops" e-mail, and hidden-suggestion sync all exist only inside `components/landing/V3PreviewSection.tsx`, which **no page renders**. → **DO NOT SAY** "track your regular items", "we'll notify you", or "we route each item to the cheapest store".

---

## 4. What basketch does NOT do, legal constraints, limitations

### 4a. Privacy — verified

| Claim | Status | Evidence |
|---|---|---|
| No account / login | **TRUE** | No auth code; no server actions (`grep "'use server'"` → none); only route handlers are `/api/revalidate` (pipeline) and `/card` (share image) |
| No analytics / tracking | **TRUE in code and on the live page** | `lib/observability.ts` is a no-op stub (Sentry/PostHog "TODO"); neither package installed; live `/en` HTML has no `_vercel/insights`, Google Tag Manager, PostHog, Plausible or Sentry |
| No tracking cookies | **TRUE**, with one functional cookie: `NEXT_LOCALE=en; Path=/; SameSite=lax` (language preference, set by next-intl, no expiry → session cookie) | live response headers |
| Personal data stored | List stays in the visitor's browser only | `list-store.ts` |
| E-mail collected | **FALSE — no e-mail is collected anywhere live** | only e-mail inputs are in unrendered `AvailabilityCellSheet.tsx`; `WorthPickingUp` runs with `userEmail: null` |
| Hosting logs (Vercel) / Vercel Web Analytics toggled in dashboard | **UNVERIFIED** — not visible in code; dashboard not inspected | — |

### 4b. Legal constraints relevant to users

- **No circumvention.** Coop's site and Migros' API refuse automated access; basketch does not get around them (Coop via aktionis, Migros via its public Issuu flyer). aktionis' terms and robots.txt were checked (adapter header: "no anti-scraping, anti-bot or database clause… /vendors/* is not disallowed"). One honest user agent: `basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)`.
- **Product photos (Art. 2 Abs. 3bis URG).**
  - **Flyer crops (ALDI, Migros):** only coordinates `{pageImageUrl, x, y, w, h}` are stored; the visitor's browser loads the page from the retailer's host via a plain `<img>`. The photo never passes through basketch servers. **TRUE.**
  - **Product photos (Denner, Coop, LIDL, Volg): they DO pass through basketch's host.** They are rendered with `next/image` **without `unoptimized`** (`product-image.tsx:29`, `ListDrawer.tsx:226`, `WorthPickingUpCard.tsx:93`), so Vercel fetches, resizes and serves them from `basketch.vercel.app/_next/image?url=…` — confirmed on the live home page (`/_next/image?url=https%3A%2F%2Fstorage.cpstatic.ch…`). `next.config.ts` itself says optimising a flyer crop would "serve a derived copy … from our own domain"; the same is true for these four retailers' photos. → **DO NOT SAY** "images are never copied / always loaded directly from the retailer". Flag to PM/Tech Lead as a legal-risk finding (not fixed here).
- **Price-comparison accuracy (Art. 3(1)(e) UWG):** validity dates shown; expired offers hidden; not-yet-started, member-only, multi-buy and uncertain-category deals are shown with labels but never win or get "Cheapest". The site must not imply it lists every promotion (see limitations).

### 4c. Limitations — what users should know

- **Coverage is not complete.** Only what each source publishes: Migros ~56 flyer offers (of 137 price anchors; 60 multi-buy offers withheld because the quantity could not be read); SPAR, ALDI, LIDL = flyer only; Coop via aktionis only. Retailer app coupons, Cumulus/Supercard digital coupons and in-store-only deals are not collected.
- **Member prices:** no adapter emits a member-only price today (`memberOnly(` is never called in `infrastructure/`). LIDL offers on flyer pages that mention **Lidl Plus are dropped entirely** (page-level, roughly half of LIDL). Coop Supercard / Migros Cumulus-only prices are **not detected**; whether any appear in the data is **UNVERIFIED**. → **DO NOT SAY** "member prices are always labelled"; say that LIDL Plus prices are excluded.
- **SPAR has no product images.** Other retailers may lack an image for individual products (Volg site gaps, unmatched ALDI pages, OCR misses).
- **OCR / PDF reading can miss or mis-read** items; unreadable prices are dropped, not guessed.
- **Categories are AI-assigned** and can be wrong; disputed ones say "Category unverified".
- **Newly seen products may appear a run later** (held back until classified).
- **Languages:** only German (default) and English are served (`i18n/routing.ts`: `['de','en']`). `fr.json`/`it.json` exist but are not routed.

---

## 5. Inventory of stale statements

### 5a. User-facing (live — DE and EN share line numbers)

| # | File:line | Current text (EN / DE) | Why it is wrong |
|---|---|---|---|
| 1 | `messages/en.json:18`, `de.json:18` (`about.data_sources.body`) | "All deal data comes from aktionis.ch, a public Swiss deal aggregator since 2006." / "Alle Aktionsdaten stammen von aktionis.ch …" | 6 of 7 retailers are now direct; only Coop uses aktionis. ("since 2006" is also **UNVERIFIED**.) Live on /about. |
| 2 | `en.json:130`, `de.json:130` (`footer.source`) | "Data from aktionis.ch" / "Daten von aktionis.ch" | Same — on every page (`Footer.tsx:8`). |
| 3 | `en.json:58`, `de.json:58` (`methodology.step1_d`) | "from aktionis.ch" / "von aktionis.ch" | Same — home page "How it works" strip (`MethodologyStrip.tsx`, rendered at `page.tsx:63`). |
| 4 | `en.json:20`, `de.json:20` (`about.data_sources.note`) | "…No scraping of protected websites. Deal data is refreshed weekly." | "refreshed weekly": runs Mon/Tue/Thu. "No scraping": basketch does collect automatically from public pages/flyers; what is true is that it never circumvents a block. Wording should not deny automated collection. |
| 5 | `en.json:30`, `de.json:30` (`about.privacy.bullet3`) | "Email is optional and only used to find your list." | No e-mail feature is live; the list is stored only in the browser. |
| 6 | `en.json:14`, `de.json:14` (`about.how_it_works.step3`) | "…or track your regular items for a personal comparison." | "Track regular items" is not live (V3 preview unrendered). The list is a one-off pick of this week's deals. |
| 7 | `en.json:13`, `de.json:13` (`about.how_it_works.step2`) | "We categorise every deal into Fresh, Long-life, or Household and calculate a weekly verdict." | Incomplete rather than false: categorisation is AI (Gemini + judge); disputed ones are marked unverified and do not count; not-yet-classified products are held back. "Every deal" overstates. |
| 8 | `en.json:12`, `de.json:12` (`about.how_it_works.step1`) | "Every week we fetch the latest promotions…" | Several times a week; otherwise accurate. Low priority. |
| 9 | `en.json:59-60`, `de.json:59-60` (`methodology.step2_t/_d`) | "Normalised prices — per L, kg, piece" | Per-unit price is shown on cards where available but is **not** used for winners (step 3 is by average % off). Presenting it as step 2 of the method implies it feeds the result. |
| 10 | `en.json:244`, `de.json:244` (`share_verdict.share_text`) | "This week's deals at Migros vs Coop, side by side." | Seven retailers, not two. Sent in every share (`ShareVerdictButton.tsx:35`). |
| 11 | `en.json:73`, `de.json:73` (`deals.cheapest`) | "Cheapest" | Tag goes to the highest **discount %** in the sub-category, not the lowest price (§3c). Flag for PM; not a data-source string but a factual-accuracy one. |
| 12 | `en.json:34`, `de.json:34` (`about.contact.body`) | "…Reach us at hello@basketch.app." | Site runs on basketch.vercel.app; whether `hello@basketch.app` exists and receives mail is **UNVERIFIED**. |

Not live (not routed / not rendered) but stale — fix when those locales/components ship:
- `messages/fr.json:13` "Données de aktionis.ch"; `messages/it.json:13` "Dati da aktionis.ch" (FR/IT not routed).
- `en.json/de.json` `availability.c_body` (line 187: "{store}'s online flyer doesn't always list it") and `variant_picker.no_match_helper` (line 147: "…in your region") — rendered only by the unrendered V3 preview; "in your region" contradicts the no-regional-pricing finding.

Accurate as-is (verified): `about.intro` (seven stores, wins by category), `about.data_sources.stores_label`, `about.what_we_compare.body` (promotions, not shelf prices), `about.privacy.bullet1` (no account), `about.privacy.bullet2` (no tracking cookies — the only cookie is the functional locale cookie), `footer.disclaimer` (not affiliated — a PM fact, not code-verifiable), `layout.tsx:33-38` and `deals/page.tsx:22-24` metadata (seven stores, no source named).

### 5b. Internal comments / fields — tech debt (list only; do not remove here)

| File:line | What | Why stale |
|---|---|---|
| `web-next/src/lib/v3-types.ts:20, 27-33` | `aktionisSlug` field on `StoreMeta` | No frontend code reads it; only Coop uses aktionis and that happens in the pipeline |
| `shared/types.ts:18, 35-41, 49-58` | `aktionisSlug`, `AKTIONIS_STORE_SLUGS`, `aktionisSlugToStore` ("Stores to scrape from aktionis.ch") | Legacy multi-store aktionis scraper, retired |
| `shared/types.ts:481, 489` | "PACK SIZE … from aktionis", "emitted by aktionis Python scraper (see aktionis/normalize.py)" | `pipeline/aktionis/` no longer exists |
| `web-next/src/server/data/provider.contract.ts:4` | "aktionis.ch is a pipeline-only input." | Implies the whole pipeline input is aktionis |
| `web-next/src/lib/domain/validity.ts:6` | "while every deal came from aktionis.ch" | Historical, accurate as history; fine to keep |
| `web-next/next.config.ts` remotePatterns `aktionis.ch` | Host entry | Coop images are on `storage.cpstatic.ch`; whether anything still serves from `aktionis.ch` host is **UNVERIFIED** |
| `web-next/src/components/deals/DealCard.tsx:35-39` | "Aldi, Spar and Migros … set sourceUrl to null deliberately" | Adapters now set `sourceUrl` to the flyer URL (`spar-flyer-source.ts:159`, `aldi-flyer-source.ts:195`, `migros-flyer-source.ts:894`) |
| `pipeline/grocery-filter.ts:13, 35` | "Source: … aktionis.ch non-food categories"; "aktionis.ch typically emits sourceCategory=null" | Source no longer aktionis for LIDL |
| `pipeline/resolve-taxonomy.ts:21` | `SOURCE = 'aktionis-internal'` | Label names a retired source |
| `CLAUDE.md:7` | "aktionis.ch is dropped, offers come direct from each retailer" | False for Coop (see §1a); contradicts `collection-module-design.md` decision of 2026-09-09 |
| `CLAUDE.md:44` | "Planned: collection module" | Collection module is built and live |
| `docs/collection-module-design.md` "BUILD STATUS 2026-09-09" | "Nothing runs on a schedule yet"; Spar/Aldi/Lidl/Migros "Not built"; "Denner's categories scored every run" | All seven are live since the 2026-09-11 cutover; benchmark not wired |
| `.claude/agents/architect.md` "Context" | "Migros (TypeScript) and Coop (Python)", "React + Vite", "CHF 0/month" | Next.js 16; seven TS adapters; USD 5/month OpenRouter cap approved 2026-09-15 |

---

## 6. UNVERIFIED — must not be published

1. aktionis.ch "since 2006".
2. `hello@basketch.app` is a working mailbox.
3. Whether any Coop (Supercard) or Migros (Cumulus) member-only prices are in the data unlabelled.
4. Current share of Volg products with an image (research: 16/23; W39 not measured).
5. Coverage of per-unit prices across deals.
6. Whether Vercel Web Analytics or log retention is enabled in the Vercel dashboard.
7. Exact accuracy of categorisation (no benchmark is wired — no accuracy figure may be quoted).
8. "Most retailers run Thursday–Wednesday" as a guarantee — observed pattern only.
9. Whether aktionis.ch's own data is complete for Coop this week (measured ~1,006 in Sept research; W39 collected 1,018 — no fresh independent check).
