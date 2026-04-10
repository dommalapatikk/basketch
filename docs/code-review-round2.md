# Code Re-Review: basketch (Round 2)

**Reviewer:** Independent Code Reviewer agent
**Date:** 2026-04-10
**Scope:** Re-review of 6 issues flagged in Round 1, plus design/style fixes

## Summary

- **6 issues re-reviewed** (1 Blocked, 4 Needs Changes, 1 Non-blocking)
- **All 6 issues resolved correctly** — no regressions introduced
- **Tests:** 66 pipeline tests pass, 36 web tests pass (102 total, 0 failures)
- **Type-check:** Both `pipeline/` and `web/` pass `tsc --noEmit` with zero errors
- **New issues found:** 0

---

## Per-Issue Re-Review

### Issue 1: `pipeline/run.ts` — missing JSON validation at Python-TS trust boundary — Approved

**Original severity:** Blocked
**Fix approach:** Extracted validation to a new `pipeline/validate.ts` module with a type-guard function `isValidDealEntry(entry: unknown): entry is UnifiedDeal`. Added 20 targeted tests in `pipeline/run.test.ts`.

**Verification:**

- `validate.ts` (lines 12-30): The type guard correctly checks all required fields (`store`, `productName`, `salePrice`, `validFrom`) with proper type narrowing. Store values are validated against a `VALID_STORES` allowlist. Empty `productName` and non-positive `salePrice` are rejected. Optional fields (`originalPrice`, `discountPercent`, `validTo`, `imageUrl`, `sourceCategory`, `sourceUrl`) are checked for correct type only when present (using `!= null` to handle both `null` and `undefined`).
- `run.ts` (lines 18-38): `JSON.parse` result is typed as `unknown`. Array check happens before iteration. Each entry passes through `isValidDealEntry()` before being pushed to the `valid` array. Skipped count is logged as a warning.
- `run.test.ts`: 20 tests covering valid deals, null/undefined/string rejection, missing required fields, empty productName, zero/negative salePrice, invalid store, wrong types for optional fields, and deals with null or missing optional fields. All pass.

**Assessment:** Clean, well-structured fix. The validation is thorough without being over-engineered. The type guard narrows `unknown` to `UnifiedDeal` at the boundary, which is exactly what was needed. Good separation into its own module for testability.

**Verdict: Approved**

---

### Issue 2: `pipeline/migros/normalize.ts` — `any` type replaced with `unknown` — Approved

**Original severity:** Needs Changes
**Fix approach:** Changed `normalizeMigrosDeal` parameter from `any` to `unknown` (line 45) and added defensive runtime checks before accessing nested properties.

**Verification:**

- Line 45: `raw: unknown` — correct.
- Lines 47-48: Null/object check before casting to `Record<string, unknown>`.
- Lines 50-51: `name` extracted and validated as non-empty string before use.
- Lines 53-55: `offer` checked before accessing nested price objects.
- Lines 57-60: Price values extracted with `as` casts after the parent object has been validated as existing. The `??` fallbacks to `null` are appropriate.
- The overall try/catch on lines 109-111 provides a safety net for any unexpected shape, returning `null` rather than throwing.

**Assessment:** The `unknown` typing is correctly applied. Every property access is guarded by a type check or null-coalescing operator. The intermediate `as Record<string, unknown>` casts are the pragmatic approach for deeply nested unknown objects — acceptable for a pipeline module that already validates shape.

**Verdict: Approved**

---

### Issue 3: `web/src/components/CompareCard.tsx` — falsy-zero rendering bug — Approved

**Original severity:** Needs Changes
**Fix approach:** Changed `discount_percent && (...)` to `discount_percent != null && discount_percent > 0 && (...)` on both lines 34 and 55.

**Verification:**

- Line 34: `{migrosDeal.discount_percent != null && migrosDeal.discount_percent > 0 && (...)}`
- Line 55: `{coopDeal.discount_percent != null && coopDeal.discount_percent > 0 && (...)}`

