# Product Requirements Document: basketch

**Author:** Kiran Dommalapati
**Version:** 3.1
**Date:** 21 April 2026
**Status:** Draft

---

## 1. Problem Statement

Swiss residents who shop across multiple supermarkets have no easy way to know which store has the best promotions this week for the items they actually buy. Every weekend, you either:
- Check multiple store websites manually (time-consuming)
- Pick one store and hope for the best (miss promotions elsewhere)
- Buy everything at one store out of habit (miss deals other stores have this week)

The result: you miss weekly promotions because comparing them across multiple stores is tedious.

Existing deal sites like aktionis.ch and Rappn show everyone the same 200+ deals — but shoppers only care about their 15-20 regular items. The problem is not "which deals exist" but "which of MY products are on promotion this week, and where."

---

## 1b. Value Proposition

### The Promise

> **"Your weekly promotions, compared. 7 Swiss supermarkets."**

basketch shows you which of your regular grocery items are on promotion this week — and at which store — before you leave the house. Setup once in 60 seconds, check every week in 30 seconds. Compare across Migros, Coop, LIDL, ALDI, Denner, SPAR, and Volg.

### What basketch IS

A **promotions comparison tool**. It answers: "Which of MY items are on sale this week, and where?"

- See your regular items matched against this week's promotions from 7 Swiss supermarkets
- Get a weekly verdict: "More fresh deals at Migros, more household deals at Denner"
- Browse all promotions by category, grouped by store
- Know before Saturday morning where to go for what

### What basketch is NOT

A **price comparison tool**. It does NOT answer: "Which store is cheaper overall for milk?"

basketch does not compare regular shelf prices across stores. It compares weekly promotions only.

### Why Promotions, Not Prices (Strategic Product Decision)

This is a deliberate product choice based on data reality and user value:

**Data reality:**
- All 7 stores' promotional data comes from a single source (aktionis.ch) — the comparison is perfectly fair and consistent
- Regular shelf prices are not publicly available for most stores
- Using one unified data source eliminates format mismatches and coverage asymmetry

**Why this is better for the user:**
1. **Regular prices are stable and learnable.** You already know roughly what Migros milk costs. You don't need a tool for information that doesn't change.
2. **Promotions change every week and are unpredictable.** You cannot know this week's deals without checking. This is the information asymmetry a tool resolves.
3. **Promotions drive the weekly store decision.** Nobody switches stores because Migros milk is 5 Rappen cheaper every week. People switch because Denner has 40% off chicken THIS WEEK. The promotion is the trigger.
4. **The comparison is fair.** All 7 stores' promotional data comes from the same source (aktionis.ch) in the same format. No asterisks. No "data may be incomplete" disclaimers.

**What this means for the product:**
- Every claim basketch makes is verifiable by the user
- "On sale at Migros: milk (-25%)" is a fact, not an inference
- Trust is built through precision, not through promising more than the data supports
- Swiss consumers respect honesty over hype — this positioning fits the market

### The Tagline Options

| Language | Audience |
|----------|---------|
| "Your weekly promotions, compared." | English UI |
| "Aktionen aus 7 Läden — auf einen Blick." | German (future) |
| "What's on sale before you shop." | Casual/social sharing |

---

## 2. Target User

**Primary:** Swiss residents who shop across Swiss supermarkets and want to know where the best promotions are this week.

**Persona:** "Weekend Shopper Sarah"
- Lives in a Swiss city (Bern, Zurich, Basel)
- Shops once or twice a week, usually Saturday
- Buys a mix of fresh food, pantry staples, and household items
- Willing to visit multiple stores if the promotions justify it
- Does not want to install an app or create an account

**Scale:** 10-50 users (Kiran + friends in Bern). A real product for a tiny audience, documented like a portfolio project.

**Region:** Bern only (V1). Expandable to Zurich, Basel, and other Swiss regions later.

---

## 3. User Stories

### Epic 1: Weekly Verdict & Deals Browsing (First-Visit Experience)

