# basketch -- Project Instructions for Claude Code

Swiss grocery deal comparison: Migros vs Coop weekly promotions, side by side, with a verdict.
Built with Next.js 16 (frontend, in `web-next/`), TypeScript + Python (pipeline), Supabase (database), Vercel (hosting).
The legacy React + Vite frontend has been archived to `archive/web-vite/` — see `archive/web-vite/RETIRED.md`. Do not modify.

## Folder Structure (Flat -- No npm Workspaces)

```
basketch/
├── pipeline/              # Data pipeline (TS + Python). Own package.json.
│   ├── migros/            # Migros source (TypeScript, uses migros-api-wrapper)
│   ├── coop/              # Coop source (Python, scrapes aktionis.ch)
│   ├── product-metadata.ts # Brand/quantity/organic extraction (pure function)
│   ├── product-resolve.ts # Product identity resolution (find/create in products table)
│   ├── categorize.ts      # Category + sub-category assignment
│   ├── store.ts           # Supabase upsert logic
│   └── run.ts             # Pipeline entry point
├── web-next/              # Next.js 16 frontend (LIVE at basketch-redesign.vercel.app). Own package.json.
│   └── src/
│       ├── app/           # App Router pages, layouts, route handlers
│       ├── components/    # DealCard, FilterRail, FilterSheet, BottomBar, IconHeading, etc.
│       ├── lib/           # filters.ts, types.ts, store-tokens.ts, sub-category-labels.ts
│       └── server/        # data/snapshot.ts (use cache), data/filter-deals.ts, verdict/algorithm.ts
├── archive/
│   └── web-vite/          # RETIRED legacy Vite frontend — do not modify (see RETIRED.md)
├── shared/                # Shared types -- NO package.json, imported via tsconfig paths
│   ├── types.ts           # All types + BROWSE_CATEGORIES constant
│   └── category-rules.ts # Category + sub-category keyword rules
├── docs/                  # PM documentation (PRD, architecture, use cases, standards)
└── .github/workflows/     # pipeline.yml (weekly cron)
```

Import shared types via: `import { Deal } from '@shared/types'`
Configure in tsconfig: `"paths": { "@shared/*": ["../shared/*"] }`

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| TS modules | kebab-case | `category-rules.ts` |
| React components | PascalCase | `VerdictBanner.tsx` |
| Tests | source + `.test` | `categorize.test.ts` |
| Python files | snake_case | `test_fetch.py` |
| Variables, functions | camelCase (TS), snake_case (Python) | `fetchMigrosDeals`, `fetch_coop_deals` |
| Types, interfaces | PascalCase | `UnifiedDeal`, `CategoryVerdict` |
| Constants | UPPER_SNAKE_CASE | `CATEGORY_RULES`, `TIE_THRESHOLD` |

Named exports only (no default exports). Union types over enums.

## Key Coding Patterns

- **TypeScript strict mode** always on. 2-space indent, single quotes, no semicolons.
- **Python PEP 8** with Ruff. 4-space indent, double quotes. Type hints on all function signatures.
- **One component per file.** No barrel files. Import directly.
- **Three states always:** loading, error, success -- every data-fetching component.
- **`useCachedQuery` for all frontend data fetching** -- custom hook with localStorage + 1-hour stale time. No React Query (ADR-005).
- **Supabase queries only in `web/src/lib/queries.ts`** -- components never call `supabase.from()`.
- **Date filter safety net** on all deal queries: `.gte('valid_to', today)` prevents showing expired deals.
- **Pipeline sources return `UnifiedDeal[]` or empty array on failure.** Never throw.
- **Pipeline flow:** normalize -> extract metadata -> categorize (category + sub_category) -> resolve product -> upsert deal.
- **`discount_percent` is NOT NULL** in the database. Pipeline calculates from prices if source omits it.
- **Product names normalised** before upsert (lowercase, collapse whitespace, standardise units).
- **JSON output from Python uses camelCase** to match TypeScript interfaces.
- **Two-tier Coop status** on comparison page: "Not on promotion at Coop this week" (known product) vs "We haven't found this at Coop yet -- check back next week." (never seen, prefixed with info icon). Check `coopProductKnown` flag.
- **Store colors:** Migros #e65100 (bg) / #c54400 (text). Coop #007a3d (bg) / #006030 (text). Always with text labels.
- **WCAG 2.1 AA:** 44px touch targets, focus-visible rings, semantic HTML, no color-only information.
- **Lazy-load html2canvas** via dynamic `import()` on button click. Never in the main bundle.

## Testing Commands

```bash
# Pipeline TypeScript tests
cd pipeline && npx vitest run

# Frontend tests
cd web && npx vitest run

# Python tests (Coop scraper)
cd pipeline/coop && python -m pytest

# Type-check without emitting
npx tsc --noEmit -p pipeline/tsconfig.json
npx tsc --noEmit -p web/tsconfig.json
```

## Environment Variables

| Variable | Where | Secret? |
|----------|-------|---------|
| `SUPABASE_URL` | Pipeline (GH secrets) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline (GH secrets) | YES -- never in frontend |
| `VITE_SUPABASE_URL` | Frontend (.env) | No |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env) | No (read-only via RLS) |

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
GUIDE    -> Read CLAUDE.md + architecture + coding-standards before writing anything
GENERATE -> Build ONE module (follow build order below)
VERIFY   -> Self-check 4 gates: compiles, tests pass, standards, architecture
         -> Then invoke code-reviewer agent for independent review
