# Category-Based Matching — Architecture Notes

**Date:** 2026-04-21  
**Status:** Design proposal — not yet implemented

---

## Part 1: Bug Fixes (Already Applied)

### Bug 1 — Items not appearing after add

**File:** `web/src/lib/queries.ts` — `addFavoriteItem()` (deprecated legacy function)

**Root cause:**  
`addFavoriteItem` had its own direct RPC call to `add_favorite_item`. The modern equivalent `addBasketItem` also calls the same RPC but handles the response correctly: it checks `if (error || !data)` and throws on failure, then maps the result through a typed conversion. The legacy `addFavoriteItem` only checked `if (error)` and returned `data as FavoriteItemRow` directly. 

In Supabase JS v2, an RPC that returns a single composite row can return data in a shape that differs from what a naïve cast expects. The modern `addBasketItem` path is tested and known-good. The legacy path was not tested after the refactor introduced `addBasketItem`.

**Fix applied:**  
`addFavoriteItem` now delegates to `addBasketItem` and maps the `BasketItem` result (camelCase) back to `FavoriteItemRow` (snake_case) for the legacy callers (`FavoritesEditor`, `OnboardingPage`). This is the same delegation pattern already used by `removeFavoriteItem → removeBasketItem`.

**Affected components:**
- `web/src/components/FavoritesEditor.tsx` — calls `addFavoriteItem`, updates local state on success
- `web/src/pages/OnboardingPage.tsx` — uses `FavoritesEditor` as a child; passes `setItems` as `onItemsChange`

No changes needed in either component — the fix is entirely in `queries.ts`.

---

### Bug 2 — 3-store limit on ComparisonPage

**File:** `web/src/pages/ComparisonPage.tsx`

**Root cause:**  
`MAX_COMPARE_STORES = 3` constant, `storeLimit` state, and a guard in `toggleStore()` prevented users from selecting more than 3 stores. A warning banner was shown when the limit was hit.

**Fix applied:**  
- Removed `MAX_COMPARE_STORES` constant  
- Removed `storeLimit` state and `setStoreLimit` calls  
- Simplified `toggleStore()` — now allows adding any store freely; only prevents deselecting the last store  
- Removed the warning banner JSX block

Users can now select all 7 stores. The summary cards section (`storesWithItems.slice(0, 3)`) still shows only the top 3 stores by item count, which is a UI layout decision, not a data restriction.

`DealsPage.tsx` was not changed — the user's concern was specifically about the My List / ComparisonPage view.

---

## Part 2: Category-Based Matching — Architecture Design

### Current system (keyword matching)

Each `FavoriteItemRow` has:
- `keyword` — e.g., `"zwiebeln"`
- `label` — e.g., `"Onions"`
- `category` — one of `fresh | long-life | non-food`
- `product_group_id` — optional, links to `product_groups` table

`matchFavorites()` in `matching.ts` uses two paths:
1. **Product group path** — if `product_group_id` is set, matches by `product_id` linkage (exact)
2. **Keyword path** — fuzzy matching via `findBestMatch()` and `matchRelevance()`

Result: one best deal per store per item.

### New system — Browse category matching

Instead of "find the best deal for BIO Onion at each store," show **all deals in the Fruits & Vegetables category** from all stores. The item acts as a proxy for its category, not a specific product.

---

### Item → BrowseCategory mapping

#### The problem

`FavoriteItemRow` has `category: fresh | long-life | non-food` — this is too coarse. Multiple `BrowseCategory` values share the same `category` (e.g., `fruits-vegetables`, `meat-fish`, `dairy`, `bakery` are all `fresh`). We need a way to know which of the 11 `BrowseCategory` values an item belongs to.

#### Option A — Use `product_group_id` (best path when available)

`product_groups` table has `sub_category` (e.g., `"vegetables"`, `"meat"`, `"dairy"`). Each `sub_category` maps to exactly one `BrowseCategory` via `BROWSE_CATEGORIES[].subCategories`. 

Mapping function (pure, no DB call):

```ts
function subCategoryToBrowseCategory(subCategory: string | null): BrowseCategory | null {
  if (!subCategory) return null
  const found = BROWSE_CATEGORIES.find((bc) => bc.subCategories.includes(subCategory))
  return found?.id ?? null
}
```

For items with `product_group_id`, fetch the group's `sub_category` from the already-loaded `ProductGroupRow[]` (available in hooks as `useProductGroups()`). This is zero extra queries — groups are already cached.

#### Option B — Store `browse_category` in DB when item is added

Add a `browse_category` column to `favorite_items`. Populate it during `add_favorite_item` RPC or in the frontend before calling the API. Requires a DB migration and updates to the RPC.

**Not recommended for v1** — adds DB complexity for something derivable from existing data.

#### Option C — Keyword → BrowseCategory lookup table

For items without a `product_group_id` (custom items added via free text), maintain a lookup table mapping common German keywords to browse categories:

```ts
const KEYWORD_CATEGORY_MAP: Record<string, BrowseCategory> = {
  'zwiebeln': 'fruits-vegetables',
  'tomaten': 'fruits-vegetables',
  'poulet': 'meat-fish',
  'milch': 'dairy',
  'brot': 'bakery',
  // ...
}
```

