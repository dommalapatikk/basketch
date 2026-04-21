# UX Design: Unified Deals + My List Redesign

**Project:** basketch  
**Date:** April 2026  
**Scope:** Merge the separate Deals browsing and My List (ComparisonPage) experiences into one unified page

---

## 1. The Unified Page Concept

### What is the page called?

**"Deals"** — a single, direct label. No "My List", no "Comparison", no "Browse". Just Deals. The navigation item is `Deals`.

The idea that "my list lives inside deals" is expressed through the UI, not through a separate navigation destination.

### What does the user see when they land?

The page loads into a scrollable list of deal cards, sorted by discount percentage descending. The top-of-page filter strip (store pills + category tabs) is immediately visible. There is no splash screen, no onboarding gate, and no empty state on first visit — deals are shown to everyone.

The "my list" is not a separate page. It is a **sticky bottom bar** that appears as soon as the user adds their first item. It shows a count badge and a share button. Tapping the bar expands it into a slide-up panel (not a navigation transition).

### How is "My List" surfaced?

**Sticky bottom bar** — always visible once the list has at least one item.

```
┌─────────────────────────────────────────────────┐
│  🛒  My List  · 4 items         [Share on WhatsApp] │
└─────────────────────────────────────────────────┘
```

- Before any items are added: bar is hidden entirely
- After first add: bar slides up from bottom with a brief scale animation
- The count badge updates in real time each time an item is added or removed
- Tapping anywhere on the bar (except the share button) expands the list panel
- The share button triggers the WhatsApp share flow directly without expanding the panel first

This is preferable to a tab, a modal button, or a count badge on a navigation item because:
- It keeps the user on the same page — no context switch
- It makes the list feel like an accumulation of actions taken on the current screen
- The share button is one tap from anywhere in the deal list

---

## 2. Deal Card Redesign

### Design goals

- Product card feel, not table row
- Image (or clean fallback) is prominent
- Price hierarchy is clear: sale price > original price > discount badge
- Weight/quantity is part of the product name, not hidden
- The add/remove button is large, thumb-friendly, and changes state visually

### ASCII wireframe — 375px width

```
┌────────────────────────────────────────────────┐
│  ┌────────┐  MIGROS                    ╔══════╗ │
│  │        │  Karotten 1kg              ║  +   ║ │
│  │ [img]  │                            ║      ║ │
│  │  or    │  CHF 0.95  ~~1.50~~        ╚══════╝ │
│  │  [M]   │                   [ -37% ]          │
│  └────────┘                                     │
└────────────────────────────────────────────────┘
```

After add:

```
┌────────────────────────────────────────────────┐
│  ┌────────┐  MIGROS                    ╔══════╗ │
│  │        │  Karotten 1kg              ║  ✓   ║ │
│  │ [img]  │                            ║      ║ │
│  │        │  CHF 0.95  ~~1.50~~        ╚══════╝ │
│  └────────┘                   [ -37% ]          │
└────────────────────────────────────────────────┘
```

After re-tap (remove mode):

```
┌────────────────────────────────────────────────┐
│  ┌────────┐  MIGROS                    ╔══════╗ │
│  │        │  Karotten 1kg              ║  −   ║ │
│  │ [img]  │                            ║      ║ │
│  │        │  CHF 0.95  ~~1.50~~        ╚══════╝ │
│  └────────┘                   [ -37% ]          │
└────────────────────────────────────────────────┘
```

### Tailwind classes for key elements

**Card container:**
```
article  rounded-xl border border-border bg-white p-3 flex gap-3 items-start
```

**Product image / fallback:**
```
size-16 shrink-0 rounded-lg object-contain bg-gray-50
```
Fallback div (no image):
```
size-16 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-lg font-bold text-muted
```
Fallback shows the first letter of the store name (already done in current DealCard — keep this).

**Store badge:**
```
inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white
```
(Background color applied via inline style using `STORE_META[store].hex` — keep existing approach.)

**Product name line** (includes weight from `product_name` field, e.g. "Karotten 1kg"):
```
text-sm font-semibold leading-snug line-clamp-2 mt-0.5
```
Note: `line-clamp-2` instead of `line-clamp-1` — product names with weight can be long. Two lines at 375px is fine.

**Price row:**
```
mt-1.5 flex items-baseline gap-2 flex-wrap
```

Sale price:
```
text-base font-bold text-gray-900
```

