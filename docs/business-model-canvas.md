# basketch -- Business Model Canvas

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Author**   | Kiran Dommalapati                          |
| **Date**     | 2026-04-10                                 |
| **Version**  | 1.0                                        |
| **Status**   | Draft                                      |
| **Product**  | basketch -- Personalized Swiss grocery deal comparison (7 stores) |
| **Scope**    | MVP -- Bern region only                    |

---

## Canvas Summary

```
+-------------------------------+-------------------------------+-------------------------------+
|                               |                               |                               |
|  8. KEY PARTNERSHIPS          |  7. KEY ACTIVITIES            |  2. VALUE PROPOSITIONS        |
|                               |                               |                               |
|  - aktionis.ch (all 7 stores) |  - Weekly data pipeline       |  "Which of MY products are    |
|                               |    (Wed 21:00 UTC)            |   on sale this week, and      |
|  - Supabase (DB, free tier)   |  - Favorites matching         |   where should I buy each?"   |
|  - Vercel (hosting, free)     |  - Category mapping           |                               |
|  - GitHub (CI/CD, free)       |  - SEO content generation     |  - Personalized, not generic  |
|                               |  - PMF survey at week 8       |  - Split shopping list        |
|                               |                               |  - Zero friction (no install, |
+-------------------------------+-------------------------------+    no account, no login)      |
|                               |                               |  - 45-sec setup via templates |
|  6. KEY RESOURCES             |  4. CUSTOMER RELATIONSHIPS    |  - Saves CHF 20-40/month     |
|                               |                               |                               |
|  - aktionis.ch (7 stores)     |  - Self-service               +-------------------------------+
|  - React/Vite + TS/Python     |  - Email as identifier        |                               |
|  - Supabase + Vercel          |  - Weekly return habit         |  1. CUSTOMER SEGMENTS         |
|  - Starter pack templates     |  - Future: Thu email alert     |                               |
|  - PM documentation portfolio |  - Community: WhatsApp group   |  Primary: "Sarah" 30-45,     |
|                               |                               |    weekly shopper, Bern       |
+-------------------------------+-------------------------------+  Secondary: "Marco" 25-35,   |
|                               |                               |    deal hunter, bulk buyer    |
|  9. COST STRUCTURE            |  5. REVENUE STREAMS           |                               |
|                               |                               |  Scale: 10-50 users initially |
|  CHF 0/month -- all free tier |  V1: None (portfolio project) |                               |
|  Supabase, Vercel, GitHub     |  Future: affiliate, premium,  +-------------------------------+
|  Dev time: evenings/weekends  |    sponsored (hypothetical)    |                               |
|                               |                               |  3. CHANNELS                  |
|                               |                               |                               |
|                               |                               |  Friends > SEO > Share-a-List |
|                               |                               |  All channels cost CHF 0      |
+-------------------------------+-------------------------------+-------------------------------+
```

---

## 1. Customer Segments

### Primary Persona: "Sarah"

| Attribute         | Detail                                                        |
|-------------------|---------------------------------------------------------------|
| Age               | 30-45                                                         |
| Location          | Bern, Switzerland                                             |
| Shopping habit     | Weekly, usually Saturday morning                             |
| Store access      | Both Migros and Coop within 10 minutes                       |
| Income            | Middle income -- price-aware but not extreme couponer         |
| Device            | Phone browser (no app install)                               |
| Pain point        | Doesn't know which store has the better deal on her regulars  |
| Current behavior  | Picks one store, misses deals at the other                   |

### Secondary Persona: "Marco"

| Attribute         | Detail                                                        |
|-------------------|---------------------------------------------------------------|
| Age               | 25-35                                                         |
| Shopping habit     | Flexible schedule, buys in bulk when deals are strong        |
| Motivation        | Maximizes savings per trip                                   |
| Device            | Phone browser                                                |
| Pain point        | Manually checks both store flyers every week                 |

### Anti-Personas (not target users)

| Type                          | Why excluded                                                  |
|-------------------------------|---------------------------------------------------------------|
| Single-store-only shoppers    | No comparison needed if you never switch stores              |
| Tourists / temporary visitors | No recurring shopping list to personalize                    |
| Extreme couponers             | Need coupon stacking, loyalty point optimization -- out of scope |

