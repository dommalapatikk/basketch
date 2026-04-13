# Architecture Challenge: basketch (v1.0 — Historical)

> **Note (12 April 2026):** This challenge applies to Technical Architecture v1.0 (9 April 2026), before the PRD v2.0 restructure. Key changes since this review:
> - Verdict-first feature sequencing (verdict = aha moment, favorites = retention)
> - Value proposition pivot from "cheaper" to "on promotion"
> - 5 starter packs (not 8)
> - No MVP phasing — build everything together
> - Two-tier Coop status messages
> - See `technical-architecture-v2.md` for the current architecture and `pm-coach-review-specs-v2.md` for resolution of challenges C1-C4.

**Challenger:** Architect Challenger Agent
**Date:** 9 April 2026
**Input:** Technical Architecture v1.0 (Architect Agent), PRD v1.0, Use Cases v1.2, PM Architecture Decisions
**Scope:** All 7 challenge tests applied to every section

---

## Summary

| Verdict | Count | Decisions |
|---------|-------|-----------|
| **Confirmed** | 12 | Mixed-language pipeline, Supabase choice, Tailwind + shadcn/ui, Vitest, GitHub Actions CI/CD, trunk-based dev, RLS policies, monorepo (single repo), TypeScript shared types, weekly batch cadence, keyword categorization, error handling per source |
| **Adjust** | 8 | Supabase pause prevention, SEO approach (SPA), caching strategy, folder structure depth, upsert conflict key, GitHub Actions cron timing, `updated_at` trigger, service worker mention |
| **Weakened** | 2 | React Query necessity, `discount_percent` as nullable INTEGER |
| **Rejected** | 1 | npm workspaces for this project structure |

**Total decisions challenged: 23**

---

## 1. System Overview — Challenges

### 1.1 System Diagram Accuracy

**Verdict: Confirmed**

The diagram correctly shows the data flow: sources (parallel) -> normalized JSON -> categorizer -> storage -> Supabase -> frontend. The split between GitHub Actions (pipeline) and Vercel (frontend) is accurate. No hidden components.

One minor observation: the diagram shows the categorizer as a separate box at the same level as the sources. In reality, it runs inside the `process-and-store` job. This is fine for a conceptual diagram but could confuse during implementation. The workflow YAML (Section 7.1) is the source of truth, and it correctly shows three jobs.

### 1.2 Mixed-Language Pipeline (TypeScript + Python)

**Verdict: Confirmed**

The architect correctly identified that `migros-api-wrapper` is npm-only and cannot be used from Python. The alternative (reverse-engineering the Cloudflare bypass in Python) would be fragile and time-consuming. Using Python for BeautifulSoup scraping of aktionis.ch is the path of least resistance.

The JSON artifact exchange between GitHub Actions jobs is a clean contract boundary. Two languages add CI complexity, but the architect handled this with separate jobs that produce a common output format (`UnifiedDeal`).

**Challenge to my own challenge:** "Is two languages over-engineered for a side project?" No. The constraint comes from the data sources, not from the architect. An all-TypeScript approach using Cheerio for Coop would also work, but BeautifulSoup is more battle-tested for scraping and the architect's justification is honest.

### 1.3 Deployment Model

**Verdict: Adjust**

The deployment model (GitHub Actions + Supabase + Vercel, all free tier) is right-sized. However, the architecture does not mention the **Supabase free tier pause policy**: projects on the free plan are paused after 7 days of inactivity.

Since the pipeline only writes to Supabase once per week (Thursday), the database will be read by the frontend throughout the week — but if traffic drops to zero for a week (vacation, early days before users), the project will pause.

**Specific tweak:** Add a keep-alive step to the GitHub Actions pipeline workflow. After the `process-and-store` job, add a lightweight step that queries Supabase (even a simple `SELECT 1`). This ensures at least one database hit per week. Alternatively, add a separate weekly cron job that pings the database on Mondays. This is a 3-line addition to the workflow YAML.

