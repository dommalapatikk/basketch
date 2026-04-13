# Delivery Roadmap: basketch

**Author:** Kiran Dommalapati
**Last Updated:** 12 April 2026

---

## Project Framing

A real product for a tiny audience (10-50 friends), documented like a portfolio project. No MVP phasing — build everything together.

---

## Pre-Build: Validate Data Access

**Duration:** 1 evening (2-3 hours)
**Goal:** Confirm we can actually get deal data from Migros and Coop before writing any app code.

| Task | Method | Success Criteria |
|------|--------|-----------------|
| Test Migros Search API `/discounts` | Call endpoint with curl/Postman | Returns structured JSON with product name, price, discount, category |
| Test Migros Search API `/products` | Call endpoint | Returns product catalog data |
| Test aktionis.ch scraping | Scrape aktionis.ch Coop promotions | Returns structured deal data (name, prices, discount) |
| Run pipeline 2-3 times | Execute full pipeline weekly | Accumulate Coop product history for favorites feature |

**Go / No-Go Decision:**
- If both Migros and Coop data is accessible -> proceed to build
- If only Migros works -> build Migros-only, add Coop later
- If neither works -> pivot to manual data entry or alternative sources

---

## Build Order (AC/DC Loop — All Features)

Everything ships together. Each module follows: Guide -> Generate -> Verify -> Solve -> Next.

| Step | Module | What It Delivers |
|------|--------|-----------------|
| 1 | **Shared types + Supabase setup** | `shared/types.ts`, database tables (deals, products, product_groups, baskets, basket_items, pipeline_runs), RLS policies, `updated_at` trigger |
| 2 | **Migros source** | `pipeline/migros/` — fetches full catalog + promotions via migros-api-wrapper, outputs `UnifiedDeal[]` |
| 3 | **Coop source** | `pipeline/coop/` — scrapes aktionis.ch promotions via Python/BeautifulSoup, outputs `UnifiedDeal[]` as camelCase JSON |
| 4 | **Categoriser + storage** | `pipeline/categorize.ts` + `pipeline/store.ts` — keyword categorisation (fresh/long-life/non-food), product name normalisation, Supabase upsert with non-null `discount_percent` |
| 5 | **GitHub Actions workflow** | `.github/workflows/pipeline.yml` — weekly cron (17 17 * * 4), parallel source fetching, graceful degradation, Supabase keep-alive, JSON contract validation |
| 6 | **Frontend data layer** | `web/src/lib/` — Supabase queries, verdict calculation (40% count + 60% avg discount, 5% tie threshold), data caching |
| 7 | **Frontend UI** | All pages and components shipped together: |
|   | | - **Home:** Weekly verdict banner + 3 category cards + deals browsing (the aha moment, zero setup) |
|   | | - **Deals browsing:** `/deals` — browse all promotions by category and store |
|   | | - **Favorites onboarding:** `/onboarding` — 5 starter packs (Swiss Basics, Indian Kitchen, Mediterranean, Studentenkuche, Familientisch) + custom add |
|   | | - **Comparison:** `/compare/:id` — personal favorites with two-tier Coop status messages |
|   | | - **About:** `/about` — how it works, data sources |
|   | | - **404:** Error page |
|   | | - **Wordle card:** Screenshot-friendly verdict card for WhatsApp sharing |
|   | | - **OG meta tags:** Rich previews for link sharing |
|   | | - **Accessibility:** WCAG 2.1 AA (4.5:1 contrast, 44px touch targets, keyboard nav, screen reader support) |
| 8 | **Deploy** | Vercel hosting, custom domain (basketch.ch), final verification |

---

## Pre-Launch Checklist

| Task | Why | Status |
|------|-----|--------|
| Run pipeline 2-3 weeks before sharing with friends | Accumulate Coop product history — reduces "No Coop data yet" messages | Pending |
| Validate starter pack items against products table | First impression management — items with both-store data should appear first | Pending |
| Verify OG tags render correctly in WhatsApp | Rich previews drive sharing | Pending |
| Test on mobile (Safari + Chrome) | Primary usage is mobile | Pending |
| Set up Supabase keep-alive in pipeline | Prevent free tier auto-pause | Pending |

---

## Growth Channels

| Channel | Mechanism | When |
|---------|-----------|------|
| **WhatsApp** | Wordle-style verdict card (screenshot sharing) + link sharing with OG previews | From day one — friends and family groups |
| **SEO** | Weekly verdict pages (`/woche/2026-kw16`), category pages (`/kategorie/frisch`) | Long-term — requires SSR migration (Astro or Next.js) when organic traffic becomes a goal |
| **Word of mouth** | Personal sharing among 10-50 friends in Switzerland | From day one |

---

## Future (If Demand Exists)

| Feature | Effort | Trigger |
|---------|--------|---------|
| Email notifications ("Your deals this week") | Medium | Users request it |
| Add Aldi, Lidl, Denner | Medium | Users request it |
| Price history / trend charts | Medium | "Is this actually a good deal?" |
| German language UI | Small | German-speaking users join |
| SSR migration (Astro/Next.js) for SEO | Medium | Organic search becomes a growth goal |
| Domain: basketch.ch | Small (CHF 15/year) | When ready to share publicly |
