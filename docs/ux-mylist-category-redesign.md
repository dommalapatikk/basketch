# UX Design: My List — Category-Based Redesign

**Author:** UX Design Agent
**Date:** 21 April 2026
**Status:** Draft — for PM + engineer review
**Inputs:** design-spec-v2.md, ComparisonPage.tsx, ProductSearch.tsx, shared/types.ts

---

## 1. Problem Summary

The current My List page (`/compare/:id`) tries to match each of the user's saved items to a specific product on promotion this week. This works when the product is actually on sale (e.g., "Milch" matches a Migros Vollmilch deal), but it fails silently for:

- Generic custom items like "BIO Onion" that do not match any current promotion name
- Items the user typed freely (not selected from a product group) that use different terminology
- Items in categories that are simply not on promotion this week

The result: most items show "No price data" or no match at all, and the list looks broken. The user's intent — "I buy onions. Are onions on deal anywhere this week?" — is never served.

**The fix:** Map each list item to its BROWSE_CATEGORY, then show all deals in that category from all stores. The user gets useful, actionable information even when their exact product is not on promotion.

---

## 2. Core Concept: What Changes

| Current behaviour | New behaviour |
|-------------------|---------------|
| "BIO Onion" matches deals with "onion" in the name | "BIO Onion" maps to Fruits & Vegetables; all F&V deals shown |
| Shows "No price data" when exact match fails | Shows the full category deal list |
| Limited to 3 stores | All 7 stores shown |
| Grouped by recommendation (Migros / Coop / Both / No deals) | Grouped by BROWSE_CATEGORY, then by store within each category |
| One row per item | One section per category, showing all current deals in that category |

---

## 3. Screen-by-Screen Flow

### 3.1 My List Page (`/compare/:id`) — Redesigned

#### 3.1.1 Page Header

```
+------------------------------------------+
| basketch      My List   Deals   About    |
+------------------------------------------+
|                                          |
|  Your deals this week                    |  <- H1, 24px, Bold
|  8 items tracked across 4 categories    |  <- 14px, muted
|  Deals updated: Thu 17 Apr               |  <- 14px, muted
|                                          |
|  [ Edit list ]                           |  <- Outline button, top-right
|                                          |
+------------------------------------------+
```

**Copy:**
- H1: "Your deals this week"
- Subhead pattern: "[N] items tracked across [M] categories"
- No more "4 on sale at Migros, 3 at Coop" — that was specific to exact matching which no longer applies

---

#### 3.1.2 Category Section (repeated for each category the user has items in)

This is the new core layout unit. One section per BROWSE_CATEGORY that has at least one of the user's items.

```
+------------------------------------------+
|                                          |
|  Fruits & Vegetables                     |  <- H2, 18px, SemiBold, with emoji
|  Your list: BIO Onion, Tomatoes          |  <- 13px, muted. Comma-separated item names.
|                                          |
+------------------------------------------+
|  MIGROS  --  9 deals                     |  <- Store sub-header, store color
+------------------------------------------+
| +--------------------------------------+ |
| |  [img]  Karotten 1kg                 | |
| |         CHF 0.95  was CHF 1.50  -37% | |
| +--------------------------------------+ |
| +--------------------------------------+ |
| |  [img]  Bio Zwiebeln 500g            | |
| |         CHF 1.20  was CHF 1.80  -33% | |
| +--------------------------------------+ |
|  ... (show max 5, then "Show more")      |
+------------------------------------------+
|  COOP  --  6 deals                       |  <- Green sub-header
+------------------------------------------+
| +--------------------------------------+ |
| |  [img]  Tomaten 500g                 | |
| |         CHF 1.50  was CHF 2.20  -32% | |
| +--------------------------------------+ |
|  ...                                     |
+------------------------------------------+
|  LIDL  --  4 deals                       |
|  ALDI  --  2 deals                       |
|  DENNER  --  0 deals this week           |  <- Collapsed/muted
|  SPAR  --  0 deals this week             |
|  VOLG  --  0 deals this week             |
+------------------------------------------+
```

**Key decisions in this layout:**
- Stores with 0 deals in the category are shown but collapsed — the user can see all 7 stores exist, without being overwhelmed by empty sections
- Stores with deals are fully expanded by default
- Max 5 deal cards per store before a "Show more" button — the user only wants to know what is on deal, not browse every deal in the category
- "Your list: [item names]" is the link between what they saved and what they are seeing — it makes the page feel personal

---

