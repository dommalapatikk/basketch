# Architecture Decision Record: basketch

**Author:** Kiran Dommalapati
**Date:** 9 April 2026

---

## Tech Stack

| Layer | Choice | Why | Alternatives Considered |
|-------|--------|-----|------------------------|
| **Frontend** | React + Vite + TypeScript | Fast builds, modern tooling, large ecosystem. Vite over CRA for speed. | Next.js (SSR overkill for this), Vue (smaller ecosystem) |
| **UI Components** | Tailwind CSS + shadcn/ui | Polished components, consistent design, no CSS overhead. Same stack proven by RajaRide. | Material UI (heavier), plain Tailwind (more custom work) |
| **Database** | Supabase (PostgreSQL) | Free tier (500MB, 50K rows), built-in auth if needed later, real-time subscriptions, REST API auto-generated. | Firebase (less SQL-friendly), PlanetScale (MySQL), SQLite (no cloud) |
| **Data Pipeline** | Python + GitHub Actions | Python for web scraping libraries (requests, BeautifulSoup). GitHub Actions free for public repos, cron support. | Node.js script (less scraping ecosystem), AWS Lambda (cost) |
| **Hosting** | Vercel (free tier) | Zero-config React deployment, global CDN, preview deploys on PR. | Cloudflare Pages (also good), Netlify (similar), Lovable (lock-in) |
| **Analytics** | Vercel Analytics (free) or Plausible (privacy-first) | Simple, no cookie banners needed. | Google Analytics (overkill, privacy concerns) |

---

## Architecture Diagram

```
+-------------------+     +-----------------+     +------------------+
|  GitHub Actions   |     |    Supabase     |     |     Vercel       |
|  (weekly cron)    |     |  (PostgreSQL)   |     |   (hosting)      |
|                   |     |                 |     |                  |
|  Python script    +---->+  deals table    +<----+  React SPA       |
|  - Fetch Migros   |     |  baskets (v2)   |     |  - Home page     |
|  - Scrape Coop    |     |  basket_items   |     |  - Deal cards    |
|  - Categorize     |     |                 |     |  - Basket (v2)   |
|  - Upsert deals   |     +-----------------+     +------------------+
+-------------------+           ^                        |
                                |                        |
                          Supabase JS client        User browser
                          (read deals, create baskets)
```

---

## Key Design Decisions

### 1. No Login / No Auth (for now)

**Decision:** Users don't create accounts. Personal baskets (v2) use a unique URL with a random ID.

**Why:** Friction kills adoption for a small utility. Nobody wants to create an account to check grocery deals. A bookmarkable URL is simpler than login.

**Trade-off:** Anyone with the URL can access/edit a basket. Acceptable risk for 10-50 users who share links intentionally.

**Revisit when:** If we add email notifications and need to prevent spam/abuse.

### 2. Supabase over local JSON

**Decision:** Store deals in Supabase rather than committing JSON files to the repo.

**Why:** Supabase gives us a queryable database, filtering by category/store/date, and a REST API the frontend can call directly. JSON in the repo would require rebuilding the site every time data updates.

**Trade-off:** Dependency on Supabase free tier (500MB limit, 50K rows). If Supabase goes down, the site shows stale data.

**Revisit when:** If Supabase free tier limits are hit (unlikely at our scale).

### 3. Python for Data Pipeline (not Node.js)

**Decision:** Data fetching script in Python, separate from the React frontend.

**Why:** Python has the best web scraping ecosystem (requests, BeautifulSoup, Playwright for JS-rendered pages). The pipeline is a scheduled batch job, not part of the web app.

**Trade-off:** Two languages in the project (Python + TypeScript). Acceptable since they serve different purposes.

### 4. Weekly Batch (not Real-time)

**Decision:** Fetch deals once per week (Thursday evening) via cron, not in real-time.

**Why:** Supermarket promotions change weekly, not hourly. Real-time scraping would hit rate limits, cost more, and add complexity for zero benefit.

**Trade-off:** If a promotion ends mid-week or a new flash sale appears, we miss it. Acceptable for v1.

### 5. Manual Category Mapping (v1)

**Decision:** Map products to categories (Fresh / Long-life / Non-food) using keyword rules, not ML.

**Why:** Supermarkets already have product categories. We map their categories to our three buckets with simple rules (e.g., "Gemuese" -> Fresh, "Waschmittel" -> Non-food). Fast, transparent, debuggable.

**Trade-off:** Some products will be miscategorized. Users can report errors. Improve rules over time.

**Revisit when:** If the rule set becomes unmanageable (100+ rules) or accuracy drops below 90%.

### 6. Vercel over Lovable

**Decision:** Host on Vercel, build with Claude Code. Not Lovable.

**Why:** This is a portfolio project. Lovable would ship faster but: (a) code is less visible/reviewable, (b) "Made with Lovable" badge on free tier, (c) hosting lock-in, (d) hiring managers may see it as "just used a no-code tool." Building with Claude Code and hosting on Vercel shows technical product capability.

**Trade-off:** Slower to build than Lovable. Worth it for the portfolio signal.
