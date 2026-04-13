# Coding Standards: basketch

**Version:** 2.0
**Date:** 12 April 2026
**Scope:** All code in the basketch repository (pipeline, frontend, shared)
**Aligned with:** Technical Architecture v2.1, PRD v2.0

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
│   ├── metadata.ts              # Brand/quantity/organic extraction (pure function)
│   ├── metadata.test.ts
│   ├── resolve-product.ts       # Product identity resolution (find/create in products table)
│   ├── resolve-product.test.ts
│   ├── categorize.ts            # Category + sub-category assignment
│   ├── categorize.test.ts
│   ├── store.ts                 # Supabase upsert logic
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
│   │   │   ├── supabase.ts      # Supabase client instance
│   │   │   ├── queries.ts       # ALL Supabase queries (single file)
│   │   │   ├── use-cached-query.ts  # Custom fetch+cache hook (replaces React Query)
│   │   │   ├── verdict.ts       # Verdict calculation logic
│   │   │   └── og-tags.ts       # OG tag config (shared between middleware + react-helmet)
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui primitives (do not modify)
│   │   │   ├── VerdictBanner.tsx
│   │   │   ├── VerdictCard.tsx  # Wordle card (shareable verdict image)
│   │   │   ├── CategorySection.tsx
│   │   │   ├── CategoryFilterPills.tsx
│   │   │   ├── DealCard.tsx
│   │   │   ├── StoreGroup.tsx
│   │   │   ├── StoreBadge.tsx
│   │   │   ├── ShareButton.tsx  # Web Share API + clipboard fallback
│   │   │   ├── EmailLookup.tsx  # Email return path on home page
│   │   │   ├── DataWarning.tsx
│   │   │   └── CoopStatusMessage.tsx  # Two-tier Coop status display
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Deals.tsx        # Browse all deals by sub-category
│   │   │   ├── Onboarding.tsx
│   │   │   ├── Compare.tsx      # Personalized favorites comparison
│   │   │   ├── About.tsx
│   │   │   └── NotFound.tsx     # 404 page
│   │   └── index.css
│   ├── middleware.ts             # Vercel Middleware (OG tags for crawlers)
│   ├── public/
│   │   └── og-image.png         # 1200x630px social preview image
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── vercel.json
│   ├── tsconfig.json            # Extends ../../tsconfig.base.json
│   └── package.json
│
├── shared/                      # Shared types (imported by pipeline + web)
│   ├── types.ts                 # All type definitions + BROWSE_CATEGORIES constant
│   └── category-rules.ts       # Category + sub-category keyword rules
│
├── docs/                        # PM documentation
│   ├── prd.md
│   ├── use-cases.md
│   ├── technical-architecture-v2.md
│   ├── architecture-challenge-v2.md
│   ├── architecture-challenge-v2.1.md
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

**State management:** No global state library. Use:
- `useState` for local UI state (expanded/collapsed, selected tab)
- `useCachedQuery` hook for server state (see Section 4)
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

### 3.1 Accessibility (WCAG 2.1 AA)

All components must meet WCAG 2.1 AA. These are build requirements, not QA findings.

**Contrast ratios:**

| Element | Color | Contrast against white | Usage rule |
|---------|-------|----------------------|-----------|
| Migros orange | #FF6600 | 3.13:1 (fails AA normal text) | Use for backgrounds/badges with dark text only |
| Migros text on white | #CC5200 | 4.6:1 (passes AA) | Use when orange text must appear on white |
| Coop red | #E10A0A | ~4.0:1 (passes large text only) | Use for backgrounds/badges with white/dark text |
| Coop text on white | #B80909 | Passes AA for normal text | Use when red text must appear on white |

**Touch targets:** 44x44px minimum on all buttons, links, filter pills, deal cards.

**Keyboard navigation:** Tab navigation through all interactive elements. Enter/Space to activate. Visible focus ring (2px solid, offset) on all interactive elements. Use `focus-visible` not `focus`.

