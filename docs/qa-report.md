# QA Report: basketch rebuild

**Date:** 2026-04-10
**Tester:** Claude Code (automated QA)
**Scope:** Full rebuild with Tailwind CSS v4 + shadcn/ui + React Query

---

## Test Results Summary

| Test Area | Status | Issues |
|-----------|--------|--------|
| Homepage (live site) | PASS | Missing OG tags |
| Onboarding flow (code review) | PASS | None |
| Comparison page (code review) | PASS | None |
| Tailwind + shadcn/ui compliance | PASS | None |
| React Query compliance | PASS | Minor: `searchDeals` returns empty on error |
| Accessibility spot check | PASS | None |
| Frontend tests (vitest) | PASS | 76/76 tests passed |
| Pipeline tests (vitest) | PASS | 77/77 tests passed |

---

## Detailed Findings

### 1. Homepage (live site)

- **Status:** PASS (with note)
- **Evidence:**
  - Fetched `https://basketch.vercel.app` -- page loads successfully
  - Title tag present: `basketch -- Migros vs Coop deals`
  - Meta description present: "Your groceries. Two stores. One smart list. Compare Migros vs Coop deals for the items you actually buy."
  - Code confirms: `<h1>` reads "Smart grocery shopping for Swiss shoppers"
  - Email lookup section exists in `HomePage.tsx` with "Already have a list?" card, email input, and "Find my list" button
  - Favicon configured (`/favicon.svg`)
- **Issue (low priority):** No Open Graph or Twitter card meta tags in `index.html`. Sharing on WhatsApp/social will show a plain link without a preview card. This matters for the growth strategy (UC-7, share via WhatsApp).

### 2. Onboarding Flow (code review)

- **Status:** PASS
- **Evidence:**
  - 3-step flow implemented: `pick` -> `edit` -> `save` (type `Step = 'pick' | 'edit' | 'save'`)
  - Step progress indicator with `role="group"` and `aria-label` for accessibility
  - `TemplatePicker` uses `useStarterPacks()` hook (React Query) -- confirmed in `TemplatePicker.tsx:10`
  - `useFavoriteItems` used for edit mode -- confirmed in `OnboardingPage.tsx:29`
  - Cache invalidation after mutations: `queryClient.invalidateQueries({ queryKey: ['favorites', id, 'items'] })` at line 75
  - `FavoritesEditor` also invalidates cache after add/remove operations (lines 20-21)
  - Back navigation works between steps
  - Error states handled: list creation failure, import failure, partial import
  - Loading state with spinner during async operations

### 3. Comparison Page (code review)

- **Status:** PASS
- **Evidence:**
  - Uses `useActiveDeals()` and `useFavoriteItems(favoriteId)` React Query hooks -- confirmed at lines 14-25
  - Three states handled: loading (spinner), error (message + create new list link), success (split list)
  - Empty favorites state handled separately with helpful message
  - Matching logic in `matching.ts` is thorough: keyword matching with word-boundary awareness, German compound word support, exclude/prefer terms, relevance scoring (1-5 scale), recommendation engine
  - `SplitList` component correctly splits into 4 groups: Migros, Coop, Either, No deals
  - No nested button/link issues: all `<Link>` elements use `buttonVariants()` (CSS class approach) instead of wrapping `<Button>` components. No `<a><button>` nesting found anywhere.
  - Share functionality uses native `navigator.share` with clipboard fallback
  - Copy link with visual "Copied!" feedback

### 4. Tailwind + shadcn/ui Compliance

- **Status:** PASS
- **Evidence:**
  - Zero legacy CSS class names found: grep for `className="card"`, `className="btn"`, `className="hero"`, etc. returned no matches
  - `styles.css` contains only: `@import 'tailwindcss'` + `@theme` block (custom colors/radii) + minimal base styles (body font, spinner animation) -- 42 lines total
  - All custom colors defined in `@theme`: migros, coop, accent, success, error, muted, border, etc.
  - shadcn/ui components confirmed present and used:
    - `Button.tsx` -- used in all pages and components (14 instances of `type="button"`)
    - `Card.tsx` -- used in ComparisonPage, FavoritesEditor, EmailCapture, HomePage
    - `Input.tsx` -- used in HomePage, EmailCapture, ProductSearch
    - `Badge.tsx` -- used in TemplatePicker, CompareCard
  - `buttonVariants()` export used correctly for `<Link>` elements (avoids nested interactive elements)

