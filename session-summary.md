# Session Summary: basketch

**Date:** 9 April 2026
**Project:** basketch — Swiss grocery deal comparison (Migros vs Coop)

---

## What Was Done

### PM Documentation (Complete)
- PRD with 11 sections (updated with resolved risks, data sources, Bern region, metrics)
- Use cases v1.2 with personas (Sarah, Marco), JTBD, user journey map, alternatives, growth engine, timeline, risk register
- Lenny Brain review applied: North Star metric, activation, W4 retention, PMF measurement plan, SEO growth engine
- Fixed: language inconsistency (English UI for MVP), resolved open questions

### Phase 0: Data Source Validation (Complete)
- **Migros:** search-api.migros.ch requires auth (401). Using migros-api-wrapper (npm, guest OAuth2, actively maintained March 2026)
- **Coop:** coop.ch blocked by DataDome. Using aktionis.ch (public aggregator since 2006, no bot protection, server-rendered HTML)
- **Legal decision:** Only publicly available data. No scraping of bot-protected sites.

### Architecture (Complete)
- Technical architecture designed by architect agent (9 modules, flat folder structure, mixed TS+Python pipeline)
- Challenger reviewed: 23 decisions, 12 confirmed, 8 adjust, 2 weakened, 1 rejected (npm workspaces)
- All 10 challenger fixes applied to architecture
- Coding standards defined (12 sections)
- CLAUDE.md created (136 lines, project instructions for every session)

### 6 Agents Built
1. **guide** — Expert advisor for Git, Supabase, Vercel, deployment (plain English)
2. **architect** — Technical architecture design
3. **architect-challenger** — Red-teams architecture
4. **code-standards** — Coding conventions + CLAUDE.md
5. **builder** — Writes code (AC/DC loop with self-verification)
6. **code-reviewer** — Reviews code against standards

### Build Step 1: Shared Types + Setup (Complete)
- `shared/types.ts` — All TypeScript interfaces (UnifiedDeal, Deal, DealRow, PipelineRun, CategoryVerdict, WeeklyVerdict)
- `shared/category-rules.ts` — Keyword mapping (fresh, non-food, long-life default), verdict weights
- `shared/supabase-setup.sql` — Tables, indexes, updated_at trigger, RLS policies
- `tsconfig.base.json` — Shared TypeScript config (strict mode)
- `.env.example` — Template for Supabase credentials
- `.gitignore` — Secrets, node_modules, build output

### External Learnings Applied
- **Lenny Rachitsky frameworks** (from PM-OS lenny-brain agent + newsletter/podcast data)
- **Sonar AC/DC framework** (Agent-Centric Development Cycle: Guide → Generate → Verify → Solve)
- **Claude Code project structure cheat sheet** (from user's reference image)

---

## Key Decisions Made by User
- Only legally available data (no coop.ch scraping)
- Bern region only for MVP
- English UI for MVP
- Swiss residents (not German-speaking only) as target audience
- Agents-first approach before writing code
- Modular architecture, not monolith
- AC/DC development loop for all code

---

## What's Next (Build Order)

| Step | What | Status |
|------|------|--------|
| 1. Shared types + Supabase setup | Types, SQL, config | Done |
| **2. Git + Supabase + Vercel setup** | **Run guide agent to walk through infrastructure** | **Next** |
| 3. Migros source module | TypeScript, migros-api-wrapper | Pending |
| 4. Coop source module | Python, aktionis.ch scraper | Pending |
| 5. Categorizer + Storage | TypeScript, Supabase upsert | Pending |
| 6. GitHub Actions workflow | pipeline.yml | Pending |
| 7. Frontend data layer | Supabase queries, verdict calc | Pending |
| 8. Frontend UI | React components | Pending |
| 9. Deploy | Vercel + first pipeline run | Pending |

---

## File Paths

```
basketch/
├── CLAUDE.md                              ← Project instructions
├── .env.example                           ← Env var template
├── .gitignore                             ← Git ignore rules
├── tsconfig.base.json                     ← Shared TS config
├── shared/
│   ├── types.ts                           ← All TypeScript interfaces
│   ├── category-rules.ts                  ← Category mapping + verdict weights
│   └── supabase-setup.sql                 ← Database setup SQL
├── docs/
│   ├── prd.md                             ← Product requirements
│   ├── use-cases.md                       ← Use cases, personas, metrics
│   ├── architecture.md                    ← PM architecture decisions
│   ├── roadmap.md                         ← Delivery plan
│   ├── technical-architecture.md          ← Full technical architecture (with fixes)
│   ├── architecture-challenge.md          ← Challenger report
│   └── coding-standards.md               ← Coding conventions
├── .claude/agents/
│   ├── guide.md                           ← Infrastructure advisor
│   ├── architect.md                       ← Architecture design
│   ├── architect-challenger.md            ← Architecture review
│   ├── code-standards.md                  ← Standards definition
│   ├── builder.md                         ← Code builder (AC/DC)
│   └── code-reviewer.md                   ← Code reviewer
├── pipeline/                              ← (empty, Step 3-5)
└── web/                                   ← (empty, Step 7-8)
```

---

## To Resume
Say: "pick up basketch" or "continue basketch"
Next action: Run the **guide agent** to set up Git, Supabase, and Vercel.
