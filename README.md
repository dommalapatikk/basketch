# basketch

**Swiss weekly grocery deal comparison — Migros vs Coop, at a glance.**

> Know which store to visit for what, every weekend. Stop guessing, start saving.

---

## The Problem

Swiss residents who shop at both Migros and Coop waste time and money because there's no simple way to compare weekly promotions across both stores. You either check both websites manually, or you pick one store and miss savings at the other.

## The Solution

basketch fetches weekly promotions from Migros and Coop every Thursday, categorizes them into three shopping buckets, and tells you:

**"This week: go to Migros for vegetables, go to Coop for washing powder."**

Three categories, tailored to how you actually shop:

| Category | What's in it | Why it matters |
|----------|-------------|---------------|
| **Fresh** | Vegetables, dairy, meat, fruit, bread | Buy this week where it's cheapest |
| **Long-life food** | Nuts, chocolate, pasta, rice, coffee | Stock up when on sale |
| **Non-food** | Washing powder, tissues, shampoo | Buy in bulk for months |

## How It Works

1. **Every Thursday evening**, a scheduled job fetches current promotions from both stores
2. Deals are categorized into three buckets and stored in a database
3. The website shows a side-by-side comparison with a clear weekly verdict
4. (v2) Create a personal basket of your regular items — see only deals that matter to you
5. (v3) Get a weekly email: "Your items are on sale at Coop this week"

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui | Modern, fast, polished UI components |
| Database | Supabase (PostgreSQL) | Free tier, REST API, real-time subscriptions |
| Data Pipeline | Python + GitHub Actions | Best scraping ecosystem, free weekly cron |
| Hosting | Vercel | Free, global CDN, auto-deploy from GitHub |

## Project Documentation

This project is documented as a PM case study:

- [Product Requirements (PRD)](docs/prd.md) — problem, users, stories, data model, risks
- [Use Cases](docs/use-cases.md) — structured use cases with acceptance criteria (Given/When/Then)
- [Architecture Decisions](docs/architecture.md) — tech choices with trade-offs
- [Delivery Roadmap](docs/roadmap.md) — phased plan across 3 weekends

## Built With

This project was built using [Claude Code](https://claude.ai/code) as the primary development tool — from PRD writing through implementation. AI-assisted development is part of the product process, not a shortcut.

## Status

- [x] PRD written
- [x] Architecture decisions documented
- [x] Roadmap planned
- [ ] Phase 0: Data source validation
- [ ] Phase 1: MVP (weekly deal comparison)
- [ ] Phase 2: Personal baskets
- [ ] Phase 3: Notifications

## Author

**Kiran Dommalapati** — Senior Product Manager, Bern, Switzerland
[LinkedIn](https://linkedin.com/in/kirandommalapati) | [Email](mailto:d_kirand@yahoo.com)

---

*basketch is a personal project built to solve a real problem and demonstrate product management in practice.*
