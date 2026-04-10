# Product Specification: basketch

**Author:** Kiran Dommalapati
**Date:** 9 April 2026
**Version:** 1.2
**Scope:** MVP (Phase 1) — Bern region

---

## 1. Product Goal

### Vision
Every Swiss shopper knows which store to visit for what — before leaving the house.

### MVP Goal
Help a Bern-based shopper see which of THEIR regular products are on sale this week at Migros or Coop — personalized, not generic. Setup in under 60 seconds, weekly check in under 30 seconds.

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
- Willing to split the trip between two stores **if the savings are clear and easy to see**
- Currently picks one store based on habit or proximity, occasionally checks the other

**Goals:**
1. Save CHF 20-40/month without spending extra time planning
2. Know in advance which store has better deals this week — for each type of shopping
3. Stock up on long-life and household items when they're significantly discounted

**Frustrations:**
1. "I don't have time to check two websites and compare prices manually."
2. "Migros and Coop both have weekly deals, but I never know which one is actually better this week."
3. "I only find out about a deal after I've already bought it at the other store."
4. "The supermarket apps and websites are cluttered — I don't want to scroll through 200 items to find what matters."

**Quote:** *"Just tell me: Migros or Coop this week? For what?"*

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
| Price-obsessed optimizer who compares across 5+ stores (Aldi, Lidl, Denner, etc.) | basketch MVP covers only Migros and Coop. Power users need a broader tool. |
| Tourist or non-resident | Site assumes familiarity with Swiss stores and German product names. |
| Someone who only shops at one store by principle | No comparison needed — they already decided. |

---

## 3. Jobs to Be Done

| # | When... | I want to... | So I can... |
|---|---------|-------------|-------------|
| **JTBD-1** | I'm setting up basketch for the first time | quickly select my regular products from a template | start seeing personalized comparisons without manual work |
| **JTBD-2** | I'm planning my Saturday shopping | see which of MY favorites are on sale this week and where | decide what to buy at Migros vs Coop |
| **JTBD-3** | I see my comparison | get a split shopping list (Migros items / Coop items) | go to each store with a clear list |
| **JTBD-4** | I want to check a specific product | search for it and see both stores' prices/deals | decide where to buy it |
| **JTBD-5** | I return next week | enter my email and instantly see this week's comparison | get the answer in under 30 seconds without re-setup |

---

## 4. User Journey Map