#### 3.1.3 Empty Category Section (no deals at any store this week)

When ALL 7 stores have 0 deals in a category:

```
+------------------------------------------+
|                                          |
|  Bakery                                  |
|  Your list: Bread, Croissants            |
|                                          |
|  No Bakery deals this week at any store. |  <- 14px, muted, centered
|  Check back Thursday evening.            |  <- 13px, muted
|                                          |
+------------------------------------------+
```

This still shows the section (so the user knows the category was checked), but the message is informative rather than broken-looking.

---

#### 3.1.4 Save / Share Strip

Moved to just below the header (above category sections), matching current ComparisonPage position:

```
+------------------------------------------+
|  [ Copy link ]  [ Share ]                |
|  Bookmark this page to check every week  |  <- 12px, muted, right-aligned
+------------------------------------------+
```

This stays the same as the current implementation.

---

#### 3.1.5 Full Page Example

Minimal example — user has: BIO Onion, Tomatoes, Milk, Bread, Coffee

```
+------------------------------------------+
| basketch      My List   Deals   About    |
+------------------------------------------+
|  Your deals this week                    |
|  5 items tracked across 3 categories    |
|  Deals updated: Thu 17 Apr               |  [ Edit list ]
+------------------------------------------+
|  [ Copy link ]  [ Share ]    Bookmark.. |
+------------------------------------------+
|                                          |
|  Fruits & Vegetables                     |
|  Your list: BIO Onion, Tomatoes          |
|                                          |
|  MIGROS -- 9 deals                       |
|  [deal cards x5]  [ Show 4 more ]        |
|                                          |
|  COOP -- 6 deals                         |
|  [deal cards x5]  [ Show 1 more ]        |
|                                          |
|  LIDL -- 3 deals / ALDI -- 2 deals       |  <- Inline summary for stores with few deals
|  DENNER / SPAR / VOLG -- 0 deals        |  <- All 0s grouped in one muted line
|                                          |
+------------------------------------------+
|                                          |
|  Dairy & Eggs                            |
|  Your list: Milk                         |
|                                          |
|  MIGROS -- 12 deals                      |
|  [deal cards]                            |
|  ...                                     |
|                                          |
+------------------------------------------+
|                                          |
|  Bakery                                  |
|  Your list: Bread                        |
|                                          |
|  No Bakery deals this week at any store. |
|  Check back Thursday evening.            |
|                                          |
+------------------------------------------+
|                                          |
|  Drinks                                  |
|  Your list: Coffee                       |
|                                          |
|  MIGROS -- 5 deals                       |
|  [deal cards]                            |
|  ...                                     |
|                                          |
+------------------------------------------+
|  [ Edit my list ]                        |
+------------------------------------------+
|  basketch -- Swiss grocery deals, ..     |
+------------------------------------------+
```

---

### 3.2 Add Item Flow (ProductSearch + FavoritesEditor) — Fixes

#### 3.2.1 Current Problem

When the user types "cake" and nothing is found, they can click "Add 'cake' to my list" — but the item does not visibly appear in the list. This is a bug. There is also no category assignment shown for custom items.

#### 3.2.2 Redesigned Add Item Flow

**Step 1: User opens search (tap "+ Add")**

```
+------------------------------------------+
|  Search for a product                    |  <- 14px, SemiBold
|  [cake              ] [ Search ]         |
+------------------------------------------+
```

**Step 2a: Results found**

```
+------------------------------------------+
|  [cake              ] [ Search ]         |
|                                          |
|  Coop Geburtstagskuchen 450g    [ Add ]  |
|  Bakery  --  Coop: CHF 4.50 -25%        |
|                                          |
|  Migros Blechkuchen 300g        [ Add ]  |
|  Bakery  --  Migros: CHF 3.20 -20%      |
|                                          |
|  Not what you are looking for?           |  <- 13px, muted
|  [ Add "cake" as a keyword ]             |  <- Outline button
+------------------------------------------+
```

Each result now shows the BROWSE_CATEGORY label ("Bakery") beneath the product name. This primes the user to understand the category-based system.

**Step 2b: No results found**

```
+------------------------------------------+
|  [cake              ] [ Search ]         |
|                                          |
|  No products found for "cake".           |  <- 14px, muted
|                                          |
|  We will track Bakery deals for you.     |  <- Category the keyword maps to, 14px
|                                          |
|  [ Add "cake" to my list ]               |  <- Primary button (not outline -- this is the only action)
+------------------------------------------+
```

