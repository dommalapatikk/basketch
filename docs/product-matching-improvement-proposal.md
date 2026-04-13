# Product Matching Quality Improvement Proposal

**Author:** Solution Architect Agent
**Date:** 10 April 2026
**Status:** Proposal
**Purpose:** Fix false matches caused by product form confusion, processed-vs-fresh conflation, and ready-meal misclassification

---

## 1. Diagnosis: What's Wrong

### Root Cause: Product Groups Are Too Coarse

The current product group system treats fundamentally different products as interchangeable because it groups by *ingredient* rather than by *what the customer actually buys*. The matching chain has three layers, and the problem exists at each one:

**Layer 1 -- Product group keywords are too broad.**
The `chicken-breast` group has keywords `['poulet', 'pouletbrust', 'pouletschnitzel']`. The `chicken-wings` group has `['pouletflugeli', 'chicken wings']`. This looks correct in the seed data -- the groups are separate. But the *keyword fallback path* (used when `product_group_id` is not set) matches `poulet` as a substring of `pouletflugeli`, giving it relevance score 4 (start-of-compound in first word). So a favorite with keyword `poulet` will happily match chicken wings, chicken breast, chicken schnitzel, and chicken nuggets -- all different products.

**Layer 2 -- No concept of "product form" or "preparation state".**
The schema has `category` (fresh/long-life/non-food) and `sub_category` (dairy, meat, vegetables...), but nothing that distinguishes:
- Raw ingredient vs. processed product (tomatoes vs. tomato puree)
- Fresh cut vs. cooked product (potatoes vs. potato smoky cubes)
- Different cuts of the same animal (breast vs. wings vs. thigh)

**Layer 3 -- Product-to-group assignment is source_name exact match only.**
In `product-resolve.ts`, products are matched to existing rows by `(store, source_name)`. A new product is created if the exact source_name hasn't been seen before. But the `product_group` field on a product is never *auto-assigned* -- it's null unless manually set or seeded. This means most products float without a group, and the system falls back to keyword matching.

### The Four Reported Problems, Traced Through the Code

| Problem | What Happens in Code | Why |
|---|---|---|
| "pouletflugeli" matches chicken-breast | `matchRelevance('poulet', 'pouletflugeli 1kg')` returns 4 (start-of-compound) | Keyword `poulet` is too broad -- it's the root of all chicken products |
| "tomatenpuree" matches tomatoes-fresh | `matchRelevance('tomaten', 'tomatenpuree 3x200g')` returns 4 (start-of-compound) | No distinction between raw tomatoes and tomato-derived products |
| "kartoffel smoky cubes" matches potatoes | `matchRelevance('kartoffeln', 'kartoffel smoky cubes')` returns 4 (first word match) | No concept of "ready meal" vs "raw ingredient" |
| M-Budget Vollmilch vs Prix Garantie Milch not matched | Both might have `product_group = null` if not manually assigned | Auto-assignment doesn't exist; depends on manual seed data coverage |

---

## 2. Schema Changes Needed

### 2a. Add `product_form` to `product_groups`

This is the single most impactful change. A new column that distinguishes *what form the product is in*:

```sql
ALTER TABLE product_groups
  ADD COLUMN product_form TEXT CHECK (product_form IN (
    'raw',           -- unprocessed: fresh tomatoes, raw chicken breast, whole potatoes
    'processed',     -- shelf-stable derived product: tomato puree, tomato sauce, tomato paste
    'ready-meal',    -- cooked/prepared, eat as-is or reheat: smoky cubes, chicken nuggets, hummus
    'canned',        -- preserved in can/jar: canned tomatoes, canned tuna
    'frozen',        -- frozen variant: frozen vegetables, frozen pizza
    'dried'          -- dried/dehydrated: dried herbs, dried pasta (pasta already has its own group)
  )) DEFAULT 'raw';
```

### 2b. Add `product_form` to `products`

Mirror the column on individual products for filtering:

