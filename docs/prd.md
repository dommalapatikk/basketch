# Product Requirements Document: basketch

**Author:** Kiran Dommalapati
**Version:** 1.0
**Date:** 9 April 2026
**Status:** Draft

---

## 1. Problem Statement

Swiss residents who shop at both Migros and Coop have no easy way to know which store has better deals this week for the items they actually buy. Every weekend, you either:
- Check both websites manually (time-consuming)
- Pick one store and hope for the best (miss savings)
- Buy everything at one store out of habit (overpay on items the other store has on sale)

The result: you overspend on groceries because comparing weekly promotions across two stores is tedious.

Existing deal sites like aktionis.ch and Rappn show everyone the same 200+ deals — but shoppers only care about their 15-20 regular items. The problem is not "which deals exist" but "which of MY products are cheaper where this week."

---

## 2. Target User

**Primary:** Swiss residents who split weekly shopping between Migros and Coop.

**Persona:** "Weekend Shopper Sarah"
- Lives in a Swiss city (Bern, Zurich, Basel)
- Shops once or twice a week, usually Saturday
- Buys a mix of fresh food, pantry staples, and household items
- Willing to visit both Migros and Coop if the savings justify it
- Does not want to install an app or create an account

**Scale:** 10-50 users initially (friends and word of mouth).

**Region:** Bern only (MVP). Expandable to Zurich, Basel, and other Swiss regions later.

---

## 3. User Stories

### Epic 1: Personal Favorites (MVP)

**US-1:** As a shopper, I want to quickly set up my regular products using a starter pack template (Indian Kitchen, Swiss Basics, etc.), so I don't have to add items one by one.

**US-2:** As a shopper, I want to see which of MY favorite items are on sale this week and at which store, so I know where to buy each item.

**US-3:** As a shopper, I want a split shopping list ("buy these at Migros, buy these at Coop"), so I can go to each store with a clear list.

**US-4:** As a shopper, I want to save my favorites with my email address (no password), so I can access them from any device next week.

**US-5:** As a shopper, I want to search for products and add/remove them from my favorites, so my list stays up to date.

### Epic 2: Weekly Deals Overview (v2)

**US-6:** As a shopper, I want to see this week's best deals from Migros and Coop side by side, so I can decide which store to visit for each category.

**US-7:** As a shopper, I want deals grouped into three categories (Fresh, Long-life food, Non-food/Household), so I can quickly see where to buy each type.

**US-8:** As a shopper, I want to see the discount percentage and original price, so I can judge if a deal is worth acting on.

**US-9:** As a shopper, I want a simple weekly verdict ("Go to Migros for vegetables, Coop for household"), so I get the answer in 5 seconds without scrolling.

### Epic 3: Notifications (v3 - future)

**US-10:** As a shopper, I want to receive an email every Thursday evening with my personalized deals, so I'm prepared before the weekend.

**US-11:** As a shopper, I want to unsubscribe with one click, so I'm not locked into notifications.

---

## 4. Product Categories

| Category | Examples | Shopping Behaviour | Deal Value |
|----------|---------|-------------------|------------|
| **Fresh / short expiry** | Vegetables, dairy, meat, bread, fruit | Buy weekly, go where it's cheapest | High (perishable, buy this week or not at all) |
| **Long shelf-life food** | Nuts, chocolate, pasta, rice, coffee, ice cream, canned goods | Buy in bulk when on sale | Medium (stock up for weeks) |
| **Non-food / household** | Washing powder, tissues, shampoo, cleaning products, toiletries | Stock up for months when discounted | High (big savings on bulk) |

---

## 5. Information Architecture

```
basketch.ch (or basketch.vercel.app)
|
+-- / (Home)
|   +-- Weekly Verdict: "This week: Migros wins for Fresh, Coop wins for Household"
|   +-- Three category cards (Fresh / Long-life / Non-food)
|   +-- Each card: top deals from both stores, side by side
|
+-- /basket/[id] (Personal basket - v2)
|   +-- User's selected items
|   +-- Which are on sale this week, at which store
|   +-- Edit basket button
|   +-- Add email for notifications
|
+-- /about
    +-- How it works
    +-- Data sources
    +-- Built by Kiran Dommalapati
```

---

## 6. Data Requirements

### Data Sources

| Source | Method | Confidence | Notes |
|--------|--------|-----------|-------|
| **Migros promotions** | migros-api-wrapper (open source npm package) | High | Uses guest OAuth2 tokens. Returns structured JSON with prices, discounts, categories. |
| **Coop promotions** | aktionis.ch (public deal aggregator) | High | Public site since 2006, no bot protection. Structured deal data with prices and discounts. |

**Data source policy:** Only publicly available data is used. No scraping of bot-protected sites (coop.ch uses DataDome). This is a legal and ethical requirement.

### Deal Schedule (validated April 2026)

Both Migros and Coop operate on a **Thursday → Wednesday** weekly deal cycle.
- Coop publishes deals online: **Wednesday 16:30**
- Migros publishes deals online: **Wednesday evening**
- Pipeline trigger: **Wednesday 21:00 UTC (22:00 CET)** — after both stores publish
- Verification fetch: **Thursday 06:00 UTC** — catch late updates before peak shopping
- Peak shopping days: **Thursday, Friday, Saturday** (Sunday all stores closed)

### Data Model (Supabase tables)

**deals**
- id, store (migros/coop), product_name, category (fresh/long-life/non-food), original_price, sale_price, discount_percent, valid_from, valid_to, image_url, fetched_at

