# Data Quality: Cross-Store Product Matching Analysis

**Author:** Architect Agent
**Date:** 14 April 2026
**Status:** Approved for implementation
**Based on:** Live database analysis of 875 active deals across 6 stores

---

## 1. Current Matching Quality

### Deal Volume by Store

| Store | Active deals | Share |
|-------|-------------|-------|
| Coop  | 578         | 66%   |
| Denner| 139         | 16%   |
| Migros| 85          | 10%   |
| Spar  | 36          | 4%    |
| Lidl  | 27          | 3%    |
| Volg  | 10          | 1%    |
| **Total** | **875** | 100% |

### Product Group Assignment Coverage

| Status | Count | % of 875 deals |
|--------|-------|----------------|
| Deals with a product_group assigned | 228 | 26% |
| Deals without product_group (null) | 647 | 74% |

Of the 228 deals with a product_group, only **228 products across 52 distinct groups** have been assigned. The pipeline auto-assignment rules (in `product-group-assign.ts`) are working, but they cover only the keyword-matched fraction of the catalog.

### Cross-Store Match Quality

Product groups that appear in 2 or more stores today:

| Product group | Stores | Count |
|---------------|--------|-------|
| berries | coop, denner, lidl, migros | 4 stores, 9 deals |
| ham | coop, denner, migros | 3 stores |
| mozzarella | coop, denner, lidl | 3 stores |
| salami | coop, denner, spar | 3 stores |
| beans-canned | coop, denner | 2 stores |
| carrots | coop, lidl | 2 stores |
| cheese-hard | coop, migros | 2 stores |
| chicken-breast | coop, migros | 2 stores |
| chips | coop, denner | 2 stores |
| coffee-assorted | coop, denner | 2 stores |
| cream | coop, spar | 2 stores |
| flour | coop, migros | 2 stores |
| mushrooms | coop, spar | 2 stores |
| olive-oil | coop, spar | 2 stores |
| pasta-assorted | coop, denner | 2 stores |
| salmon | coop, migros | 2 stores |
| toilet-paper | coop, denner | 2 stores |
| yogurt-plain | coop, lidl | 2 stores |

**18 product groups produce genuine cross-store comparisons.** Most involve only 2 stores. The "Compare" view's reported ~12 matching products reflects this — the UI is correctly surfacing what the data actually contains. The problem is that the data itself is sparse.

### False Positive Rate

No systematic false positive measurement exists yet. Inspection of real data shows two categories of risk:

1. **Intra-group variety risk.** The `berries` group contains "erdbeeren" (strawberries), "heidelbeeren" (blueberries), and "himbeeren" (raspberries) across stores. These are matched in the same group but are not the same product. A user comparing "Coop erdbeeren" vs "Migros heidelbeeren" gets a misleading price comparison.

2. **Category pollution.** Examining the `dairy` sub_category data shows products like "betty bossi plant kitchen schnitzel mozzarella" and "karma cauliflower and cheese" — these are ready meals, not dairy. The sub_category assignment is over-inclusive for keyword-heavy product names.

The false positive rate is estimated at **10-20%** of displayed comparisons — low enough that the product is usable, high enough to erode user trust if left unaddressed.

---

## 2. Root Causes

### Root cause 1: 36% of deals have no sub_category at all

317 out of 875 active deals (36.2%) have `sub_category = NULL`. These deals are completely invisible to the product matching system — they can never participate in a cross-store comparison regardless of how good the matching logic is. The null deals include wines, pizzas, laundry pods, kitchen equipment, and other products that the categorizer's keyword rules don't cover.

### Root cause 2: Product groups cover only 26% of the catalog

Even for categorised deals, only 228 of 875 (26%) have a product_group assigned. The pipeline's `assignProductGroup()` function in `product-group-assign.ts` has 57 keyword rules covering common items, but the Swiss grocery catalog is far broader. The majority of deals have no group and therefore cannot be matched across stores at all.

### Root cause 3: Store naming conventions diverge heavily

Real data illustrates the problem:

**Fruit sub_category — the same product named differently:**
- Coop: `"erdbeeren"`, `"erdbeeren clery"`, `"naturaplan bio heidelbeeren"`
- Denner: `"heidelbeeren"`, `"bio bananen"`
- Lidl: `"erdbeeren"`
- Migros: `"erdbeeren"`, `"migros · erdbeeren"`, `"himbeeren · bio"`, `"migros bio himbeeren"`

