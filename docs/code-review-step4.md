# Code Review: Step 4 -- Metadata + Categoriser + Product Resolver + Storage

**Reviewer:** Independent Code Reviewer
**Date:** 12 April 2026
**Scope:** product-metadata.ts, metadata.ts, categorize.ts, product-resolve.ts, resolve-product.ts, store.ts, run.ts + all test files
**Verdict:** Needs Changes

---

## Summary

Step 4 modules are well-structured overall: clean separation of concerns, good test coverage, and correct pipeline flow (normalize -> metadata -> categorize -> resolve -> upsert). However, there are two blocking findings (barrel/re-export files violating CLAUDE.md) and several important issues around missing dependencies and a misleading test comment.

---

## Findings

### BLOCKING: B1 -- `metadata.ts` is a barrel file (violates CLAUDE.md)

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/metadata.ts`

This file is a pure re-export of `product-metadata.ts`:

```ts
export {
  extractBrand,
  extractQuantity,
  isOrganic,
  detectSubCategory,
  detectProductForm,
  detectMeatCut,
  extractProductMetadata,
} from './product-metadata'
```

CLAUDE.md explicitly says: "Do NOT create barrel files (index.ts re-exports). Import directly." The file's own comment ("Canonical re-export for metadata extraction") acknowledges it is a re-export.

The coding standards (Section 2) repeat: "No barrel files (index.ts re-exports). Import directly."

**CLAUDE.md folder structure lists `metadata.ts` as the canonical name.** The implementation lives in `product-metadata.ts`. This creates a confusing dual-file situation. The fix is to either:
- (a) Rename `product-metadata.ts` to `metadata.ts` and delete the re-export file, OR
- (b) Update CLAUDE.md to list `product-metadata.ts` as the canonical name and delete `metadata.ts`

**Action required:** Choose one canonical file name. Delete the other. Update all imports.

### BLOCKING: B2 -- `resolve-product.ts` is a barrel file (violates CLAUDE.md)

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/resolve-product.ts`

Same pattern -- a pure re-export of `product-resolve.ts`:

```ts
export { resolveProducts } from './product-resolve'
```

CLAUDE.md folder structure lists `resolve-product.ts` as the canonical name. The implementation lives in `product-resolve.ts`.

**Action required:** Same as B1. Choose one name, delete the other, update all imports.

### IMPORTANT: I1 -- `metadata.test.ts` tests the re-export, not the implementation

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/metadata.test.ts`

This file imports from `./metadata` (the barrel file) and runs 3 smoke tests to verify the re-exports work. This is a test for the barrel file pattern itself, which should not exist. Once B1 is resolved, this file should be deleted.

### IMPORTANT: I2 -- Missing dependency: `product-group-assign.ts`

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/product-resolve.ts` (line 10)

```ts
import { assignProductGroup } from './product-group-assign'
```

The file `pipeline/product-group-assign.ts` does not exist in the repository. The resolve-product test mocks this import, so tests pass, but the production code will fail at runtime. This module must either:
- Be created as part of this step, or
- Be documented as a known dependency for a later step (with a clear TODO)

### IMPORTANT: I3 -- Missing dependency: `validate.ts`

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/run.ts` (line 16)

```ts
import { isValidDealEntry } from './validate'
```

The file `pipeline/validate.ts` does not exist. The `run.ts` module will not compile without it.

### IMPORTANT: I4 -- Missing dependency: `migros/fetch-prices.ts`

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/run.ts` (line 14)

```ts
import { fetchMigrosRegularPrices } from './migros/fetch-prices'
```

The file `pipeline/migros/fetch-prices.ts` does not exist. Same issue as I2 and I3.

### MINOR: M1 -- Misleading test comment in `categorize.test.ts`

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/categorize.test.ts` (line 72)

```ts
// 'frisch' keyword matches sourceCategory
expect(result.category).toBe('fresh')
```

There is no "frisch" keyword in CATEGORY_RULES. The test passes because "milch" (from the dairy rule) matches inside "Frische Milchprodukte". The comment should be corrected to: `// 'milch' in sourceCategory matches dairy rule -> fresh`.

