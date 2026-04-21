# Product Specification: basketch

**Author:** Kiran Dommalapati
**Date:** 9 April 2026
**Version:** 2.1
**Updated:** 21 April 2026
**Scope:** V1 — Bern region

> **What changed in v2.1 (21 Apr 2026):** Unified experience shipped. The onboarding form is no longer the primary entry point. Users now build their list directly from the Deals page using add/remove toggles. "My List" nav goes to /deals for new users (not /onboarding). UC-1b updated. UC-11 promoted to Must-have. New UC-12: Unified deals+list experience added. See `docs/human-tester-guide.md` for current test scenarios.

---

## 1. Product Goal

### Vision
Every Swiss shopper knows where the promotions are — before leaving the house.

### Product Goal
Help a Bern-based shopper see which of their regular products are on promotion this week across Swiss supermarkets — and where the strongest deals are. Setup in under 60 seconds, weekly check in under 30 seconds. Plus browse all weekly promotions by category at their selected stores, side-by-side.

**Tagline:** "Your weekly promotions, compared. 7 stores, one view."

**What basketch is:** A promotions comparison tool — showing which of your items are on sale where this week.
**What basketch is NOT:** A price comparison tool — it does not compare regular shelf prices across stores. See PRD Section 6b for why this is a deliberate product choice.

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to answer "Where should I shop this week?" | < 30 seconds | User testing (5 friends) |
| Weekly returning visitors | 20+ within 3 months | Vercel Analytics |
| Data freshness | Updated every Thursday by 20:00 CET | GitHub Actions logs |
| Page load (mobile, 4G) | < 2 seconds | Lighthouse audit |

### North Star Metric

**Personalized comparisons viewed** — unique users who view their favorites comparison in a distinct week.

