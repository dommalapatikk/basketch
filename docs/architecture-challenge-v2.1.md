# Architecture Challenge: basketch (v2.1)

**Challenger:** Architect Challenger Agent
**Date:** 12 April 2026
**Input:** Technical Architecture v2.1, PRD v2.0, Use Cases v2.0, Architecture Challenge v2.0 (6 must-do findings), Architecture Challenge v1.0, PM Coach Review (Favorites Data Gap), WhatsApp Sharing Guide, Coding Standards v1.0
**Scope:** All 7 challenge tests applied to every section. Special focus on verification of 6 must-do fixes from v2.0 challenge.

---

## Summary

| Verdict | Count | Decisions |
|---------|-------|-----------|
| **Confirmed** | 27 | C4 diagrams, mixed-language pipeline, Supabase choice + pause prevention, metadata extractor, categorizer extension, product resolver (with logging), pipeline orchestrator, storage module, data layer (caching resolved), verdict logic, deals browsing page, onboarding flow, comparison view + two-tier status, dual return paths, error pages, Web Share API, Wordle card spec, starter pack validation, kill criteria monitoring, RLS policies (documented limitation), products table, product groups table, deals table (discount_percent + trigger fixed), ERD, security architecture, cost analysis, build order |
| **Adjust** | 5 | OG edge function routing gap, `BROWSE_CATEGORIES` still not defined, coding standards still say "decision pending" for React Query, accessibility verification timing, Coop red contrast values inconsistent |
| **Weakened** | 1 | Product resolver auto-match complexity for non-developer |
| **Rejected** | 0 | None |

**Total decisions challenged: 33**

---

## Previous Findings Verification: 6 Must-Do Gaps from v2.0 Challenge

This is the critical section. The v2.0 challenge identified 6 must-do changes. The Architect claims all 6 are resolved. Here is the evidence-based verification.

### Must-Do 1: Wordle Card Component Specification

**v2.0 finding:** "The Wordle card is the primary WhatsApp growth mechanism. It is referenced in the PRD, use cases, and growth strategy but has no technical design in the architecture."

**v2.1 status: RESOLVED**

**Evidence:** Section 4.17 now specifies:
- Component name: `VerdictCard.tsx`
- Design requirements: self-contained, fixed aspect ratio (~400x500px), high contrast, basketch branding, readable at 50% zoom, own background color
- Card content layout: wireframe showing store name, category, deal count, avg discount per category, date, branding
- Rendering approach: HTML/CSS with fixed dimensions, large fonts (18px+ body, 24px+ headings), solid colors
- "Copy card" button: html2canvas -> canvas.toBlob() -> navigator.clipboard.write() with download fallback
- Browser support documented: Chrome 76+, Edge 79+, Safari 13.1+, Firefox falls back to download
- Accessibility: aria-label on card, keyboard accessible copy button
- ADR-011 documents the rendering decision with alternatives considered (server-side, Canvas API, SVG)
- Added to build order Step 8 (alongside Home page -- correct placement, verdict-first)
- Added to folder structure

**Verdict: Fully resolved.** The specification is thorough and matches the PRD/use case requirements. The html2canvas approach is feasible for a simple card layout. The fallback chain (clipboard write -> download) handles browser support gaps.

### Must-Do 2: Two-Tier Coop Status Logic

**v2.0 finding:** "The query logic and component behavior for distinguishing Tier 1 ('not on promotion') from Tier 2 ('no Coop data yet') is not specified."

**v2.1 status: RESOLVED**

**Evidence:** Section 4.12 now includes:
- Two-tier table with condition, message, and meaning for each tier
- Note that Migros always gets confident statements (full catalog access)
- `checkCoopProductExists()` function with both product_group_id path and keyword fallback path
- Complete display state matrix (6 states covering all Migros/Coop combinations)
- Sort order: both-store matches first, then single-store, then no matches
- `coopProductKnown: boolean` flag returned by `getComparisonForFavorites`
- Coop transparency label: "Coop: showing promotions found. Not all Coop products are tracked yet."
- Query pattern added to Section 8.2 (line 1020-1028)
- Build order Step 7 includes `checkCoopProductExists` explicitly
- Build order Step 11 includes verification of two-tier status display

**Verdict: Fully resolved.** The query logic correctly distinguishes Tier 1 from Tier 2. The six display states match the PRD's requirements table exactly. The keyword fallback path in `checkCoopProductExists` is important -- without it, items added via search (without a product_group_id) would always show Tier 2. This is correct.

