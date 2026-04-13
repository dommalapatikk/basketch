# Competitive Analysis: basketch

**Author:** Kiran Dommalapati
**Date:** 10 April 2026
**Version:** 1.0

---

## 1. Executive Summary

The grocery deal comparison space is fragmented across deal aggregators (Aktionis, Rappn), digital flyer platforms (Profital, kaufDA), shopping list utilities (Bring!), and general price comparison sites (Toppreise, Preisvergleich). In Switzerland, no tool combines personal favorites with cross-store price comparison and a split shopping list output. Most competitors are deal-first: they surface thousands of promotions and let the user hunt. basketch is person-first: it starts with what the user already buys and tells them where it is cheaper this week. This is a fundamentally different question -- "What deals exist?" vs. "Which of MY products are cheaper where?" -- and no Swiss competitor currently answers the second one. Internationally, Trolley (UK) and WiseList (Australia) come closest to a basket-level comparison, but neither offers the zero-friction, no-app, email-only onboarding that basketch targets. The opportunity is real, but the window is narrow: competitors with large user bases (Bring!, Profital) could add personalization features, and data-source access remains a structural risk.

---

## 2. Swiss Market

### 2.1 Rappn

| Attribute | Detail |
|---|---|
| **URL** | [rappn.ch](https://rappn.ch/en) |
| **What they do** | Grocery price comparison across 5 Swiss retailers: Migros, Coop, Denner, Aldi, Lidl |
| **Core feature** | Search and compare 10,000+ real-time offers; unit price comparison; price alerts |
| **Business model** | Free app (likely ad-supported / affiliate) |
| **Platform** | iOS app, Android app, web |
| **Personalization** | Favourite alerts (get notified when tracked items go on offer); shared grocery lists |
| **Cross-store comparison** | Yes -- compares offers across all 5 retailers |
| **Traffic / downloads** | Not publicly disclosed; app available on both stores |
| **App rating** | Not confirmed from public sources |
| **Year founded** | Estimated 2023-2024 (based on site copy referencing "2025") |
| **Key strength** | Broadest Swiss grocery coverage (5 stores); unit price comparison; multi-language (DE/FR/IT/EN) |
| **Key weakness** | Deal-first, not person-first; requires app download; no split shopping list; no "weekly verdict" concept |
| **Threat to basketch** | **High.** Closest Swiss competitor in feature set. If they add favourites-first ranking and a split list, they cover much of basketch's value proposition. |

### 2.2 Aktionis

| Attribute | Detail |
|---|---|
| **URL** | [aktionis.ch](https://www.aktionis.ch/) |
| **What they do** | Deal aggregator collecting promotions from Swiss supermarkets since 2006 |
| **Core feature** | Central directory of all current promotions; Aktionis Alarm (email/push when a product goes on offer); weekly newsletter |
| **Business model** | Free; B2B advertising (retailers pay for placement via [business.aktionis.ch](https://business.aktionis.ch/)) |
| **Platform** | Web, Android app |
| **Personalization** | Aktionis Alarm per product; digital wishlist; favourite stores |
| **Cross-store comparison** | Shows offers from Migros, Coop, Spar, Volg, Lidl, Aldi, Denner -- but does not compare prices side-by-side for the same product |
| **Traffic / downloads** | ~100,000+ monthly users (reported by Aktionis); estimated ~94K monthly visits (as referenced in brief) |
| **App rating** | Not widely rated on app stores |
| **Year founded** | 2006 (20 years in market) |
| **Key strength** | Longevity and trust; broadest retailer coverage (7+ stores including regional Migros cooperatives); weekly newsletter habit |
| **Key weakness** | Dated UI; deal-first browsing (no personalized ranking); no split shopping list; no side-by-side price comparison |
| **Threat to basketch** | **Medium.** Established user base but different value proposition. They aggregate deals; basketch compares prices for your products. |

### 2.3 Profital (by Bring! Labs / Swiss Post)

| Attribute | Detail |
|---|---|
| **URL** | [profital.ch](https://www.profital.ch/en) |
| **What they do** | Digital flyers app -- digitizes paper brochures from 100+ Swiss retailers |
| **Core feature** | Browse digital leaflets; location-based offers; store info (hours, addresses) |
| **Business model** | B2B (retailers pay for digital brochure distribution); free for consumers |
| **Platform** | iOS app, Android app, web |
| **Personalization** | Favourite stores with push notifications for new offers; category preferences |
| **Cross-store comparison** | No -- shows individual retailer flyers, not side-by-side comparison |
| **Traffic / downloads** | 1 million+ app downloads (reported by Profital, as of 2021); 500K+ on Google Play; ~450,000 monthly active Swiss consumers (reported by Bring! Labs) |
| **App rating** | 4.4 stars on Google Play (5,700+ ratings) |
| **Year founded** | 2017 (as Swiss Post corporate startup); merged into Bring! Labs 2021 |
| **Key strength** | Massive reach via Swiss Post backing; 100+ retailer partners; integrated with Bring! shopping list ecosystem; trusted brand |
| **Key weakness** | Flyer-first (replaces paper, doesn't compare); no cross-store price comparison; no personal product tracking; overwhelming volume of offers |
| **Threat to basketch** | **High (strategic).** Profital + Bring! together have the data, user base, and resources to build what basketch does. The question is whether they will -- their business model (selling ad space to retailers) may conflict with transparent price comparison. |

### 2.4 Bring!

| Attribute | Detail |
|---|---|
| **URL** | [getbring.com](https://www.getbring.com/en/home) |
| **What they do** | Shopping list app with real-time sync, recipe integration, and retailer partnerships |
| **Core feature** | Shared shopping lists; recipe-to-list conversion; loyalty card storage; multi-device sync |
| **Business model** | Freemium -- free tier + Bring! Premium ($1.99/month or $8.99/year); B2B advertising and data partnerships |
| **Platform** | iOS, Android, Apple Watch, Wear OS, Alexa, Google Assistant, web |
| **Personalization** | Lists organized by store layout; frequently bought items surface first; custom categories |
| **Cross-store comparison** | No -- organizes your list, does not compare prices across stores |
| **Traffic / downloads** | 10M+ downloads on Google Play; 20M+ users globally (reported); 3.2M users in DACH region |
| **App rating** | 4.3 stars on Google Play (~140K ratings); 4.2 stars on iOS (~139K ratings) |
| **Year founded** | 2015 (Bring! Labs AG, Zurich); majority acquired by Swiss Post 2021 |
| **Key strength** | Dominant shopping list app in Switzerland; deep platform integration (voice assistants, wearables); massive user base; owned by Swiss Post |
| **Key weakness** | Not a deal or price tool -- purely a list utility; no price data; no cross-store comparison |
| **Threat to basketch** | **Medium-High (platform risk).** Bring! is where Swiss shoppers already manage their lists. If Bring! adds price comparison (they have Profital data), they could make basketch redundant. However, adding comparison would conflict with their retailer ad model. |

### 2.5 Preisvergleich.ch

| Attribute | Detail |
|---|---|
| **URL** | [preisvergleich.ch](https://www.preisvergleich.ch/) |
| **What they do** | General product price comparison across Swiss online retailers |
| **Core feature** | Search any product, see prices from hundreds of verified online shops |
| **Business model** | Free; affiliate/CPC (retailers pay per click-through) |
| **Platform** | Web |
| **Personalization** | None meaningful for groceries |
| **Cross-store comparison** | Yes, but for electronics/appliances/non-grocery -- not fresh groceries |
| **Traffic / downloads** | Not publicly disclosed; ranked outside top 5 Swiss comparison sites |
| **Year founded** | Estimated early 2000s |
| **Key strength** | Broad product database for non-grocery items |
| **Key weakness** | Not a grocery tool; no weekly deal tracking; no personalization |
| **Threat to basketch** | **Low.** Different category entirely. No overlap with grocery deal comparison. |

### 2.6 Toppreise.ch

| Attribute | Detail |
|---|---|
| **URL** | [toppreise.ch](https://www.toppreise.ch/en) |
| **What they do** | Switzerland's #2 price comparison site (after Comparis); electronics, appliances, home goods |
| **Core feature** | Price comparison with price history, stock availability, shipping costs included |
| **Business model** | Free; CPC/affiliate from listed retailers |
| **Platform** | Web, iOS app |
| **Personalization** | Price alerts for tracked products |
| **Cross-store comparison** | Yes, but for non-grocery products (electronics, home, sport) |
| **Traffic / downloads** | #2 price comparison site in Switzerland (Similarweb, February 2026) |
| **Year founded** | Estimated early 2000s |
| **Key strength** | Price history charts; trusted Swiss brand; comprehensive for electronics |
| **Key weakness** | Not a grocery tool at all |
| **Threat to basketch** | **None.** Different market entirely. Relevant only as a UX benchmark for price history features. |

### 2.7 Preispirat.ch

| Attribute | Detail |
|---|---|
| **URL** | [preispirat.ch](https://www.preispirat.ch/) |
| **What they do** | Deal-sharing community and coupon aggregator -- Switzerland's largest shopping community |
| **Core feature** | Community-curated deals; coupon codes; push notifications for favourite shops/categories |
| **Business model** | Free; affiliate commissions; exclusive coupon partnerships |
| **Platform** | Web, iOS app, Android app |
| **Personalization** | Favourite shops and categories with push alerts |
| **Cross-store comparison** | No -- surfaces individual deals, not side-by-side comparison |
| **Traffic / downloads** | #3 price comparison site in Switzerland (Similarweb, February 2026) |
| **Year founded** | Not confirmed; active since at least 2020 |
| **Key strength** | Community-driven (hundreds of members posting daily); covers Black Friday, Cyber Monday events; coupon codes |
| **Key weakness** | General deals (not grocery-specific); community model means inconsistent coverage; no personal product tracking |
| **Threat to basketch** | **Low.** Different audience (deal hunters) and different category (general retail, not weekly groceries). |

### 2.8 Preisrunter.ch

| Attribute | Detail |
|---|---|
| **URL** | [preisrunter.ch](https://preisrunter.ch/) |
| **What they do** | Swiss grocery price comparison focused on food items |
| **Core feature** | Compare grocery prices across Swiss supermarkets |
| **Business model** | Free |
| **Platform** | Web |
| **Personalization** | Not confirmed |
| **Cross-store comparison** | Yes -- grocery-specific |
| **Key strength** | Focused on the grocery comparison problem specifically |
| **Key weakness** | Low visibility; limited public data on usage |
| **Threat to basketch** | **Medium.** Solving a similar problem but with unknown traction. Worth monitoring. |

---

### 2.9 Swiss Market Map

#### Feature Comparison Matrix

| Feature | **basketch** | **Rappn** | **Aktionis** | **Profital** | **Bring!** | **Preisvergleich** | **Toppreise** | **Preispirat** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Cross-store price comparison | Yes (2 stores) | Yes (5 stores) | No (lists deals) | No (flyers) | No | Yes (non-grocery) | Yes (non-grocery) | No |
| Personal favourites-first | Yes | Partial (alerts) | Partial (alarm) | Partial (stores) | Partial (list items) | No | No | No |
| Split shopping list | Yes | No | No | No | No | No | No | No |
| No app required | Yes (web/email) | No (app) | Partial (web + app) | No (app) | No (app) | Yes (web) | Yes (web) | Yes (web) |
| Starter pack onboarding | Yes (45 sec) | No | No | No | No | No | No | No |
| Deal categories | No (person-first) | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Weekly verdict | Yes | No | No | No | No | No | No | No |
| Email-only (no login) | Yes | No | No | No | No | No | No | No |
| Price history | Planned | No | No | No | No | No | Yes | No |
| Push notifications | No (email) | Yes | Yes | Yes | Yes | No | No | Yes |
| Number of stores covered | 2 (Migros, Coop) | 5 | 7+ | 100+ retailers | N/A | Hundreds (online) | Hundreds (online) | Various |
| Platform | Web | App + Web | Web + App | App + Web | App + Web + Voice | Web | Web + App | Web + App |
| Grocery-specific | Yes | Yes | Yes | Partial (all retail) | No (list only) | No | No | No |

#### Key takeaway from the matrix

basketch is the only tool that combines personal favourites, cross-store comparison, split shopping list, and zero-friction onboarding. Every competitor excels in one dimension but none connect the full chain from "my products" to "where to buy what this week."

---

## 3. International Benchmarks

### 3.1 United Kingdom

#### Trolley.co.uk

| Attribute | Detail |
|---|---|
| **URL** | [trolley.co.uk](https://www.trolley.co.uk/) |
| **What they do** | UK's largest grocery price comparison -- compare 130,000+ products across 16 supermarkets |
| **Core feature** | Product search, price history, saveable lists, barcode scanning, "Group by Store" feature |
| **Business model** | Free; likely affiliate/advertising |
| **Platform** | Web, iOS app, Android app, Chrome extension |
| **Personalization** | Saveable shopping lists; price alerts for specific products |
| **Cross-store comparison** | Yes -- 16 stores including Asda, Tesco, Aldi, Waitrose, Sainsbury's, Morrisons |
| **Traffic / downloads** | ~1.3M monthly visits (Similarweb, January 2026); recommended by BBC, ITV, The Sun, Mirror |
| **App rating** | Available on both stores; specific rating not confirmed |
| **Year founded** | Estimated 2020-2021 (successor to MySupermarket which closed 2019) |
| **Key strength** | Broadest UK coverage (16 stores); price history; trusted by media; "Group by Store" splits your list by store |
| **Key weakness** | No full basket-level comparison (individual products only, as of 2026); no favourites-first ranking; requires browsing |
| **Lesson for basketch** | Trolley's "Group by Store" feature is essentially a split shopping list -- validates the concept. Their scale (130K products, 16 stores) shows what mature looks like. basketch's advantage is starting with the person, not the catalogue. |

#### Shopsplit

| Attribute | Detail |
|---|---|
| **URL** | [shopsplit.uk](https://shopsplit.uk/) |
| **What they do** | AI-powered grocery list splitting -- load your list, get told how to split across stores for maximum savings |
| **Core feature** | Build list from 180,000+ products; AI recommends cheapest split across supermarkets |
| **Business model** | Not confirmed; launched March 2026 |
| **Platform** | Web |
| **Personalization** | AI-powered product substitution recommendations |
| **Cross-store comparison** | Yes -- recommends splitting between stores |
| **Traffic / downloads** | New (launched March 2026); no traffic data yet |
| **Key strength** | Solves the exact "split your shop" problem; AI matching eliminates manual comparison; claims 25-30% savings |
| **Key weakness** | Brand new (March 2026); unproven; UK-only |
| **Lesson for basketch** | **Direct concept validation.** Shopsplit proves the "split shopping list" idea has legs. Their finding that "splitting between 2 stores captures 90% of savings" directly supports basketch's 2-store (Migros + Coop) strategy. |

#### Latest Deals

| Attribute | Detail |
|---|---|
| **URL** | [latestdeals.co.uk](https://www.latestdeals.co.uk/) |
| **What they do** | Community-driven deal sharing platform with 1M+ members |
| **Core feature** | User-posted deals; supermarket price comparison tool; voucher codes; competitions |
| **Business model** | Free; affiliate; advertising |
| **Platform** | Web, iOS app, Android app |
| **Personalization** | Account-based deal tracking; points system for contributors |
| **Cross-store comparison** | Partial -- price comparison tool for individual products across Aldi, Asda, Co-op, Iceland, Morrisons, Ocado, Sainsbury's, Tesco |
| **Key strength** | Community energy; gamification (earn Amazon vouchers for posting deals); broad retail coverage beyond grocery |
| **Key weakness** | Community model means noise; grocery is one category among many; not personalized |
| **Lesson for basketch** | Community-driven deal discovery can build loyalty, but it is hard to keep signal-to-noise ratio high. basketch's automated approach avoids this problem entirely. |

#### Alertr

| Attribute | Detail |
|---|---|
| **URL** | [alertr.co.uk](https://alertr.co.uk/) |
| **What they do** | Price tracking and deal alerts across thousands of UK retailers |
| **Core feature** | Set target price for any product; get email when price drops to target |
| **Business model** | Free; browser extension |
| **Platform** | Web, browser extension |
| **Personalization** | Per-product price targets; personalized dashboard of tracked items |
| **Cross-store comparison** | No -- tracks price at one retailer per product |
| **Key strength** | Simple concept; works across thousands of retailers (not grocery-specific) |
| **Key weakness** | Not grocery-focused; limited UI (reported by users); one-retailer tracking, not cross-store |
| **Lesson for basketch** | The "alert when my product is on sale" mechanic is proven. basketch's weekly email serves the same psychological need but in a more structured, actionable format. |

### 3.2 Germany / Austria

#### marktguru

| Attribute | Detail |
|---|---|
| **URL** | [marktguru.de](https://www.marktguru.de/) |
| **What they do** | Digital flyer app with cashback -- browse leaflets, find offers, earn money back on purchases |
| **Core feature** | Digital brochures; product search across retailers; cashback on purchases (upload receipt); favourites with notifications |
| **Business model** | Free; cashback-funded (brands pay marktguru to incentivize purchases); retailer advertising |
| **Platform** | iOS app, Android app, Amazon Appstore, web |
| **Personalization** | Favourite products and retailers with push notifications; location-based offers |
| **Cross-store comparison** | Partial -- can search a product and see which stores have it on offer, but not true price comparison |
| **Traffic / downloads** | 8.5 million downloads (reported) |
| **App rating** | Not confirmed from search results |
| **Year founded** | ~2015 (Austria/Germany) |
| **Key strength** | Cashback model gives users real money back; large download base; dual revenue (B2B ads + cashback partnerships) |
| **Key weakness** | Flyer-first (digitizes paper); cashback requires receipt upload (friction); no true price comparison or split list |
| **Lesson for basketch** | Cashback is a powerful monetization model and user incentive. If basketch ever needs a revenue stream beyond subscriptions, cashback partnerships with Migros/Coop could work. The receipt-upload friction is something to avoid. |

#### kaufDA (Bonial / Axel Springer)

| Attribute | Detail |
|---|---|
| **URL** | [kaufda.de](https://www.kaufda.de/) |
| **What they do** | Germany's largest digital flyer platform -- browse weekly ads from local retailers |
| **Core feature** | Digital leaflets; shopping list; deal notifications; location-based store discovery |
| **Business model** | B2B (retailers pay for digital ad distribution); part of Bonial group, owned by Axel Springer |
| **Platform** | iOS app, Android app, web |
| **Personalization** | Favourite retailers with deal notifications |
| **Cross-store comparison** | No -- shows individual retailer flyers |
| **Traffic / downloads** | 14 million downloads; 14.4 million unique monthly users (Bonial group); 4.45 stars (100K+ ratings on Google Play) |
| **Year founded** | 2008; became most-downloaded German app in 2010 |
| **Key strength** | Massive scale (14M downloads); corporate backing (Axel Springer); covers all retail categories; established habit |
| **Key weakness** | Flyer replacement, not price comparison; no cross-store comparison; overwhelming for someone who just wants to know "is my butter cheaper at Aldi this week?" |
| **Lesson for basketch** | kaufDA proves the digital flyer model works at scale in DACH. But it also shows the limitation: digitizing paper is not the same as answering a personal question. basketch should position against this "digital paper" paradigm. |

#### smhaggle

| Attribute | Detail |
|---|---|
| **URL** | [smhaggle.com](https://smhaggle.com/) |
| **What they do** | Supermarket price comparison with receipt-based crowdsourcing in Germany |
| **Core feature** | Product search with real prices; shopping list cost calculator (find cheapest store for your list); favourites with price alerts; cashback |
| **Business model** | Free; cashback; receipt data monetization (10,000+ receipts uploaded daily) |
| **Platform** | iOS app, Android app |
| **Personalization** | Favourites with price change alerts; shopping list with per-store cost calculation |
| **Cross-store comparison** | Yes -- calculates total cost of your shopping list at different stores |
| **App rating** | 3.0 stars (reported) |
| **Year founded** | Not confirmed |
| **Key strength** | Closest international analog to basketch's concept -- compares your personal list across stores; real receipt-verified prices |
| **Key weakness** | Low app rating (3.0 stars); relies on users uploading receipts (cold start problem); Germany-only |
| **Lesson for basketch** | **Critical benchmark.** smhaggle tried the "compare your list across stores" model and got mediocre ratings. The lesson: execution matters enormously. basketch must nail the UX where smhaggle stumbled. The receipt-upload dependency is a cautionary tale -- basketch's approach of scraping deal data directly avoids this. |

### 3.3 Other Markets

#### WiseList (Australia)

| Attribute | Detail |
|---|---|
| **URL** | [wiselist.app](https://www.wiselist.app/) |
| **What they do** | Grocery price comparison + meal planning + household management for Australia |
| **Core feature** | Compare prices across Coles, Woolworths, ALDI; one-tap Click & Collect ordering; health scores; AI meal planning |
| **Business model** | Freemium (free tier + premium features) |
| **Platform** | iOS app, Android app |
| **Personalization** | AI-powered personalised shopping lists; seasonal savings alerts; barcode scanning for in-store price checks |
| **Cross-store comparison** | Yes -- Coles vs Woolworths vs ALDI; "Mix & Match" across stores |
| **Traffic / downloads** | 280,000+ Australian users (reported); featured by 9 News, Channel 7, Yahoo!, The Australian |
| **App rating** | Not confirmed from search results |
| **Year founded** | Not confirmed; backed by Galileo Ventures |
| **Key strength** | Goes beyond comparison into action (one-tap ordering); health scoring adds value beyond price; media coverage builds trust |
| **Key weakness** | Australia-only; app-dependent; broad feature set may dilute core comparison value |
| **Lesson for basketch** | WiseList's "Mix & Match" feature is essentially basketch's split shopping list. Their expansion into health scores and meal planning shows where a comparison tool can grow. But basketch should resist feature creep early -- WiseList's dashboard (bills, subscriptions, kitchen inventory) risks becoming bloated. |

#### Basket (US)

| Attribute | Detail |
|---|---|
| **URL** | [basketsavings.com](https://basketsavings.com/) |
| **What they do** | Crowdsourced grocery price comparison -- build a list, see total price at nearby stores |
| **Core feature** | Shopping list with per-store total; barcode scanning; price alerts; digital coupons |
| **Business model** | Free; coupon/affiliate revenue |
| **Platform** | iOS app, Android app |
| **Personalization** | Price alerts with custom thresholds (e.g., "alert me when almond milk drops below $2.50"); frequently bought items |
| **Cross-store comparison** | Yes -- 100+ chains (Walmart, Target, Kroger, etc.); shows total list price per store |
| **Traffic / downloads** | Not confirmed |
| **Year founded** | ~2015 (featured by TechCrunch, CNN) |
| **Key strength** | Crowdsourced pricing captures unadvertised deals; works across 100+ chains; custom price thresholds |
| **Key weakness** | Crowdsourced data means gaps in rural areas; US-only; prices can be $1-2 off |
| **Lesson for basketch** | Basket's crowdsourced model is clever but unreliable. basketch's approach of scraping official deal data is more accurate. Basket's custom price threshold alerts are a feature worth considering for basketch v2. |

#### Flipp (US / Canada)

| Attribute | Detail |
|---|---|
| **URL** | [flipp.com](https://flipp.com/) |
| **What they do** | Digital flyer marketplace -- browse weekly ads from 1,000+ retailers |
| **Core feature** | Digital flyers; coupon clipping to loyalty cards; shopping list with auto-deal-matching |
| **Business model** | B2B (retailers pay for digital ad distribution) |
| **Platform** | iOS app, Android app, Huawei AppGallery |
| **Personalization** | Favourite stores; shopping list with automatic deal matching |
| **Cross-store comparison** | No -- shows individual store flyers |
| **Traffic / downloads** | 25 million downloads (reported); 4.77 stars (390K ratings) |
| **Year founded** | ~2013 (Canada) |
| **Key strength** | Enormous scale; highest-rated app in this analysis (4.77 stars); coupon-to-loyalty-card integration eliminates friction |
| **Key weakness** | Flyer-first (same paradigm as Profital/kaufDA); US/Canada only; no cross-store comparison |
| **Lesson for basketch** | Flipp's 4.77-star rating shows what polished execution looks like. Their auto-deal-matching on the shopping list is a feature that bridges the gap between "browsing deals" and "my list" -- basketch should study this UX carefully. |

#### Grocery Dealz (US)

| Attribute | Detail |
|---|---|
| **URL** | App Store / Google Play |
| **What they do** | Real-time grocery price comparison across US chains (Walmart, Target, Kroger, H-E-B, Safeway, etc.) |
| **Core feature** | Search products, see current prices across nearby stores |
| **Business model** | Free (expanded nationally early 2026) |
| **Platform** | iOS app, Android app |
| **Cross-store comparison** | Yes -- real-time prices across major US chains |
| **Key strength** | Real-time pricing data; broad chain coverage |
| **Key weakness** | New (expanded 2026); US-only |
| **Lesson for basketch** | Another entrant validating the cross-store comparison model. The market is moving in basketch's direction globally. |

---

### 3.4 International Comparison Table

| Feature | **basketch** | **Trolley (UK)** | **Shopsplit (UK)** | **marktguru (DE)** | **kaufDA (DE)** | **smhaggle (DE)** | **WiseList (AU)** | **Basket (US)** | **Flipp (US/CA)** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Cross-store comparison | Yes | Yes | Yes | Partial | No | Yes | Yes | Yes | No |
| Personal favourites-first | Yes | No | No | Partial | Partial | Partial | AI-powered | Partial | Partial |
| Split shopping list | Yes | Partial ("Group by Store") | Yes (core feature) | No | No | Yes (cost calc) | Yes ("Mix & Match") | Yes (per-store totals) | No |
| No app required | Yes | Partial (web + app) | Yes (web) | No | No | No | No | No | No |
| Starter pack onboarding | Yes (45 sec) | No | No | No | No | No | No | No | No |
| Weekly verdict email | Yes | No | No | No | No | No | No | No | No |
| Email-only (no login) | Yes | No | No | No | No | No | No | No | No |
| Cashback | No | No | No | Yes | No | Yes | No | Yes (coupons) | Yes (coupons) |
| Price history | Planned | Yes | No | No | No | Yes | No | No | No |
| Barcode scanning | No | Yes | No | No | No | Yes | Yes | Yes | No |
| Number of stores | 2 | 16 | Multiple | Many | Many | Many | 3 | 100+ | 1,000+ |
| Downloads/users | New | ~1.3M monthly visits | New | 8.5M downloads | 14M downloads | Not disclosed | 280K users | Not disclosed | 25M downloads |

---

## 4. basketch Differentiation

### 4.1 Where basketch wins

| Advantage | Why it matters |
|---|---|
| **Personalization (favourites-first, not deal-first)** | Every competitor starts with "here are today's deals" and asks the user to find relevance. basketch starts with "here are YOUR products" and shows which are cheaper where. This inverts the cognitive load. |
| **Zero friction (no app, no login, 45-second setup)** | Rappn, Profital, Bring!, marktguru, kaufDA -- all require an app download. basketch works via web + email. The starter pack onboarding (pick your regular products in 45 seconds) eliminates the cold-start problem that kills most comparison tools. |
| **Split shopping list (actionable output)** | Most tools stop at "here is price information." basketch produces a concrete output: "Buy these at Migros, buy those at Coop." This is the difference between information and action. Shopsplit (UK) and WiseList (AU) validate that this concept resonates. |
| **Focused scope (2 stores, done well)** | Rappn covers 5 stores; Aktionis covers 7; Profital covers 100+ retailers. More is not better when the user shops at 2 stores. basketch's constraint (Migros + Coop) is a feature: it matches how Swiss households actually shop. |
| **Weekly verdict (opinionated output)** | No competitor provides a weekly "here is what changed for you" summary. basketch's email acts as a personal shopping advisor, not a search engine. |

### 4.2 Where competitors win

| Competitor advantage | Detail |
|---|---|
| **Breadth (more stores, more products)** | Rappn (5 stores, 10K+ offers), Trolley (16 stores, 130K products), Flipp (1,000+ retailers). If a user shops at Aldi or Lidl, basketch currently has nothing for them. |
| **Established user base** | Bring! (20M global users), Profital (450K Swiss monthly users), kaufDA (14M downloads). basketch starts from zero. |
| **Native app experience** | Push notifications, barcode scanning, in-store mode, offline access -- all require an app. basketch's web-only approach sacrifices these capabilities. |
| **Price history and trend data** | Toppreise and Trolley offer price history charts. This builds trust ("is this really a deal or just the normal price?") and basketch does not have this yet. |
| **Cashback and coupons** | marktguru, smhaggle, Basket, and Flipp offer direct financial incentives (cashback, coupons). basketch saves money through information, not through payment. |
| **Corporate backing** | Profital/Bring! (Swiss Post), kaufDA (Axel Springer), Trolley (media endorsements). These organizations can outspend a startup on marketing and data acquisition. |

### 4.3 Strategic Positioning

basketch is **not** trying to be a deal aggregator. It is not competing with Aktionis (breadth), Profital (flyers), or Bring! (shopping lists).

basketch **is** trying to answer one question that no Swiss tool answers today:

> "Which of MY products are cheaper where this week?"

**Positioning statement:**

*basketch is the personal promotions comparison for Swiss households who shop at Migros and Coop. Tell us what you buy. Every week, we show you where your items are on sale and give you a split shopping list. No app. No login. 45 seconds to start.*

This positions basketch in a category of one. Competitors can be mapped on two axes:

|  | **Generic (all deals)** | **Personal (your products)** |
|---|---|---|
| **Broad (many stores)** | Rappn, Aktionis, Profital | (empty -- opportunity) |
| **Focused (2 stores)** | (no one does this) | **basketch** |

---

## 5. Opportunities and Threats

### 5.1 Opportunities

| Opportunity | Detail |
|---|---|
| **No Swiss tool is person-first** | Every competitor is deal-first or flyer-first. The "personal comparison" niche is unoccupied. |
| **Profital/Bring! business model conflict** | Profital makes money by selling ad space to retailers. Transparent cross-store comparison could alienate paying retailers. This structural conflict may prevent them from building what basketch does. |
| **Swiss duopoly simplifies the problem** | Migros and Coop together hold ~70% of Swiss grocery market share. Covering 2 stores in Switzerland captures more of the market than covering 2 stores in any other country. |
| **"Split your shop" is globally validated** | Shopsplit (UK, March 2026), WiseList (AU), Trolley's "Group by Store" -- the split-list concept is emerging independently in multiple markets. basketch is not inventing a new behaviour; it is bringing a proven concept to Switzerland first. |
| **Email-first is underexplored** | Every competitor defaults to an app. An email-first approach (weekly verdict, no download required) targets a different adoption curve -- especially valuable for less tech-savvy Swiss shoppers who find app fatigue real. |
| **Expand to Aldi/Lidl/Denner later** | Starting with 2 stores is a constraint, but expanding to discounters (Aldi, Lidl, Denner) later could dramatically increase value. Rappn already covers these -- basketch could match breadth while retaining personalization. |

### 5.2 Threats

| Threat | Severity | Detail |
|---|---|---|
| **Bring!/Profital adds personalized comparison** | High | They have the data (100+ retailers), the users (450K monthly), and the corporate backing (Swiss Post). If they build a "compare your favourites across stores" feature, basketch's core value proposition is replicated at scale. |
| **Rappn adds favourites-first ranking** | High | Rappn already has favourites and alerts. Adding a "weekly summary for your favourites" feature is a small product step for them, and they already cover 5 stores. |
| **Data source blocked or restricted** | High | basketch depends on accessing Migros and Coop deal/price data. If either retailer blocks scraping or restricts API access, basketch loses its foundation. This is existential. |
| **Migros or Coop builds their own comparison** | Medium | Unlikely (retailers avoid highlighting competitors' lower prices), but not impossible. Migros already has a sophisticated digital ecosystem. |
| **User acquisition cost** | Medium | With no app store presence and an email-first model, basketch must find users through organic search, word-of-mouth, or social media. Competing for "Swiss grocery deals" search terms against established players will be expensive. |
| **Swiss market ceiling** | Medium | Switzerland has ~3.9 million households. Even at high penetration, the total addressable market is small compared to Germany or UK. This limits VC-style growth but is fine for a sustainable small business. |
| **Feature creep from international examples** | Low | WiseList expanded into bills, subscriptions, meal planning, health scores. The temptation to add features is real. basketch must resist this early and stay focused on the one question it answers. |

---

## 6. Key Takeaways

1. **No Swiss tool combines personal favourites + cross-store comparison + split shopping list.** This is basketch's core opportunity, and it is real and validated by international analogues.

2. **Rappn is the most dangerous Swiss competitor.** It already compares prices across 5 stores with favourites and alerts. A small product evolution could encroach on basketch's positioning. Monitor Rappn's feature releases closely.

3. **Profital/Bring! is the strategic threat.** They have the data, users, and resources -- but their B2B ad model may structurally prevent them from building transparent cross-store comparison. This conflict is basketch's moat until it isn't.

4. **The "split shopping list" concept is globally validated.** Shopsplit (UK), WiseList's Mix & Match (AU), Trolley's Group by Store (UK), and smhaggle's cost calculator (DE) all prove users want to know not just "where is it cheaper?" but "what should I buy where?" basketch is not inventing a behaviour; it is executing it for Switzerland.

5. **Shopsplit's finding that "2 stores capture 90% of savings" validates basketch's focused scope.** You do not need to cover 5 or 7 stores. Migros + Coop is enough.

6. **smhaggle (Germany) is a cautionary tale.** They tried the "compare your list across stores" model and got 3.0 stars. Execution and UX quality are everything. basketch must be delightful where smhaggle was clunky.

7. **Zero-friction onboarding is a genuine differentiator.** Every competitor requires an app download. basketch's web-first, email-only, 45-second-setup approach removes the biggest barrier to trial.

8. **Price history is a trust feature basketch should prioritize.** Toppreise (CH) and Trolley (UK) show that users want to verify "is this actually a deal?" Price history charts build credibility and should be on the roadmap.

9. **Cashback is a monetization path worth watching.** marktguru and smhaggle use cashback as both a user incentive and a revenue stream. This could work for basketch if brand partnerships become available.

10. **Data access is the existential risk.** If Migros or Coop block access to deal data, basketch has no product. Diversifying data sources and/or establishing official partnerships should be a priority.

---

*Sources: Research conducted April 2026. Traffic and download figures sourced from Similarweb, Google Play Store, Apple App Store, company websites, and press releases. Figures are estimates and may not reflect real-time data. Where exact figures were unavailable, qualifications ("reported," "estimated") are used.*
