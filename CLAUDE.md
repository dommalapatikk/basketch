# basketch -- Project Instructions for Claude Code

Swiss grocery deal comparison across **seven retailers** — Migros, Coop, LIDL, ALDI, Denner, SPAR, Volg — routing each item to its cheapest store and producing a forwardable shopping list.
Built with Next.js 16 (frontend, in `web-next/`), TypeScript + Python (pipeline), Supabase (database), Vercel (hosting).
The legacy React + Vite frontend has been archived to `archive/web-vite/` — see `archive/web-vite/RETIRED.md`. Do not modify.

> **Current direction (2026-09).** The data source is being replaced: aktionis.ch is dropped, offers come **direct from each retailer**, and categorisation moves to our own model. Design method is **domain-driven**, development is **test-driven**, structure is **modular**.
> **Read `docs/collection-module-design.md` and `docs/data-source-research-2026-09-07.md` before touching collection code.** They carry every verified endpoint, the legal position, and the per-field source matrix.

## Folder Structure (Flat -- No npm Workspaces)

```
basketch/
├── pipeline/              # Data pipeline (TS + Python). Own package.json.
│   ├── aktionis/          # LEGACY aggregator scraper (Python) — being replaced
│   ├── coop/              # LEGACY Coop scraper (Python) — being replaced
│   ├── archive/migros/    # RETIRED direct Migros integration — do not revive (see legal note below)
│   ├── product-metadata.ts # Brand/quantity/organic extraction (pure function)
│   ├── product-resolve.ts # Product identity resolution (find/create in products table)
│   ├── categorize.ts      # Category + sub-category assignment
│   ├── store.ts           # Supabase upsert + logPipelineRun
│   ├── v3-cutover.ts      # concept/sku layer population
│   └── run.ts             # Pipeline entry point
├── web-next/              # Next.js 16 frontend (LIVE at basketch.vercel.app). Own package.json.
│   └── src/
│       ├── app/[locale]/  # App Router pages, layouts, route handlers
│       ├── components/    # DealCard, FilterRail, FilterSheet, BottomBar, IconHeading, etc.
│       ├── lib/           # filters.ts, types.ts, store-tokens.ts, sub-category-labels.ts
│       └── server/        # data/snapshot.ts (use cache), data/filter-deals.ts, verdict/algorithm.ts
├── archive/web-vite/      # RETIRED legacy Vite frontend — do not modify
├── shared/                # Shared types. HAS its own package.json + vitest suite.
│   ├── types.ts           # All types + BROWSE_CATEGORIES constant
│   └── category-rules.ts  # Category + sub-category keyword rules
├── supabase/migrations/   # SQL migrations (latest: 20260427_v3_concept_layer.sql)
├── docs/                  # PM + architecture documentation
└── .github/workflows/     # pipeline.yml (staggered weekly cron)
```

Import shared types with a **relative path**: `import { Deal } from '../shared/types'`

> ⚠️ The `@shared/*` tsconfig alias resolves for `tsc` but **not at runtime** under `tsx` or
> `vitest`, so an aliased import type-checks and then fails when the pipeline actually runs.
> Every existing pipeline module uses relative paths. Keep the alias for editor tooling; do not
> rely on it in code that executes.

### Planned: collection module (modular + DDD)

Per `docs/collection-module-design.md`, the new module is layered by **import direction**:

```
<module>/
  domain/          value objects, Offer aggregate, invariants, the OfferSource port
                   → imports NOTHING from infrastructure
  application/     orchestration: run a collection, assemble results
  infrastructure/  one adapter per retailer — implements domain ports
  __fixtures__/    captured real responses so tests run offline
```

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| TS modules | kebab-case | `category-rules.ts` |
| React components | PascalCase | `VerdictBanner.tsx` |
| Tests | source + `.test` | `categorize.test.ts` |
| Python files | snake_case | `test_fetch.py` |
| Variables, functions | camelCase (TS), snake_case (Python) | `fetchDennerOffers`, `fetch_coop_deals` |
| Types, interfaces | PascalCase | `UnifiedDeal`, `CategoryVerdict` |
| Constants | UPPER_SNAKE_CASE | `CATEGORY_RULES`, `TIE_THRESHOLD` |
| Aggregate / value object | PascalCase, singular | `Offer`, `Money`, `CropRegion` |
| Port | PascalCase noun, no `I` prefix | `OfferSource` |
| Adapter | `<Source><Mechanism>Source` | `DennerApiSource`, `CoopFlyerSource` |