The text "We will track Bakery deals for you" tells the user what will happen — the system maps "cake" to Bakery and will show Bakery deals on their My List page. This sets correct expectations before they add the item.

**Step 3: Item added — confirmation**

After tapping Add (either from results or custom):

1. The search panel collapses (or clears)
2. A Toast appears: "Cake added to Bakery" (2 seconds, bottom-center)
3. The item immediately appears in the favorites list with a green left border for 2 seconds, then fades to normal

```
+------------------------------------------+
|  Your favorites (9)        [ + Add ]     |
+------------------------------------------+
|  Milk                               [x]  |
|  Dairy & Eggs                            |  <- Category label, 12px, muted
+------------------------------------------+
|  Bread                              [x]  |
|  Bakery                                  |
+------------------------------------------+
|  Cake              <- NEW, green border  |
|  Bakery                                  |
+------------------------------------------+
|  ...                                     |
+------------------------------------------+
```

Each item in the favorites list now shows its BROWSE_CATEGORY below its name (12px, muted). This makes the category mapping visible and reviewable.

---

### 3.3 Item-to-Category Mapping UX

#### 3.3.1 How mapping works (visible to the user)

Every item in the favorites list shows its mapped category in 12px muted text below the item name. This is read-only during normal list viewing, but editable on tap.

#### 3.3.2 Can the user change the category?

Yes. Tap the category label to open a category picker:

```
+------------------------------------------+
|  Change category for "Cake"              |  <- Bottom sheet or modal
|                                          |
|  ( ) Fruits & Vegetables                 |
|  ( ) Meat & Fish                         |
|  ( ) Dairy & Eggs                        |
|  (.) Bakery                 <- current   |
|  ( ) Snacks & Sweets                     |
|  ( ) Pasta, Rice & More                  |
|  ( ) Drinks                              |
|  ( ) Ready Meals & Frozen                |
|  ( ) Pantry & Canned                     |
|  ( ) Home & Cleaning                     |
|  ( ) Beauty & Hygiene                    |
|                                          |
|  [ Save ]                  [ Cancel ]    |
+------------------------------------------+
```

This is a radio list. On mobile, it appears as a bottom sheet (slides up from bottom). On desktop, it is a small popover.

After saving, a Toast confirms: "Cake moved to Snacks & Sweets".

#### 3.3.3 What if an item could map to 2 categories?

The system picks one category and assigns it. If the auto-assignment is wrong (e.g., "yogurt drink" lands in Drinks instead of Dairy), the user can correct it using the picker above. No dual-category mapping is shown — that would create complexity with no clear benefit for a small app.

Default mapping logic (for the engineer): use the category assigned during ProductSearch. For custom keywords with no category data, default to the most common category for that word using a simple keyword lookup table, or fall back to "Pantry & Canned" as the generic catch-all.

---

### 3.4 Store Comparison Within a Category

**Chosen approach: Option C — card per store with their deals**

Rationale:
- Option A (horizontal store row) works on desktop but collapses badly on mobile at 375px
- Option B (store pills as filter) requires user interaction to see each store — this hides information
- Option C (store as a sub-section within each category) is the simplest mental model: "Here is what Migros has on deal in Fruits & Veg. Here is what Coop has."

The user can scan vertically to compare stores. This is how they already read the Deals browsing page, so it is familiar.

**Compact store sub-header:**

```
+------------------------------------------+
|  MIGROS  --  9 deals this week           |  <- 12px, uppercase, SemiBold, migros-text color
+------------------------------------------+
```

This is visually identical to the store section headers on the Deals page, which keeps the design system consistent.

**Stores with 0 deals:**

Rather than showing empty store sections (which waste space), stores with 0 deals in a category are collapsed into a single muted line at the bottom of the category section:

```
Denner, SPAR, Volg — no deals in this category this week
```

12px, muted, italic. Appears after all the expanded store sections.

This tells the user all 7 stores were checked, without cluttering the layout with 3 empty sections.

---

## 4. Component Structure

### 4.1 New and Modified Components