The verdict and deals browsing are the **aha moment** — they work for everyone on day one, require zero setup, and use symmetric data from all stores. This is what Sarah sees first.

**US-6:** As a shopper, I want to see this week's best deals from my selected stores side by side, so I can decide which store to visit for each category.

**US-7:** As a shopper, I want deals grouped into three categories (Fresh, Long-life food, Non-food/Household), so I can quickly see where to buy each type.

**US-8:** As a shopper, I want to see the discount percentage and original price, so I can judge if a deal is worth acting on.

**US-9:** As a shopper, I want a simple weekly verdict ("More vegetable promotions at Migros, more household deals at Denner"), so I know where the promotions are in 5 seconds without scrolling.

**US-12:** As a shopper, I want to browse all deals by granular sub-category (e.g., Dairy & Eggs, Drinks, Snacks & Sweets), with deals grouped by store, so I can compare what each store offers in a specific product area.

### Epic 2: Personal Favorites (Retention Feature)

Favorites are the **retention moment** — they become powerful after the user already trusts the verdict and has the weekly habit. Favorites require setup, so they are layered on after the first-visit experience.

> **Known Bug (tracked, fix pending):** When a user adds an item to My List — either from search results or by typing a custom item — the item does not visually appear in the list after being added. The add action completes without error but the UI does not update to reflect the new item. This is a UX regression. Fix must be delivered before sharing with friends. Tracked here until resolved.

**US-1:** As a shopper, I want to quickly set up my regular products using a starter pack template, so I don't have to add items one by one.

**Starter Pack Templates (5 packs):**

| # | Pack Name | Target Segment | Coverage |
|---|-----------|---------------|----------|
| 1 | Swiss Basics | Default Swiss household | 30% |
| 2 | Indian Kitchen | Indian expat or enthusiast | 5% |
| 3 | Mediterranean | Italian-style cooking (mainstream in CH) | 15% |
| 4 | Studentenküche | Students, budget-first | 15% |
| 5 | Familientisch | Families with children | 15% |

Each pack contains 15-16 items with specific product keywords. See `docs/starter-pack-research.md` for full item lists. Users can also build a custom list from scratch via search.

**Pre-launch requirement:** Run the pipeline 2-3 weeks before sharing with friends to accumulate product history across stores. Validate every starter pack item against actual promotional data. If more than 3 items in a pack have zero promotional history, swap them for items that do.

**US-2:** As a shopper, I want to see which of MY favorite items are on promotion this week and at which store, so I know what's on sale where.

**US-3:** As a shopper, I want a split shopping list ("on sale at Migros: milk, bread / on sale at Denner: cheese, yogurt"), so I can go to each store knowing what's on promotion there.

**US-4:** As a shopper, I want to save my favorites via a unique bookmarkable URL or email address, so I can access them next week without creating an account.

**Dual return paths (both primary):**
- **Direct URL** (`/compare/:favoriteId`) — stable, unguessable (UUID-based), works across devices. For users who bookmark or share the link.
- **Email lookup** — enter the email saved during onboarding to retrieve the comparison. For users who clear browsers, switch devices, or don't use bookmarks.
Both paths are equally supported. Neither is a fallback.

**US-5:** As a shopper, I want to search for products and add/remove them from my favorites, so my list stays up to date.

**Store display on My List / ComparisonPage:** The My List comparison page (`/compare/:favoriteId`) must show **all 7 stores** (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg) without restriction. The previous 3-store limit has been removed. Note: the Deals page (`/deals`) has its own separate store filter that is unaffected by this change and continues to let users select which stores to view.

**US-13:** As a shopper, when I add "BIO Onion" to my list, I want to see all deals in the Fruits & Vegetables category from all stores this week — not just onion-specific deals — so I can discover related promotions I might otherwise miss.

**US-14:** As a shopper, each item in my list should map to a deal category so the comparison stays useful even when my exact item is not on promotion this week.

**Category-based matching logic (replaces keyword-only matching):**