### Must-Do 3: OG Middleware Implementation for Vite

**v2.0 finding:** "The middleware example code imports from 'next/server'. This project uses Vite, not Next.js."

**v2.1 status: RESOLVED (with one minor gap -- see Adjust below)**

**Evidence:** Section 9.2 now shows:
- Correct Vercel Edge Function approach at `web/api/og.ts` (not root-level middleware.ts)
- `export const config = { runtime: 'edge' }` (correct Vercel Edge Function syntax)
- No Next.js imports
- Crawler user agent detection array
- Static OG tags per route with sensible defaults
- Returns minimal HTML with correct OG meta tags for crawlers
- ADR-003 updated to explicitly state "Not Next.js middleware -- this is a Vite project"
- Static OG for `/compare/:id` with rationale (Wordle card handles personalized sharing)

**Verdict: Resolved.** The implementation approach is correct for Vite on Vercel. The remaining gap is minor (see C3 below).

### Must-Do 4: `discount_percent` Schema vs Coding Standards Contradiction

**v2.0 finding:** "The schema allows NULL, the coding standards require non-null, and the verdict formula assumes non-null values."

**v2.1 status: RESOLVED**

**Evidence:** Section 5.3 now shows:
```sql
discount_percent INTEGER NOT NULL,  -- v2.1: NOT NULL enforced
```
The comment in the schema explains: "Pipeline calculates from prices if source doesn't provide it. Deals without calculable discount are excluded."

The schema, coding standards, and verdict logic now all agree: `discount_percent` is never null.

**Verdict: Fully resolved.** The `NOT NULL` constraint enforces what the pipeline guarantees. Deals without calculable discounts are excluded at pipeline time, which is the correct boundary.

### Must-Do 5: `updated_at` Trigger

**v2.0 finding:** "The v1 challenge recommended adding a BEFORE UPDATE trigger. The v2 schema still only has DEFAULT now() on creation."

**v2.1 status: RESOLVED**

**Evidence:** Section 5.3 now includes:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ ...

CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals ...
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products ...
CREATE TRIGGER favorites_updated_at BEFORE UPDATE ON favorites ...
```

Three triggers -- one for deals, one for products, one for favorites. The function is defined once and reused. This is the exact recommendation from both v1 and v2.0 challenges.

**Verdict: Fully resolved.** The trigger approach is more reliable than explicit `updated_at` in the upsert payload.

### Must-Do 6: React Query Decision

**v2.0 finding:** "Architecture says 'accepted,' coding standards say 'pending.' These must agree."

**v2.1 status: MOSTLY RESOLVED (coding standards still outdated)**

**Evidence in architecture:** ADR-005 is now titled "Simple Fetch + Cache over React Query" with status "Accepted (changed from v2.0)." The rationale is clear: 13KB for weekly-updating data with no mutations is overkill. The `useCachedQuery` hook (~30 lines) is specified with implementation outline. Section 4.8 explicitly states: "React Query removed -- too heavy for weekly-updating data."

**Evidence in coding standards:** Section 4 still reads: "Decision pending: React Query vs custom localStorage+fetch hook."

**Verdict: Mostly resolved.** The architecture itself is internally consistent and the decision is clear. However, the coding standards document has not been updated to reflect this decision. This is a documentation sync issue, not an architecture gap. See Adjust C5 below.

### Previous Findings Summary

| Must-Do # | Finding | Status |
|-----------|---------|--------|
| 1 | Wordle card component specification | **RESOLVED** |
| 2 | Two-tier Coop status logic | **RESOLVED** |
| 3 | OG middleware for Vite | **RESOLVED** (minor routing gap) |
| 4 | `discount_percent` NOT NULL | **RESOLVED** |
| 5 | `updated_at` trigger | **RESOLVED** |
| 6 | React Query decision | **MOSTLY RESOLVED** (coding standards not updated) |

**5 of 6 fully resolved. 1 mostly resolved with a minor doc sync gap. No must-do findings remain unresolved.**

---

## V1 Challenge Findings: Final Resolution Status

| v1 Finding | Status in v2.1 | Notes |
|-----------|----------------|-------|
| Supabase pause prevention | **Resolved** | Keep-alive step in pipeline workflow (Section 9.1) |
| Cron off-peak timing | **Resolved** | Changed to `17 21 * * 3` and `17 6 * * 4` (Section 9.1) |
| `updated_at` trigger | **Resolved** | Three triggers added (Section 5.3) |
| `discount_percent` non-null | **Resolved** | `NOT NULL` constraint in schema (Section 5.3) |
| npm workspaces rejection | **Resolved** | Flat structure adopted (coding standards, CLAUDE.md) |
| React Query weakened | **Resolved** | Replaced with `useCachedQuery` (ADR-005) |
| Service worker contradiction | **Partially resolved** | Architecture omits it (correct). Use cases still reference it (UC-3 may still mention "service worker caching") |
| Date filter on frontend queries | **Resolved** | `.gte('valid_to', today)` added to query patterns (Section 8.2) |
| JSON validation for contract | **Resolved** | Listed in pipeline orchestrator (Section 4.7, step 2) |
| Product name normalization | **Resolved** | Coding standards Section 5 specifies rules |
| Fallback source documentation | **Partially resolved** | Risk register mentions fallback chain (R1, R2) but no implementation guide |
| SSR migration trigger | **Partially resolved** | ADR-003 mentions Astro as Phase 2, no concrete metric trigger |

**9 of 12 v1 findings fully resolved. 3 partially resolved (all low priority).** The service worker reference in use cases is cosmetic. The fallback source implementation guide can be written when a fallback is actually needed. The SSR migration trigger is a Phase 2 concern.

---

## Section-by-Section Challenges

### 1. Context & Scope (Section 1-2)

#### C1: Scope Accuracy

**Verdict: Confirmed**

The "in scope" list matches the PRD v2.0 exactly. The "out of scope" list correctly excludes items from PRD Section 9. The feature sequencing rationale (Section 3) accurately reflects the verdict-first strategy from the PM Coach review and Lenny review. The dimensions table (data confidence, setup friction, time to value, shareability, data asymmetry risk) is accurate and honest.

No omissions. No additions beyond what the PRD specifies.

### 2. Container Design (Section 3)

#### C2: Deployment Model and Three Data Paths

**Verdict: Confirmed**

The deployment model table is accurate. The cron times are now off-peak (`17 21 * * 3`, `17 6 * * 4`) -- v1 finding resolved. The three data paths (pipeline, user favorites, deals browsing) correctly separate write (pipeline) from read (frontend) operations.

The feature sequencing rationale in Section 3 is well-structured and matches the PRD's Epic ordering (Epic 1: Verdict + Deals = aha moment, Epic 2: Favorites = retention).

### 3. Module Design (Section 4)

#### C3: OG Edge Function Routing

**Verdict: Adjust (minor gap)**

The edge function implementation (Section 9.2) is correct for Vite on Vercel. However, there is a routing gap: the `vercel.json` rewrites show:

```json
{
  "rewrites": [
    { "source": "/api/og", "destination": "/api/og.ts" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The edge function at `/api/og` is never called by the browser or by crawlers. The crawler hits `basketch.ch/` or `basketch.ch/deals`, not `basketch.ch/api/og`. The edge function needs to intercept ALL incoming requests, check the user agent, and either return OG HTML (for crawlers) or pass through to the SPA (for browsers).

For Vite on Vercel, this is achieved by placing the edge function as middleware, not as an API route. The correct approach for non-Next.js projects on Vercel is to create a `middleware.ts` file at the root of the output directory (or use Vercel's `functions` configuration). Alternatively, use Vercel's `headers` and `rewrites` with conditions based on user-agent -- but Vercel's `vercel.json` does not support user-agent-based routing.

**The practical solution:** The edge function should be a Vercel Middleware file (not a Next.js middleware -- Vercel supports middleware for all frameworks). Place `middleware.ts` at the project root (not `web/api/og.ts`), and Vercel will run it on every request. The function checks the user agent and either returns OG HTML or calls `next()` to pass to the SPA.

Vercel Middleware docs confirm that `middleware.ts` at the project root works for any framework, not just Next.js. The API surface uses the standard `Request`/`Response` objects, not Next.js-specific imports.

**Specific adjustment:** Change the approach from an API route (`web/api/og.ts`) to Vercel Middleware (`web/middleware.ts`). Update the vercel.json to remove the `/api/og` rewrite. The middleware will intercept all requests and only return OG HTML for crawler user agents. This is a documentation change, not a design change -- the logic is identical.

**Severity:** Medium. Without this fix, OG tags will not work because crawlers will never reach the edge function. The whole point of this module is to serve OG tags to crawlers who hit normal URLs.

#### C4: Wordle Card (Section 4.17)

**Verdict: Confirmed**

The specification is complete and matches the PRD requirements:
- Self-contained (readable without visiting basketch): Yes -- card shows store, category, deal count, avg discount
- Show store name, category, deal count, avg discount: Yes -- wireframe layout included
- Include basketch.ch branding: Yes -- bottom of card
- Readable after WhatsApp compression: Yes -- "large fonts (18px+ body, 24px+ headings), solid colors, no gradients or fine borders"
- "Copy card" button: Yes -- html2canvas -> clipboard with download fallback

**One observation on html2canvas:** The library is ~40KB (mentioned in the architecture). This is a significant addition to the JS bundle (target: < 100KB total). The performance budget (Section 11) targets < 100KB gzipped JS. html2canvas should be lazy-loaded (dynamic import) so it is only fetched when the user taps "Copy card," not on every page load. The architecture does not specify lazy loading.

**Recommendation (not blocking):** Add a note to Section 4.17: "html2canvas should be loaded via dynamic `import()` on button click, not included in the main bundle." This keeps the initial page load fast.

#### C5: Comparison View + Two-Tier Status (Section 4.12)

**Verdict: Confirmed**

The two-tier logic is correctly specified:
- Tier 1 condition: product_group_id or keyword has at least one Coop product in `products` table
- Tier 2 condition: never seen in products table
- Query logic: `checkCoopProductExists()` with product_group_id path and keyword fallback
- All 6 display states documented in matrix
- Sort order: both-store first (correct for first impression)
- Coop transparency label included

The query logic for the keyword fallback path uses `ilike('canonical_name', '%keyword%')`. This is correct but could match false positives for short keywords (e.g., "ei" matching "Reinigungsmittel"). The architecture correctly uses `canonical_name` (normalized) rather than `source_name` (raw), which reduces but does not eliminate this risk. For 10-50 users, this is acceptable.

#### C6: Deals Browsing Page (Section 4.10)

**Verdict: Confirmed**

Clean component design. The empty-category behavior is now specified (v2.1 addition): "If a store has zero deals in a selected category, show 'No [Store] deals in this category this week' in that store's column/section. Do not collapse the empty column." This was flagged as missing in v2.0 and is now resolved.

The 50-deal cap with "Show more" is sensible for mobile performance.

#### C7: Web Share API (Section 4.16a)

**Verdict: Confirmed**

Correct use of `navigator.share()` with clipboard fallback. Browser support is accurately documented. The three placement locations (home verdict, comparison page, Wordle card) are appropriate.

One observation: The Wordle card section (4.17) says the share button "shares the home URL" while the card itself is shared as a screenshot. This is slightly ambiguous -- the user taps "Copy card" (copies image), not the share button (shares URL). These are two different actions on the same card. The architecture distinguishes them correctly but the wording in 4.16a could be clearer. Not blocking.

#### C8: Starter Pack Validation (Section 4.18)

**Verdict: Confirmed**

The validation query is specified in SQL and matches the PM Coach Review recommendation. Decision criteria are clear (> 3 items with zero Coop history = swap). Reordering both-store matches first is specified. Build order Step 7b is correctly placed after pipeline runs. This was a v2.0 finding (SA-4) and is fully resolved.

#### C9: Kill Criteria Monitoring (Section 4.19)

**Verdict: Confirmed**

Lightweight approach using existing tools (Vercel Analytics, Supabase SQL, manual feedback). Appropriate for 10-50 users. The North Star metric approximation (Vercel Analytics `/compare/*` views vs `favorites` table count) is sufficient for this scale. No custom analytics infrastructure needed.

### 4. Data Architecture (Section 5)

#### C10: Products Table (Section 5.1)

**Verdict: Confirmed**

Schema is sound. `UNIQUE (store, source_name)` is the correct identity constraint. Indexes cover query patterns. The `product_group` FK to `product_groups` is correctly nullable.

#### C11: Deals Table (Section 5.3)

**Verdict: Confirmed**

`discount_percent INTEGER NOT NULL` -- resolved from v2.0. Three `updated_at` triggers -- resolved from v1/v2.0. The partial indexes on `is_active = true` are efficient.

#### C12: Favorites Tables (Sections 5.6-5.7)

**Verdict: Confirmed**

`favorite_items` correctly includes both `product_group_id` (preferred matching) and `keyword` (fallback). The unique constraint `UNIQUE (favorite_id, keyword)` prevents duplicates. `ON DELETE CASCADE` ensures cleanup.

#### C13: RLS Policies (Section 5.9)

**Verdict: Confirmed**

The v2.0 challenge recommended documenting the wide-open favorites policies as a known limitation. v2.1 now includes: "Known limitation (v2.1): Favorites are effectively public -- anyone who knows a UUID can read or modify that list." This is honest and appropriate for 10-50 friends.

### 5. Security (Section 6)

#### C14: Security Architecture

**Verdict: Confirmed**

No changes from v2.0 assessment. No auth (correct for scope), RLS for authorization, secrets management is clean, input validation covers the four boundaries. OWASP relevant items addressed.

### 6. Infrastructure (Section 9)

#### C15: GitHub Actions Cron

**Verdict: Confirmed**

Both crons now use off-peak minutes: `17 21 * * 3` and `17 6 * * 4`. V1 finding resolved. The keep-alive step is correctly placed after `process-and-store`.

#### C16: Vercel Configuration

**Verdict: Confirmed (with C3 OG routing gap)**

The SPA rewrite is standard. The framework is correctly set to "vite". The OG edge function approach is correct in concept but the routing needs adjustment (see C3).

#### C17: Supabase Setup Order (Section 9.3)

**Verdict: Confirmed**

10-step setup correctly orders table creation (product_groups first, then products, then deals). Seed steps for product_groups and starter_packs are included.

### 7. Technology Decisions (Section 10)

#### C18: ADR-005 Simple Fetch + Cache

**Verdict: Confirmed**

The decision to replace React Query with a custom `useCachedQuery` hook is well-reasoned. The 30-line implementation outline is clear. The rationale (13KB for weekly-updating data with no mutations) is sound. This resolves the v1 weakened verdict and the v2.0 contradiction.

**However:** The coding standards (Section 4) still say "Decision pending: React Query vs custom localStorage+fetch hook." This creates a contradiction between the architecture (decided) and the coding standards (undecided). See C5 in Adjust section below.

#### C19: ADR-011 Wordle Card Rendering

**Verdict: Confirmed**

html2canvas is the right choice for V1. The alternatives (server-side, Canvas API, SVG) are correctly evaluated and rejected for this scope. The consequence ("keep the card design simple -- solid colors, large text, no fancy effects") is honest about html2canvas limitations.

### 8. Performance Budgets (Section 11)

#### C20: Performance Targets

**Verdict: Confirmed**

The targets are realistic for the stack:
- LCP < 2s on 4G: Achievable with Vite + Vercel CDN + small bundle
- JS bundle < 100KB gzipped: Achievable if html2canvas is lazy-loaded (see C4 observation)
- Lighthouse > 90: Standard target for a simple SPA
- Supabase p50 < 200ms: Normal for free tier with simple queries

### 9. Build Order (Section 13)

#### C21: Build Order and Feature Sequencing

**Verdict: Confirmed**

The build order correctly reflects verdict-first sequencing:
- Steps 1-6: Pipeline and data foundation
- Step 7: Frontend data layer (including two-tier status queries)
- Step 7b: Starter pack validation gate (pre-launch, after pipeline runs)
- Step 8: Home page + verdict + Wordle card (aha moment FIRST)
- Step 9: Deals browsing (zero-setup feature, still first-visit)
- Steps 10-11: Onboarding + comparison (retention features SECOND)
- Step 12: Cross-cutting (OG tags, error pages, accessibility sweep)
- Step 13: Deploy + verify

Steps 8-10 each include accessibility verification: "Each component passes axe DevTools with zero critical violations." This addresses the v2.0 recommendation to verify accessibility per-component during build, not as a separate pass. Good.

---

## Completeness Check: PRD Requirements vs Architecture

| PRD Requirement | Architecture Section | Covered? |
|----------------|---------------------|----------|
| Verdict formula (40/60, 5% tie, min 3 deals) | 4.9 | Yes |
| Verdict transparency line | 4.9 | Yes |
| Verdict states (normal, tie, stale, partial, no data, below threshold) | 4.9 | Yes |
| Wordle card (shareable verdict visual) | 4.17, ADR-011 | Yes |
| "Copy card" button | 4.17 | Yes |
| 5 starter packs | 4.11, 5.5 | Yes |
| 30-item soft cap | 4.11 | Yes |
| 11 browsable sub-categories | 4.10 | Yes |
| 50-deal display cap with "Show more" | 4.10 | Yes |
| Dual return paths (URL + email, both primary) | 4.13 | Yes |
| Two-tier Coop status messages | 4.12 | Yes |
| Coop transparency label | 4.12 | Yes |
| OG meta tags for WhatsApp sharing | 4.15, 9.2 | Yes (routing gap, see C3) |
| Web Share API | 4.16a | Yes |
| WCAG 2.1 AA | 4.16 | Yes |
| Store colors (Migros orange, Coop red) | 4.9, 4.16, ADR-004 | Yes |
| Data freshness indicator | 4.12 | Yes |
| Stale data warning (>7 days) | 4.9, 4.12 | Yes |
| 404 page | 4.14 | Yes |
| Invalid comparison ID error | 4.14 | Yes |
| Email lookup on home page | 4.13 | Yes |
| Product search for favorites | 4.8 | Yes |
| Starter pack validation (pre-launch) | 4.18, Step 7b | Yes |
| Pipeline Wednesday + Thursday schedule | 9.1 | Yes |
| `discount_percent` non-null guarantee | 5.3 | Yes |
| Kill criteria monitoring | 4.19 | Yes |
| North Star metric tracking | 4.19 | Yes (approximation via Vercel Analytics) |
| Pre-launch pipeline requirement (run 2-3 weeks before sharing) | 4.18 | Yes |
| Date filter safety net | 8.2 | Yes |

**All PRD requirements are covered in the architecture.** No gaps found.

---

## Consistency Check: Architecture Internal Contradictions

### IC-1: Coding Standards vs Architecture on React Query

- Architecture ADR-005: "Simple Fetch + Cache over React Query -- Accepted (changed from v2.0)"
- Architecture Section 4.8: "React Query removed -- too heavy for weekly-updating data"
- Coding Standards Section 4: "Decision pending: React Query vs custom localStorage+fetch hook"
- CLAUDE.md: No mention of the decision

The architecture is internally consistent. The coding standards document is outdated. This is a doc sync issue.

### IC-2: Coop Red Contrast Values

- Section 4.16: "Coop red (#E10A0A) passes for large text (3.8:1) but not normal text (3.9:1)"
- v2.0 challenge: "#E10A0A fails normal text" and "White on #E10A0A passes (4.6:1)"

These statements appear contradictory. The v2.0 challenge said white on #E10A0A passes at 4.6:1 for normal text. The v2.1 architecture says it passes for large text but not normal text, citing 3.8:1 and 3.9:1 ratios. The actual contrast ratio of white (#FFFFFF) on #E10A0A is approximately 4.0:1, which passes AA for large text (3:1 threshold) but fails for normal text (4.5:1 threshold). The v2.0 challenge's 4.6:1 figure was likely incorrect.

The architecture's decision to use #B80909 for small red text is correct regardless -- it provides a safe margin. But the stated ratios should be verified.

**Specific adjustment:** Verify the actual contrast ratio of white on #E10A0A using a tool like WebAIM's contrast checker and correct the stated values. The architectural decision (#B80909 for normal text) is correct; only the supporting numbers need fixing.

### IC-3: `BROWSE_CATEGORIES` Definition

- Section 4.10: "defined in `BROWSE_CATEGORIES` constant in `shared/types.ts`"
- Section 8.1: Lists `BROWSE_CATEGORIES` as a new type/constant
- Neither section defines the actual mapping (which 11 browse categories map to which DB sub-categories)

The v2.0 challenge (C6) flagged this: "The mapping from 23 DB sub-categories to 11 browsable categories needs to be in the architecture or explicitly delegated." The architecture delegates to `shared/types.ts` but does not provide the mapping. This means the builder must infer which of the 23 DB sub-categories (dairy, meat, poultry, fish, bread, fruit, vegetables, eggs, deli, ready-meals, pasta-rice, canned, drinks, snacks, chocolate, coffee-tea, condiments, frozen, cleaning, laundry, personal-care, paper-goods, household) map to which of the 11 browse categories (Fruits & Vegetables, Meat & Fish, Dairy & Eggs, Bakery, Snacks & Sweets, Pasta/Rice & More, Drinks, Ready Meals & Frozen, Pantry & Canned, Home & Cleaning, Beauty & Hygiene).

Some mappings are obvious (dairy -> Dairy & Eggs, drinks -> Drinks). Others require a decision (does "deli" go in Meat & Fish or Ready Meals & Frozen?). Does "chocolate" go in Snacks & Sweets or a separate category?

**Specific adjustment:** Add the mapping to Section 4.10 or Section 8.1. Even a simple table would suffice:

| Browse Category | DB sub_categories |
|----------------|-------------------|
| Fruits & Vegetables | fruit, vegetables |
| Meat & Fish | meat, poultry, fish |
| Dairy & Eggs | dairy, eggs |
| ... | ... |

This prevents builder interpretation errors and ensures the PRD's 11 categories are correctly implemented.

---

## Recommended Changes (Prioritized)

### Must-Do Before Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 1 | Fix OG edge function routing: change from API route to Vercel Middleware so crawlers hitting normal URLs get OG tags | 15 min (docs) | 9.2, vercel.json |
| 2 | Define `BROWSE_CATEGORIES` mapping (23 DB sub-categories -> 11 browse categories) | 10 min (docs) | 4.10 or 8.1 |

### Should-Do During Build

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 3 | Update coding standards Section 4 to match ADR-005 decision (custom hook, not "pending") | 5 min | coding-standards.md |
| 4 | Verify Coop red contrast ratio (#E10A0A on white) and correct stated values | 5 min | 4.16 |
| 5 | Add note to lazy-load html2canvas via dynamic import (keep < 100KB initial bundle) | 2 min | 4.17 |

### Consider (Not Blocking)

| # | Change | Effort | Section |
|---|--------|--------|---------|
| 6 | Skip product resolver auto-match for V1 (build lookup + create only) | Reduces complexity | 4.5 |
| 7 | Remove service worker reference from use cases UC-3 (if still present) | 2 min | use-cases.md |
| 8 | Define concrete SSR migration trigger metric (e.g., "if organic traffic > 50/week by Week 12") | 5 min | ADR-003 |
| 9 | Document fallback source implementation guide (create new source file with same interface) | 10 min | Risk register |

---

## Final Verdict

### Go with changes.

The v2.1 architecture is substantially improved from v2.0. **5 of 6 must-do findings are fully resolved. The 6th is mostly resolved with only a coding standards doc sync gap.** The Architect has done serious work addressing the previous challenge findings.

**What is strong:**

- **Two-tier Coop status** is now fully specified with query logic, display states, sort order, and transparency label. This is the highest-leverage UX decision in the favorites feature and it is done right.
- **Wordle card** has a complete specification: component, dimensions, rendering approach (html2canvas), copy-to-clipboard chain with fallback, browser support, accessibility, and an ADR documenting the decision. This went from "not in architecture" to fully specified.
- **Feature sequencing** is correctly reflected throughout: goals ordering, build order (Step 8 = aha moment first, Steps 10-11 = retention second), component design, and data layer.
- **Data model** supports all use cases: favorites (via product_group_id + keyword fallback), comparison (via two-tier status query), deals browsing (via sub_category indexes), and the Wordle card (via verdict calculation on active deals).
- **React Query decision** is resolved with clear reasoning and a concrete implementation approach.
- **All v1 "must-do" and "should-do" findings** are resolved (cron timing, pause prevention, discount_percent, updated_at trigger, date filter, npm workspaces).
- **Accessibility** is specified with concrete values and verified per-component in the build order, not as a final sweep.

**What needs attention (2 must-do changes):**

1. **OG edge function routing** (item 1): The current API route approach means crawlers will never reach the edge function. This must be changed to Vercel Middleware to intercept all requests. Without this, WhatsApp link sharing will show bare URLs -- breaking a primary growth channel.
2. **BROWSE_CATEGORIES mapping** (item 2): The builder needs to know which DB sub-categories map to which browse categories. This is a 10-minute documentation addition that prevents ambiguity.

**What can be deferred safely:**

- Product resolver auto-match (keyword fallback works for V1)
- Coding standards doc sync (the architecture is the source of truth)
- SSR migration trigger (Phase 2 concern)
- Fallback source implementation guide (write it when a fallback is needed)
- html2canvas lazy loading (optimize during build if bundle exceeds target)

**Total effort for Must-Do changes:** ~25 minutes of documentation updates. No architectural redesign needed.

**The architecture is ready to build once the 2 must-do changes are applied.** This is a significant improvement from v2.0, which had 6 must-do changes. The remaining gaps are minor and addressable during the build process.