**Screen readers:**
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>` -- not `<div>` everywhere.
- `aria-label` on icon-only buttons (e.g., share button, copy button).
- Store identity via `aria-label`, not just color. Example: `<span class="bg-migros" aria-label="Migros">` is wrong. Use `<span class="bg-migros">Migros</span>` with visible text.

**No color-only information:** Store-colored elements always include a text label ("Migros", "Coop"). A colorblind user must be able to tell which store a deal belongs to from text alone.

### 3.2 Store Color Convention

Store colors are a core UX differentiator. Use consistently across all components.

```tsx
// Store color constants (define once in a shared location)
const STORE_COLORS = {
  migros: {
    bg: '#FF6600',        // Badge/card backgrounds (dark text on top)
    text: '#CC5200',      // Orange text on white backgrounds (WCAG AA)
    label: 'Migros',
  },
  coop: {
    bg: '#E10A0A',        // Badge/card backgrounds
    text: '#B80909',      // Red text on white backgrounds (WCAG AA)
    label: 'Coop',
  },
} as const
```

Every component that shows store identity (deal cards, verdict banners, category headers, split lists) must use these colors consistently. All neutral UI uses grey/white.

### 3.3 Two-Tier Coop Status Messages

The favorites comparison page must distinguish between two Coop states when a favorite item has no active Coop deal. This is a product-level pattern, not a one-off. Use it wherever Coop deal status is displayed on the comparison page.

| Tier | Condition | Message | When to use |
|------|-----------|---------|-------------|
| **Tier 1** (confident) | Coop product exists in `products` table (has been seen in a promotion before) | "Not on promotion at Coop this week" | We know this product exists at Coop, it is just not on sale |
| **Tier 2** (honest) | Coop product has NEVER been seen in `products` table | "No Coop data yet" | We have never seen this product at Coop |

**Implementation:** The `getComparisonForFavorites` query function returns a `coopProductKnown: boolean` flag per item. The component uses this flag:

```tsx
// In the comparison item component
function CoopStatus({ coopDeal, coopProductKnown }: { coopDeal: Deal | null, coopProductKnown: boolean }) {
  if (coopDeal) return <DealCard deal={coopDeal} />
  if (coopProductKnown) return <span>Not on promotion at Coop this week</span>
  return <span>No Coop data yet</span>
}
```

**Coop transparency label:** The comparison page always shows a permanent one-line label at the top: "Coop: showing promotions found. Not all Coop products are tracked yet."

**Migros is always confident:** Migros has full catalog access, so it always shows either the deal or "Not on promotion at Migros this week". Never "No Migros data yet".

### 3.4 Verdict Card (Wordle Card)

The verdict card is the **primary growth mechanism** (WhatsApp screenshot sharing). It has specific coding patterns.

**Rendering:** HTML/CSS with fixed dimensions. Use CSS `aspect-ratio`, large fonts (18px+ body, 24px+ headings), solid background colors. No gradients or fine borders that compress poorly in WhatsApp.

**"Copy card" button -- lazy-load html2canvas:**
```tsx
async function handleCopyCard(cardRef: React.RefObject<HTMLDivElement>) {
  // Lazy-load html2canvas -- do NOT import at top of file
  const { default: html2canvas } = await import('html2canvas')

  const canvas = await html2canvas(cardRef.current!)
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png')
  )

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ])
    // Show "Card copied!" toast
  } catch {
    // Fallback: download as file
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'basketch-verdict.png'
    a.click()
    URL.revokeObjectURL(url)
  }
}
```

**Why lazy-load:** `html2canvas` is ~40KB. Loading it eagerly would push the initial JS bundle over the 100KB gzipped target. Lazy-loading via `import()` on button click keeps the initial load fast for the < 2s mobile target.

**Accessibility:** The card element must have an `aria-label` describing the verdict in text form. The "Copy card" button must have clear button text ("Copy verdict card"), not just an icon.

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

### Data Fetching (Frontend) -- `useCachedQuery` Hook

**Decision (ADR-005):** Custom `useCachedQuery` hook with `localStorage` caching. React Query is not used -- it adds 13KB for a problem that barely exists (data changes once per week).

```typescript
// web/src/lib/use-cached-query.ts
function useCachedQuery<T>(key: string, fetcher: () => Promise<T>, staleMinutes = 60) {
  // 1. Check localStorage for cached data + timestamp
  // 2. If cache is fresh (< staleMinutes old), return cached data
  // 3. Otherwise, fetch from Supabase, cache result, return data
  // 4. Handle loading/error states with useState
  // Returns: { data: T | null, isLoading: boolean, error: Error | null }
}
```

**Usage in components:**
```tsx
function DealsPage() {
  const { data: deals, isLoading, error } = useCachedQuery(
    'deals-fresh',
    () => getDealsByCategory('fresh')
  )

  if (isLoading) return <Skeleton />
  if (error) return <ErrorMessage error={error} />
  return <DealsList deals={deals!} />
}
```

**Rules:**
- All data fetching goes through typed query functions in `web/src/lib/queries.ts`. Components never call `supabase.from()` directly.
- The `useCachedQuery` hook is the only way components fetch data. Do not use raw `useEffect` + `fetch`.
- Cache stale time: 60 minutes (default). Data changes weekly, so 1-hour caching is conservative.

### Query Functions

All in `web/src/lib/queries.ts` -- the only file that touches Supabase in the frontend:

```typescript
export async function getActiveDeals(): Promise<Deal[]> { ... }
export async function getDealsByCategory(category: Category): Promise<Deal[]> { ... }
export async function getDealsBySubCategory(subCategory: string): Promise<Deal[]> { ... }
export async function getDealsBrowse(browseCategory: string): Promise<Deal[]> { ... }
export async function getLatestPipelineRun(): Promise<PipelineRun | null> { ... }
export async function getStarterPacks(): Promise<StarterPack[]> { ... }
export async function searchProducts(query: string): Promise<SearchResult[]> { ... }
export async function saveFavorites(items: FavoriteItem[], email?: string): Promise<string> { ... }
export async function getFavoritesByEmail(email: string): Promise<Favorite | null> { ... }
export async function getFavoriteById(favoriteId: string): Promise<Favorite | null> { ... }
export async function getComparisonForFavorites(favoriteId: string): Promise<FavoriteComparison[]> { ... }
export async function getProductGroups(): Promise<ProductGroupRow[]> { ... }
```

### Date Filter Safety Net

All frontend deal queries must include a date filter to prevent showing expired deals if the pipeline fails to mark them inactive:

```typescript
const today = new Date().toISOString().split('T')[0]
const { data } = await supabase
  .from('deals')
  .select('*')
  .eq('is_active', true)
  .gte('valid_to', today)  // Safety net: only show deals still valid
  .order('discount_percent', { ascending: false })
