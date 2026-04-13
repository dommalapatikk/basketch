# Code Review: Step 6 -- Frontend Data Layer

**Reviewer:** Independent Code Reviewer
**Date:** 12 April 2026
**Scope:** `web/src/lib/` -- supabase.ts, use-cached-query.ts, queries.ts, verdict.ts, og-tags.ts, hooks.ts + tests
**Architecture refs:** CLAUDE.md, coding-standards.md v2.0, shared/types.ts, ADR-005

---

## Verdict: Approved with minor changes

The frontend data layer is well-built. Standards compliance is strong, architecture alignment is correct, security is clean, and test coverage is solid. Three minor items need attention before closing.

---

## 1. Standards Compliance

### 1.1 useCachedQuery (not React Query) -- PASS
- ADR-005 fully implemented. No React Query dependency anywhere.
- `useCachedQuery` provides localStorage cache with configurable stale time (default 60 min).
- All hooks in `hooks.ts` use `useCachedQuery` exclusively.
- `bsk:` prefix on cache keys prevents collisions.

### 1.2 All queries in queries.ts -- PASS
- All `supabase.from()` calls are inside `queries.ts`. Components never call Supabase directly.
- `hooks.ts` wraps query functions in `useCachedQuery` -- clean separation.

### 1.3 Date filter safety net -- PASS
- Every deal query applies `.or('valid_to.is.null,valid_to.gte.${today()}')`.
- Verified in: `fetchActiveDeals`, `fetchDealsByCategory`, `searchDeals`, `fetchFavoriteComparisons`, `fetchActiveDealsForProducts`, `findBestDeal` -- all six deal-fetching functions.
- The `today()` helper returns `YYYY-MM-DD` format correctly via `.toISOString().slice(0, 10)`.

### 1.4 Formatting and naming -- PASS
- Named exports only (no default exports).
- camelCase functions, PascalCase types, UPPER_SNAKE_CASE constants.
- Single quotes, no semicolons, 2-space indent.
- Import ordering follows the standard (external, shared, relative).

---

## 2. Architecture Alignment

### 2.1 Verdict formula -- PASS
- Imports `VERDICT_WEIGHTS` from `@shared/category-rules` (40% deal count, 60% avg discount).
- Imports `TIE_THRESHOLD` (0.05) and `MIN_DEALS_FOR_VERDICT` (3) from `@shared/types`.
- Relative diff calculation for tie detection is correct: `diff / maxScore <= 0.05`.
- Insufficient data guard: both stores must have >= 3 deals or verdict defaults to tie with zero scores.

### 2.2 Two-tier Coop status -- PASS
- `fetchFavoriteComparisons` checks `coopProductKnown` flag when no Coop deal found.
- `checkCoopProductExists` checks by product group first, then keyword fallback.
- The flag is correctly set to `false` (default) and only set to `true` when a Coop product exists in the products table but has no active deal.

### 2.3 Data freshness -- PASS
- `computeWeeklyVerdict` correctly determines `'current'` (both stores), `'partial'` (one store), `'stale'` (no deals).

### 2.4 OG tags -- PASS
- Covers all routes: home, deals, onboarding, compare, about, plus fallback.
- HTML escaping applied to all user-facing content via `escapeHtml()`.
- Twitter card tags included alongside Open Graph tags.

---

## 3. Test Quality

### 3.1 use-cached-query.test.ts -- GOOD (7 tests)
- Covers: cache miss, cache hit, stale cache, fetch error, refetch, localStorage persistence, corrupted cache.
- Uses `@testing-library/react` `renderHook` + `waitFor` -- correct approach.
- localStorage properly mocked and cleared between tests.

### 3.2 queries.test.ts -- GOOD (11 tests)
- Covers: fetchActiveDeals (with filters, error), fetchDealsByCategory (all, specific, unknown), fetchBasket, createBasket (with/without email), removeBasketItem, lookupBasketByEmail (success, failure), fetchLatestPipelineRun (success, error).
- Supabase chain mock is well-structured.

### 3.3 verdict.test.ts -- GOOD (14 tests)
- Covers: averageDiscount (empty, single, multiple, rounding, null), scoreStore (empty, max, partial), computeCategoryVerdict (tie, migros win, coop win, empty, below threshold, one-store-insufficient, counts+avgs), computeWeeklyVerdict (categories, freshness states, metadata), calculateVerdict (date format, real data).
- Edge cases well covered: null discount_percent, insufficient data, partial freshness.

### 3.4 Missing tests -- MINOR
- No tests for `og-tags.ts`. Low risk since it is pure string output, but a few snapshot tests would harden it.
- No tests for `searchProducts` in queries.ts. This is the most complex function (80+ lines with three phases). It depends on `matching.ts` functions, so integration-style tests would be valuable.

---