Why this metric:
- It captures the core value delivered: seeing which of YOUR products are on sale, and where
- It is a leading indicator of retention (if people keep viewing their comparison, they find value)
- It is actionable (improve comparison quality, freshness, starter pack templates)
- It reflects customer value, not vanity (per Elena Verna's data hierarchy)

### Activation Metric

**Definition:** User adds 5+ favorites and views their first personalized comparison.

**Target:** 40%+ activation rate (higher than generic product because Starter Pack removes friction).

**Why this matters:** Per Lauryn Isford (Head of Growth, Airtable): "It's better to be precise and see a low activation rate among users with high likelihood of long-term value than to go broad." The Starter Pack pre-loads 15-20 items, so reaching 5+ favorites requires only removing items the user doesn't buy — near-zero effort.

### Retention Targets

| Timeframe | Target | Benchmark basis |
|-----------|--------|-----------------|
| W1 retention (return in week 2) | 50%+ | Free utility, zero switching cost |
| W4 retention (return in week 4) | 40%+ | Consumer transactional "good" = 30%, adjusted up for zero commitment |
| Curve shape | Flattening by W4 | Casey Winters: "If it flattens, there is a group finding value = PMF" |

**How to measure:** Cohort by first-visit week. Track unique visitors per week. W4 retention = users active in week 4 / users who first visited in week 1.

### PMF Measurement Plan

After 4 weeks of usage by 10 friends, ask three questions (adapted from Sean Ellis + Matt Gallivan / Slack research methodology):

| # | Question | PMF signal |
|---|----------|------------|
| 1 | "How would you feel if you could no longer see your personalized comparison on basketch?" (Very Disappointed / Somewhat / Not) | Sean Ellis test: 40%+ "Very Disappointed" = PMF |
| 2 | "Compared to checking Migros and Coop websites yourself, basketch is:" (Much Better / Somewhat / Neither / Worse) | Alternatives comparison — need "Much Better" majority |
| 3 | "Last Saturday, did you check basketch before shopping?" | Behavioural verification — did they actually use it? |

**Additional PMF signals to watch:**
- Unprompted sharing: if 2-3 friends share basketch with their friends without being asked (Merci Victoria Grace, ex-Slack: "Organic growth is the key indicator of PMF")
- The "broken product" test: if the pipeline breaks and people message you asking where the deals are (Elad Gil: "If your product is broken and people are still using it, that's PMF")

---

## 2. Personas

### Primary Persona: "Sarah" — The Pragmatic Weekend Shopper

| Attribute | Detail |
|-----------|--------|
| **Age** | 30-45 |
| **Location** | Bern city or greater Bern area |
| **Household** | Lives with partner or small family (2-4 people) |
| **Income** | Middle income. Not struggling, but conscious about spending. |
| **Language** | Multilingual (Switzerland has 4 national languages). Comfortable with English digital products. |
| **Tech comfort** | Uses smartphone daily. WhatsApp, SBB app, Twint. Doesn't install apps unless necessary. |

**Shopping behaviour:**
- Shops once a week, usually **Saturday morning**
- Has both a Migros and a Coop within 10 minutes
- Buys a mix: fresh food for the week + restocks pantry/household when deals are good
- Willing to split the trip across multiple stores **if the promotions are clear and easy to see**
- Currently picks one store based on habit or proximity, occasionally checks the other

**Goals:**
1. Catch the best promotions each week without spending extra time checking multiple stores
2. Know in advance which store has more promotions this week — for each type of shopping
3. Stock up on long-life and household items when they're significantly discounted

**Frustrations:**
1. "I don't have time to check two websites and compare promotions manually."
2. "Migros and Coop both have weekly deals, but I never know which one has more this week."
3. "I only find out about a deal after I've already bought it at the other store."
4. "The supermarket apps and websites are cluttered — I don't want to scroll through 200 items to find what matters."

**Quote:** *"Just tell me: which store this week? For what?"*

### Secondary Persona: "Marco" — The Deal Hunter

| Attribute | Detail |
|-----------|--------|
| **Age** | 25-35 |
| **Location** | Bern area |
| **Household** | Single or shared flat |
| **Shopping style** | Buys less frequently, but bulk-buys when deals are strong |
| **Behaviour** | Checks promotions intentionally. Will go out of his way for a good deal on coffee, chocolate, or detergent. |

**Goals:**
1. Find the best bulk-buy deals each week (non-food, long-life items)
2. Know exactly what's on sale before going to the store
3. Share deals with flatmates

**Frustrations:**
1. "The Coop and Migros websites don't make it easy to compare across stores."
2. "I want to see the discount percentage, not just the sale price."
3. "I wish someone would just send me the good deals each week."

### Anti-Persona: Who This Is NOT For

| Profile | Why not |
|---------|---------|
| Price-obsessed optimizer who compares regular shelf prices across stores | basketch covers 7 Swiss supermarkets but shows promotions only, not regular prices. Power users need a price comparison tool. |
| Tourist or non-resident | Site assumes familiarity with Swiss stores and German product names. |
| Someone who only shops at one store by principle | No comparison needed — they already decided. |

---

## 3. Jobs to Be Done

| # | When... | I want to... | So I can... |
|---|---------|-------------|-------------|
| **JTBD-1** | I'm setting up basketch for the first time | quickly select my regular products from a template | start seeing personalized comparisons without manual work |
| **JTBD-2** | I'm planning my Saturday shopping | see which of MY favorites are on promotion this week and where | decide which store to visit for what |
| **JTBD-3** | I see my comparison | get a split shopping list (Migros items / Coop items) | go to each store with a clear list |
| **JTBD-4** | I want to check a specific product | search for it and see both stores' prices/deals | decide where to buy it |
| **JTBD-5** | I return next week | enter my email and instantly see this week's comparison | get the answer in under 30 seconds without re-setup |

---

## 4. User Journey Map

```
FIRST VISIT — Sarah Discovers and Builds Her List (v2.1 — Unified Experience)

Timeline: Open basketch → Browse deals → Tap + → Sticky bar → Compare → Bookmark

[Open basketch.vercel.app]
   |
   +-- Sees weekly verdict: "More fresh deals at Migros this week"
   +-- Taps "Browse all deals" → /deals page
   |
   [/deals page]
   +-- Sees all deals sorted by discount %, category tabs across top
   +-- Taps "🥬 Fruits & Vegetables" → filtered to that category
   +-- Taps + on Erdbeeren (Migros, 40% off) → turns green
   +-- Taps + on Milch (Coop, 25% off) → turns green
   +-- Sticky bar appears: "2 items in your list →"
   +-- Continues browsing, adds 5-8 items total
   |
   +-- Taps sticky bar → /compare/:id
   |
   [/compare/:id — her personal page]
   +-- Sees items grouped by category: Fruits & Veg, Dairy & Eggs, Drinks
   +-- Each category shows ALL deals from all stores that week (not just her exact item)
   +-- Taps "Copy link" → shares via WhatsApp with partner
   +-- Bookmarks the page
   |
   Total setup time: under 60 seconds. No form. No email required.


RETURN VISIT — Weekly (Under 30 Seconds)

[Open bookmark /compare/:id]
   |
   +-- Deals automatically updated since last Thursday
   +-- Sees new promotions in her categories
   +-- Goes shopping
   |
   Alternative: Tap "My List" in nav → same page
   Alternative: Go to /deals, tap + on new items → sticky bar shows updated count
```

---

## 5. Current Alternatives (What People Do Today)

Understanding what shoppers do today is critical for measuring whether basketch is "much better" (Sean Ellis PMF survey). These are the substitutes:

| Alternative | How it works | Pain points | basketch advantage |
|------------|-------------|-------------|-------------------|
| **Check Migros app manually** | Open Migros app, scroll through 100+ promotions, try to remember what's good | Time-consuming (~5 min), no comparison with Coop, information overload | Side-by-side comparison, categorised, verdict in 30 sec |
| **Check coop.ch manually** | Visit Coop website, browse promotions page | Slow site, cluttered UI, no comparison with Migros | Same as above |
| **Check both + mentally compare** | Do both of the above, try to remember which store had what | ~15 min, error-prone, mentally exhausting | Automated comparison eliminates this entirely |
| **Use aktionis.ch** | Browse the aggregator site that lists deals from multiple stores | Shows all deals but no side-by-side comparison, no verdict, no categorisation into shopping types | basketch adds the comparison layer + verdict + 3-bucket categorisation |
| **Use Rappn app** | Mobile app with 10K+ offers from multiple Swiss stores | App install required, generic listing, no personalization — browse 10K deals to find yours | basketch starts with YOUR favorites, no install, no browsing |
| **Use Profital app** | Digital leaflet viewer for Swiss retailers | App install required, shows full store leaflets — still requires manual comparison across stores | basketch extracts only your products and compares automatically |
| **Use Bring! shopping list** | Shopping list app with shared lists and some deal integration | Not a comparison tool — shows deals from one store at a time, no cross-store comparison of your items | basketch compares your items across both stores in one view |
| **Ignore deals entirely** | Just go to one store out of habit | Miss CHF 20-40/month in promotions the other store has | Catches promotions with zero extra effort |
| **Ask friends on WhatsApp** | "Hey, is anything good at Migros this week?" | Unreliable, not systematic, depends on others checking | Reliable, weekly, automated |

**Key insight:** None of the current alternatives answer the core question: *"Which of MY regular products are on sale this week, and where should I buy each one?"* They all show generic deals — basketch delivers a personalized comparison.

---

## 6. Growth Engine

### Strategy: SEO + WhatsApp + Word of Mouth

basketch is a real product for a tiny audience, documented like a portfolio project. Three growth channels, zero budget.

### Channel 1: WhatsApp Sharing (Immediate — Week 1+)

The weekly verdict is inherently shareable — like a weather forecast or a sports score.

**Two sharing mechanisms:**

| Mechanism | How it works | Effort | Growth power |
|-----------|-------------|--------|-------------|
| **Link sharing** | User taps "Share" → sends link with rich preview (OG tags) → friend taps → opens basketch | Small (standard) | Medium — requires friend to tap |
| **Screenshot sharing ("Wordle card")** | Verdict displayed as a visual card → user screenshots → posts in WhatsApp group → everyone sees the verdict WITHOUT clicking | Medium (design-focused) | **High** — zero friction, ambient awareness |

**The Wordle card concept:**

The weekly verdict is designed as a standalone visual card optimized for screenshotting:

```
┌──────────────────────────────────────────────┐
│  basketch — This Week's Promotions           │
│  Week of 7 April 2026                        │
│                                              │
│  🟠 MIGROS leads Fresh                       │
│     12 deals  |  avg 28% off                 │
│                                              │
│  🔴 COOP leads Household                     │
│     8 deals  |  avg 35% off                  │
│                                              │
│  ⚖️  Similar on Snacks & Drinks              │
│                                              │
│  basketch.ch — your weekly promotions        │
└──────────────────────────────────────────────┘
```

Sarah screenshots this, posts in her family WhatsApp group. Everyone sees the verdict without tapping anything. The basketch.ch branding drives curious people to the site.

See `docs/whatsapp-sharing-guide.md` for the full breakdown.

### Channel 2: Kickstart — Direct Sharing (Week 1-6)

| Tactic | Detail | Expected reach |
|--------|--------|---------------|
| **Friends network** | Share with 10 friends in Bern personally | 10-15 users |
| **WhatsApp groups** | Share weekly verdict card in 2-3 local groups | 20-30 impressions/week |
| **Bern subreddit / Facebook groups** | One post when live | 50-100 one-time visitors |

### Channel 3: SEO Engine (Week 4+, build from day one)

Basketch generates fresh, unique content every week (deal comparisons, verdicts). This is the same **DGSO strategy** (Data-Generated SEO-Optimized) that powers Tripadvisor, Thumbtack, Grubhub, and Zapier.

| SEO asset | Target keywords (German) | URL structure |
|-----------|------------------------|---------------|
| Weekly verdict page | "Migros Angebote diese Woche", "Coop Aktionen Bern" | `/woche/2026-kw16` |
| Category pages | "beste Angebote Frischprodukte", "Waschmittel Aktion Schweiz" | `/kategorie/frisch`, `/kategorie/non-food` |
| Store comparison | "Migros oder Coop", "Migros vs Coop Preisvergleich", "Supermarkt Aktionen Vergleich Schweiz" | `/vergleich` |
| Historical archive | "Migros Aktionen April 2026" | `/archiv/2026-04` |

**Why SEO works for basketch:** Every Thursday, new content is generated automatically. Search engines reward fresh, structured, regularly-updated content. This is a flywheel: more weeks of data = more indexed pages = more organic traffic = more users.

### Future: Share-a-List Viral Loop (if demand exists)

Existing users share their favorites as a template URL. New users start with a pre-loaded list. Only build this if users ask for it.

**No paid acquisition. CHF 0/month.**

---

## 7. Timeline and Milestones

| Milestone | Target date | Deliverable | Success gate |
|-----------|------------|-------------|-------------|
| **M0: Data pipeline working** | Week 1-2 (by 20 Apr 2026) | Python scripts fetch Migros + Coop deals, categorise, store in Supabase | Both sources return data, categories are >90% correct |
| **M1: Frontend live** | Week 3-4 (by 4 May 2026) | Home page with verdict banner + category cards + deals browsing, deployed on Vercel | Page loads <2s, shows current week's deals, mobile-responsive |
| **M2: Friends beta** | Week 5-6 (by 18 May 2026) | Share with 10 friends, collect feedback | 10 people use it for 1 full week |
| **M3: PMF check** | Week 8 (by 1 Jun 2026) | Run the 3-question PMF survey (Sean Ellis + alternatives + behavioural) | 40%+ "Very Disappointed" if it disappeared |
| **M4: Decide Phase 2** | Week 9 (by 8 Jun 2026) | Review W4 retention, feedback, and survey results | Go/no-go on personal baskets feature |

**Principle:** Ship the thinnest possible thing that delivers the verdict. Then measure. Then decide what's next. (Lenny: "urgency is a quality of a great PRD.")

---

## 8. Use Cases

### UC-1: Browse Verdict & Deals (First Visit — The Aha Moment)

**Persona:** Sarah, Marco
**Job:** JTBD-2
**Trigger:** First visit to basketch (via link, WhatsApp, or search)
**Priority:** Must-have

**Preconditions:**
- Data pipeline ran successfully this week
- Deals from both stores are in the database

**Main Flow:**

| # | Sarah does... | System does... |
|---|---------------|----------------|
| 1 | Opens basketch on her phone | Shows verdict banner: "More fresh deals at Migros, more household deals at Coop this week" |
| 2 | Sees the verdict explanation | "Based on 12 Migros deals (avg 28% off) vs 8 Coop deals (avg 22% off)" |
| 3 | Scrolls to category cards | Three cards (Fresh / Long-life / Non-food) with top deals from both stores |
| 4 | Taps a category or "See all deals" | Navigates to /deals page with full deal browsing |
| 5 | Browses deals by sub-category | Migros and Coop deals grouped separately, sorted by discount % |
| 6 | Sees "Track your items" CTA | Optionally navigates to /onboarding to set up favorites |

**Time to value:** Under 5 seconds (verdict visible without scrolling). Zero setup required.

**Acceptance Criteria:**

```
GIVEN Sarah opens basketch for the first time
WHEN the page loads
THEN the verdict banner is visible without scrolling
  AND the verdict explanation line shows deal count + avg discount per store
  AND the shareable Wordle card is available (screenshot-friendly verdict)
  AND three category cards show top deals from both stores
  AND she can browse all deals without any setup, account, or onboarding
  AND a "Track your items" CTA invites her to set up favorites (not forced)
```

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| Only one store has data | Show available store's deals + "[Store] data unavailable this week" banner |
| Pipeline failed for both | Show "Deals may be outdated — last updated [date]" with stale data |
| No deals at all | Show "No deals available. Check back Thursday." |

---

### UC-1b: Set Up Favorites (The Retention Moment)

**Persona:** Sarah (primary)
**Job:** JTBD-1
**Trigger:** User taps "Track your items" after browsing verdict/deals (or returns after 2-3 visits)
**Priority:** Must-have

**Preconditions:**
- Data pipeline ran successfully this week (ideally 2-3 weeks of history for Coop coverage)
- Deals from both stores are in the database
- 5 starter pack templates validated against actual promotional data
- Starter pack items reordered: both-store matches first, single-store after

**Main Flow:**

| # | Sarah does... | System does... |
|---|---------------|----------------|
| 1 | Taps "Track your items" on home page | Shows template selection from 5 starter packs: Swiss Basics, Indian Kitchen, Mediterranean, Studentenküche, Familientisch (plus "Build from scratch" option) |
| 2 | Taps "Swiss Basics" | Pre-loads 15-16 items (milk, bread, butter, eggs, cheese, yogurt, tomatoes, onions, pasta, rice, coffee, chicken, cleaning spray, toilet paper, shampoo) |
| 3 | Removes items she doesn't buy, adds 2-3 via search | Updates favorites list in real time |
| 4 | — | Shows personalized comparison immediately |
| 5 | Sees: "3 of your items on sale at Coop, 2 at Migros" | Products grouped into "On sale at Migros" / "On sale at Coop" with two-tier Coop status |
| 6 | — | Prompts: "Save this? Enter your email." |
| 7 | Enters email | Favorites saved to her profile |

**Time to value:** Under 60 seconds (setup) + immediate comparison.

**Instrumentation:** Two analytics events to measure setup time:
- `onboarding_started` — fires when user taps a starter pack template
- `comparison_first_viewed` — fires when comparison page loads for a new basket
- Delta between these two events = actual setup time (target: < 60 seconds)

**Acceptance Criteria:**

```
GIVEN Sarah taps "Track your items"
WHEN she selects a starter pack template
THEN 15-16 items are pre-loaded in her favorites
  AND she can remove/add items with one tap each
  AND the total setup takes under 60 seconds
  AND a soft cap of 30 items is enforced (at 30 items, show "Your list is getting long — shorter lists give better results")
  AND she sees her personalized comparison BEFORE being asked for email
  AND the comparison shows two-tier Coop status messages (see PRD Epic 2)
  AND a permanent label shows: "Coop: showing promotions found. Not all products tracked yet."
```

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| No deals match any favorites this week | "None of your favorites are on sale this week. Check back next week!" |
| Only one store has data | Show comparison with available store only + "[Store] data unavailable this week" |
| Pipeline failed for both | Show favorites list without deal data + "Deals may be outdated — last updated [date]" |
| User leaves before entering email | Favorites stored in local storage, recoverable on return |
| Coop product never seen before | Show "No Coop data yet" (Tier 2 status) |
| Coop product seen but not on sale | Show "Not on promotion at Coop this week" (Tier 1 status) |

---

### UC-2: View Weekly Comparison (Return Visit)

**Persona:** Sarah, Marco
**Job:** JTBD-2, JTBD-5
**Trigger:** Weekly, before Saturday shopping
**Priority:** Must-have

**Preconditions:**
- User has saved favorites (via UC-1)
- Data pipeline ran successfully this week

**Two return paths (both primary):**

**Path A: Bookmark / saved link (zero friction)**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Opens saved bookmark or shared link (`/compare/:favoriteId`) | Loads comparison with this week's deals |
| 2 | — | Shows verdict banner with explanation |
| 3 | — | Products grouped: "On sale at Migros" / "On sale at Coop" / "No deals this week" |
| 4 | Reads each product: name, image, original price, sale price, discount % | — |
| 5 | Knows exactly what to buy where. Goes shopping. | — |

**Path B: Email lookup (for browser resets, new devices)**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Opens basketch home page | Shows "Already have a list?" with email input |
| 2 | Enters email address | Retrieves favorites, redirects to `/compare/:favoriteId` |
| 3-5 | Same as Path A steps 2-5 | — |

**Time to value:** Under 30 seconds (Path A) / under 45 seconds (Path B).

**Acceptance Criteria:**

```
GIVEN Sarah has saved favorites
WHEN she enters her email
THEN she sees her favorites list with current week's deals
  AND a verdict banner shows which store has more/deeper promotions per category (store names in store colors)
  AND products are split into "On sale at Migros" and "On sale at Coop" groups, color-coded by store (Migros orange, Coop red)
  AND each product shows the original price, sale price, and discount %
  AND items with no deal show "no deal this week" (not hidden)
  AND a data freshness indicator shows when deals were last updated
  AND the comparison loads in under 2 seconds
  AND she can modify her favorites (add/remove) from this view
```

**Verdict banner states:**

| State | Display |
|-------|---------|
| Normal | "More fresh deals at Migros, more household deals at Coop this week" — store names in store colors |
| Tie (within 5%) | "Similar promotions at both stores this week" |
| Stale data (> 7 days) | Verdict shown + amber warning: "Deals may be outdated — last updated [date]" |
| Partial data | "Partial data — [store] unavailable this week" |
| No data | Verdict banner not shown |

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| Email not found | "No favorites found. Set up your list?" with link to UC-1 flow |
| No deals match any favorites this week | Show all favorites under "No deals this week" group |
| Product image not available | Show store logo as placeholder |
| Price data missing or CHF 0 | Show product without price, flag "price unavailable" |
| Data older than 7 days | Amber banner: "Deals may be outdated — last updated [date]" |
| One store's data missing | Show available store's deals + "[Store] data unavailable this week" banner |

---

### UC-3: Quick Check at the Store

**Persona:** Sarah, Marco
**Job:** JTBD-5
**Trigger:** Already at Migros, wondering if Coop has promotions on something
**Priority:** Should-have

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Opens basketch on phone while in store | Loads home page (fast — already visited this week, cached) |
| 2 | Checks the Non-food or Long-life category | Shows deals from both stores |
| 3 | Sees Coop has 40% off Persil | Decides to stop by Coop on the way home |

**Acceptance Criteria:**

```
GIVEN the shopper has visited basketch before this week
WHEN they reopen the site on mobile
THEN the page loads from cache in < 1 second
AND the current week's data is shown
AND no re-authentication or onboarding is required
```

**Design implication:** Service worker caching for repeat visits. No splash screens, no cookie banners (no tracking cookies used).

---

### UC-4: Data Pipeline — Weekly Refresh

**Actor:** System (automated)
**Trigger:** Wednesday 21:00 UTC (GitHub Actions cron)
**Priority:** Must-have

**Main Flow:**

| # | Step | Detail |
|---|------|--------|
| 1 | Trigger | GitHub Actions fires cron at Wednesday 21:00 UTC |
| 2 | Fetch deals | Scrape aktionis.ch for all 7 stores (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg), parse deal data |
| 3 | — | *(merged into step 2 — all stores fetched from aktionis.ch)* |
| 4 | Categorize | Map each product to Fresh / Long-life / Non-food using keyword rules |
| 5 | Store | Upsert deals to Supabase (update existing, add new, mark expired) |
| 6 | Log | Record success/failure per source, deal counts, runtime |

**Acceptance Criteria:**

```
GIVEN it is Wednesday at 21:00 UTC
WHEN the pipeline runs
THEN deals are fetched from both sources
  AND each deal is assigned exactly one category
  AND deals are stored with: store, product_name, category, original_price,
      sale_price, discount_percent, valid_from, valid_to, image_url
  AND duplicates (same product + store + week) are updated, not created
  AND expired deals (valid_to < today) are marked inactive
  AND pipeline completes in < 5 minutes
  AND a log entry records: source, status, deal_count, duration
```

**Category mapping rules:**

| Source keywords (German) | basketch category | Examples |
|--------------------------|-------------------|----------|
| Gemuse, Frucht, Milchprodukte, Fleisch, Brot, Eier, Salat | **Fresh** | Tomaten, Vollmilch, Poulet, Erdbeeren |
| Schokolade, Nusse, Teigwaren, Reis, Kaffee, Konserven, Getranke, Chips | **Long-life food** | Ragusa, Barilla, Nespresso, Rivella |
| Waschmittel, Reinigung, Korperpflege, Hygiene, Haushalt, Papier | **Non-food** | Persil, Tempo, Nivea, Swiffer |
| Unknown / unmappable | **Long-life food** | Safe default — least time-sensitive bucket |

**Failure handling:**

| Condition | Action | User impact |
|-----------|--------|-------------|
| Migros source fails | Log error, continue with Coop only | Banner: "Migros data unavailable this week" |
| Coop source fails | Log error, continue with Migros only | Banner: "Coop data unavailable this week" |
| Both fail | Log critical, retain last week's data | Banner: "Deals may be outdated — last updated [date]" |
| Category mapping fails | Default to Long-life + log for manual review | Minor — product in wrong category |
| Duplicate run | Upsert prevents duplicates — safe to re-run | None |

---

### UC-5: Mobile-First Experience

**Persona:** Sarah (80% of visits will be mobile — checked at home or in store)
**Job:** JTBD-2, JTBD-5
**Priority:** Must-have

**Acceptance Criteria:**

```
GIVEN a shopper opens basketch on a phone (viewport < 768px)
WHEN the page loads
THEN the verdict banner is fully visible without scrolling
  AND category cards stack vertically
  AND deal cards within categories stack vertically
  AND all text is readable without zooming (min 16px body text)
  AND touch targets are at least 44x44px (Apple HIG)
  AND no horizontal scrolling occurs
  AND the page loads in < 2 seconds on 4G (Lighthouse performance > 90)
  AND store identity is conveyed through color: Migros = orange (#FF6600), Coop = red (#E10A0A)
  AND the user can tell which store a deal belongs to without reading text (color alone is sufficient)
  AND all non-store UI elements use neutral colors — store colors are reserved for store identity
  AND text contrast meets WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)
  AND all interactive elements are keyboard accessible with visible focus states
  AND store-colored elements also have text labels (no information by color alone for accessibility)
  AND screen readers can identify store, product, and price for each deal (semantic HTML + aria-labels)
```

---

### UC-9: Email Notifications (Future)

**Persona:** Marco, Sarah
**Job:** JTBD-5
**Trigger:** Thursday evening, automated
**Priority:** Future (not in current build)

**Summary:** Users who saved their email during onboarding receive a weekly email every Thursday evening with their personalized deal comparison for the week. One-click unsubscribe. Deferred until core product is validated with friends beta.

**Acceptance criteria to be defined when this feature is prioritized.**

---

### UC-10: Error Pages (404 / Invalid Routes)

**Persona:** Any user
**Job:** N/A (error recovery)
**Trigger:** User navigates to an invalid URL or expired comparison link
**Priority:** Must-have

**Acceptance Criteria:**

```
GIVEN a user navigates to an unknown route (e.g., /settings, /random)
WHEN the page loads
THEN a "Page not found" message is displayed
  AND a link back to the home page is shown
  AND the page has consistent header/footer (not a blank screen)

GIVEN a user navigates to /compare/:id with an invalid or expired UUID
WHEN the page loads
THEN a user-friendly error is shown: "This comparison list wasn't found"
  AND a link to create a new list is shown
  AND the page does not show a blank state or raw error
```

---

### UC-11: Deals Browsing

**Persona:** Sarah, Marco
**Job:** JTBD-2
**Trigger:** User wants to browse all deals, not just their favorites
**Priority:** Phase 2

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Navigates to /deals | Shows all deals with category filter pills |
| 2 | Taps a category (e.g., "Drinks") | Filters to show only Drinks deals |
| 3 | — | Deals grouped by store: Migros section + Coop section, color-coded |
| 4 | Scrolls through deals sorted by discount % | Each deal shows product, price, discount, store badge |

**Acceptance Criteria:**

```
GIVEN a shopper opens the deals page
WHEN they select a category
THEN deals are grouped by store (Migros and Coop separately)
  AND each group is color-coded by store
  AND deals are sorted by discount % descending
  AND a maximum of 50 deals per store group are shown initially
  AND a "Show more" button expands beyond 50
  AND on desktop: store groups are side-by-side columns
  AND on mobile: store groups are stacked vertically
```

---

### UC-12: Unified Deals + List Experience (v2.1 — Primary Flow)

**Persona:** Sarah, Marco  
**Job:** JTBD-1, JTBD-2  
**Trigger:** User opens /deals and sees items they buy regularly  
**Priority:** Must-have (shipped 21 Apr 2026)

**What changed from v2.0:** The primary way to build a list is now directly from the Deals page. The onboarding form (starter pack → edit → save) still exists as an alternative path, but is no longer the default entry point.

**Main Flow:**

| # | Sarah does... | System does... |
|---|---------------|----------------|
| 1 | Opens /deals | Shows all deals, "All deals" view by default, sorted by discount % |
| 2 | Browses by category tab and store pills | Filters deals in real time |
| 3 | Taps + on a deal she buys regularly | Button turns green (added to list); toast confirms |
| 4 | Taps green checkmark on same deal | Removes item; button returns to grey + |
| 5 | Adds 5-8 items | Sticky bar appears: "N items in your list →" |
| 6 | Taps sticky bar link | Navigates to /compare/:id |
| 7 | Views comparison grouped by category | All deals from all stores shown per category |
| 8 | Taps "Copy link" or "Share list" | Copies URL or opens native share sheet |
| 9 | Bookmarks /compare/:id | Returns weekly to same URL |

**Acceptance Criteria:**

```
GIVEN Sarah opens /deals
WHEN the page loads
THEN deals are shown in list view by default (not compare view)
  AND each deal card has a + button to add to list
  AND tapping + adds item and turns button green
  AND tapping green checkmark removes item and reverts to grey +
  AND a toast notification confirms each add/remove
  AND a sticky bottom bar appears after adding any item
  AND sticky bar shows correct item count
  AND sticky bar links to /compare/:basketId
  AND "My List" nav link goes to /compare/:id for users with items
  AND "My List" nav link goes to /deals for users with no items
  AND "My List" nav does NOT go to /onboarding for new users
```

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| User not yet assigned a basket | basket created in DB on first + tap, stored in localStorage |
| Remove fails (DB error) | Toast shows exact error message |
| User clears localStorage | /deals still works, but sticky bar won't show previous list |

---

## 9. Risk Register

### R1: Data Source Becomes Unavailable

| Attribute | Detail |
|-----------|--------|
| **Risk** | aktionis.ch goes offline, changes structure, or blocks automated access |
| **Likelihood** | Medium (site has been stable since 2006, but no guarantees) |
| **Impact** | High — all store data disappears from the site |
| **Detection** | Pipeline logs error; monitoring alert fires |
| **Mitigation** | Fallback chain: aktionis.ch -> oferlo.ch (JSON-LD structured data) -> Rappn.ch (Next.js API). All three aggregators verified in Phase 0. |
| **Response plan** | Show "Deal data unavailable" banner. Switch to backup source within 1 day. |

### R2: aktionis.ch Structure Changes for Specific Stores

| Attribute | Detail |
|-----------|--------|
| **Risk** | aktionis.ch changes HTML structure or URL patterns for one or more stores |
| **Likelihood** | Medium (site has been stable, but per-store pages may evolve independently) |
| **Impact** | Medium — affected store(s) lose data until scraper is updated |
| **Detection** | Pipeline logs empty results or parse errors for specific stores |
| **Mitigation** | Fallback chain per store: aktionis.ch -> oferlo.ch (JSON-LD structured data) -> Rappn.ch (Next.js API). Pepesto API (paid, EUR 0.05/request) as emergency backup. |
| **Response plan** | Update scraper selectors within 1 day. Show "[Store] data unavailable" banner for affected stores. |

### R3: Category Mapping Inaccuracy

| Attribute | Detail |
|-----------|--------|
| **Risk** | Products miscategorized (e.g., ice cream in "Fresh" instead of "Long-life") |
| **Likelihood** | High (guaranteed for edge cases) |
| **Impact** | Low — slightly misleading category placement, not incorrect pricing |
| **Detection** | Manual review of mapped categories weekly |
| **Mitigation** | Start with top 100 product keywords manually mapped. Log unmapped products for review. Default to "Long-life food" (safest bucket). |
| **Acceptance threshold** | > 90% correct categorization. Below that, refine rules. |

### R4: Legal / Terms of Service Change

| Attribute | Detail |
|-----------|--------|
| **Risk** | aktionis.ch adds bot protection or ToS prohibiting scraping |
| **Likelihood** | Low (they've been open for 20 years) |
| **Impact** | Medium — need to switch Coop data source |
| **Detection** | Pipeline returns 403 or CAPTCHA |
| **Mitigation** | Pre-validated backup sources (oferlo.ch, Rappn.ch). All use publicly available data only. No scraping of bot-protected sites (policy decision). |

### R5: Low User Adoption

| Attribute | Detail |
|-----------|--------|
| **Risk** | Nobody uses the site beyond the author |
| **Likelihood** | Medium |
| **Impact** | Low — this is a portfolio project. PM process is the deliverable, not user growth. |
| **Mitigation** | Share with 10 friends in Bern. Collect feedback. The GitHub repo with PRD, architecture, use cases, and code demonstrates PM capability regardless of traffic. |
| **Reframe** | If 5 friends use it weekly, it's a success. If 0 do, the PM documentation still demonstrates the skill. |

### R6: Data Freshness Gap

| Attribute | Detail |
|-----------|--------|
| **Risk** | Pipeline runs Thursday but a flash sale starts Monday, or a promotion ends mid-week |
| **Likelihood** | Medium |
| **Impact** | Low — users see stale or expired deals |
| **Detection** | valid_to date comparison |
| **Mitigation** | Show validity dates on each deal. Banner if data is > 7 days old. V2: add mid-week pipeline run (Monday). |

---

## 10. Constraints and Boundaries

| Constraint | Detail | Rationale |
|-----------|--------|-----------|
| **Legal** | Only publicly available data. No scraping of bot-protected sites. | Coop deployed DataDome specifically to block scraping. Respecting that is both ethical and avoids legal risk. |
| **Region** | Bern only (MVP) | Solve own problem first. Validate with local network. Expand later. |
| **No login** | All features work without account creation | Friction kills adoption for a utility tool. Bookmarkable URL > account. |
| **No app** | Web only. Mobile-optimised site. | Nobody installs an app to check grocery deals. PWA possible in Phase 3. |
| **Cost** | CHF 0/month | Free tiers only: Supabase, Vercel, GitHub Actions. Portfolio project, not a business. |
| **Language** | English UI (MVP) | Author's preference. German product names come from source data. German UI in future if demand exists. |
| **Seven stores** | Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg (defaults: Migros, Coop, Denner) | All sourced from aktionis.ch. Covers the stores 90%+ of Swiss residents shop at. |

---

## 11. Traceability

| Use Case | User Story | Job to Be Done | Persona | Priority |
|----------|-----------|----------------|---------|----------|
| UC-1: Browse Verdict & Deals | US-6, US-7, US-8, US-9 | JTBD-2 | Sarah, Marco | Must-have |
| UC-1b: Set Up Favorites | US-1 | JTBD-1 | Sarah | Must-have |
| UC-2: View Weekly Comparison | US-2, US-3, US-9 | JTBD-2, JTBD-5 | Sarah, Marco | Must-have |
| UC-3: Quick Check at Store | US-1 | JTBD-5 | Sarah, Marco | Should-have |
| UC-4: Data Pipeline | — (system) | — | — | Must-have |
| UC-5: Mobile-First + Accessibility | NFR | JTBD-2, JTBD-5 | Sarah | Must-have |
| UC-6: Return via Direct URL | US-4 | JTBD-5 | Sarah, Marco | Must-have |
| UC-7: Share Comparison List | US-7 | JTBD-3 | Sarah, Marco | Must-have |
| UC-8: Return via Email Lookup | US-4 | JTBD-5 | Sarah | Must-have |
| UC-9: Email Notifications | US-10, US-11 | — | Marco | Future |
| UC-10: Error Pages (404) | — (NFR) | — | Any | Must-have |
| UC-11: Deals Browsing | US-6, US-7, US-8, US-12 | JTBD-2 | Sarah, Marco | Must-have |

---

### UC-6: Return via Direct URL (Bookmark/Share Link)

**Persona:** Sarah, Marco
**Job:** JTBD-5
**Trigger:** Returning to check deals next week
**Priority:** Must-have

**Rationale:** Email lookup is fragile — users forget which email they used, or skip the email step entirely. The comparison page URL (`/compare/:favoriteId`) already works as a stable, unique, unguessable link. Surfacing it prominently solves 60% of the retention problem.

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Completes onboarding (UC-1) | Navigates to `/compare/:favoriteId` |
| 2 | — | Shows "Save this list" section with the direct URL |
| 3 | Taps "Copy" or "Share" | Copies URL to clipboard, or opens native share sheet |
| 4 | Bookmarks the page or shares via WhatsApp | — |
| 5 | Returns next week via bookmark or chat link | Shows updated comparison with this week's deals |

**Acceptance Criteria:**

```
GIVEN the shopper has completed onboarding
WHEN they view the comparison page
THEN a "Save this list" section shows the direct URL
  AND a "Copy" button copies the URL to clipboard with visual feedback
  AND a "Share" button uses the native share API (or copies as fallback)
  AND the URL is stable and works across devices and sessions
  AND the URL is unguessable (UUID-based, not sequential)
```

---

### UC-7: Share Comparison with Partner or Friends

**Persona:** Sarah (shares with partner), Marco (shares with flatmates)
**Job:** JTBD-3
**Trigger:** User wants to split shopping with someone
**Priority:** Must-have

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Views comparison page | Shows "Share" button |
| 2 | Taps "Share" | Opens native share sheet (WhatsApp, SMS, email, etc.) |
| 3 | Sends link to partner | Partner opens same comparison page |
| 4 | Partner sees the same split shopping list | — |

**Acceptance Criteria:**

```
GIVEN a shopper has a comparison page open
WHEN they tap "Share"
THEN the native share API is invoked (on supported devices)
  AND the share includes a title, description, and URL
  AND the recipient can view the full comparison without any setup
  AND shared links show a rich preview in WhatsApp/social apps (Open Graph meta tags: og:title, og:description, og:image, og:url)
  AND the social preview image is 1200x630px with basketch branding
  AND on devices without Web Share API support (desktop Firefox, older Android), a "Copy Link" button is shown as fallback
```

**Dependency:** All pages must include OG meta tags. Without them, shared links appear as bare URLs in WhatsApp — breaking the growth channel (see PRD Section 6: Growth Engine).

---

### UC-8: Return via Email Lookup

**Persona:** Sarah
**Job:** JTBD-5
**Trigger:** User lost their bookmark and wants to find their list
**Priority:** Should-have (secondary to UC-6)

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Opens basketch home page | Shows "Already have a list?" with email input |
| 2 | Enters the email they saved during onboarding | Looks up favorites by email |
| 3 | — | Redirects to `/compare/:favoriteId` |

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| Email not found | "No list found for this email. Try creating a new one." |
| Multiple lists with same email | Return most recently created list |
| User never saved email | Cannot use this flow — must use bookmark (UC-6) |

**Acceptance Criteria:**

```
GIVEN a shopper saved their email during onboarding
WHEN they enter that email on the home page
THEN they are redirected to their comparison page
  AND the comparison shows current week's deals
```

**Note:** Email lookup is an equal return path alongside the direct URL (UC-6). Both are primary — URL for bookmarkers, email for users who clear browsers or switch devices.

---

## 12. Open Decisions

| # | Question | Options | Recommendation | Decision owner |
|---|----------|---------|----------------|----------------|
| ~~1~~ | ~~Verdict weighting~~ | ~~50/50, 40/60, 60/40~~ | **Resolved 12 Apr 2026:** 40% deal count / 60% avg discount depth. Tie threshold: 5%. Min 3 deals before showing verdict. Show explanation line. | PM |
| 2 | How many deals to show per category before "Show more"? | 5, 10, 15 | 10 (balances completeness vs scroll fatigue on mobile) | PM — test with users |
| 3 | Should we show store locations on the page? | Yes (map), Yes (list), No | List of nearest stores per category winner (no map in MVP) | PM |
| 4 | Product language: translate to English or keep German? | Translate, Keep German, Both | Keep German (products are sold in German, translation adds complexity and errors) | PM |
| 5 | aktionis.ch scraping frequency: weekly or more? | Weekly (Thu), 2x/week (Mon+Thu) | Weekly for MVP, add Monday run if users report stale data | PM |
