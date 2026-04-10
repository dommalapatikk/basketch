# Architecture Challenge: Product Data Architecture

**Reviewer:** Architecture Review Engineer
**Date:** 10 April 2026
**Document under review:** `docs/product-data-architecture.md`
**Context:** PRD v1.0, Technical Architecture v1.1, current codebase (`shared/types.ts`, `shared/supabase-setup.sql`, `shared/category-rules.ts`, `web/src/lib/matching.ts`, `pipeline/store.ts`, `pipeline/run.ts`, `pipeline/categorize.ts`)

---

## Summary

| Verdict | Count |
|---------|-------|
| **Confirmed** | 3 |
| **Adjust** | 3 |
| **Weakened** | 1 |
| **Rejected** | 0 |

The proposal is fundamentally sound. It correctly identifies the real problems (no product identity, fragile keyword matching, no structured metadata) and proposes a reasonable solution. Most decisions hold up under scrutiny. The main risks are in the details: regex extraction reliability for German product names, the coverage gap when users search beyond the 37 product groups, and an optimistic effort estimate.

No decisions are rejected. Nothing here is wrong enough to send back to the drawing board.

---

## 1. Separate Products Table vs. Metadata Columns on Deals

**Verdict: Confirmed**

The proposal argues that a product exists independently of a deal, and that duplicating brand/quantity/unit across every weekly deal row is wasteful and prevents stable product identity.

This is correct. The alternative (metadata columns on `deals`) was considered and rightly rejected. Here is why:

- **Price history requires a stable identity.** If you want to know "was this milk cheaper last week?" you need a `product_id` that connects deal rows across weeks. Metadata columns on `deals` cannot do this -- you would need to match on `(store, product_name)`, which is exactly the fragile approach the proposal is trying to replace.
- **Cross-store matching requires a grouping entity.** "Migros Bio Vollmilch 1L" and "Coop Naturaplan Bio Milch 1 Liter" need to be linked somewhere. A `product_group` column on `deals` without a reference table would be an unvalidated free-text field -- worse than a dedicated table.
- **The extra join is trivial.** One `JOIN products ON deals.product_id = products.id` adds negligible overhead for 600 rows. At 2,000 rows it is still irrelevant.

The only concern is complexity for a side project. But the products table is simple (one lookup per deal during pipeline, one join per query on frontend). This is not over-engineering -- it is the correct level of data modelling for the stated problem.

**Pre-mortem check:** "It's 3 months from now and this failed because..." -- the products table became a maintenance burden nobody updates. Mitigated by the fact that products are auto-created during pipeline runs, not manually maintained.

---

## 2. Manual Product Groups (37 Groups Covering 600 Deals)

**Verdict: Adjust**

The proposal defines 37 product groups based on the starter pack items and argues that manual curation is faster and more reliable than automated matching at this scale. The reasoning for rejecting fuzzy matching and LLM-based matching is solid.

However, there is a coverage gap the proposal acknowledges but does not adequately address:

**What happens when a user searches for a product outside the 37 groups?**

The proposal says: "they still fall back to keyword matching." But this creates a permanent two-tier system where starter pack products get clean matching and everything else gets the old fragile path. The user does not know which tier they are on.

Concrete scenario: User adds "Hackfleisch" (minced meat) to favorites. No product group exists for it. The keyword path kicks in, with all its compound-word problems. The user gets a worse experience for a perfectly normal Swiss grocery item.

**Required adjustment:**

1. **Track unmatched favorites.** When a favorite item falls back to keyword matching, log it. After 4 weeks, you have data on which product groups are missing.
2. **Plan for growth to ~60-80 groups.** The 37 starter pack groups cover the starter packs but not the full range of items users will search for. Budget 30 minutes to seed 20-30 more groups based on common Swiss grocery items (Hackfleisch, Lachs, Bananen, Gurken, Mehl, Zucker, etc.) during Phase 2.
3. **Make the "add product group" workflow trivial.** Document a 2-minute process: insert one row into `product_groups`, assign `product_group` on the relevant `products` rows. If this takes more than 5 minutes, it will not happen.

The manual approach is right for now. But 37 is too few. Budget for 60-80 and build the logging to know when you need more.

**Pre-mortem check:** "It's 3 months from now and this failed because..." -- users searched for items outside the 37 groups, got bad matches, and lost trust. The fix is cheap (more seed data + logging) but must be planned.

