# UX Improvement Proposal — My List / Comparison Page v2

**Date:** 2026-04-21  
**Page:** `/compare/:id` (ComparisonPage + CategoryDealsSection + deal row)  
**Constraint:** Mobile-first 375px, Tailwind CSS only, no new libraries  

---

## 1. Benchmark Findings

### 1.1 Instacart — Deals / Sales Page

**Finding 1 — Promotions surface directly on the card, never beside it.**  
Instacart shows the discount badge overlaid on the product image in the top-left corner (red pill, e.g. "SAVE 30%"), not next to the price. This means even in a fast scroll the deal signal is caught by peripheral vision before the user reads any text. The current basketch card puts the discount badge far-right, aligned with the price row — a weaker position on mobile because the eye enters from the left.

**Finding 2 — Store color runs as a consistent horizontal strip at the top of each store section.**  
Rather than a text label coloured in the store brand colour, Instacart uses a thin (3–4px) coloured bar at the top of every store banner/card. This creates an instant, scannable visual map: "I am in the orange section = Migros" without reading. The current basketch implementation uses only `hexText` on the store label text — functional but not immediately scannable.

**Finding 3 — Product image is the primary element, never optional-feeling.**  
Images are 80×80px (1:1) with a white/light background and rounded corners. When the image is missing, the fallback is the store logo (small, centred) on the same light background — not an initial letter. This keeps the card grid visually stable regardless of data completeness.

---

### 1.2 Migros App / Coop App (Swiss)

**Finding 1 — Category headers use the category emoji at 24px with a bold label, then deal count in a muted chip.**  
Both apps show "🥬 Gemüse & Früchte  ·  12 Angebote" in one line: large emoji, bold label, then a small grey count chip (e.g. `12`). The count chip is right-aligned. This is more scannable than embedding the count in the section subtitle. The current basketch page puts the item list ("Your list: banana, apple") as the subtitle — useful context, but it competes with the store headings below it.

**Finding 2 — Stores with no deals are not listed at all within a category.**  
Neither the Migros nor Coop apps show a "no deals this week" entry for competitor stores inside a category. That information is implicitly communicated by absence. Showing it as italic muted text (current basketch approach) adds visual noise and anchors the user on what isn't available rather than what is.

**Finding 3 — The deal list within each store section is a tighter horizontal scroll row (carousel), not a vertical list.**  
For category-level store groupings, a horizontal carousel of cards (2–2.5 cards visible) signals "there are more" without the "Show N more" expand pattern. The expand pattern works but reads as a workaround for vertical overflow. For basketch — a small app, 5-per-store default — the current vertical expand is fine; however switching to a compact card grid (2-column) would feel less like a table and more like a product shelf.

---

### 1.3 Rewe App (German — well-designed grocery equivalent)

**Finding 1 — Price hierarchy: sale price bold + large, original price struck through at 80% opacity immediately to its right, discount % badge separated into its own red pill at the top-right of the image.**  
The current basketch card intermingles all three pieces (sale price, strikethrough, discount %) in one row with no clear visual weight ranking. Rewe's pattern separates the discount badge spatially (image corner) from the price row (below image), making each scan faster.

**Finding 2 — Section headers carry a subtle bottom border, not just typography weight, to delineate sections.**  
`border-b border-gray-200 pb-2 mb-3` under each `h2`. This is a cheap visual cue that draws a clear "floor" under the header before the store sub-sections begin. Without it, the category title and first store label blur together.

**Finding 3 — "No deals" state uses a positive frame.**  
Rewe shows "Nothing on offer in [category] this week — browse all [category] products instead →". This converts a dead end into an action. The current basketch empty state ("No deals this week at any store. Check back Thursday evening.") is honest but passive.

---

### 1.4 General Benchmark — Baymard Institute / Card UI Research

- **Discount proximity rule:** Discount messaging placed more than ~40px from the sale price is frequently missed by scanning users (Baymard). Both elements must be co-located in the same visual cluster.
- **Image stability:** When some cards have images and some don't, visual jitter (varying card heights or left-column widths) degrades scan quality. A fixed image slot (even if blank/placeholder) prevents jitter.
- **Badge colour:** Red/orange discount badges outperform green ones for urgency. The current card uses `bg-success-light / text-success` (green) for the discount badge on the Deals page — this reads as "safe/available" not "this is a deal". The store colour badge uses `storeHex` as background — correct for branding but means on Coop (green) the discount badge is the same colour as the add-button, blurring meaning.