| Component | Status | What it does |
|-----------|--------|--------------|
| `CategoryDealsSection` | New | One section per BROWSE_CATEGORY. Takes category info + items in that category + deals in that category. |
| `StoreDealList` | New | Deals from one store within a category. Shows up to 5 by default, "Show more" button for the rest. |
| `EmptyStoreLine` | New | Single muted line listing stores with 0 deals: "Denner, SPAR, Volg — no deals this week" |
| `CategoryEmptyState` | New | Full section empty state when ALL stores have 0 deals in a category |
| `ItemCategoryPicker` | New | Bottom sheet / popover for changing an item's assigned category |
| `FavoriteItem` (modified) | Modified | Add category label (12px, muted) below item name. Make category label tappable. |
| `ProductSearch` (modified) | Modified | Show category label in results. Update "add custom" flow to show predicted category. |
| `ComparisonPage` (modified) | Modified | Replace SplitList with CategoryDealsSection list. Remove 3-store limit. Remove store filter pills. |
| `Toast` (existing) | Existing | Already exists. Add "Item added to [Category]" message support. |

### 4.2 Component Hierarchy (new ComparisonPage)

```
ComparisonPage
  Header (shared)
  PageHeader
    H1: "Your deals this week"
    ItemCategoryCount ("N items tracked across M categories")
    DataFreshness
    EditListButton
  ShareStrip
    CopyLinkButton + ShareButton
  CategoryDealsSection (x M, one per category)
    CategoryHeader (emoji + label + "Your list: item1, item2")
    StoreDealList (x stores with deals)
      StoreSubHeader (store name + deal count, store-colored)
      DealCard (x max 5, then ShowMoreButton)
    EmptyStoreLine (collapsed, for 0-deal stores)
    CategoryEmptyState (only if ALL stores have 0 deals)
  EditListButton (bottom)
  Footer (shared)
```

### 4.3 Data Requirements

The page needs:
1. The user's basket items (already fetched via `useBasketItems`)
2. All active deals, with their `sub_category` field (already fetched via `useActiveDeals`)
3. The BROWSE_CATEGORIES mapping to translate items to categories and sub_categories to categories (already in `shared/types.ts`)
4. No new API calls needed — this is a client-side reorganisation of existing data

**Mapping logic (client-side, in a new utility function):**

```
itemToCategory(item) -> BrowseCategory
  if item.browseCategory is set -> use it
  if item.productGroupId -> look up which sub_category the group belongs to -> map to BrowseCategory
  else -> keyword lookup table -> BrowseCategory (or fallback: 'pantry-canned')

dealsForCategory(category, allDeals) -> DealRow[]
  find all deals where BROWSE_CATEGORIES[category].subCategories includes deal.sub_category
```

---

## 5. Interaction Notes

### 5.1 On Tap / Click

| Element | Action |
|---------|--------|
| Category label on a FavoriteItem | Opens ItemCategoryPicker (bottom sheet on mobile) |
| "Add" on a search result | Adds item, shows Toast "X added to [Category]", item appears immediately in list with green border flash |
| "Add X to my list" (custom keyword) | Same as above |
| "Show more" on a StoreDealList | Expands to show all deals in that store's section for the category. Button text changes to "Show fewer" |
| "Edit list" (top-right) | Links to `/onboarding?edit=:id` (same as current) |
| Category pill on Deals page | Not changed — this redesign only affects the My List page |

### 5.2 Scroll Behaviour

- Page scrolls naturally top to bottom
- Category sections are not sticky — they scroll with the page
- On long pages (many categories), no scroll anchoring is applied (keep it simple)
- Store sub-headers within a category section are NOT sticky — they scroll with the category

### 5.3 "Show more" within a StoreDealList

- Default: show 5 deal cards per store per category
- On tap "Show 4 more": expand inline to show all deals in that store section
- No pagination — all deals load at once (deal lists are small, max ~50 per category per store)
- Button text: "Show [N] more [Store] deals" (e.g., "Show 4 more Migros deals")
- After expanding: "Show fewer" button collapses back to 5

---

## 6. Copy Reference

| Element | Text |
|---------|------|
| Page H1 | "Your deals this week" |
| Page subhead | "[N] items tracked across [M] categories" |
| Category header | "[Emoji] [Category name]" (e.g., "Fruits & Vegetables") |
| Category item list | "Your list: [item1], [item2], [item3]" |
| Store sub-header | "[STORE] -- [N] deals this week" |
| Show more button | "Show [N] more [Store] deals" |
| Show fewer button | "Show fewer" |
| Empty store line | "[Store1], [Store2] -- no deals in this category this week" |
| All stores empty | "No [Category] deals this week at any store." |
| All stores empty subtext | "Check back Thursday evening." |
| Toast: item added | "[Item name] added to [Category]" |
| Toast: category changed | "[Item name] moved to [Category]" |
| Category picker title | "Change category for [Item name]" |
| Category picker save | "Save" |
| Search result category hint | "[Category label]" (below product name, 12px, muted) |
| No search results | "No products found for [query]." |
| No results category hint | "We will track [Category] deals for you." |
| Add custom button | "Add [query] to my list" |