**baskets** (v2)
- id, name, created_at, email (optional)

**basket_items** (v2)
- basket_id, product_keyword, category

### Data Pipeline

- **Frequency:** Weekly (Wednesday evening, 21:00 UTC), with Thursday morning verification
- **Runtime:** GitHub Actions cron job (free for public repos)
- **Process:** Python script fetches Migros API + scrapes Coop -> categorizes deals -> upserts into Supabase
- **Fallback:** If scraping fails, show "Coop data unavailable this week" (graceful degradation)

---

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Load time** | < 2 seconds on 4G |
| **Mobile-first** | Works on phone browser, no app needed |
| **No login** | Baskets accessed via unique URL, no account creation |
| **Cost** | CHF 0/month (all free tiers) |
| **Privacy** | No tracking beyond basic analytics. No personal data stored except optional email. |
| **Availability** | Best-effort (free hosting). Acceptable downtime. |
| **Language** | English UI (MVP). German product names from source data. German UI added later if demand exists. |

---

## 8. Success Metrics

### North Star Metric
**Personalized comparisons viewed** — unique users who see their favorites comparison in a distinct week. This captures core value delivered: showing you which of YOUR items are on sale where.

### Activation Metric
**User adds 5+ favorites and views first personalized comparison.**

### Key Metrics

| Metric | Target | Timeframe | How to Measure |
|--------|--------|-----------|---------------|
| **Activation rate** | 30%+ | From launch | % of first-time visitors who add 5+ favorites and view comparison |
| **W4 retention** | 40%+ | By month 2 | Users active in week 4 / users who first visited in week 1 |
| **Weekly returning visitors** | 20+ | By month 3 | Vercel Analytics |
| **PMF survey: "Very Disappointed"** | 40%+ | At week 8 | Sean Ellis survey of 10 friends |
| **Data freshness** | Updated every Thursday by 20:00 | Ongoing | GitHub Actions run history |
| **Page load (mobile, 4G)** | < 2 seconds | Ongoing | Lighthouse audit |
| **Time to decision** | < 30 seconds | At launch | User testing with 5 friends |

### Phase 2+ Metrics (track later)

| Metric | Target | Phase |
|--------|--------|-------|
| Baskets created | 10+ | Phase 2 |
| Email subscribers | 5+ | Phase 3 |
| Unprompted shares | 2-3 friends sharing with others | Organic — watch for it |
| SEO organic visitors | 50+/week | 3 months post-launch |

---

## 9. Out of Scope (for now)

- Other retailers (Aldi, Lidl, Denner) — v4+ if demand exists
- Price history / trend tracking
- Barcode scanning
- Native mobile app
- User reviews or comments
- Recipe suggestions based on deals
- Full regular-price comparison (V1 is deal-only; regular prices depend on data source availability)

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Migros API requires auth/key we can't get | ~~Medium~~ Resolved | ~~High~~ | Using migros-api-wrapper (open source) with guest OAuth2 tokens instead of search-api.migros.ch. |
| Coop blocks scraping | ~~High~~ Resolved | ~~High~~ | Using aktionis.ch (public aggregator) instead. No direct scraping of coop.ch. |
| Low user adoption | Medium | Low | This is a portfolio project — value is in the PM process, not user count |
| Data categorization is wrong | Medium | Medium | Start with manual category mapping for top 100 products, automate later |
| Supermarket changes promotion schedule | Low | Low | Adjust cron job timing |
| Regular (non-deal) prices unavailable for Coop and Migros | High | High — V1 limited to deal-only comparison, cannot show "which store is cheaper overall" | V1 ships as deal tracker on favorites. Frame value as "which of MY items are on sale where." Investigate regular price sources for V2 (Migros product API, manual collection for top 50 items, user-contributed prices). Do not promise full price comparison until data exists. |

---

## 11. Competitive Landscape

| Competitor | What they do | Favorites? | basketch differentiation |
|-----------|-------------|-----------|------------------------|
| Rappn.ch | 10K+ offers from 7 Swiss retailers | Category-level favorites | No personalized side-by-side comparison |
| Aktionis.ch | Deal aggregator, 94K monthly visits | Wishlist + price alerts | Aging (3.2 stars), no personalized comparison |
| Profital.ch | Digital flyers, 830K downloads | Favorite stores only | No product-level tracking or comparison |
| Bring! | Shopping lists, 20M users | Full list management | No price data or deal tracking |

**basketch's differentiation:** Personal favorites → personalized deal comparison → split shopping list. No Swiss app currently combines personal product tracking with cross-store deal comparison.

---

## 12. Open Questions

### Resolved (Phase 0)

| # | Question | Answer | Date |
|---|----------|--------|------|
| 1 | Does `search-api.migros.ch/discounts` return useful data without auth? | No — requires client key. Using migros-api-wrapper (open source, guest OAuth2) instead. | 9 Apr 2026 |
| 2 | Can we intercept Coop's internal API? | Not viable — DataDome blocks all automated access. Using aktionis.ch (public aggregator since 2006) instead. | 9 Apr 2026 |
| 5 | Should the UI be German-first or English-first? | English UI for MVP. German product names come from source data. German UI later if demand exists. | 9 Apr 2026 |

### Still Open

3. How do we accurately categorize products into the 3 buckets? (Migros/Coop category taxonomy may not match ours) — To resolve during M0 (data pipeline build).
4. Is `basketch.ch` domain available? (Check at nic.ch) — Low priority, using basketch.vercel.app for MVP.