```

### Browse Category Mapping

The deals browsing page uses 11 browse categories that map to 23 DB sub-categories. This mapping is defined once in `shared/types.ts` as the `BROWSE_CATEGORIES` constant:

| Browse Category | DB `sub_category` values |
|----------------|--------------------------|
| Fruits & Vegetables | `fruit`, `vegetables` |
| Meat & Fish | `meat`, `poultry`, `fish` |
| Dairy & Eggs | `dairy`, `eggs` |
| Bakery | `bread` |
| Snacks & Sweets | `snacks`, `chocolate` |
| Pasta, Rice & More | `pasta-rice` |
| Drinks | `drinks`, `coffee-tea` |
| Ready Meals & Frozen | `ready-meals`, `frozen`, `deli` |
| Pantry & Canned | `canned`, `condiments` |
| Home & Cleaning | `cleaning`, `laundry`, `paper-goods`, `household` |
| Beauty & Hygiene | `personal-care` |

Deals with `sub_category = null` (unmapped products) appear only in the "All" view. Do not create a separate category for them.

### Type Safety

- All Supabase responses must be typed. Use the `DealRow` interface for raw database rows, then map to `Deal` for application use.
- The `Deal` interface (camelCase) is for application logic. The `DealRow` interface (snake_case) is for database interaction. Map between them explicitly.
- `discount_percent` is NOT NULL in the database. The pipeline calculates it from `original_price` and `sale_price` if the source does not provide it. Deals without a calculable discount are excluded entirely.

### Caching

- Frontend: `useCachedQuery` with `localStorage` + 1-hour stale time (data changes weekly)
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

### Pipeline Data Flow (v2.1)

The pipeline runs these steps in order:

```
Raw API/HTML
  --> normalize (lowercase, collapse whitespace, standardize units)
  --> extract metadata (brand, quantity, unit, organic flag) via metadata.ts
  --> categorize (category + sub_category) via categorize.ts
  --> resolve product (find/create in products table) via resolve-product.ts
  --> upsert deal with product_id via store.ts
  --> log pipeline run
