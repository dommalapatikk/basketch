# Code Review: Step 7 -- Frontend UI

**Reviewer:** Independent Code Reviewer Agent
**Date:** 12 April 2026
**Scope:** All pages (6), all components (12), App setup, styles, tests (5 suites)
**Standards:** CLAUDE.md, coding-standards.md v2.0, design-spec-v2.md v2.1

---

## Verdict: Approved with Minor Changes

The frontend UI is well-built, closely follows the design spec, and gets the critical patterns right (two-tier Coop status, lazy html2canvas, store colors, Wordle card). The findings below are mostly accessibility gaps and missing test coverage -- nothing that breaks functionality for sighted users, but several items would fail a WCAG 2.1 AA audit.

---

## Findings

### MUST FIX (4)

#### F1. `LoadingState` has no ARIA live region
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/LoadingState.tsx`
**Problem:** The loading spinner has no `role="status"` or `aria-live="polite"`. Screen readers will not announce when loading starts or completes. The design spec (Section 1.4) specifies skeleton placeholders with implied announcements.
**Fix:** Add `role="status"` and `aria-live="polite"` to the root `<div>`.

#### F2. `StaleBanner` has no ARIA role
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/StaleBanner.tsx`
**Problem:** The stale-data warning has no `role="alert"` or `role="status"`. Screen readers will not announce stale data. The `ErrorState` component correctly uses `role="alert"` -- `StaleBanner` should follow the same pattern.
**Fix:** Add `role="status"` to the root `<div>`.

#### F3. Missing tests for 7 components
**Files:** `VerdictCard.tsx`, `ShareButton.tsx`, `DealCard.tsx`, `CategorySection.tsx`, `CompareCard.tsx`, `EmailLookup.tsx`, `Layout.tsx`
**Problem:** Only 5 of 12 reviewed components have test files. The coding standards (Section 2) require co-located tests. Several of these components have non-trivial logic:
- `VerdictCard` -- html2canvas lazy loading, copy/download fallback
- `CategorySection` -- top-deal sorting, aria-label generation
- `CompareCard` -- two-tier Coop status delegation, aria-label assembly
- `EmailLookup` -- form validation, redirect logic, error states
- `DealCard` -- price display logic, image fallback

**Fix:** Add at least smoke tests for each (render without crashing, key text appears, correct aria attributes). `VerdictCard` and `EmailLookup` deserve more thorough tests given their state complexity.

#### F4. `VerdictBanner` uses `window.location.origin` at render time
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/VerdictBanner.tsx` (line 74)
**Problem:** `window.location.origin` is read during render and passed as a prop. During SSR or any server-side context (Vercel edge middleware), `window` is undefined and this will throw. The component guard (`typeof window !== 'undefined'`) is missing here, though it exists in `HomePage.tsx` line 47.
**Fix:** Move the URL into the `ShareButton`'s click handler or guard with `typeof window !== 'undefined'`. Since `ShareButton` already defaults to `window.location.href` when `url` is not passed, consider removing the `url` prop entirely from this call site.

---

### SHOULD FIX (5)

#### F5. `VerdictBanner` props interface not exported
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/VerdictBanner.tsx`
**Problem:** Coding standards (Section 3) require props interfaces to be exported and named `{ComponentName}Props`. The component uses an inline `props: { verdict: WeeklyVerdict | null }` pattern. Same issue in `CategorySection`, `CoopStatusMessage`, `LoadingState`, `ErrorState`, `StaleBanner`, `EmailLookup`.
**Fix:** Extract and export named props interfaces. This is a consistency fix, not a runtime bug.

#### F6. `DealsPage` category pills don't show on error state
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/pages/DealsPage.tsx` (lines 191-198)
**Problem:** Design spec (Section 2.7) states: "CategoryFilterPills still visible but disabled (grayed out)" on error. Current implementation returns early with just the error card, hiding the pills entirely.
**Fix:** Show the pill container in the error state with disabled styling.

#### F7. Category card links use hardcoded sub-category IDs
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/CategorySection.tsx` (lines 25-29)
**Problem:** The `catParam` mapping (`fresh` -> `fruits-vegetables`, `long-life` -> `pasta-rice-cereals`, `non-food` -> `home`) only links to ONE sub-category per top-level category. If a user taps the "FRESH" category card, they see only Fruits & Vegetables deals, not all Fresh deals (which includes Meat, Dairy, Bakery, etc.).
**Fix:** Map top-level categories to the parent category filter, or add a `category=fresh` URL parameter that the DealsPage can handle.

#### F8. `DataFreshness` is defined inside `HomePage.tsx`
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/pages/HomePage.tsx` (lines 22-35)
**Problem:** The same date-formatting pattern is repeated in `DealsPage.tsx` (lines 203-213) and `ComparisonPage.tsx` (lines 176-187). The `DataFreshness` component inside `HomePage.tsx` is not reusable because it is not exported. Coding standards say "one component per file."
**Fix:** Extract `DataFreshness` to its own component file and reuse across all three pages.

#### F9. Wordle card category bar width is 6px but spec text says 6px
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/VerdictCard.tsx` (line 134)
**Verified:** `w-1.5` = 0.375rem = 6px. This matches the spec. However, the spec also says "No fine lines thinner than 2px" (Section 7.4). The bar is for visual impact, and 6px is correct. **No action needed -- included for completeness.**