### Scale

- Launch: 10-50 users (friends, word of mouth, Bern community)
- No paid acquisition planned

---

## 2. Value Propositions

### Core Promise

> "Which of MY regular products are on sale this week, and where should I buy each one?" -- answered in under 30 seconds.

### Value Breakdown

| Value                        | Detail                                                        |
|------------------------------|---------------------------------------------------------------|
| Personalized                 | Starts with YOUR favorites, not 200+ random deals            |
| Split shopping list          | "Buy these at Migros, these at Coop, these at Denner" -- one view |
| Zero friction                | No app install, no account creation, no login                |
| 45-second setup              | Pick a starter pack template, customize with search, done    |
| Weekly habit                 | Check once (Thursday evening or Saturday morning), shop smart all week |
| Real savings                 | CHF 20-40/month without extra planning time                  |
| Favorites-first              | Not a deal feed -- a personal price tracker                  |

### Starter Pack Templates

| Template        | Target user                  | Example items                          |
|-----------------|------------------------------|----------------------------------------|
| Swiss Basics    | Default Swiss household      | Milk, bread, butter, cheese, eggs      |
| Indian Kitchen  | South Asian households       | Basmati rice, coconut milk, spices     |
| Mediterranean   | Southern European households | Olive oil, pasta, tomatoes, feta       |
| General         | Broad selection              | Mix of all categories                  |

---

## 3. Channels

### Phase 1: Kickstart (Month 1-2)

| Channel                  | Reach      | Cost   | Action                                       |
|--------------------------|------------|--------|----------------------------------------------|
| Friends network          | 10-15      | CHF 0  | Direct sharing, ask for feedback             |
| WhatsApp groups          | 20-50      | CHF 0  | Bern expat groups, neighborhood groups       |
| Bern subreddit/Facebook  | 100-500    | CHF 0  | Post with genuine "I built this" framing     |

### Phase 2: SEO (Month 3-6)

| Channel                     | Reach       | Cost   | Action                                    |
|-----------------------------|-------------|--------|-------------------------------------------|
| Weekly verdict pages        | Organic     | CHF 0  | "Best grocery deals in Switzerland this week" |
| Category comparison pages   | Organic     | CHF 0  | "Cheapest dairy in Bern this week"        |
| Store comparison pages      | Organic     | CHF 0  | Long-tail SEO, fresh content every week   |

### Phase 3: Viral (Month 6+)

| Channel                     | Reach       | Cost   | Action                                    |
|-----------------------------|-------------|--------|-------------------------------------------|
| Share-a-List                | Exponential | CHF 0  | Users share favorites as a template URL   |
| New users start pre-loaded  | --          | --     | Reforge Type 3: demand-driving-demand     |

All channels cost CHF 0.

---

## 4. Customer Relationships

| Relationship Type     | Mechanism                                                      |
|-----------------------|----------------------------------------------------------------|
| Self-service          | No support team needed; UI designed for zero-help usage        |
| Lightweight identity  | Email as simple lookup key (no password, no OAuth)             |
| Weekly return habit   | Deal data refreshes every week -- reason to come back          |
| Future: email alerts  | Thursday evening notification with personalized deals summary  |
| Future: community     | WhatsApp group for Bern shoppers sharing tips and templates    |

### Retention Model

```
Thursday evening  -->  Check basketch  -->  Saturday morning  -->  Shop with split list
       |                                                                    |
       +--------------------------------------------------------------------+
                           Weekly habit loop
```

---

## 5. Revenue Streams

### V1: None

basketch is a **portfolio project**, not a business. Revenue is not the goal.

**What IS the deliverable:**
- PM process documentation (PRD, use cases, architecture, research)
- User validation (PMF survey, retention metrics)
- Working product that solves a real problem

### Future Potential (hypothetical, not planned)

| Stream                | Model                          | Feasibility         |
|-----------------------|--------------------------------|---------------------|
| Affiliate links       | Commission on click-through to store websites | Low -- Swiss stores don't have strong affiliate programs |
| Premium features      | Advanced filters, price history, alerts        | Medium -- only if free users demand it |
| Sponsored placements  | Brands pay to feature deals                   | Low -- requires significant user base |
| Data insights         | Anonymized shopping pattern reports           | Very low -- requires scale |

