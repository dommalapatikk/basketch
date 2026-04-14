# Product Spec: Multi-Store Expansion
## basketch — All Swiss Stores on aktionis.ch

**Author:** Kiran Dommalapati
**Version:** 1.0
**Date:** 14 April 2026
**Status:** Draft — for review and implementation planning

---

## 1. Problem Statement

### Current limitation

basketch compares deals between Migros and Coop only. This made sense as a starting point — they are the two dominant Swiss supermarkets and cover the majority of Swiss shoppers. But it means:

- **LIDL, ALDI Suisse, and Denner are invisible.** These three discount retailers frequently run the deepest promotions in Swiss grocery. A user who only checks Migros and Coop will routinely miss 30-50% off deals at ALDI or LIDL.
- **The comparison is incomplete by design.** "Cheapest deal" is a claim basketch cannot yet make — it only knows two stores. The current verdict ("More fresh deals at Migros") is a useful insight, but a limited one.
- **The scraping infrastructure already routes through aktionis.ch.** Coop data already comes from `aktionis.ch/vendors/coop`. Eight other stores are available on the same platform, using the same structure, with no additional access barriers.

### The opportunity

aktionis.ch publishes weekly promotions for 9 Swiss retailers:

| Store | URL | Type |
|-------|-----|------|
| Coop | /vendors/coop | Full-range supermarket |
| Coop Megastore | /vendors/coop-megastore | Large-format non-food-heavy |
| Migros | /vendors/migros | Full-range supermarket |
| LIDL | /vendors/lidl | Discount supermarket |
| ALDI Suisse | /vendors/aldi-suisse | Discount supermarket |
| Denner | /vendors/denner | Discount supermarket / alcohol specialist |
| SPAR | /vendors/spar | Convenience / neighbourhood supermarket |
| OTTO'S | /vendors/otto-s | Non-food general merchandise |
| Volg | /vendors/volg | Rural convenience / village store |

All 9 stores publish on the same Thursday → Wednesday cycle. The pipeline infrastructure and Supabase schema need extension, not rebuilding.

### Why now

The original PRD listed "Add Aldi, Lidl, Denner" as a future item, triggered by user demand. The trigger is now structural, not demand-driven: because all data flows through the same source (aktionis.ch), the marginal cost of adding stores 4-9 is much lower than it was for stores 1-2. Not adding them means leaving the core value proposition incomplete by choice.

The USP of basketch is: **"Which of MY items are on sale this week, and at which store?"** That question is only fully answered when we check all stores.

---

## 2. Key Product Decisions

These are the decisions this spec makes. Record them here so they do not drift into open questions later.

### Decision 1: Coop and Coop Megastore — Merge

**Decision: Treat as one store (Coop). Do not create a separate Coop Megastore entry.**

Reasoning:
- Coop Megastore is a large-format Coop, not a separate brand. Swiss shoppers do not distinguish them.
- Showing two "Coop" entries would confuse users and split the deal count artificially.
- Promotions from Coop Megastore may duplicate Coop promotions — merging avoids showing the same deal twice.
- Implementation: scrape both `/vendors/coop` and `/vendors/coop-megastore`, deduplicate by product name + price before upsert. Store value remains `coop`.

### Decision 2: OTTO'S — Exclude from MVP

**Decision: Exclude OTTO'S from MVP. Revisit in V2 if demand exists.**

Reasoning:
- OTTO'S sells non-food general merchandise (garden tools, luggage, toys, seasonal goods). It is not a grocery store.
- basketch's categories (Fresh / Long-life food / Non-food household) include cleaning and personal care — but OTTO'S does not stock those categories either.
- Including OTTO'S would add noise without adding grocery value. Users comparing milk prices do not need a camping chair promotion.
- If basketch later expands into a broader household deal comparison (not just grocery), revisit.

### Decision 3: Volg and SPAR — Include, with reduced confidence

**Decision: Include Volg and SPAR, but flag that deal volume may be low.**

Reasoning:
- Both are genuine grocery stores (full food range).
- Volg is important for rural Swiss users — it may be the only nearby supermarket.
- SPAR operates in train stations, airports, and city convenience locations — relevant for urban users.
- Low deal volume is not a reason to exclude. It is a reason to set correct expectations in the UI (see Section 4: UX).

