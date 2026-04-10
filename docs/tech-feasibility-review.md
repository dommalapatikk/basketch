# Tech Feasibility Review: Product Data Architecture

**Reviewer:** Tech Lead
**Date:** 10 April 2026
**Inputs:** Product Data Architecture proposal, Architecture Challenge, full codebase review
**Status:** Decision-ready

---

## 1. Effort Estimation (Honest, Not Optimistic)

The architect estimated 2-3 days. The challenger estimated 4-5 days. Having read every line of the codebase that will be touched, here is my task-level breakdown.

### Phase 1: Schema Migration

| Task | Hours | Notes |
|------|-------|-------|
| Write `products` table SQL | 0.5 | Straightforward CREATE TABLE |
| Write `product_groups` table SQL | 0.5 | Including CHECK constraint on slug format |
| Add `product_id` to `deals` | 0.25 | ALTER TABLE, nullable FK, index |
| Add `product_group_id` to `favorite_items` | 0.25 | ALTER TABLE, nullable FK |
| RLS policies for new tables | 0.5 | products: public read, service-role write. product_groups: public read |
| Test migration on Supabase | 0.5 | Run in SQL editor, verify no errors, check existing data unaffected |
| **Phase 1 total** | **2.5 hours** | |

The architect said 1 hour. That is too low -- RLS policies and testing the migration against the live instance take time. But this is still a half-day task.

### Phase 2: Pipeline Enrichment

| Task | Hours | Notes |
|------|-------|-------|
| **Brand extraction function** | 2 | Hardcode ~30 brands. Word-boundary matching (not `includes()`). Test against real product names. The "Emmi" vs "Emmental" problem alone needs 30 minutes of careful regex work. |
| **Quantity + unit extraction** | 4-6 | This is the riskiest task. German product names have: `ca. 350g`, `3.25% milch 1l`, `4x150g`, `2 für 1`, percentage-as-quantity traps, missing units. Writing the regex is 2 hours. Writing 20+ test cases is 2 hours. Debugging the edge cases those tests reveal is 1-2 more hours. |
| **Organic flag detection** | 0.5 | Simple keyword check. Low risk. |
| **Sub-category assignment** | 2 | Extend `CATEGORY_RULES` to include `subCategory`. The current rules have ~50 keywords across 2 categories. Adding sub-categories means splitting "fresh" into dairy/meat/poultry/bread/vegetables/etc. Each sub-category needs its own keyword list. This is tedious but not hard. |
| **ProductMetadata type definition** | 0.5 | Define the type, add to `shared/types.ts` |
| **Product resolution function** | 3-4 | `resolveProduct()` in `store.ts`: batch-fetch existing products for the store, match by `source_name`, create new products for unknowns, return `product_id` for each deal. Must handle: batch lookups (not one-per-deal), deduplication within a single run, error handling for partial failures. |
| **Integration into pipeline** | 2 | Wire `resolveProduct()` into `run.ts` between categorization and storage. Update `dealToRow()` to include `product_id`. Add resolution-rate logging. |
| **Seed product_groups** | 2 | Write INSERT statements for 37-60 groups. Each needs: slug, label, category, sub_category, search_keywords. Must verify the keywords actually match real deal data. |
| **Assign product_group to existing products** | 1-2 | After seeding groups, write UPDATE statements or a script to link products to groups. This requires looking at actual product names in the database. |
| **Testing the full pipeline** | 2-3 | Run the pipeline end-to-end. Check: products created correctly, product_ids set on deals, metadata extraction accuracy, product_group assignments. Fix the bugs that appear. |
| **Phase 2 total** | **19-25 hours (2.5-3.5 days)** | |

The architect said 1-2 days. That is significantly too low. The quantity extraction alone is a multi-hour task with real risk of edge-case bugs. The product resolution function is not trivial -- it is a new database interaction pattern with batch queries, upserts, and error handling.

### Phase 3: Matching Upgrade

