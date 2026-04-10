# Product Data Architecture: Structured Metadata and Cross-Store Matching

**Author:** Solution Architect Agent
**Date:** 10 April 2026
**Status:** Proposal
**Inputs:** PRD v1.0, Technical Architecture v1.1, current codebase analysis
**Purpose:** Redesign the product data model so that products can be reliably identified, matched across stores, and enriched with structured metadata

---

## 1. Current State Analysis

### What We Have

The `deals` table stores one row per deal, with the product identity captured as a single free-text field:

```sql
product_name  TEXT NOT NULL  -- e.g. "bio vollmilch 1l", "naturaplan bio milch 1 liter"
```

There is no concept of a "product" independent of a deal. Each deal is a standalone row. The only structure comes from:

- **`category`** (fresh / long-life / non-food) -- assigned by keyword matching in `categorize.ts`
- **`store`** (migros / coop) -- which retailer the deal came from
- **`source_category`** -- the original category string from the source (Migros breadcrumb; null for Coop)

### What's Broken

**Problem 1: No product identity.** "bio vollmilch 1l" (Migros) and "naturaplan bio milch 1 liter" (Coop) are the same product -- whole milk, 1 litre, organic -- but nothing in the schema connects them. The upsert key is `(store, product_name, valid_from)`, which means products only match if the exact same store uses the exact same text in the exact same week.

**Problem 2: Matching is a keyword hack.** The favorite-item-to-deal matching (`matching.ts`) works by searching for a keyword like "milch" across all product names, then using exclude terms (to avoid "milchschokolade"), prefer terms (to boost "vollmilch"), relevance scoring (word position, compound word analysis), and short-name bonuses. This is 150 lines of workaround code for a problem that should be solved in the data model.

**Problem 3: No structured metadata.** The system cannot answer basic questions:
- "Show me all organic dairy products" (no `is_organic` flag, no `sub_category`)
- "Compare 1L milk prices" (no `quantity`, no `unit`)
- "What brand is this?" (no `brand` field -- brand is buried in the product name)
- "Is this the same product as last week?" (no stable product identity across weeks)

**Problem 4: Categories are keyword-guessed.** The categorizer checks if the product name contains keywords like "milch" or "fleisch" and assigns fresh/long-life/non-food. This works for obvious cases but misclassifies edge cases (e.g., "milchschokolade" gets tagged as "fresh" because it contains "milch").

**Problem 5: No price history.** Because there's no stable product identity, you can't track whether "Migros Bio Vollmilch 1L" was CHF 1.60 last week and CHF 1.45 this week. The `valid_from` date creates a new row each week, but there's no way to connect rows for the same product across weeks.

**Problem 6: Starter packs use workarounds as core features.** The `StarterPackItem` type has `excludeTerms` and `preferTerms` arrays -- literally encoding matching heuristics into the user-facing data model. A "Milk" favorite item needs 8 exclude terms and 4 prefer terms to work correctly. This is fragile and unmaintainable.

### Current Data Flow

```
Raw API/HTML  -->  normalize (lowercase, collapse whitespace)  -->  categorize (keyword match)  -->  upsert to deals table
                   ^                                                ^
                   No metadata extraction                           No structured category logic
```

---

## 2. Proposed Data Model

The core idea: introduce a **products** table that gives each real-world product a stable identity, separate from the weekly deals. Deals reference products. Favorites reference products (or product groups). Matching happens through product identity, not keyword search.

### New Tables

```sql
-- ============================================================
-- products: One row per real-world product (e.g., "Migros Bio Vollmilch 1L")
-- ============================================================
CREATE TABLE products (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  canonical_name  TEXT NOT NULL,           -- normalized display name: "Bio Vollmilch 1L"
  brand           TEXT,                    -- "M-Budget", "Naturaplan", "Coop Prix Garantie", etc.
  store           TEXT NOT NULL CHECK (store IN ('migros', 'coop')),

  -- Structured metadata
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,                    -- "dairy", "meat", "bread", "cleaning", "snacks", etc.

  -- Product attributes
  quantity        DECIMAL(10, 2),          -- 1, 1.5, 6, 500, etc.
  unit            TEXT CHECK (unit IN ('ml', 'cl', 'dl', 'l', 'g', 'kg', 'pcs', 'pack')),
  is_organic      BOOLEAN DEFAULT false,

  -- Cross-store matching
  product_group   TEXT,                    -- grouping key: "milk-whole-1l", "butter-250g"
                                           -- same product_group = same product across stores

  -- Source tracking
  source_name     TEXT NOT NULL,           -- raw product_name from the deal (for traceability)

  -- Timestamps
  first_seen_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_product UNIQUE (store, source_name)
);

-- Indexes
CREATE INDEX idx_products_group ON products (product_group) WHERE product_group IS NOT NULL;
CREATE INDEX idx_products_category ON products (category, sub_category);
CREATE INDEX idx_products_store ON products (store);
```