---

## 2. Improvements — CategoryDealsSection Layout

### 2.1 Category Section Header

**Before:**
```tsx
<h2 className="text-base font-semibold">
  {match.browseCategoryEmoji} {match.browseCategoryLabel}
</h2>
<p className="mb-3 text-xs text-muted">Your list: {itemNames}</p>
```

**After:**
```tsx
<div className="mb-3 flex items-center justify-between border-b border-border pb-2">
  <h2 className="text-base font-semibold">
    {match.browseCategoryEmoji} {match.browseCategoryLabel}
  </h2>
  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted">
    {totalDealCount} deals
  </span>
</div>
<p className="mb-3 text-xs text-muted">
  Tracking: {itemNames}
</p>
```

Key changes:
- Add `border-b border-border pb-2` to draw a visual floor under the heading.
- Move deal count to a right-aligned grey chip — at a glance the user knows how much value the category has.
- Change label from "Your list:" to "Tracking:" — shorter, less diary-like.
- `totalDealCount` = sum of all `match.dealsByStore[s].length` across stores with deals.

---

### 2.2 Store Sub-Section Header (StoreDealList)

**Before:**
```tsx
<div
  className="mb-1.5 text-xs font-semibold uppercase tracking-wide"
  style={{ color: meta.hexText }}
>
  {meta.label} — {deals.length} deal{deals.length !== 1 ? 's' : ''}
</div>
```

**After:**
```tsx
<div className="mb-2 flex items-center gap-2">
  <div
    className="h-4 w-1 shrink-0 rounded-full"
    style={{ backgroundColor: meta.hex }}
    aria-hidden="true"
  />
  <span
    className="text-xs font-bold uppercase tracking-wide"
    style={{ color: meta.hexText }}
  >
    {meta.label}
  </span>
  <span className="text-xs text-muted">
    {deals.length} deal{deals.length !== 1 ? 's' : ''}
  </span>
</div>
```

Key changes:
- Replace pure text colour with a 4px × 16px coloured vertical pill (`w-1 h-4 rounded-full`) as the store identity signal — scannable without reading.
- Separate deal count into a muted span — it is secondary metadata, not part of the store name.
- The colour accent pill uses `meta.hex` (full colour, not `hexText`) because it is a decorative element on white, not text, so WCAG contrast rules don't apply.

---

### 2.3 Empty Store Row — Remove from DOM

**Before:**
```tsx
{storesWithoutDeals.length > 0 && (
  <p className="mt-1 text-xs italic text-muted">
    {storesWithoutDeals.map((s) => STORE_META[s].label).join(', ')} — no deals in this category this week
  </p>
)}
```

**After:** Delete this block entirely. If all 7 stores have no deals, the `allEmpty` branch already handles it. Listing absent stores communicates absence where there is nothing actionable — it adds scroll height and cognitive load for no benefit.

---

### 2.4 All-Empty State — Positive Frame

**Before:**
```tsx
<p className="text-sm text-muted">
  No {match.browseCategoryLabel} deals this week at any store.
</p>
<p className="mt-0.5 text-xs text-muted">Check back Thursday evening.</p>
```

**After:**
```tsx
<div className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-3">
  <span className="text-2xl" aria-hidden="true">{match.browseCategoryEmoji}</span>
  <div>
    <p className="text-sm font-medium text-muted">No {match.browseCategoryLabel} deals this week</p>
    <p className="mt-0.5 text-xs text-muted">New deals land Thursday evening — check back then.</p>
  </div>
</div>
```

Key changes:
- Wrap in `bg-gray-50` card so it fills the section visually and doesn't feel like broken content.
- Lead with the category emoji at `text-2xl` — gives the eye something to land on.
- Reword: "New deals land Thursday evening" (active, gives a mental model) vs "Check back Thursday evening" (command).

---

## 3. Improvements — Deal Card (CategoryDealsSection inline card)

The deal rows in `StoreDealList` are simpler inline cards, not the full `DealCard` component. The improvements below apply to those inline rows. Where the full `DealCard` is used on the Deals page, note the separate suggestions in section 3.3.