```sql
ALTER TABLE products
  ADD COLUMN product_form TEXT CHECK (product_form IN (
    'raw', 'processed', 'ready-meal', 'canned', 'frozen', 'dried'
  )) DEFAULT 'raw';
```

### 2c. Add `exclude_keywords` to `product_groups`

Currently, exclude logic lives in `favorite_items` (the `exclude_terms` column). But the knowledge of what to exclude belongs to the *product group definition*, not the user's favorite. Move it to the source of truth:

```sql
ALTER TABLE product_groups
  ADD COLUMN exclude_keywords TEXT[] NOT NULL DEFAULT '{}';
```

### 2d. Add `parent_group` for hierarchical grouping (optional, low priority)

For cases where you want to say "show me all chicken deals" but also distinguish breast from wings:

```sql
ALTER TABLE product_groups
  ADD COLUMN parent_group TEXT REFERENCES product_groups(id);
```

This is optional. It lets you build a tree like:
- `chicken` (parent, no direct products)
  - `chicken-breast` (leaf, has products)
  - `chicken-wings` (leaf, has products)
  - `chicken-thigh` (leaf, has products)

---

## 3. Product Group Restructuring

### Before vs After: The Four Problem Cases

**Case 1: Chicken -- Split by Cut**

Before (one group catches all chicken):
```
chicken-breast: keywords ['poulet', 'pouletbrust', 'pouletschnitzel']
chicken-wings:  keywords ['pouletflugeli', 'chicken wings']
```
Problem: keyword fallback with `poulet` matches everything.

After (specific keywords, exclude terms on the group):
```
chicken-breast:
  keywords: ['pouletbrust', 'pouletbrustfilet', 'pouletschnitzel', 'pouletbrustschnitzel']
  exclude_keywords: ['flugeli', 'wings', 'schenkel', 'nuggets', 'geschnetzeltes']
  product_form: 'raw'

chicken-wings:
  keywords: ['pouletflugeli', 'chicken wings', 'pouletflugel']
  exclude_keywords: ['brust', 'schnitzel']
  product_form: 'raw'

chicken-nuggets:
  keywords: ['poulet nuggets', 'chicken nuggets', 'poulet knusperli']
  exclude_keywords: []
  product_form: 'ready-meal'
```

Key change: **remove the bare `poulet` keyword from all groups.** It's too ambiguous. Each group gets only the specific compound words that unambiguously identify it.

**Case 2: Tomatoes -- Split by Form**

Before:
```
tomatoes-fresh: keywords ['tomaten', 'cherry', 'rispentomaten']
tomatoes-canned: keywords ['pelati', 'tomatenstucke', 'passata']
```
Problem: `tomatenpuree` contains `tomaten`, matches fresh group.

After:
```
tomatoes-fresh:
  keywords: ['tomaten', 'cherry tomaten', 'rispentomaten', 'cherrytomaten']
  exclude_keywords: ['puree', 'püree', 'sauce', 'mark', 'ketchup', 'sugo', 'passata', 'pelati', 'getrocknet', 'stucke']
  product_form: 'raw'

tomato-puree:
  keywords: ['tomatenpuree', 'tomatenpüree', 'tomatenmark', 'tomatenkonzentrat']
  exclude_keywords: []
  product_form: 'processed'

tomato-sauce:
  keywords: ['tomatensauce', 'tomatensugo', 'passata']
  exclude_keywords: []
  product_form: 'processed'

tomatoes-canned:
  keywords: ['pelati', 'tomatenstucke', 'tomatenstücke', 'geschalte tomaten']
  exclude_keywords: []
  product_form: 'canned'
```

Key change: `tomatoes-fresh` now has **exclude_keywords** that reject any processed tomato product. New groups exist for puree, sauce, and canned.

**Case 3: Potatoes -- Separate Ready Meals**

Before:
```
potatoes: keywords ['kartoffeln', 'festkochend']
```
Problem: "kartoffel smoky cubes" matches because `kartoffel` is in the name.