---

## 7. States

### 7.1 Loading

- Same skeleton animation as current (4 skeleton cards)
- No change needed here

### 7.2 Empty List

- Same as current: prompt to create a list via `/onboarding`

### 7.3 All Categories Empty (no deals anywhere this week)

- Show all category sections with their items listed, but each shows the "No deals this week" empty state
- Do NOT show a page-level "nothing on sale" message — the category-by-category view is more informative than a single block message
- Exception: if the data freshness is stale (> 7 days), show the StaleBanner, which will explain why

### 7.4 Single Category (user only has items in 1 category)

- Page works exactly the same — just one CategoryDealsSection
- No special case needed

### 7.5 Item with Unknown Category

- If an item has no category assigned and cannot be looked up, assign it to "Pantry & Canned" as the fallback
- Show the category label as normal — user can tap to correct it
- Do not show a warning or flag — just pick the most reasonable default

---

## 8. Accessibility

- Each CategoryDealsSection is a `<section>` with `aria-label="[Category name] deals"`
- Category H2 headings inside each section
- StoreDealList uses `role="list"` (inherits from DealCard list, which already uses `<article>`)
- ItemCategoryPicker: bottom sheet is `role="dialog"` with `aria-modal="true"` and `aria-label="Change category for [item name]"`. Radio list inside follows standard radio group pattern. Focus trap applies.
- Toast messages use existing Toast component (`role="status"`, `aria-live="polite"`)
- "Show more" button: `aria-expanded="false"` / `"true"`, `aria-controls="[section-id]"`
- Category label tappable area: minimum 44px touch target (the entire row is tappable, not just the text)

---

## 9. What Does NOT Change

- The `/onboarding` wizard flow is unchanged except for showing category labels on items (section 3.2)
- The Deals browsing page (`/deals`) is unchanged
- The CompareCard component (side-by-side store comparison per item) is retired for the My List page — it is replaced by the category + store sections. It may still be used elsewhere or kept for potential future use
- The SplitList component is retired from ComparisonPage but can stay in the codebase
- The 3-store filter and `MAX_COMPARE_STORES` logic in ComparisonPage.tsx is removed entirely — no filtering, all 7 stores always shown
- The store summary cards (CHF totals per store) and "estimated savings by splitting" calculation are removed — they do not apply to the category view
- URL structure stays the same: `/compare/:id`

---

## 10. Open Questions for PM / Engineer

| # | Question | Options | Who decides |
|---|----------|---------|-------------|
| 1 | Should the category sections be sorted in a fixed order (the BROWSE_CATEGORIES order), or should categories with the most deals this week float to the top? | Fixed order = predictable. Deals-first = more immediately useful. | PM |
| 2 | The current CompareCard showed exact price data per item ("Milk: CHF 1.50 at Migros"). The new design loses that exact-match view. Is that acceptable, or do we want a hybrid — show category deals AND highlight if one of the deals matches your exact item? | Hybrid is more complex. Category-only is simpler. | PM |
| 3 | For the ItemCategoryPicker, should changing a category update the item in the database, or only in localStorage for the session? | Persisting is better UX but requires a DB write. Session-only is simpler. | Engineer |
| 4 | The "We will track [Category] deals for you" message in the no-results flow requires the system to predict a category for a free-text keyword before it is added. What is the keyword-to-category lookup mechanism? A simple keyword list in the codebase, or a call to the database? | Keyword list in code = fast and offline-capable. DB call = more accurate but adds latency. | Engineer |
| 5 | Should the "Show more" threshold per store be 5 deals (as specified here), or should it vary? A category like Dairy might have 20 Migros deals — showing 5 is a useful default, but engineer may prefer a different number for implementation reasons. | 5 is the UX default. Adjust if needed. | Engineer |
| 6 | The current 3-store filter was a deliberate cap (CompareCard was a 2-column layout — more than 2-3 stores was impractical). The new design has no such layout constraint. Confirm: removing the filter entirely is acceptable, and all 7 stores will always be shown. | Yes / No | PM |
| 7 | Should category sections with all-zero deals be hidden entirely (to keep the page short), or always shown (to confirm the check happened)? The current spec shows them with an empty state message. | Show = transparent. Hide = cleaner. | PM |
