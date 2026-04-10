# Code Review: basketch Frontend (Tailwind + React Query Rebuild)

**Reviewer:** Independent Code Reviewer (Agent)
**Date:** 10 April 2026
**Scope:** All frontend files in `web/` -- rebuild from plain CSS + raw useState/useEffect to Tailwind CSS v4 + shadcn/ui + React Query v5
**Test results:** 76 tests passed (0 failed), TypeScript compiles with zero errors

---

## Summary

| Metric | Count |
|--------|-------|
| Files reviewed | 26 |
| Verdict: Approved | 22 |
| Verdict: Needs Changes | 4 |
| Verdict: Blocked | 0 |

The rebuild successfully replaces the previous plain CSS + raw useState/useEffect implementation with the approved tech stack. Tailwind CSS v4 is correctly configured via the Vite plugin. React Query v5 is integrated with `staleTime: 3600000` (1 hour) as specified in Section 5.8 of the architecture. The shadcn/ui component pattern (copy into `src/components/ui/`, compose in app-level components) is followed correctly.

**What's done well:**
- Clean React Query integration with proper `queryKey` design and `enabled` guards
- shadcn/ui primitives (Button, Card, Input, Badge) are well-structured with `cva` and `cn()` -- exactly the right pattern
- The matching logic (`matching.ts`) is thoroughly tested (58 tests) with good German compound word awareness
- Verdict logic is independently tested (18 tests)
- No `console.log` in production, no `@ts-ignore`, no `any` types, no security issues
- All data fetching goes through `queries.ts` -- components never call `supabase.from()` directly
- Three-state handling (loading/error/success) present in data-fetching components
- Good accessibility: `aria-label`, `role="alert"`, `role="status"`, screen-reader-only labels, 44px touch targets

---

## Per-File Review

### web/vite.config.ts
- **Verdict: Approved**
- Tailwind v4 Vite plugin correctly configured. Path aliases for `@shared` and `@` are correct.

### web/tsconfig.json
- **Verdict: Approved**
- Extends base config. Strict mode inherited. Path aliases match Vite config. `noEmit: true` appropriate for Vite projects.