Named exports only (no default exports). Union types over enums.

## Key Coding Patterns

- **TypeScript strict mode** always on. 2-space indent, single quotes, no semicolons.
- **Python PEP 8** with Ruff. 4-space indent, double quotes. Type hints on all function signatures.
- **One component per file.** No barrel files. Import directly.
- **Three states always:** loading, error, success -- every data-fetching component.
- **Supabase queries stay in the server data layer** -- components never call `supabase.from()`.
- **Date filter safety net** on all deal queries: `.gte('valid_to', today)` prevents showing expired deals.
- **Pipeline sources never throw.** They return a result. **Empty is not success** — a source that normally yields ~200 offers returning 3 is `BelowExpectedYield`, a failure.
- **Pipeline flow:** collect -> normalize -> extract metadata -> categorize -> resolve product -> upsert deal -> revalidate.
- **`discount_percent` is NOT NULL** in the database. Pipeline calculates from prices if source omits it — **but only when an original price genuinely exists** (see the ALDI rule below).
- **Product names normalised** before upsert (lowercase, collapse whitespace, standardise units).
- **JSON output from Python uses camelCase** to match TypeScript interfaces.
- **Store brand colours are DATA, not UI** — dot, pill and 3px rail only, **never as backgrounds**. Canonical values live in `web-next/src/lib/store-tokens.ts` (`STORE_BRAND`); do not hardcode hexes elsewhere.
- **WCAG 2.1 AA:** 44px touch targets, focus-visible rings, semantic HTML, no colour-only information.
- **Lazy-load html2canvas** via dynamic `import()` on button click. Never in the main bundle.

### Domain-Driven Design (approved method)

- **Aggregate:** `Offer` — one promoted product, one retailer, one validity period.
- **Value objects over primitives:** `Money`, `Discount`, `ValidityPeriod`, `CropRegion`, `PriceBasis`. A bare `number` carrying francs is a defect.
- **Invariants are enforced in the constructor**, never by a caller remembering to check. An invariant that only exists in a markdown file is a comment, not an invariant.
- **Every retailer adapter is an anti-corruption layer.** Retailer vocabulary (`insteadPriceText`, `_tracking_item_category2`, `prd_page`, `refiningId`) dies inside the adapter and never reaches the domain.
- **The domain layer imports no infrastructure** — no fetch, no PDF library, no Supabase. Enforce with ESLint `no-restricted-imports`, not prose.
- **Reject over-engineering.** One developer, 10–50 users, free tier. Aggregates, value objects, invariants and ACLs pay for themselves here. Repositories-wrapping-repositories, event buses and CQRS do not.

**The invariants:**
```
salePrice > 0
originalPrice === null  ⟺  discountPercent === null      ← the ALDI rule
originalPrice !== null  →   originalPrice > salePrice
validTo >= validFrom
ProductImage is exactly one of SourceUrl | CropRegion
PriceBasis.MemberOnly must name its programme            ← the LIDL rule
```

### Test-Driven Development (approved method)

1. **Domain first** — value objects and `Offer` invariants. Pure, no I/O, no mocks. If a domain test needs a mock, the layering is wrong.
2. **Port contract test** — one shared suite every adapter must pass.
3. **Adapter by adapter against captured fixtures** — offline, fast, deterministic.
4. **Regression tests named after the real defect they prevent.**

## Testing Commands

```bash
# Pipeline TypeScript tests
cd pipeline && npm test          # vitest run

# Shared types + taxonomy tests -- SEPARATE SUITE, easy to forget
cd shared && npx vitest run      # neither pipeline nor web-next runs these

# Frontend tests
cd web-next && npm test          # vitest run

# Frontend lint
cd web-next && npm run lint      # biome check .

# Python tests
cd pipeline/aktionis && python -m pytest

# Type-check without emitting
npx tsc --noEmit -p pipeline/tsconfig.json
npx tsc --noEmit -p web-next/tsconfig.json
```

## Environment Variables