### Decision 4: Recommendation logic — "Cheapest at [store]", not "Buy at Migros"

**Decision: Replace the two-store verdict with a per-item "cheapest store" recommendation.**

Current logic: "More fresh deals at Migros, more household deals at Coop."
New logic: For each favorited item, show the store with the lowest sale price this week.

This requires a price-aware comparison, not a deal-count comparison. The verdict formula (40% count + 60% avg discount) remains valid for the **category-level summary**, but the **per-item recommendation** must be price-based:

- If milk is on sale at both Migros (CHF 1.50) and ALDI (CHF 1.20), the recommendation is "Cheapest at ALDI — CHF 1.20 (was CHF 1.80, −33%)."
- If only one store has a deal, it is "On sale at [store] — CHF X (−Y%)."
- If no store has a deal, it is "Not on promotion this week at any store."

### Decision 5: The "split shopping list" becomes a multi-store routing list

Current output: "Buy X at Migros / Buy Y at Coop."
New output: "Buy X at ALDI / Buy Y at Migros / Buy Z at Coop."

The split list must group by store (not by item). Users should be able to plan one trip per store — not see a list of 15 items each with a different store name.

**UI rule:** Items with no deal this week appear in a collapsed "Nothing on sale this week" section at the bottom. Do not hide them — users need to know the list is complete.

---

## 3. User Stories

### US-MS-1: Multi-store deal browsing (zero setup)

As a shopper browsing deals, I want to see this week's promotions from all major Swiss supermarkets in one place, so I can spot deals I would otherwise miss at ALDI, LIDL, or Denner.

**Acceptance criteria:**
- Deals page shows promotions from Coop, Migros, LIDL, ALDI, Denner, SPAR, and Volg
- Each deal card clearly shows which store it belongs to (store color + store name label)
- Category filter works across all stores
- If a store has no deals this week, it is omitted from that category section (not shown as an empty column)

### US-MS-2: Best price recommendation (personalized)

As a shopper with a favorites list, I want to see which store has the cheapest deal for each of my regular items this week, so I know exactly where to buy each thing.

**Acceptance criteria:**
- For each favorited item, show the lowest-priced deal available across all stores
- Show store name, sale price, original price, and discount %
- If multiple stores have the same item on promotion, show all of them ranked by price (cheapest first)
- If no store has the item on promotion, show "Not on promotion this week at any store"

### US-MS-3: Multi-store shopping list

As a shopper planning the weekend, I want a shopping list split by store ("Buy at ALDI: X, Y / Buy at Migros: Z"), so I can plan which stores to visit and what to get at each.

**Acceptance criteria:**
- List is grouped by store, not by item
- Only shows stores where the user has at least one item on deal
- Items with no deal appear in a collapsed "Nothing on sale" section below the grouped list
- User can copy or share the list

### US-MS-4: Store coverage transparency

As a shopper, I want to know which stores are being checked each week, so I trust that the comparison is complete.

**Acceptance criteria:**
- About page lists all stores basketch checks, with their aktionis.ch source
- Deals page shows a "Checked this week: 7 stores" or equivalent indicator
- If a store's scrape fails, show "[Store] data unavailable this week" — not silence

### US-MS-5: Discount retailer deals surface prominently

As a budget-conscious shopper, I want ALDI and LIDL deals to appear alongside Migros and Coop deals, so I do not miss the best promotions because I assumed the discount stores are not worth checking.

**Acceptance criteria:**
- ALDI and LIDL deals appear in all category views alongside Coop and Migros
- Sort order within a category is by discount % descending (store-agnostic)
- No visual hierarchy that implies Migros/Coop are "primary" stores

### US-MS-6: Onboarding covers all stores from day one

As a new user setting up favorites, I want my starter pack to match against all stores from the start, so my first comparison is as complete as possible.

**Acceptance criteria:**
- Onboarding flow does not mention "Migros and Coop" specifically — it references "Swiss supermarkets" or "all major stores"
- Comparison page shows all stores where a favorite item has a deal, not just Migros and Coop
- Starter pack copy is updated to remove Migros/Coop-specific references