After:
```
potatoes:
  keywords: ['kartoffeln', 'kartoffel', 'festkochend', 'mehligkochend']
  exclude_keywords: ['cubes', 'gratin', 'rösti', 'stock', 'puree', 'püree', 'chips', 'frites', 'wedges', 'kroketten', 'gnocchi']
  product_form: 'raw'

potato-ready-meal:
  keywords: ['kartoffel cubes', 'kartoffelgratin', 'kartoffelstock', 'kartoffelpüree', 'rösti']
  exclude_keywords: []
  product_form: 'ready-meal'

fries-frozen:
  keywords: ['pommes frites', 'kartoffel frites', 'wedges']
  exclude_keywords: []
  product_form: 'frozen'
```

Key change: raw potatoes exclude all processed/prepared potato product keywords. Ready meals and frozen products get their own groups.

**Case 4: Cross-Store Milk Matching**

Before: "M-Budget Vollmilch 1L" and "Prix Garantie Milch 1L" may both be in product group `milk-whole-1l`, but only if they were manually assigned. If the pipeline created them as new products, they have `product_group = null`.

After: The pipeline auto-assigns product groups using a rule-based matcher (see section 4).

---

## 4. Matching Algorithm Improvements

### 4a. Product Group Auto-Assignment in the Pipeline

Currently `product-resolve.ts` creates products but never assigns `product_group`. Add a new step: after creating a product, attempt to assign it to a group.

```typescript
// New file: pipeline/product-group-assign.ts

interface GroupRule {
  groupId: string
  mustMatch: RegExp[]      // ALL must match (AND logic)
  mustNotMatch: RegExp[]   // NONE must match (AND-NOT logic)
  productForm: string
}

// Example rules:
const GROUP_RULES: GroupRule[] = [
  {
    groupId: 'milk-whole-1l',
    mustMatch: [/\b(milch|milk)\b/i, /\b1\s*l(iter)?\b/i],
    mustNotMatch: [/schoko/i, /kokos/i, /mandel/i, /hafer/i, /drink/i, /pudding/i],
    productForm: 'raw',
  },
  {
    groupId: 'chicken-breast',
    mustMatch: [/poulet(brust|schnitzel|brustfilet|brustschnitzel)/i],
    mustNotMatch: [/flügeli/i, /wings/i, /nuggets/i],
    productForm: 'raw',
  },
  {
    groupId: 'chicken-wings',
    mustMatch: [/(pouletflügeli|chicken\s*wings|pouletflügel)/i],
    mustNotMatch: [/brust/i, /schnitzel/i],
    productForm: 'raw',
  },
  {
    groupId: 'tomatoes-fresh',
    mustMatch: [/\b(tomaten|cherry|rispen)/i],
    mustNotMatch: [/püree/i, /puree/i, /sauce/i, /mark/i, /pelati/i, /stücke/i, /sugo/i, /passata/i],
    productForm: 'raw',
  },
  {
    groupId: 'potatoes',
    mustMatch: [/\b(kartoffel|kartoffeln)\b/i],
    mustNotMatch: [/cubes/i, /gratin/i, /rösti/i, /stock/i, /püree/i, /chips/i, /frites/i, /wedges/i, /gnocchi/i],
    productForm: 'raw',
  },
  // ... more rules
]

function assignProductGroup(productName: string): { groupId: string; form: string } | null {
  const nameLower = productName.toLowerCase()
  for (const rule of GROUP_RULES) {
    const allMatch = rule.mustMatch.every(r => r.test(nameLower))
    const noneExcluded = rule.mustNotMatch.every(r => !r.test(nameLower))
    if (allMatch && noneExcluded) {
      return { groupId: rule.groupId, form: rule.productForm }
    }
  }
  return null
}
```

This replaces the current approach where product groups are assigned only through manual seed data. The rules are checked in order, first match wins. They use AND logic for positive matches (the product name must contain ALL patterns in `mustMatch`) and AND-NOT logic for exclusions.