---

## 3. Pipeline-Time Metadata Extraction (Regex for German Product Names)

**Verdict: Adjust**

The proposal uses regex to extract brand, quantity, unit, and organic flag from product names. The patterns are reasonable for the examples given. But German grocery product names are messy, and the proposal does not address several real edge cases.

### Brand extraction: Mostly fine

The hardcoded brand list is a good approach. Known brands like "M-Budget", "Naturaplan", "Prix Garantie" are distinctive strings that regex handles well. The risk is low here -- if a brand is not in the list, the field is `null`, which is an acceptable graceful degradation.

**One gap:** The proposal says "check if the normalized product name starts with or contains any known brand." The word "contains" is dangerous. "Emmi" is a brand, but "Emmental" is a cheese. "Coop" is a brand, but "Coop" also appears in product names as a store prefix on aktionis.ch data. The extraction logic needs word-boundary awareness, not just `includes()`.

### Quantity + unit: This is where it gets tricky

The regex `(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)` works for "bio vollmilch 1l" but will struggle with:

| Product name | Expected | Problem |
|---|---|---|
| "pouletbrust ca. 350g" | 350g | The `ca.` (circa/approximate) prefix is common in Swiss meat products. Regex works but the quantity is approximate, not exact. |
| "2 für 1 aktion milch" | No quantity | The "2" is a deal multiplier, not a product quantity. Regex would extract `quantity=2, unit=null` or misfire. |
| "3.25% milch 1l" | 1l | The "3.25" is fat percentage, not quantity. Regex might grab `3.25` before reaching `1l`. |
| "6x50g riegel" | 300g or 6x50g | Proposal mentions this case but does not define which representation is canonical. |
| "brot 400g" vs "brot" | 400g vs null | No quantity for generic bread. This is fine, but the matching logic needs to handle `null` quantity gracefully. |

**Required adjustment:**

1. **Parse left-to-right, take the LAST quantity+unit pair.** "3.25% milch 1l" should extract `1l`, not `3.25`. A simple heuristic: quantity is only valid if immediately followed by a unit string.
2. **Ignore quantities that appear before "für" or "x" in deal-multiplier patterns** (e.g., "2 für 1", "3 für 2").
3. **For "ca." quantities, store them but flag them as approximate.** Or just store them -- approximate is better than nothing for comparison purposes.
4. **Define multi-pack canonical form.** Recommendation: store `pack_size` (e.g., 6) and `unit_quantity` (e.g., 50g) separately, with `total_quantity` as computed. Do not try to flatten "6x50g" into "300g" -- users think in pack sizes, not totals.
5. **Write 15-20 test cases covering these edge cases before writing the regex.** The test cases ARE the specification. Without them, the regex will be wrong and nobody will know until a user reports a bad match.

### Organic flag: Fine

Checking for "bio", "naturaplan", "demeter", "knospe" is straightforward and unlikely to produce false positives in a grocery context. Confirmed as-is.

**Pre-mortem check:** "It's 3 months from now and this failed because..." -- the regex worked for the 10 examples in the proposal but broke on 15% of real product names, producing wrong quantities that corrupted unit price comparisons. Users saw "CHF 45.00/L" for a yogurt because the regex grabbed a percentage instead of a volume. The fix is test cases.

---

## 4. 4-Phase Migration (Non-Breaking Claim)

**Verdict: Adjust**

The phased approach is correct in principle. Phase 1 (schema only) and Phase 2 (pipeline enrichment) are genuinely non-breaking. Phase 3 (matching swap) is where risks appear.

### Phase 1: Confirmed non-breaking

Adding nullable columns and new tables with no code changes is textbook safe migration. No concerns.

### Phase 2: Mostly non-breaking, one risk

The proposal says "old deals keep `product_id = NULL` (fine -- they'll expire naturally within a week)." This is correct IF the pipeline runs successfully. But what if Phase 2 deploys on Wednesday, the pipeline runs, and the new product resolution step has a bug? The pipeline could:

- Fail entirely (handled -- pipeline already exits on zero deals stored).
- Succeed but set `product_id = NULL` on all new deals (silent failure -- no error, just missing data).

**Mitigation needed:** Add a pipeline log line that reports how many deals got a `product_id` vs how many got `NULL`. If the ratio is below 80%, log a warning. This is 3 lines of code but prevents silent failures.

