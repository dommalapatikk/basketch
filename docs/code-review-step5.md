# Code Review: Step 5 -- GitHub Actions Workflows

**Reviewer:** Independent Code Reviewer Agent
**Date:** 12 April 2026
**Files reviewed:**
- `.github/workflows/pipeline.yml`
- `.github/workflows/ci.yml`
- `.env.example`

**Standards referenced:**
- `CLAUDE.md`
- `docs/technical-architecture-v2.md` (Sections 3, 9.1, 14)

---

## Verdict: Approved with Minor Changes

The workflows are well-structured, secrets are handled correctly, graceful degradation works, and the CI pipeline covers all test suites. There are a few deviations from the architecture spec and minor improvements worth addressing.

---

## Findings

### Finding 1: Cron schedule differs from architecture spec (Minor)

**File:** `pipeline.yml`, line 5
**Actual:** `cron: '17 17 * * 4'` -- Thursday 17:17 UTC
**Spec (Section 3, Deployment Model):** Two cron entries -- Wednesday 21:17 UTC (main fetch) and Thursday 06:17 UTC (verification fetch)
**Spec (Section 9.1):**
```yaml
- cron: '17 21 * * 3'  # Wednesday 21:17 UTC
- cron: '17 6 * * 4'   # Thursday 06:17 UTC (verification)
```

The implementation uses a single Thursday run instead of the specified Wednesday + Thursday two-pass approach. This is a deliberate simplification (the `:17` off-peak minute is correctly preserved), but it deviates from the architecture.

**Recommendation:** Acceptable as a v1 simplification. Document this decision. If two-pass verification is needed later, add the second cron entry. No blocking change required.

---

### Finding 2: Node.js version 24 vs spec's Node.js 20 (Minor)

**File:** `pipeline.yml` lines 20, 75; `ci.yml` lines 18, 46, 88
**Actual:** `node-version: 24`
**Spec (Section 3):** "GitHub Actions (Node.js 20)"

Node 24 is newer than the architecture specified. This is likely intentional (keeping current), but creates a spec drift.

**Recommendation:** Either update the architecture doc to say Node.js 24, or pin to 20 for consistency. No functional risk -- just documentation alignment.

---

### Finding 3: Python version 3.13 vs spec's 3.12 (Minor)

**File:** `pipeline.yml` line 48; `ci.yml` line 69
**Actual:** `python-version: '3.13'`
**Spec (Section 3):** "Python 3.12"

Same situation as Node.js -- newer than spec.

**Recommendation:** Update the architecture doc to reflect 3.13. No functional risk.

---

### Finding 4: Keep-alive is a separate job, not embedded in process-and-store (Minor)

**File:** `pipeline.yml` lines 128-150
**Spec (Section 9.1):** Keep-alive is shown as a step inside the `process-and-store` job, using `@supabase/supabase-js`.
**Actual:** Keep-alive is a standalone job using `curl` directly.

The implementation is actually better than the spec:
- It runs independently (not blocked by fetch failures)
- Uses `curl` instead of requiring Node.js/Supabase client -- lighter weight
- Has a fallback mechanism (tries `/rest/v1/` if `select_1` RPC fails)
- Uses the service role key via environment variables (correctly from secrets)

**Recommendation:** This is an improvement over the spec. Update the architecture doc to reflect the standalone job approach.

**One concern:** The keep-alive job has no `needs:` dependency, so it runs in parallel with fetches. This is correct behavior -- it should run regardless of pipeline success. However, it also means it runs on `workflow_dispatch`, which is fine.

---

### Finding 5: Coop JSON contract validation -- good addition (Positive)

**File:** `pipeline.yml` lines 101-118

This step validates the Coop JSON output contract before processing. It checks required fields (`name`, `store`, `priceCurrent`, `discountPercent`) on the first 5 deals. This is not in the architecture spec but is a sensible guard.

**Recommendation:** Keep as-is. Consider adding to the architecture doc as a best practice.

---

### Finding 6: Secrets handling is correct (Positive)

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are sourced from `${{ secrets.* }}` at the workflow `env:` level
- Neither secret appears in the CI workflow (frontend build does not receive them)
- `.env.example` correctly documents which vars go where and warns about the service role key
- The `VITE_` prefix convention is correctly documented for frontend-safe variables
- No secrets are logged or echoed in any step

**Recommendation:** No changes needed. This is correct.

---

### Finding 7: CI workflow covers all required test suites (Positive)

**File:** `ci.yml`

The CI workflow has four jobs:
1. **lint-and-typecheck** -- TypeScript type checking for both `pipeline/` and `web/`
2. **test-typescript** -- Vitest for both `pipeline/` and `web/`
3. **test-python** -- pytest for Coop scraper
4. **build-frontend** -- `npm run build` + verify `dist/` exists

This matches the testing commands in `CLAUDE.md` exactly. The `build-frontend` job correctly depends on `lint-and-typecheck` and `test-typescript` passing first.

**Recommendation:** No changes needed.

**Note:** `test-python` runs in parallel with the other jobs (no `needs:` dependency on lint), which is correct since Python and TypeScript are independent.

---

### Finding 8: Missing lint step in CI (Minor)

**File:** `ci.yml`

The job is named "Lint & Type Check" but only runs `npx tsc --noEmit`. There is no ESLint or Ruff step. If linters are configured in the project, they should be added.

**Recommendation:** If ESLint and/or Ruff are configured, add `npx eslint .` and `ruff check .` steps. If they are not yet configured, this is a future enhancement, not a blocker.

---

### Finding 9: Graceful degradation pattern is correct (Positive)

**File:** `pipeline.yml`

- Fetch jobs use `if: always()` on artifact upload with `if-no-files-found: ignore`
- `process-and-store` uses `if: always() && (needs.fetch-migros.result == 'success' || needs.fetch-coop.result == 'success')` -- runs if at least one source succeeds
- Artifact downloads use `continue-on-error: true`
- The `run.ts` receives `--migros-status` and `--coop-status` flags to know which sources succeeded

This is well-designed. If Migros fails but Coop succeeds (or vice versa), the pipeline still processes available data.

**Recommendation:** No changes needed.

---

### Finding 10: No verification fetch (second cron) (Minor)

**File:** `pipeline.yml`
**Spec (Section 3):** Lists a "Verification fetch" as a separate cron entry on Thursday 06:17 UTC.

The implementation has only one pipeline run (Thursday 17:17 UTC), with no second verification pass. This aligns with Finding 1.

**Recommendation:** Same as Finding 1 -- acceptable simplification for v1. If data freshness verification becomes important, add the second cron entry later.

---

## Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | Cron schedule differs from spec | Minor | Document the simplification |
| 2 | Node.js 24 vs spec's 20 | Minor | Update architecture doc |
| 3 | Python 3.13 vs spec's 3.12 | Minor | Update architecture doc |
| 4 | Keep-alive as standalone job | Minor (improvement) | Update architecture doc |
| 5 | Coop JSON contract validation | Positive | Keep |
| 6 | Secrets handling | Positive | No change |
| 7 | CI covers all suites | Positive | No change |
| 8 | Missing lint/ruff steps | Minor | Add if configured |
| 9 | Graceful degradation | Positive | No change |
| 10 | No verification fetch | Minor | Document simplification |

**Blockers:** 0
**Minor changes:** 5 (mostly documentation alignment)
**Positive findings:** 4

The workflows are production-ready. The minor findings are all documentation alignment or future enhancements -- nothing that would cause a runtime issue.
