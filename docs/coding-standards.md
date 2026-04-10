# Coding Standards: basketch

**Version:** 1.0
**Date:** 9 April 2026
**Scope:** All code in the basketch repository (pipeline, frontend, shared)

These standards apply to every contributor -- human or AI. When in doubt: readable beats clever, consistent beats perfect.

---

## 1. Language Standards

### 1.1 TypeScript (Pipeline + Frontend)

**Version:** TypeScript 5.x, targeting ES2022, Node.js 20+

**Strict mode:** Always. `tsconfig.base.json` at the repo root sets:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ES2022"
  }
}
```

Each sub-folder (`pipeline/`, `web/`, `shared/`) extends this base config.

**Formatting:**
- 2-space indentation
- Single quotes for strings
- No semicolons (rely on ASI -- configure Prettier accordingly)
- Line length: 100 characters soft limit, 120 hard limit
- Trailing commas in multi-line structures (arrays, objects, function params)

**Import ordering (top to bottom, blank line between groups):**
1. Node built-ins (`import fs from 'node:fs'`)
2. External packages (`import { createClient } from '@supabase/supabase-js'`)
3. Internal shared (`import type { Deal } from '@shared/types'`)
4. Relative imports (`import { normalizePrice } from './normalize'`)

**Naming conventions:**

| Thing | Convention | Example |
|-------|-----------|---------|
| Files (modules) | kebab-case | `category-rules.ts`, `deal-card.tsx` |
| Files (components) | PascalCase | `VerdictBanner.tsx`, `DealCard.tsx` |
| Files (tests) | Same as source + `.test` | `categorize.test.ts`, `VerdictBanner.test.tsx` |
| Variables, functions | camelCase | `fetchMigrosDeals`, `discountPercent` |
| Types, interfaces | PascalCase | `UnifiedDeal`, `CategoryVerdict` |
| Constants | UPPER_SNAKE_CASE | `CATEGORY_RULES`, `MAX_DEALS_PER_STORE` |
| Enums | PascalCase (name), PascalCase (values) | `Store.Migros` -- but prefer union types |
| Type unions over enums | `type Store = 'migros' \| 'coop'` | Simpler, no runtime overhead |

**Exports:**
- Named exports only. No default exports. Reason: easier to search, refactor, and auto-import.
- Exception: page components (`Home.tsx`, `About.tsx`) may use default exports if required by the router.

**File size:** If a file exceeds 200 lines, consider splitting. If it exceeds 300 lines, it must be split.

### 1.2 Python (Coop Scraper)

**Version:** Python 3.12+

**Formatting:**
- Follow PEP 8
- Formatter: Ruff (format) + Ruff (lint) -- single tool for both
- 4-space indentation
- Line length: 100 characters
- Double quotes for strings (Ruff default)

**Type hints:** Required on all function signatures. Not required on local variables where the type is obvious.

```python
def fetch_coop_deals(max_pages: int = 20) -> list[dict]:  # good
    deals: list[dict] = []  # optional -- type is obvious from assignment
```

**Import ordering (top to bottom, blank line between groups):**
1. Standard library (`import json`, `from pathlib import Path`)
2. Third-party (`import requests`, `from bs4 import BeautifulSoup`)
3. Local modules (`from normalize import normalize_deal`)

**Naming:**
- Files: snake_case (`fetch.py`, `normalize.py`, `test_fetch.py`)
- Functions, variables: snake_case (`fetch_coop_deals`, `deal_count`)
- Constants: UPPER_SNAKE_CASE (`BASE_URL`, `MAX_PAGES`)
- Classes: PascalCase (unlikely in this project)

**Output format:** The Python scraper outputs JSON using camelCase field names to match the TypeScript `UnifiedDeal` interface exactly. Do not use snake_case in the JSON output.

### 1.3 Shared Standards (Both Languages)

- **Comments:** Explain "why", not "what". No comments on obvious code.
- **TODO format:** `// TODO(kiran): description` or `# TODO(kiran): description` -- always include who.
- **No commented-out code.** Delete it. Git has history.
- **Magic numbers:** Extract to named constants. `const TIE_THRESHOLD = 0.05` not `if (diff < 0.05)`.

