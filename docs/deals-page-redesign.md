# Feature Spec: Group Deals by Supermarket

**Author:** Kiran Dommalapati
**Date:** 11 April 2026
**Status:** Draft
**Scope:** Browse Deals page (`/deals`)

---

## User Story

As a Swiss shopper browsing deals by category, I want to see Migros deals and Coop deals grouped separately (side by side on desktop, stacked on mobile), so I can quickly compare what each store offers in that category without scanning through a mixed list.

## Problem

The current Browse Deals page shows all deals in a single interleaved list. A shopper looking at "Drinks" sees Migros wine, then Coop beer, then Migros juice, then Coop soda -- all mixed together. To mentally compare what each store offers, the user has to scan the entire list and hold both stores in their head. This defeats the core promise of basketch: tell me which store to visit for what.

The PRD (US-6) explicitly calls for deals from Migros and Coop shown "side by side" per category. The current implementation does not deliver this.

## Solution

Within each category view, group deals into two columns (or stacked sections on mobile): one for Migros, one for Coop. Each group shows its own deal count and is sorted by discount percentage (highest first). The shopper can see at a glance which store has more -- and better -- deals in that category.

**Layout:**
- **Desktop (>= 768px):** Two columns side by side. Left = Migros, Right = Coop. Each column headed with the store name and deal count.
- **Mobile (< 768px):** Two stacked sections. Migros first, then Coop. Clear section headers with store name and deal count.

## Acceptance Criteria

1. When a category is selected (or "All" is active), deals are visually grouped by store -- not interleaved.
2. Each store group displays a header showing the store name and the number of deals in that group for the active category.
3. On viewports >= 768px, the two store groups render as side-by-side columns of equal width.
4. On viewports < 768px, the two store groups stack vertically with clear visual separation.
5. Deals within each store group are sorted by `discount_percent` descending (best deals first).
6. The existing category pill filter continues to work -- selecting a category filters both store groups simultaneously.
7. The 50-deal display cap applies per store group (50 Migros + 50 Coop), not globally.

## Edge Cases

| Condition | Expected behaviour |
|---|---|
| One store has zero deals in the selected category | Show the empty store group with a message: "No [Store] deals in this category." Do not hide the column -- keeping it visible reinforces the comparison. |
| Deal counts are very uneven (e.g., 45 Migros vs 3 Coop) | Each column scrolls independently on desktop. On mobile, the smaller section is simply shorter. No attempt to equalize heights. |
| A new store is added in the future (e.g., Aldi) | Current implementation can hardcode Migros and Coop. A third store would require layout revision -- not in scope now. |
| Category has zero deals from both stores | Existing "No deals in this category" empty state remains unchanged. |
| Deal has no store value | Exclude from both groups (should not happen per pipeline contract, but defensive). |

## Out of Scope

- Changing the category pill filter system (wrapping layout, category definitions, keyword matching).
- Adding a "winner" verdict per category (e.g., "Migros wins Drinks this week"). This belongs to a separate verdict feature.
- Store logo or branding in the column headers (plain text store name is sufficient for now).
- Cross-category comparison view (e.g., seeing Migros vs Coop across all categories at once).
- Sorting options beyond discount percentage (e.g., sort by price, alphabetical).
- Changes to the DealCard component itself (image, price display, discount badge).

## Traceability

- **PRD reference:** US-6 ("see this week's best deals from Migros and Coop side by side")
- **File to modify:** `web/src/pages/DealsPage.tsx`
- **Types used:** `DealRow.store` field (values: `'migros'` | `'coop'`)