This is maintainable for the ~100 most common items. Falls back to `null` (item excluded from category view) if no match found.

#### Recommended approach

1. **If `product_group_id` is set** → derive `BrowseCategory` from `ProductGroupRow.sub_category` using `subCategoryToBrowseCategory()`. Covers all starter pack items and any item added via the product search flow.
2. **If no `product_group_id`** → try keyword lookup table. If no match, the item is not included in category browsing (it remains in keyword matching only).
3. **Do not add a DB column yet** — derive at query time. If the keyword map becomes unwieldy (>150 entries), revisit adding `browse_category` to the DB.

---

### What to show per category

For each `BrowseCategory` that one or more of the user's items maps to, show **all active deals** in that category from all stores. Not filtered to the specific item — the full category view.

Example: User has "BIO Onion" → maps to `fruits-vegetables` → show all fruit & vegetable deals from Migros, Coop, Lidl, etc.

This reuses `fetchDealsByCategory(browseCategory)` which already exists in `queries.ts` and queries by `sub_category IN (...)`.

---

### New TypeScript types needed

```ts
/**
 * A user's list item resolved to a BrowseCategory, with all deals in that category.
 */
export interface CategoryMatch {
  browseCategory: BrowseCategory
  browseCategoryLabel: string         // e.g., "Fruits & Vegetables"
  sourceItems: BasketItem[]           // which of the user's items triggered this category
  deals: Partial<Record<Store, DealRow[]>>  // all deals in category, grouped by store
  totalDealCount: number
}

/**
 * Result of category-based matching for all user items.
 */
export interface CategoryMatchResult {
  categories: CategoryMatch[]         // one entry per distinct BrowseCategory found
  unmappedItems: BasketItem[]         // items with no BrowseCategory mapping
}
```

Multiple items can map to the same `BrowseCategory` (e.g., "Onions" and "Tomatoes" both → `fruits-vegetables`). They are grouped into a single `CategoryMatch` — `sourceItems` lists both.

---

### Changes needed in matching.ts

#### New function: `resolveBrowseCategory()`

```ts
/**
 * Resolve a BasketItem to its BrowseCategory.
 * Uses product group sub_category if available; falls back to keyword map.
 */
export function resolveBrowseCategory(
  item: BasketItem,
  productGroups: ProductGroupRow[],
): BrowseCategory | null
```

This is a pure function — no async, no DB calls. Called at render time with already-loaded data.

#### New function: `matchFavoritesByCategory()`

```ts
/**
 * Group user items by BrowseCategory and return category-level deal views.
 * Replaces matchFavorites() for the category-based comparison view.
 */
export function matchFavoritesByCategory(
  favorites: BasketItem[],
  dealsByCategory: Map<BrowseCategory, DealRow[]>,
  productGroups: ProductGroupRow[],
): CategoryMatchResult
```

The caller (a new hook or the ComparisonPage itself) pre-fetches deals for all relevant categories. The function groups items, assigns deals, and returns `CategoryMatchResult`.

#### Keep matchFavorites() as-is

The existing keyword/product-group matching stays for the current "My List" view. Category matching is a new parallel view, not a replacement — at least initially.

---

### DB schema changes

**None required for v1.**

All data needed is already in the DB:
- `favorite_items` has `product_group_id` and `keyword`
- `product_groups` has `sub_category`
- `deals` has `sub_category`
- The `BROWSE_CATEGORIES` constant maps `sub_category → BrowseCategory`

If the keyword lookup table becomes too large to maintain in code, a future migration could add:

```sql
ALTER TABLE favorite_items ADD COLUMN browse_category text;
```

With a CHECK constraint against the 11 valid values. Populated by the `add_favorite_item` RPC using a CASE statement on `sub_category`. This is a non-breaking change — nullable, with the frontend falling back to derivation if null.

---

### Implementation plan (ordered)

1. **Add `resolveBrowseCategory()` to `matching.ts`**  
   Pure function. Takes `BasketItem` + `ProductGroupRow[]`, returns `BrowseCategory | null`.  
   Unit-testable with no DB dependency.

2. **Add the keyword → BrowseCategory fallback map**  
   Start with the ~50 most common keywords from existing starter packs. Put in `matching.ts` or a new `category-map.ts` file.

3. **Add `matchFavoritesByCategory()` to `matching.ts`**  
   Takes pre-fetched deals (by category) + items + product groups. Returns `CategoryMatchResult`.

4. **Add a new hook `useCategoryMatches(basketId)`**  
   - Calls `useBasketItems()` and `useProductGroups()` (both already cached)
   - Resolves each item to a `BrowseCategory`
   - Fetches deals for each distinct category via `fetchDealsByCategory()` (parallel)
   - Calls `matchFavoritesByCategory()` and returns the result

5. **Add a new UI view**  
   Either a new route (`/compare/:id/categories`) or a tab toggle on the existing ComparisonPage. Renders one card per `CategoryMatch` showing store deal counts and best discounts.

6. **Do not modify the existing ComparisonPage keyword matching** until the category view is validated with users.
