# basketch -- Project Instructions for Claude Code

Swiss grocery deal comparison: Migros vs Coop weekly promotions, side by side, with a verdict.
Built with React + Vite (frontend), TypeScript + Python (pipeline), Supabase (database), Vercel (hosting).

## Folder Structure (Flat -- No npm Workspaces)

```
basketch/
├── pipeline/          # Data pipeline (TS + Python). Own package.json.
│   ├── migros/        # Migros source (TypeScript, uses migros-api-wrapper)
│   ├── coop/          # Coop source (Python, scrapes aktionis.ch)
│   ├── categorize.ts  # Keyword categoriser (fresh / long-life / non-food)
│   ├── store.ts       # Supabase upsert logic
│   └── run.ts         # Pipeline entry point
├── web/               # React frontend. Own package.json.
│   └── src/
│       ├── lib/       # supabase.ts, queries.ts, verdict.ts
│       ├── components/ # VerdictBanner, DealCard, CategorySection, etc.
│       └── pages/     # Home.tsx, About.tsx
├── shared/            # Shared types -- NO package.json, imported via tsconfig paths
│   ├── types.ts       # Deal, UnifiedDeal, DealRow, CategoryVerdict, etc.
│   └── category-rules.ts
├── docs/              # PM documentation (PRD, architecture, use cases, standards)
└── .github/workflows/ # pipeline.yml (weekly cron)
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
- **Supabase queries only in `web/src/lib/queries.ts`** -- components never call `supabase.from()`.
- **Pipeline sources return `UnifiedDeal[]` or empty array on failure.** Never throw.
- **`discount_percent` must be non-null** after pipeline processing (calculate from prices if needed).
- **Product names normalised** before upsert (lowercase, collapse whitespace, standardise units).
- **JSON output from Python uses camelCase** to match TypeScript interfaces.

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

## AC/DC Development Workflow

Every module follows this loop:

```
GUIDE    -> Read CLAUDE.md + architecture + coding-standards before writing anything
GENERATE -> Build ONE module (follow build order below)
VERIFY   -> Self-check 4 gates: compiles, tests pass, standards, architecture
         -> Then invoke code-reviewer agent for independent review
SOLVE    -> Fix issues from review
VERIFY   -> Code reviewer re-checks -> loop until Approved
NEXT     -> Move to next module
```

**Build order:** 1. Shared types + Supabase setup -> 2. Migros source -> 3. Coop source -> 4. Categoriser + storage -> 5. GitHub Actions workflow -> 6. Frontend data layer -> 7. Frontend UI -> 8. Deploy

## Common Pitfalls

- Do NOT use npm workspaces. Each folder has its own package.json. Install separately.
- Do NOT put `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It grants full write access.
- Do NOT throw errors in pipeline source modules. Return empty array and log.
- Do NOT create barrel files (index.ts re-exports). Import from the source file directly.
- Do NOT store generated deal JSON files (migros-deals.json, coop-deals.json) in git.
- Do NOT skip the code-reviewer agent after building a module.
- Do NOT duplicate types from `shared/types.ts`. Import them.
- Do NOT use default exports (except page components if router requires it).

## Agent Invocation Guide

basketch has 15 agents in `.claude/agents/`. Invoke with: `/agents/<agent-name>`

| Agent | Job Title | When to use | What it does |
|-------|-----------|------------|--------------|
| `guide` | Technical Infrastructure Advisor | Setup, deployment, troubleshooting | Expert advisor for Git, Supabase, Vercel — plain English, numbered steps |
| `architect` | Solution Architect | Before code exists | Designs technical architecture (modules, contracts, infrastructure) |
| `architect-challenger` | Architecture Review Engineer | After architect | Red-teams architecture. Confirmed/Weakened/Rejected verdicts |
| `code-standards` | Code Standards Engineer | After architecture finalised | Coding conventions. Produces `coding-standards.md` + `CLAUDE.md` |
| `designer` | Product Designer (Mobile-First) | Before building UI | Visual design system, copy quality, SEO meta tags, mobile wireframes. Reviews built UI |
| `pm-coach` | Senior PM Coach (Strategy Advisor) | Product decisions, UX debates | Senior PM sparring partner. Challenges decisions, advises on product matching, applies Lenny/Shreyas frameworks |
| `analytics` | Analytics Engineer (Privacy-First) | Before launch | Tracking plan, event schema, privacy-first analytics, PMF measurement |
| `devops` | DevOps Engineer (CI/CD & Build Automation) | Build/deploy configuration | CI/CD pipelines, build scripts, setup.sh, deployment automation, operational runbooks |
| `builder` | Full-Stack Builder (Implementation Lead) | When building a module | Writes production code, one module at a time, AC/DC self-verification |
| `code-reviewer` | Independent Code Reviewer | After builder finishes | Reviews code for standards, architecture, tests, security |
| `sre` | Site Reliability Engineer | After deployment, ongoing | Monitors health 24/7: pipeline, data freshness, performance, uptime. Runbooks for failures |
| `quality-gate` | Quality Gate Orchestrator | Before every release | Orchestrates VP Product, VP Design, VP Engineering reviews. SPADE for disagreements |
| `vp-product` | VP Product (Quality Gate) | Invoked by quality-gate | Product quality review: user value, activation flow, metrics readiness, edge cases |
| `vp-design` | VP Design (Quality Gate) | Invoked by quality-gate | Design quality review: visual consistency, mobile usability, accessibility, Swiss sensibility |
| `vp-engineering` | VP Engineering (Quality Gate) | Invoked by quality-gate | Engineering quality review: code quality, security, performance, data integrity |
| `user-researcher` | User Researcher (UX + Desk Research) | Before and during product decisions | User interviews, usability testing, Swiss market research, competitive analysis, opportunity mapping |

**Typical build session:**
1. Read this file (CLAUDE.md) -- context augmentation
2. Invoke `builder` with a task: "Build the Migros source module (Step 2)"
3. Builder writes code + tests, self-verifies
4. Invoke `code-reviewer` to review the output
5. If Needs Changes: fix and re-review. If Approved: move to next module.

## Key Reference Files

- Architecture: `docs/technical-architecture.md`
- Challenge findings: `docs/architecture-challenge.md`
- Coding standards: `docs/coding-standards.md`
- PRD: `docs/prd.md`
- Use cases: `docs/use-cases.md`
- Shared types: `shared/types.ts`
