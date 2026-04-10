# Code Review: basketch

**Reviewer:** Independent Code Reviewer Agent
**Date:** 10 April 2026
**Scope:** All code from Steps 2-7 (shared types, pipeline, frontend)

---

## Summary

| Metric | Count |
|--------|-------|
| Files reviewed | 28 |
| Approved | 22 |
| Needs Changes | 5 |
| Blocked | 1 |

**Test results:**
- Pipeline TypeScript (vitest): 46/46 passed
- Frontend TypeScript (vitest): 36/36 passed
- Python (pytest): Could not execute (permission issue) -- tests reviewed by reading code
- Pipeline tsc --noEmit: 0 errors
- Frontend tsc --noEmit: 0 errors

---

## Per-File Review

### shared/types.ts

- **Verdict: Approved**
- Well-structured single source of truth. Union types over enums (correct per standards). All interfaces cover both camelCase (app) and snake_case (DB) shapes. The `dealToRow` mapping function is clean.
- Good: `FavoriteComparison` type with `recommendation` union is well-designed for the split shopping list.
- Good: `StarterPackItem` includes `category`, enabling the onboarding flow to pre-assign categories without a round-trip.

### shared/category-rules.ts

- **Verdict: Approved**
- Constants extracted as required: `TIE_THRESHOLD`, `VERDICT_WEIGHTS`, `DEFAULT_CATEGORY`. Keywords are comprehensive for Swiss grocery context. `CATEGORY_RULES` is ordered correctly (fresh first, non-food second, long-life is the default catch-all).

---

### pipeline/migros/normalize.ts

- **Verdict: Needs Changes**
- Issues:
  - Line 45: `normalizeMigrosDeal(raw: any)` -- this is the **only** use of `any` in the entire codebase. The coding standards say "no `any` types". This is at the API boundary where incoming data shape is unknown, which is a legitimate case, but it should use `unknown` instead of `any` to enforce type-narrowing at the callsite.
- Suggestions:
  - Change `raw: any` to `raw: unknown`. The function already does runtime checks (`typeof raw !== 'object'`, `!raw`), so the logic would work with minimal adjustment.
- Good: `normalizeProductName` and `calculateDiscountPercent` are clean, single-responsibility functions. The regex for unit normalization is well-tested. The try/catch returns null rather than throwing -- correct per pipeline error handling standards.

### pipeline/migros/fetch.ts

- **Verdict: Approved**
- Follows the source module contract: `fetchMigrosDeals(): Promise<UnifiedDeal[]>`. Never throws. Logs with the structured format `[migros] [LEVEL] message`. Pagination stops correctly when `products.length < PAGE_SIZE`.
- Good: The direct-run detection (`isDirectRun`) is a clean pattern for CLI use during development.

### pipeline/migros/fetch.test.ts

- **Verdict: Approved**
- 21 tests covering normalization, discount calculation, and fixture-based integration. Tests the boundary well: null input, undefined input, missing name, missing offer, both prices null. The fixture-based test at the end (`normalizes all fixture products without throwing`) is a smart catch-all.

### pipeline/migros/fixtures/migros-response.json

- **Verdict: Approved**
- Good fixture design: 5 products covering different edge cases (normal deal, null promotionPercentage, null image/categories/productUrls, null promotionPrice with percentage, multi-unit quantity). This is exactly what fixture data should look like.

---

### pipeline/coop/fetch.py

- **Verdict: Approved**
- Clean structure. Never raises -- catches all exceptions and returns empty list. Logging follows the structured format. Pagination stops when no cards are found. The `if __name__ == "__main__"` block writes JSON and uses correct exit code.
- Good: `REQUEST_TIMEOUT = 15` prevents hangs on network issues.

### pipeline/coop/normalize.py

- **Verdict: Approved**
- Type hints on all function signatures (correct per Python standards). Output uses camelCase keys matching the TypeScript `UnifiedDeal` interface. `parse_price` handles Swiss-specific formats (`179.--`, en-dash). `normalize_product_name` regex matches the TypeScript version in `pipeline/migros/normalize.ts`.
- Good: The functions are well-isolated -- each does one thing. `parse_deal_card` handles every CSS selector gracefully with null checks.

### pipeline/coop/test_fetch.py

- **Verdict: Approved**
- Comprehensive: 37+ test cases organized into clear classes. Tests cover normalization, price parsing, discount parsing, date parsing, HTML card parsing with fixtures, and end-to-end normalization. The `test_camel_case_keys` test is a smart contract test ensuring Python output matches TypeScript expectations.

---

### pipeline/categorize.ts

- **Verdict: Approved**
- Clean implementation of keyword matching. First-match-wins logic is correct. The `discount_percent` guarantee (lines 28-37) ensures it is never null after categorization -- good data integrity safeguard.
- Good: Falls through to `DEFAULT_CATEGORY` cleanly rather than having an explicit long-life rule.