---

## 2. Project Structure

```
basketch/
├── pipeline/                    # Data pipeline (TypeScript + Python)
│   ├── migros/                  # Migros source (TypeScript)
│   │   ├── fetch.ts
│   │   ├── normalize.ts
│   │   ├── fetch.test.ts
│   │   └── fixtures/
│   │       └── migros-response.json
│   │
│   ├── coop/                    # Coop source (Python)
│   │   ├── fetch.py
│   │   ├── normalize.py
│   │   ├── test_fetch.py
│   │   ├── fixtures/
│   │   │   └── coop-page-1.html
│   │   └── requirements.txt
│   │
│   ├── categorize.ts
│   ├── categorize.test.ts
│   ├── store.ts
│   ├── store.test.ts
│   ├── run.ts                   # Pipeline entry point
│   ├── package.json
│   └── tsconfig.json            # Extends ../../tsconfig.base.json
│
├── web/                         # Frontend (React + Vite)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── queries.ts
│   │   │   └── verdict.ts
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui primitives
│   │   │   ├── VerdictBanner.tsx
│   │   │   ├── CategorySection.tsx
│   │   │   ├── DealCard.tsx
│   │   │   ├── StoreBadge.tsx
│   │   │   └── DataWarning.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   └── About.tsx
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json            # Extends ../../tsconfig.base.json
│   └── package.json
│
├── shared/                      # Shared types (imported by pipeline + web)
│   ├── types.ts
│   └── category-rules.ts
│
├── docs/                        # PM documentation
│   ├── prd.md
│   ├── use-cases.md
│   ├── technical-architecture.md
│   ├── architecture-challenge.md
│   ├── coding-standards.md      # This file
│   └── roadmap.md
│
├── .github/
│   └── workflows/
│       └── pipeline.yml
│
├── .claude/                     # Claude Code agent definitions
│   └── agents/
│
├── CLAUDE.md                    # Machine-readable project instructions
├── tsconfig.base.json           # Shared TS config
├── .env.example
├── .gitignore
└── README.md
```

**Key rules:**
- No npm workspaces. Each sub-folder (`pipeline/`, `web/`) has its own `package.json`. Install dependencies separately: `cd pipeline && npm install`, `cd web && npm install`.
- Shared types are imported via tsconfig path aliases: `import { Deal } from '@shared/types'`. Configure paths in each tsconfig:
  ```json
  { "paths": { "@shared/*": ["../shared/*"] } }
  ```
- Tests are co-located with source files (same directory, `.test.ts` suffix).
- Fixtures go in a `fixtures/` subdirectory next to the tests that use them.
- One component per file. No barrel files (`index.ts` re-exports). Import directly.

---

## 3. Component Patterns (React)

**Functional components only.** No class components.

**Props interface:** Defined in the same file, named `{ComponentName}Props`, exported.

```tsx
export interface DealCardProps {
  deal: Deal
  showStoreBadge?: boolean
}

export function DealCard({ deal, showStoreBadge = true }: DealCardProps) {
  // ...
}
```

**State management:** No global state library for MVP. Use:
- `useState` for local UI state (expanded/collapsed, selected tab)
- Data fetching hook (see Section 4) for server state
- Props drilling for 1-2 levels. If deeper, refactor to composition.

**shadcn/ui usage:**
- Copy components into `web/src/components/ui/` using the shadcn CLI
- Do not modify shadcn components directly. Wrap them in app-level components if customisation is needed.
- Use shadcn's `cn()` utility for conditional class merging.