Original price (strikethrough):
```
text-xs text-muted line-through
```

Discount badge:
```
ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white
```
(Background: store hex color — keep existing approach.)

**Add/Remove toggle button:**
```
size-11 shrink-0 self-center rounded-full flex items-center justify-center
transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
```

State classes (applied conditionally):
- Default (not in list): `bg-gray-100 text-gray-500 hover:bg-gray-200`
- Just added (brief flash): `bg-green-500 text-white scale-110`
- In list (remove mode): `bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600`
- Error: `bg-red-100 text-red-600`

The `scale-110` class on the "just added" flash is the key micro-interaction — see Section 6.

---

## 3. Category System Proposal

### The problem with the current 2-level system

The current system has 11 browse categories. Within "Fruits & Vegetables" you see 40+ deals with no way to narrow further. The `sub_category` field in the DB already contains fine-grained values (e.g. `fruit`, `vegetables`, `meat`, `poultry`, `fish`, `deli`) — we can expose these directly as Level 3 filters.

### Proposed 3-level hierarchy

```
Level 1 (top tabs):     Fresh | Long-life | Household
Level 2 (browse pills): 11 existing browse categories
Level 3 (sub-pills):    granular sub-categories — NEW
```

Level 3 appears as a second row of smaller pills, only when a Level 2 category is active.

### Full Level 3 sub-categories — examples for 3 Level 2 categories