These are listed for Canvas completeness only. None are planned or prioritized.

---

## 6. Key Resources

### Data Sources

| Source                | Covers                                              | Method                      | Reliability                  |
|-----------------------|-----------------------------------------------------|-----------------------------|------------------------------|
| aktionis.ch           | All 7 stores (Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg) | Public aggregator, scraping | Medium (third-party, no SLA) |

### Tech Stack

| Layer      | Technology         | Cost     |
|------------|--------------------|----------|
| Frontend   | React + Vite       | Free     |
| Pipeline   | TypeScript + Python | Free     |
| Database   | Supabase           | Free tier (500MB, 50K rows) |
| Hosting    | Vercel             | Free tier (100GB bandwidth) |
| CI/CD      | GitHub Actions      | Free (2000 min/month, public repo) |

### Starter Pack Templates

Curated product lists that let new users start with a useful favorites list in 45 seconds instead of building from scratch.

### Domain Knowledge

- Swiss grocery market structure (Migros + Coop = ~70% market share; basketch covers 7 stores including discounters)
- Deal cycles: promotions run Thursday to Wednesday
- Store geography: Bern region focus for MVP

### PM Documentation

The portfolio artifact itself: PRD, use cases, architecture, roadmap, this canvas -- demonstrating end-to-end PM process.

---

## 7. Key Activities

| Activity                | Frequency       | Detail                                           |
|-------------------------|-----------------|--------------------------------------------------|
| Data pipeline run       | Weekly (Wed 21:00 UTC) | Fetch all 7 stores from aktionis.ch, categorize, store |
| Favorites matching      | On each user visit | Compare user favorites against active deals   |
| Category mapping        | Ongoing         | Fresh / long-life / non-food classification      |
| SEO content generation  | Weekly          | Auto-generated verdict pages from deal data      |
| PMF survey              | Week 8          | Sean Ellis test: "How disappointed would you be?" |
| User feedback           | Continuous      | In-app feedback, WhatsApp group                  |

### Weekly Pipeline Flow

```
Wednesday 21:00 UTC
        |
        v
+------------------------------------------+
|       Fetch aktionis.ch                  |
|  (all 7 stores in parallel via matrix)   |
+--------------------+---------------------+
                     |
                     v
+------------------------------------------+
|         Categorize + Normalize           |
|    (fresh / long-life / non-food)        |
+--------------------+---------------------+
                     |
                     v
+------------------------------------------+
|          Store in Supabase               |
|     (deals table, weekly refresh)        |
+--------------------+---------------------+
                     |
                     v
+------------------------------------------+
|    Generate SEO verdict pages            |
|    (weekly comparison content)           |
+------------------------------------------+
```

---

## 8. Key Partnerships

| Partner               | Type              | Dependency Level | Risk if Lost                      |
|-----------------------|-------------------|------------------|-----------------------------------|
| aktionis.ch           | Public aggregator | High             | No deal data for any store; need direct sources |
| Supabase              | SaaS (free tier)  | Medium           | Migrate to another Postgres host  |
| Vercel                | SaaS (free tier)  | Medium           | Migrate to Netlify or similar     |
| GitHub                | SaaS (free tier)  | Low              | Standard Git, easily portable     |

**No paid partnerships or formal agreements needed.** All dependencies are either open-source or free-tier SaaS with standard terms of service.

---

## 9. Cost Structure

### Monthly Operating Costs

| Item             | Cost         | Notes                                      |
|------------------|--------------|--------------------------------------------|
| Supabase         | CHF 0        | Free tier: 500MB, 50K rows, auto-pause after 7 days inactivity |
| Vercel           | CHF 0        | Free tier: 100GB bandwidth, auto-deploy    |
| GitHub Actions   | CHF 0        | Free: 2000 min/month for public repos      |
| Domain           | CHF 0        | basketch.vercel.app (free subdomain)       |
| **Total**        | **CHF 0/month** |                                         |

### Optional Future Costs

| Item             | Cost              | Trigger                                  |
|------------------|-------------------|------------------------------------------|
| Custom domain    | ~CHF 15/year      | basketch.ch available at nic.ch          |
| Supabase Pro     | ~CHF 25/month     | If exceeding 500MB or 50K rows           |
| Vercel Pro       | ~CHF 20/month     | If exceeding 100GB bandwidth             |