### 5. React Query Compliance

- **Status:** PASS (with minor note)
- **Evidence:**
  - `query-client.ts`: staleTime = `60 * 60 * 1000` (1 hour) -- confirmed correct
  - `retry: 1` configured globally
  - Read queries that throw on error:
    - `fetchActiveDeals` -- throws `new Error(...)` on Supabase error
    - `fetchStarterPacks` -- throws `new Error(...)` on Supabase error
    - `fetchFavoriteItems` -- throws `new Error(...)` on Supabase error
  - `TemplatePicker` uses `useStarterPacks()` hook -- confirmed
  - `ComparisonPage` uses `useActiveDeals()` + `useFavoriteItems()` -- confirmed
  - All three hooks defined in `hooks.ts` using `useQuery` from `@tanstack/react-query`
  - Cache invalidation after mutations in `OnboardingPage` and `FavoritesEditor`
- **Minor note:** `searchDeals()` (line 62) returns empty array on error instead of throwing. This is acceptable since it's used imperatively in `ProductSearch` (not via React Query), and an empty result is a safe degradation.

### 6. Accessibility Spot Check

- **Status:** PASS
- **Evidence:**
  - No nested interactive elements: zero instances of `<a><button>` or `<Link><Button>`. All navigation links use `buttonVariants()` CSS approach.
  - Form inputs have labels:
    - Homepage email: `<label htmlFor="email-lookup" className="sr-only">Email address</label>`
    - Email capture: `<label htmlFor="email-capture" className="sr-only">Email address</label>`
    - Product search: `<label htmlFor="product-search" className="sr-only">Search products</label>`
  - All `<button>` elements have `type="button"` -- 14 total across 7 files, zero buttons missing the type attribute
  - `aria-label` on icon buttons: remove button in FavoritesEditor has `aria-label={`Remove ${item.label}`}`
  - Step progress indicator has `role="group"` and descriptive `aria-label` per step
  - Error messages use `role="alert"` (EmailCapture, HomePage, OnboardingPage)
  - Success message uses `role="status"` (EmailCapture)
  - Touch targets: remove buttons have `min-h-[44px] min-w-[44px]` (Apple HIG compliant)
  - Back button has `min-h-[44px]` for touch accessibility
  - Images have `alt` attributes (`alt={deal.product_name}`)
  - `lang="en"` set on `<html>` element

### 7. Test Suites

- **Status:** PASS
- **Frontend tests:** 76/76 passed (2 test files: `matching.test.ts` 58 tests, `verdict.test.ts` 18 tests) -- 408ms
- **Pipeline tests:** 77/77 passed (4 test files: `run.test.ts` 31, `categorize.test.ts` 17, `migros/fetch.test.ts` 21, `store.test.ts` 8) -- 440ms
- All tests ran cleanly with no warnings or flaky results

---

## Issues Found

### Low Priority

1. **Missing OG/Twitter meta tags** (`web/index.html`)
   - Impact: Social sharing previews (WhatsApp, Twitter, LinkedIn) will show a plain URL instead of a rich card with title/description/image
   - Recommendation: Add `og:title`, `og:description`, `og:image`, `og:url`, and `twitter:card` meta tags
   - Relevant to: UC-7 (Share Comparison) and the WhatsApp growth strategy

---

## Overall Verdict: PASS

The rebuild is solid. All core flows work correctly. React Query hooks are properly integrated with cache invalidation. Tailwind CSS v4 is cleanly applied with no legacy CSS remnants. shadcn/ui components (Button, Card, Input, Badge) are used consistently across all pages. Accessibility is well-handled with proper labels, ARIA attributes, touch targets, and no nested interactive elements. All 153 tests pass across both frontend and pipeline.

The only finding is the missing OG meta tags, which is low priority but worth adding before the WhatsApp sharing push.
