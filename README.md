# basketch

**Your groceries. Two stores. One smart list.**

> Pick your regular items. See which are on sale at Migros or Coop this week. Get a split shopping list that tells you exactly where to buy each. 45 seconds to set up — no app, no account, no login.

---

## The Problem

Every weekend, Swiss shoppers face the same question: **"Should I go to Migros or Coop?"**

Existing deal sites show you 200+ promotions — but you only buy 15-20 items regularly. The problem isn't "which deals exist." It's **"which of MY products are cheaper where this week."**

No tool in Switzerland answers that question today.

## How basketch Works

```
1. Pick a starter pack       →  Swiss Basics, Indian Kitchen, Mediterranean, or General Mix
2. Customize your list       →  Remove what you don't buy, search and add what you do
3. See your comparison       →  Which of YOUR items are on sale, at which store
4. Get your split list       →  "Buy these at Migros. Buy these at Coop."
5. Save with email           →  Come back next week — your list is waiting
```

No app to install. No account to create. No password to remember.

## What Makes It Different

| Feature | Rappn | Aktionis | Profital | Bring! | **basketch** |
|---------|-------|----------|----------|--------|-------------|
| Personal favorites tracking | Category-level | Wishlist | Stores only | Full lists | **Product-level** |
| Cross-store comparison | Yes (5 stores) | No | No | No | **Yes (Migros vs Coop)** |
| Split shopping list | No | No | No | No | **Yes** |
| No app / no login needed | No (app) | Yes | No (app) | No (app) | **Yes** |
| Starter pack onboarding | No | No | No | No | **Yes (45 sec)** |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + TypeScript | Fast, mobile-first, no app needed |
| Database | Supabase (PostgreSQL) | Free tier, REST API, row-level security |
| Data Pipeline | TypeScript + Python + GitHub Actions | Migros API + Coop scraping, weekly cron |
| Hosting | Vercel | Free, global CDN, auto-deploy from GitHub |

**Total cost: CHF 0/month** — all free tiers.

## Data Pipeline

Every **Wednesday at 22:00 CET**, a scheduled pipeline:
1. Fetches Migros promotions via [migros-api-wrapper](https://github.com/nickreynolds/migros-api-wrapper) (open source, guest OAuth2)
2. Scrapes Coop promotions from [aktionis.ch](https://aktionis.ch) (public aggregator)
3. Categorizes deals into Fresh / Long-life / Non-food
4. Stores in Supabase — ready for Thursday morning shopping

Verification run at **Thursday 07:00 CET** catches any late updates.

## Project Documentation

This project is built and documented as a PM case study:

| Document | What it covers |
|----------|---------------|
| [PRD](docs/prd.md) | Problem, users, stories, data model, risks |
| [Technical Architecture](docs/technical-architecture.md) | System design, modules, data flow, build order |
| [Use Cases](docs/use-cases.md) | Structured use cases with Given/When/Then acceptance criteria |
| [Business Model Canvas](docs/business-model-canvas.md) | All 9 BMC blocks, assumptions, differentiation |
| [Competitive Analysis](docs/competitive-analysis.md) | 18 competitors across Swiss, UK, and international markets |
| [Coding Standards](docs/coding-standards.md) | Conventions, patterns, testing |
| [Delivery Roadmap](docs/roadmap.md) | Phased plan |

## Status

- [x] PRD, architecture, use cases, competitive analysis
- [x] Shared types, database schema, starter pack seed data
- [x] CI/CD pipelines (GitHub Actions)
- [ ] Migros source module
- [ ] Coop source module
- [ ] Categorizer + storage
- [ ] Frontend: onboarding flow (templates → customize → compare)
- [ ] Frontend: comparison view + split shopping list
- [ ] Deploy to Vercel

## Built With

Built using [Claude Code](https://claude.ai/code) — from PRD through implementation. AI-assisted development is part of the product process, not a shortcut.

## Author

**Kiran Dommalapati** — Senior Product Manager, Bern, Switzerland
[LinkedIn](https://linkedin.com/in/kirandommalapati) | [Email](mailto:d_kirand@yahoo.com)

---

*basketch solves a real problem for real shoppers — and documents the entire PM process behind it.*
