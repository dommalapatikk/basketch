# Architecture Challenge: basketch (v2.0)

**Challenger:** Architect Challenger Agent
**Date:** 12 April 2026
**Input:** Technical Architecture v2.0, PRD v2.0, Use Cases v2.0, Coding Standards v1.0, Architecture Challenge v1.0
**Scope:** All 7 challenge tests applied to every section

---

## Summary

| Verdict | Count | Decisions |
|---------|-------|-----------|
| **Confirmed** | 18 | C4 diagrams, mixed-language pipeline, Supabase choice, products table (ADR-001), manual product groups (ADR-002), metadata extractor design, categorizer extension, pipeline orchestrator, RLS policies, security architecture, observability, cost analysis, Vercel config (SPA rewrites), performance budgets, data lifecycle, build order logic, trunk-based dev, shared types as source of truth |
| **Adjust** | 10 | OG tag middleware implementation, Wordle card missing from architecture, `discount_percent` still nullable in schema, cron timing (v1 finding still open), two-tier Coop status not in architecture, favorites RLS too permissive, `updated_at` trigger still missing, React Query decision still unresolved, starter pack validation process unspecified, date filter on frontend queries still missing |
| **Weakened** | 2 | Comparison page OG tags (dynamic content in static middleware), product resolver complexity for non-developer |
| **Rejected** | 0 | None |

**Total decisions challenged: 30**

---

## 1. System Overview (Section 1-3) -- Challenges

### C1: C4 Diagram Accuracy

**Verdict: Confirmed**

The context diagram correctly shows the three-tier system: Shopper -> Web App -> Supabase <- Pipeline <- Sources. The three data paths (pipeline, user favorites, deals browsing) are clearly separated. The deployment model table accurately maps components to services.

The addition of the "Verification fetch" on Thursday 06:00 UTC is a good operational decision -- it catches late updates before peak shopping (Thursday-Saturday). This was missing in v1 and is now addressed.

### C2: Mixed-Language Pipeline (unchanged)

**Verdict: Confirmed**

Same rationale as v1 challenge -- the constraint comes from data sources (npm-only wrapper for Migros, Python being best for HTML scraping). JSON artifact exchange between GitHub Actions jobs remains the correct contract boundary. No change needed.

### C3: Deployment Model and Supabase Pause Prevention

**Verdict: Confirmed**

The v1 challenge flagged the Supabase free-tier auto-pause risk. The v2 architecture addresses this directly with a keep-alive step in the pipeline workflow (Section 9.1, line 809-816). The keep-alive runs after `process-and-store`, querying `pipeline_runs` to prevent the 7-day inactivity pause. This is exactly what v1 recommended.

---

## 2. Module Design (Section 4) -- Challenges

### C4: Metadata Extractor (Section 4.3)

**Verdict: Confirmed**

Pure function with no side effects -- the right pattern. Regex-based extraction for brand, quantity, unit, and organic flag is appropriate for German product names from known sources. The hardcoded Swiss brand list approach is honest and maintainable.

**One observation:** The `product_form` detection ("tiefgekuhlt" -> frozen, "dose" -> canned) is listed in the architecture but not mentioned in the PRD or use cases. No use case or UI element consumes `product_form`. This is speculative data extraction -- not harmful (it is additive), but it adds test surface for zero user value in V1.

**Recommendation:** Build it but mark it as low-priority in testing. The 30+ fixture requirement for this module is appropriate.

### C5: Product Resolver (Section 4.5)

**Verdict: Weakened**

The product resolver is the most complex new module in v2. It has five steps: lookup by source_name, update if found, create if not found, attempt auto-match by sub_category + quantity + unit, return product_id. This involves:

- Multiple Supabase queries per deal (lookup + optional create + optional group match)
- State mutation (creating rows in `products` table)
- Fuzzy matching logic (sub_category + quantity + unit against product_groups)

For a pipeline processing ~300 deals/week, this means up to ~900 Supabase queries in the resolve step alone (3 per deal worst case). This is within free-tier limits but represents significant complexity for a non-developer to debug when things go wrong.

**Risk:** If the product resolver silently creates duplicate products (e.g., because source_name formatting changed between weeks), the products table grows with orphan entries that never match a product_group. The deals still display correctly (they have their own product_name), but favorites matching via product_group becomes unreliable.