### US-MS-7: Weekly category verdict updated for N stores

As a returning user, I want to see a weekly verdict that summarizes where the best deals are this week across all stores, so I know at a glance where to go.

**Acceptance criteria:**
- Verdict banner updated from "Migros vs Coop" to a multi-store summary
- Per-category winner is the store with the highest combined score (existing formula: 40% count + 60% avg discount)
- Verdict text is human-readable: "Best fresh deals this week: ALDI" or "Fresh deals split between Migros and Coop"
- Verdict explanation line shows deal count + avg discount per store (not just per winner)

---

## 4. MVP Scope

### In scope

| Feature | Notes |
|---------|-------|
| Scrape all 7 stores (Coop, Migros, LIDL, ALDI, Denner, SPAR, Volg) | Coop Megastore merged into Coop. OTTO'S excluded. |
| Deduplicate Coop + Coop Megastore deals before upsert | Match on normalized product name + price |
| Store field in database extended from `migros\|coop` to include all 7 stores | Schema migration required |
| Store colors and labels for all 7 stores | New color tokens required (see Section 4b) |
| Per-item cheapest-store recommendation on /compare | Replaces two-column Migros/Coop comparison |
| Multi-store split shopping list on /compare | Grouped by store, with collapsed "no deals" section |
| Deals browsing page updated for N stores | No fixed column layout — card-based, store-tagged |
| Category verdict updated for N stores | Existing formula, new display |
| Store coverage transparency on About page | List all stores, link to aktionis.ch |
| Onboarding copy updated (remove Migros/Coop-specific language) | |
| Data freshness shown per store | "[Store] unavailable this week" if scrape fails |

### Out of scope for MVP

| Feature | Reason |
|---------|--------|
| OTTO'S | Non-grocery — Decision 2 above |
| Price history across stores | Added complexity, not needed for weekly comparison |
| "Which store is cheapest overall" (non-promotional prices) | Data still unavailable for most stores |
| Regular price comparison | Same constraint as current — promotions only |
| Store locator / distance from user | Out of basketch's scope |
| Per-store availability by region | All stores treated as nationally available for now |
| Deal alerts when a specific item appears at a new store | Phase 2+ |

---

## 4b. Store Colors and Identity

With 7 stores, the current two-store color system (Migros orange, Coop green) must expand. Every deal card and store label must have a distinct, brand-accurate color. Color is never the only differentiator — store name label is always present.

| Store | Background | Text on white | Notes |
|-------|-----------|--------------|-------|
| Migros | #e65100 | #c54400 | Existing — unchanged |
| Coop | #007a3d | #006030 | Existing — unchanged |
| LIDL | #0050aa | #003d82 | Lidl blue |
| ALDI Suisse | #00508f | #003d6e | ALDI dark blue |
| Denner | #e30613 | #b00010 | Denner red |
| SPAR | #007e3a | #005c2b | SPAR green (distinct from Coop green in hue) |
| Volg | #c8102e | #9e0020 | Volg red (distinct from Denner in hue) |

WCAG 2.1 AA contrast must be verified for all new colors before implementation. If SPAR green is too close to Coop green visually, adjust the hue toward teal. Store name label is always shown — color is an accelerator, not the only signal.

---

## 5. UI: How to Handle 7 Stores

The current UI is designed around two stores in a side-by-side column layout. That layout does not scale to 7. These are the required changes.

### 5a. Deals browsing page (/deals)

**Current:** Two columns — Migros | Coop — per category.
**New:** Card grid, store-tagged. Each deal card shows its store via color chip + store name label. No column structure.

- Filter by category (existing pill-style toggles — unchanged)
- Filter by store (new: multi-select pill row with store logos or colored pills)
- Default: all stores shown
- Sort within results: by discount % descending (store-agnostic)
- If a store has no deals in a category: it is not shown. No empty columns.
- 50-deal cap per category, "Show more" expansion — unchanged

**Mobile:** Single-column card grid. Store filter pills scroll horizontally. This is the primary layout — desktop is the secondary.