### pipeline/categorize.test.ts

- **Verdict: Approved**
- 17 tests with good use of `it.each` for parameterized testing. Covers fresh, non-food, long-life default, source category matching, discount_percent guarantee, and first-match-wins ordering. The `makeDeal` helper is clean.

### pipeline/store.ts

- **Verdict: Approved**
- Batching (100 per batch), error handling (log + continue on batch failure), and deactivation logic are all correct. Uses `dealToRow` from shared types for the camelCase-to-snake_case conversion.
- Good: `deactivateExpiredDeals` correctly filters by `is_active = true` before updating -- avoids unnecessary writes.

### pipeline/store.test.ts

- **Verdict: Approved**
- 8 tests with proper mocking of the Supabase client. Tests batch splitting (250 deals = 3 batches), partial failure handling, snake_case conversion, deactivation query construction, and pipeline run logging. The mock chain (`mockFrom -> mockUpsert`, etc.) is well-structured.

### pipeline/run.ts

- **Verdict: Blocked**
- Issue (Architecture violation, line 22):
  - `readDealsFile` casts `parsed as UnifiedDeal[]` without validating individual entries. The technical architecture (Section 2.5) explicitly requires: "run.ts must validate the JSON from the Python Coop scraper against the UnifiedDeal schema before processing. If any field is missing or has the wrong type, log the invalid entry and skip it rather than crashing the pipeline. This is the trust boundary between the Python and TypeScript halves."
  - Currently, malformed JSON from the Coop scraper (e.g., missing `salePrice`, wrong types) would silently pass through as `UnifiedDeal` objects, potentially causing runtime errors in `categorizeDeal` or `storeDeals`.
  - **Fix:** Add per-entry validation before casting. Validate at minimum: `store` is `'migros' | 'coop'`, `productName` is a non-empty string, `salePrice` is a positive number. Log and skip invalid entries.
- Issue (Line 83):
  - `process.exit(0)` on catch swallows the real exit code. If the pipeline crashes unexpectedly, CI will report success. This is intentional ("best-effort: exit 0 even on partial failure") but the comment should be more explicit about the tradeoff -- CI will never alert on total pipeline failure.
- Suggestions:
  - Consider `process.exit(1)` when both sources return 0 deals (lines 41-43 log the error but still exit 0).

---

### web/src/lib/supabase.ts

- **Verdict: Approved**
- Minimal, correct. Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (read-only key, safe in browser). Throws on missing env vars (correct -- fail fast).
- Good: No `SUPABASE_SERVICE_ROLE_KEY` anywhere in the web folder.

### web/src/lib/queries.ts

- **Verdict: Needs Changes**
- Issue (Line 52): `searchDeals` uses `.ilike('product_name', `%${normalized}%`)`. While Supabase parameterizes queries server-side (no SQL injection), the `%` wildcard characters in the user input are not escaped. A user searching for `%` or `_` would get unexpected results. This is a minor correctness issue, not a security issue.
  - **Fix:** Escape `%` and `_` in the `normalized` string before passing to `ilike`.
- Issue (Line 239): `findBestDeal` uses `.single()` which throws an error when there are zero results. The function catches this via the `if (error)` check and returns null, which works, but it triggers a Supabase error log for a normal "not found" case. Consider using `.maybeSingle()` instead to avoid the spurious error.
- Good: All queries return empty arrays/null on error (never throw). Query construction is clean and type-safe. The `addFavoriteItemsBatch` function is a nice optimization for starter pack import.

### web/src/lib/verdict.ts

- **Verdict: Approved**
- This is the highest-leverage code in the frontend. The scoring logic is correct: weighted combination of deal count share (0.4) and average discount share (0.6), normalized to 0-100. Tie detection within 5% threshold. Data freshness detection for stale/partial/current.
- Verified: When both stores have identical deals (same count, same avg discount), scores are equal, and the winner is correctly 'tie'.
- Verified: When one store has 0 deals, its score is 0 (the `if (storeDeals.length === 0) return 0` guard).
- Good: The `groupDeals` function pre-initializes all categories with empty arrays, avoiding undefined access.

### web/src/lib/verdict.test.ts

- **Verdict: Approved**
- 18 tests covering averageDiscount, scoreStore, computeCategoryVerdict, and computeWeeklyVerdict. Tests the critical cases: tie, migros wins, coop wins, both empty, null discount_percent, data freshness (stale/partial/current).

### web/src/lib/matching.ts

- **Verdict: Approved**
- Clean implementation of the favorites-to-deals matching. `findBestMatch` does keyword substring matching and returns the best discount. `getRecommendation` has correct tiebreaker logic (discount first, then sale price, then 'both'). `splitShoppingList` is a clean switch-based partitioner.
- Good: The `matchFavorites` function also converts `FavoriteItemRow` (snake_case) to `FavoriteItem` (camelCase) in the output -- clean boundary mapping.