**Specific adjustment:** Add a pipeline log line showing: "Products created: X new, Y updated, Z auto-matched to groups." This gives the PM a dashboard signal when product creation is unexpectedly high (indicating potential duplicates).

**Verdict rationale:** Weakened because the auto-match step (sub_category + quantity + unit) is speculative -- product_groups are manually curated with ~37 rows. At launch, most products will not match any group. The fallback (keyword matching) will be the primary path for most favorites. The resolver is not wrong, but its complexity-to-value ratio is poor for V1. Consider: build the lookup + create steps, skip auto-match until there is evidence it is needed.

### C6: Categorizer Extension (Section 4.4)

**Verdict: Confirmed**

Adding `subCategory` to the category rules is the right extension. The rules structure is clean and the default (`{ category: 'long-life', subCategory: null }`) is safe. The sub-category is needed for the deals browsing page (Section 4.10), so this is not speculative.

**Observation:** The architecture lists ~6 example keyword rules. The PRD lists 11 browsable sub-categories. The full mapping from keywords to all 11 sub-categories is in `shared/category-rules.ts` -- the architecture correctly delegates to that file. However, the mapping from the 23 sub-categories in the data model (Section 6, PRD) to the 11 browse categories (Section 4.10) is not explicitly documented in the architecture. The `BROWSE_CATEGORIES` constant is mentioned but not defined.

**Specific adjustment:** Include the `BROWSE_CATEGORIES` mapping in the architecture (or at minimum reference which sub-categories map to which browse category). Without this, the builder has to infer the mapping.

### C7: Deals Browsing Page (Section 4.10)

**Verdict: Confirmed**

Clean separation: `CategoryFilterPills` for navigation, `StoreGroup` for per-store display, `DealCard` for individual deals. The 50-deal cap with "Show more" prevents mobile performance issues. The query pattern correctly uses `.in('sub_category', browseCategory.subCategories)`.

**One gap:** The architecture specifies "Desktop: side-by-side columns (Migros left, Coop right)" but does not specify what happens when one store has zero deals in a category. Does the empty column show "No deals from [Store] in this category" or collapse? The use case (UC-1) specifies "Show available store's deals + banner" for missing store data, but this is for the entire store being down -- not for a specific category being empty.

### C8: Comparison View (Section 4.12)

**Verdict: Confirmed**

The matching priority (product_group first, keyword fallback) is correct. Data freshness indicator is included. The dual return paths are well-specified.

### C9: Onboarding Flow (Section 4.11)

**Verdict: Confirmed**

5 starter packs, 30-item soft cap, customization -- all match the PRD. The soft cap (warning, not block) is the right UX choice.

### C10: OG Meta Tags (Section 4.15)

**Verdict: Adjust**

