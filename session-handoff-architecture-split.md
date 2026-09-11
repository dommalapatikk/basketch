# Handoff — Architecture revisit: 3-part split

**Written:** 2026-09-07
**Status:** Not started. Session restarted from `/Users/kiran/ClaudeCode/basketch` so the project `architect` agent loads.

---

## What the user asked for

> "I want to revisit the project architecture. I want to split it into 3 parts: **data collection**, **processing**, and **frontend**."

Nothing has been designed or changed yet. This file is context only.

## Next step in the new session

1. Read this file + `CLAUDE.md`
2. Invoke `architect` with the brief below
3. Then `architect-challenger` to red-team the result (per the Universal Resolution Loop in CLAUDE.md)
4. Nothing gets built until the user approves the shape

---

## Current architecture — verified facts (read from the repo, not assumed)

### Top-level folders
| Folder | Role today |
|---|---|
| `pipeline/` | **Collection AND processing mixed together.** Own `package.json`. |
| `web-next/` | Next.js 16 frontend, live at basketch.vercel.app. Own `package.json`. |
| `shared/` | Types + category rules + migrations. No package.json — imported via tsconfig `@shared/*` paths. |
| `supabase/` | 6 SQL migrations (latest `20260427_v3_concept_layer.sql`) |
| `archive/web-vite/` | Retired legacy frontend. Do not modify. |
| `docs/` | ~60 PM/architecture docs |

### Where the collection/processing boundary already exists (and where it doesn't)

**Collection (Python) — already fairly separate:**
- `pipeline/aktionis/` — the live scraper. `fetch.py` (128 lines), `normalize.py` (360), `main.py` (66), `test_fetch.py` (729), `fixtures/`, own `.venv`
- `pipeline/coop/` — older Coop scraper. `fetch.py` (112), `normalize.py` (186), `main.py` (47), `test_fetch.py` (483), own `.venv`
- `pipeline/archive/migros/` — retired
- Output contract: writes `<slug>-deals.json` files. This is the natural seam.

**Processing (TypeScript) — lives in `pipeline/` root, flat:**
- `run.ts` (328) — orchestrator, reads the JSON files, runs every step in sequence
- `grocery-filter.ts` (88) — reject non-grocery at ingest
- `product-metadata.ts` (242) — brand/quantity/organic extraction
- `categorize.ts` (46) + `shared/category-rules.ts`
- `resolve-taxonomy.ts` (116) — alias map from `taxonomy_alias` table
- `product-group-assign.ts` (627) — largest module
- `product-resolve.ts` (208) — product identity resolution
- `format-extract.ts` (221)
- `store.ts` (204) — Supabase upsert
- `v3-cutover.ts` (278) — concept/sku layer population
- `validate.ts` (55)
- `supabase-client.ts`
- `migrate/` (2 one-off scripts), `scripts/` (4 backfill scripts)

**Frontend — `web-next/src/`:**
- `app/[locale]/` (deals, list, settings, about), `app/api/revalidate`, `app/card`
- `components/` (ui, landing, deals, list)
- `server/data/` (snapshot.ts uses `use cache`), `server/verdict/` (algorithm.ts)
- `lib/`, `stores/`, `i18n/`, `messages/`

### How the parts talk to each other today
```
GitHub Actions (pipeline.yml)
  job 1: fetch-deals    → 8-store matrix, Python, per-store day gating
                        → uploads <slug>-deals.json as GH artifacts (7-day retention)
  job 2: process-and-store → downloads all artifacts → `npx tsx run.ts`
                        → writes Supabase → POSTs revalidate webhook to web-next
  job 3: keep-alive     → pings Supabase so the free tier doesn't auto-pause
```
- **Collection → Processing contract:** `<slug>-deals.json` files, GitHub artifacts, `UnifiedDeal[]` shape, validated by `validate.ts`
- **Processing → Frontend contract:** Supabase tables + a `POST` to `WEB_REVALIDATE_URL` with `{tag:'deals'}`
- Frontend never talks to the pipeline directly. It reads Supabase.

### Constraints that must survive any restructure
- **Zero paid services.** GitHub Actions free tier (~60 min/mo used of 2,000), Supabase free 500 MB, Vercel free. No paid workers, no paid LLM.
- **No npm workspaces** (existing explicit rule in CLAUDE.md). Each folder installs separately.
- `SUPABASE_SERVICE_ROLE_KEY` never reaches the frontend.
- Pipeline sources return `UnifiedDeal[]` or empty array — never throw.
- Two languages stay: Python for scraping, TypeScript for processing + frontend.

---

## Brief for the architect

**Question to answer:** Should `pipeline/` be split into two top-level parts — collection and processing — and if so, exactly how?

Cover:
1. **Is the split worth it?** Say no if the answer is no. The collection/processing seam already half-exists via the JSON file contract.
2. **Proposed folder layout** for all three parts, with what moves where — file by file.
3. **The two contracts** — collection→processing and processing→frontend. Are the current ones (JSON artifacts, Supabase + webhook) right, or do they need to change?
4. **Where `shared/` goes.** It's currently imported by both pipeline and web-next via tsconfig paths. Does a 3-way split need a 4th shared part, or does it fold in?
5. **What breaks.** `pipeline.yml` paths, tsconfig paths, `npm ci` cache paths, Vercel build config, the two `.venv`s, `dist/`.
6. **Migration order** — smallest reversible steps, each one leaving the pipeline runnable.
7. **Cost check.** Must stay zero-paid.

**Do not** write code or move files. Design only. The user approves the shape before anything moves.

---

## Working tree state at handoff (uncommitted, NOT mine — left untouched)
- Modified: `session-summary.md`, `web-next/src/app/icon.svg`, `web-next/src/components/Header.tsx`
- Untracked: `logo-concepts.html`, `web-next/src/components/BasketchMark.tsx`
- Looks like an in-progress logo / brand mark change from a previous session. Ask the user before touching.

## Other open threads (not this session's focus)
- Observe.inc observability wiring — needs Customer ID + Datastream Token from user
- V3 9-table data model — approved, designer → challenger → tech-lead → builder chain still pending
- Last commit `0543591` on 2026-08-06. Watch the 60-day GitHub cron auto-disable window.