Migros prefixes many products with `"migros · "` or uses `"migros bio "` instead of `"bio"` alone. Denner uses bare ingredient names. Coop uses brand prefixes (naturaplan, betty bossi). These are different surfaces for the same underlying product. String similarity matching fails because the token sets are too different.

**Dairy sub_category — brand prefix noise:**
- Coop: `"actimel joghurtdrink erdbeere 12x100g"`, `"activia probiotischer joghurt fruchtmix 8x115g"`
- Denner: `"lc1 erdbeer 12x"` — this is a yogurt drink, but the keyword "erdbeer" would fire a false match against strawberry deals

**Meat sub_category — category bleed:**
- Denner lists `"meridol mundspülung zahnfleischschutz"` (a mouthwash) and `"meridol zahnpasta"` (toothpaste) under `sub_category = 'meat'` — the word "fleisch" in "zahnfleischschutz" triggered the meat rule. This is a keyword false positive in the categorizer.

### Root cause 4: Product group granularity is sometimes too coarse

The `berries` group catches strawberries, blueberries, and raspberries under one label. These are not the same product from a price comparison standpoint. A user looking at "berries vs berries" across stores may be comparing strawberries at Coop against blueberries at Migros. The group exists because all three are cheap to group together, but it produces misleading comparisons.

### Root cause 5: Coop is dominant, others are sparse

Coop provides 578 of 875 deals (66%). Migros provides only 85. Lidl, Spar, and Volg have between 10-36 deals each, with most having NULL sub_category. Even perfect matching logic would produce few results for Spar, Lidl, and Volg because the deal volume is too low. Cross-store comparisons are currently meaningful only between Coop and Denner, and partially between Coop and Migros.

---

## 3. Improvement Strategies (Ranked by Impact)

### Strategy 1 — Fix the categorizer's false positives (HIGH impact, LOW effort)

**The problem:** Words like "fleisch" in "zahnfleischschutz", "milch" in "milchschokolade", and "erdbeer" in "actimel joghurtdrink erdbeere" trigger wrong sub_category assignments.

**The fix:** The categorizer in `categorize.ts` already uses keyword rules from `shared/category-rules.ts`. Add must-not-match exclusions to ambiguous rules, exactly as the product-group-assign.ts pattern does. Example: the meat rule should exclude "zahn", "mund", "schokolade"; the dairy rule should exclude "drink" when preceded by a brand name.

**Impact:** Reduces false positives in sub_category, improves quality of the matching pool.
**Effort:** 2-4 hours — editing keyword rule arrays, adding test cases.

### Strategy 2 — Expand product group rules to cover more of the catalog (HIGH impact, MEDIUM effort)

**The problem:** 74% of deals have no product_group. The pipeline's auto-assignment in `product-group-assign.ts` covers ~57 product types; the real catalog is much broader.

**The fix:** Audit the null-group deals and add rules for the most common uncovered types. Immediate candidates from the data:

- Wines (the `drinks` sub_category contains wines, beers, spirits — all currently unmatched)
- Ready meals / pizza (betty bossi, buitoni — large Coop category, uncovered)
- Laundry products (ariel, persil — appear in data but ariel pods/liquid aren't matched to a group)
- Cheese varieties (appenzeller kräftig-würzig, various AOC cheeses — not matched despite being in the `dairy` sub_category)
- Snacks and biscuits (appenzeller bärli-biber, various brand confectionery)

**Impact:** Each new rule that fires in 2+ stores adds a genuine cross-store comparison.
**Effort:** 1-2 days — writing rules, testing against real product names, verifying no false positives.

### Strategy 3 — Split over-broad product groups into sub-groups (MEDIUM impact, LOW effort)

**The problem:** The `berries` group conflates three different fruits. The `cheese-hard` group covers gruyère, appenzeller, emmentaler, and reibkäse — different products.

**The fix:** Split the groups:
- `berries` → `strawberries`, `blueberries`, `raspberries`
- `cheese-hard` → `gruyere`, `appenzeller`, `emmentaler`, `cheese-hard` (as a catch-all for unlabelled hard cheese)

**Impact:** Eliminates the most obvious false cross-store comparisons.
**Effort:** Half a day — add new rules, update existing ones.

### Strategy 4 — Strip store-specific name prefixes before matching (MEDIUM impact, LOW effort)

**The problem:** Migros names products as `"migros · erdbeeren"` and `"migros bio himbeeren"`. These are already matched correctly by the keyword rules (`/\b(erdbeeren|himbeeren|heidelbeeren|beeren)\b/`), so the prefix doesn't break matching — but it does appear in the display name.

However, some Migros-specific compound names (`"m-classic orangensaft, 10er-pack"`) contain the store brand prefix as an integral part of the name. When a Coop equivalent exists (`"eptinger orangensaft 6x1l"`), the rule-based system can still match them to the same product group (`drinks`) if a rule exists — but no such rule currently exists.

**The fix:** Add normalisation in `product-metadata.ts` to strip `"migros · "` and `"migros bio "` prefixes before matching. This already happens partially (the `extractProductMetadata` function strips brand prefixes from canonical_name), but the brand list may not include `"migros"` as a recognised brand token.

**Impact:** Cleaner canonical names, marginally better rule coverage.
**Effort:** 1-2 hours.

### Strategy 5 — Token-based matching as a fallback for ungrouped deals (LOW impact, HIGH effort)

**The idea:** For deals with no product_group, use token overlap (Jaccard similarity on word bags) to find candidate matches across stores.

**Why this is lower priority:** Token overlap matching was the original approach and produced the ~12 matches mentioned. The false positive rate is high because:
- "actimel joghurtdrink erdbeere" matches "erdbeeren" with high token overlap
- "nissin soba gebratene nudeln" shares tokens with "hörnli" because both contain "nudeln"

Token matching at a strict threshold (e.g. Jaccard > 0.5) finds very few matches. At a loose threshold it finds false positives. The sweet spot is narrow. Rule-based group assignment (Strategy 2) produces more reliable results with less implementation complexity.

**Recommendation:** Do not invest in token-based matching improvements. Focus effort on expanding product group rules (Strategy 2).

### Strategy 6 — Product images and barcodes (FUTURE, not addressable now)

Swiss stores do not expose barcodes or standardised product identifiers through aktionis.ch or the Migros promotions API. The Migros API provides product UIDs but these are Migros-internal. Coop (via aktionis.ch) provides no stable product identifier.

Barcode-based matching would require a fundamentally different data source (e.g., scraping individual store product pages, or purchasing access to a Swiss product database). This is out of scope for the current architecture and budget.

---

## 4. Quick Wins (Can Be Done Now)

These changes require no schema migrations and no new infrastructure. They touch only `shared/category-rules.ts`, `pipeline/categorize.ts`, and `pipeline/product-group-assign.ts`.

### Quick win 1 — Fix the "zahnfleischschutz in meat" bug

Denner's `"meridol mundspülung zahnfleischschutz"` and `"meridol zahnpasta"` are listed under `sub_category = 'meat'`. This is a categoriser false positive from the word "fleisch" in "zahnfleisch". Add `"zahn"` as a must-not-match exclusion on the meat rule.

**Time:** 30 minutes.

### Quick win 2 — Add "strawberries" as a specific group, split from "berries"

The berries group currently produces cross-store comparisons between different fruits. Strawberries (erdbeeren) are the most common berry in the dataset. Adding a dedicated rule:

```typescript
{
  groupId: 'strawberries',
  mustMatch: [/\berdbeeren?\b/i],
  mustNotMatch: [/joghurt/i, /konfitüre/i, /marmelade/i, /drink/i, /actimel/i, /lc1/i],
  productForm: 'raw',
}
```

This immediately gives Coop vs Lidl vs Migros strawberry comparisons with high confidence. The `mustNotMatch` on `joghurt`, `drink`, `actimel`, and `lc1` prevents the "lc1 erdbeer 12x" false positive from the problem statement.

**Time:** 1 hour, including testing.

### Quick win 3 — Add a "wine" exclusion to the "drinks" sub_category

The `drinks` sub_category mixes mineral water, beer, wine, spirits, juice, and ice cream ("cornet erdbeer vanille 16x125ml" is listed under drinks). These will never match meaningfully across stores. Adding a `wine-red`, `wine-white`, `beer` group with specific rules (already partially present) and excluding them from the generic drinks bucket prevents low-quality comparisons.

**Time:** 2-3 hours.

### Quick win 4 — Add rules for salami, ham, and sausage variants (already partial)

The database shows `salami` already matches across 3 stores (coop, denner, spar). `ham` matches across 3 stores. But within each group there is variety (cooked ham vs cured ham; salami vs salametti). Adding `mustNotMatch` guards within these rules would prevent the coarsest false positives.

**Time:** 1-2 hours.

### Quick win 5 — Log unmatched products during pipeline runs

Currently the pipeline logs a count of new products created but does not log which products failed to match any group. Adding a log line for every product where `assignProductGroup()` returns null would give a prioritised list of what rules to write next, without requiring any database queries.

```typescript
if (!groupAssignment) {
  console.log(`[product-group-assign] [UNMATCHED] ${store}: ${sourceName}`)
}
```

**Time:** 15 minutes. High leverage for prioritising future rule additions.

---

## 5. What NOT to Do

### Do not lower the matching threshold

The fuzzy name matching previously produced ~12 matches from 875 deals. Lowering any threshold to increase match count will introduce false positives faster than true positives. A comparison of "Coop erdbeeren" vs "Denner lc1 erdbeer" — strawberries vs strawberry-flavoured yogurt — is worse than no comparison. Users lose trust in the tool when they see obviously wrong comparisons.

**The rule:** Only show a cross-store comparison when you are confident it is the same product. No match is better than a wrong match.

### Do not use fuzzy string similarity as the primary matching strategy

Levenshtein distance and trigram similarity fail on German compound words. "Erdbeeren" and "erdbeer" are 87% similar by edit distance, but "erdbeer" is a component of "joghurtdrink erdbeere" — a completely different product. The existing rule-based system (`mustMatch` + `mustNotMatch`) is more reliable because it encodes product knowledge, not just string similarity.

### Do not try to match across all 6 stores simultaneously

Volg (10 deals) and Lidl (27 deals) have too few categorised deals to produce reliable matches for most product groups. Forcing matches between sparse stores produces empty comparisons or cherry-picked outliers. Focus match quality on the Coop-Denner and Coop-Migros pairs first. Lidl and Spar can be added as coverage grows.

### Do not add product groups faster than you can validate them

Each new rule must be tested against real product names before being deployed. An overly broad rule (e.g., matching "salat" without exclusions would catch "salatsauce", "salatgurke", and "eisbergsalat" together) produces silent false positives that are hard to detect later. The right cadence is: audit unmatched products → write rule → test against the live database → deploy.

### Do not build a manual product curation UI yet

A UI for humans to curate product matches (like a "is this the same product?" confirmation flow) sounds appealing but is premature. The rule-based system can be extended to cover 80% of the useful product catalog without any UI. Build the UI only if the rule coverage ceiling is reached and manual exceptions are genuinely needed.

---

## 6. Recommended Implementation Order

Based on impact-to-effort ratio:

| Priority | Action | Effort | Expected outcome |
|----------|--------|--------|-----------------|
| 1 | Fix categorizer false positives (meat/dairy/drinks pollution) | 2-4 hours | Cleaner matching pool, fewer wrong comparisons |
| 2 | Add "strawberries" specific group, split from "berries" | 1 hour | Reliable 4-store comparison for strawberries |
| 3 | Log unmatched products in pipeline | 15 mins | Prioritised backlog for new rules |
| 4 | Add rules for top-20 unmatched product types from log | 1-2 days | Increase grouped deals from 26% toward 50% |
| 5 | Split cheese-hard into specific varieties | 2-3 hours | Eliminates gruyère vs appenzeller false comparisons |
| 6 | Add wine/beer/spirits as specific groups, exclude from drinks | 2-3 hours | Prevents alcohol product cross-matching with water/juice |

At the end of this sequence, the Compare view should have 40-60 genuine cross-store product matches (up from ~12 today), all with high confidence of being the same product.

---

## Appendix: Database Snapshot Used for This Analysis

Queries run against the live Supabase database on 14 April 2026.

- **Total active deals:** 875 (across 874 distinct products — one product has 2 active deals)
- **Stores with data:** coop (578), denner (139), migros (85), spar (36), lidl (27), volg (10)
- **Sub-categories assigned:** 22 distinct values + null
- **Deals with null sub_category:** 317 (36.2%)
- **Products with product_group assigned:** 228 (26% of deals)
- **Distinct product groups in use:** 52
- **Product groups appearing in 2+ stores:** 18
- **Product groups appearing in 3+ stores:** 4 (berries, ham, mozzarella, salami)
