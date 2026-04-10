# Delivery Roadmap: basketch

**Author:** Kiran Dommalapati
**Date:** 9 April 2026

---

## Phase 0: Validate Data Access (before building anything)

**Duration:** 1 evening (2-3 hours)
**Goal:** Confirm we can actually get deal data from Migros and Coop before writing any app code.

| Task | Method | Success Criteria |
|------|--------|-----------------|
| Test Migros Search API `/discounts` | Call endpoint with curl/Postman | Returns structured JSON with product name, price, discount, category |
| Test Migros Search API `/products` | Call endpoint | Returns product catalog data |
| Inspect Coop network requests | Open coop.ch/promotions in browser, check Network tab | Find internal API calls returning JSON deal data |
| Test Coop internal API directly | Call the discovered endpoint | Returns structured data we can parse |
| Evaluate Rappn.ch | Use the app, check coverage | Understand what they offer vs what we'd build |

**Go / No-Go Decision:**
- If both Migros and Coop data is accessible -> proceed to Phase 1
- If only Migros works -> build Migros-only MVP, add Coop later
- If neither works -> pivot to manual data entry or Rappn partnership

---

## Phase 1: MVP — Weekly Deal Comparison (Weekend 1)

**Duration:** 1 weekend (Saturday + Sunday)
**Goal:** Live website showing this week's Migros vs Coop deals in 3 categories.

### Saturday: Data Pipeline + Backend

| Task | Hours | Details |
|------|-------|---------|
| Set up Supabase project | 0.5h | Create tables: deals (id, store, name, category, original_price, sale_price, discount_pct, valid_from, valid_to, image_url) |
| Build Migros fetcher (Python) | 2h | Call search-api.migros.ch/discounts, parse response, categorize, upsert to Supabase |
| Build Coop fetcher (Python) | 2h | Scrape or call internal API, parse, categorize, upsert to Supabase |
| Category mapping rules | 1h | Map supermarket categories to our 3 buckets (Fresh / Long-life / Non-food) |
| Test full pipeline locally | 0.5h | Run script, verify data in Supabase |

### Sunday: Frontend + Deploy

| Task | Hours | Details |
|------|-------|---------|
| Scaffold React + Vite + Tailwind + shadcn/ui | 0.5h | Use Claude Code to generate project skeleton |
| Home page: Weekly Verdict banner | 1h | "This week: Migros wins for Fresh, Coop wins for Household" — auto-calculated from deal counts/discounts |
| Three category cards | 2h | Each card shows top deals from both stores, side by side, with discount %, original price |
| Connect frontend to Supabase | 0.5h | Supabase JS client, fetch deals for current week |
| Deploy to Vercel | 0.5h | Connect GitHub repo, auto-deploy |
| Set up GitHub Actions cron | 0.5h | Weekly trigger (Thursday 18:00 CET), runs Python pipeline |
| Write README.md | 1h | Problem, approach, architecture, screenshot |

**Deliverable:** Live website at basketch.vercel.app showing this week's deals.

---

## Phase 2: Personal Baskets (Weekend 2)

**Duration:** 1 weekend
**Goal:** Users can create a named basket of their regular items and see only relevant deals.

| Task | Hours | Details |
|------|-------|---------|
| Supabase tables: baskets, basket_items | 0.5h | Schema setup |
| "Create basket" flow | 2h | Name your basket, pick categories/items, get a unique URL |
| Basket view page (/basket/[id]) | 2h | Shows only deals matching your items, grouped by store |
| Edit basket | 1h | Add/remove items, change name |
| Optional email field | 0.5h | Store email in basket record for future notifications |
| Mobile-responsive polish | 1h | Test on phone, fix layout issues |
| Update README | 0.5h | Add basket feature, updated screenshots |

**Deliverable:** Users can create baskets at basketch.vercel.app/basket/[id]

---

## Phase 3: Notifications + Polish (Weekend 3)

**Duration:** 1 weekend
**Goal:** Email notifications and production polish.

| Task | Hours | Details |
|------|-------|---------|
| Email service setup (Resend or Supabase Edge Function) | 1h | Free tier, transactional email |
| Weekly email: "Your deals this week" | 2h | Triggered by cron after data refresh, sends to baskets with email |
| Unsubscribe link | 0.5h | One-click unsubscribe |
| PWA manifest + icons | 1h | Installable on phone home screen |
| SEO: meta tags, Open Graph, structured data | 1h | Shareable links look good on WhatsApp/Telegram |
| About page | 0.5h | How it works, data sources, built by Kiran |
| Final README polish | 1h | Full PM case study: problem, research, decisions, architecture, screenshots, roadmap |

**Deliverable:** Complete product with notifications, shared via GitHub.

---

## Future (if demand exists)

| Feature | Effort | Trigger |
|---------|--------|---------|
| Add Aldi, Lidl, Denner | Medium | Users request it |
| Price history / trend charts | Medium | "Is this actually a good deal or always this price?" |
| German language UI | Small | Swiss German-speaking users |
| Telegram/WhatsApp notifications | Small | Users prefer messaging over email |
| Community basket sharing | Medium | "Share your basket with friends" |
| Domain: basketch.ch | Small (CHF 15/year) | When ready to share publicly beyond friends |