```
FIRST VISIT — Sarah Sets Up Her Favorites

Timeline: Open basketch → Pick template → Customize → See comparison → Save

[Open basketch]
   |
   +-- "How do you cook?" → Swiss Basics / Indian Kitchen / Mediterranean / General
   +-- Tap "Swiss Basics" → 15 items pre-loaded (milk, bread, butter, eggs, cheese...)
   +-- Remove what she doesn't buy, add 2-3 items via search
   +-- Total setup time: ~45 seconds
   |
   +-- SEE COMPARISON (aha moment!)
   |   "3 of your items are on sale at Coop this week"
   |   "Buy these at Migros (cheaper): milk, bread"
   |   "Buy these at Coop (on sale): cheese, yogurt, cleaning spray"
   |
   +-- "Want to save this? Enter your email."
   +-- kiran@email.com → saved
   |
   Done. Next week: enter email → see updated comparison.


RETURN VISIT — Sarah Checks Her Comparison (Weekly)

Timeline: Open basketch → Enter email → See comparison → Go shopping

[Open basketch]
   |
   +-- Enter email → 20 seconds
   +-- See updated comparison for this week
   +-- "This week: 4 of your items are on sale"
   +-- Split list: Migros list (3 items) | Coop list (2 items)
   +-- Go shopping with the right list
   |
   Total: under 30 seconds
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
| **Ignore deals entirely** | Just go to one store out of habit | Overpay CHF 20-40/month on items the other store has on sale | Saves money with zero extra effort |
| **Ask friends on WhatsApp** | "Hey, is anything good at Migros this week?" | Unreliable, not systematic, depends on others checking | Reliable, weekly, automated |

**Key insight:** None of the current alternatives answer the core question: *"Which of MY regular products are on sale this week, and where should I buy each one?"* They all show generic deals — basketch delivers a personalized comparison.

---

## 6. Growth Engine

### Strategy: SEO + Word of Mouth (Racecar Growth Framework)

Basketch generates fresh, unique content every week (deal comparisons, verdicts). This is the same **DGSO strategy** (Data-Generated SEO-Optimized) that powers Tripadvisor, Thumbtack, Grubhub, and Zapier.

### Phase 1: Kickstart (Week 1-6)

| Tactic | Detail | Expected reach |
|--------|--------|---------------|
| **Friends network** | Share with 10 friends in Bern personally | 10-15 users |
| **WhatsApp groups** | Share weekly verdict screenshot in 2-3 local groups | 20-30 impressions/week |
| **Bern subreddit / Facebook groups** | One post in r/bern or local Facebook groups when MVP is live | 50-100 one-time visitors |

### Phase 2: SEO Engine (Week 4+, build from day one)

| SEO asset | Target keywords (German) | URL structure |
|-----------|------------------------|---------------|
| Weekly verdict page | "Migros Angebote diese Woche", "Coop Aktionen Bern" | `/woche/2026-kw16` |
| Category pages | "beste Angebote Frischprodukte", "Waschmittel Aktion Schweiz" | `/kategorie/frisch`, `/kategorie/non-food` |
| Store comparison | "Migros oder Coop", "Migros vs Coop Preisvergleich" | `/vergleich` |
| Historical archive | "Migros Aktionen April 2026" | `/archiv/2026-04` |

**Why SEO works for basketch:** Every Thursday, new content is generated automatically. Search engines reward fresh, structured, regularly-updated content. This is a flywheel: more weeks of data = more indexed pages = more organic traffic = more users.

### Phase 3: Share-a-List Viral Loop (Organic, Week 6+)

Existing users share their favorites as a template URL. New users start with a pre-loaded list. This is both an onboarding solution and a demand-driving-demand growth loop (Reforge Type 3).

Example: Sarah shares `basketch.ch/list/swiss-basics-sarah` on WhatsApp. Her friend taps it, sees Sarah's favorites pre-loaded, customizes, and is activated in under 30 seconds — skipping even the template selection step.

This loop compounds: every active user becomes a potential onboarding path for their friends, with a list tailored to their shared cooking style.

**No paid acquisition needed.** CHF 0/month constraint applies to growth too.

---

## 7. Timeline and Milestones

| Milestone | Target date | Deliverable | Success gate |
|-----------|------------|-------------|-------------|
| **M0: Data pipeline working** | Week 1-2 (by 20 Apr 2026) | Python scripts fetch Migros + Coop deals, categorise, store in Supabase | Both sources return data, categories are >90% correct |
| **M1: MVP frontend live** | Week 3-4 (by 4 May 2026) | Home page with verdict banner + 3 category cards, deployed on Vercel | Page loads <2s, shows current week's deals, mobile-responsive |
| **M2: Friends beta** | Week 5-6 (by 18 May 2026) | Share with 10 friends, collect feedback | 10 people use it for 1 full week |
| **M3: PMF check** | Week 8 (by 1 Jun 2026) | Run the 3-question PMF survey (Sean Ellis + alternatives + behavioural) | 40%+ "Very Disappointed" if it disappeared |
| **M4: Decide Phase 2** | Week 9 (by 8 Jun 2026) | Review W4 retention, feedback, and survey results | Go/no-go on personal baskets feature |

**Principle:** Ship the thinnest possible thing that delivers the verdict. Then measure. Then decide what's next. (Lenny: "urgency is a quality of a great PRD.")

---

## 8. Use Cases

### UC-1: Set Up Favorites (First Visit)

**Persona:** Sarah (primary)
**Job:** JTBD-1
**Trigger:** First visit to basketch
**Priority:** Must-have

**Preconditions:**
- Data pipeline ran successfully this week
- Deals from both stores are in the database
- Starter pack templates are configured with 15-20 items each

**Main Flow:**

| # | Sarah does... | System does... |
|---|---------------|----------------|
| 1 | Opens basketch on her phone | Shows template selection: "How do you cook?" |
| 2 | Taps "Swiss Basics" | Pre-loads 15-20 items (milk, bread, butter, eggs, cheese, yogurt, tomatoes, onions, pasta, rice, coffee, chicken, cleaning spray, toilet paper, shampoo) |
| 3 | Removes items she doesn't buy, adds 2-3 via search | Updates favorites list in real time |
| 4 | — | Shows personalized comparison immediately |
| 5 | Sees: "3 of your items on sale at Coop, 2 at Migros" | Products grouped into "Buy at Migros" / "Buy at Coop" |
| 6 | — | Prompts: "Save this? Enter your email." |
| 7 | Enters email | Favorites saved to her profile |

**Time to value:** Under 60 seconds (setup) + immediate comparison.

**Acceptance Criteria:**

```
GIVEN Sarah opens basketch for the first time
WHEN she selects a starter pack template
THEN 15-20 items are pre-loaded in her favorites
  AND she can remove/add items with one tap each
  AND the total setup takes under 60 seconds
  AND she sees her personalized comparison BEFORE being asked for email
  AND the comparison shows which items are on sale and at which store