Instead of matching a list item against specific deal product names by keyword, each item is mapped to a BROWSE_CATEGORY. When that item appears in My List, the system shows **all deals in that category's sub-categories from all 7 stores** for the current week.

This applies to both item types in a basket:
- **Items added from search** (linked to a `productGroupId`): use the `category` and `sub_category` already recorded on that product group to determine the BROWSE_CATEGORY.
- **Items added as custom text** (e.g., user typed "cake"): map the custom text to a BROWSE_CATEGORY using keyword rules at item-save time. Store the resolved category on the `basket_items` row so it does not need to be re-inferred on every page load.

The 11 BROWSE_CATEGORies and their sub-categories used for matching:

| BROWSE_CATEGORY | Sub-categories included |
|-----------------|------------------------|
| Fruits & Vegetables | fruit, vegetables |
| Meat & Fish | meat, poultry, fish, deli |
| Dairy & Eggs | dairy, eggs |
| Bakery | bread |
| Snacks & Sweets | snacks, chocolate |
| Pasta, Rice & More | pasta-rice |
| Drinks | drinks, coffee-tea |
| Ready Meals & Frozen | ready-meals, frozen |
| Pantry & Canned | canned, condiments |
| Home & Cleaning | cleaning, laundry, paper-goods, household |
| Beauty & Hygiene | personal-care |

**Example:** "BIO Onion" → maps to BROWSE_CATEGORY "Fruits & Vegetables" (sub-categories: fruit, vegetables) → My List shows all deals where `sub_category IN ('fruit', 'vegetables')` across all 7 stores this week. The comparison is no longer limited to deals with "onion" in the product name.

**Fallback for unmappable custom items:** If a custom text item cannot be confidently mapped to a BROWSE_CATEGORY (no keyword match), the item is shown in My List with a note: "We couldn't match '[item]' to a category — browse deals manually." No category deals are shown for that item.

**Store data transparency (two-tier status messages):**

Because all store data is promotional-only (via aktionis.ch), the favorites comparison must communicate what we know honestly. As of v3.1, the comparison operates at **category level** — each list item maps to a BROWSE_CATEGORY and shows all deals in that category from all stores, not just exact-match deals for that item.

| Situation | Store shows |
|-----------|------------|
| Category has deals at this store this week | All deals in that category from this store (sale price + discount %) |
| Category has no deals at this store this week | "No [Category] deals at [Store] this week" |
| Store data missing entirely this week | "No [Store] data this week" |
| List item cannot be mapped to a category | "We couldn't match '[item]' to a category — browse deals manually" |

**What changed from item-level to category-level matching:** Previously, "BIO Onion" would only surface a deal if a product with "onion" in its name was on promotion. Under category-level matching, "BIO Onion" surfaces all Fruits & Vegetables deals from all stores — giving the shopper a genuinely useful comparison even when their specific item is not on sale.

Coverage improves naturally as the pipeline runs: ~60% at launch (after 2-3 pipeline runs), ~80% by week 4, ~90%+ by week 12.

**Verdict Calculation:**
- **Formula:** 40% deal count + 60% average discount depth per category per store
- **Tie threshold:** If stores are within 5% of each other, verdict is "It's a tie"
- **Per-category verdicts:** Each of the 3 categories (Fresh, Long-life, Non-food) gets its own winner
- **Overall verdict:** Summarizes category winners in one sentence

**Verdict Display States:**
| State | Display |
|-------|---------|
| Normal | "More fresh deals at Migros, more household deals at Denner this week" — store names in store colors |
| Tie | "Similar promotions at both stores this week" |
| Stale data (> 7 days) | Verdict shown + amber warning: "Deals may be outdated — last updated [date]" |
| Partial data (one store missing) | "Partial data — [store] unavailable this week" |
| No data | Verdict banner not shown |
| Minimum threshold | If a category has fewer than 3 deals from a store, show "Not enough data" instead of a verdict for that category |