### Phase 3: Risk of dual-path bugs

The proposal maintains two matching paths: product_group (new) and keyword (old fallback). Dual paths are a known source of subtle bugs:

- A favorite with `product_group_id` set but the product group has no active deals falls through to... what? The proposal does not specify. Does it return "no deals" or fall back to keyword?
- The frontend now needs to handle both response shapes (deal matched by group vs deal matched by keyword). Are the display components aware of which path was used?

**Mitigation needed:** Define the fallback explicitly. Recommendation: if `product_group_id` is set, match by group ONLY. Do not fall back to keyword for a product-group favorite. If there are no deals in the group, show "no deals this week" -- which is the correct answer. Mixing paths for the same favorite item creates confusion.

### Phase 4: Not actually optional

The proposal marks Phase 4 as "optional" and "when convenient." But leaving two matching paths permanently is technical debt that will bite. Phase 4 should have a target date (e.g., "4 weeks after Phase 3 launches, remove keyword path if product groups cover 90%+ of favorites").

**Pre-mortem check:** "It's 3 months from now and this failed because..." -- Phase 3 shipped but Phase 4 never happened. Two matching paths coexist forever, bugs appear in one but not the other, debugging takes twice as long.

---

## 5. UnifiedDeal Stays Unchanged (Python/TS Contract Stability)

**Verdict: Confirmed**

The proposal keeps `UnifiedDeal` as-is and extracts metadata in the TypeScript pipeline after receiving the unified data. This is the right call for three reasons:

1. **The Coop scraper is Python.** Changing `UnifiedDeal` means changing the Python output format, which means touching the Python scraper, which means testing the scraper, which means running it against aktionis.ch, which is a separate deployment concern. Keeping the contract stable avoids this cascade.
2. **Separation of concerns is correct.** `UnifiedDeal` represents "what the source provides." Metadata extraction is "what the pipeline enriches." These are different responsibilities and should be different types.
3. **The metadata can be wrong.** If brand extraction fails for a product, the deal still gets stored with the original `product_name`. If metadata extraction were baked into `UnifiedDeal`, a regex failure could prevent a deal from being stored at all.

The only cost is that the TypeScript side does redundant work (the Coop scraper already has the product name, and then TypeScript re-parses it). But at 600 deals per week, this redundancy costs milliseconds.

**One observation:** The proposal introduces metadata as a separate type passed alongside `UnifiedDeal`, but does not define what that type looks like. This should be specified in Phase 2 -- even a sketch like `ProductMetadata { brand: string | null, quantity: number | null, unit: string | null, isOrganic: boolean }` would prevent ambiguity during implementation.

---

## 6. Flat Sub-Categories

**Verdict: Confirmed**

The proposal uses ~20 flat sub-categories (dairy, meat, bread, snacks, etc.) instead of a hierarchy. This is correct for the stated requirements.

The PRD describes three use cases for categories:
1. **Weekly verdict** -- "Migros wins for Fresh, Coop wins for Household." This uses the 3 top-level categories only.
2. **Category filtering** -- "Show me all dairy deals." This requires sub-categories, but only one level deep.
3. **Product group matching** -- "milk-whole-1l" belongs to "dairy." This is a lookup, not a tree traversal.

None of these require hierarchy. A flat sub-category is sufficient.

The risk would be if the PRD later required "show me all milk products" as distinct from "show me all dairy products." But "milk" would be a product group, not a sub-sub-category. The product groups table already handles this level of specificity.

**Pre-mortem check:** "Is this actually a problem for 10-50 users?" No. Hierarchical taxonomies solve problems at 10,000+ SKU scale. At 600 deals, flat is correct.

---

## 7. product_group as TEXT PK vs UUID

**Verdict: Weakened**

The proposal uses `TEXT PRIMARY KEY` for `product_groups.id` with human-readable slugs like "milk-whole-1l" and "butter-250g". The reasoning (implicit in the design) is that readable PKs make debugging and seed data easier.

This is defensible but has a real cost:

### Arguments for TEXT PK (as proposed)
- Readable in logs, SQL queries, and seed data.
- Self-documenting -- "milk-whole-1l" tells you what the group is without a join.
- Fewer joins when debugging (you can read the FK value directly on `products.product_group` and `favorite_items.product_group_id`).