---

### CONSIDER (4)

#### F10. No page-level tests at all
**Files:** All 6 page files in `/web/src/pages/`
**Problem:** Zero test files exist for any page. Pages contain significant orchestration logic (data loading, conditional rendering, URL parameter handling). At minimum, `DealsPage` and `ComparisonPage` should have smoke tests.

#### F11. `ComparisonPage` removes `localStorage` item on ANY error
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/pages/ComparisonPage.tsx` (line 79)
**Problem:** If deals fail to load (network error), the code removes `basketch_favoriteId` from localStorage. This means a temporary API failure permanently forgets the user's saved favorite ID. The guard should only clear localStorage when the favorite ID itself is invalid (404), not on general data-fetch errors.

#### F12. `document.execCommand('copy')` is deprecated
**Files:** `ShareButton.tsx` (line 37), `ComparisonPage.tsx` (line 66)
**Problem:** `execCommand('copy')` is deprecated. It works in current browsers but may be removed. It is currently used as a third-tier fallback (after Web Share API and Clipboard API), which is acceptable for now.

#### F13. No `<form>` element wrapping `EmailLookup`
**File:** `/Users/kiran/ClaudeCode/basketch/web/src/components/EmailLookup.tsx`
**Problem:** The email input and Find button are not wrapped in a `<form>` element. While the Enter key handler works (line 41), a `<form>` with `onSubmit` would be more semantic, give password managers correct hints, and allow native form validation.

---

## What Works Well

1. **Two-tier Coop status:** `CoopStatusMessage` correctly differentiates known vs. unknown products with icon (not opacity), matching the design spec Section 4.3 exactly. Tests cover both tiers.

2. **Store colors correct:** `#e65100` / `#c54400` for Migros, `#007a3d` / `#006030` for Coop. Text variants (`-text`) used on light backgrounds. Background variants used for badges. All verified in `styles.css`.

3. **Wordle card implementation:** Dark navy `#1a1a2e` background, `html2canvas` lazy-loaded via dynamic `import()` on click only, card rendered as DOM with `role="img"` and comprehensive `aria-label`, copy-to-clipboard with PNG download fallback. Matches spec Sections 7.1-7.6.

4. **Layout and routing:** Skip-nav link present, sticky header with 44px touch targets, content capped at 640px, lazy-loaded routes via `React.lazy()`, `ErrorBoundary` wrapper. Named exports with `.then(m => ({ default: m.X }))` adapter for `lazy()`.

5. **Accessibility fundamentals:** `role="status"` + `aria-live="polite"` on VerdictBanner, `role="tablist"` with roving tabindex on category pills, `role="alert"` on ErrorState, `aria-label` on DealCard/CategorySection/CompareCard, `role="progressbar"` on onboarding steps, `sr-only` label on email input.

6. **Mobile-first patterns:** 375px base with `max-w-[640px]` content, 16px padding, `md:` breakpoint for deals two-column layout, safe-area-inset-bottom support, no-scrollbar horizontal pill scrolling with fade affordance.

7. **Three states consistently handled:** Every data-fetching page (Home, Deals, Comparison) handles loading, error, and success states. Onboarding handles action-loading separately from data-loading.

8. **Design spec copy alignment:** Verified headline text, subtitle text, verdict patterns, category card patterns, button labels, footer text all match the design spec Section 1.3 and corresponding page sections.

---

## Summary Table

| # | Severity | Finding | Component |
|---|----------|---------|-----------|
| F1 | Must fix | LoadingState missing ARIA live region | LoadingState.tsx |
| F2 | Must fix | StaleBanner missing ARIA role | StaleBanner.tsx |
| F3 | Must fix | 7 components have no tests | Multiple |
| F4 | Must fix | window.location.origin at render time (SSR crash) | VerdictBanner.tsx |
| F5 | Should fix | Props interfaces not exported per standards | Multiple |
| F6 | Should fix | Category pills hidden on error state | DealsPage.tsx |
| F7 | Should fix | Category cards link to single sub-category, not parent category | CategorySection.tsx |
| F8 | Should fix | DataFreshness duplicated across 3 pages | HomePage/DealsPage/ComparisonPage |
| F9 | -- | Verified: bar width matches spec (6px) | VerdictCard.tsx |
| F10 | Consider | No page-level tests | All pages |
| F11 | Consider | localStorage cleared on any error, not just 404 | ComparisonPage.tsx |
| F12 | Consider | execCommand('copy') deprecated | ShareButton/ComparisonPage |
| F13 | Consider | EmailLookup not wrapped in form element | EmailLookup.tsx |

**Must fix:** 4 | **Should fix:** 4 | **Consider:** 4