**Deals Browsing Page (`/deals`):**
- 11 browsable sub-categories: Fruits & Vegetables, Meat & Fish, Dairy & Eggs, Bakery, Snacks & Sweets, Pasta/Rice & More, Drinks, Ready Meals & Frozen, Pantry & Canned, Home & Cleaning, Beauty & Hygiene (plus "All")
- Deals grouped by store within each category (desktop: side-by-side columns; mobile: stacked sections)
- Sorted by discount % descending within each store group
- Category filter via pill-style toggles
- 50-deal display cap per store group, with "Show more" expansion

**Verdict transparency:** Show a one-line explanation under the verdict: "Based on 12 Migros deals (avg 28% off), 8 Coop deals (avg 22% off), 6 Denner deals (avg 31% off)." Users must be able to verify why the verdict was reached. A black-box verdict erodes trust.

**Verdict card (shareable "Wordle card"):** The verdict must also render as a standalone visual card optimized for WhatsApp screenshot sharing. The card must:
- Be self-contained (readable without visiting basketch)
- Show store name, category, deal count, and avg discount per category
- Include basketch.ch branding
- Be readable after WhatsApp image compression
- Include a "Copy card" button for easy sharing
- See `docs/whatsapp-sharing-guide.md` for the full concept

### Epic 3: Notifications (future)

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
+-- / (Home — first-visit experience, zero setup required)
|   +-- Weekly Promotions Verdict banner + shareable Wordle card
|   +-- Verdict explanation line ("Based on X deals, avg Y% off")
|   +-- Three category cards (Fresh / Long-life / Non-food) with top deals
|   +-- "Track your items" CTA → links to /onboarding
|   +-- "Already have a list?" email lookup (returning users)
|
+-- /deals (browse all promotions, zero setup)
|   +-- Browse all deals by sub-category (11 categories + "All")
|   +-- Deals grouped by store per category (default: Migros, Coop, Denner; user picks stores)
|   +-- Category filter pills
|
+-- /onboarding (favorites setup — after user trusts the verdict)
|   +-- Starter pack template selection (5 packs + custom)
|   +-- Item customization (remove/add/search)
|   +-- 30-item soft cap with nudge
|   +-- Redirects to /compare/:favoriteId on completion
|
+-- /compare/:favoriteId (personalized comparison — retention hook)
|   +-- Personalized comparison with this week's promotions
|   +-- Split list by store: "On sale at Migros" / "On sale at Denner" / etc. / "No deals"
|   +-- Two-tier store status messages (see Epic 2)
|   +-- "Save this list" with copy/share URL + email save
|   +-- Data freshness indicator
|
+-- /about
|   +-- How it works
|   +-- Data sources (transparency)
|   +-- Built by Kiran Dommalapati
|
+-- /* (404)
    +-- "Page not found" message
    +-- Link back to home
    +-- Consistent header/footer
```

---

## 6. Data Requirements

### Data Sources

| Source | Method | Stores Covered | Confidence | Notes |
|--------|--------|---------------|-----------|-------|
| **aktionis.ch** | Unified Python scraper | All 7: Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg | High | Public deal aggregator since 2006, no bot protection. Structured deal data with prices and discounts. Single source ensures consistent data format across all stores. |

**Deprecated sources (archive only, not used):**
- migros-api-wrapper (old Migros API wrapper) — replaced by aktionis.ch
- Direct Coop scraper — replaced by aktionis.ch

**Data source policy:** Only publicly available data is used. No scraping of bot-protected sites. This is a legal and ethical requirement.

### Deal Schedule (validated April 2026)

Most Swiss supermarkets operate on a **Thursday → Wednesday** weekly deal cycle.
- Stores publish deals online: **Wednesday afternoon/evening**
- Pipeline trigger: **Wednesday 21:00 UTC (22:00 CET)** — after stores publish
- Verification fetch: **Thursday 06:00 UTC** — catch late updates before peak shopping
- Peak shopping days: **Thursday, Friday, Saturday** (Sunday all stores closed)

### Data Model (Supabase tables)

**products** (stable product identity across weeks)
- id, store (migros/coop/lidl/aldi/denner/spar/volg), canonical_name (normalized), source_name (raw from API)
- brand (extracted: M-Budget, Naturaplan, Prix Garantie, Denner own brand, etc.)
- quantity, unit (parsed: "1l", "250g", "4x150g")
- category (fresh/long-life/non-food), sub_category (dairy, meat, drinks, cleaning, etc.)
- is_organic (detected from: bio, naturaplan, demeter, knospe)
- product_group_id (FK — links equivalent products across stores)
- regular_price (non-promotional shelf price, when available)
- first_seen_at, updated_at

**product_groups** (cross-store matching reference data)
- id, name (e.g., "milk-whole-1l"), display_name ("Whole Milk 1L")
- search_keywords (array — for favorites matching)
- category, sub_category
- ~30-40 groups initially, seeded from starter pack items

**deals** (weekly promotions — one row per product per week)
- id, product_id (FK), store (migros/coop/lidl/aldi/denner/spar/volg)
- product_name, category, sub_category
- original_price, sale_price, discount_percent (non-null, calculated if missing)
- valid_from, valid_to, image_url, fetched_at

**baskets**- id (UUID, unguessable), name, created_at, email (optional)

**basket_items**- basket_id, product_group_id (preferred) or product_keyword (fallback), category

**Sub-categories** (15-20 flat, not hierarchical):
dairy, meat, poultry, fish, bread, fruit, vegetables, eggs, deli, ready-meals, pasta-rice, canned, drinks, snacks, chocolate, coffee-tea, condiments, frozen, cleaning, laundry, personal-care, paper-goods, household

**Pipeline metadata extraction** (runs during weekly fetch):
- Brand extraction from product name
- Quantity + unit parsing (regex)
- Organic detection (keyword list)
- Sub-category assignment (keyword rules)

See `docs/product-data-architecture.md` for full schema, migration plan, and matching logic.

### Data Pipeline

- **Frequency:** Weekly (Wednesday evening, 21:00 UTC), with Thursday morning verification
- **Runtime:** GitHub Actions cron job (free for public repos), matrix of 8 jobs (coop, coop-megastore, migros, lidl, aldi-suisse, denner, spar, volg)
- **Process:** Unified Python scraper fetches all 7 stores from aktionis.ch -> run.ts discovers per-store JSON files dynamically -> normalizes -> extracts metadata -> categorizes -> resolves product -> upserts into Supabase
- **Fallback:** If a store's scrape fails, show "[Store] data unavailable this week" (graceful degradation per store — other stores unaffected)

---

## 6b. Data Scope and Limitations (Transparency)

basketch compares **weekly promotions**, not regular shelf prices. This is a deliberate product choice, not a limitation.

| What basketch compares | What basketch does NOT compare |
|------------------------|-------------------------------|
| Promotional/sale prices from all 7 stores | Regular shelf prices across stores |
| Discount percentages (% off) from all stores | "Which store is cheaper overall for milk" |
| Number and depth of promotions per category | Full product catalogs |
| Which of YOUR items are on promotion this week | Which store has the lowest regular price |

**Why promotions, not prices:**
- Regular prices are **stable and learnable** — you already know Migros milk costs ~CHF 1.80
- Promotions **change every week** and are unpredictable — that's where a tool adds value
- Promotions are the **trigger for store-switching** — nobody changes stores for 5 Rappen, but 40% off chicken changes the plan
- The comparison is **perfectly fair** — all 7 stores' data comes from the same source (aktionis.ch) in the same format

**Data uniformity (a strength of the multi-store pivot):**
- All 7 stores provide promotional data only via aktionis.ch — no regular prices, no full catalogs
- This eliminates the data asymmetry problem: every store is compared on identical terms
- No asterisks, no "data may be incomplete" disclaimers for any store

See `docs/data-capability-analysis.md` for the full technical analysis of the data source.

---

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Load time** | < 2 seconds on 4G |
| **Mobile-first** | Works on phone browser, no app needed |
| **Store identity through color** | Each store has a distinct brand color (Migros orange, Coop green, LIDL blue, ALDI navy, Denner red, SPAR green, Volg blue). Users must never need to read text to know which store a deal belongs to. Color is the primary differentiator across deal cards, verdict banners, category headers, and split lists. All other UI colors are neutral. |
| **Accessibility (WCAG 2.1 AA)** | 4.5:1 contrast ratio for normal text, 3:1 for large text. 44x44px minimum touch targets. All interactive elements keyboard accessible. Focus states visible. Screen reader support (aria-labels on buttons, semantic HTML). No information conveyed by color alone — store-colored elements must also have text labels. |
| **Social sharing (OG meta tags)** | All pages must include Open Graph tags (`og:title`, `og:description`, `og:url`, `og:image`) for WhatsApp/social link previews. Without these, shared links appear as bare URLs — breaking the WhatsApp growth channel. Social preview image: 1200x630px with basketch branding. Also: `twitter:card`, `canonical`, `theme-color`, `apple-touch-icon`. |
| **Data freshness visibility** | Every page showing deals must display when data was last updated (e.g., "Deals updated: Thu 10 Apr"). If data is > 7 days old, show amber warning: "Deals may be outdated — last updated [date]". If one store's data is missing: "[Store] data unavailable this week". Users must always know how fresh the data is. |
| **No login** | Baskets accessed via unique URL, no account creation |
| **Cost** | CHF 0/month (all free tiers) |
| **Privacy** | No tracking beyond basic analytics. No personal data stored except optional email. |
| **Availability** | Best-effort (free hosting). Acceptable downtime. |
| **Language** | English UI (V1). German product names from source data. German UI added later if demand exists. |

---

## 8. Success Metrics

### North Star Metric
**Weekly comparison rate** — % of active baskets that viewed a comparison this week. This captures retention and core value delivery: are people coming back to check their promotions?

Formula: (baskets that viewed a comparison this week) / (total baskets created) × 100. Target: 50%+ after month 2.

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
| Unprompted shares | 2-3 friends sharing verdict cards in WhatsApp groups | Organic — watch for it |
| Verdict screenshots shared | 5+/week in WhatsApp groups | Track via "Copy card" button usage |
| SEO organic visitors | 50+/week | 3 months post-launch |

### Kill Criteria (Annie Duke Framework)

Define in advance what evidence would make us stop, pivot, or change course:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Data quality | < 70% of deals correctly categorized after keyword rules | Pause frontend work, fix pipeline first |
| Friends beta retention | < 3 out of 10 friends return in week 2 | Investigate — is it the product or the habit? |
| PMF survey | < 20% "Very Disappointed" | Pivot: either comparison is not useful, or favorites matching is wrong |
| Verdict trust | 3+ users say "the verdict felt wrong" | Revisit formula before iterating on features |
| Pipeline reliability | 2+ consecutive weeks of failed fetches | Fix infrastructure before adding features |
| Onboarding drop-off | > 60% of visitors leave before selecting a starter pack | Redesign onboarding �� templates may not resonate |
| Store false negatives | 3+ users report a store had a deal basketch missed | Investigate aktionis.ch scraping coverage for that store. If data is correct, improve UI messaging. If data is wrong, fix pipeline. |
| Favorites ignored | 80%+ traffic to /deals vs /compare after week 4 | Favorites concept may not resonate — consider making /deals the primary experience |

---

## 9. Out of Scope (for now)

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
| Migros API requires auth/key we can't get | ~~Medium~~ Resolved | ~~High~~ | Fully resolved: now using aktionis.ch for all stores including Migros. migros-api-wrapper deprecated. |
| Coop blocks scraping | ~~High~~ Resolved | ~~High~~ | Fully resolved: now using aktionis.ch for all stores including Coop. No direct scraping of any store website. |
| Low user adoption | Medium | Low | This is a real product for a tiny audience. If 5 friends use it weekly, it's a success. The PM documentation demonstrates the skill regardless. |
| Data categorization is wrong | Medium | Medium | Start with manual category mapping for top 100 products, automate later |
| Supermarket changes promotion schedule | Low | Low | Adjust cron job timing |
| Regular prices unavailable for most stores | High | High — cannot show "which store is cheaper overall," only "which store has promotions" | basketch is a promotions comparison tool, not a price comparison tool. This is a deliberate product choice: promotions change weekly (unpredictable), regular prices are stable (learnable). The tool's value is in the unpredictable information. Using aktionis.ch for all stores makes this a strength: every store is compared on identical promotional data. |

---

## 11. Competitive Landscape

| Competitor | What they do | Favorites? | basketch differentiation |
|-----------|-------------|-----------|------------------------|
| Rappn.ch | 10K+ offers from 7 Swiss retailers | Category-level favorites | No personalized side-by-side comparison |
| Aktionis.ch | Deal aggregator, 94K monthly visits | Wishlist + price alerts | Aging (3.2 stars), no personalized comparison |
| Profital.ch | Digital flyers, 830K downloads | Favorite stores only | No product-level tracking or comparison |
| Bring! | Shopping lists, 20M users | Full list management | No price data or deal tracking |

**basketch's differentiation:** Personal favorites → personalized deal comparison across 7 stores → split shopping list. No Swiss app currently combines personal product tracking with cross-store deal comparison and a weekly verdict.

---

## 12. Open Questions

### Resolved

| # | Question | Answer | Date |
|---|----------|--------|------|
| 1 | Does `search-api.migros.ch/discounts` return useful data without auth? | No — requires client key. Originally used migros-api-wrapper; now deprecated in favour of aktionis.ch for all stores. | 9 Apr 2026 |
| 2 | Can we intercept Coop's internal API? | Not viable — DataDome blocks all automated access. Now using aktionis.ch for all stores. | 9 Apr 2026 |
| 5 | Should the UI be German-first or English-first? | English UI for MVP. German product names come from source data. German UI later if demand exists. | 9 Apr 2026 |
| 6 | Verdict weighting: deal count vs discount depth? | 40% deal count / 60% average discount depth. Tie threshold: 5%. | 12 Apr 2026 |
| 7 | How many starter packs? | 5 packs: Swiss Basics, Indian Kitchen, Mediterranean, Studentenküche, Familientisch. Custom list via search also available. | 12 Apr 2026 |
| 8 | Is deals browsing page separate phase? | No — build everything together. No phasing. | 12 Apr 2026 |
| 9 | Primary return path: email or URL? | Both are primary. URL for bookmarkers, email for users who clear browsers or switch devices. Neither is a fallback. | 12 Apr 2026 |
| 10 | Should verdict show explanation? | Yes — show deal count + avg discount under verdict. Minimum 3 deals per store per category before showing verdict. | 12 Apr 2026 |
| 11 | Growth strategy: SEO or WhatsApp? | Both. SEO is long-term (weekly content, German keywords). WhatsApp verdict card ("Wordle card") is immediate sharing. No conflict, zero extra cost. | 12 Apr 2026 |
| 12 | German UI? | No — friends don't speak German well. English UI is correct for this audience. | 12 Apr 2026 |
| 13 | Portfolio project or real product? | Both: "A real product for a tiny audience, documented like a portfolio project." | 12 Apr 2026 |
| 14 | Value proposition: prices or promotions? | Promotions only. basketch compares weekly promotions, not regular prices. This is a deliberate product choice (regular prices unavailable for most stores, promotions are the weekly decision trigger). | 12 Apr 2026 |
| 15 | Should basketch expand beyond Migros and Coop? | Yes — pivoted to 7 stores (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg). Unified aktionis.ch scraper covers all stores with consistent data. Default comparison: Migros, Coop, Denner. Users choose which stores to compare. | 15 Apr 2026 |

### Still Open

3. How do we accurately categorize products into the 3 buckets? (Store category taxonomies from aktionis.ch may not match ours) — To resolve during M0 (data pipeline build).
4. Is `basketch.ch` domain available? (Check at nic.ch) — Low priority, using basketch.vercel.app.