```

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| No deals match any favorites this week | "None of your favorites are on sale this week. Check back next week!" |
| Only one store has data | Show comparison with available store only + "Migros/Coop data unavailable this week" |
| Pipeline failed for both | Show favorites list without deal data + "Deals may be outdated — last updated [date]" |
| User leaves before entering email | Favorites stored in local storage, recoverable on return |

---

### UC-2: View Weekly Comparison (Return Visit)

**Persona:** Sarah, Marco
**Job:** JTBD-2, JTBD-5
**Trigger:** Weekly, before Saturday shopping
**Priority:** Must-have

**Preconditions:**
- User has saved favorites (via UC-1)
- Data pipeline ran successfully this week

**Main Flow:**

| # | Shopper does... | System does... |
|---|-----------------|----------------|
| 1 | Opens basketch | Shows email entry |
| 2 | Enters email address | Retrieves favorites and current week's deals |
| 3 | — | Shows favorites with this week's deals applied |
| 4 | — | Products grouped: "Cheaper at Migros" / "Cheaper at Coop" / "No deals this week" |
| 5 | Reads each product: name, image, regular price, deal price, savings | — |
| 6 | Knows exactly what to buy where. Goes shopping. | — |

**Time to value:** Under 30 seconds.

**Acceptance Criteria:**

```
GIVEN Sarah has saved favorites
WHEN she enters her email
THEN she sees her favorites list with current week's deals
  AND products are split into "buy at Migros" and "buy at Coop" groups
  AND each product shows the deal price and savings
  AND items with no deal show "no deal this week" (not hidden)
  AND the comparison loads in under 2 seconds
  AND she can modify her favorites (add/remove) from this view
```

**Edge cases:**

| Condition | Behaviour |
|-----------|-----------|
| Email not found | "No favorites found. Set up your list?" with link to UC-1 flow |
| No deals match any favorites this week | Show all favorites under "No deals this week" group |
| Product image not available | Show store logo as placeholder |
| Price data missing or CHF 0 | Show product without price, flag "price unavailable" |

---

### UC-3: Quick Check at the Store

**Persona:** Sarah, Marco
**Job:** JTBD-5
**Trigger:** Already at Migros, wondering if Coop has better deals on something
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
| 2 | Fetch Migros | Call migros-api-wrapper, retrieve current week's discounts |
| 3 | Fetch Coop | Scrape aktionis.ch/vendors/coop, parse deal data |
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
```

---

## 9. Risk Register

### R1: Data Source Becomes Unavailable

| Attribute | Detail |
|-----------|--------|
| **Risk** | aktionis.ch goes offline, changes structure, or blocks automated access |
| **Likelihood** | Medium (site has been stable since 2006, but no guarantees) |
| **Impact** | High — Coop data disappears from the site |
| **Detection** | Pipeline logs error; monitoring alert fires |
| **Mitigation** | Fallback chain: aktionis.ch -> oferlo.ch (JSON-LD structured data) -> Rappn.ch (Next.js API). All three aggregators verified in Phase 0. |
| **Response plan** | Show "Coop data unavailable" banner. Switch to backup source within 1 day. |

### R2: Migros API Wrapper Breaks

| Attribute | Detail |
|-----------|--------|
| **Risk** | Open-source migros-api-wrapper stops working (Migros changes auth, npm package unmaintained) |
| **Likelihood** | Medium (last updated 2024, active maintainer) |
| **Impact** | High — Migros data disappears |
| **Detection** | Pipeline logs auth failure or empty results |
| **Mitigation** | Fallback: aktionis.ch also lists Migros deals. Pepesto API (paid, EUR 0.05/request) as emergency backup. |
| **Response plan** | Switch data source within 1 day. Worst case: both stores via aktionis.ch. |

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
| **Two stores only** | Migros and Coop | These are the two stores 80% of Swiss residents split between. Aldi/Lidl/Denner in future phases. |

---

## 11. Traceability

| Use Case | User Story | Job to Be Done | Persona | Priority | Phase |
|----------|-----------|----------------|---------|----------|-------|
| UC-1: Set Up Favorites | US-1 | JTBD-1 | Sarah | Must-have | MVP |
| UC-2: View Weekly Comparison | US-2, US-3 | JTBD-2, JTBD-5 | Sarah, Marco | Must-have | MVP |
| UC-3: Quick Check at Store | US-1 | JTBD-5 | Sarah, Marco | Should-have | MVP |
| UC-4: Data Pipeline | — (system) | — | — | Must-have | MVP |
| UC-5: Mobile-First | NFR | JTBD-2, JTBD-5 | Sarah | Must-have | MVP |
| UC-6: Personal Basket | US-5, US-6, US-7 | — | Marco | Must-have | Phase 2 |
| UC-7: Email Notifications | US-8, US-9, US-10 | — | Marco | Must-have | Phase 3 |

---

## 12. Open Decisions

| # | Question | Options | Recommendation | Decision owner |
|---|----------|---------|----------------|----------------|
| 1 | Verdict weighting: deal count vs discount depth? | 50/50, 40/60, 60/40 | 40% count / 60% discount (depth matters more than breadth) | PM — validate with user testing |
| 2 | How many deals to show per category before "Show more"? | 5, 10, 15 | 10 (balances completeness vs scroll fatigue on mobile) | PM — test with users |
| 3 | Should we show store locations on the page? | Yes (map), Yes (list), No | List of nearest stores per category winner (no map in MVP) | PM |
| 4 | Product language: translate to English or keep German? | Translate, Keep German, Both | Keep German (products are sold in German, translation adds complexity and errors) | PM |
| 5 | aktionis.ch scraping frequency: weekly or more? | Weekly (Thu), 2x/week (Mon+Thu) | Weekly for MVP, add Monday run if users report stale data | PM |