### web/src/lib/matching.test.ts

- **Verdict: Approved**
- 18 tests with thorough coverage of findBestMatch, getRecommendation, matchFavorites, and splitShoppingList. The split test (lines 163-193) is particularly good -- it sets up a scenario with all four recommendation types and verifies correct bucketing.

---

### web/src/App.tsx

- **Verdict: Approved**
- Clean router setup. Named exports used (correct). Routes match the architecture: `/` (home), `/onboarding`, `/compare/:favoriteId`, `/about`.

### web/src/main.tsx

- **Verdict: Approved**
- Minimal entry point with StrictMode. Correct.

### web/src/styles.css

- **Verdict: Approved**
- Mobile-first CSS (640px max-width). No Tailwind -- the project uses hand-written CSS, which is fine for an MVP this size. Variables for brand colors, consistent spacing, and good touch target sizes (buttons have adequate padding). The comparison grid (`grid-template-columns: 1fr 1fr`) works well for the side-by-side store view on mobile.

### web/src/components/Layout.tsx

- **Verdict: Approved**
- Simple layout with sticky header, nav links, and footer. Uses `Outlet` for nested routing. No issues.

### web/src/components/TemplatePicker.tsx

- **Verdict: Approved**
- Handles loading/error/success states correctly. The pack grid is a 2-column grid which works well on mobile.

### web/src/components/FavoritesEditor.tsx

- **Verdict: Approved**
- Clean add/remove flow. Accessibility: the remove button has `aria-label`. Item count displayed at the bottom.

### web/src/components/ProductSearch.tsx

- **Verdict: Needs Changes**
- Issue: No debouncing on search. Every keystroke followed by Enter triggers a Supabase query. While this is acceptable for MVP (search is triggered by button/Enter, not on-type), the `handleKeyDown` fires on every Enter press without debounce.
  - **Suggestion (non-blocking):** Consider adding a `disabled` state during search to prevent double-submission.
- Issue (Line 42): When a user selects a search result, the search query string is used as the keyword, not the product name. This means if a user searches "milch", selects "vollmilch bio 1l", the keyword saved is "milch" -- which is actually correct behavior for broad matching. But the label is set to `deal.product_name` which might be confusingly specific. This is a UX decision, not a bug.
- Good: The "Add anyway" button for no-results is a thoughtful UX touch -- users can add items that aren't currently on sale.

### web/src/components/EmailCapture.tsx

- **Verdict: Needs Changes**
- Issue (Line 15): Email validation is just `trimmed.includes('@')`. This allows clearly invalid emails like `@`, `a@`, `@b`. While server-side validation should catch these, the frontend should provide better feedback.
  - **Fix:** Use a basic regex or the HTML5 `type="email"` validation via a form submit, or at minimum check for `x@y.z` pattern.
- Issue (Line 41): The component says "we'll send you a link" but the system doesn't actually send emails -- it uses email as a lookup key. This copy is misleading.
  - **Fix:** Change to "Enter your email to find your list next time."

### web/src/components/CompareCard.tsx

- **Verdict: Needs Changes**
- Issue (Lines 34, 55): `{migrosDeal.discount_percent && (...)}` -- this is a common React gotcha. If `discount_percent` is `0` (which the categorizer can set), this evaluates to `0` and React renders the number `0` in the DOM. Since the categorizer guarantees `discount_percent` is never null after processing, the only falsy value would be `0`.
  - **Fix:** Use `{migrosDeal.discount_percent != null && migrosDeal.discount_percent > 0 && (...)}` or `{!!migrosDeal.discount_percent && (...)}`.
- Good: The two-column comparison layout is clean. The recommendation tag system (`REC_TAGS`) is well-structured.

### web/src/components/SplitList.tsx

- **Verdict: Approved**
- Clean component that delegates to `splitShoppingList` and renders each bucket with appropriate headers. Empty state handled.

### web/src/components/VerdictBanner.tsx

- **Verdict: Approved**
- Correctly handles null verdict (returns null). Shows freshness warnings for stale and partial data. The `verdictSummary` function is readable and produces the right copy.

### web/src/pages/HomePage.tsx

- **Verdict: Approved**
- Handles loading/success states. Fetches all active deals on mount and computes the weekly verdict. Email lookup navigates to the comparison page on success, shows error on failure.
- Good: The hero section with CTA is clean and focused.

### web/src/pages/OnboardingPage.tsx

- **Verdict: Approved**
- Three-step flow (pick/edit/save) is well-implemented. Step indicator shows progress. The "Start from scratch" option creates an empty favorites list. Loading state prevents double-clicks.
- Good: The "Skip -- just show my deals" option for email capture respects the user's choice.

### web/src/pages/ComparisonPage.tsx