This correctly handles:
- `discount_percent === 0`: renders nothing (no misleading "-0%")
- `discount_percent === null`: renders nothing (no crash)
- `discount_percent === 34`: renders "-34%" (correct)

**Assessment:** Fix is correct and addresses both the original falsy-zero bug and the explicit null guard. Applied consistently to both Migros and Coop sections.

**Verdict: Approved**

---

### Issue 4: `web/src/components/EmailCapture.tsx` — misleading copy + weak validation — Approved

**Original severity:** Needs Changes
**Fix approach:** Updated copy text and improved email validation regex.

**Verification:**

- Line 15: Email regex changed to `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — this requires at least one character before `@`, at least one after, a dot, and at least one character in the TLD. This is a reasonable client-side validation (not RFC-perfect, but sufficient for a portfolio project — catches obvious typos like `foo@bar` while not being so strict it rejects valid addresses).
- Lines 39-42: Copy now reads "Enter your email to find your list next time. No password, no account — just your email as a lookup key." — clear, honest, explains exactly what the email is used for.
- Line 63: Added fallback text "You can also skip this and bookmark the comparison page." — good, gives users an alternative.

**Assessment:** Both the copy and validation issues are resolved. The copy is transparent about the purpose, and the validation is appropriate for the use case.

**Verdict: Approved**

---

### Issue 5: `web/src/lib/queries.ts` — `findBestDeal` should use `.maybeSingle()` + escape wildcards — Approved

**Original severity:** Needs Changes
**Fix approach:** Added `.maybeSingle()` and wildcard escaping to both `findBestDeal` and `searchDeals`.

**Verification:**

- `searchDeals` (lines 48-49): Wildcards `%` and `_` are escaped before interpolation into the `ilike` pattern. This prevents user input like `100%` from being interpreted as a wildcard.
- `findBestDeal` (lines 233-234): Same wildcard escaping applied.
- `findBestDeal` (line 243): `.maybeSingle()` used instead of indexing `data[0]`. This correctly returns `null` when no rows match (instead of throwing when `.single()` gets zero rows, or requiring manual array indexing).

**Assessment:** Both fixes are correct. The wildcard escaping is consistent between `searchDeals` and `findBestDeal`. The `.maybeSingle()` is the right Supabase method for "zero or one result" queries.

**Verdict: Approved**

---

### Issue 6: `web/src/components/ProductSearch.tsx` — minor UX (non-blocking) — Approved

**Original severity:** Non-blocking (noted for future improvement)
**Status:** This was informational only. No fix was required.

**Verdict: Approved (was already non-blocking)**

---

## Design/Style Fixes (Bonus Review)

The following files were also updated as part of this round. Brief assessment:

- **`web/src/styles.css`**: Clean CSS-only design system. All utility classes (`text-error`, `text-warning`, `ml-8`, `mt-2`, `mb-0`, `pl-20`) are well-named and minimal. Store-specific color classes (`store-migros`, `store-coop`) properly use CSS variables. No inline styles needed.
- **`web/src/components/VerdictBanner.tsx`**: Uses CSS classes (`verdict-banner`, `verdict-title`, `verdict-text`, `verdict-stale`, `store-migros`, `store-coop`) instead of inline styles. Clean component structure.
- **`web/src/components/FavoritesEditor.tsx`**: Uses utility classes (`flex-between`, `mb-16`, `section-title`, `mb-0`, `fav-list`, `fav-item`, etc.). No inline styles.
- **`web/src/pages/HomePage.tsx`**: Uses CSS classes throughout. No inline styles.
- **`web/src/pages/AboutPage.tsx`**: Two remaining inline `style={{ lineHeight: 2 }}` on lines 8 and 18. These are acceptable — `lineHeight` is a one-off spacing tweak for list readability, not worth a utility class.
- **`web/src/components/Layout.tsx`**: Clean layout component using CSS classes. Footer text is plain and appropriate.

**No issues found in design/style fixes.**

---

## New Issues Found

None.

---

## Final Verdict

**Ready to deploy.** All 6 previously-flagged issues have been resolved correctly. No regressions introduced. 102 tests pass, both projects type-check clean. The codebase is in good shape.