| Variable | Where | Secret? |
|----------|-------|---------|
| `SUPABASE_URL` | Pipeline (GH secrets) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline (GH secrets) | YES -- never in frontend |
| `WEB_REVALIDATE_URL` / `WEB_REVALIDATE_SECRET` | Pipeline (GH secrets) | YES |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | No (read-only via RLS) |
| `NEXT_PUBLIC_SITE_URL` | Frontend | No |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` | Frontend | No |

## Legal Constraints (binding — see `docs/data-source-research-2026-09-07.md`)

- **Never circumvent a technical protection measure.** This is the explicit condition in the 2023 Swiss Federal Supreme Court rulings. Do **not** revive `migros-api-wrapper` (its TLS-1.3 pinning defeats a 403 wall) and do **not** attempt to get past Coop's DataDome. If an honest client is blocked, that is a refusal — use the retailer's openly served flyer instead.
- **Do not fetch** `migros.ch/de/offers/instore/`, `*/offers/coupons/` or `*/promotion/` — robots.txt disallows them and the terms name web crawlers explicitly.
- **Never copy product photographs.** Art. 2 Abs. 3bis URG protects Swiss product photos by default. Store `{pageImageUrl, x, y, w, h}` and crop in the browser via CSS. The image is fetched by the visitor from the retailer; it is never reproduced on basketch infrastructure.
- **Price comparisons must be objectively correct** (Art. 3(1)(e) UWG). Show the validity window, expire aggressively, never imply exhaustiveness, and **always label member-only prices** (Lidl Plus, Supercard, Cumulus).
- **Filter personal data at parse time** — reviews, usernames, named staff.
- One fetch per store per week. Honest user agent with contact address.
- **Zero paid services.** GitHub Actions free tier, Supabase free 500 MB, Vercel free. No paid LLM, no paid unblocking proxy.

## Universal Resolution Loop

**Every agent follows the same closed loop.** No fire-and-forget. No findings ignored.

```
Creator produces work ──→ Challenger/Reviewer reviews ──→ Findings
                                                             │
                              For EACH finding:
                              │
                 Creator ACCEPTS ──→ Fix and re-submit ──→ Re-reviewed (only fixed items)
                 Creator DISAGREES ──→ ESCALATE to PM (human) ──→ PM decides
                 Both AGREE to discard ──→ Documented and closed
                              │
                 Loop until zero open findings ──→ Proceed to next step
```

**Rules:**
- Zero open findings before proceeding to the next phase
- Re-reviews check ONLY the fixed items, not the entire work
- **Tech Lead decides** technical disagreements (code, architecture, testing, performance)
- **PM decides** product disagreements (scope, UX, features, priorities)
- When Tech Lead and PM disagree, **PM has final call** (product owner)
- All decisions (accept, override, discard) are documented with reasoning
- Flags are tracked but don't block — they carry forward as known concerns

## AC/DC Development Workflow

Every module follows this loop:

```
GUIDE    -> Read CLAUDE.md + collection-module-design.md + data-source-research before writing anything
GENERATE -> Build ONE module (follow build order below)
VERIFY   -> Self-check 4 gates: compiles, tests pass, standards, architecture
         -> Then invoke code-reviewer agent for independent review
SOLVE    -> Fix issues from review (accept/disagree/escalate per finding)
VERIFY   -> Code reviewer re-checks ONLY fixed items -> loop until zero open findings
NEXT     -> Move to next module
```

**Build order (collection module, test-driven):**
1. Domain — `Money`, `Discount`, `ValidityPeriod`, `PriceBasis`, `ProductImage`, `Offer` invariants
2. `OfferSource` port + shared adapter contract test
3. `DennerApiSource` — simplest, and it is the categorisation marking scheme
4. `VolgHtmlSource`
5. `CoopFlyerSource` (PDF text + bbox → CropRegion)
6. `SparFlyerSource`, `AldiFlyerSource`
7. `LidlFlyerSource` (+ member-price correction pass)
8. `MigrosFlyerSource` (page images + vision → CropRegion)
9. Categorisation model + Denner-scored accuracy gate
10. Wire into `run.ts`, update `pipeline.yml`, frontend CropRegion rendering

## Common Pitfalls

- Do NOT use npm workspaces. Each folder has its own package.json. Install separately.
- Do NOT put `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It grants full write access.
- Do NOT throw errors in pipeline source modules. Return a result — and do not treat empty as success.
- Do NOT create barrel files (index.ts re-exports). Import from the source file directly.
- Do NOT store generated deal JSON files in git.
- Do NOT skip the code-reviewer agent after building a module.
- Do NOT duplicate types from `shared/types.ts`. Import them.
- Do NOT use default exports (except page components if the router requires it).
- Do NOT import html2canvas at the top of a file. Lazy-load via `import()` on user action.
- Do NOT hardcode store brand hexes — import from `store-tokens.ts`. Brand colour is never a background.
- Do NOT omit the date filter safety net (`.gte('valid_to', today)`) on deal queries.
- Do NOT let retailer field names into the domain layer.
- Do NOT compute a discount for ALDI when no original price is printed — both fields stay null.
- Do NOT publish a LIDL price without checking whether it is a Lidl Plus member price.
- Do NOT revive `pipeline/archive/migros/` — see Legal Constraints.