- **Verdict: Approved**
- Fetches favorites and deals in parallel (`Promise.all`), which is correct for performance. Handles missing favoriteId, empty favorites, and fetch errors. Shows summary counts at the top.

### web/src/pages/AboutPage.tsx

- **Verdict: Approved**
- Static content page. No issues. Privacy section is appropriate.

---

## Cross-Cutting Issues

### 1. Missing JSON validation at the Python-TypeScript trust boundary (Blocked)

`pipeline/run.ts` reads Coop JSON output and casts it to `UnifiedDeal[]` without validating individual entries. The architecture document explicitly requires per-entry validation at this boundary. This is the single most important issue in the review because malformed Python output could corrupt the database.

### 2. No console.log in web production code (Passed)

Verified: zero `console.log` statements in `web/src/`. Query functions use `console.error` for genuine errors, which is acceptable.

### 3. No secrets in source code (Passed)

- `.env` file exists but is in `.gitignore`
- No API keys or tokens found in any source file
- Frontend uses `VITE_` prefixed env vars (anon key only)
- Pipeline uses `process.env.SUPABASE_SERVICE_ROLE_KEY` (from GH secrets)

### 4. No circular dependencies (Passed)

Import graph is clean:
- `shared/types.ts` has no imports from pipeline or web
- `shared/category-rules.ts` imports only from `./types`
- Pipeline modules import from `shared` and local files only
- Web modules import from `shared` and `./lib` only

### 5. Consistent error handling (Passed)

- Pipeline: logs errors, returns empty array, never throws -- correct per standards
- Frontend: returns empty array/null on query errors, shows error UI -- correct per standards

### 6. The `any` type in normalize.ts

Only one occurrence in the entire codebase (`normalizeMigrosDeal(raw: any)`). This is at an API boundary where the shape is genuinely unknown, but `unknown` would be more type-safe.

---

## Test Coverage Assessment

| Module | Tests | Coverage quality | Notes |
|--------|-------|-----------------|-------|
| pipeline/migros/normalize | 21 | Excellent | Fixture-based, edge cases covered |
| pipeline/categorize | 17 | Excellent | Parameterized, discount guarantee tested |
| pipeline/store | 8 | Good | Mocked Supabase, batch splitting tested |
| pipeline/run | 0 | Missing | No tests for the orchestrator. The JSON validation gap makes this more concerning. |
| pipeline/coop (Python) | 37+ | Excellent | Fixture-based, end-to-end, camelCase contract test |
| web/lib/verdict | 18 | Excellent | Scoring, tie detection, freshness all tested |
| web/lib/matching | 18 | Excellent | Matching, recommendation, split list all tested |
| web/lib/queries | 0 | Acceptable | Query functions are thin wrappers around Supabase. Testing would require mocking Supabase, which adds low value for MVP. |
| web/components | 0 | Acceptable | Components are rendering-focused with minimal logic. Testing standards say not to test pure rendering. |

**Missing test coverage that matters:**
1. `pipeline/run.ts` -- the orchestrator has no tests. Since it's the entry point and handles the trust boundary, at least the `readDealsFile` function should have a test with malformed JSON.

---

## Final Verdict

**Needs work** -- one Blocked file, five Needs Changes files.

### Must fix before deploy:

1. **pipeline/run.ts** (Blocked): Add per-entry validation when reading Coop JSON. This is an architecture requirement and a data integrity risk.

### Should fix before deploy:

2. **pipeline/migros/normalize.ts**: Change `any` to `unknown`.
3. **web/src/components/CompareCard.tsx**: Fix the `discount_percent && (...)` falsy-zero rendering bug.
4. **web/src/components/EmailCapture.tsx**: Fix misleading "we'll send you a link" copy.
5. **web/src/lib/queries.ts**: Use `.maybeSingle()` instead of `.single()` in `findBestDeal`.
6. **web/src/components/EmailCapture.tsx**: Improve email validation beyond `includes('@')`.

### Nice to have (non-blocking):

7. Escape `%` and `_` wildcards in `searchDeals` ilike queries.
8. Add a test for `readDealsFile` with malformed JSON.

### What's well done:

- The verdict calculation logic is correct and well-tested. I verified the scoring math manually.
- The matching/split-list logic correctly handles all four recommendation types.
- The Python and TypeScript normalization functions produce identical output for the same input -- the `test_camel_case_keys` test in Python is a smart contract test.
- Error handling is consistent across the entire codebase: pipeline never throws, frontend never crashes on query failure.
- The three-state pattern (loading/error/success) is followed in every data-fetching component.
- Type safety is excellent -- one `any` in the entire codebase, zero `@ts-ignore`, zero `@ts-expect-error`.
- The shared types module is genuinely shared -- no type duplication found anywhere.
- CSS is clean, mobile-first, and well-organized with CSS variables.
