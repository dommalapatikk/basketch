# Code Review: Step 2 -- Migros Source Module

**Reviewer:** Independent Code Reviewer
**Date:** 2026-04-12
**Files reviewed:**
- `pipeline/migros/fetch.ts`
- `pipeline/migros/normalize.ts`
- `pipeline/migros/fetch.test.ts`
- `pipeline/migros/fetch-integration.test.ts`
- `pipeline/migros/fixtures/migros-response.json`

**Standards references:** `CLAUDE.md`, `docs/coding-standards.md`, `shared/types.ts`

---

## Verdict: Approved with Minor Changes

The module is well-structured, follows the v2.1 architecture, and handles errors gracefully. Three minor issues need attention before proceeding.

---

## Findings

### 1. [MINOR] Unused imports in fetch.ts

**File:** `pipeline/migros/fetch.ts`, lines 2-3

`fs`, `path`, and `fileURLToPath` are imported at the top level but only used in the direct-run script block (lines 126-135). This is acceptable for the script runner pattern, but `fs` and `path` are unused when the module is imported as a library. With `noUnusedLocals: true` in tsconfig strict mode, this could cause a compile error depending on how the bundler/compiler treats the conditional usage.

**Recommendation:** Move the direct-run block into a separate file (e.g., `pipeline/migros/run-standalone.ts`) that imports `fetchMigrosDeals` from `./fetch`. This keeps `fetch.ts` a pure library module. Alternatively, use a dynamic import inside the `if (isDirectRun)` block.

**Severity:** Minor -- functional but may cause strict-mode compile warnings.

---

### 2. [MINOR] `validFrom` defaults to today when promotionDateRange is missing

**File:** `pipeline/migros/normalize.ts`, line 115

```ts
const validFrom = (dateRange?.startDate as string) ?? new Date().toISOString().slice(0, 10)
```

If the API returns no `promotionDateRange`, `validFrom` defaults to today's date. This is a reasonable fallback, but it introduces non-determinism: the same raw data produces different `UnifiedDeal` output depending on when the pipeline runs. This makes the normalizer impure and harder to test (the test fixture avoids this path because all fixtures have dates).

**Recommendation:** Add one unit test in `fetch.test.ts` that exercises the missing-date fallback path. This documents the behaviour and catches regressions. You could also consider a comment explaining why `new Date()` is acceptable here.

**Severity:** Minor -- logic is sensible but untested.

---

### 3. [MINOR] `fetch.test.ts` is misnamed -- it tests `normalize.ts`, not `fetch.ts`

**File:** `pipeline/migros/fetch.test.ts`

This file imports from `./normalize` and tests `normalizeProductName`, `calculateDiscountPercent`, and `normalizeMigrosDeal`. It does not test anything from `./fetch`. Per coding standards (Section 2): "Tests are co-located with source files (same directory, `.test.ts` suffix)."

The file should be named `normalize.test.ts` to match the source it tests. The actual fetch logic is tested in `fetch-integration.test.ts`, which is correctly named.

**Recommendation:** Rename `fetch.test.ts` to `normalize.test.ts`.

**Severity:** Minor -- naming only, no functional impact.

---

## Standards Compliance Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Strict TypeScript | PASS | No `any` types. Uses `unknown` with runtime narrowing throughout `normalize.ts`. |
| Named exports only | PASS | All exports are named: `fetchMigrosDeals`, `normalizeMigrosDeal`, `normalizeProductName`, `calculateDiscountPercent`. |
| No throws / return empty array on failure | PASS | Top-level try/catch returns `[]`. Per-batch try/catch logs and continues. `normalizeMigrosDeal` returns `null` on failure. |
| UnifiedDeal shape matches shared/types.ts | PASS | All 10 fields populated correctly: `store`, `productName`, `originalPrice`, `salePrice`, `discountPercent`, `validFrom`, `validTo`, `imageUrl`, `sourceCategory`, `sourceUrl`. |
| Import ordering (node > external > shared > relative) | PASS | Correct in both `fetch.ts` and `normalize.ts`. |
| 2-space indent, single quotes, no semicolons | PASS | Consistent throughout. |
| No hardcoded credentials | PASS | Guest token obtained at runtime via `MigrosAPI.account.oauth2.getGuestToken()`. No API keys in source. |
| No default exports | PASS | |
| File naming (kebab-case) | PASS | `fetch.ts`, `normalize.ts`. |
| Constants are UPPER_SNAKE_CASE | PASS | `PROMO_PAGE_SIZE`, `CARD_BATCH_SIZE`. |
| Comments explain "why" not "what" | PASS | Comments are purposeful (e.g., "partial data is better than none"). |
| Fixture in `fixtures/` subdirectory | PASS | `fixtures/migros-response.json` present with 5 representative products. |

---

## Architecture Alignment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Returns `UnifiedDeal[]` | PASS | Function signature: `Promise<UnifiedDeal[]>` |
| Two-step fetch (IDs then cards) | PASS | Step 1 collects promo UIDs via `getProductPromotionSearch`, Step 2 fetches cards in batches via `getProductCards`. |
| Pagination handling | PASS | Pages until `items.length < PROMO_PAGE_SIZE`. |
| Batch fetching | PASS | Card requests batched at 50 (`CARD_BATCH_SIZE`). |
| Product name normalization | PASS | Lowercase, whitespace collapse, unit normalization (`6 x 1.5 L` to `6x1.5l`). |
| Discount: badge preferred, then calculated | PASS | `extractDiscountFromBadges` first, `calculateDiscountPercent` as fallback. |
| Image URL resolution | PASS | Replaces `{stack}` placeholder with `original`. Tries transparent image first. |

---

## Test Quality

| Criterion | Status | Notes |
|-----------|--------|-------|
| Normalizer unit tests | PASS | 14 test cases covering: standard deal, calculated discount, missing image, empty breadcrumb, null URL, null prices, no sale price with badge, null/undefined input, missing name, missing offer, all fixtures pass. |
| Integration tests (mocked API) | PASS | 10 test cases covering: happy path, token failure, token throw, empty promo results, multi-page pagination, discount calculation, full field mapping, null price filtering, missing optional fields, batch failure recovery, non-PRODUCT item filtering. |
| Edge cases | PASS | Covers: non-PRODUCT items skipped, single batch failure continues, both prices null rejected, equal prices rejected. |
| Assertions are meaningful | PASS | Tests check specific field values, not just "not null". Field-by-field assertions in the mapping test. |
| Mock isolation | PASS | `vi.clearAllMocks()` in `beforeEach`, `vi.restoreAllMocks()` in `afterEach`. Console spies restored after use. |

---

## Security

| Criterion | Status | Notes |
|-----------|--------|-------|
| No hardcoded keys/tokens | PASS | Token obtained at runtime. |
| No credential exposure in logs | PASS | Logs say "Guest token acquired", not the token value. |
| No environment variable reads | PASS | Module uses only the `migros-api-wrapper` SDK, no direct env access. |

---

## Summary of Required Changes

1. **Rename** `fetch.test.ts` to `normalize.test.ts` (naming standards).
2. **Add one test** for the missing-date fallback in `normalizeMigrosDeal` (untested path).
3. **Consider extracting** the direct-run script block from `fetch.ts` into a separate file to keep the module pure (optional but recommended for strict-mode safety).

All three are minor. No blocking issues found.