The architecture correctly identifies the SPA limitation (social crawlers don't execute JS) and proposes Vercel Edge Middleware. This is the right approach.

**Issue 1: Middleware uses Next.js imports in a Vite project**

The middleware example code (Section 9.2) imports from `'next/server'`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
```

This project uses Vite, not Next.js. Vercel Edge Middleware for non-Next.js projects uses the `@vercel/edge` package, not `next/server`. The correct import is:

```typescript
import { RequestContext } from '@vercel/edge'
```

Or use Vercel's Edge Functions format for Vite projects. The middleware file location also differs -- for Vite on Vercel, Edge Middleware is configured via `vercel.json` rewrites pointing to an API route, not a root-level `middleware.ts` file.

**Evidence:** Vercel's documentation for Edge Middleware with non-Next.js frameworks specifies a different API surface. The `middleware.ts` convention at the project root is Next.js-specific.

**Specific adjustment:** Replace the Next.js middleware example with the correct Vercel Edge Functions approach for Vite:

```typescript
// api/og-middleware.ts (Vercel Serverless/Edge Function)
export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  // Check user agent, return OG HTML for crawlers
}
```

And in `vercel.json`, add a rewrite rule for crawler user agents. Alternatively, use a simpler approach: a Vercel serverless function that generates OG HTML, with rewrite rules in `vercel.json` that route crawler traffic to it.

**Issue 2: Dynamic OG tags for comparison pages**

The `/compare/:favoriteId` page needs dynamic OG content ("X items on sale: Y at Migros, Z at Coop"). The middleware would need to query Supabase to generate this content for crawlers. This means:

- The middleware needs Supabase credentials (environment variables available in Vercel Edge Functions)
- Each crawler request triggers a database query
- The OG content must be computed server-side

This is feasible but adds complexity. The architecture mentions it (`"My shopping comparison -- basketch"` with dynamic counts) but does not address the Supabase query requirement in the middleware.

**Recommendation:** For V1, use static OG tags for `/compare/:id` ("See your personalized Migros vs Coop comparison"). Dynamic OG tags can be added later when social sharing of comparison pages becomes a measured need. The Wordle card (screenshot sharing) is the primary sharing mechanism for personalized content anyway.

### C11: Accessibility (Section 4.16)

**Verdict: Confirmed**

The architecture correctly identifies the contrast problem with Migros orange (#FF6600) on white (3.13:1, fails AA) and proposes a dual-color solution: brand color for backgrounds with dark text, darker variant (#CC5200) for text on white. Coop red analysis is also correct (#E10A0A fails normal text, use #B80909).

The decision to "always pair color with text labels" satisfies WCAG 1.4.1 (Use of Color). Touch targets (44x44px), keyboard accessibility, focus states, and semantic HTML are all specified.

**One observation:** The architecture specifies accessibility requirements but does not specify how they will be verified during build. The coding standards mention "Run axe DevTools" but the build order (Step 11) bundles accessibility with OG tags and error pages. Consider: accessibility should be verified per-component during Steps 8-10, not as a separate pass at the end. Retrofitting accessibility is harder than building it in.

**Specific adjustment:** Add a note to Steps 8-10 in the build order: "Each component must pass axe DevTools with zero critical violations before proceeding."

---

## 3. Data Architecture (Section 5) -- Challenges

### C12: Products Table (Section 5.1)

**Verdict: Confirmed**

The unique constraint `UNIQUE (store, source_name)` is the correct approach for product identity -- it uses the raw name from the source, which is more stable than normalized names. This addresses the v1 challenge about upsert conflict keys (C2.4 in v1).

Indexes on `product_group`, `category + sub_category`, and `store` cover the query patterns. The FK to `product_groups` is nullable (correct -- most products will not be in a group at launch).

### C13: Product Groups Table (Section 5.2)

**Verdict: Confirmed**

Simple reference table with ~37 rows. The `search_keywords` and `exclude_keywords` arrays enable flexible matching. The `TEXT` primary key (e.g., "milk-whole-1l") is readable and debuggable -- better than UUID for reference data.

### C14: Deals Table (Section 5.3)

**Verdict: Adjust (two issues from v1 still open)**

**Issue 1: `discount_percent` is still nullable INTEGER**

The v1 challenge (C3.1) flagged this: the verdict calculation requires non-null discount percentages. The coding standards (Section 4) state: "`discount_percent` must be non-null after pipeline processing." But the SQL schema still allows `NULL`:

```sql
discount_percent INTEGER,  -- allows NULL
```

The architecture should either:
1. Make the column `NOT NULL` with a default of 0 (and ensure the pipeline always calculates it), or
2. Document that the pipeline guarantees non-null values and the frontend must handle null as a defensive measure

The coding standards and the schema are contradicting each other. The pipeline is supposed to calculate discount_percent from prices when the source doesn't provide it, but if neither original_price nor sale_price is available, what happens? The architecture says "exclude the deal" but the schema allows it through.

**Specific adjustment:** Add a `CHECK (discount_percent IS NOT NULL OR original_price IS NULL)` constraint, or make the pipeline validation explicit: "Deals without calculable discount_percent are excluded from storage."

**Issue 2: `updated_at` trigger still missing**

The v1 challenge (C3.1) recommended adding a `BEFORE UPDATE` trigger to auto-set `updated_at`. The v2 schema still only has `DEFAULT now()` on creation. The pipeline upsert will leave `updated_at` at the original creation time unless it explicitly sets the field.

The coding standards (Section 5, "Idempotency") say the pipeline must be safe to re-run, but without the trigger or explicit set, re-running the pipeline won't update `updated_at` on existing deals, making it impossible to tell when a deal was last confirmed by the pipeline.

**Specific adjustment:** Add the trigger from v1 recommendation, or add `updated_at: new Date().toISOString()` to the upsert payload in `store.ts`. The trigger is more reliable.

### C15: Favorites and Favorite Items (Sections 5.6-5.7)

**Verdict: Confirmed**

The `favorite_items` table correctly includes `product_group_id` for the preferred matching path, with `keyword` as the fallback. The unique constraint `UNIQUE (favorite_id, keyword)` prevents duplicate items. The `ON DELETE CASCADE` on `favorite_id` ensures cleanup.

### C16: RLS Policies (Section 5.9)

**Verdict: Adjust**

The RLS policies for favorites are too permissive:

```sql
CREATE POLICY "Public update favorites" ON favorites FOR UPDATE USING (true);
CREATE POLICY "Public delete favorite_items" ON favorite_items FOR DELETE USING (true);
```

This means anyone with the anon key can:
- Update ANY user's favorite (change their email)
- Delete ANY user's favorite items

At 10-50 users (friends), the risk is negligible. But the fix is trivial: add a condition that matches the request to the favorite's ID or email:

```sql
-- Better: only allow updates where the user provides the correct ID
CREATE POLICY "Public update own favorites" ON favorites
  FOR UPDATE USING (true) WITH CHECK (true);
