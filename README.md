# basketch

**This week's grocery promotions from seven Swiss supermarkets, side by side.**

basketch is a free web page that shows this week's promotions from Migros, Coop, LIDL, ALDI, Denner, SPAR and Volg. It compares the stores by category and lets you build a shopping list, grouped by store with an estimated total, that you can share. No app and no account are needed.

Live: **https://basketch.vercel.app** (German by default, English at `/en`).

---

## What it does today

- **Home.** For each of Fresh, Long-life and Household, names the store with the highest average discount this week, or says it is tied.
- **Deals.** Every collected promotion, grouped by sub-category, with filters by type, category, storage and store, and a search.
- **My list.** Add deals to a list that is kept only in your browser. The list is grouped by store, with a total per store and an estimated overall total. Share it by WhatsApp, email or link.
- **Honest prices.** Each deal shows its validity dates and a link to where the price came from. Prices that apply only from a certain date or when buying several are labelled, and they never decide a winner.

basketch compares weekly **promotions**, not regular shelf prices. It does not choose the cheapest store for each item. You pick the deals; routing each item to its cheapest store is a long-term goal that has not been built. Details, known gaps and open questions are in the [PRD](docs/prd.md).

## Where the data comes from

| Retailer | Source |
|---|---|
| Denner | denner.ch |
| Volg | volg.ch weekly offers |
| LIDL, ALDI, SPAR | the retailer's public weekly flyer |
| Migros | the public weekly flyer (Issuu, Zurich edition), read with free OCR |
| Coop | aktionis.ch, a public Swiss deal site, because coop.ch blocks automated access |

A scheduled pipeline collects all seven retailers on **Monday, Tuesday and Thursday**. Products are sorted into basketch's own category list by an AI model (Google Gemini, free tier), and a second AI model (via OpenRouter) checks the answers. basketch never works around a technical block.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind, next-intl (German and English) |
| Pipeline | TypeScript, with Python for Migros OCR, on GitHub Actions |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |

**Cost:** free tiers, plus one paid AI checker capped at USD 5 per month.

## Case-study documents

| Document | What it covers |
|---|---|
| [PRD v4.0](docs/prd.md) | Problem, goal vs. what ships, product rules, data, status, risks, open product questions |
| [Use cases v3.0](docs/use-cases.md) | Live and parked use cases with acceptance criteria and known defects |
| [Technical architecture v2.0](docs/technical-architecture.md) | System design, modules, data flow |
| [Business model canvas v2.0](docs/business-model-canvas.md) | The nine blocks, competition, assumptions to validate |
| [Competitive analysis v2.0](docs/competitive-analysis.md) | 13 tools (6 Swiss, 7 international), sourced |

## Running it locally

Requires Node.js and Python 3.

```bash
./setup.sh                      # installs pipeline + frontend deps, Python OCR deps, creates .env from .env.example
cd web-next && npm run dev      # frontend at http://localhost:3000
```

Tests (three separate suites):

```bash
cd pipeline && npm test
cd shared   && npx vitest run
cd web-next && npm test && npm run lint
```

Type-check each package from its own folder: `./node_modules/.bin/tsc --noEmit -p tsconfig.json`. See `CLAUDE.md` for conventions.

## Built with

Built with [Claude Code](https://claude.ai/code), from PRD through implementation, as part of the product process.

## Author

**Kiran Dommalapati**, Senior Product Manager, Bern, Switzerland.
[LinkedIn](https://linkedin.com/in/kirandommalapati) | [Email](mailto:d_kirand@yahoo.com)
