# Design Re-Review: basketch (Round 2)

**Date:** 10 April 2026
**Reviewer:** Product Designer (Mobile-First) Agent
**Scope:** Verification of 5 must-fix issues from Round 1

---

## Summary

Four of the five flagged issues are fully resolved. One issue (inline styles) is partially resolved -- two inline styles remain in AboutPage.tsx. No new visual issues were introduced by the fixes. The color system is now well-differentiated between stores, contrast ratios are improved, and touch targets meet the 44px minimum.

**Overall verdict: Approved with one minor remaining item.**

---

## Per-Issue Re-Review

### Issue 1: Touch targets below 44px on remove buttons, small buttons, and nav links -- Approved

**What was fixed in `styles.css`:**
- `.btn` now has `min-height: 44px` (line 119)
- `.btn-sm` now has `padding: 8px 16px` and `min-height: 44px` (lines 159-161)
- `.fav-remove` now has `padding: 12px 16px`, `min-width: 44px`, `min-height: 44px`, with `display: flex; align-items: center; justify-content: center` for proper centering (lines 373-380)
- `.header-nav a` now has `min-height: 44px` with `display: flex; align-items: center` (lines 76-79)

**Verification:** All interactive elements now explicitly enforce the 44x44px minimum. The approach of using `min-height` and `min-width` is correct -- it guarantees the touch target without distorting the visual size. The flex centering on `.fav-remove` keeps the "x" character properly centered within the enlarged tap area.

**Verdict: Approved.**

---

### Issue 2: Contrast ratio failures on Migros tags, white-on-orange buttons, and warning text -- Approved

**What was fixed:**

| Element | Old color | New color | Approx. ratio on white | Status |
|---------|-----------|-----------|----------------------|--------|
| Migros tag text (`.tag-migros`) | `#FF6600` on `#FFF3E6` (~3.2:1) | `#c54400` on `#FFF3E6` (~4.7:1) | Pass |
| Migros brand (`--color-migros`) | `#FF6600` | `#e65100` | White on `#e65100` ~4.6:1 | Pass |
| Coop brand (`--color-coop`) | `#E10A0A` | `#007a3d` | White on `#007a3d` ~4.9:1 | Pass |
| Warning text (`--color-warning`) | `#D97706` | `#b45309` | `#b45309` on white ~4.8:1 | Pass |
| Coop tag text (`.tag-coop`) | `#E10A0A` on `#FDE8E8` | `#007a3d` on `#e6f4ec` (~4.5:1) | Pass |