### 4b. Improved Keyword Matching (Fallback Path)

For favorites that still use keyword matching (no `product_group_id`), tighten the `matchRelevance` function to penalize compound-word matches where the compound changes the product's meaning:

```typescript
// New: "form-changing" suffixes that indicate a different product
const FORM_CHANGING_SUFFIXES = new Set([
  'püree', 'puree', 'sauce', 'mark', 'sugo', 'stock',
  'gratin', 'cubes', 'nuggets', 'frites', 'chips',
  'schokolade', 'branche', 'drink', 'pudding', 'eis',
])

// In matchRelevance, after detecting start-of-compound:
// If the remainder after the keyword is a form-changing suffix, score 0 instead of 4
if (words.some(w => {
  if (w.startsWith(kw) && w.length > kw.length) {
    const suffix = w.slice(kw.length)
    return FORM_CHANGING_SUFFIXES.has(suffix)
  }
  return false
})) return 0  // Not the same product
```

This means:
- `matchRelevance('tomaten', 'tomatenpüree')` returns 0 instead of 4
- `matchRelevance('kartoffel', 'kartoffelstock')` returns 0 instead of 4
- `matchRelevance('milch', 'milchschokolade')` returns 0 instead of 4
- `matchRelevance('tomaten', 'tomaten cherry')` still returns 4 (no form-changing suffix)

### 4c. Product Group Matching with Exclude Keywords

When matching via product group, apply the group's `exclude_keywords` as an additional filter:

```typescript
export function findBestMatchByProductGroup(
  productGroupId: string,
  storeDeals: DealRow[],
  products: ProductRow[],
  groupExcludeKeywords?: string[],  // NEW parameter
): DealRow | null {
  const groupProductIds = new Set(
    products
      .filter(p => p.product_group === productGroupId)
      .map(p => p.id),
  )

  if (groupProductIds.size === 0) return null

  const matched = storeDeals
    .filter(d => d.product_id != null && groupProductIds.has(d.product_id))
    .filter(d => (d.discount_percent ?? 0) > 0)
    .filter(d => !isExcluded(d.product_name, groupExcludeKeywords))  // NEW

  if (matched.length === 0) return null

  matched.sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
  return matched[0]!
}
```

### 4d. Cross-Store Equivalence via Product Group Rules

The auto-assignment rules in 4a solve cross-store matching. The same rule assigns both "M-Budget Vollmilch 1L" (Migros) and "Prix Garantie Milch 1L" (Coop) to `milk-whole-1l` because:

- Both contain `milch` or `milk` (mustMatch[0])
- Both contain `1l` or `1 liter` (mustMatch[1])
- Neither contains `schoko`, `kokos`, `mandel`, etc. (mustNotMatch)

The brand is irrelevant for group assignment -- M-Budget and Prix Garantie are different brands of the same product group.

---

## 5. Metadata to Extract

### What's Available from Our Sources

| Metadata | Migros API | aktionis.ch (Coop) | Extraction Method |
|---|---|---|---|
| Brand | In product name | In product name | Pattern match against known brand list (already implemented in `product-metadata.ts`) |
| Product form | Not explicit | Not explicit | **Keyword rules** (new): detect puree/sauce/frozen/ready-meal indicators |
| Unit size | In product name | In product name | Regex (already designed, not yet implemented) |
| Organic flag | In product name | In product name | Already implemented in `product-metadata.ts` |
| Source category | `breadcrumb` array | Not available | Already captured as `source_category` |
| Cut/variant | In product name | In product name | **Keyword rules** (new): detect brust/flugeli/schenkel/schnitzel |

### New: Product Form Detection

Add to `product-metadata.ts`:

```typescript
type ProductForm = 'raw' | 'processed' | 'ready-meal' | 'canned' | 'frozen' | 'dried'

const FORM_INDICATORS: { form: ProductForm; keywords: string[] }[] = [
  {
    form: 'ready-meal',
    keywords: ['cubes', 'nuggets', 'gratin', 'rösti', 'fertig', 'ready',
               'convenience', 'mikrowelle', 'aufwärmen'],
  },
  {
    form: 'frozen',
    keywords: ['tiefkühl', 'tiefgefroren', 'frozen', 'tk-'],
  },
  {
    form: 'canned',
    keywords: ['dose', 'konserve', 'pelati', 'in eigene saft'],
  },
  {
    form: 'processed',
    keywords: ['püree', 'puree', 'sauce', 'mark', 'konzentrat', 'sugo',
               'passata', 'ketchup', 'senf', 'stock'],
  },
  {
    form: 'dried',
    keywords: ['getrocknet', 'getrocknete', 'dörr'],
  },
  // Default: 'raw' (no keywords needed)
]

export function detectProductForm(productName: string): ProductForm {
  const nameLower = productName.toLowerCase()
  for (const { form, keywords } of FORM_INDICATORS) {
    if (keywords.some(kw => nameLower.includes(kw))) return form
  }
  return 'raw'
}
```

### New: Cut/Variant Detection for Meat

```typescript
const MEAT_CUTS: { cut: string; keywords: string[] }[] = [
  { cut: 'breast', keywords: ['brust', 'brustfilet', 'brustschnitzel'] },
  { cut: 'wings', keywords: ['flügeli', 'flügel', 'wings'] },
  { cut: 'thigh', keywords: ['schenkel', 'oberschenkel'] },
  { cut: 'minced', keywords: ['hackfleisch', 'gehacktes'] },
  { cut: 'schnitzel', keywords: ['schnitzel'] },  // last -- generic
]

export function detectMeatCut(productName: string): string | null {
  const nameLower = productName.toLowerCase()
  for (const { cut, keywords } of MEAT_CUTS) {
    if (keywords.some(kw => nameLower.includes(kw))) return cut
  }
  return null
}
```

---

## 6. Example Before/After for Each Reported Case

### Case 1: "pouletflugeli" (Chicken Wings)

**Before:**
```
User favorite: keyword="poulet", no product_group_id
Deal: "pouletflügeli 1kg" at Migros, 30% off

matchRelevance('poulet', 'pouletflügeli 1kg') = 4  (start-of-compound)
matchRelevance('poulet', 'pouletbrust 500g') = 4    (start-of-compound)

Result: System picks whichever has higher discount. Could be breast or wings.
User wanted wings. Gets breast. Wrong.
```

**After (with product group auto-assignment):**
```
Product "pouletflügeli 1kg" -> auto-assigned to group "chicken-wings"
  (mustMatch: /pouletflügeli|chicken\s*wings/ -> matches)
Product "pouletbrust 500g" -> auto-assigned to group "chicken-breast"
  (mustMatch: /poulet(brust|schnitzel)/ -> matches)

User favorite: product_group_id="chicken-wings"
Result: Only deals linked to chicken-wings products are considered. Correct.
```

**After (keyword fallback, if no product_group_id):**
```
matchRelevance('pouletflügeli', 'pouletflügeli 1kg') = 4  (exact first word)
matchRelevance('pouletflügeli', 'pouletbrust 500g') = 0   (no match)

Result: User searches for "pouletflügeli" specifically, not bare "poulet". Correct.
```

### Case 2: "tomatenpuree" vs Fresh Tomatoes

**Before:**
```
User favorite: keyword="tomaten", no product_group_id
Deal: "tomatenpüree 3x200g", 25% off

matchRelevance('tomaten', 'tomatenpüree 3x200g') = 4  (start-of-compound)
Result: Puree matches fresh tomatoes group. Wrong.
```

**After (with FORM_CHANGING_SUFFIXES):**
```
matchRelevance('tomaten', 'tomatenpüree 3x200g') = 0  (suffix "püree" is form-changing)
matchRelevance('tomaten', 'cherry tomaten 250g') = 3   (standalone word)
Result: Only actual tomatoes match. Correct.
```