### Modified Deals Table

```sql
-- deals table: add product_id foreign key (nullable for migration)
ALTER TABLE deals ADD COLUMN product_id UUID REFERENCES products(id);

CREATE INDEX idx_deals_product_id ON deals (product_id) WHERE product_id IS NOT NULL;
```

The existing `product_name`, `category`, and all other columns remain unchanged. The `product_id` is nullable so that old deals without product mapping still work. New deals get a `product_id` assigned during pipeline processing.

### Product Groups Table (Reference Data)

```sql
-- ============================================================
-- product_groups: defines what a "product group" means for matching
-- ============================================================
CREATE TABLE product_groups (
  id              TEXT PRIMARY KEY,        -- "milk-whole-1l", "butter-250g"
  label           TEXT NOT NULL,           -- "Whole Milk (1L)", "Butter (250g)"
  category        TEXT NOT NULL CHECK (category IN ('fresh', 'long-life', 'non-food')),
  sub_category    TEXT,

  -- Search helpers (replaces exclude/prefer terms)
  search_keywords TEXT[] NOT NULL,         -- ["milch", "vollmilch", "milk"]

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_groups_category ON product_groups (category);
```

### Updated Favorite Items

```sql
-- favorite_items: replace keyword with product_group reference
ALTER TABLE favorite_items ADD COLUMN product_group_id TEXT REFERENCES product_groups(id);

-- keyword column stays for backward compatibility during migration
-- eventually: keyword becomes optional, product_group_id becomes the primary link
```

### Complete Entity Relationship

```
product_groups (reference data)
  |
  |-- 1:N --> products (one group has Migros + Coop variants)
  |              |
  |              |-- 1:N --> deals (one product has many weekly deals)
  |
  |-- 1:N --> favorite_items (user favorites link to product groups)
```

Example:

| product_group | store | canonical_name | brand | quantity | unit | is_organic |
|---|---|---|---|---|---|---|
| milk-whole-1l | migros | Bio Vollmilch 1L | Naturaplan | 1 | l | true |
| milk-whole-1l | coop | Naturaplan Bio Milch 1 Liter | Naturaplan | 1 | l | true |
| butter-250g | migros | Die Butter 250g | - | 250 | g | false |
| butter-250g | coop | Die Butter 250g | - | 250 | g | false |

---

## 3. Product Identity Strategy

This is the hardest part: how does "bio vollmilch 1l" get linked to "naturaplan bio milch 1 liter"?

### Approach: Pipeline-Time Extraction + Manual Product Groups

**Step 1: Extract metadata during normalization.** When a deal comes in, the normalizer already has the raw product name. Extend it to also extract:

- **Brand** -- pattern match known Swiss grocery brands (M-Budget, Naturaplan, Prix Garantie, M-Classic, Coop, Fine Food, etc.)
- **Quantity + Unit** -- regex patterns like `(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)` or `(\d+)\s*(?:stück|stk|pcs|x)`
- **Organic flag** -- presence of "bio", "naturaplan", "demeter", "knospe"

This is deterministic extraction, not AI. The normalizers already do similar work (collapsing whitespace, standardizing units). This extends them to also parse out structured fields.

**Step 2: Match to existing products by source_name.** When a deal arrives, look up `products` by `(store, source_name)`. If found, link the deal to that product. If not found, create a new product row.

**Step 3: Assign product groups manually (initially).** Product groups are a curated mapping: "these two products across stores are the same thing." For the MVP, this is a manual lookup table seeded from the starter pack items.

The current starter packs already define the key products:
- "milch" with excludeTerms and preferTerms is really the product group "milk-whole-1l"
- "poulet" with its terms is "chicken-breast"
- "butter" with its terms is "butter-250g"