### web/package.json
- **Verdict: Approved**
- All required dependencies present: `@tanstack/react-query` v5, `tailwindcss` v4, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`. Scripts are correct. No unnecessary dependencies.

### web/src/styles.css
- **Verdict: Approved**
- Uses Tailwind v4 `@import 'tailwindcss'` and `@theme` for custom design tokens. Custom colors for Migros/Coop branding are well-defined. Minimal custom CSS (only body font-family and spin animation). The custom `animate-spin` keyframe is acceptable since Tailwind v4 uses CSS-first configuration.

### web/src/main.tsx
- **Verdict: Approved**
- Clean entry point. StrictMode enabled. Named import from `App`.

### web/src/App.tsx
- **Verdict: Approved**
- `QueryClientProvider` wraps the entire app -- correct placement. Route structure matches the architecture URL plan (`/`, `/onboarding`, `/compare/:favoriteId`, `/about`). Layout component wraps all routes via nested `<Route element={<Layout />}>`.

### web/src/lib/utils.ts
- **Verdict: Approved**
- Standard shadcn/ui `cn()` utility using `clsx` + `tailwind-merge`.

### web/src/lib/query-client.ts
- **Verdict: Approved**
- `staleTime: 60 * 60 * 1000` (1 hour) matches Section 5.8 of the architecture exactly. `retry: 1` is reasonable for a frontend that shows fallback UI on failure.

### web/src/lib/hooks.ts
- **Verdict: Approved**
- Clean React Query hooks with proper `queryKey` arrays. `useFavoriteItems` correctly uses `enabled: !!favoriteId` to prevent fetching with undefined ID. Non-null assertion on `favoriteId!` in `queryFn` is safe because the `enabled` guard ensures it's defined when the query runs.

### web/src/lib/queries.ts
- **Verdict: Approved**
- All Supabase queries centralized here -- correct per standards. Error handling returns empty arrays/null rather than throwing -- correct per architecture. SQL injection prevented by using Supabase's query builder. Search inputs correctly escape `%` and `_` wildcards (lines 51, 241). Types imported from shared. `findBestDeal` correctly uses `.maybeSingle()` (line 252).

### web/src/lib/matching.ts
- **Verdict: Approved**
- Excellent matching logic with well-documented scoring system. German compound word awareness is important for this Swiss grocery app. The `QUALIFIERS` set for brand prefixes (bio, m-budget, etc.) is a smart design. 58 tests confirm correctness. Clean separation of concerns: `keywordMatches`, `matchRelevance`, `findBestMatch`, `matchFavorites`, `splitShoppingList` are each single-responsibility.

### web/src/lib/verdict.ts
- **Verdict: Approved**
- Correct use of shared constants (`TIE_THRESHOLD`, `VERDICT_WEIGHTS`). Score normalization logic is sound. `dataFreshness` detection handles all three cases (current, stale, partial). 18 tests confirm correctness.

### web/src/components/ui/Button.tsx
- **Verdict: Approved**
- Proper shadcn/ui pattern: `cva` for variants, `forwardRef`, `cn()` for class merging. Brand variants (migros, coop) are a good project-specific extension. `min-h-[44px]` ensures touch targets meet accessibility guidelines.

### web/src/components/ui/Card.tsx
- **Verdict: Approved**
- Simple, clean. `forwardRef` + `cn()` for extensibility.

### web/src/components/ui/Input.tsx
- **Verdict: Approved**
- Clean. Focus styles use accent color. `forwardRef` for form integration.

### web/src/components/ui/Badge.tsx
- **Verdict: Approved**
- Good variant set matching store branding. `cva` pattern correct.

### web/src/components/Layout.tsx
- **Verdict: Approved**
- Sticky header, mobile-first max-width (`640px`), footer with attribution. Touch-target sizing on nav links (`min-h-[44px]`). `<Outlet />` for nested routes. Good semantic structure (header/main/footer).

### web/src/components/TemplatePicker.tsx
- **Verdict: Approved**
- Three-state handling present (loading/error/empty/success). Grid layout with responsive breakpoint. "Recommended" badge on first pack is a nice UX touch. Correctly uses `useStarterPacks()` React Query hook.

### web/src/components/FavoritesEditor.tsx
- **Verdict: Needs Changes**
- Issues:
  1. **Lines 17-28, 30-36: Direct Supabase mutation calls without React Query `useMutation`.** `removeFavoriteItem` and `addFavoriteItem` are called directly with manual state management (`setRemoving`, `props.onItemsChange`). This works but is inconsistent with the React Query pattern used for reads. For consistency, these should use `useMutation` from React Query, which provides `isPending`, `onSuccess`, and automatic cache invalidation.
  2. **Line 72: Plain text "x" for remove button.** Consider using a proper icon (lucide-react's `X` icon is already a dependency in `package.json`) for visual consistency.
- Suggestions:
  - Wrap mutations in `useMutation` hooks to align with the React Query data layer pattern.
  - Use `queryClient.invalidateQueries({ queryKey: ['favorites'] })` in `onSuccess` to keep cache in sync.

### web/src/components/ProductSearch.tsx
- **Verdict: Needs Changes**
- Issues:
  1. **Lines 11-14, 16-36: Raw useState pattern for search data fetching.** The search functionality uses `useState` + manual async function instead of React Query. Since the architecture specifies React Query for data fetching, this should use `useQuery` with the search term as a query key parameter. This would also give automatic deduplication and caching of repeated searches for free.
- Suggestions:
  - Refactor to `useQuery({ queryKey: ['deals', 'search', debouncedQuery], queryFn: ..., enabled: !!debouncedQuery })` pattern. Add a debounce (300ms) to avoid firing on every keystroke if search-on-type is added later.

### web/src/components/CompareCard.tsx
- **Verdict: Approved**
- Clean two-column comparison layout. Lazy-loaded images (`loading="lazy"`). Null-safe rendering for missing deals -- discount display correctly checks `deal.discount_percent != null && deal.discount_percent > 0` (line 42). Brand colors applied correctly.

### web/src/components/SplitList.tsx
- **Verdict: Approved**
- Clean grouping of comparisons by recommendation. Empty state handled. Color dots for visual store identification are a nice touch.

### web/src/components/EmailCapture.tsx
- **Verdict: Approved**
- Email validation uses regex pattern `^[^\s@]+@[^\s@]+\.[^\s@]+$` (line 19) -- adequate for frontend validation. Three states (form, saving, saved). Error display with `role="alert"`. Success state with redirect delay. Copy correctly says "find your list again next week" -- no misleading claims about sending emails.

### web/src/components/VerdictBanner.tsx
- **Verdict: Approved**
- Handles null verdict gracefully. Shows stale/partial data warnings. Clean verdict rendering with store-colored labels.

### web/src/pages/HomePage.tsx
- **Verdict: Approved**
- Email lookup uses direct `lookupFavoriteByEmail` call -- acceptable since this is a one-shot user action (not data fetching for display). Error and loading states handled. Good accessibility with `role="alert"` on error. Screen-reader-only label on input.

### web/src/pages/AboutPage.tsx
- **Verdict: Approved**
- Static content, well-structured. Uses Card component. No issues.

### web/src/pages/OnboardingPage.tsx
- **Verdict: Needs Changes**
- Issues:
  1. **Lines 25-32: `useEffect` for data fetching.** When arriving in edit mode, the component uses `useEffect` + `fetchFavoriteItems` to load existing items. This should use the existing `useFavoriteItems` hook (React Query) instead, which already supports conditional fetching via the `enabled` parameter. Using raw `useEffect` for data fetching is exactly what the rebuild was meant to eliminate.
  2. **Line 16: Unsafe type assertion on `location.state`.** `location.state as { favoriteId?: string; editMode?: boolean } | null` is a hard cast with no runtime validation. If the state shape changes or something unexpected is passed, this silently succeeds. Consider adding a runtime check.
- Fix for issue 1: Replace the `useEffect` block with:
  ```tsx
  const { data: existingItems, isLoading: existingItemsLoading } = useFavoriteItems(
    editState?.editMode ? editState.favoriteId : undefined
  )
  ```
  Then use `existingItems` and `existingItemsLoading` instead of the manual `items`/`loading` state for the edit-mode case.

### web/src/pages/ComparisonPage.tsx
- **Verdict: Needs Changes**
- Issues:
  1. **Line 125: `window.location.href` used directly in JSX render.** This reads the browser URL at render time. Not a real bug (the component remounts on navigation), but it couples render output to a global. Minor issue.
- Suggestions:
  - Consider using `useLocation().pathname` combined with `window.location.origin` for a React-idiomatic approach. This is a very minor point and does not block deployment.

---

## Cross-Cutting Issues

### 1. Shared type imports use relative paths instead of `@shared/*` alias

**Severity: Needs Changes (consistency, non-blocking)**

Every file that imports from `shared/types.ts` uses the relative path `'../../../shared/types'` instead of the configured `@shared/types` alias. Both `tsconfig.json` and `vite.config.ts` configure the `@shared` path alias, but no file uses it.

**Files affected:** `queries.ts`, `matching.ts`, `verdict.ts`, `TemplatePicker.tsx`, `FavoritesEditor.tsx`, `ProductSearch.tsx`, `CompareCard.tsx`, `SplitList.tsx`, `VerdictBanner.tsx`, `OnboardingPage.tsx`, plus test files.

**Fix:** Replace `from '../../../shared/types'` with `from '@shared/types'` and `from '../../../shared/category-rules'` with `from '@shared/category-rules'` in all files. This is the convention specified in CLAUDE.md: "Import shared types via: `import { Deal } from '@shared/types'`".

### 2. Write operations not using React Query's `useMutation`

**Severity: Needs Changes (consistency, non-blocking)**

Write operations (`addFavoriteItem`, `removeFavoriteItem`, `addFavoriteItemsBatch`, `saveFavoriteEmail`, `createFavorite`) are called directly with manual loading/error state management via `useState`. While this works, it misses the benefits of React Query's `useMutation`:
- Automatic `isPending`/`isError`/`isSuccess` states
- `onSuccess` callbacks for cache invalidation
- Built-in retry logic
- Consistent pattern with the read operations

This is not a blocking issue -- the current implementation is functional and correct. But for consistency with the React Query architecture decision, these should eventually be wrapped in `useMutation` hooks.

### 3. No `tailwind.config.ts` file

**Severity: Not an issue (informational)**

The coding standards document (Section 2) mentions `tailwind.config.ts` in the project structure, but the actual implementation uses Tailwind CSS v4 with the `@theme` directive in `styles.css`. This is correct -- Tailwind v4 moved configuration into CSS. The docs reference is outdated, not the code.

---

## Test Coverage Assessment

| Module | Tests | Coverage quality | Notes |
|--------|-------|-----------------|-------|
| `matching.ts` | 58 | Excellent | German compound words, exclude/prefer terms, edge cases |
| `verdict.ts` | 18 | Good | Scoring, tie detection, partial data |
| UI components | 0 | Acceptable | Per standards: "No tests for trivial code (pure rendering)" |
| `queries.ts` | 0 | Acceptable for MVP | Thin wrappers around Supabase, medium priority per standards |
| `hooks.ts` | 0 | Acceptable | Thin wrappers over query functions |

Test coverage is appropriate for a portfolio MVP. The high-leverage code (matching logic, verdict calculation) is thoroughly tested. The low-leverage code (UI rendering, Supabase queries) is untested, which matches the testing strategy in coding standards Section 6.

---

## Security Assessment

- No API keys or secrets in source code
- `SUPABASE_SERVICE_ROLE_KEY` not present anywhere in `web/`
- Environment variables accessed via `import.meta.env.VITE_*` (safe, read-only anon key)
- Supabase client throws on missing env vars (fail-fast, good)
- Search inputs escape `%` and `_` before use in `.ilike()` queries
- No `dangerouslySetInnerHTML` usage
- No XSS vectors identified

---

## Final Verdict

**Ready to deploy with minor changes.**

The rebuild successfully implements the approved tech stack: Tailwind CSS v4 with shadcn/ui-style components and React Query v5 with 1-hour stale time. The core logic (matching + verdict) is well-tested and correct. The code is clean, well-structured, and follows the coding standards.

### Required before shipping (2 items):

1. **`OnboardingPage.tsx` line 25-32:** Replace `useEffect` + `fetchFavoriteItems` with the existing `useFavoriteItems` React Query hook. This is the one remaining instance of the old pattern (raw useEffect for data fetching) that the rebuild was meant to eliminate. Architecture compliance issue.

2. **All files importing from shared:** Replace `'../../../shared/types'` with `'@shared/types'` across all files. This is the convention documented in CLAUDE.md and both tsconfig and vite are already configured for it.

### Recommended but not blocking (3 items):

3. Wrap write operations in `useMutation` hooks in `FavoritesEditor.tsx`, `OnboardingPage.tsx`, `EmailCapture.tsx`, and `HomePage.tsx` for consistency with the React Query pattern.
4. Refactor `ProductSearch.tsx` to use `useQuery` for search results instead of manual `useState`.
5. Use lucide-react `X` icon for the remove button in `FavoritesEditor.tsx` (the dependency is already installed).

---

## Re-Review (10 April 2026)

Re-checked the two required fixes from the original review. Both are now resolved.

### Issue 1: OnboardingPage.tsx -- raw useEffect for data fetching

**Status: Approved**

The raw `useEffect` + `fetchFavoriteItems` pattern has been replaced with the `useFavoriteItems` React Query hook (line 27). The implementation is clean:

- `editFavoriteId` is derived conditionally (line 26): only set when `editState?.editMode` is true, otherwise `undefined`
- `useFavoriteItems(editFavoriteId)` leverages the hook's existing `enabled: !!favoriteId` guard, so it only fetches when in edit mode
- A small `useEffect` (lines 30-34) syncs the React Query data into local state -- this is acceptable because `items` is also mutated by `handlePackSelect` and `FavoritesEditor`, so local state is the correct owner. The sync effect has proper guards (`existingItems.length > 0`, `items.length === 0`, `editState?.editMode`) to prevent infinite loops or overwriting user edits
- No raw `fetchFavoriteItems` call remains anywhere in the file

### Issue 2: Relative imports instead of @shared alias

**Status: Approved**

Zero matches found for `from '../../../shared` anywhere in `web/src/`. Spot-checked four files to confirm `@shared` alias is now used:

- `src/lib/queries.ts` line 3: `from '@shared/types'`
- `src/lib/verdict.ts` lines 3 and 11: `from '@shared/types'` and `from '@shared/category-rules'`
- `src/components/CompareCard.tsx` line 1: `from '@shared/types'`
- `src/pages/OnboardingPage.tsx` line 4: `from '@shared/types'`

### Build and test verification

- `npx tsc --noEmit` -- zero errors (clean exit)
- `npx vitest run` -- 76 tests passed (0 failed), 2 test files (matching + verdict)

No regressions introduced by either fix.

### Updated summary table

| Required fix | Original status | Re-review status |
|-------------|----------------|-----------------|
| 1. OnboardingPage.tsx: useEffect -> React Query | Needs Changes | **Approved** |
| 2. All files: relative imports -> @shared alias | Needs Changes | **Approved** |

All required changes are now resolved. The 3 recommended-but-not-blocking items (useMutation for writes, useQuery for ProductSearch, lucide-react X icon) remain as future improvements.

---

## Codex Fixes Re-Review

**Reviewer:** Independent Code Reviewer (Agent)
**Date:** 10 April 2026
**Scope:** 4 specific fixes applied from Codex's review (Fixes 3, 4, 5, 6)
**Test results:** Frontend: 76 tests passed (0 failed). Pipeline: 77 tests passed (0 failed). TypeScript: zero errors in both projects.

---

### Fix 3: React Query cache invalidation after mutations

**Files:** `web/src/components/FavoritesEditor.tsx`, `web/src/pages/OnboardingPage.tsx`

**Verdict: Approved**

The fix adds `useQueryClient` and `invalidateQueries` calls after add/remove mutations. Reviewed:

- **FavoritesEditor.tsx (lines 2, 15, 19-21, 28, 41):** `useQueryClient()` is obtained at component level (line 15). A helper `invalidateItems()` (lines 19-21) invalidates with key `['favorites', props.favoriteId, 'items']`. Called after successful `removeFavoriteItem` (line 28) and `addFavoriteItem` (line 41). The query key exactly matches the key in `useFavoriteItems` hook (`hooks.ts` line 14: `['favorites', favoriteId, 'items']`), so invalidation targets the correct cache entry.
- **OnboardingPage.tsx (lines 3, 18, 75):** `useQueryClient()` at component level (line 18). `invalidateQueries` called after `addFavoriteItemsBatch` succeeds (line 75), using key `['favorites', id, 'items']` where `id` is the just-created favorite. This ensures that if the user navigates to edit mode, the cache is fresh.
- Both files correctly call `invalidateQueries` only on success paths (after confirming the mutation returned valid data), not on error paths. This avoids unnecessary refetches on failure.
- The mutations themselves are still called imperatively (not via `useMutation`). This is consistent with the existing pattern noted in the original review as "recommended but not blocking." The invalidation fix addresses the actual bug (stale cache) without requiring a full refactor to `useMutation`.

No issues found. No regressions introduced.

---

### Fix 4: Read query functions now throw on Supabase errors

**Files:** `web/src/lib/queries.ts`

**Verdict: Approved**

Three read functions used as `queryFn` in React Query hooks now throw on Supabase errors instead of returning empty arrays:

- **fetchActiveDeals (lines 37-39):** Throws `Error` with `[queries] fetchActiveDeals: ${error.message}`. Previously returned `[]`.
- **fetchStarterPacks (lines 78-80):** Throws `Error` with `[queries] fetchStarterPacks: ${error.message}`. Previously returned `[]`.
- **fetchFavoriteItems (lines 150-152):** Throws `Error` with `[queries] fetchFavoriteItems: ${error.message}`. Previously returned `[]`.

This is the correct fix. React Query needs `queryFn` to throw in order to populate `isError` and trigger retry logic (configured as `retry: 1` in `query-client.ts`). Without throwing, errors were silently swallowed and components would show empty states instead of error UI.

Write operations intentionally kept as-is (return `null`/`false`/`[]` on failure):
- `searchDeals` (line 62): returns `[]` -- correct, called imperatively from `ProductSearch`
- `createFavorite` (line 95): returns `null` -- correct, called imperatively
- `saveFavoriteEmail` (line 114): returns `false` -- correct, called imperatively
- `addFavoriteItem` (line 177): returns `null` -- correct, called imperatively
- `removeFavoriteItem` (line 193): returns `false` -- correct, called imperatively
- `addFavoriteItemsBatch` (line 221): returns `[]` -- correct, called imperatively
- `lookupFavoriteByEmail` (line 131): returns `null` -- correct, called imperatively
- `findBestDeal` (line 252): returns `null` -- correct, called imperatively

The distinction between "used by React Query hooks" (must throw) and "called imperatively" (return error values) is correct and well-reasoned. Error messages include the function name for debuggability.

No issues found. No regressions introduced.

---

### Fix 5: Pipeline storage failure visibility

**Files:** `pipeline/run.ts`

**Verdict: Approved**

The fix adds three capabilities to the pipeline runner:

1. **Storage shortfall logging (lines 79-86):** After `storeDeals` returns, the code compares `storedCount` to `categorized.length`. If there is any shortfall, it logs an `[ERROR]` line with exact counts. This makes partial storage failures visible in CI logs instead of silently succeeding.

2. **Structured error_log in pipeline_runs (lines 95-101, 112):** Errors from source failures and storage shortfalls are collected into a `string[]`, then joined with `'; '` and stored in `error_log` field. This field already exists in the `PipelineRun` type (`shared/types.ts` line 66: `error_log: string | null`). When no errors occur, `null` is stored. This gives historical visibility into partial failures via the database.

3. **exit(1) only when zero deals stored (lines 116-119):** `process.exit(1)` triggers only when `storedCount === 0 && categorized.length > 0` -- meaning the pipeline had data to store but failed entirely. Partial success (e.g., 180 of 200 deals stored) exits normally. This is the correct behavior: partial data is better than no data for a weekly deal comparison app, and the error_log captures the shortfall for monitoring.

The exit logic is sound:
- Both sources empty (lines 61-64): `process.exit(1)` -- correct, no point continuing
- Partial source failure (one source has data): continues -- correct by design
- Storage shortfall but some deals stored: logs error, records in DB, exits 0 -- correct
- Zero deals stored despite having data: `process.exit(1)` -- correct, total storage failure
- Unexpected crash (line 126): `process.exit(1)` -- correct

No issues found. No regressions introduced.

---

### Fix 6: Nested button/link accessibility fix

**Files:** `web/src/pages/HomePage.tsx`, `web/src/pages/ComparisonPage.tsx`

**Verdict: Approved**

The fix replaces the pattern `<Link><Button>text</Button></Link>` (nested interactive elements, invalid HTML) with `<Link className={buttonVariants(...)}>text</Link>` (single interactive element styled as a button).

- **HomePage.tsx (line 50):** `<Link to="/onboarding" className={buttonVariants({ fullWidth: true })}>` -- applies full-width primary button styling via CVA. `buttonVariants` is exported from `Button.tsx` (line 46), so the styling is guaranteed to match the `Button` component exactly.

- **ComparisonPage.tsx (lines 68, 81, 137):** Three instances:
  - Line 68: `buttonVariants({ fullWidth: true, className: 'mt-4' })` -- error state "Create a new list" link
  - Line 81: `buttonVariants({ fullWidth: true, className: 'mt-4' })` -- empty state "Create a new list" link
  - Line 137: `buttonVariants({ variant: 'outline', size: 'sm' })` -- "Edit my list" link

All four instances correctly use the `buttonVariants` function with appropriate variant props. The `className` parameter in `buttonVariants()` is supported by CVA for merging additional classes.

This fix resolves the HTML spec violation where `<button>` inside `<a>` (or vice versa) creates nested interactive elements. Screen readers and keyboard navigation now work correctly since there is only one focusable element per action.

No issues found. No regressions introduced.

---

### Summary

| Fix | Description | Verdict |
|-----|-------------|---------|
| Fix 3 | React Query cache invalidation after mutations | **Approved** |
| Fix 4 | Read query functions throw on Supabase errors | **Approved** |
| Fix 5 | Pipeline storage failure visibility | **Approved** |
| Fix 6 | Nested button/link accessibility fix | **Approved** |

**All 4 fixes are approved.** Each fix is correctly implemented, addresses the original issue without introducing new problems, and all tests pass (76 frontend + 77 pipeline, zero TypeScript errors).