### Arguments against TEXT PK
- **Renaming is expensive.** If "milk-whole-1l" should actually be "milk-whole-1l-organic" (because you realise the group only contains organic milk), you need to update `product_groups.id`, every `products.product_group`, and every `favorite_items.product_group_id`. With UUID, you rename the `label` column and nothing else changes.
- **Inconsistency risk.** The slug format is not enforced by a CHECK constraint. Someone could insert "Milk Whole 1L" or "milk_whole_1l" and the system would not complain. Unlike UUIDs, text PKs require convention discipline.
- **Index size.** TEXT indexes are larger than UUID indexes. At 37 rows this does not matter. At 200 rows it still does not matter. But it is a real trade-off that should be acknowledged.
- **Collision with product evolution.** "butter-250g" assumes butter always comes in 250g. If Migros starts putting 200g butter on sale, do you create "butter-200g" or expand "butter-250g" to include it? The slug name bakes assumptions into the PK.

### Verdict: Weakened

The readable-slug approach is convenient for early development but creates a rigidity problem. The proposal should either:

**Option A (recommended):** Keep TEXT PK but add a `CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` constraint to enforce slug format, and document that the `id` is immutable once created. Renaming means creating a new group and migrating references.

**Option B:** Switch to UUID PK with a `slug TEXT UNIQUE NOT NULL` column for the human-readable identifier. The slug can be renamed without touching any FK. This is slightly more work but more correct.

For a 37-row reference table on a side project, Option A is probably sufficient. But the proposal should explicitly state "product group IDs are immutable" so that the builder does not accidentally create a rename workflow that breaks FKs.

---

## 8. Missing Failure Modes

### What if metadata extraction is wrong?

The proposal does not address this. If the regex extracts `quantity=3.25, unit=null` from "3.25% milch 1l" (grabbing fat percentage instead of volume), the product row has wrong metadata. This affects:

- **Unit price display.** The frontend could show absurd prices like "CHF 0.49/3.25" instead of "CHF 0.49/L".
- **Product group matching.** If automated matching (Step 4, future) uses quantity+unit, wrong metadata means wrong groups.

**Mitigation:** Validate extracted metadata before storing. Simple rules:
- If `quantity > 100` and `unit = 'l'`, something is wrong (no grocery product is 100+ litres).
- If `quantity > 50` and `unit = 'kg'`, something is wrong.
- If extraction produces a quantity but no unit (or vice versa), set both to `null` rather than storing partial data.
- Log extraction failures so they can be reviewed.

### What if a product's source_name changes?

The unique constraint on `products` is `(store, source_name)`. If Migros changes the API output from "bio vollmilch 1l" to "bio vollmilch 1 liter", the system creates a new product row. The old product row becomes orphaned (no new deals reference it). This is not catastrophic but creates duplicates over time.

**Mitigation:** Accept this as a known limitation. Periodically review products with no deals in the last 4 weeks and mark them inactive. This is a Phase 4 concern.

### What if the pipeline runs but product resolution fails silently?

As noted in the Phase 2 section: if `resolveProduct()` returns `null` for every deal, all deals get `product_id = NULL`. The pipeline succeeds (deals are stored) but the new product system adds no value.

**Mitigation:** Log the product resolution rate. Alert if below 80%.

---

## 9. Scale Concerns (520 to 2,000 Deals)

The proposal handles 520-600 deals per week currently. If Coop or Migros expand their promotions (or a third retailer is added), deal count could reach 2,000.

### Database

- **Products table growth:** ~2,000 unique products accumulate over a few months as different items go on sale. With the `(store, source_name)` unique constraint, each source-name variant creates one row. This is well within Supabase free tier (500MB storage, no row limit on tables).
- **Indexes:** The proposed indexes (`idx_products_group`, `idx_products_category`, `idx_products_store`) are appropriate. At 2,000 products with 3 indexes, index size is trivial.
- **Query complexity:** The join `deals JOIN products` at 2,000 deals is negligible. PostgreSQL handles this without thinking.

### Pipeline

- **Product resolution:** One lookup per deal (`SELECT id FROM products WHERE store = $1 AND source_name = $2`). At 2,000 deals, this is 2,000 single-row lookups. On Supabase free tier, this could take 10-20 seconds (network round trips). Consider batching: fetch all existing products for a store in one query, then match in memory.
- **Metadata extraction:** Regex on 2,000 strings is instant (< 100ms). No concern.