```

### Metadata Extraction

`pipeline/metadata.ts` is a **pure function** -- no side effects, no Supabase calls. Returns `ProductMetadata` from a product name string.

```typescript
export function extractMetadata(productName: string, store: Store): ProductMetadata
```

| Field | Method |
|-------|--------|
| brand | Match against hardcoded Swiss brand list (M-Budget, Naturaplan, Prix Garantie, etc.) |
| quantity + unit | Regex for amounts, multi-packs, piece counts |
| is_organic | Name contains "bio", "naturaplan", "demeter", "knospe", "organic" |

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
[products] [INFO] Products: 5 new, 120 updated, 3 auto-matched to groups
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
| Pipeline: metadata extraction | Brand, quantity, organic detection across 30+ fixture names | Vitest | High |
| Pipeline: categoriser | Keyword matching, sub-category assignment, edge cases, default category | Vitest | High |
| Pipeline: product resolver | Find/create logic, product_group matching | Vitest (mock Supabase) | Medium |
| Pipeline: storage | Upsert logic, conflict handling, expiry marking | Vitest (mock Supabase) | Medium |
| Frontend: verdict logic | Score calculation, tie detection, minimum threshold, edge cases | Vitest | High |
| Frontend: useCachedQuery | Cache hit/miss, stale detection, error handling | Vitest | Medium |
| Frontend: queries | Query construction, response mapping, date filter safety net | Vitest (mock Supabase) | Medium |
| Frontend: two-tier Coop status | Tier 1 vs Tier 2 message selection based on `coopProductKnown` | Vitest | Medium |
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
- **Stale data warning:** If `pipeline_runs.run_at` is more than 7 days old, show an amber banner: "Deals may be outdated -- last updated [date]."
- **Partial data:** If only one store has data, show deals for that store with a note: "[Store] data unavailable this week."
- **Empty browse category:** If a store has zero deals in a selected category, show "No [Store] deals in this category this week" in that store's column/section. Do not collapse the empty column.

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

6. **Use `useCachedQuery` for data fetching.** Do not use React Query, raw `useEffect` + `fetch`, or direct Supabase calls in components.

7. **Run tests before reporting done.** After writing code, run `npx vitest run` (or `python -m pytest`) and confirm tests pass.

8. **One module at a time.** Follow the AC/DC loop: build one module, self-verify, get reviewed, fix issues, then move to the next.

9. **If a standard conflicts with a user request,** follow the user request and note the deviation in a comment.

10. **Never commit `.env` files or secrets.** Check `.gitignore` before committing.

11. **Preserve existing patterns.** If the codebase already uses a pattern (e.g., a specific error handling style), follow it -- do not introduce a competing pattern.

12. **Accessibility is a build requirement.** 44px touch targets, `focus-visible` rings, semantic HTML, WCAG AA contrast -- these are not optional. Check them during self-verification.

13. **Lazy-load heavy libraries.** `html2canvas` and similar large dependencies must be loaded via dynamic `import()` on user action, not at page load.

14. **Two-tier Coop status.** On the comparison page, always check `coopProductKnown` before displaying Coop status. Never show "Not on promotion" when the correct message is "No Coop data yet".

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
| 3. Standards | File naming, import order, export pattern, error handling, accessibility match this document |
| 4. Architecture | Module boundary, interface, and data flow match `technical-architecture-v2.md` |

### Rules

- No module moves forward without passing code review.
- Context before code -- always read architecture + standards before the first line.
- One module at a time -- build, verify, approve, then next.
- The reviewer runs after EVERY module, not at the end of the project.