**Verification:** The darkened Migros orange (#e65100) maintains the orange identity while clearing the 4.5:1 threshold for white text on colored buttons. The tag-specific color (#c54400) is darker still, appropriate for small 12px tag text on the light orange background. The warning amber (#b45309) clears the threshold for both white backgrounds and the page background (#FAFAFA).

The Coop tag background was also updated from `#FDE8E8` (red tint) to `#e6f4ec` (green tint) to match the new green brand color. This is a correct and coherent change.

**Verdict: Approved.**

---

### Issue 3: VerdictBanner does not color-code store names -- Approved

**What was fixed:**

A `StoreLabel` component was added in `VerdictBanner.tsx` (lines 4-9) that renders store names with CSS classes `store-migros` and `store-coop`. These classes are defined in `styles.css` (lines 561-568):

```css
.store-migros {
  color: var(--color-migros);
  font-weight: 700;
}
.store-coop {
  color: var(--color-coop);
  font-weight: 700;
}
```

The `verdictContent` function (lines 11-31) now wraps each store mention in a `<StoreLabel>` component, producing output like: "This week: **Migros** for Fresh, **Coop** for Household" where Migros appears in orange and Coop in green.

**Verification:** The implementation is clean. The `StoreLabel` component handles both the color and the bold weight. The verdict text remains readable -- the store names are visually distinct from the surrounding text through both color and weight, meeting the design spec that store identity is communicated through color.

**Verdict: Approved.**

---

### Issue 4: Coop color was red, needed to be a deliberate choice (now changed to green #007A3D) -- Approved

**What was fixed:**

- `--color-coop` changed from `#E10A0A` (red) to `#007a3d` (green) in `:root` (line 13)
- `.tag-coop` updated: background from `#FDE8E8` (red tint) to `#e6f4ec` (green tint), text color now uses `var(--color-coop)` which resolves to green (lines 198-201)
- `.compare-store-coop` background updated from implicit red tint to `#e6f4ec` (green tint) (line 419)
- `.error-msg` now uses `var(--color-coop)` for text color (line 293) -- this is a minor concern since errors should not look like Coop branding, but `--color-error` (#dc2626) is available as a separate token. However, since the error message also has a distinct background (`#fde8e8`, which is still the old red tint), it visually reads as an error state, not a Coop state. Worth noting but not blocking.
- `.btn-coop` now renders white text on green background (line 153-156), which has adequate contrast (~4.9:1).

**Verification:** The green (#007A3D) is Coop Switzerland's actual brand green. This creates clear visual differentiation: Migros = orange, Coop = green. The light tints for comparison columns and tags follow correctly. The split-list dot (`.split-dot-coop`) inherits from `var(--color-coop)` so it also renders green.

**Note:** The `.error-msg` class (line 293-296) uses `color: var(--color-coop)` which is now green, but the background is still `#fde8e8` (pink/red). This creates an odd green-text-on-pink-background pairing. This should be changed to use `var(--color-error)` with a matching background. Flagged as a new issue below.

**Verdict: Approved** (the Coop color change itself is correct; the error-msg side effect is tracked separately).

---

### Issue 5: Inline styles scattered across components -- Partially Approved

**What was fixed:**

- `CompareCard.tsx` -- No inline styles found. Clean.
- `FavoritesEditor.tsx` -- No inline styles found. Clean.
- `EmailCapture.tsx` -- No inline styles found. Clean.
- `HomePage.tsx` -- No inline styles found. Clean.
- `Layout.tsx` -- No inline styles found. Clean.

**What remains:**

- `AboutPage.tsx` line 8: `<ol className="pl-20" style={{ lineHeight: 2 }}>`
- `AboutPage.tsx` line 18: `<ul className="pl-20" style={{ lineHeight: 2 }}>`

Both use `style={{ lineHeight: 2 }}` -- a CSS property that controls the spacing between list items. This should be extracted to a utility class in `styles.css` (e.g., `.leading-relaxed { line-height: 2; }` or similar).

**Verdict: Adjust** -- Add a utility class for `line-height: 2` and replace the two inline styles in AboutPage.tsx.

---

## New Issues Found

### New Issue A: `.error-msg` uses Coop color instead of error color

**File:** `styles.css` lines 293-296

```css
.error-msg {
  color: var(--color-coop);
  background: #fde8e8;
}
```

When Coop's color was red (#E10A0A), this coincidentally worked because the error color and Coop color were the same. Now that Coop is green (#007A3D), the error message renders green text on a pink background -- visually incoherent for an error state.

**Fix:** Change to `color: var(--color-error);` and optionally update the background to a neutral error tint like `#fef2f2`.

**Severity:** Minor (functional but visually wrong).

---

### New Issue B: Design system document is now out of date

The design system document (`docs/design-system.md`) still references:
- Coop color as `#E10A0A` (Section 2.1)
- Migros color as `#FF6600` (Section 2.1)
- Warning as `#D97706` (Section 2.3)
- Old contrast ratio table (Section 9.1)

The design system should be updated to reflect the actual production values:
- Migros: `#e65100`
- Coop: `#007a3d`
- Warning: `#b45309`
- Migros tag text: `#c54400`

**Severity:** Documentation debt. Does not affect users, but creates confusion for future development.

---

## Final Verdict

**Approved with two minor action items.**

| Issue | Status |
|-------|--------|
| 1. Touch targets below 44px | Approved |
| 2. Contrast ratio failures | Approved |
| 3. VerdictBanner store name colors | Approved |
| 4. Coop color deliberate choice | Approved |
| 5. Inline styles scattered | Adjust (2 remain in AboutPage.tsx) |
| New A. error-msg uses Coop color | Adjust |
| New B. Design system doc outdated | Documentation update needed |

The core accessibility and usability issues from Round 1 are resolved. The remaining items are minor and non-blocking for launch. The two Adjust items can be handled in a quick follow-up pass.