### 5b. Compare page (/compare/:favoriteId)

**Current:** Three sections — "On sale at Migros" / "On sale at Coop" / "No deals this week"
**New:**

1. **Best deal for each item** — one row per favorite item, showing:
   - Item name
   - Best deal badge: store chip (color + name) + sale price + discount %
   - If multiple stores have it: expand to show all, ranked by price
   - If no deal: greyed out row with "Not on promotion this week"

2. **Shopping list section** — collapsible, grouped by store:
   - "Buy at ALDI (3 items): milk, butter, yogurt"
   - "Buy at Migros (2 items): bread, chicken"
   - "Nothing on promotion (4 items): pasta, coffee..." — collapsed by default, user can expand

3. **Data footer** — "Checked 7 stores. Last updated: Wed 16 Apr. [Store] data unavailable this week." if any store failed.

### 5c. Home page verdict banner

**Current:** "More fresh deals at Migros, more household deals at Coop this week"
**New:** Per-category winner format:

> "This week: Best fresh deals at ALDI — Best household deals at Coop — Best long-life deals at Migros"

Or, if one store dominates:

> "This week: LIDL leads on fresh, Coop leads on household."

Keep it to one sentence. Do not list all 7 stores — name only the winner(s). Explanation line below shows deal counts per store in that category.

**Wordle card:** Update to reflect multi-store winner. "Best deals this week by category" with one winner per row.

---

## 6. Data and Pipeline Changes

### 6a. Database schema changes

**`deals` table — `store` field:**
Current: `store TEXT CHECK (store IN ('migros', 'coop'))`
New: `store TEXT CHECK (store IN ('migros', 'coop', 'lidl', 'aldi', 'denner', 'spar', 'volg'))`

Migration: alter constraint, no data loss.

**`products` table — `store` field:** Same change.

**No new tables required.** The existing schema (products, deals, product_groups, baskets, basket_items) handles N stores.

### 6b. Pipeline changes

**New scrapers required (Python, same pattern as Coop scraper):**
- `pipeline/lidl/` — scrapes `/vendors/lidl` on aktionis.ch
- `pipeline/aldi/` — scrapes `/vendors/aldi-suisse`
- `pipeline/denner/` — scrapes `/vendors/denner`
- `pipeline/spar/` — scrapes `/vendors/spar`
- `pipeline/volg/` — scrapes `/vendors/volg`
- Update `pipeline/coop/` — also fetch `/vendors/coop-megastore`, deduplicate before returning

**`run.ts` changes:**
- Add all new sources to the parallel fetch array
- Graceful degradation per source: if one store fails, others continue — do not abort
- Log per-store deal count and fetch status to pipeline_runs metadata

**GitHub Actions (`pipeline.yml`):**
- No structural changes needed — existing parallel fetch + Supabase upsert loop handles N sources
- Add store names to the run summary log

### 6c. Verdict calculation — multi-store

The existing formula (40% deal count + 60% avg discount) works for N stores. The calculation runs per-store per-category. Winner is the store with the highest score. No formula change needed.

**New: per-item cheapest deal selection**
For each basket_item on /compare:
1. Fetch all deals this week matching the item keyword, across all stores
2. Sort by sale_price ascending
3. Return the full list — UI shows cheapest first, with option to expand others

---

## 7. Success Metrics

These replace and extend the existing metrics where the pivot changes what we are measuring.

### Primary metric (unchanged)

**Weekly comparison rate:** % of active baskets that viewed a comparison this week. Target: 50%+ after month 2.

### New metrics for multi-store expansion

| Metric | Target | Timeframe | How to Measure |
|--------|--------|-----------|---------------|
| Store coverage | 7 stores scraped successfully each week | From launch | Pipeline run logs |
| ALDI/LIDL deal surfacing | At least 1 ALDI or LIDL deal appears in the weekly top-5 per category | Ongoing | Manual spot-check weekly |
| Per-item best-deal accuracy | 0 reported mismatches between basketch recommendation and store website | First 4 weeks | User feedback + manual spot-check |
| Onboarding completion (updated copy) | No drop in completion rate vs baseline | First 2 weeks post-launch | Vercel Analytics |
| "Best store this week" NPS question | 70%+ of beta users say "the recommendation was accurate" | Week 4 | Survey of 10 friends |