**Loading states:** Every component that fetches data must handle three states:
```tsx
if (isLoading) return <Skeleton />  // or spinner
if (error) return <ErrorMessage error={error} />
return <ActualContent data={data} />
```

**No inline styles.** Use Tailwind classes. Extract repeated class combinations into component-level constants if needed:
```tsx
const cardClasses = 'rounded-lg border p-4 shadow-sm'
```

---

## 4. Data Layer Patterns

### Supabase Client

One Supabase client instance per environment:

```typescript
// web/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

```typescript
// pipeline/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

### Data Fetching (Frontend)

**Decision pending:** React Query vs custom localStorage+fetch hook.

Whichever approach is chosen, all data fetching must go through typed query functions in `web/src/lib/queries.ts`. Components never call `supabase.from()` directly.

```typescript
// queries.ts -- the only file that touches Supabase in the frontend
export async function getActiveDeals(): Promise<Deal[]> { ... }
export async function getDealsByCategory(category: Category): Promise<Deal[]> { ... }
export async function getLatestPipelineRun(): Promise<PipelineRun | null> { ... }
```

### Type Safety

- All Supabase responses must be typed. Use the `DealRow` interface for raw database rows, then map to `Deal` for application use.
- The `Deal` interface (camelCase) is for application logic. The `DealRow` interface (snake_case) is for database interaction. Map between them explicitly.
- `discount_percent` must be non-null after pipeline processing. If the source provides no discount, calculate it from `original_price` and `sale_price`. If neither is available, exclude the deal.

### Caching

- Frontend: cache Supabase responses for 1 hour (data changes weekly)
- Pipeline: no caching -- always fetch fresh data from sources

---

## 5. Pipeline Patterns

### Source Module Interface

Every data source must produce `UnifiedDeal[]` (TypeScript) or `list[dict]` matching the `UnifiedDeal` JSON shape (Python). This is the contract.

```typescript
// TypeScript source interface
export async function fetchMigrosDeals(): Promise<UnifiedDeal[]>
```

```python
# Python source interface
def fetch_coop_deals() -> list[dict]:
```

Rules:
- Return an empty array on failure. Never throw. The pipeline must continue with other sources.
- Log errors with context: what failed, what data was being processed, what to check.
- Every field in `UnifiedDeal` must be present (use `null` for missing optional fields, not `undefined`).

### Product Name Normalisation

Before upserting to Supabase, normalise product names:
- Lowercase
- Collapse multiple whitespace to single space
- Trim leading/trailing whitespace
- Standardise common patterns (e.g., "2 x 1.5L" -> "2x1.5l")

This prevents duplicate entries from minor formatting differences between pipeline runs.

### Idempotency

The pipeline must be safe to re-run at any time. Running it twice for the same week must not create duplicates (ensured by the upsert constraint on `store + product_name + valid_from`).

### Logging

```
[SOURCE] [LEVEL] message (context)
```

Examples:
```
[migros] [INFO] Fetched 142 deals (page 1-5)
[migros] [WARN] Empty response on page 6 — stopping pagination
[coop] [ERROR] Failed to parse deal card (url=https://aktionis.ch/products/123, error=missing price element)
[storage] [INFO] Upserted 287 deals (142 migros, 145 coop)
```

Levels: `INFO` (normal operation), `WARN` (unexpected but recovered), `ERROR` (failed but pipeline continues).

### Environment Variables

Access via `process.env` (pipeline) or `import.meta.env` (frontend). Never hardcode credentials, URLs, or keys.

---

## 6. Testing Strategy

### What to Test

| Layer | What to test | Tool | Priority |
|-------|-------------|------|----------|
| Pipeline: source parsing | API/HTML response parsing, normalisation to UnifiedDeal | Vitest / pytest | High |
| Pipeline: categoriser | Keyword matching, edge cases, default category | Vitest | High |
| Pipeline: storage | Upsert logic, conflict handling, expiry marking | Vitest (mock Supabase) | Medium |
| Frontend: verdict logic | Score calculation, tie detection, edge cases | Vitest | High |
| Frontend: queries | Query construction, response mapping | Vitest (mock Supabase) | Medium |
| Frontend: components | Rendering with mock data | Vitest + Testing Library | Low |