| Task | Hours | Notes |
|------|-------|-------|
| New matching path in `matching.ts` | 2 | When `product_group_id` is set: query products in that group, find active deals for those products. The current `findBestMatch()` is 40 lines; the new path is simpler but still needs to handle "no deals in group this week" correctly. |
| Update `queries.ts` | 1.5 | New functions: `getDealsForProductGroup()`, `getProductGroups()`. Joins across `deals -> products -> product_groups`. |
| Update `hooks.ts` | 0.5 | New hook for product-group-based matching |
| Update starter pack seed data | 1 | Replace keyword/exclude/prefer with `productGroupId`. Update INSERT statements in SQL. |
| Update types | 0.5 | `StarterPackItem` and `FavoriteItemRow` get optional `productGroupId` |
| Test both matching paths | 2 | Verify: product-group path returns correct deals, keyword fallback still works for unmigrated favorites, no regressions in comparison view |
| **Phase 3 total** | **7.5 hours (~1 day)** | |

The architect said half a day. It is closer to a full day when you include testing both paths.

### Phase 4: Cleanup

| Task | Hours | Notes |
|------|-------|-------|
| Remove `excludeTerms`/`preferTerms` from starter packs | 1 | Update SQL seed data, update `StarterPackItem` type |
| Remove keyword matching path | 2 | Delete code from `matching.ts`, update `findBestMatch`, remove `isExcluded`/`isPreferred` exports, update tests |
| Remove `exclude_terms`/`prefer_terms` columns | 1 | ALTER TABLE, update `FavoriteItemRow` type, update `addFavoriteItem` queries |
| Backfill `product_id` on old deals (if wanted) | 1-2 | Script to match old deals to products by `(store, product_name)` |
| **Phase 4 total** | **5-6 hours (~1 day)** | |

The architect said "when convenient." The challenger correctly noted this is real work, not optional cleanup.

### Total Effort Summary

| Phase | Architect Estimate | Challenger Estimate | My Estimate |
|-------|-------------------|--------------------|----|
| Phase 1 | 1 hour | 1-2 hours | **2.5 hours** |
| Phase 2 | 1-2 days | 2-3 days | **2.5-3.5 days** |
| Phase 3 | 0.5 days | 0.5 days | **1 day** |
| Phase 4 | "when convenient" | 1 day | **1 day** |
| **Total** | **2-3 days** | **4-5 days** | **5-6 days** |

**Why my estimate is higher than both:** I am counting testing time at every phase, not just at the end. The architect's estimate assumes regex extraction "just works." The challenger correctly flagged this but still underestimated the product resolution function complexity. Neither estimate accounts for the time it takes to seed and verify 60 product groups against real deal data.

**Important context:** Claude Code writes all the code, but the user still needs to: run SQL migrations manually in Supabase dashboard, trigger pipeline runs to test, review output, make decisions on edge cases. Each of these handoffs adds elapsed time even if coding time is fast.

**Realistic calendar time:** 7-8 working sessions (assuming 2-3 hours per session), spread over 2-3 weeks.

---

## 2. Technical Risks

### Risk 1: German Product Name Regex

This is the highest-risk component. I reviewed the codebase for clues about what real product names look like. The starter packs reveal the naming patterns the system already struggles with:

**Evidence from the codebase:**

The `swiss-basics` starter pack has 8 exclude terms for "milch" alone: `schokolade, branche, kokos, glace, shake, dessert, pudding, caramel`. This tells us the current deal data contains products like:
- `milchschokolade lindor 100g` (chocolate, not milk)
- `milch branche duo 5er` (candy bar, not milk)
- `kokos milch drink 1l` (coconut milk, not cow milk)
- `milch shake erdbeere 500ml` (milkshake, not milk)

The quantity extraction regex must handle all of these correctly. Specific failure scenarios:

| Real-world pattern | Regex trap | Consequence |
|---|---|---|
| `m-budget milch 3.5% 1l` | `3.5` grabbed as quantity instead of `1` | Product gets quantity=3.5, unit=null. Unit price calculation breaks. |
| `pouletbrust ca. 350g` | `ca.` prefix | Works with simple regex but quantity is approximate. Fine for comparison but misleading for exact unit price. |
| `2 für 1 bio milch` | `2` grabbed as quantity | Product gets quantity=2, unit=null. Nonsensical. |
| `joghurt 4x150g` | Multi-pack format | If flattened to 600g, unit price comparison against a single 150g yogurt is misleading. If kept as `4x150g`, the quantity field cannot be a simple number. |
| `coca-cola 6x500ml` | `6x500ml` = 3000ml = 3l | Is this a 3L product or a 6-pack? The user thinks in packs, not total volume. |
| `bio eier 6 stück` | `6` is a count, not a weight | Works with regex if `stück` is in the unit list. But the word might appear as `stk`, `stk.`, `stück`, or `stueck`. |
| `waschmittel 2.376kg` | 4-digit decimal | Regex works, but is this really a single product or a warehouse-size pack? No way to validate without context. |
| `brot` | No quantity at all | `quantity=null, unit=null`. This is correct and must be handled gracefully -- no unit price display, matching by name only. |

**My assessment:** The regex will work correctly for ~70-80% of product names on the first attempt. The remaining 20-30% will need iterative debugging over 2-3 pipeline runs. This is manageable but the estimate must account for it.

### Risk 2: Supabase Free Tier Constraints

I examined the pipeline's current database interaction pattern in `store.ts`:

- Current: ~600 deal upserts per run, batched in groups of 100. That is 6 Supabase API calls.
- Proposed addition: product resolution requires looking up existing products and creating new ones.

**Batch lookup approach (as the challenger recommended):**
1. `SELECT * FROM products WHERE store = 'migros'` -- one query, returns all Migros products
2. Match deals to products in memory
3. Batch-insert new products (one upsert call per 100 new products)
4. Continue with deal upserts as before

At steady state (most products already exist), this adds ~2-3 API calls per pipeline run. Well within free tier limits.

**Potential issue:** The first run after Phase 2 deploys will create ~300-400 new product rows (one for each unique product name). That is 3-4 batch inserts. Still fine.

**Supabase free tier limits that matter:**
- 500 MB database storage: Current deals table is small (~600 rows/week, auto-deactivated). Products table will grow to ~2,000 rows over months. Total storage well under 10 MB. No concern.
- API rate limit (500 req/s): Pipeline makes 6-10 calls total. No concern.
- No row limits on tables: Confirmed -- Supabase free tier does not cap row count.
- Connection limits (60 connections): Pipeline uses 1 connection. Frontend reads are stateless via REST API. No concern.

**Verdict:** Supabase free tier is not a constraint for this feature at any foreseeable scale.

### Risk 3: Pipeline Reliability

The current pipeline in `run.ts` has a clear failure model:
- Read JSON files from disk (Migros + Coop fetchers write these as CI artifacts)
- Categorize all deals
- Upsert to Supabase
- Log the run

The proposal adds a new step: **resolve product** between categorize and upsert.

**What happens if `resolveProduct()` fails halfway?**

Scenario: The pipeline processes 600 deals. Product resolution succeeds for the first 300, then Supabase returns an error (timeout, rate limit, transient network issue). The remaining 300 deals get `product_id = NULL`.

**Current safety net:** The pipeline already handles partial failures -- `storeDeals()` logs batch errors and continues. Deals with `product_id = NULL` still get stored with all other fields intact. The frontend falls back to keyword matching for those deals. No data loss, no user-visible breakage.

**Silent failure risk:** If `resolveProduct()` returns `null` for every deal (bug in the resolution logic), all 600 deals get `product_id = NULL`. The pipeline "succeeds" but the product system adds no value. The challenger's recommendation to log the resolution rate (and warn if below 80%) is the correct mitigation. This is 3 lines of code.

**Verdict:** The pipeline's existing error handling makes this low-risk. The product resolution step is additive -- failure degrades gracefully to the current behavior.

### Risk 4: Migration Safety

**Phase 1 SQL on a live Supabase instance:**