### 3.1 Add Fixed Image Slot to Inline Deal Rows

The current inline card has no image — it shows only product name + price + discount badge. Adding a fixed 48×48px image slot (even when empty) achieves two things: visual rhythm consistency across rows, and a hook for `image_url` when it exists.

**Before:**
```tsx
<div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
  <div className="min-w-0 flex-1">
    <div className="truncate text-sm font-medium">{deal.product_name}</div>
    {deal.original_price != null && (
      <div className="text-xs text-muted">
        CHF {deal.sale_price.toFixed(2)}{' '}
        <span className="line-through">CHF {deal.original_price.toFixed(2)}</span>
      </div>
    )}
  </div>
  {deal.discount_percent != null && deal.discount_percent > 0 && (
    <span className="ml-3 shrink-0 rounded-full bg-success-light px-2 py-0.5 text-xs font-semibold text-success">
      -{deal.discount_percent}%
    </span>
  )}
</div>
```

**After:**
```tsx
<div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
  {/* Fixed image slot — always present for visual rhythm */}
  {deal.image_url ? (
    <img
      src={deal.image_url}
      alt=""
      loading="lazy"
      className="size-11 shrink-0 rounded-md object-contain bg-gray-50"
    />
  ) : (
    <div className="size-11 shrink-0 rounded-md bg-gray-50" aria-hidden="true" />
  )}

  {/* Name + price */}
  <div className="min-w-0 flex-1">
    <div className="truncate text-sm font-medium leading-snug">{deal.product_name}</div>
    <div className="mt-0.5 flex items-baseline gap-1.5">
      <span className="text-sm font-bold">CHF {deal.sale_price.toFixed(2)}</span>
      {deal.original_price != null && deal.original_price > deal.sale_price && (
        <span className="text-xs text-muted line-through opacity-70">
          {deal.original_price.toFixed(2)}
        </span>
      )}
    </div>
  </div>

  {/* Discount badge — red, not green */}
  {deal.discount_percent != null && deal.discount_percent > 0 && (
    <span className="ml-auto shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
      −{deal.discount_percent}%
    </span>
  )}
</div>
```

Key changes:
- `size-11` (44px) image slot — always rendered; blank `bg-gray-50` when no image. This keeps every row the same height and left-aligns the name column consistently.
- Empty placeholder has no letter/initial — a plain light square is cleaner than "M" or "C" which falsely implies a logo.
- Price row: `text-sm font-bold` for sale price (was `text-xs`). The deal price is the most important data point; it should be the largest text on the card after the product name.
- Strikethrough: add `opacity-70` to make it clearly secondary without removing it.
- Discount badge: change from `bg-success-light text-success` (green) to `bg-red-50 text-red-600`. Green = confirmation/available; red = deal/urgency. This is the standard convention across Amazon, Rewe, Instacart, and Migros.
- Use `−` (minus sign, U+2212) instead of `-` (hyphen) before the percent — typographically correct for a value reduction.

---

### 3.2 Price Format Inconsistency Fix

**Current:** Sale price shows `CHF {price}` but strikethrough shows only `{price}` without `CHF`. This is inconsistent and slightly confusing.

**Fix:** Drop the `CHF` prefix from the sale price in the inline row (the store header already makes currency context clear) or add it to both. Recommended: keep `CHF` on the sale price only (it is the primary price), no `CHF` on strikethrough (it is clearly the same currency).

The current code already does this in `DealCard.tsx` (line 148–150) — bring the inline row format into alignment.

---

### 3.3 Full DealCard (Deals page) — Discount Badge Colour

The `DealCard` component at line 154 uses `storeHex` as the background for the discount badge:
```tsx
<span className="... rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: storeHex }}>
  -{deal.discount_percent}%
</span>
```

This makes the discount badge the same colour as the store name badge above it (line 139). Two identical-coloured badges with different meanings — one = store identity, one = saving — look like duplicates and undermine the store branding signal.

**Fix:** Use a fixed semantic colour for the discount badge across all stores:
```tsx
<span className="ml-auto shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
  −{deal.discount_percent}%
</span>
```

The store badge (line 139) retains its `storeHex` background — now the two badges are visually distinct: store brand = coloured, saving = always red.