**Fruits & Vegetables** (`fruits-vegetables`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Fruit             | `fruit`               |
| Vegetables        | `vegetables`          |

This one only has two, but they're genuinely different shopping decisions (separate sections of a store). Worth exposing.

**Meat & Fish** (`meat-fish`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Beef & Pork       | `meat`                |
| Poultry           | `poultry`             |
| Fish & Seafood    | `fish`                |
| Deli & Charcuterie| `deli`                |

This is the most valuable Level 3 expansion. A user who eats no meat but buys fish should not scroll through beef deals.

**Drinks** (`drinks`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Soft Drinks & Water | `drinks`            |
| Coffee & Tea      | `coffee-tea`          |

**Pantry & Canned** (`pantry-canned`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Canned Goods      | `canned`              |
| Sauces & Condiments | `condiments`        |

**Home & Cleaning** (`home`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Cleaning Products | `cleaning`            |
| Laundry           | `laundry`             |
| Paper Goods       | `paper-goods`         |
| General Household | `household`           |

**Ready Meals & Frozen** (`ready-meals-frozen`)
| Level 3 label     | DB sub_category value |
|-------------------|-----------------------|
| Ready Meals       | `ready-meals`         |
| Frozen            | `frozen`              |

### How the filter UI changes with 3 levels

The current filter strip has:
- Row 1: Top-level tabs (All / Fresh / Long-life / Household)
- Row 2: Browse category pills (only when a top-level is selected)
- Row 3: Store filter pills

With 3 levels, add a third pill row that appears only when a Level 2 category is active:

```
Row 1:  [All]  [Fresh]  [Long-life]  [Household]         ← tabs, full width
Row 2:  [All Fresh]  [Fruits & Veg]  [Meat & Fish] ...   ← pills, scrollable
Row 3:  [All Meat]  [Beef & Pork]  [Poultry]  [Fish] ... ← pills, scrollable (conditional)
Row 4:  [Migros]  [Coop]  [LIDL]  ...                    ← store pills
```

Row 3 is hidden when:
- No Level 2 category is selected
- The active Level 2 category has only one Level 3 sub-category in the current data

This is a purely additive change — no existing URL routing or filter logic breaks. Add a `?sub2=` URL param alongside the existing `?sub=` param.

**Important implementation note:** Level 3 should only show sub-categories that have at least one deal in the current data. Same pattern as the existing `if (count === 0) return null` guard on Level 2 pills.

---

## 4. Unified Page Layout — Full ASCII Wireframe at 375px

```
┌─────────────────────────────────────────────────────┐  ← top of viewport
│  Deals                          Updated Thu 18:30   │  ← page header + freshness
├─────────────────────────────────────────────────────┤
│  [All]    [Fresh]   [Long-life]  [Household]        │  ← Level 1 tabs
├─────────────────────────────────────────────────────┤
│  ← [All Fresh] [Fruits & Veg] [Meat & Fish] [Da →  │  ← Level 2 pills (scrollable)
├─────────────────────────────────────────────────────┤
│  ← [All Meat]  [Beef & Pork]  [Poultry]  [Fish →   │  ← Level 3 pills (conditional)
├─────────────────────────────────────────────────────┤
│  [● Migros]  [● Coop]  [● LIDL]  [Aldi]  [Denner]  │  ← store filter pills (scrollable)
│                                    Showing 24 deals │  ← result count (right-aligned, small)
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [img]  MIGROS                         [+]   │   │  ← deal card
│  │        Karotten 1kg                         │   │
│  │        CHF 0.95  ~~1.50~~     [ -37% ]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [img]  COOP                           [+]   │   │  ← deal card
│  │        Bio Apfel Gala 1.5kg                 │   │
│  │        CHF 2.45  ~~3.90~~     [ -37% ]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [img]  MIGROS                         [✓]   │   │  ← in list (green button)
│  │        Vollmilch 1L                         │   │
│  │        CHF 1.25  ~~1.50~~     [ -17% ]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ [img]  LIDL                           [+]   │   │
│  │        Pouletbrust 500g                     │   │
│  │        CHF 3.99  ~~5.99~~     [ -33% ]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│        [ Show more deals (18 left) ]                │  ← load more
│                                                     │
│                                                     │
│                 (scrollable area)                   │
│                                                     │
├─────────────────────────────────────────────────────┤  ← sticky bottom (appears after first add)
│  🛒  My List · 3 items          [Share on WhatsApp] │
└─────────────────────────────────────────────────────┘  ← bottom of viewport
```

### Sticky bar expanded (slide-up panel)

When the user taps the sticky bar (not the share button), a panel slides up from the bottom covering roughly 60% of the screen. The deal list is still partially visible behind it with a slight dim overlay.

```
         ┌───────────────────────────────────────┐
         │   ─────  (drag handle)                │  ← 40px drag indicator
         │   My List (3 items)         [Done]    │  ← header + close button
         ├───────────────────────────────────────┤
         │   🟠 Migros                           │  ← store group header
         │     Karotten 1kg        CHF 0.95  [−] │  ← item row with remove
         │     Vollmilch 1L        CHF 1.25  [−] │
         │                                       │
         │   🟢 Coop                             │
         │     Bio Apfel Gala 1.5kg  CHF 2.45 [−]│
         │                                       │
         ├───────────────────────────────────────┤
         │   Total est. CHF 4.65                 │  ← optional: sum of sale prices
         │                                       │
         │   [       Share on WhatsApp       ]   │  ← full-width CTA
         └───────────────────────────────────────┘
```

Notes:
- Items in the panel are grouped by store (same logic as the share output)
- The [−] remove button is inline next to each item
- Tapping [Done] or the overlay collapses the panel
- Total is a simple sum of `sale_price` for all items — clearly labelled "est." since it's based on this week's deal prices

### What the WhatsApp share button looks like in context

In the sticky bar (collapsed state):
```
[Share on WhatsApp]   ← rounded-full button, green (#25D366), white text, right side of bar
```

In the expanded panel:
```
[       Share on WhatsApp       ]   ← full-width rounded-xl button
```

---

## 5. WhatsApp Share Flow

### What does the user tap?

The share button is in two places (both trigger the same action):
1. The green button on the right side of the sticky bottom bar — accessible without opening the panel
2. The full-width button at the bottom of the expanded list panel

### What text is generated?

Items are grouped by store. Within each store, items are listed with the product name (including weight) and price.

**Example: 4 items across 2 stores**

```
*My Basketch list this week 🧺*

🟠 *Migros*
• Karotten 1kg — CHF 0.95
• Vollmilch 1L — CHF 1.25

🟢 *Coop*
• Bio Apfel Gala 1.5kg — CHF 2.45
• Gruyère AOP 300g — CHF 3.60

Total est. CHF 8.25
basketch.app
```

Rules for text generation:
- Store emoji comes from a simple mapping (Migros = 🟠, Coop = 🟢, LIDL = 🔵, Aldi = 🟣, Denner = 🔴, SPAR = 🟢, Volg = 🔵)
- Store name is bold (WhatsApp renders `*text*` as bold)
- Each item is a bullet with product name from `product_name` (which already includes weight, e.g. "Karotten 1kg") and `sale_price` formatted as CHF x.xx
- Total is the sum of all `sale_price` values
- Footer link is plain text (not a hyperlink — WhatsApp renders it as a tappable link automatically)

### Share mechanism

Use the **Web Share API** (`navigator.share`) with a `text` parameter — this opens the native iOS/Android share sheet with WhatsApp as an option. This is already implemented in the `ShareButton` component.

For browsers that don't support `navigator.share` (desktop), fall back to copying the text to clipboard and showing a "Copied!" toast.

No WhatsApp deep link (`https://wa.me/?text=...`) is needed. The Web Share API is better: it doesn't lock the user into WhatsApp and works on all platforms.

```typescript
// Pseudocode — what the share handler looks like
const text = buildShareText(listItems)  // grouped by store, formatted as above

if (navigator.share) {
  await navigator.share({ text })
} else {
  await navigator.clipboard.writeText(text)
  toast.show('Copied to clipboard!')
}
```

The `buildShareText` function takes the in-memory list items and groups them by `deal.store`. It does not require a network call.

---

## 6. Add/Remove Toggle Interaction

The button has four visual states. The transition between states uses CSS `transition-all duration-150` for speed — this is a micro-interaction, not an animation. It should feel instant but not jarring.

### State 1: Default — not in list

```
Button:  bg-gray-100  text-gray-500
Icon:    + (plus)
Label:   aria-label="Add [product name] to list"
```

On hover (desktop):
```
bg-gray-200  text-gray-700
```

### State 2: Just added — brief flash (150ms)

Triggered the moment `addBasketItem` resolves successfully.

```
Button:  bg-green-500  text-white  scale-110
Icon:    ✓ (checkmark)
```

The `scale-110` class makes the button briefly "pop" larger. Combined with the color change from gray to green, this gives clear confirmation without a toast being strictly necessary (though the toast can still show for the list bar count update).

The `scale-110` is removed after 150ms, returning to State 3. Total visual sequence: gray → green+scale → green (settled). Feels like a physical press.

### State 3: In list — settled state

After the flash (or when the page loads and `basketItems` already contains the item):

```
Button:  bg-green-100  text-green-700
Icon:    ✓ (checkmark)
Label:   aria-label="Remove [product name] from list"
```

On hover (desktop), the button previews the remove action:
```
bg-red-100  text-red-600
Icon:  − (minus)
```

This hover preview tells the user what will happen if they tap, without requiring a confirmation dialog.

### State 4: Loading (add/remove in flight)

```
Button:  bg-gray-100  text-gray-400  (disabled)
Icon:    spinning circle (existing svg spinner)
```

Disabled during the async call to prevent double-adds.

### Summary table

| State         | Background     | Icon | Text color       | Extra class  |
|---------------|----------------|------|------------------|--------------|
| Default       | `bg-gray-100`  | +    | `text-gray-500`  |              |
| Just added    | `bg-green-500` | ✓    | `text-white`     | `scale-110`  |
| In list       | `bg-green-100` | ✓    | `text-green-700` |              |
| Hover in list | `bg-red-100`   | −    | `text-red-600`   |              |
| Loading       | `bg-gray-100`  | ⟳    | `text-gray-400`  | `opacity-60` |
| Error         | `bg-red-100`   | !    | `text-red-600`   |              |

### Remove action

When the user taps a button in State 3 (in list), the item is removed from the basket immediately (optimistic UI), and the button returns to State 1. No confirmation dialog. The remove action is reversible — the user can immediately re-add.

This keeps the flow frictionless. The list is a working tool, not a commitment.

---

## 7. What Gets Removed from the Current Design

### Retired: ComparisonPage (`/comparison/:favoriteId`)

The ComparisonPage is the old "My List" destination — a separate page that showed matched deals grouped by category. It required a UUID in the URL, which made sharing awkward and first-time use confusing.

This entire page is replaced by the expanded list panel inside the unified Deals page. There is no `/comparison` route anymore.

**Files to delete or repurpose:**
- `web/src/pages/ComparisonPage.tsx` — retire
- Route definition for `/comparison/:favoriteId` in the router — remove

### Retired: CategoryDealsSection component

`CategoryDealsSection.tsx` was the building block of the ComparisonPage — it showed deals grouped by category (e.g. "Dairy & Eggs — tracking: milk, yogurt"). This was a category-centric view for a list the user had pre-built.

In the new design, the panel shows items grouped by **store** (not category), because the point of the panel is to know where to go shopping. Category grouping served the old "here are your matches" logic. Store grouping serves the "here's my shopping plan" logic.

**File to retire:** `web/src/components/CategoryDealsSection.tsx`

### Retired: The Compare / All Deals view toggle

The current DealsPage has a toggle between "Compare" (side-by-side matched deals) and "All deals" (flat list). The Compare view (`DealCompareRow`) requires two or more stores to have the same product — it only surfaces a subset of deals and is confusing to users who don't understand why deals disappear.

The new unified page drops this toggle. There is one view: flat deal cards sorted by discount. The store filter pills already let users narrow by store. Side-by-side price comparison can be a future feature if the data quality improves.

**Files to retire or simplify:**
- The `viewMode` state and Compare branch in `DealsPage.tsx` — remove
- `web/src/components/DealCompareRow.tsx` — retire
- The `useDealComparisons` hook call in DealsPage — remove (no longer needed)

### Retired: The store limit warning (MAX_COMPARE_STORES = 3)

The 3-store limit existed because the Compare view got visually broken with more columns. With the Compare view gone, there is no reason to limit how many stores a user can filter by. Remove the `storeLimit` state and warning entirely.

### Retired: The "Active filter banner" strip

The current page shows a banner below the filters that says "Showing 12 Fresh deals from Migros, Coop". This is redundant once the filter pills themselves visually communicate what is active (active pill = filled/coloured). Replace with a right-aligned small count label ("24 deals") below the store pills row. Cleaner, less vertical space.

### Retired: ComparisonPage navigation entry

The nav probably has a "My List" or "Your Deals" link pointing to `/comparison/:id`. This destination no longer exists. Remove the link. The My List experience lives inside the Deals page.

### Retained and promoted

| Component              | Keep? | Change                                          |
|------------------------|-------|-------------------------------------------------|
| `DealCard.tsx`         | Yes   | Extend toggle logic for remove; add `scale-110` flash |
| Top-level tabs         | Yes   | No change                                       |
| Level 2 browse pills   | Yes   | No change                                       |
| Store filter pills     | Yes   | Remove 3-store limit                            |
| `DataFreshness`        | Yes   | Keep in page header                             |
| `StaleBanner`          | Yes   | Keep                                            |
| `LoadingState`         | Yes   | Keep                                            |
| `ErrorState`           | Yes   | Keep                                            |
| `ShareButton`          | Yes   | Reuse in sticky bar and expanded panel          |
| `useBasketContext`      | Yes   | Drives the list count badge                     |
| `useBasketItems`        | Yes   | Drives in-list state on cards                   |
| `useActiveDeals`        | Yes   | Unchanged data source                           |

---

## Implementation order (2-3 day estimate)

### Day 1 — Core card and toggle
1. Extend `DealCard` toggle: add remove action, `scale-110` flash, hover state preview
2. Verify `product_name` already contains weight for most products (spot-check 20 rows in Supabase). If not, investigate `quantity`/`unit` fields on `ProductRow` as a supplement.
3. Drop the Compare view toggle from DealsPage. Keep only the flat list view.
4. Remove the 3-store limit and filter banner. Add deal count label.

### Day 2 — Sticky bar and list panel
1. Build the sticky bottom bar component: count badge, share button, slide-up on tap
2. Build the list panel: store-grouped items, remove buttons, estimated total
3. Wire up `buildShareText` function and connect to `ShareButton`
4. Add Level 3 sub-category pill row (data already exists in DB `sub_category` column)

### Day 3 — Polish and retirement
1. Retire ComparisonPage and its route
2. Retire CategoryDealsSection and DealCompareRow
3. Test share text on iOS and Android (WhatsApp formatting)
4. Accessibility pass: sticky bar must be focusable, panel must trap focus when open

---

## Open questions for the developer

1. **Remove from basket:** Is there a `removeBasketItem` query already in `queries.ts`? If not, this needs to be added before Day 2 work begins.

2. **Weight in product_name:** Run a quick query: `SELECT product_name FROM deals WHERE product_name NOT SIMILAR TO '%[0-9]+(g|kg|ml|l|cl|st|stk|x)%' LIMIT 20`. If a large proportion of names lack weight/quantity, the `quantity` + `unit` columns on the `products` table may need to be surfaced in the `DealRow` join.

3. **Basket persistence:** Currently the basket ID is stored in context (likely localStorage). The sticky bar should survive a page refresh — confirm the basket context already handles this.
