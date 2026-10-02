# Competitive Analysis: basketch

**Author:** Kiran Dommalapati
**Date:** 2 October 2026
**Version:** 2.0 (supersedes v1.0, 10 April 2026; changes are listed in Appendix A)

> How to read this document. Every statement about a competitor carries a source tag in square brackets, for example [S5]. Sources are listed in section 8; all web pages were accessed on 2 October 2026. Where something could not be confirmed, the text says **"not verified"** (abbreviated "n/v" in tables). Statements taken from a company's own pages are written as "according to <company>". This is a desk review: no competitor app was installed or tested.

---

## 1. Executive Summary

**Count and counting rule.** This analysis covers **13 tools: 6 in Switzerland and 7 international.**

The rule: a tool is counted once if it is a consumer product for finding grocery offers, comparing grocery prices or managing grocery lists, and its own pages could be checked on 2 October 2026. A tool is counted under the market where it matters to basketch (Preisrunter is counted once, under Switzerland, as an announced entrant that has not yet launched there; its Austrian and German operation is noted in its entry). Tools I checked and excluded are listed in Appendix A.2 with the reason, so the count can be traced to the sections below. Swiss: Rappn, Aktionis, Profital, Bring!, Preispirat, Preisrunter. International: Trolley, Shopsplit, marktguru, kaufDA, WiseList, Flipp, Grocery Dealz.

**The Swiss market.** Swiss grocery-deal tools fall into five groups: deal aggregators (Aktionis, Rappn), a digital-flyer app (Profital), a shopping-list app that shows offers (Bring!), a community deals site where groceries are one category (Preispirat), and an announced price-comparison entrant (Preisrunter). Two general price-comparison sites, Toppreise and Preisvergleich.ch, do not cover groceries and are excluded.

**The biggest change since April is Rappn.** According to its own site it is a free app and website that compares weekly offers from seven Swiss chains, with shared lists and price alerts, and with no account needed for comparison on the web or in the app [S5, S6, S7]. It overlaps with basketch more than any other Swiss tool: the same core question (where is it cheaper this week), free access without an account, and a shopping list.

**What basketch ships today** [S1, S2, S3, S4]:

- Weekly deals from seven retailers side by side: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg.
- A comparison by category (which store has the larger average discount).
- A shopping list grouped by store with an estimated total, shareable by link, WhatsApp or email, with minimum-quantity and not-yet-started prices labelled in the shared message text (member-only labelling is built, but no current source produces member-only prices; when a recipient opens a shared link, the minimum-quantity label is not yet carried over).
- Free, no app, no account, German and English. The list is kept only in the browser.
- Weekly promotions only, not regular shelf prices (stated on the About page).

**What basketch does not do today.** It does not route each item to its cheapest store (PM decision P-8, 25 September 2026, keeps the category comparison). The "Cheapest" tag on deal cards currently marks the biggest percentage discount, not the lowest price; the decision to change it (P-7) is not yet shipped, so the tag is not used as a claim here. The list summary currently uses the word "cheapest" ("Your item is cheapest here", "Your N items split best across N stores"). That overstates what the list does: it groups the deals a user has chosen by store and does not compare prices. The wording is being corrected.

**Where Rappn is ahead, according to its own pages:** native apps, four languages, price alerts, a loyalty-card wallet and receipt scanning [S5]. Rappn's marketing page also says its shopping list shows "where to buy them cheapest" [S8]; its FAQ does not describe such a feature [S10]. Whether Rappn routes items to the cheapest store is **not verified** (not tested hands-on).

---

## 2. Swiss Market

### 2.1 Rappn