**After (with product group):**
```
Product "tomatenpüree 3x200g" -> auto-assigned to group "tomato-puree"
  (mustMatch: /tomatenpüree|tomatenmark/ -> matches)
Product "cherry tomaten 250g" -> auto-assigned to group "tomatoes-fresh"
  (mustMatch: /tomaten|cherry/ AND mustNotMatch: none triggered -> matches)

User favorite: product_group_id="tomatoes-fresh"
Result: Only fresh tomato products considered. Correct.
```

### Case 3: "kartoffel smoky cubes" vs Raw Potatoes

**Before:**
```
User favorite: keyword="kartoffeln", no product_group_id
Deal: "kartoffel smoky cubes 300g", 20% off

matchRelevance('kartoffeln', 'kartoffel smoky cubes 300g') = 4  (first word starts with keyword root)
Result: Ready meal matches raw potatoes. Wrong.
```

**After (with product group auto-assignment):**
```
Product "kartoffel smoky cubes 300g" -> auto-assigned to group "potato-ready-meal"
  (mustMatch: /kartoffel/ AND /cubes|gratin|rösti/ -> matches)
  (potatoes group mustNotMatch: /cubes/ -> excluded from raw potatoes)

User favorite: product_group_id="potatoes"
Result: Only raw potato products considered. Correct.
```

### Case 4: Cross-Store Milk Matching

**Before:**
```
Migros deal: "m-budget vollmilch 1l", product_id = uuid-1, product_group = null
Coop deal: "prix garantie milch 1l", product_id = uuid-2, product_group = null

User favorite: keyword="milch"
Matching: keyword fallback finds best deal per store independently.
Result: Works by accident (keyword matching), but not through product identity.
No price history, no unit price comparison.
```

**After (with auto-assignment):**
```
Product "m-budget vollmilch 1l" -> auto-assigned to group "milk-whole-1l"
  (mustMatch: /milch|milk/ AND /1\s*l/ -> matches)
  (brand extracted: "M-Budget")
Product "prix garantie milch 1l" -> auto-assigned to group "milk-whole-1l"
  (mustMatch: /milch|milk/ AND /1\s*l/ -> matches)
  (brand extracted: "Prix Garantie")

User favorite: product_group_id="milk-whole-1l"
Result: Both stores matched through product group. Price comparison is like-for-like.
Can also show: "M-Budget CHF 1.20 vs Prix Garantie CHF 1.30 -- same product, different brand."
```

---

## 7. Implementation Steps (Ordered by Impact)

### Step 1: Add `exclude_keywords` to Product Groups (HIGH IMPACT, LOW EFFORT)

**What:** Add the `exclude_keywords` column to `product_groups` and populate it for the existing 65 groups.

**Why first:** This immediately fixes false matches for the product-group path without any code changes to the matching algorithm. The `findBestMatchByProductGroup` function just needs to read and apply them.

**Files changed:**
- `shared/migrations/002-product-group-exclude-keywords.sql` (new migration)
- `web/src/lib/matching.ts` (pass exclude_keywords to filter)

**Effort:** 2-3 hours

### Step 2: Split Ambiguous Product Groups (HIGH IMPACT, LOW EFFORT)

**What:** Break up groups that conflate different products:
- `chicken-breast` loses the bare `poulet` keyword; add `chicken-thigh`, `chicken-nuggets`
- `tomatoes-fresh` gets exclude_keywords for processed forms; add `tomato-puree`, `tomato-sauce`
- `potatoes` gets exclude_keywords for prepared forms; add `potato-ready-meal`, `fries-frozen`
- Add any other missing groups discovered during review

**Why second:** Directly fixes the four reported problems at the data level.

**Files changed:**
- `shared/migrations/002-product-group-exclude-keywords.sql` (include group splits in same migration)

**Effort:** 2-3 hours (mostly careful keyword curation)

### Step 3: Add FORM_CHANGING_SUFFIXES to Keyword Matching (HIGH IMPACT, MEDIUM EFFORT)

