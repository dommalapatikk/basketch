# Code Review: Step 1 -- Shared Types + Supabase Setup

**Reviewer:** Independent Code Reviewer Agent
**Date:** 12 April 2026
**Files reviewed:** `shared/types.ts`, `shared/category-rules.ts`, `shared/types.test.ts`, `shared/category-rules.test.ts`, `shared/tsconfig.json`, `docs/supabase-setup.sql`
**Standards:** CLAUDE.md, coding-standards.md, technical-architecture-v2.md (v2.1)

---

## Verdict: Approved with Minor Changes

Overall this is solid, well-structured work. Types match the architecture, SQL matches the schema definitions, tests are meaningful with good edge case coverage, and RLS policies are correct. A few issues need fixing before proceeding.

---

## Findings

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | **Medium** | `shared/types.ts` | `Product` interface (camelCase, lines 352-366) is missing `quantity` and `unit` fields, but `ProductRow` (lines 371-387) has them. The SQL `products` table has both columns. Any frontend code converting `ProductRow` to `Product` will silently drop these fields. | Add `quantity: number \| null` and `unit: string \| null` to the `Product` interface. |
| 2 | **Low** | `shared/types.ts` | `types.ts` is 526 lines, which exceeds the 300-line hard limit in coding-standards.md Section 1.1. Most of the length comes from the 5 starter pack data definitions (~115 lines of data). | Not blocking for Step 1 -- the file is mostly data, not logic. But before Step 7 (frontend), consider extracting `STARTER_PACKS` to a separate `shared/starter-packs.ts` file to stay within the standard. Flag for later. |
| 3 | **Low** | `shared/types.ts` | `DealRow.discount_percent` is typed as `number` (TS), but the SQL column is `INTEGER NOT NULL`. If the pipeline ever calculates a fractional discount (e.g., 33.33%), the DB will truncate it silently. The TS type should reflect that it will always be a whole number. | No code change needed, but add a comment: `// INTEGER in DB -- always whole number` so future contributors know not to pass decimals. |
| 4 | **Low** | `shared/category-rules.ts` | `matchCategory` only checks against `productName`. The file header comment (line 3) says "Keywords are matched against lowercase product name AND source category" -- but the function only uses `productName`. If `sourceCategory` matching is planned, the comment is misleading. | Either update the comment to say "product name only" or add an optional `sourceCategory` parameter to the function signature (can be implemented later). |
| 5 | **Info** | `docs/supabase-setup.sql` | The SQL file does not seed `product_groups` (~37 rows). The architecture (Section 5.2) says they should be seeded. Step 1 build instructions say "Seed product_groups (~37 rows) and starter_packs (5 packs)." Starter packs are seeded; product groups are not. | This is likely intentional (product groups depend on the full starter pack keyword analysis which happens later). Document that product_groups seeding is deferred to a later step, or add a placeholder comment in the SQL. |
| 6 | **Info** | `shared/types.test.ts` | No test for `dealToRow` when `subCategory` is `undefined` (not `null`). The `Deal` interface has `subCategory?: string \| null` (optional), so `undefined` is a valid value. The `dealToRow` function handles this with `?? null`, but there is no test proving it. | Add a test case: `it('converts undefined subCategory to null', ...)`. |

---

## What's Good

- **Architecture alignment is excellent.** The 11 browse categories map exactly to the 23 DB sub-categories defined in Section 4.10. Every sub-category appears exactly once.
- **SQL matches architecture schemas precisely.** All 7 tables, constraints, indexes, triggers, and RLS policies match Sections 5.1-5.9 exactly.
- **RLS is correctly designed.** Pipeline-write tables (deals, products, product_groups, pipeline_runs) have no INSERT/UPDATE/DELETE policies for anon key -- only service role can write. Favorites have appropriate open policies for MVP (documented known limitation).
- **Category rules cover all 23 sub-categories.** The test in `category-rules.test.ts` explicitly verifies this cross-reference.
- **Tests are meaningful.** Not just happy path -- they test case insensitivity, default fallback, `null` handling, cross-referencing browse categories against rules, and specific category mappings that were architecture decisions (e.g., deli going under ready-meals-frozen, not meat-fish).
- **Starter packs match architecture.** All 5 packs present with correct names. Items have thoughtful `excludeTerms` and `preferTerms` for Swiss German product matching.
- **SQL seed data matches TS constants.** Verified that the JSONB starter pack items in the SQL INSERT statements match the `STARTER_PACKS` constant in `types.ts`.
- **`dealToRow` conversion helper** is clean, handles the `discountPercent` null-to-zero conversion correctly (matching the NOT NULL DB constraint), and the Omit type excludes auto-generated columns.
- **tsconfig.json** correctly extends the base config with appropriate overrides.
- **Standards compliance is clean.** 2-space indent, single quotes, no semicolons, named exports, union types over enums, UPPER_SNAKE_CASE constants.