-- This is still effectively wide-open, but at least requires knowing the UUID
```

For V1 with friends, this is acceptable as-is. But document it as a known limitation: "Favorites are effectively public -- anyone who guesses a UUID can modify that list. Acceptable for 10-50 trusted users."

**Specific adjustment:** Add the documentation note. The fix is low-effort but low-priority for the friend group.

### C17: Entity Relationship Diagram (Section 5.8)

**Verdict: Confirmed**

The ERD accurately shows the relationships. The `starter_packs.items[].productGroupId` reference is documented (JSONB array referencing product_groups by ID). The 1:N relationships are correct.

---

## 4. Security (Section 6) -- Challenges

### C18: No Authentication Design

**Verdict: Confirmed**

No auth is the right call for 10-50 friends. The UUID-based access (unguessable) provides sufficient obscurity. Email lookup is convenience, not security. The OWASP review covers the relevant items (injection, broken access control, misconfiguration, data exposure).

### C19: Input Validation

**Verdict: Confirmed**

The four validation boundaries (pipeline JSON, email format, search input sanitization, favorite item count) cover the attack surface. The search input escaping for Supabase `ilike` is important -- without it, `%` in search queries could return all rows. Max 100 chars is a reasonable limit.

---

## 5. Infrastructure (Section 9) -- Challenges

### C20: GitHub Actions Cron Timing

**Verdict: Adjust (v1 finding still open)**

The v1 challenge recommended changing the cron to an off-peak minute (`17 21 * * 3` instead of `0 21 * * 3`) to avoid GitHub Actions scheduling congestion at the top of the hour. The v2 architecture still uses `0 21 * * 3` and `0 6 * * 4`.

**Specific adjustment:** Change both crons to off-peak minutes:
- `17 21 * * 3` (Wednesday 21:17 UTC) instead of `0 21 * * 3`
- `17 6 * * 4` (Thursday 06:17 UTC) instead of `0 6 * * 4`

This is a one-character change with no downside.

### C21: Vercel Edge Middleware for OG Tags

**Verdict: Adjust** (see C10 above -- uses wrong API for Vite projects)

### C22: Supabase Setup Order (Section 9.3)

**Verdict: Confirmed**

The 10-step setup correctly orders table creation (product_groups first because others reference it), then indexes, then RLS, then seeding. This is achievable in under 30 minutes.

---

## 6. Technology Decisions (Section 10) -- Challenges

### C23: ADR-001 Products Table

**Verdict: Confirmed**

The three alternatives (metadata on deals, AI matching, fuzzy string matching) are correctly evaluated. German compound words genuinely break fuzzy matching. A products table is the right foundation.

### C24: ADR-002 Manual Product Groups

**Verdict: Confirmed**

37 manually curated groups for starter pack items is realistic. The path to automation (sub_category + quantity + unit matching) is documented but deferred. This is the right scope for V1.

### C25: ADR-003 Vercel Edge Middleware for OG Tags

**Verdict: Adjust** (see C10 -- correct concept, wrong implementation for Vite)

### C26: ADR-004 Accessible Store Colors

**Verdict: Confirmed**

The dual-color approach (brand colors for backgrounds, darker variants for text) is well-reasoned. The specific hex values and ratios are documented. This prevents the common mistake of using brand colors directly on white backgrounds.

### C27: ADR-005 through ADR-010 (unchanged from v1.1)

**Verdict: Confirmed (with one note)**

The architecture states "React Query for state management" remains accepted. However, the v1 challenge weakened this (React Query is 13KB for a problem that barely exists -- data changes weekly). The coding standards (Section 4) leave this as "Decision pending: React Query vs custom localStorage+fetch hook."

This unresolved decision creates ambiguity for the builder. Both documents should agree.

**Specific adjustment:** Resolve the React Query decision in the architecture. Either accept it with the rationale that a non-developer PM benefits from the documented API, or replace it with the simpler approach. Do not leave it as "pending" -- the builder needs a clear instruction.

---

## 7. Special Attention Areas

### SA-1: Two-Tier Coop Status Implementation

**Verdict: Adjust -- NOT IN ARCHITECTURE**

The PRD v2.0 (Section 3, Epic 2) specifies two-tier Coop status messages:
- Tier 1 (product seen before): "Not on promotion at Coop this week"
- Tier 2 (product never seen): "No Coop data yet"

This is a core differentiator of the v2 spec -- it addresses the data asymmetry honestly. However, the technical architecture does not specify how to determine which tier applies.

**The missing logic:** To distinguish Tier 1 from Tier 2, the frontend (or a query function) must check whether the product exists in the `products` table with `store = 'coop'`. If it exists (even if not currently on sale), it is Tier 1. If it has never been seen, it is Tier 2.

This requires a query like:
```typescript
// For each favorite item, check if Coop product exists
const { data: coopProduct } = await supabase
  .from('products')
  .select('id')
  .eq('product_group', productGroupId)
  .eq('store', 'coop')
  .limit(1)