### Developer Time

Solo builder: Kiran Dommalapati (Senior PM, evenings and weekends). Not a monetary cost but the primary investment.

---

## Differentiation

### How basketch differs from existing tools

| Feature                  | basketch           | Aktionis          | Profital           | Bring!              | Rappn (CH)         |
|--------------------------|--------------------|--------------------|--------------------|--------------------|---------------------|
| **Core model**           | Your favorites vs deals | All deals, all stores | Digital flyers   | Shopping list app  | Recipe-based shopping |
| **Personalization**      | Favorites-first    | None (browse all)  | None (browse flyers) | List-based, no deals | Recipe-based       |
| **Split shopping list**  | Yes -- 7 stores    | No               | No                 | No                 | No                  |
| **Setup time**           | 45 seconds (template) | 0 (but no personalization) | 0 (but no personalization) | Manual list building | Recipe selection   |
| **Deal comparison**      | Side-by-side, your items | Per-store view | Per-store flyers  | No deal data       | No deal comparison  |
| **Account required**     | Email only (no password) | No account     | No account         | Optional account   | Account required    |
| **Target action**        | "Check my deals, go shop" | Browse deals  | Browse flyers      | Manage list        | Plan meals          |
| **Weekly habit**         | Built-in (deals refresh) | Possible      | Possible           | Not deal-driven    | Meal planning cycle |

### Key Differentiators

1. **Favorites-first, not deals-first.** Every other tool shows you ALL deals and asks you to find what matters. basketch starts with what you already buy and tells you where it is cheaper this week.

2. **Split shopping list.** No other tool in Switzerland gives you a per-store split view across 7 stores based on your personal list.

3. **45-second onboarding.** Starter pack templates mean you get value on your first visit, not after manually adding 30 products.

4. **Zero infrastructure.** No app to install, no account to create, no password to remember. Open the URL, pick a template, see your deals.

---

## Key Assumptions to Validate

Ranked by risk (highest first):

| # | Assumption                                                     | Risk Level | Validation Method                        | Success Criteria                          |
|---|----------------------------------------------------------------|------------|------------------------------------------|-------------------------------------------|
| 1 | Users actually split shopping across multiple stores           | High       | User interviews + onboarding survey      | >60% of users shop at 2+ stores weekly   |
| 2 | Deal data from aktionis.ch is reliable and complete across all 7 stores | High | Weekly data quality checks               | >90% accuracy vs manual flyer check      |
| 3 | Users will return weekly to check deals                        | High       | Retention metrics (Week 1 vs Week 4)     | >40% weekly return rate after 4 weeks     |
| 4 | Starter pack templates cover enough items to be useful on day 1 | Medium    | Template coverage analysis + user feedback | >70% of users find 5+ relevant items in their template |
| 5 | CHF 20-40/month savings claim is realistic                     | Medium     | Savings calculation from actual deal data | Average basket shows >CHF 5/week in deal savings |
| 6 | Users will customize beyond the starter pack                   | Medium     | Analytics: search usage + favorites added | >50% of users add at least 3 items beyond template |
| 7 | Email-only identity is sufficient (no password needed)         | Low        | Drop-off rate at email entry              | >80% of users enter email without hesitation |
| 8 | Bern region is large enough for meaningful MVP feedback        | Low        | User recruitment success                  | Reach 10+ active weekly users within 4 weeks |

### Riskiest Assumption

**Assumption #1: Users actually split shopping across multiple stores.** If most people are loyal to one store regardless of deals, the entire value proposition collapses. This must be validated before investing in polish or growth.

### Validation Timeline

| Week   | Action                                          |
|--------|-------------------------------------------------|
| Week 1 | Launch with friends, collect onboarding data    |
| Week 2 | Monitor return visits, check data quality       |
| Week 4 | First retention check (>40% weekly return?)     |
| Week 8 | Sean Ellis PMF survey ("How disappointed would you be if basketch no longer existed?") |

PMF threshold: >40% answer "very disappointed."

---

*This document is part of the basketch PM portfolio. It is a living document and will be updated as assumptions are validated or invalidated.*