### Unchanged metrics

- Activation rate: 30%+ (5+ favorites + view comparison)
- W4 retention: 40%+
- Pipeline reliability: updated every Thursday by 20:00
- Page load: < 2 seconds on 4G

---

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| aktionis.ch structure differs between stores | Medium | Medium | Test all 7 store URLs before building scrapers. Map field differences. Coop scraper is proof the site is scrapeable — others should follow the same pattern. |
| SPAR/Volg have very few deals | High | Low | Low deal count is a display problem, not a data problem. Show what exists. If a store has < 3 deals in a category, omit it from that category's verdict (same rule as current minimum threshold). |
| Denner skews toward alcohol/spirits | Medium | Low | Category assignment handles this — alcohol goes into long-life food. Verdict per-category is unaffected. No special handling needed. |
| Color confusion: SPAR green vs Coop green | High | Medium | Verify colors visually before shipping. Adjust SPAR hue toward teal if needed. Store name label is always present — color is an accelerator only. |
| Coop Megastore deduplication misses some deals | Medium | Low | Use normalized product name + sale price + valid_from as dedup key. Log deduplicated count per run for monitoring. |
| Per-item cheapest recommendation is wrong (price match error) | Low | High | Manual spot-check 5 items per week for first month. If user reports mismatch: fix pipeline, not UI. |
| Pipeline runtime increases with 5 new scrapers | Medium | Low | Scrapers run in parallel. Add 5 lightweight scrapers should add < 60 seconds to total runtime. Monitor run duration in Actions logs. |
| aktionis.ch adds bot protection | Low | High | Monitor scrape success rate per run. If blocked: evaluate alternative sources (store apps, RSS feeds). Coop.ch already blocked — aktionis.ch has been public since 2006 with no sign of protection. |
| Onboarding copy change reduces activation | Low | Medium | A/B test is overkill for 10-50 users. Ship the change, monitor completion rate for 2 weeks, revert if rate drops by > 10 percentage points. |

---

## 9. Open Questions

| # | Question | Owner | Target resolution |
|---|----------|-------|-----------------|
| 1 | Do LIDL, ALDI, Denner, SPAR, and Volg all use the same aktionis.ch HTML structure as Coop? | Engineering | Before build starts — test all 5 URLs manually |
| 2 | Does Denner publish weekly deals on the same Thursday → Wednesday cycle, or a different cadence? | PM | Check aktionis.ch Denner page manually |
| 3 | Does Volg have enough weekly deals to be worth including? (If < 5 deals/week, it adds noise without value) | PM | Check aktionis.ch Volg page manually — if < 5 deals for 3 consecutive weeks, defer to V2 |
| 4 | What is the Vercel/Supabase free tier impact of 3.5x more deals per week? | Engineering | Estimate deal volume increase. Supabase free tier: 500MB storage, 2GB transfer. Check if still within limits. |
| 5 | Should the shopping list default to "minimize stores visited" (fewest stops) or "maximize savings" (best deals regardless of how many stops)? | PM — resolve before building /compare UI | Current assumption: maximize savings. Revisit if users say "I don't want to go to 5 stores." |

---

## 10. What This Spec Does Not Change

These decisions from the existing PRD are carried forward unchanged:

- **Promotions only, not regular prices.** basketch compares weekly promotions. We do not claim to know which store is cheapest overall. This constraint applies to all 7 stores.
- **No login required.** Baskets accessed via unique URL. Email optional.
- **English UI.** All store names displayed in their standard form (ALDI Suisse, not "ALDI").
- **Mobile-first.** Primary layout is mobile. Desktop is secondary.
- **WCAG 2.1 AA.** All new store colors must meet contrast requirements.
- **Wednesday 21:00 UTC pipeline trigger.** All 7 stores publish on the same cycle.
- **Graceful degradation.** If one store fails, others continue. User sees "[Store] data unavailable this week."
- **Free tier constraint.** CHF 0/month. No new paid services.