---

## 4. Copy Improvements

### 4.1 Page Header

**Before:** "Your deals this week"  
**After:** "Your deals this week" ✓ (keep — clear and personal)

**Before subtitle:** "5 items tracked across 3 categories"  
**After subtitle:** "5 items · 3 categories" — use a mid-dot instead of "tracked across", saving 10 characters on a line that has two buttons competing for space.

### 4.2 Share Strip

**Before:** "Bookmark this page to check every week"  
**After:** "Bookmark to check every Thursday" — more specific, builds the weekly habit cue with the actual day.

### 4.3 Unmapped Items Notice

**Before:** "3 items could not be matched to a category: banana bread, oat milk. Edit your list to update them."  
**After:** "3 items weren't recognised: banana bread, oat milk. [Fix my list →]" — shorter, makes the action a prominent inline link rather than a separate sentence.

### 4.4 "Show N more" Button

**Before:** "Show 4 more Migros deals"  
**After:** "Show 4 more" — the store name is already in the section header directly above; repeating it in the button is redundant and makes the button text vary in length per store (jarring on narrow screens).

### 4.5 No Deals in Whole Page

**Before:** "No category deals found. Add more items to your list or check back Thursday when new deals are published."  
**After:**  
```
No deals matched your list this week.
New deals are published every Thursday — come back then, or add more items to your list to broaden your matches.
[Edit my list]
```
Split into two sentences: the immediate state, then the forward-looking action. The button should be the primary CTA, not an inline link.

---

## 5. Priority Order — Impact vs Build Effort

| # | Change | Visual Impact | Build Time | Do First |
|---|--------|--------------|------------|----------|
| 1 | Discount badge: green → red (CategoryDealsSection rows + DealCard) | High — immediately feels like a deal app | 5 min | Yes |
| 2 | Add `border-b` under category `h2` | Medium — stops the header bleeding into store rows | 2 min | Yes |
| 3 | Store section header: add coloured vertical accent pill | Medium — instant store scanability | 10 min | Yes |
| 4 | Remove "no deals" store list (storesWithoutDeals) | Medium — cleaner, less noise | 2 min | Yes |
| 5 | Add fixed 44px image slot to inline deal rows | High — visual rhythm, premium feel | 20 min | Yes |
| 6 | Category header: add deal count chip, right-aligned | Low-medium | 15 min | Next |
| 7 | All-empty state: bg-gray-50 card + emoji + reworded copy | Low-medium | 10 min | Next |
| 8 | Page subtitle: "5 items · 3 categories" | Low | 2 min | Next |
| 9 | "Show N more" → "Show N more" (drop store name) | Low | 2 min | Next |
| 10 | DealCard discount badge: storeHex → red-600 | Medium — fixes badge meaning collision | 5 min | Next |
| 11 | Share strip copy: add "Thursday" | Low | 1 min | Later |

### What the first 5 changes achieve together

Items 1–5 are all in `CategoryDealsSection.tsx` and require no new data, no new components, and no Tailwind config changes. Implemented together in one pass (est. 45 minutes), they take the page from "functional list" to "product shelf" level:

- Red discount badges signal urgency (item 1).
- A border under the category title creates clear section structure (item 2).
- A coloured accent pill makes store identity scannable without reading (item 3).
- Removing absent stores removes ~30% of the noise currently on the page (item 4).
- Fixed image slots create a consistent product-grid feel even before images are available (item 5).

Items 6–11 can follow in a second pass.

---

## 6. What Not to Change (Deliberate Non-Recommendations)

- **No store filter tabs.** The current "all stores always shown" approach is correct for a small comparison app. Tabs would add interaction cost and reduce the chance of discovering a surprise deal at a store the user didn't plan to visit.
- **No two-column card grid.** With product names that often run 25–35 characters, a two-column grid would force excessive truncation. The single-column list is correct for this data density.
- **No skeleton loading.** The current `LoadingState` is adequate for a fast Supabase query. Skeleton adds build complexity without a meaningful UX improvement at <200ms load times.
- **No store logos.** Fetching and caching 7 SVG/PNG logos introduces asset management overhead. The store colour system already uniquely identifies each store; the coloured pill (item 3 above) is sufficient.