**What:** Modify `matchRelevance` in `matching.ts` to return 0 when a compound word's suffix indicates a fundamentally different product form.

**Why third:** This fixes the keyword fallback path, which is still used by any favorite without a `product_group_id`. Prevents `tomatenpüree` matching `tomaten`, `kartoffelstock` matching `kartoffeln`, etc.

**Files changed:**
- `web/src/lib/matching.ts` (add suffix check)
- `web/src/lib/matching.test.ts` (add test cases for each reported problem)

**Effort:** Half a day

### Step 4: Build Product Group Auto-Assignment (MEDIUM IMPACT, MEDIUM EFFORT)

**What:** Create `pipeline/product-group-assign.ts` with rule-based group assignment. Integrate into `product-resolve.ts` so new products get a `product_group` automatically.

**Why fourth:** This is what enables cross-store matching to work without manual intervention. Once this runs, every new product that fits a rule gets assigned to the correct group.

**Files changed:**
- `pipeline/product-group-assign.ts` (new file)
- `pipeline/product-resolve.ts` (call auto-assign after creating a product)
- `pipeline/product-group-assign.test.ts` (new test file)

**Effort:** 1 day

### Step 5: Add `product_form` Column and Detection (MEDIUM IMPACT, LOW EFFORT)

**What:** Add the `product_form` column to both tables. Add `detectProductForm()` to `product-metadata.ts`. Populate during pipeline runs.

**Why fifth:** Enables future filtering ("show me only raw ingredients, not ready meals") and makes the auto-assignment rules more accurate.

**Files changed:**
- `shared/migrations/003-product-form.sql` (new migration)
- `pipeline/product-metadata.ts` (add detectProductForm)
- `pipeline/product-resolve.ts` (set product_form on new products)

**Effort:** Half a day

### Step 6: Backfill Existing Products (LOW IMPACT, LOW EFFORT)

**What:** Run a one-time script that applies the auto-assignment rules to all existing products with `product_group = null`.

**Why last:** Only matters for products already in the database. New products are handled by Step 4.

**Files changed:**
- `pipeline/scripts/backfill-product-groups.ts` (one-time script)

**Effort:** 2 hours

---

## 8. What This Does NOT Require

- **No AI/LLM calls.** Everything is deterministic rule-based matching.
- **No new data sources.** Works with existing Migros API and aktionis.ch data.
- **No breaking changes.** All schema changes are additive (new columns with defaults, new tables).
- **No changes to the Python Coop scraper.** Product form detection and group assignment happen in the TypeScript pipeline, after normalization.
- **No changes to the frontend (initially).** Steps 1-4 improve matching quality server-side. The frontend already uses `findBestMatchByProductGroup` when `product_group_id` is set.

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Auto-assignment rules are wrong for some products | Rules are checked manually against real product names from the Migros API and aktionis.ch. Log unassigned products for review. |
| Too many product groups to maintain | Start with the ~65 we have plus ~15 new splits. That's ~80 groups covering the product catalog that matters. Growth is incremental. |
| FORM_CHANGING_SUFFIXES list is incomplete | Start with the known problem suffixes. Add more as false matches are reported. The list is a simple array -- easy to extend. |
| Exclude keywords are too aggressive (reject valid products) | Test each exclude list against real deal data before deploying. Log excluded matches for the first 2 pipeline runs. |

---

## 10. Summary

The core problem is that the system matches by *ingredient root word* when it should match by *specific product*. The fix has three parts:

1. **Data layer:** Split ambiguous product groups, add exclude_keywords, add product_form.
2. **Pipeline layer:** Auto-assign products to groups using multi-condition rules (must-match AND must-not-match).
3. **Matching layer:** Reject compound words where the suffix changes the product's form (tomatenpuree is not tomaten).

Total estimated effort: 3-4 days, spread across the 6 implementation steps. Steps 1-3 fix the four reported problems. Steps 4-6 prevent future recurrence.