The Phase 1 migration consists of:
1. `CREATE TABLE products (...)` -- new table, no impact on existing tables
2. `CREATE TABLE product_groups (...)` -- new table, no impact
3. `ALTER TABLE deals ADD COLUMN product_id UUID REFERENCES products(id)` -- adds a nullable column
4. `ALTER TABLE favorite_items ADD COLUMN product_group_id TEXT REFERENCES product_groups(id)` -- adds a nullable column
5. Index creation on new columns

**Assessment:**
- `CREATE TABLE` is always safe. No locks on existing tables.
- `ALTER TABLE ... ADD COLUMN` with a nullable column and no default is a metadata-only operation in PostgreSQL. It does not rewrite the table. It acquires a brief `ACCESS EXCLUSIVE` lock (milliseconds). At 600 rows, this is instantaneous.
- `CREATE INDEX` on a new nullable column with a WHERE clause is fast and non-blocking at this table size.
- Foreign key constraints reference new tables only, not existing data. No validation scan needed.

**Verdict:** Phase 1 can run on the live instance with zero downtime. The deals table has ~600 rows. Even the slowest possible migration would take under a second.

---

## 3. What Can Go Wrong (Top 5)

### 1. Quantity Extraction Produces Wrong Values on Real Data

**Likelihood: HIGH** -- German product names are messy. The regex will misfire on fat percentages, deal multipliers, and multi-pack formats.

**Impact: MEDIUM** -- Wrong quantities mean wrong unit prices on the frontend. Users see "CHF 45.00/L" for a yogurt. Trust is damaged but no data is lost.