### MINOR: M2 -- `run.ts` reads `coop-deals.json` twice on cache miss

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/run.ts` (lines 57-59)

```ts
const coopRaw = readDealsFile('coop-deals.json').length > 0
  ? readDealsFile('coop-deals.json')
  : readDealsFile('coop/coop-deals.json')
```

When `coop-deals.json` exists and has data, `readDealsFile` is called twice: once for the length check, once to assign. Should read once and reuse:

```ts
let coopRaw = readDealsFile('coop-deals.json')
if (coopRaw.length === 0) {
  coopRaw = readDealsFile('coop/coop-deals.json')
}
```

### MINOR: M3 -- `storeDeals` productIds key format differs from `resolveProducts` return format

**File:** `/Users/kiran/ClaudeCode/basketch/pipeline/store.ts` (line 61)

`storeDeals` looks up product IDs using `${d.store}|${d.productName}`, and `run.ts` (lines 115-119) builds this composite key when merging. This works but the key construction is split across two files with no shared constant or type. A helper or documented convention would reduce the risk of key format drift.

### MINOR: M4 -- `product-resolve.ts` does not update `regular_price` on existing products

When a deal is resolved to an existing product, the product's `regular_price` field is not updated with `deal.originalPrice`. The architecture mentions tracking regular prices. Currently this is handled separately by `fetchMigrosRegularPrices` (which doesn't exist yet), but Coop regular prices from deals are never captured.

### FLAG: F1 -- Supabase client instantiated at module level with `process.env.SUPABASE_URL!`

**Files:** `product-resolve.ts` (lines 12-15), `store.ts` (lines 44-47)

Both files use non-null assertion (`!`) on environment variables at module scope. If env vars are missing, the error will be an opaque Supabase client failure rather than a clear "missing env var" message. Consider adding an explicit check with a descriptive error.

---

## What Looks Good

1. **product-metadata.ts** -- Thorough and well-structured. Brand extraction with word-boundary regex prevents false positives (e.g., "emmi" vs "emmentaler"). Multi-pack quantity parsing with unit conversion is solid. Test coverage is excellent with 277 lines of tests.

2. **categorize.ts** -- Clean, focused module. The discount_percent guarantee (calculate from prices, default to 0) matches the CLAUDE.md requirement that `discount_percent is NOT NULL`. Test coverage includes all three categories, sub-categories, source category fallback, and the discount guarantee.

3. **store.ts** -- Good defensive patterns: batch upserts, deduplication by conflict key (keeping highest discount), expired deal deactivation. Product name normalisation is correctly applied before upsert. Tests cover partial failure, batching, and all normalisation rules.

4. **product-resolve.ts** -- Batch-fetch then match pattern is efficient. Deduplication by source_name prevents duplicate product creation within a single run. Low resolution rate warning at 80% is a useful operational signal.

5. **run.ts** -- Pipeline orchestration follows the documented flow. Graceful degradation: one source can fail and the pipeline continues. Zero-deals-stored is a hard failure; partial storage is logged but not fatal. Pipeline run logging captures all failure modes.

6. **Test quality** -- All modules have co-located tests. Factory helpers (`makeDeal`) avoid test duplication. Supabase is properly mocked with chainable query builders. Edge cases (empty arrays, errors, deduplication) are covered.

---

## Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Standards compliance | Needs fix | B1, B2: barrel files violate no-barrel-file rule |
| Architecture alignment | Pass | Pipeline flow matches documented order |
| Test quality | Pass | Good coverage, proper mocking, edge cases |
| Error handling | Pass | Graceful degradation throughout |
| Completeness | Needs fix | I2, I3, I4: three missing dependency files |
| No barrel files | Fail | Two barrel files found (metadata.ts, resolve-product.ts) |

---

## Required Actions (before approval)

1. **Delete barrel files** `metadata.ts` and `resolve-product.ts`. Choose canonical names, update all imports (including `run.ts`). Delete `metadata.test.ts`.
2. **Address missing dependencies** (`product-group-assign.ts`, `validate.ts`, `migros/fetch-prices.ts`): either create them or add explicit TODO markers explaining they are not part of Step 4 scope.
3. **Fix the double-read** of `coop-deals.json` in `run.ts`.
4. **Fix the misleading comment** in `categorize.test.ts` line 72.