There are about 30-40 unique product keywords across all starter packs. That's 30-40 product groups to define manually. This is feasible for one developer.

**Step 4: Automate group assignment over time.** Once product metadata is structured, automated matching becomes much easier:

```
Same sub_category + same quantity + same unit + same is_organic
  --> likely the same product group
```

This is a future enhancement, not an MVP requirement.

### Why Not Fuzzy String Matching?

Fuzzy matching (Levenshtein distance, trigrams, etc.) was considered and rejected for cross-store matching because:

1. **German compound words break similarity scores.** "Vollmilch" and "Milch" are 60% different by edit distance but describe the same thing.
2. **Brand names add noise.** "M-Budget Bratbutter 250g" and "Prix Garantie Kochbutter 250g" are the same product group (butter, 250g) but share almost no words.
3. **False positives are worse than false negatives.** Matching "Milchschokolade" to "Milch" is worse than not matching at all.

Product groups solved by human curation are more reliable than any automated string matching, especially at the scale of 30-40 key products.

### Why Not AI/LLM-Based Matching?

An LLM could theoretically read "bio vollmilch 1l" and "naturaplan bio milch 1 liter" and decide they're the same product. This was rejected because:

1. **Cost.** Even cheap models cost money per call. With ~600 deals per week, that's 600 API calls every Wednesday night, on a project with a CHF 0/month budget.
2. **Latency.** Adds seconds per deal to pipeline processing.
3. **Non-determinism.** The same input might get different groupings on different runs.
4. **Overkill.** The starter packs already define the 30-40 products that matter. We don't need to match all 600 deals to each other -- we need to match favorite items to deals, and we know which items people care about.

---

## 4. Metadata Schema

### Brand Extraction

Known Swiss grocery store brands (hardcoded list):

```
Migros brands: M-Budget, M-Classic, Migros Bio, Naturaplan, Aha!, Frey, Anna's Best,
               Heidi, Farmer, Aproz, Elsa, Rapelli, Micarna
Coop brands:   Prix Garantie, Naturaplan, Coop, Fine Food, Karma, Betty Bossi,
               Jamadu, Qualité & Prix
Cross-store:   Emmi, Zweifel, Lindt, Cailler, Thomy, Barilla, Knorr
```

Extraction logic: check if the normalized product name starts with or contains any known brand. Strip the brand from the name to get the "bare product name."

### Sub-Category Taxonomy

A flat list of ~15-20 sub-categories, not a hierarchy:

| Category | Sub-categories |
|---|---|
| fresh | dairy, meat, poultry, fish, bread, fruit, vegetables, eggs, deli, ready-meals |
| long-life | pasta-rice, canned, drinks, snacks, chocolate, coffee-tea, condiments, frozen |
| non-food | cleaning, laundry, personal-care, paper-goods, household |

Assignment logic: extend the existing keyword rules in `category-rules.ts` to also output a sub-category. Same keyword-matching approach, just more granular.

### Quantity and Unit Parsing

Regex-based extraction from product names:

| Pattern | Example | Extracted |
|---|---|---|
| `(\d+(?:\.\d+)?)\s*(kg\|g\|l\|dl\|cl\|ml)` | "bio vollmilch 1l" | quantity=1, unit=l |
| `(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(g\|ml\|l)` | "joghurt 4x150g" | quantity=600, unit=g (or keep as "4x150g") |
| `(\d+)\s*(?:stück\|stk\|pcs)` | "eier 6 stück" | quantity=6, unit=pcs |

For multi-packs like "4x150g", store both the pack description ("4x150g") and the total quantity (600g) so you can compare unit prices.

### Organic Flag

Set `is_organic = true` if the product name contains any of: "bio", "naturaplan", "demeter", "knospe", "organic".

### Example: Full Extraction

Input: `"naturaplan bio vollmilch 1l"` (from Migros)

| Field | Value | How |
|---|---|---|
| brand | Naturaplan | Matched "naturaplan" from brand list |
| canonical_name | Bio Vollmilch 1L | Stripped brand, title-cased |
| quantity | 1 | Regex: `(\d+)l` |
| unit | l | Regex |
| is_organic | true | Contains "bio" |
| category | fresh | Keyword "milch" matches fresh rule |
| sub_category | dairy | Keyword "milch" matches dairy sub-rule |
| product_group | milk-whole-1l | Looked up from product_groups table by sub_category + quantity + unit |