**Mitigation:**
- Write 20+ test cases BEFORE writing the regex (the challenger's P0 recommendation)
- Add validation rules: if quantity > 50 and unit is `l`, reject. If quantity exists but unit is null, set both to null.
- Run the pipeline once, export the products table, manually review 50 rows for correctness before shipping to frontend.
- Accept that ~15% of products will have `quantity=null` and handle this gracefully in the UI (no unit price shown).

### 2. Product Groups Cover Too Few Products

**Likelihood: HIGH** -- The 37 groups from starter packs cover the starter packs, but not common Swiss items like Hackfleisch, Lachs, Bananen, Gurken, Mehl, Zucker, Birchermuesli, Rahm, etc.

**Impact: MEDIUM** -- Users who add custom favorites outside the starter packs get keyword-matching fallback, which is the current (working) experience. They do not get worse results, but they do not get better results either. The value of the product architecture is reduced.

**Mitigation:**
- Seed 60-80 groups instead of 37. Budget an extra hour for this during Phase 2.
- Log when favorites fall back to keyword matching. After 4 weeks, add groups for the most common unmatched keywords.
- Keep the keyword fallback path working and tested.

### 3. Product Resolution Creates Duplicate Products When Source Names Change

**Likelihood: MEDIUM** -- If Migros changes a product name from "bio vollmilch 1l" to "bio vollmilch 1 liter", a new product row is created. The old product row is orphaned.

**Impact: LOW** -- Orphaned products waste no storage (rows are tiny) and cause no user-visible issues. Deals reference the correct (new) product. The old product simply has no new deals.

**Mitigation:**
- Accept this as a known limitation.
- In Phase 4, add a periodic cleanup: mark products with no deals in the last 30 days as inactive.

### 4. Dual Matching Paths Create Subtle Bugs

**Likelihood: MEDIUM** -- Phase 3 introduces two matching paths: product-group and keyword. A favorite item could theoretically have both `product_group_id` and `keyword` set. Which path wins? What if the product-group path returns no deals but keyword would have found one?

**Impact: HIGH** -- Users see different results depending on which path their favorite uses, with no visible indication of why. Debugging is hard because the same favorite behaves differently depending on its creation date.

**Mitigation:**
- Define the rule explicitly: if `product_group_id` is set, use product-group matching ONLY. Never fall back to keyword for the same item.
- If the product-group path returns no deals, show "no deals this week" -- which is the honest answer.
- Plan Phase 4 (remove keyword path) for 4 weeks after Phase 3, not "when convenient."

### 5. The Whole Feature Takes Longer Than Expected and Stalls

**Likelihood: MEDIUM** -- At 5-6 days of work across multiple sessions, there is a real risk of losing momentum. Phase 2 is the largest and hardest phase. If it gets stuck on regex edge cases or product resolution bugs, the project could stall with a half-implemented architecture.

**Impact: HIGH** -- A half-implemented product system is worse than no product system. Tables exist but are not populated. Code has two paths but neither works well. Technical debt increases.

**Mitigation:**
- Build Phase 2 in smaller increments: (a) brand + organic extraction first, (b) quantity extraction second, (c) product resolution third.
- After each increment, run the pipeline and verify output before moving on.
- If Phase 2 takes more than 4 days of actual work, stop and ship what works. Phase 1 + partial Phase 2 (brand + organic only, no quantity parsing) is still useful and non-breaking.

---

## 4. Simplification Opportunities

### Over-Engineered for a Portfolio Project

**1. Quantity + unit parsing is the highest-effort, lowest-reward component.**

The main value of the product architecture is: stable product identity + cross-store matching. You get 90% of that value from:
- `products` table with `canonical_name`, `brand`, `is_organic`, `category`, `sub_category`
- `product_groups` for cross-store linking
- `product_id` on deals for stable identity

Quantity and unit parsing adds unit price comparison ("CHF 1.60/L"). That is nice to have but not required for the core value proposition (which of MY items is on sale where). The PRD does not list unit price comparison as a requirement.

**Recommendation: Defer quantity/unit extraction to a later sprint.** This saves 4-6 hours of the riskiest work and eliminates the biggest source of potential bugs. Add it when a user actually asks "which milk is cheapest per litre?"

**2. The `product_groups` table could be simpler.**

The proposed `product_groups` table has `search_keywords TEXT[]`. But if product groups are assigned manually during pipeline seeding (not searched dynamically), the `search_keywords` column is unused in the MVP. It becomes relevant only if/when you build an "auto-suggest product group" feature.

**Recommendation: Keep `search_keywords` in the schema (it costs nothing) but do not build any code that uses it in Phase 2-3.** Assign product groups manually by updating the `product_group` column on `products` rows directly.

**3. The multi-pack canonical form debate is unnecessary for MVP.**

The challenger spent significant analysis on "6x50g" -- should it be 300g total or stored as pack_size + unit_quantity? For a portfolio project with 37-60 product groups, the answer is: store whatever the product name says, do not try to normalize multi-packs. If "6x50g" appears in the name, `quantity = null, unit = null` is fine. The product group still handles matching correctly.

### Phases That Can Be Combined

**Phase 1 and the non-extraction parts of Phase 2 can run together.** The SQL migration, type definitions, and product_groups seed data are all database/schema work. Do them in one session.

**Phase 3 can be smaller.** If you defer quantity/unit extraction, the frontend upgrade is simpler -- no unit price display, just brand badges and organic flags. The matching swap is unchanged.

### Minimum Viable Version

The absolute minimum that delivers value:

1. `products` table (canonical_name, brand, is_organic, store, category, sub_category, product_group, source_name)
2. `product_groups` table (id, label, category, sub_category)
3. Pipeline extracts brand + organic flag only (no quantity/unit)
4. Pipeline creates product rows, sets `product_id` on deals
5. 60 product groups seeded manually
6. Matching by product_group replaces keyword matching for starter pack favorites

This is ~60-70% of the proposal's scope but captures ~90% of its value. Estimated effort: **3-4 days.**

---

## 5. Build Order Recommendation

### Optimal Build Sequence

**Session 1: Schema + Seed Data (half day)**
1. Write and run Phase 1 SQL migration
2. Define `ProductMetadata` type in `shared/types.ts`
3. Seed 60 product groups in `product_groups` table
4. Verify: tables exist, constraints work, existing app unaffected

**Why first:** This is zero-risk, non-breaking, and validates the data model before writing any pipeline code. If the schema feels wrong after seeing it in Supabase, you can adjust before any code depends on it.

**Session 2: Brand + Organic Extraction (half day)**
1. Write `extractBrand()` with known brand list and word-boundary matching
2. Write `isOrganic()` keyword check
3. Write 10 test cases for brand extraction
4. Integrate into pipeline normalization step

**Why second:** These are the simplest extraction functions. They validate the "extract metadata from product names" approach with low risk. If brand extraction works well, proceed to quantity. If it is harder than expected, you have early warning.

**Session 3: Sub-Category Assignment (half day)**
1. Extend `CATEGORY_RULES` with `subCategory` field
2. Update `categorizeDeal()` to return `sub_category`
3. Write tests for sub-category assignment

**Why third:** This builds on the existing categorizer code. Low risk, immediate value (deals get sub-categories for filtering).

**Session 4: Product Resolution (1 day)**
1. Write `resolveProduct()` function with batch lookups
2. Wire into `run.ts` pipeline
3. Add resolution-rate logging
4. Run pipeline end-to-end, verify products table is populated correctly
5. Manually review 50 product rows for correctness

**Why fourth:** This is the core infrastructure change. By this point, you have schema, seed data, and extraction functions ready. This session ties them together.

**Session 5: Product Group Assignment (half day)**
1. Export products table from Supabase
2. Write UPDATE queries to assign `product_group` to products matching each group
3. Verify: each group has Migros + Coop products linked
4. Handle products that do not match any group (expected -- leave as null)

**Why fifth:** This requires real deal data in the products table, which only exists after Session 4.

**Session 6: Matching Upgrade (1 day)**
1. Add product-group matching path to `matching.ts`
2. Update `queries.ts` with new query functions
3. Update starter pack seed data with `productGroupId`
4. Test both matching paths
5. Verify frontend displays correctly

**Why last:** This is the user-facing change. By this point, all backend infrastructure is tested and verified.

### What to Defer

- **Quantity/unit extraction:** Defer to Sprint 2. Add it when the core product architecture is working.
- **Phase 4 cleanup (remove keyword path):** Defer 4 weeks after Session 6. Remove the keyword path once product groups cover 90%+ of favorites.
- **Automated product group suggestion:** Future enhancement. Not needed at 60 groups.
- **Price history tracking:** Out of scope per PRD. The `products` table enables it, but building the UI is a separate feature.
- **Backfilling old deals:** Only needed for price history. Defer until/unless price history is built.

---

## 6. Go/No-Go Recommendation

### Recommendation: GO, with Simplifications

**Proceed with the product data architecture, but defer quantity/unit extraction to a later sprint.**

**Why go:**
- The core problem is real: keyword matching with 8 exclude terms per item is fragile, unmaintainable, and already at its limits. The starter pack data proves this -- the system needs a better approach.
- The solution is sound: separate products table, manual product groups, phased migration. The architecture review confirmed this with no rejections.
- The risk is manageable: the biggest risk (regex edge cases) is reduced by deferring quantity extraction. The remaining risks (brand extraction, product resolution, matching swap) are standard engineering work.
- The effort is reasonable: 3-4 days for the simplified version, spread over 5-6 sessions. This is one sprint for a side project.

**Why not "no-go":**
- The current system works. Users can find deals today. The product architecture is an improvement, not a fix for something broken.
- But: the current matching code is at maximum complexity. Adding any new feature (price history, better filtering, new product types) will be harder without product identity. The cost of NOT building this grows every sprint.

**Why not "proceed as proposed":**
- The full proposal (with quantity/unit extraction) is 5-6 days with the highest-risk component included from day one. Deferring quantity extraction cuts the riskiest 4-6 hours and lets you validate the architecture before committing to the hardest part.

**Conditions for go:**
1. Write regex test cases before extraction code (challenger's P0)
2. Seed 60+ product groups, not 37 (challenger's P2)
3. Define explicit fallback rules for dual matching paths (challenger's P0)
4. Add resolution-rate logging to pipeline (challenger's P1)
5. Plan Phase 4 for 4 weeks after Phase 3, not "when convenient"
6. Defer quantity/unit extraction to Sprint 2

**One-line summary:** Build the product identity infrastructure now (products table, product groups, brand + organic extraction, matching upgrade). Add unit price comparison later when the foundation is proven.