## Agent Invocation Guide

basketch has **19 agents** in `.claude/agents/`. Invoke with: `/agents/<agent-name>`
(Requires Claude Code to have been launched from the basketch folder, otherwise project agents do not register.)

| Agent | Model | When to use | What it does |
|-------|-------|------------|--------------|
| `guide` | sonnet | Setup, deployment, troubleshooting | Git, Supabase, Vercel — plain English, numbered steps |
| `architect` | **opus** | Before code exists | Designs architecture. Applies DDD, C4, Well-Architected, ADRs |
| `architect-challenger` | **opus** | After architect | Red-teams architecture. Confirmed/Weakened/Rejected verdicts |
| `code-standards` | sonnet | After architecture finalised | Coding conventions, DDD folder layout, testing strategy |
| `designer` | sonnet | Before building UI | Visual system, copy, SEO meta, mobile wireframes |
| `design-challenger` | **opus** | After designer, before builder | Mobile stress test, state coverage, accessibility, hierarchy |
| `pm-coach` | **opus** | Product decisions, UX debates | Senior PM sparring partner |
| `analytics` | sonnet | Before launch | Tracking plan, event schema, privacy-first analytics |
| `devops` | sonnet | Build/deploy configuration | CI/CD, build scripts, deployment automation, runbooks |
| `tech-lead` | **opus** | Technical decisions, disagreements | Decides HOW it's built. Resolves Builder vs Reviewer |
| `builder` | sonnet | When building a module | Production code, one module at a time, AC/DC self-verification |
| `code-reviewer` | **opus** | After builder finishes | Standards, architecture, DDD violations, tests, security |
| `qa-tester` | sonnet | After builder, before release | Exploratory testing against real data. Evidence, not assertions |
| `sre` | sonnet | After deployment, ongoing | Pipeline health, data freshness, uptime. Failure runbooks |
| `quality-gate` | sonnet | Before every release | Orchestrates the three VP reviews. SPADE for disagreements |
| `vp-product` | **opus** | Invoked by quality-gate | User value, activation flow, metrics, edge cases |
| `vp-design` | **opus** | Invoked by quality-gate | Brand coherence, Swiss market fit, trust, design direction |
| `vp-engineering` | **opus** | Invoked by quality-gate | Code quality, security, performance, data integrity |
| `user-researcher` | sonnet | Before/during product decisions | Interviews, usability testing, Swiss market + competitive research |

**Typical build session:**
1. Read this file (CLAUDE.md) + `docs/collection-module-design.md`
2. Invoke `builder`: "Build the domain layer (Step 1)"
3. Builder writes tests first, then code, self-verifies against `docs/builder-checklist.md`
4. Invoke `code-reviewer`
5. If Needs Changes: fix and re-review. If Approved: next module.

## Key Reference Files

- **Collection module design (current):** `docs/collection-module-design.md`
- **Data source research (current):** `docs/data-source-research-2026-09-07.md` — endpoints, legal position, per-field source matrix
- **Raw research evidence:** `docs/research-raw-2026-09-07/` — 11 verbatim agent reports
- Builder pre-ship checklist: `docs/builder-checklist.md`
- Architecture (v2.1): `docs/technical-architecture-v2.md`
- Coding standards (v2.0): `docs/coding-standards.md`
- PRD (v2.0): `docs/prd.md`
- Shared types: `shared/types.ts`
- Store brand tokens: `web-next/src/lib/store-tokens.ts`