| Attribute | Detail |
|---|---|
| **URL** | [rappn.ch](https://rappn.ch/en) |
| **Status** | Live and actively updated (blog article dated 17 April 2026, updated 28 September 2026) [S9] |
| **What they do** | According to Rappn: "a search engine for Swiss supermarket deals" [S8] |
| **Retailers** | Migros, Coop, Aldi, Lidl, Denner, Aligro, Otto's (7). SPAR and Volg are not listed in the pages reviewed [S5, S6] |
| **Core features (per Rappn)** | Live offer comparison with unit prices; filters by product, category, canton and price; shared shopping lists with real-time sync; price alerts; favourite products; receipt scanning; loyalty-card wallet; recipes [S5, S7, S8] |
| **Shopping list** | Rappn's page says the list shows the deals already in it so you see "where to buy them cheapest" [S8]. The FAQ does not describe automatic cheapest-store recommendation [S10]. Not tested hands-on |
| **Business model** | Free, no subscription [S10]. According to Rappn's home page, it is owned by no supermarket and sells no groceries and no user data [S5]. Its FAQ says it does not sell personal data and that it shares aggregated, anonymised insights ("aggregierte, anonymisierte Erkenntnisse") with retailers or partners [S10]. How the company is funded is not stated in the pages reviewed |
| **Platform** | iOS, Android and web. Comparison is usable without an account on the web and in the app [S5, S7] |
| **Languages** | German, French, Italian, English [S5] |
| **Data source (per Rappn)** | FAQ: prices come from "öffentlichen Prospekten und Händlerquellen" (public brochures and retailer sources); it shows currently active offers, not the full base-price catalogue [S10] |
| **Company** | Rappn GmbH, Zug; registered 7 April 2026 according to the commercial-register listing on Moneyhouse [S11] |
| **Ratings** | According to Rappn's site: 4.4/5 on the App Store (10 ratings) and 4.8/5 on Google Play (15 ratings), as of September 2026 [S5]. Very small samples; not checked against the stores |
| **Relevance to basketch** | **High.** Closest Swiss tool in scope and audience. Verifiable differences are in section 4.2 |

### 2.2 Aktionis

| Attribute | Detail |
|---|---|
| **URL** | [aktionis.ch](https://www.aktionis.ch/) |
| **Status** | Live. Operated by CouponPlus AG (per site footer) [S12] |
| **What they do** | Aggregator of Swiss retail promotions: "aktuell, übersichtlich, neutral" [S12] |
| **Retailers listed** | Migros, Coop, Denner, LIDL, SPAR, ALDI Suisse, Volg, OTTO'S [S12] |
| **Features** | Browse by category and location with radius filter; Merkliste (watchlist); "Aktionis Alarm" (email alert on matching offers); newsletter [S12, S13] |
| **Platform** | Web only. The Aktionis app was discontinued in June 2021 [S13] |
| **Business model** | Retailer advertising and media sales (link "Werbung / Mediadaten" on the site) [S12] |
| **Cross-store price comparison** | Lists offers; no side-by-side price comparison of the same product found on the page reviewed [S12] |
| **Relationship to basketch** | Competitor and upstream data source: basketch collects Coop offers via aktionis.ch [S1] |
| **Relevance to basketch** | Medium. Longest-running Swiss tool; browsing-oriented |

### 2.3 Profital (Bring! Labs)

| Attribute | Detail |
|---|---|
| **URL** | [profital.ch](https://www.profital.ch/en) |
| **Status** | Live [S14] |
| **What they do** | Digital brochure app: "over 40,000 deals across 170+ brochures" from 100+ Swiss retailers [S14] |
| **Retailers named on site** | Partner list names Migros, Denner, Lidl, Spar, Aligro, Otto's, Manor, Bauhaus, Decathlon, Dosenbach, Qualipet and others. Coop is not in the partner list [S14] |
| **Features** | Location-based deals, bookmarks, links to retailer online shops, personalised push notifications [S14] |
| **Platform** | iOS, Android [S14] |
| **Ownership** | Operated by Bring! Labs AG; "over 20 million registered users worldwide" across Profital and Bring! combined (company statement) [S14] |
| **Business model** | According to Profital's business site, retailers publish brochures on a cost-per-click model and pay only when a user clicks on and reads a brochure [S15] |
| **Cross-store price comparison** | None found; shows brochures per retailer |
| **Relevance to basketch** | Medium-High (strategic). Large user base and many retailer brochures. Whether it plans comparison features: **not verified** |

### 2.4 Bring!

| Attribute | Detail |
|---|---|
| **URL** | [getbring.com](https://www.getbring.com/en/home) |
| **Status** | Live [S16] |
| **What they do** | Shared shopping-list app, recipes, voice assistants, Apple Watch [S16] |
| **Offers** | Local offers from digital brochures appear inside the app, and offers can be added to the list [S16, S15] |
| **Users** | "20 million users" (company statement) [S16]. Swiss subset: **not verified** |
| **Pricing** | The site says core functions, including lists and offers, are free of charge [S16] |
| **Cross-store price comparison** | Not found |
| **Relevance to basketch** | Medium (platform). Many shoppers already keep lists here; it shows offers but I found no price comparison |

### 2.5 Preispirat

| Attribute | Detail |
|---|---|
| **URL** | [preispirat.ch](https://www.preispirat.ch/) |
| **Status** | Live [S19] |
| **What they do** | Community-voted deals and coupons; editors review about 300 offers a day (per site); groceries are one category (examples seen: Coop, Jumbo) [S19] |
| **Platform** | Web, iOS, Android [S19] |
| **Company** | Preispirat GmbH, Lucerne, subsidiary of Patoc GmbH [S19] |
| **Relevance to basketch** | Low. General deals; no weekly grocery comparison |

### 2.6 Preisrunter

| Attribute | Detail |
|---|---|
| **URL** | [preisrunter.ch](https://preisrunter.ch/) |
| **Status in Switzerland** | **Not yet launched.** The Swiss site is a pre-launch page with a sign-up for notification [S17] |
| **Elsewhere** | Operates in Austria and Germany; "over 100,000 users" (company claim); iOS and Android apps listed in the Austrian stores [S17, S18] |
| **What they do** | Grocery price comparison across supermarkets |
| **Retailers named for Switzerland** | Migros, Coop, Aldi, Lidl, Denner "und viele mehr" (and many more) [S17] |
| **Relevance to basketch** | Medium (watch). A Swiss launch would add another multi-chain comparison. Launch date: not verified |

### 2.7 Swiss feature matrix

Competitor cells state what the sources show; "n/v" = not verified. basketch cells state what ships today [S1, S2, S3, S4].

| Feature | **basketch** | **Rappn** | **Aktionis** | **Profital** | **Bring!** | **Preisrunter (CH)** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Live in Switzerland | Yes | Yes | Yes | Yes | Yes | No (pre-launch) |
| Retailers | 7 (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg) | 7 (Migros, Coop, Aldi, Lidl, Denner, Aligro, Otto's) | 8 listed (incl. SPAR, Volg, Otto's) | 100+ (brochures) | via Profital | 5 named, "and many more" |
| Compares offers across stores | Yes | Yes | Lists offers; no comparison found | No (brochures) | No | n/v |
| Shopping list | Yes (in browser, grouped by store, estimated total) | Yes (shared, synced) | Merkliste (watchlist) | Bookmarks | Yes (core product) | n/v |
| Per-item cheapest-store routing | No (not built, P-8) | Per Rappn's page, shows where to buy cheapest [S8]; n/v | No | No | No | n/v |
| Shareable list | Yes (link, WhatsApp, email) | Yes (shared, real-time) | n/v | n/v | Yes | n/v |
| Account required | No | No for comparison (web and app) [S7] | No for browsing; a register page exists | n/v | n/v | n/a |
| Native app | No | iOS, Android | No (discontinued 2021) | iOS, Android | iOS, Android | n/v (AT apps exist) |
| Languages | DE, EN | DE, FR, IT, EN | n/v | n/v | n/v | n/v |
| Price alerts | No | Yes | Yes (email alarm) | Push notifications about offers | n/v (price alerts not found) | n/v |
| Loyalty-card wallet, receipt scan | No | Yes | No | n/v | n/v | n/v |
| Price history | No | n/v | No | No | No | n/v |
| Regular (non-promo) prices | No (promotions only) | No (active offers only) [S10] | No | No | No | n/v |

---

## 3. International Benchmarks

References for UX and concepts only; none operates in Switzerland. Figures are company claims unless stated.

| Tool | Status and what it offers now | Source |
|---|---|---|
| **Trolley** (UK, trolley.co.uk) | Live. Compares prices across "14+ stores"; shopping lists, including "organising your shopping list by where's cheapest"; deal highlights; apps. About page claims "helped 3m+ families" and "500,000 people monthly" | [S22] |
| **Shopsplit** (UK, shopsplit.uk) | Live. AI list-splitting across 6 UK supermarkets; free to start; iOS and Android apps live; web version "being rebuilt". Catalogue stated as 220,000+ products on its home page and 180,000+ on another page. Says splitting across 2 shops captures "approx 80%" of savings and 3 shops about 95%; no method published | [S23, S24] |
| **marktguru** (DE/AT, marktguru.de) | Live. Digital flyers, offer search, cashback, apps for iOS, Android, Huawei; operated by marktguru Deutschland GmbH | [S25] |
| **kaufDA** (DE, kaufda.de) | Live. Digital flyers, shareable shopping lists, store finder; the site mentions comparing food prices across supermarkets; rating 4.5/5 per site; operated by Bonial International GmbH | [S26] |
| **WiseList** (AU, wiselist.app) | Live. Prices a list at Coles, Woolworths and ALDI; "Split by Store" is a premium feature; WiseList+ at AUD 7.99/month or 49.99/year; "400,000+ Australians signed up"; 4.4 stars from about 1,800 App Store reviews | [S27] |
| **Flipp** (US/CA, flipp.com) | Live. Digital flyers, coupon clipping to loyalty cards, shared lists; partners with "over 2,000 stores" | [S28] |
| **Grocery Dealz** (US) | Live. App with real-time prices from Walmart, Target, Kroger, Albertsons and others, lists and Instacart checkout; expanded nationally in early 2026 | [S29] |

---

## 4. basketch position, factual

### 4.1 What basketch ships today (first-party facts) [S1, S2, S3, S4]

- Free web app at basketch.vercel.app; no app, no account; German and English.
- Weekly promotions from seven retailers: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg. Six are read directly from the retailer's flyer or site; Coop via aktionis.ch because coop.ch blocks automated access (stated on the About page).
- A homepage comparison by category (which store has the larger average percent off), a deals page with weekly deals side by side, and a list grouped by store with per-store estimated totals.
- The "Cheapest" tag on deal cards currently means the biggest percentage discount, not the lowest price. Changing it to lowest price is decided (P-7) but not shipped.
- No per-item cheapest-store routing; PM decision P-8 keeps the category comparison.
- The list is shared by link, WhatsApp or email; the shared message text says which prices need a minimum quantity or have not started yet (member-only labelling is built for when a source provides such prices).
- The list is stored only in the browser, not on a server. No tracking cookies.
- Not shipped: per-item routing, price history, push or email alerts, weekly email, native app, accounts, French and Italian.

### 4.2 Verifiable differences from Rappn, the closest competitor

| Point | basketch | Rappn (per its own pages) |
|---|---|---|
| Retailer set | includes SPAR, Volg | includes Aligro, Otto's [S5] |
| Languages | DE, EN | DE, FR, IT, EN [S5] |
| App | none | iOS, Android, web [S5] |
| Account | none | none needed for comparison [S7] |
| Alerts, wallet, receipt scan | none | yes [S5] |
| Labelling of conditional prices (minimum quantity, not yet started) in the shared message | yes (basketch code) | n/v |
| Per-item cheapest-store routing | no (P-8) | per its page, shows where to buy cheapest [S8]; n/v |
| Data sources | direct from retailers; Coop via aktionis.ch; explained on the About page | "public brochures and retailer sources" [S10] |

On feature breadth Rappn is ahead of basketch today. The points where basketch differs are its retailer set, its explicit price-label rules and its description of data sources. SPAR and Volg are also listed by Aktionis [S12], and Profital's partner list names Spar [S14], so the retailer set differentiates basketch from Rappn only. Whether these differences matter to users has **not been tested**; no user research sits behind them in this document.

### 4.3 Where competitors are ahead (supported by sources)

| Area | Evidence |
|---|---|
| Native apps and notifications | Rappn, Profital and Bring! offer iOS and Android apps; Rappn and Aktionis offer alerts [S5, S14, S16, S12] |
| Reach | Bring! Labs claims 20 million registered users worldwide across Bring! and Profital [S14, S16] |
| Languages | Rappn: 4 [S5] |
| Extra tools | Rappn: loyalty wallet and receipt scanning [S5] |
| Breadth of retailer brochures | Profital: 100+ retailers [S14] |
| Cashback (international) | marktguru [S25] |

### 4.4 What basketch is, in one factual sentence

basketch is a free web page that shows this week's promotions from seven Swiss supermarkets side by side, compares them by category, and lets you build a shopping list grouped by store with an estimated total that you can share. No app and no account.

This sentence describes what ships. It makes no claim of uniqueness, because Rappn's pages describe overlapping features.

---

## 5. Observations from the evidence

### 5.1 Possible openings

| Observation | Evidence |
|---|---|
| SPAR and Volg are listed by Aktionis but not by Rappn | [S5, S12] |
| Splitting a list across stores is appearing in other markets (basketch does not do this per item today) | Shopsplit, WiseList (premium), Trolley [S22, S23, S27] |
| Shopsplit's own data suggests most savings come from two or three stores | "approx 80%" and about 95% (company claim, no method) [S24] |

### 5.2 Risks

| Risk | Evidence |
|---|---|
| Rappn overlaps in scope, is actively published, and has more features and platforms | [S5, S7, S9] |
| Preisrunter may launch in Switzerland | Pre-launch page, no date [S17] |
| Bring! and Profital have users, many retailer brochures and an offers section inside the list app | [S14, S15, S16] |
| Data access: Coop is collected via aktionis.ch because coop.ch blocks automated access | [S2] |
| Swiss market size | Not quantified in this document |

---

## 6. My positioning

**1. A personal shopping list, not a generic list of offers.** Many tools in this space are built around showing the full set of weekly promotions and leave the shopper to work through them. basketch is built the other way round: from the things you want to buy to a short list of where to buy them this week. User experience is the core of the product: no app, no account, and a list grouped by store that can be forwarded in one tap. Today you pick deals into that list; deeper personalisation is the direction.

**2. Per-item routing is deferred on purpose.** In September 2026 I decided to keep the per-category comparison and not to build per-item cheapest-store routing for now (P-8).

**3. All seven chains, including SPAR and Volg.** basketch covers Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg. SPAR and Volg are not in Rappn's retailer list [S5].

**4. Response to Rappn.** Rappn is the closest Swiss tool and is ahead on native apps, languages and extra features (section 2). I am not trying to match its feature list. basketch competes on a simpler, more personal experience and on chain coverage, and it is built on an AI pipeline: each deal is categorised by a language model and checked by a second model acting as judge (see the technical architecture).

---

## 7. Key takeaways (evidence only)

1. The Swiss space now has a live, free, multi-chain comparison with lists and alerts, usable without an account: Rappn.
2. basketch's shipped differences from Rappn are its retailer set (SPAR, Volg), explicit labelling of conditional prices in the shared message, a category comparison, and a browser-only list with no account. Their value to users is untested.
3. Rappn is ahead on apps, languages, alerts and wallet features.
4. Per-item routing is not shipped in basketch; whether Rappn offers it is not verified.
5. Preisrunter is an announced second entrant with no Swiss launch date found.
6. Aktionis is web only; its app was discontinued in 2021.

---

## 8. Sources

All web pages accessed 2 October 2026.

**basketch (first-party)**
- [S1] basketch repository: the product code (`web-next/`, `pipeline/`), the decision log (`docs/decisions/`) and the data-source note in `CLAUDE.md` (Coop via aktionis.ch), state of 2 October 2026
- [S2] basketch About page copy, `web-next/src/messages/en.json` (sections about, privacy, data_sources)
- [S3] basketch list and share code: `web-next/src/components/list/ListDrawer.tsx`, `web-next/src/lib/share.ts`, `web-next/src/i18n/routing.ts`; live site https://basketch.vercel.app returned HTTP 200
- [S4] PM decisions P-7, P-8, P-10, `docs/decisions/2026-09-25-pm-decisions.md`

**Rappn**
- [S5] https://rappn.ch/en
- [S6] https://rappn.ch/en/price-comparison
- [S7] https://rappn.ch/en/compare-deals ("without an account on the web and in the Rappn app")
- [S8] https://rappn.ch/en/grocery-price-comparison-app-switzerland (page dated September 2026; list shows "where to buy them cheapest")
- [S9] https://rappn.ch/en/blog/switzerland-grocery-price-comparison-2026 (dated 17 April 2026, updated 28 September 2026)
- [S10] https://rappn.ch/de/faq
- [S11] Commercial-register listing, Moneyhouse: https://www.moneyhouse.ch/de/company/rappn-gmbh-13506754721 (registration 7 April 2026, Zug; accessed 2 October 2026)

**Other Swiss**
- [S12] https://www.aktionis.ch/
- [S13] https://www.aktionis.ch/specials/die-aktionis-app-wurde-eingestellt (published 10 June 2021)
- [S14] https://www.profital.ch/en
- [S15] https://business.profital.ch/en/offer/digital-brochure (retailer advertising offer; seen via search listing, direct fetch failed with a certificate error)
- [S16] https://www.getbring.com/en/home
- [S17] https://preisrunter.ch/
- [S18] Store listings for Preisrunter: https://apps.apple.com/at/app/preisrunter/id6752957290 and Google Play (at.preisrunter), seen as search listings
- [S19] https://www.preispirat.ch/
- [S20] https://www.toppreise.ch/en (checked for exclusion, Appendix A.2)
- [S21] https://www.preisvergleich.ch/ (checked for exclusion, Appendix A.2)

**International**
- [S22] https://www.trolley.co.uk/ and https://www.trolley.co.uk/about/
- [S23] https://shopsplit.uk/
- [S24] https://shopsplit.uk/split-supermarket-shopping/ ("Approx 80% of available savings captured splitting across 2 shops")
- [S25] https://www.marktguru.de/
- [S26] https://www.kaufda.de/
- [S27] https://www.wiselist.app/
- [S28] https://flipp.com/
- [S29] https://apps.apple.com/us/app/grocery-dealz-compare-prices/id6478849172 and https://omnitalk.blog/2026/02/24/grocery-dealz-is-going-national-and-retailers-should-be-paying-close-attention-spotlight-series/ (seen as search listings)

**Limits of this review.** Web pages were summarised by an automated fetch tool, not read in a browser. Figures quoted as "company claim" were not checked independently. No competitor app was installed or tested. The search tool covers the web as seen from the US and may miss Swiss-only sources. The absence of other Swiss entrants in a few searches is not proof that none exist.

---

## Appendix A. What changed since v1.0 (10 April 2026)

### A.1 Changes and corrections

1. **The product changed.** v1.0 described an email-only, two-store (Migros, Coop) product with a "starter pack". That is obsolete; see section 4.1. v1.0 also framed basketch as answering "which of MY products are cheaper where"; because per-item routing is not built (P-8), that framing was removed.
2. **Rappn changed.** v1.0: 5 retailers, an app. Now, according to its own site: 7 retailers, web and app, no account needed for comparison, shared lists, alerts, wallet, receipt scanning, four languages. The v1.0 claims that no Swiss tool does what basketch does, and that basketch is unique, were removed.
3. **Aktionis:** v1.0 listed an Android app. The app was discontinued in June 2021 [S13].
4. **Shopsplit:** v1.0 quoted "2 stores capture 90% of savings". Its own page says "approx 80%" for two shops, with no method given [S24].
5. **kaufDA:** v1.0 said Axel Springer owns it and that it has no price comparison. Its site names Bonial International GmbH as operator and mentions comparing food prices; the Axel Springer link is not verified [S26].
6. **Preisrunter:** v1.0 treated it as a live Swiss comparison. The Swiss site is a pre-launch page [S17].
7. **Figures dropped because they could not be re-verified:** Profital "450,000 monthly users", Bring! "3.2M DACH users", Aktionis "~100,000 monthly users", the Migros plus Coop "about 70% market share", "3.9 million households", marktguru "8.5M downloads", kaufDA "14M downloads", Similarweb rankings. Figures that changed: Trolley now "14+ stores" (v1.0: 16), WiseList "400,000+" (v1.0: 280,000), Flipp "over 2,000 stores" (v1.0: 1,000+).
8. **Parked features are no longer claimed:** price history, weekly verdict email, starter pack, push or email alerts.

### A.2 Counting reconciliation

v1.0 contained 19 entries when counted (its text said 18). v2.0 counts 13; the other 6 were checked and excluded:

| v1.0 entry | Reason excluded from the count |
|---|---|
| Toppreise.ch | Own site shows it does not cover groceries [S20] |
| Preisvergleich.ch | Own site shows it covers electronics and household appliances, not groceries [S21] |
| Alertr (UK) | Site could not be reached from the review environment; not verified |
| Basket (US) | Site shows a 2023 copyright line; current activity not verified |
| smhaggle (DE) | Site could not be reached from the review environment; current status not verified |
| Latest Deals (UK) | Site returned HTTP 403 to the review tool; not verified |

No confirmed closures. One announced entrant has not yet launched in Switzerland (Preisrunter). No new Swiss entrants were found other than Rappn (already in v1.0) and the Preisrunter pre-launch page.