// If coopProduct exists but no active deal -> Tier 1
// If no coopProduct at all -> Tier 2
```

This query pattern is not in Section 8.2 (Supabase Query Patterns) or Section 4.12 (Comparison View). The ComparisonView component needs to know about this logic, but the architecture does not specify it.

**Specific adjustment:** Add the two-tier status logic to Section 4.12 (Comparison View) and add the query pattern to Section 8.2. Also add it to the `getComparisonForFavorites` function signature in Section 4.8.

### SA-2: Wordle Card

**Verdict: Adjust -- NOT IN ARCHITECTURE**

The PRD v2.0 (Section 3, verdict card) and Use Cases v2.0 (UC-1, acceptance criteria) require a "shareable Wordle card" -- a standalone visual card optimized for WhatsApp screenshot sharing. The PRD specifies:
- Self-contained (readable without visiting basketch)
- Show store name, category, deal count, avg discount per category
- Include basketch.ch branding
- Readable after WhatsApp image compression
- "Copy card" button for easy sharing

The technical architecture does NOT include:
- A component for the Wordle card (no `WordleCard.tsx` or `VerdictCard.tsx` in the folder structure)
- A specification for how the card is rendered (HTML/CSS, canvas, SVG?)
- How the "Copy card" button works (copy image to clipboard? screenshot prompt? download?)
- Whether the card is rendered client-side or as a generated image

This is a significant omission because the Wordle card is the primary WhatsApp growth mechanism. It is referenced in the PRD, use cases, and growth strategy but has no technical design.

**Specific adjustment:** Add a new section (4.17 or extend 4.9) specifying:
1. Component: `VerdictCard.tsx` -- renders the verdict as a screenshot-friendly visual card
2. Rendering approach: HTML/CSS with fixed dimensions (e.g., 400x600px), high contrast, minimal text. Use CSS `aspect-ratio` and large fonts for WhatsApp compression survival.
3. "Copy card" behavior: Use the `html2canvas` library (or native Canvas API) to render the card as an image, then copy to clipboard via `navigator.clipboard.write()`. Fallback: "Download card" button.
4. Add `VerdictCard.tsx` to the folder structure
5. Add to build order Step 9 (alongside ComparisonView and Home)

### SA-3: Favorites Data Model for Two-Tier Status

**Verdict: Confirmed (with SA-1 adjustment)**

The favorites data model itself is sound. `favorite_items` links to `product_groups` for matching, with keyword as fallback. The `products` table tracks whether Coop has ever seen a product (via `first_seen_at`). The data model supports the two-tier logic -- it just needs the query to be specified (see SA-1).

### SA-4: Starter Pack Validation Process

**Verdict: Adjust**

The PRD requires: "Run the pipeline 2-3 weeks before sharing with friends to accumulate Coop product history. Validate every starter pack item against actual promotional data. If more than 3 items in a pack have zero Coop history, swap them."

The architecture does not specify how to validate starter packs. There is no query, script, or process defined for:
1. Checking how many starter pack items have Coop product history
2. Identifying which items to swap
3. When to perform this validation

**Specific adjustment:** Add a validation step to the build order (between Step 6 and Step 7, after the pipeline has run 2-3 times):

> "Run validation query: For each starter pack, count items with product_group matches in both stores. If a pack has >3 items with zero Coop history, review and swap items. Query: `SELECT sp.name, fi.keyword, EXISTS(SELECT 1 FROM products WHERE product_group = fi.product_group_id AND store = 'coop') as has_coop FROM starter_packs sp, jsonb_array_elements(sp.items) as item...`"

### SA-5: OG Tags Implementation

**Verdict: Adjust** (see C10 -- correct concept, wrong Vite implementation)

### SA-6: Accessibility

**Verdict: Confirmed** (see C11 -- well-specified, but verify per-component during build)

---

## 8. Completeness Check: PRD Requirements vs Architecture

| PRD Requirement | Architecture Section | Covered? |
|----------------|---------------------|----------|
| Verdict formula (40/60, 5% tie, min 3 deals) | 4.9 | Yes |
| Verdict transparency line | 4.9 | Yes |
| Verdict states (normal, tie, stale, partial, no data) | 4.9 | Yes |
| 5 starter packs | 4.11, 5.5 | Yes |
| 30-item soft cap | 4.11 | Yes |
| 11 browsable sub-categories | 4.10 | Yes |
| 50-deal display cap with "Show more" | 4.10 | Yes |
| Dual return paths (URL + email, both primary) | 4.13 | Yes |
| Two-tier Coop status messages | **Not in architecture** | **No -- see SA-1** |
| Coop transparency label | Not explicitly in architecture | **Partial -- mentioned in PRD, not spec'd in arch** |
| Wordle card (shareable verdict visual) | **Not in architecture** | **No -- see SA-2** |
| OG meta tags for WhatsApp sharing | 4.15 | Yes (but implementation issues, see C10) |
| WCAG 2.1 AA | 4.16 | Yes |
| Store colors (Migros orange, Coop red) | 4.9, 4.16, ADR-004 | Yes |
| Data freshness indicator | 4.12 | Yes |
| Stale data warning (>7 days) | 4.9 | Yes |
| 404 page | 4.14 | Yes |
| Invalid comparison ID error | 4.14 | Yes |
| North Star metric tracking | **Not in architecture** | **No -- see Missing Pieces** |
| "Copy card" button | **Not in architecture** | **No -- part of Wordle card gap** |
| Email lookup on home page | 4.13 | Yes |
| Product search for favorites | 4.8 (searchProducts) | Yes |
| Starter pack validation (pre-launch) | **Not in architecture** | **No -- see SA-4** |
| Pipeline Wednesday + Thursday schedule | 9.1 | Yes |
| `discount_percent` non-null guarantee | Coding standards yes, schema no | **Inconsistent -- see C14** |

---

## 9. Consistency Check: Architecture Internal Contradictions

### IC-1: React Query -- Accepted or Pending?

- Architecture Section 4.8: "Caching: React Query with staleTime: 1 hour"
- Architecture Section 10: "ADR-005: React Query for state management -- accepted"
- Coding Standards Section 4: "Decision pending: React Query vs custom localStorage+fetch hook"
- CLAUDE.md: No mention of the decision

The architecture says "accepted." The coding standards say "pending." These must agree.

### IC-2: `discount_percent` -- Nullable or Non-Null?

- Schema (Section 5.3): `discount_percent INTEGER` (nullable)
- Coding Standards (Section 4): "discount_percent must be non-null after pipeline processing"
- Architecture (Section 4.9): Verdict formula assumes non-null values

The schema should enforce what the pipeline guarantees.

### IC-3: Cron Time -- Off-Peak or Top-of-Hour?

- v1 Challenge recommended: `17 21 * * 3`
- v2 Architecture: `0 21 * * 3`

v1 adjustment not applied.

### IC-4: UC-3 Service Worker vs No Service Worker

- Use Cases UC-3: "Service worker caching for repeat visits"
- Architecture: No service worker mentioned anywhere
- v1 Challenge recommended: "No service worker needed for MVP"

The use cases still reference service workers. The architecture correctly omits them. The use cases should be updated to remove the service worker reference.

---

## 10. Missing Pieces

### MP-1: Wordle Card Component (Priority: High)

The Wordle card is the primary WhatsApp growth mechanism. It is referenced in the PRD, use cases, and growth strategy but has no technical design in the architecture. See SA-2 for details.

### MP-2: Two-Tier Coop Status Logic (Priority: High)

The query logic and component behavior for distinguishing Tier 1 ("not on promotion") from Tier 2 ("no Coop data yet") is not specified. See SA-1 for details.

### MP-3: Date Filter on Frontend Queries (Priority: Medium)

The v1 challenge (C6.3, item 7) recommended adding a date filter to frontend Supabase queries as a safety net. If the pipeline fails for 2+ weeks, `is_active = true` deals remain visible even though they are expired. The v2 architecture still relies only on `is_active`.

**Fix:** Add `.gte('valid_from', startOfWeek)` or `.lte('valid_to', today)` to the main deal queries.

### MP-4: North Star Metric Implementation (Priority: Medium)

The PRD specifies a North Star metric: "% of active baskets that viewed a comparison this week." The architecture has no mechanism to track this. There is no analytics event, no database column, no query function for measuring comparison views per basket per week.

**Fix:** Either add a `comparison_views` table (simple: `favorite_id, viewed_at`) or rely on Vercel Analytics page views for `/compare/:id`. If using Vercel Analytics, document how to extract the metric.

### MP-5: Starter Pack Validation Process (Priority: Medium)

See SA-4. No query or process for validating starter packs against Coop data before sharing with friends.

### MP-6: Coop Transparency Label (Priority: Low)

The PRD specifies a permanent one-line label on the comparison page: "Coop: showing promotions found. Not all Coop products are tracked yet." This is not mentioned in the architecture or component list. It is a static text element, so the fix is trivial, but it should be listed in the ComparisonView specification.

### MP-7: Browse Category Mapping (Priority: Low)

The `BROWSE_CATEGORIES` constant is referenced but not defined. The mapping from 23 DB sub-categories to 11 browsable categories needs to be in the architecture or explicitly delegated to `shared/types.ts`.

---

## 11. Recommended Changes (Prioritized)

### Must-Do Before Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 1 | Add Wordle card component specification (rendering, copy behavior, dimensions) | 30 min (docs) | New 4.17, folder structure |
| 2 | Add two-tier Coop status logic to Comparison View + query patterns | 15 min (docs) | 4.12, 8.2 |
| 3 | Fix OG middleware implementation for Vite (not Next.js imports) | 15 min (docs) | 9.2 |
| 4 | Resolve `discount_percent` schema vs coding standards contradiction | 5 min | 5.3 |
| 5 | Add `updated_at` trigger to schema (v1 finding, still open) | 5 min | 5.3 |
| 6 | Resolve React Query decision (architecture says accepted, coding standards says pending) | 5 min (docs) | 10, coding standards |

### Should-Do During Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 7 | Change cron to off-peak minutes (`17 21 * * 3`, `17 6 * * 4`) | 1 min | 9.1 |
| 8 | Add date filter to frontend deal queries (safety net for stale data) | 10 min | 8.2 |
| 9 | Add accessibility verification note to build steps 8-10 | 5 min (docs) | 13 |
| 10 | Add Coop transparency label to ComparisonView spec | 5 min (docs) | 4.12 |
| 11 | Add product resolver logging ("X new, Y updated, Z matched") | 10 min | 4.5 |
| 12 | Define starter pack validation query and process | 15 min (docs) | New section or build order note |
| 13 | Document empty-category behavior in deals browsing page | 5 min (docs) | 4.10 |
| 14 | Document favorites RLS as known limitation | 5 min (docs) | 5.9 |

### Consider (Not Blocking)

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 15 | Skip product resolver auto-match for V1 (build lookup + create only) | Reduces build complexity | 4.5 |
| 16 | Use static OG tags for `/compare/:id` (defer dynamic tags) | Reduces middleware complexity | 4.15 |
| 17 | Add North Star metric tracking mechanism | 30 min | New section |
| 18 | Define `BROWSE_CATEGORIES` mapping explicitly | 15 min (docs) | 4.10 or shared/types.ts |
| 19 | Skip `product_form` extraction for V1 (no UI consumes it) | Reduces test surface | 4.3 |

---

## 12. V1 Challenge Findings: Resolution Status

| v1 Finding | Status in v2 | Notes |
|-----------|-------------|-------|
| Supabase pause prevention | **Resolved** | Keep-alive step added to pipeline (Section 9.1) |
| Cron off-peak timing | **Still open** | Architecture still uses `:00` minutes |
| `updated_at` trigger | **Still open** | Schema unchanged |
| `discount_percent` non-null guarantee | **Partially resolved** | Coding standards require it, schema allows null |
| npm workspaces rejection | **Resolved** | Flat structure adopted (coding standards, CLAUDE.md) |
| React Query weakened | **Unresolved** | Architecture accepts it, coding standards says pending |
| Service worker contradiction | **Partially resolved** | Architecture omits it, use cases still reference it |
| Date filter on frontend queries | **Still open** | Not added |
| JSON validation for Python-TypeScript contract | **Resolved** | Listed in pipeline orchestrator (Section 4.7, step 2) |
| Product name normalization | **Resolved** | Coding standards Section 5 specifies normalization rules |
| Fallback source documentation | **Partially resolved** | Risk register mentions fallback chain but no implementation guide |
| SSR migration trigger | **Partially resolved** | ADR-003 mentions Astro as Phase 2 plan, but no concrete trigger defined |

---

## 13. Final Verdict

### Go with changes.

The v2 architecture is a substantial and well-structured evolution from v1. The products table, product groups, metadata extraction, deals browsing page, and dual return paths are all well-designed. The ADRs are honest about trade-offs. The build order is logical and each step is independently verifiable.

**What is strong:**
- The data model evolution (products + product_groups) is the right foundation for cross-store matching and future extensibility
- Accessibility is specified with concrete contrast ratios and color solutions, not just "WCAG 2.1 AA" as a checkbox
- The OG tag approach (Edge Middleware for crawlers) is the correct concept for an SPA
- RLS policies correctly separate read (public) from write (pipeline-only) for deal data
- The 12-step build order maps cleanly to the AC/DC development workflow
- Cost analysis is realistic (CHF 0/month is achievable and verified)

**What needs attention before building:**
1. The **Wordle card** (item 1) is a primary growth mechanism with no technical specification -- this is the biggest gap
2. The **two-tier Coop status** (item 2) is a core UX differentiator with no query logic specified
3. The **OG middleware uses Next.js imports** (item 3) in a Vite project -- this will fail at build time
4. The **`discount_percent` contradiction** (item 4) between schema and coding standards will cause confusion
5. The **`updated_at` trigger** (item 5) is a v1 finding that is still open
6. The **React Query decision** (item 6) is accepted in one document and pending in another

**What can be deferred safely:**
- Product resolver auto-match (keyword fallback works fine for V1)
- Dynamic OG tags for comparison pages (static tags + Wordle card cover sharing needs)
- North Star metric tracking (can use Vercel Analytics as a proxy initially)
- `product_form` extraction (no UI consumes it)
- Browse category mapping documentation (builder can infer from sub-category list)

**Total effort for Must-Do changes:** ~75 minutes of documentation updates. No code changes required -- all adjustments are to the architecture document itself.

The architecture is ready to build once the 6 Must-Do changes are applied.