SOLVE    -> Fix issues from review (accept/disagree/escalate per finding)
VERIFY   -> Code reviewer re-checks ONLY fixed items -> loop until zero open findings
NEXT     -> Move to next module
```

**Build order:** 1. Shared types + Supabase setup -> 2. Migros source -> 3. Coop source -> 4. Metadata extractor + Categoriser + Product resolver + Storage -> 5. GitHub Actions workflow -> 6. Frontend data layer (queries.ts + useCachedQuery) -> 7. Frontend UI (verdict, deals browsing, onboarding, comparison, Wordle card) -> 8. Deploy

## Common Pitfalls

- Do NOT use npm workspaces. Each folder has its own package.json. Install separately.
- Do NOT put `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It grants full write access.
- Do NOT throw errors in pipeline source modules. Return empty array and log.
- Do NOT create barrel files (index.ts re-exports). Import from the source file directly.
- Do NOT store generated deal JSON files (migros-deals.json, coop-deals.json) in git.
- Do NOT skip the code-reviewer agent after building a module.
- Do NOT duplicate types from `shared/types.ts`. Import them.
- Do NOT use default exports (except page components if router requires it).
- Do NOT use React Query. Use the custom `useCachedQuery` hook (ADR-005).
- Do NOT import html2canvas at the top of a file. Lazy-load it via `import()` on user action.
- Do NOT show "Not on promotion at Coop" when `coopProductKnown` is false. Show "We haven't found this at Coop yet -- check back next week." with an info icon prefix instead.
- Do NOT use Migros #e65100 or Coop #007a3d as text color on white. Use #c54400 / #006030 for WCAG AA.
- Do NOT omit the date filter safety net (`.gte('valid_to', today)`) on deal queries.

## Agent Invocation Guide

basketch has 20 agents in `.claude/agents/`. Invoke with: `/agents/<agent-name>`

| Agent | Job Title | When to use | What it does |
|-------|-----------|------------|--------------|
| `guide` | Technical Infrastructure Advisor | Setup, deployment, troubleshooting | Expert advisor for Git, Supabase, Vercel — plain English, numbered steps |
| `architect` | Solution Architect | Before code exists | Designs technical architecture (modules, contracts, infrastructure) |
| `architect-challenger` | Architecture Review Engineer | After architect | Red-teams architecture. Confirmed/Weakened/Rejected verdicts |
| `code-standards` | Code Standards Engineer | After architecture finalised | Coding conventions. Produces `coding-standards.md` + `CLAUDE.md` |
| `designer` | Product Designer (Mobile-First) | Before building UI | Visual design system, copy quality, SEO meta tags, mobile wireframes. Reviews built UI |
| `design-challenger` | Design Review Engineer | After designer, before builder | Red-teams design decisions: mobile stress test, state coverage, accessibility, hierarchy, subtraction |
| `pm-coach` | Senior PM Coach (Strategy Advisor) | Product decisions, UX debates | Senior PM sparring partner. Challenges decisions, advises on product matching, applies Lenny/Shreyas frameworks |
| `analytics` | Analytics Engineer (Privacy-First) | Before launch | Tracking plan, event schema, privacy-first analytics, PMF measurement |
| `devops` | DevOps Engineer (CI/CD & Build Automation) | Build/deploy configuration | CI/CD pipelines, build scripts, setup.sh, deployment automation, operational runbooks |
| `tech-lead` | Tech Lead | Technical decisions, disagreement resolution | Decides HOW it's built. Resolves technical disagreements. Bridges PM and engineering |
| `builder` | Full-Stack Builder (Implementation Lead) | When building a module | Writes production code, one module at a time, AC/DC self-verification |
| `code-reviewer` | Independent Code Reviewer | After builder finishes | Reviews code for standards, architecture, tests, security |
| `sre` | Site Reliability Engineer | After deployment, ongoing | Monitors health 24/7: pipeline, data freshness, performance, uptime. Runbooks for failures |
| `quality-gate` | Quality Gate Orchestrator | Before every release | Orchestrates VP Product, VP Design, VP Engineering reviews. SPADE for disagreements |
| `vp-product` | VP Product (Quality Gate) | Invoked by quality-gate | Product quality review: user value, activation flow, metrics readiness, edge cases |
| `vp-design` | VP Design (Quality Gate — Strategic) | Invoked by quality-gate | Strategic design review: brand coherence, Swiss market fit, trust, competitive position, design direction |
| `vp-engineering` | VP Engineering (Quality Gate) | Invoked by quality-gate | Engineering quality review: code quality, security, performance, data integrity |
| `user-researcher` | User Researcher (UX + Desk Research) | Before and during product decisions | User interviews, usability testing, Swiss market research, competitive analysis, opportunity mapping |

**Typical build session:**
1. Read this file (CLAUDE.md) -- context augmentation
2. Invoke `builder` with a task: "Build the Migros source module (Step 2)"
3. Builder writes code + tests, self-verifies
4. Invoke `code-reviewer` to review the output
5. If Needs Changes: fix and re-review. If Approved: move to next module.

## Key Reference Files

- Architecture (v2.1): `docs/technical-architecture-v2.md`
- Challenge findings: `docs/architecture-challenge-v2.md`, `docs/architecture-challenge-v2.1.md`
- Coding standards (v2.0): `docs/coding-standards.md`
- PRD (v2.0): `docs/prd.md`
- Use cases (v2.0): `docs/use-cases.md`
- Shared types: `shared/types.ts`