**Evidence:** Supabase documentation confirms free-tier projects pause after 7 days of inactivity. Multiple community workarounds exist using GitHub Actions keep-alive pings ([source](https://dev.to/jps27cse/how-to-prevent-your-supabase-project-database-from-being-paused-using-github-actions-3hel)).

---

## 2. Module Design — Challenges

### 2.1 Migros Source Module

**Verdict: Confirmed**

Clear single responsibility. The interface (`fetchMigrosDeals(): Promise<UnifiedDeal[]>`) is well-defined. Error handling (empty array on failure) enables graceful degradation.

**Risk noted (not a verdict change):** The `migros-api-wrapper` package is maintained by a single developer on a casual basis. The last published version is v1.1.37. If Migros changes their API or Cloudflare config, this package could break. The architecture already identifies this risk in the PRD (R2) and has a fallback (aktionis.ch also lists Migros deals). The architecture is honest about this.

**One concern:** The architecture says the wrapper uses "Guest OAuth2 tokens" but does not specify what happens if Migros revokes guest token access. The fallback path (aktionis.ch for both stores) should be documented as a concrete plan, not just a mention. This is a documentation gap, not an architecture flaw.

### 2.2 Coop Source Module

**Verdict: Confirmed**

Straightforward scraping with `requests` + `BeautifulSoup`. The error handling (empty array on non-200 or HTML structure change) is correct.

**Observation:** The scraping pattern mentions "Optionally fetch detail pages for schema.org JSON-LD (richer data)." This should be a decision, not an option left hanging. For MVP: skip detail pages. Fewer HTTP requests = faster pipeline, fewer failure points. If the list page provides product name, prices, and discount percent, that is sufficient.

### 2.3 Categorizer Module

**Verdict: Confirmed**

Keyword matching is the right approach for MVP. The category rules structure is simple, debuggable, and easy to extend. Defaulting unknown products to `long-life` is a safe choice (least time-sensitive bucket).

**Observation:** The rules only cover two categories explicitly (fresh and non-food). Everything else falls through to `long-life`. This means the `long-life` bucket will be a catch-all that includes genuinely uncategorizable products (electronics accessories, seasonal items, gift cards, etc.). This is acceptable for MVP but should be logged so the PM can review and refine.

### 2.4 Storage Module

**Verdict: Adjust (upsert conflict key)**

The upsert logic matches on `store + product_name + valid_from`. This is fragile for one reason: **product names are not stable identifiers.** If aktionis.ch changes the formatting of a product name (e.g., "Persil Gel 2x 1.5L" becomes "Persil Gel, 2x1.5L"), the upsert will create a duplicate instead of updating.

**Specific tweak:** Add `source_url` to the unique constraint if available (it is in the `UnifiedDeal` interface). `source_url` is a more stable identifier than product name. If `source_url` is null, fall back to the current `store + product_name + valid_from` match.

```sql
-- Option A: Change the unique constraint
CONSTRAINT unique_deal UNIQUE (store, source_url, valid_from)

-- Option B: Keep current constraint but add deduplication logic in code
-- Before upsert: normalize product names (lowercase, strip extra spaces, standardize units)
```

Option B (normalize in code) is simpler and does not require schema changes. Recommended for MVP.

### 2.5 Orchestrator (GitHub Actions)

**Verdict: Confirmed**

The `if: always()` pattern with the improved condition `always() && (needs.fetch-migros.result == 'success' || needs.fetch-coop.result == 'success')` is correct. It ensures the storage job runs if at least one source succeeded, which is exactly the graceful degradation the PRD requires.

**Open Question #3** (Can `process-and-store` download artifacts from failed upstream jobs?) is correctly flagged as an unknown. The answer: GitHub Actions does upload artifacts from failed jobs if the `if: always()` condition is on the upload step. The architecture already has this (`if: always()` on the upload-artifact step). This should work, but the architect is right to test it.

### 2.6 Frontend Data Layer

**Verdict: Weakened (React Query)**

**Challenge:** React Query (`@tanstack/react-query`, ~13KB gzipped) adds a dependency for a problem this project barely has.

The data changes once per week. The frontend makes a single Supabase query on page load. There is no pagination, no infinite scroll, no mutation, no optimistic updates. The caching benefit (staleTime: 1 hour) could be achieved with a simple `localStorage` cache + `fetch` wrapper in ~30 lines of code.

**Proposed alternative:** A custom hook (`useDeals`) that:
1. Checks `localStorage` for cached data + timestamp
2. If cache is < 1 hour old, returns cached data
3. Otherwise, fetches from Supabase, caches result, returns data
4. Handles loading/error states with simple `useState`

This removes a 13KB dependency, reduces bundle size (matters for the <2s mobile load target), and is trivially understandable.

**Counter-argument:** React Query provides loading/error/refetch states for free, and the PM (not a developer) may find it easier to use with Claude Code's help since it has extensive documentation. This is a legitimate point. If the PM prefers React Query for developer experience, it is not a wrong choice — just a heavier one than needed.

**Verdict rationale:** Weakened, not rejected. React Query works but is more tool than this project needs. A simpler approach exists.

### 2.7 Frontend Verdict Component

**Verdict: Confirmed**

The verdict logic (40% deal count + 60% avg discount, 5% tie threshold) is well-defined and matches the use cases. Edge cases (one store missing, both missing) are covered. The component interface (`<VerdictBanner deals={Deal[]} />`) is clean.

### 2.8 Frontend Deal Cards

**Verdict: Confirmed**

Sorting by discount_percent descending is correct. The 10-deal truncation with "Show all" is appropriate for mobile. Edge cases (no image, missing price, long names) are covered.

### 2.9 Shared Types

**Verdict: Confirmed**

Having a single `packages/shared/types.ts` as the source of truth is the right call. The Python Coop scraper outputs JSON matching the `UnifiedDeal` shape (camelCase), which means the TypeScript consumer can parse it directly.

**Observation:** The Python scraper must match the TypeScript interface exactly. There is no build-time enforcement of this contract. A JSON Schema validation step in `run.ts` (before categorization) would catch format mismatches early. This is a nice-to-have, not a must-have.

---

## 3. Data Architecture — Challenges

### 3.1 `deals` Table Schema

**Verdict: Adjust (two issues)**

**Issue 1: `discount_percent` as nullable INTEGER**

The verdict logic (Section 2.7) calculates `avgDiscountShare` per store per category. If `discount_percent` is null for some deals, the average calculation must handle nulls — either by excluding those deals or by computing the discount from `original_price` and `sale_price`.

The architecture does not specify how the verdict component handles null discounts. This is a bug waiting to happen.

**Specific tweak:** Make the pipeline calculate `discount_percent` whenever `original_price` and `sale_price` are both present. Only allow null when `original_price` is null. Document this rule in the storage module.

**Issue 2: `updated_at` has no auto-update trigger**

The schema sets `updated_at` as `DEFAULT now()` on creation, but there is no trigger to update it on row changes. On upsert, `updated_at` will remain the original creation timestamp unless the pipeline explicitly sets it.

**Specific tweak:** Either add a Supabase trigger:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

Or explicitly set `updated_at: new Date().toISOString()` in the upsert payload. The trigger is more reliable.

### 3.2 `pipeline_runs` Table

**Verdict: Confirmed**

Simple, flat, fit for purpose. Captures what matters: status per source, counts, duration, and errors.

### 3.3 Indexes

**Verdict: Confirmed**

The partial index `WHERE is_active = true` on `(is_active, category, store)` is exactly right for the primary query pattern. The expiry index on `valid_to` supports the cleanup operation. At 300 deals/week, these indexes are tiny — but having them from day one is good practice and costs nothing.

### 3.4 Row-Level Security

**Verdict: Confirmed**

Public read, service-role write. This is the correct pattern for a public site with a backend pipeline. The anon key (exposed in the frontend) can only SELECT. Write operations require the service_role key (stored in GitHub Actions secrets, never in frontend code).

### 3.5 Data Lifecycle

**Verdict: Confirmed**

Keeping expired deals indefinitely for future archive/SEO pages is a sound strategy. At ~300 deals/week and ~150 bytes per row, the 500MB Supabase limit gives 3+ years of headroom. No cleanup needed.

---

## 4. Folder Structure — Challenges

### 4.1 Overall Structure

**Verdict: Adjust (depth)**

The `packages/pipeline/coop/` nesting is 3 levels deep under `packages/`. For a project with only 3 packages (`shared`, `pipeline`, `web`), this is acceptable — but the `pipeline` package mixes TypeScript and Python, which creates friction.

**Observation:** The `packages/pipeline/coop/` directory has its own `requirements.txt` and Python files, while everything else in `packages/pipeline/` is TypeScript. This means `npm ci --workspace=packages/pipeline` installs TypeScript dependencies but not Python ones. The GitHub Actions workflow handles this correctly (separate Python setup step), but a developer running the pipeline locally must remember to `pip install` separately.

**Specific tweak:** Add a comment in the root README or a `Makefile` / `justfile` with a single command that sets up everything:
```bash
# setup.sh (or just document in README)
npm install
pip install -r packages/pipeline/coop/requirements.txt
cp .env.example .env
echo "Done. Edit .env with your Supabase credentials."
```
This supports the "setup in under 10 minutes" requirement and helps a non-developer PM.

### 4.2 npm Workspaces

**Verdict: Rejected**

The architecture uses npm workspaces (`"workspaces": ["packages/*"]`) to manage the TypeScript packages. This adds complexity that is not justified for this project:

- There are only 2 TypeScript packages that need workspace linking: `shared` and `pipeline` (the `web` package also consumes `shared`, but could import it via a relative path).
- npm workspaces require that all packages have valid `package.json` files with correct `name` fields and version entries.
- Workspace resolution can cause confusing errors when dependencies conflict between packages (e.g., different versions of `@supabase/supabase-js` in `pipeline` vs `web`).
- The PM (not a developer) will encounter workspace-related errors that are hard to debug without npm expertise.

**Proposed alternative:** A flat structure without workspaces:

```
basketch/
├── pipeline/
│   ├── migros/         # TypeScript
│   ├── coop/           # Python
│   ├── categorize.ts
│   ├── store.ts
│   ├── run.ts
│   └── package.json    # Pipeline dependencies
├── web/
│   ├── src/
│   └── package.json    # Frontend dependencies
├── shared/
│   └── types.ts        # Imported via relative paths: import { Deal } from '../../shared/types'
├── docs/
└── package.json        # Scripts only (no workspaces)
```

TypeScript `paths` in `tsconfig.json` can alias `@shared/*` to `../../shared/*`. No workspace resolution needed. Simpler for a PM using Claude Code.

**Counter-argument:** Workspaces make `npm install` at the root install everything. Without workspaces, you run `npm install` in `pipeline/` and `web/` separately. This is two commands instead of one — a minor inconvenience, not a blocker.

**Verdict rationale:** Rejected because workspaces add a class of errors (hoisting, resolution, peer dependency conflicts) that are hard for a non-developer to debug. The benefit (single `npm install`) does not justify the risk for a 3-package project.

---

## 5. Technology Decisions — Challenges

### 5.1 React + Vite + TypeScript (Frontend)

**Verdict: Confirmed**

Vite is the standard choice for new React projects in 2026. Fast HMR, simple config, large ecosystem. TypeScript adds safety. No issues.

### 5.2 React SPA (no SSR) for MVP

**Verdict: Adjust**

The architecture acknowledges the SEO limitation of a React SPA and proposes a migration path to Next.js or Astro later. This is honest. For MVP (traffic from friends, not search), SPA is acceptable.

**However,** the PRD lists SEO as the primary growth engine (Phase 2, Week 4+) with specific URL structures (`/woche/2026-kw16`, `/kategorie/frisch`). The architecture punts SSR to "when SEO becomes critical" without defining a trigger.

**Evidence:** Google can crawl client-side rendered pages, but with a delay — Googlebot uses a "second wave" of indexing for JavaScript-rendered content that can lag by days. This means the weekly verdict pages (which are time-sensitive) may not be indexed quickly enough to capture "Migros Angebote diese Woche" searches ([source](https://searchengineland.com/how-to-fix-technical-seo-issues-on-client-side-react-apps-455124)). Next.js SSG/SSR achieves 40-60% faster LCP scores than React SPAs ([source](https://www.tactionsoft.com/guide/next-js-vs-react-comparison/)).

**Specific tweak:** Define a concrete SEO migration trigger in the architecture:

> "If organic search traffic is a goal by Week 8, begin migration to Astro (for static content pages) or Next.js (for dynamic pages) at the start of Phase 2. The data layer (Supabase queries) and components (VerdictBanner, DealCard) are framework-agnostic and can be ported without rewriting."

Astro is worth considering over Next.js for this use case: it is static-first, ships zero JavaScript by default (better for performance budget), and supports React components as "islands." For a content site that updates weekly, Astro SSG is a natural fit.

### 5.3 Supabase (Database)

**Verdict: Confirmed (with the pause-prevention adjustment from Section 1.3)**

Supabase is the right choice. Free tier (500MB, 50K rows) is more than enough. REST API eliminates the need for a backend server. RLS provides security without custom middleware.

### 5.4 Tailwind + shadcn/ui

**Verdict: Confirmed**

Standard choice. shadcn/ui components (cards, badges) cover the exact UI elements this project needs (deal cards, store badges, category sections). No custom design system needed.

### 5.5 Vitest

**Verdict: Confirmed**

Shares Vite's config, faster than Jest, native ESM. Right-sized for this project. Pytest for the Python module is also correct.

### 5.6 GitHub Actions

**Verdict: Confirmed**

Free for public repos. Supports both Node.js and Python. Cron + workflow_dispatch cover the scheduling needs.

### 5.7 React Query

**Verdict: Weakened** (see Section 2.6 above)

### 5.8 Caching Strategy

**Verdict: Adjust**

The caching strategy has four layers (CDN, React Query, Service Worker, Supabase). For MVP, only two matter: CDN (Vercel handles this) and client-side cache (whether React Query or a simpler approach).

The architecture lists "Service Worker: Not in MVP" but still mentions it in UC-3 acceptance criteria ("page loads from cache in < 1 second"). This is a contradiction. Either the service worker is in MVP (to meet UC-3), or UC-3's caching criterion should be met by React Query / browser HTTP cache alone.

**Specific tweak:** Clarify that UC-3's repeat-visit performance relies on:
1. Vercel CDN caching of static assets (JS, CSS, images)
2. Browser HTTP cache for HTML
3. React Query (or localStorage) cache for Supabase data

No service worker needed for MVP. The <1 second repeat visit is achievable with CDN + browser cache + client-side data cache.

### 5.9 SEO-Friendly URLs

**Verdict: Adjust** (see Section 5.2 above — define the SSR migration trigger)

---

## 6. API Contracts — Challenges

### 6.1 TypeScript Interfaces

**Verdict: Confirmed**

Well-defined, complete, and correctly typed. The `UnifiedDeal` -> `Deal` -> `DealRow` progression is clean. The `WeeklyVerdict` and `CategoryVerdict` types cover the verdict component's needs.

**One nit:** `discountPercent: number | null` allows null, but the verdict calculation needs non-null values. The types should document this invariant with a comment, or the `Deal` interface (post-categorization) should guarantee `discountPercent` is non-null (calculated from prices if not provided by source).

### 6.2 Coop Source JSON Output

**Verdict: Confirmed**

Using camelCase to match the TypeScript interface is the right call. The Python scraper writes JSON that the TypeScript consumer can parse directly without field name mapping.

### 6.3 Supabase Query Patterns

**Verdict: Confirmed**

The queries are straightforward and match the schema. The upsert pattern with `onConflict` is correct. The `order('discount_percent', { ascending: false })` supports the "sorted by discount" requirement.

**One gap:** The query for active deals does not filter by date. It relies on `is_active` being set to `false` for expired deals. But what if the pipeline fails to run? Expired deals remain `is_active = true` until the next pipeline run marks them. The frontend should add a date filter as a safety net:

```typescript
.gte('valid_from', startOfWeek)
.or('valid_to.is.null,valid_to.gte.' + today)
```

This is a minor defensive addition, not a redesign.

---

## 7. Infrastructure — Challenges

### 7.1 GitHub Actions Workflow

**Verdict: Adjust (cron timing)**

The cron `0 17 * * 4` (17:00 UTC = 18:00 CET) is correct in winter but becomes 19:00 CEST in summer. The architect acknowledges this and accepts the drift.

**Additional concern:** GitHub Actions cron jobs are not guaranteed to run on time. Delays of 15-30 minutes are commonly reported, with some users seeing delays exceeding 30 minutes during peak hours. The start-of-hour (`:00`) is the worst time to schedule because everyone schedules at `:00` ([source](https://github.com/orgs/community/discussions/156282), [source](https://github.com/actions/runner/issues/2977)).

**Specific tweak:** Change the cron to an off-peak minute: `17 17 * * 4` (17:17 UTC instead of 17:00 UTC). This reduces the likelihood of queuing delays. It is a one-character change with no downside.

### 7.2 Vercel Configuration

**Verdict: Confirmed**

The SPA rewrite (`"source": "/(.*)", "destination": "/index.html"`) is the standard Vercel config for React Router SPAs. The `root directory` set to `packages/web` is correct.

### 7.3 Supabase Setup

**Verdict: Confirmed**

The 4-step setup (create project, run SQL, copy keys to .env, copy keys to GitHub secrets) is clear and achievable in under 10 minutes.

### 7.4 Environment Variables

**Verdict: Confirmed**

The variable list is complete. The distinction between `SUPABASE_URL` (public) and `SUPABASE_SERVICE_ROLE_KEY` (secret, pipeline-only) is correct. The `VITE_` prefix for frontend env vars follows Vite's convention.

### 7.5 Monitoring

**Verdict: Confirmed**

GitHub Actions email on failure + frontend freshness check against `pipeline_runs.run_at` is sufficient for MVP. No need for external monitoring.

---

## 8. Missing Pieces

### 8.1 Supabase Pause Prevention (Priority: High)

The architecture does not address the Supabase free tier auto-pause after 7 days of inactivity. If the project has low traffic in its early weeks, the database will pause and the site will break silently (Supabase queries will fail or timeout).

**Fix:** Add a keep-alive query to the pipeline workflow, or a separate weekly cron job.

### 8.2 Python-TypeScript Contract Validation (Priority: Medium)

The Python Coop scraper outputs JSON that must match the TypeScript `UnifiedDeal` interface exactly. There is no build-time or runtime validation of this contract. If the Python script outputs a field as `product_name` (snake_case) instead of `productName` (camelCase), the TypeScript consumer will silently get undefined values.

**Fix:** Add a JSON Schema validation step in `run.ts` before processing. Or add a simple assertion in the Python script's output step that checks all required fields are present.

### 8.3 Fallback Data Source Plan (Priority: Medium)

The PRD and use cases mention fallback sources (oferlo.ch, Rappn.ch) if aktionis.ch or migros-api-wrapper fails. The technical architecture does not describe how to implement these fallbacks. There is no interface or adapter pattern that would make swapping a data source easy.

**Fix:** The current module design (separate source modules with a common `UnifiedDeal` output) already supports this naturally. Document the fallback implementation plan: "To add a new Coop source, create a new file in `packages/pipeline/coop/` that implements the same `fetch_coop_deals() -> list[UnifiedDeal]` interface. Update the workflow to call the new script instead."

### 8.4 Product Name Normalization (Priority: Low)

Different sources may format the same product differently. "Persil Gel 2x 1.5L" vs "PERSIL GEL 2X1.5L" vs "Persil Gel, 2 x 1.5 Liter". Without normalization, the same product from different pipeline runs may create duplicates.

**Fix:** Add a `normalizeProductName()` function in the shared package: lowercase, collapse whitespace, standardize common patterns (unit abbreviations, "x" separators). Apply before upsert.

### 8.5 No `valid_from` Date Filter on Frontend Queries (Priority: Low)

The Supabase queries filter by `is_active = true` but not by date. If the pipeline fails for 2+ weeks, stale deals remain active. The `pipeline_runs` check shows a warning banner, but the actual deal data is still stale.

**Fix:** Add a date filter to frontend queries (see Section 6.3 above).

### 8.6 No Rate Limiting on Supabase Reads (Priority: Low)

The Supabase anon key is public. Anyone could write a script that hammers the API. At 10-50 users this is not a real risk, but Supabase free tier has egress limits (5GB/month).

**Fix:** Not needed for MVP. Supabase's built-in rate limiting is sufficient. Monitor egress in the Supabase dashboard. If it becomes an issue, add Vercel Edge Middleware to rate-limit API proxy calls.

---

## 9. Recommended Changes (Prioritized)

### Must-Do Before Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 1 | Add Supabase keep-alive to pipeline workflow (prevent auto-pause) | 5 min | 1.3, 8.1 |
| 2 | Change cron to off-peak minute (`17 17 * * 4`) | 1 min | 7.1 |
| 3 | Add `updated_at` trigger or explicit set in upsert | 5 min | 3.1 |
| 4 | Guarantee `discount_percent` is non-null after pipeline processing | 15 min | 3.1, 6.1 |

### Should-Do During Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 5 | Add JSON validation for Python->TypeScript contract in `run.ts` | 30 min | 8.2 |
| 6 | Add product name normalization before upsert | 30 min | 8.4 |
| 7 | Add date filter to frontend Supabase queries as safety net | 10 min | 6.3, 8.5 |
| 8 | Replace npm workspaces with flat structure + tsconfig paths | 1 hr | 4.2 |
| 9 | Define concrete SSR migration trigger (by Week 8, decide Astro vs Next.js) | 15 min (docs) | 5.2 |
| 10 | Clarify UC-3 caching: no service worker in MVP, use CDN + browser cache | 5 min (docs) | 5.8 |

### Consider (Not Blocking)

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 11 | Replace React Query with a simpler localStorage + fetch hook | 1 hr | 2.6 |
| 12 | Add a setup script (setup.sh) for one-command project setup | 15 min | 4.1 |
| 13 | Document fallback source implementation pattern | 15 min (docs) | 8.3 |

---

## 10. Final Verdict

### Go with changes.

The architecture is well-designed for a portfolio side project. It is right-sized (no ORM, no migration framework, no Kubernetes), honest about trade-offs, and has clear module boundaries. The build order is logical and supports the AC/DC development loop (each step can be guided, generated, verified, and solved independently).

**What is strong:**
- The mixed-language pipeline is a pragmatic response to data source constraints, not over-engineering
- Supabase + Vercel + GitHub Actions at CHF 0/month is the correct stack for this scope
- RLS policies, error handling per source, and graceful degradation are all well-thought-out
- The shared types package provides a clean contract between pipeline and frontend
- The build order (8 steps, each independently verifiable) maps directly to the AC/DC loop

**What needs attention before building:**
- The Supabase auto-pause issue (item 1) will cause silent site breakage if not addressed
- The `discount_percent` null handling (item 4) will cause incorrect verdicts
- The npm workspaces decision (item 8) adds avoidable complexity for a non-developer PM

**What can be deferred safely:**
- SSR migration (define the trigger now, execute after MVP)
- React Query vs simpler caching (either works, choose during build)
- Rate limiting, service worker, advanced monitoring (not needed at 10-50 users)

The architecture is ready to build. Apply the 4 "Must-Do" changes first (all under 30 minutes total), then proceed with Step 1 of the build order.