## 4. Security

### 4.1 No service role key in frontend -- PASS
- `supabase.ts` uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Grep for `SERVICE_ROLE`, `service.role`, `serviceRole` across `web/` returned zero matches.
- Startup guard throws if env vars are missing -- good fail-fast behaviour.

### 4.2 SQL injection / Supabase injection -- PASS
- `searchDeals` and `findBestDeal` escape `%` and `_` in user keywords before passing to `.ilike()`.
- `lookupBasketByEmail` uses an RPC function rather than exposing email column via PostgREST -- good pattern.

---

## 5. Error Handling

### 5.1 Three-state pattern (loading, error, success) -- PASS
- `useCachedQuery` returns `{ data, loading, error, refetch }`.
- `loading` starts as `true` on cache miss, `false` on cache hit. Correct.
- Error is wrapped in `Error` instance even for non-Error throws.

### 5.2 Query-level error handling -- PASS
- Critical queries (`fetchActiveDeals`, `fetchDealsByCategory`, `fetchBasket`, etc.) throw on error -- letting `useCachedQuery` capture it.
- Non-critical queries (`searchDeals`, `fetchLatestPipelineRun`, `addBasketItemsBatch`) return empty/null on error with `console.error` -- graceful degradation.
- This split is appropriate: you want the verdict page to show an error state, but search can silently return no results.

### 5.3 localStorage resilience -- PASS
- Both `getCached` and `setCache` wrap in try/catch. Corrupted JSON or full storage does not crash the app.

---

## 6. Findings

### F1 -- `coopProductKnown` logic inverted (MINOR)

In `fetchFavoriteComparisons` (queries.ts line 415-421):

```ts
let coopProductKnown = false
if (!coopDeal) {
  coopProductKnown = await checkCoopProductExists(...)
}
```

When a Coop deal IS found, `coopProductKnown` stays `false`. But if there is a deal, the product is obviously known. The field is only consumed when `coopDeal` is null (for the two-tier message), so the logic is functionally correct at the UI layer. However, the data in `FavoriteComparison` is semantically misleading: a comparison with `coopDeal` set and `coopProductKnown: false` is technically wrong. If any downstream code ever checks `coopProductKnown` without first checking `coopDeal`, it will get the wrong answer.

**Recommendation:** Set `coopProductKnown: true` when `coopDeal` is not null. This makes the data self-consistent. One-line change.

```ts
let coopProductKnown = coopDeal !== null
if (!coopDeal) {
  coopProductKnown = await checkCoopProductExists(...)
}
```

### F2 -- `findBestDealForItem` escapes keyword but compares with `.includes()` (MINOR)

In `findBestDealForItem` (queries.ts line 467):

```ts
const escaped = keyword.replace(/%/g, '\\%').replace(/_/g, '\\_')
return deals.find((d) => {
  const name = d.product_name.toLowerCase()
  if (!name.includes(escaped)) return false
```

The `%` and `_` escaping is for Supabase/Postgres LIKE patterns. But `findBestDealForItem` does an in-memory JavaScript `.includes()` check, not a database query. A keyword like `100%` would be escaped to `100\%` and then fail to match `"100% orange juice"` in memory.

**Recommendation:** Remove the escaping in `findBestDealForItem` since it operates in-memory, not via Supabase. The escaping belongs only in `searchDeals` and `findBestDeal` which use `.ilike()`.

```ts
function findBestDealForItem(
  keyword: string,
  deals: DealRow[],
  excludeTerms: string[] | null,
): DealRow | undefined {
  return deals.find((d) => {
    const name = d.product_name.toLowerCase()
    if (!name.includes(keyword)) return false
```

### F3 -- Legacy aliases add ~100 lines of duplication (FLAG -- non-blocking)

`queries.ts` has a "Legacy aliases" section (lines 792-890) that duplicates basket/favorite operations. These are marked `@deprecated` which is correct. This is not blocking, but should be tracked for removal once existing components are migrated to the new `Basket*` functions. The file is already at ~890 lines, well above the 300-line split threshold in coding standards.

**Recommendation:** Track removal of legacy aliases as a follow-up task. Once removed, `queries.ts` will be ~790 lines, still above 300. Consider splitting into `queries/deals.ts`, `queries/basket.ts`, `queries/products.ts` at that point.

---

## Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| F1 | `coopProductKnown` stays false when deal exists | Minor | Fix: set `true` when `coopDeal !== null` |
| F2 | SQL escaping applied to in-memory `.includes()` | Minor | Fix: remove escaping in `findBestDealForItem` |
| F3 | Legacy aliases push queries.ts to ~890 lines | Flag | Track for follow-up cleanup |

**F1 and F2 are one-line fixes. F3 is a carry-forward flag.**

With F1 and F2 addressed, this step is approved.