### Supabase Free Tier

- **API requests:** The pipeline makes ~2,000 individual product lookups + ~2,000 deal upserts per run. Supabase free tier allows unlimited API requests but rate-limits at ~500 requests/second. The pipeline already batches deal upserts in groups of 100. Product lookups should be batched similarly.
- **Database size:** 2,000 deals/week x 52 weeks x ~1KB/row = ~100MB/year for deals. Products add ~500KB. Total is well under the 500MB free tier limit.
- **Connections:** Pipeline uses a single Supabase client. Frontend reads are stateless. No connection pooling concern at this scale.

**Verdict:** Scale is not a concern for the foreseeable future. The one adjustment: batch product lookups instead of doing them one at a time.

---

## 10. Effort Estimate Review (2-3 Days Claimed)

| Phase | Claimed | Realistic | Why |
|---|---|---|---|
| Phase 1: SQL migration | 1 hour | 1-2 hours | Accurate. Create tables, add columns, run migration. Might need a second pass after testing. |
| Phase 2: Pipeline enrichment | 1-2 days | 2-3 days | **Underestimated.** The regex extraction needs 15-20 test cases for German edge cases. The product resolution step needs batched lookups. Seeding 37 product groups needs manual verification against real deal data. The proposal assumes the extraction logic is simple, but German product names are messy. |
| Phase 3: Matching upgrade | Half a day | Half a day | Accurate. The new matching path is simpler than the old one. |
| Phase 4: Cleanup | "When convenient" | 1 day (when done) | Undercounted. Removing the keyword path touches matching.ts, starter pack types, seed data, and potentially frontend components that display exclude/prefer terms. |

**Total realistic estimate:** 4-5 days, not 2-3. The gap is mostly in Phase 2 (regex edge cases and testing) and the fact that Phase 4 is real work, not optional cleanup.

This is not a reason to reject the proposal. But the builder should know that "extend normalizers (~50 lines each)" undersells the effort when those 50 lines need to handle `ca.`, `x`, `%`, multi-packs, and missing units correctly.

---

## 11. Recommended Changes (Prioritised)

| Priority | Change | Effort | Impact |
|---|---|---|---|
| **P0** | Write 15-20 regex test cases for German product names BEFORE writing extraction code (Section 3) | 1 hour | Prevents the single biggest risk: wrong metadata |
| **P0** | Define fallback behaviour explicitly: product-group favorites do NOT fall back to keyword (Section 4) | 10 min (decision) | Prevents dual-path bugs |
| **P1** | Batch product lookups in pipeline instead of one-per-deal (Section 9) | 30 min | Prevents timeout on Supabase free tier at scale |
| **P1** | Add product resolution rate logging to pipeline (Section 4, 8) | 15 min | Prevents silent failures |
| **P1** | Add CHECK constraint on product_groups.id to enforce slug format (Section 7) | 5 min | Prevents inconsistent PKs |
| **P2** | Seed 20-30 additional product groups beyond the starter pack 37 (Section 2) | 30 min | Reduces fallback-to-keyword rate |
| **P2** | Log when favorites fall back to keyword matching (Section 2) | 15 min | Provides data for future group additions |
| **P2** | Add metadata validation rules (quantity bounds, unit presence) (Section 8) | 30 min | Prevents absurd unit prices on frontend |
| **P3** | Set a target date for Phase 4 (remove keyword path) (Section 4) | 5 min (decision) | Prevents permanent dual-path debt |
| **P3** | Define the `ProductMetadata` type shape in the proposal (Section 5) | 10 min | Prevents ambiguity during implementation |

---

## 12. Final Verdict

**Go with changes.**

The product data architecture is well-reasoned and addresses real problems in the current system. The separate products table, manual product groups, and phased migration are all correct decisions for a side project at this scale. No decisions are rejected.

The main risks are execution risks, not design risks:
1. German product name regex needs thorough test coverage (not hard, just must be done first).
2. The 37 product groups will not cover all user searches (seed more, log gaps).
3. The effort estimate is optimistic by about 2 days (mostly regex edge cases).
4. The dual matching path (keyword fallback) needs explicit rules to prevent confusion.

All of these are addressable with the P0 and P1 changes listed above, adding roughly half a day of planning work before implementation begins.