### What NOT to Test

- shadcn/ui primitives (they are already tested)
- Configuration files (`vite.config.ts`, `tailwind.config.ts`)
- Pure rendering with no logic (a component that only maps props to JSX)
- Supabase itself (trust the service, test your queries)

### Test Principles

1. **Test boundaries, not internals.** Test the inputs and outputs of a module, not its implementation details.
2. **Mock external services, not your own code.** Mock Supabase, mock HTTP requests to aktionis.ch. Do not mock your own utility functions.
3. **Every bug gets a regression test.** When you fix a bug, write a test that would have caught it.
4. **Use fixture data.** Save real API responses and HTML pages as fixtures. Test against them.

### Running Tests

```bash
# TypeScript tests (pipeline + shared)
cd pipeline && npx vitest run

# TypeScript tests (frontend)
cd web && npx vitest run

# Python tests (Coop scraper)
cd pipeline/coop && python -m pytest

# All TypeScript tests in watch mode
cd pipeline && npx vitest
cd web && npx vitest
```

### Test File Naming

- TypeScript: `{source-file}.test.ts` or `{source-file}.test.tsx`
- Python: `test_{source_file}.py`

---

## 7. Error Handling

### Pipeline Errors

- **Per-source isolation:** If Migros fetch fails, Coop still runs (and vice versa). The `process-and-store` job runs if at least one source succeeded.
- **Per-deal isolation:** If one deal fails to parse or categorise, log the error and skip it. Do not abort the entire pipeline for one bad record.
- **Structured error logging:** Every error log must include: what failed, what data was involved, and what the operator should check.
- **Retry policy:** No automatic retries in MVP. If a source fails, it fails for this run. The pipeline runs again next week (or can be triggered manually).

### Frontend Errors

- **Error boundaries:** One at the page level. Catches rendering errors and shows a fallback UI.
- **Data fetch errors:** Show a user-friendly message ("Could not load deals. Please try again later.") -- never raw error objects or stack traces.
- **Stale data warning:** If `pipeline_runs.run_at` is more than 8 days old, show a banner: "Deals may be outdated -- last updated [date]."
- **Partial data:** If only one store has data, show deals for that store with a note: "[Store] data unavailable this week."

### Supabase Errors

- Frontend: if the query fails, return empty data and show a warning. Do not crash.
- Pipeline: if upsert fails, log the error with the deal data and continue with the remaining deals.

---

## 8. Git Conventions

### Branch Strategy

Trunk-based development. Push to `main`. No long-lived feature branches. This is a solo portfolio project.

### Commit Messages

```
type: short description (max 72 chars)

Optional longer explanation if needed.
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `pipeline`, `style`

Examples:
```
feat: add verdict calculation with tie detection
fix: handle null discount_percent in category score
pipeline: add Supabase keep-alive step to workflow
docs: update coding standards with test strategy
chore: add .env.example with all required variables
```

### .gitignore

Must include:
```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
__pycache__/
*.pyc
.pytest_cache/
.vite/
coverage/
migros-deals.json
coop-deals.json
```

### What Never Gets Committed

- `.env` files with real credentials
- `node_modules/`
- Build output (`dist/`)
- JSON deal files generated by the pipeline (`migros-deals.json`, `coop-deals.json`)
- Python bytecode (`__pycache__/`, `*.pyc`)

---

## 9. Environment Variables

### Naming Convention

| Variable | Used by | Public? | Description |
|----------|---------|---------|-------------|
| `SUPABASE_URL` | Pipeline | No (in GH secrets) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Pipeline | No (in GH secrets) | Full-access key for writes |
| `VITE_SUPABASE_URL` | Frontend | Yes (in bundle) | Same URL, Vite-prefixed |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Yes (in bundle) | Read-only key via RLS |

**Rules:**
- Frontend env vars MUST start with `VITE_` (Vite requirement)
- `SUPABASE_SERVICE_ROLE_KEY` is NEVER used in frontend code. It grants full write access.
- Local development: copy `.env.example` to `.env` and fill in values.
- CI/CD: store in GitHub Actions secrets.

### .env.example

```
# Supabase (get from supabase.com dashboard -> Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Frontend (same Supabase project, read-only key)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## 10. Documentation Rules