---

## 5. Migration Path

This must be incremental. The current system works (users have favorites, deals are flowing). We can't break anything during the transition.

### Phase 1: Add Products Table (Non-Breaking)

**What changes:**
- Create the `products` and `product_groups` tables
- Add `product_id` column to `deals` (nullable)
- Add `product_group_id` column to `favorite_items` (nullable)

**What doesn't change:**
- All existing queries, matching logic, and frontend code continue to work unchanged
- The `product_name` column in `deals` stays and continues to be populated
- Favorites still match by keyword

**Effort:** One SQL migration. No code changes required.

### Phase 2: Enrich Pipeline (Additive)

**What changes:**
- Extend Migros and Coop normalizers to extract brand, quantity, unit, organic flag
- After categorization, look up or create a `products` row for each deal
- Set `product_id` on new deals
- Seed `product_groups` with the ~35 items from starter packs

**What doesn't change:**
- Old deals keep `product_id = NULL` (fine -- they'll expire naturally within a week)
- Frontend still uses keyword matching
- No existing behavior changes

**Effort:** Extend normalizers (~50 lines each), add product lookup step to pipeline (~100 lines), seed product_groups (~35 rows of SQL).

### Phase 3: Upgrade Matching (Swap)

**What changes:**
- `matchFavorites()` gains a new code path: if `product_group_id` is set on a favorite item, match by product_group instead of keyword
- Starter packs reference product_groups instead of keyword + exclude/prefer terms
- New favorites created from this point use product_group_id

**What doesn't change:**
- Old favorites without `product_group_id` still fall back to keyword matching
- No data loss, no breaking changes for existing users

**Effort:** Add ~30 lines to `matching.ts` for the product_group path. Update starter pack seed data.

### Phase 4: Clean Up (Optional)

- Backfill `product_id` on historical deals (if price history is needed)
- Remove `excludeTerms` / `preferTerms` from starter packs
- Deprecate keyword-based matching path
- Drop redundant `category` column from `deals` (it's now derived from the product)

### Timeline Estimate

| Phase | Scope | Effort |
|---|---|---|
| Phase 1 | SQL migration only | 1 hour |
| Phase 2 | Pipeline enrichment | 1-2 days |
| Phase 3 | Matching upgrade | Half a day |
| Phase 4 | Cleanup | When convenient |

Total: about 2-3 days of work, spread out over multiple sessions.

---

## 6. Impact on Pipeline

### Migros Normalizer (`pipeline/migros/normalize.ts`)

Current `normalizeMigrosDeal()` returns a `UnifiedDeal`. Changes needed:

1. **Extract brand** from product name (new function: `extractBrand(name)`)
2. **Extract quantity + unit** from product name (new function: `extractQuantity(name)`)
3. **Detect organic flag** (new function: `isOrganic(name)`)
4. **Return extended type** -- either extend `UnifiedDeal` or return metadata alongside it

The Migros API already provides some structured data we currently ignore:
- `breadcrumb` array (source category -- we use this, but could extract sub-category)
- Product `uid` (could serve as a stable Migros-side product identifier)

### Coop Normalizer (`pipeline/coop/normalize.py`)

Same extraction logic as Migros, in Python:
1. `extract_brand(name)` -- match against known brand list
2. `extract_quantity(name)` -- regex parsing
3. `is_organic(name)` -- keyword check

Coop data from aktionis.ch has less structured metadata (no breadcrumbs, no product IDs), so we rely more heavily on name parsing.

### Categorizer (`pipeline/categorize.ts`)

Extend to also assign `sub_category`. The current `CATEGORY_RULES` array gets a `subCategory` field:

```typescript
// Before:
{ keywords: ['milch', 'joghurt', 'käse', ...], category: 'fresh' }

// After:
{ keywords: ['milch', 'joghurt', 'rahm', 'quark'], category: 'fresh', subCategory: 'dairy' }
{ keywords: ['poulet', 'fleisch', 'hackfleisch'], category: 'fresh', subCategory: 'meat' }
```

Same keyword-matching logic, just returns both `category` and `subCategory`.

### Storage (`pipeline/store.ts`)

Add a new step between categorization and deal upsert:

1. For each deal, look up `products` by `(store, source_name)`
2. If found: use existing `product_id`
3. If not found: create a new `products` row with extracted metadata, get `product_id`
4. Set `product_id` on the deal before upserting

This is a new function, roughly `resolveProduct(deal, metadata): product_id`.

### Pipeline Data Flow (After)

```
Raw API/HTML
  --> normalize (lowercase + extract brand, quantity, unit, organic)
  --> categorize (category + sub_category)
  --> resolve product (find or create in products table)
  --> upsert deal with product_id
```

---

## 7. Impact on Frontend

### Matching (`web/src/lib/matching.ts`)

The biggest beneficiary. The current `findBestMatch()` function is 40 lines of relevance scoring, compound word analysis, and exclude/prefer workarounds. With product groups, the core logic becomes:

```
For each favorite_item with a product_group_id:
  1. Find all products in that product_group
  2. Find active deals for those products
  3. Compare Migros deal vs Coop deal
```

No keyword searching, no exclude terms, no relevance scoring. The matching is exact because the product group explicitly defines which products are equivalent.

The keyword-based path stays as a fallback for favorites that haven't been migrated to product groups.

### Queries (`web/src/lib/queries.ts`)

New query functions:

- `getProductGroups()` -- for the favorites editor (replacing keyword-based search)
- `getDealsForProductGroup(groupId)` -- for the comparison view
- `getProductsWithActiveDeals()` -- for browsing

Existing queries remain unchanged.

### Display

With structured metadata, the frontend can show:
- **Brand** as a badge or subtitle ("Naturaplan", "M-Budget")
- **Quantity and unit** for unit price comparison ("CHF 1.60/L" vs "CHF 1.45/L")
- **Organic badge** where applicable
- **Sub-category** for more granular filtering

### Starter Packs

Currently, starter packs embed matching heuristics (exclude/prefer terms) in their JSONB items. With product groups, a starter pack item becomes:

```json
{
  "productGroupId": "milk-whole-1l",
  "label": "Milk"
}
```

No more excludeTerms, no more preferTerms. The product group handles matching.

---

## 8. Trade-offs and Alternatives Considered

### Decision 1: Separate Products Table vs. Metadata Columns on Deals

**Chosen: Separate table.** A product exists independently of any deal. The same product can have deals in many different weeks. Putting metadata on the deals table would mean duplicating brand/quantity/unit across every weekly row and having no stable product identity.

**Alternative rejected:** Adding columns directly to `deals`. Simpler migration but doesn't solve the core problem (no product identity, no cross-store matching, no price history).

### Decision 2: Manual Product Groups vs. Automated Matching

**Chosen: Manual (curated) product groups, with a path to automation.** With ~35 key products from starter packs, manual curation is faster and more reliable than building an automated matching system. Automation can come later when the product catalog grows.

**Alternative rejected:** Automated fuzzy matching. Higher effort to build, lower reliability for German compound words, and unnecessary at current scale.

### Decision 3: Flat Sub-Categories vs. Hierarchical Taxonomy

**Chosen: Flat sub-categories (single level).** A "dairy" sub-category is enough. We don't need "dairy > milk > whole milk > organic" levels of hierarchy. Flat is simpler to query, simpler to maintain, and sufficient for filtering.

**Alternative rejected:** Multi-level category tree. Adds complexity (recursive queries, tree management) with no clear benefit for a 3-category, 600-deal-per-week system.

### Decision 4: Product Groups as a Table vs. Computed

**Chosen: Explicit table.** Product groups are curated reference data, not computed on the fly. This makes them predictable and controllable. A computed approach (match by sub_category + quantity + unit) could be added later as an automated group suggestion feature.

**Alternative rejected:** Auto-grouping by metadata similarity. Works for obvious cases but fails for products where the "same" product has different quantities or descriptions across stores.

### Decision 5: Extend UnifiedDeal vs. Separate Metadata Type

**Chosen: Keep UnifiedDeal as-is, pass metadata alongside.** The UnifiedDeal type is the contract between the Python and TypeScript halves of the pipeline. Adding fields to it means changing the Python Coop scraper's output format. Instead, the TypeScript pipeline extracts metadata after receiving the UnifiedDeal, keeping the cross-language contract stable.

**Alternative considered:** Extend UnifiedDeal with optional metadata fields. Simpler code but breaks the clean boundary between "what the source provides" and "what the pipeline enriches."

### What This Doesn't Solve

- **Regular (non-deal) price comparison.** This design tracks deal prices only. Regular prices require a different data source (Migros product API, manual collection). Out of scope per the PRD.
- **Automatic discovery of new product groups.** If a user searches for a product that doesn't have a product group, they still fall back to keyword matching. Covering 100% of possible products requires either AI or a much larger manual catalog.
- **Multi-variant matching.** "Vollmilch 1L" and "Vollmilch 1.5L" are different product groups. The system doesn't automatically suggest "close alternatives" -- it matches exactly by group.

---

## Appendix: Seed Data for Product Groups

Based on the four existing starter packs, these are the initial product groups to create:

| product_group | label | category | sub_category | search_keywords |
|---|---|---|---|---|
| milk-whole-1l | Whole Milk (1L) | fresh | dairy | milch, vollmilch, halbfettmilch |
| bread-assorted | Bread | fresh | bread | brot, ruchbrot, toast, zopf, weggli |
| butter-250g | Butter (250g) | fresh | dairy | butter, bratbutter, vorzugsbutter |
| eggs-6pack | Eggs (6-pack) | fresh | eggs | eier, freiland |
| cheese-assorted | Cheese | fresh | dairy | käse, reibkäse, gruyere, emmentaler, appenzeller |
| yogurt-plain | Yogurt (plain) | fresh | dairy | joghurt, naturjoghurt, jogurt |
| chicken-breast | Chicken | fresh | poultry | poulet, pouletbrust, pouletflügeli, pouletschnitzel |
| tomatoes-fresh | Tomatoes | fresh | vegetables | tomaten, cherry, rispentomaten |
| onions | Onions | fresh | vegetables | zwiebeln |
| potatoes | Potatoes | fresh | vegetables | kartoffeln, festkochend, mehligkochend |
| pasta-assorted | Pasta | long-life | pasta-rice | pasta, spaghetti, penne |
| rice-assorted | Rice | long-life | pasta-rice | reis, basmati, jasmin |
| coffee-assorted | Coffee | long-life | coffee-tea | kaffee |
| chocolate-assorted | Chocolate | long-life | chocolate | schokolade, tafelschokolade |
| laundry-detergent | Laundry Detergent | non-food | laundry | waschmittel, waschpulver |
| toilet-paper | Toilet Paper | non-food | paper-goods | toilettenpapier |
| shampoo | Shampoo | non-food | personal-care | shampoo |
| garlic | Garlic | fresh | vegetables | knoblauch, knoblauchzehen |
| ginger | Ginger | fresh | vegetables | ingwer |
| coconut-milk | Coconut Milk | long-life | canned | kokosmilch |
| lentils | Lentils | long-life | canned | linsen |
| chickpeas | Chickpeas | long-life | canned | kichererbsen |
| spinach | Spinach | fresh | vegetables | spinat, blattspinat |
| bell-peppers | Bell Peppers | fresh | vegetables | peperoni |
| olive-oil | Olive Oil | long-life | condiments | olivenöl |
| mozzarella | Mozzarella | fresh | dairy | mozzarella, burrata |
| feta | Feta Cheese | fresh | dairy | feta |
| olives | Olives | long-life | canned | oliven, kalamata |
| naan-bread | Naan Bread | fresh | bread | naan |
| cooking-oil | Cooking Oil | long-life | condiments | öl, sonnenblumenöl, rapsöl |
| zucchini | Zucchini | fresh | vegetables | zucchetti |
| eggplant | Eggplant | fresh | vegetables | aubergine |
| salad-greens | Salad | fresh | vegetables | salat, eisberg, rucola, nüsslisalat |
| tuna-canned | Tuna | long-life | canned | thunfisch |
| chips | Chips | long-life | snacks | chips |
| toothpaste | Toothpaste | non-food | personal-care | zahnpasta |
| wine-assorted | Wine | long-life | drinks | rotwein, weisswein, rosé, prosecco |

37 product groups. Each maps to the products that users currently search for via favorites.