1. **Every module gets a one-line comment** at the top explaining what it does.
   ```typescript
   // Fetches current Migros promotions using migros-api-wrapper and outputs UnifiedDeal[].
   ```

2. **No docstrings on obvious functions.** `getActiveDeals()` does not need a doc comment.

3. **Complex logic gets a "why" comment.** Explain the reasoning, not the mechanics.
   ```typescript
   // Weight discount more than count because deeper discounts save more per item,
   // even if fewer products are on sale.
   const score = dealCountShare * 0.4 + avgDiscountShare * 0.6
   ```

4. **No separate docs for code.** The code should be readable on its own. Architecture docs (in `docs/`) describe the system design, not the implementation.

5. **README.md** in the project root is the entry point. Keep it updated with setup instructions.

---

## 11. AI Coding Rules (Claude Code)

When Claude Code writes code for basketch:

1. **Read before writing.** Always read `CLAUDE.md`, the relevant architecture sections, and these coding standards before writing any code.

2. **Follow the folder structure exactly.** Do not create files in unexpected locations. If unsure where a file goes, check the structure in Section 2.

3. **Use the defined naming conventions.** Do not invent new patterns. If you see `camelCase` in the codebase, use `camelCase`.

4. **Import from `@shared/*`.** Do not duplicate type definitions. The `shared/types.ts` file is the single source of truth.

5. **Handle all three states.** Every data-fetching component must handle loading, error, and success states.

6. **Run tests before reporting done.** After writing code, run `npx vitest run` (or `python -m pytest`) and confirm tests pass.

7. **One module at a time.** Follow the AC/DC loop: build one module, self-verify, get reviewed, fix issues, then move to the next.

8. **If a standard conflicts with a user request,** follow the user request and note the deviation in a comment.

9. **Never commit `.env` files or secrets.** Check `.gitignore` before committing.

10. **Preserve existing patterns.** If the codebase already uses a pattern (e.g., a specific error handling style), follow it -- do not introduce a competing pattern.

---

## 12. Development Workflow: AC/DC Loop

basketch follows the **Agent-Centric Development Cycle** (AC/DC), a closed-loop workflow where every module is guided, generated, verified, and fixed before moving to the next.

```
GUIDE:     Read CLAUDE.md + architecture + standards (context augmentation)
              |
GENERATE:  Builder writes one module at a time
              |
VERIFY:    Builder self-checks (4 gates) -> Code reviewer does independent review
              |
SOLVE:     Builder fixes issues from review
              |
VERIFY:    Code reviewer re-checks -> loop until Approved
              |
NEXT:      Move to next module in the build order
```

### Self-Verification (4 Gates)

Before reporting a module as done, the builder must pass all four:

| Gate | Check |
|------|-------|
| 1. Compiles | `npx tsc --noEmit` (TypeScript) or `python -c "import module"` (Python) |
| 2. Tests pass | `npx vitest run` or `python -m pytest` |
| 3. Standards | File naming, import order, export pattern, error handling match this document |
| 4. Architecture | Module boundary, interface, and data flow match `technical-architecture.md` |

### Rules

- No module moves forward without passing code review.
- Context before code -- always read architecture + standards before the first line.
- One module at a time -- build, verify, approve, then next.
- The reviewer runs after EVERY module, not at the end of the project.
