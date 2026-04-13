# SRE Verification Report: basketch v1.0

**Date:** 12 April 2026
**Engineer:** SRE Agent
**Scope:** Final pre-launch verification of pipeline, data, security, performance, monitoring, and operational readiness.

---

## Executive Summary

**Verdict: READY WITH CONDITIONS**

The system passes all core reliability checks. TypeScript type-checks clean, all 380 tests pass (193 frontend + 187 pipeline), and the production build succeeds with correct chunk splitting. Two blocking issues from the quality gate report have already been fixed (pipeline cron schedule and middleware security headers). Three conditions remain before sharing with friends:

1. **[CONDITION] Run pipeline 2-3 weeks** to accumulate Coop product history before sharing the link.
2. **[ADVISORY] Remove `@tanstack/react-query`** from `web/package.json` -- it is unused (per ADR-005) but adds unnecessary dependency weight.
3. **[ADVISORY] Consider pinning Node.js to 20 LTS** instead of 24 in CI workflows for production stability.

No blockers found by SRE verification. The system is operationally ready for friends-beta.

---

## 1. Pipeline Reliability

| Check | Status | Evidence |
|-------|--------|----------|
| Cron schedule: Wednesday 21:00+ UTC | PASS | `pipeline.yml` line 5: `cron: '17 21 * * 3'` (Wednesday 21:17 UTC) |
| Graceful degradation (at-least-one-source) | PASS | `process-and-store` job condition: `if: always() && (needs.fetch-migros.result == 'success' \|\| needs.fetch-coop.result == 'success')` |
| Supabase keep-alive | PASS | `keep-alive` job pings via RPC `select_1` with GET fallback on failure |
| Artifact upload with `if: always()` | PASS | Both `Upload Migros deals artifact` and `Upload Coop deals artifact` have `if: always()` |
| Artifact download with `continue-on-error` | PASS | Both download steps use `continue-on-error: true` |
| JSON contract validation for Coop output | PASS | Validates `name`, `store`, `priceCurrent`, `discountPercent` on first 5 entries |
| Manual trigger available | PASS | `workflow_dispatch` enabled |
| Pipeline entry validation | PASS | `isValidDealEntry()` in `run.ts` validates each deal; invalid entries are logged and skipped |
| Expired deal deactivation | PASS | `deactivateExpiredDeals()` called at end of each run |

**Pipeline reliability: PASS**

---

## 2. Data Integrity

| Check | Status | Evidence |
|-------|--------|----------|
| `discount_percent` NOT NULL | PASS | `supabase-setup.sql` line 63: `discount_percent INTEGER NOT NULL`. Pipeline defaults to `0` if source omits it. |
| `updated_at` triggers on all mutable tables | PASS | Triggers created on `deals`, `products`, `favorites` (lines 153-166 of SQL). `product_groups`, `starter_packs`, `pipeline_runs` are write-once/admin-only -- no trigger needed. |
| RLS: public read, service-role write | PASS | All 7 tables have RLS enabled. SELECT policies allow public read. No INSERT/UPDATE/DELETE policies for deals, products, product_groups, pipeline_runs (service role bypasses RLS). Favorites have public read/write (no auth for MVP). |
| Date filter safety net on frontend | PASS | All deal queries in `queries.ts` include `.or('valid_to.is.null,valid_to.gte.${today()}')`. Verified across 6+ query functions. |
| Product name normalisation before upsert | PASS | `normalizeProductName()` called in pipeline `run.ts` before processing. `store.ts` also normalises in `dealToRow()`. |
| Unique constraints prevent duplicates | PASS | `unique_deal (store, product_name, valid_from)` on deals; `unique_product (store, source_name)` on products; `unique_favorite_item (favorite_id, keyword)` on favorite_items. |

**Data integrity: PASS**

---

## 3. Security

| Check | Status | Evidence |
|-------|--------|----------|
| Service role key only in GitHub Actions secrets | PASS | `pipeline.yml` references `${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}`. Grep for `SUPABASE_SERVICE_ROLE_KEY` in `web/` returned zero files. |
| Anon key only in frontend | PASS | Frontend uses `VITE_SUPABASE_ANON_KEY` (read-only via RLS). No service key exposure. |
| Security headers on static responses | PASS | `vercel.json` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` on all routes. |
| Security headers on crawler responses | PASS | `middleware.ts` lines 90-94: Response includes `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. (Quality gate blocking issue #1 has been resolved.) |
| No credentials in `.env.example` | PASS | Contains only placeholder values (`your-service-role-key-here`, `your-anon-key-here`). |
| `.env` in `.gitignore` | PASS | Root `.gitignore` includes `.env` and `.env.local`. |
| XSS protection (HTML escaping) | PASS | `escapeHtml()` function in middleware escapes `&`, `"`, `<`, `>` in all OG tag values. |
| Email lookup via RPC | PASS | `lookupBasketByEmail()` uses RPC function, not direct PostgREST query on email column. |

**Security: PASS**

---

## 4. Performance

| Check | Status | Evidence |
|-------|--------|----------|
| html2canvas lazy-loaded | PASS | Separate chunk in build: `html2canvas-QH1iLAAe.js` (202 KB). Not in main bundle. `VerdictCard.tsx` uses `await import('html2canvas')` on click. |
| Build produces separate chunks | PASS | 17 output files. Page-level code splitting: HomePage (13.5 KB), DealsPage (7.7 KB), ComparisonPage (11.7 KB), OnboardingPage (11.8 KB). |
| Main bundle size reasonable | PASS | `index-BqqMIotE.js` 266 KB (85 KB gzip) -- React + router + Supabase client. `hooks-1rSBl2lk.js` 208 KB (55 KB gzip) -- shared hooks/queries. Total initial JS ~475 KB uncompressed, ~141 KB gzip. Acceptable for MVP. |
| Static asset caching headers | PASS | `vercel.json`: `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`. Vite hashes filenames. |
| Supabase query efficiency | PASS | Composite indexes on `(is_active, category, store)`, `(is_active, sub_category, store)`, `(valid_to)` for active deals. Frontend caches with 1-hour stale time via `useCachedQuery`. |
| `manualChunks` config correct | PASS | `vite.config.ts` explicitly splits `html2canvas` into its own chunk. |

**Performance: PASS**

---

## 5. Monitoring and Alerting

| Check | Status | Evidence |
|-------|--------|----------|
| GitHub Actions email on failure | PASS | Default GitHub behavior: repository owners get email notifications on workflow failures. No custom suppression found. |
| Pipeline run logging to `pipeline_runs` table | PASS | `pipeline_runs` table records `migros_status`, `coop_status`, counts, `duration_ms`, `error_log`. `logPipelineRun()` called in pipeline `run.ts`. |
| Frontend stale data banner | PASS | `StaleBanner` component tested (4 tests passing). `DataFreshness` component tested (3 tests passing). |
| Kill criteria measurement plan | PASS | All 8 PRD kill criteria are measurable per quality gate review: data quality via pipeline logs, retention via Vercel Analytics, PMF via manual survey, pipeline reliability via `pipeline_runs` table, onboarding drop-off via page views, Coop false negatives via user reports. |

**Monitoring: PASS**

---

## 6. Operational Readiness

| Check | Status | Evidence |
|-------|--------|----------|
| Deploy checklist complete and actionable | PASS | 7 sections covering pre-deploy, Supabase, Vercel, GitHub secrets, post-deploy, pipeline first run, and monitoring. Clear checkbox format. |
| Environment variables documented | PASS | `.env.example` documents all 4 variables with comments. `CLAUDE.md` has env var table with secret/non-secret classification. Deploy checklist Section 3 separates Vercel vs GitHub Actions secrets. |
| Supabase SQL setup complete | PASS | Single SQL file creates all 7 tables, 11 indexes, 3 triggers, RLS on all tables with appropriate policies, and seeds 5 starter packs. Runnable in one pass. |
| CI pipeline validates on push/PR | PASS | `ci.yml` runs on push to main and PRs: type-checks both projects, runs all TS tests, runs Python tests, builds frontend. |

**Operational readiness: PASS**

---

## 7. Test Results

### Frontend Tests (web)
```
vitest v3.2.4
15 test files, 193 tests -- ALL PASSED
Duration: 4.20s

Test suites:
  - DataFreshness (3 tests)
  - StaleBanner (4 tests)
  - DealCard (11 tests)
  - CategorySection (9 tests)
  - VerdictBanner (8 tests)
  - VerdictCard (11 tests)
  - ShareButton (5 tests)
  - EmailLookup (9 tests)
  - useCachedQuery (7 tests)
  - matching (77 tests)
  - queries (14 tests)
  - verdict (22 tests)
  - LoadingState (4 tests)
  - CoopStatusMessage (4 tests)
  - ErrorState (5 tests)
```

### Pipeline Tests (pipeline)
```
vitest v3.2.4
8 test files, 187 tests -- ALL PASSED
Duration: 868ms

Test suites:
  - run (31 tests)
  - product-group-assign (18 tests)
  - migros/fetch-integration (11 tests)
  - categorize (32 tests)
  - product-metadata (51 tests)
  - migros/normalize (21 tests)
  - product-resolve (6 tests)
  - store (17 tests)
```

### TypeScript Type Check (web)
```
npx tsc --noEmit -- CLEAN (zero errors)
```

**Total: 380 tests passing, zero type errors.**

---

## 8. Build Results

```
vite v6.4.2 -- production build successful
124 modules transformed
17 output chunks
Built in 1.18s

Key chunks:
  index.html           1.63 KB
  index.css           25.58 KB (5.75 KB gzip)
  index.js           266.44 KB (84.93 KB gzip)  -- React core
  hooks.js           208.23 KB (55.45 KB gzip)  -- shared hooks
  html2canvas.js     202.38 KB (47.71 KB gzip)  -- lazy-loaded, separate chunk
  HomePage.js         13.50 KB (4.69 KB gzip)
  OnboardingPage.js   11.78 KB (4.04 KB gzip)
  ComparisonPage.js   11.67 KB (3.61 KB gzip)
  DealsPage.js         7.67 KB (2.81 KB gzip)
```

**Build: PASS** -- clean build, correct chunk splitting, html2canvas isolated.

---

## 9. Quality Gate Blocking Issues -- Status

| # | Issue | Status | Evidence |
|---|-------|--------|----------|
| 1 | Middleware crawler responses lack security headers | RESOLVED | `middleware.ts` lines 90-94 now include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |
| 2 | Pipeline cron runs Thursday instead of Wednesday | RESOLVED | `pipeline.yml` line 5: `cron: '17 21 * * 3'` = Wednesday 21:17 UTC |
| 3 | Pre-launch pipeline runs not completed | OPEN (expected) | Must run 2-3 weeks before sharing link with friends |

---

## 10. Advisories (Non-Blocking)

| # | Advisory | Severity | Recommendation |
|---|----------|----------|----------------|
| A | `@tanstack/react-query` in `web/package.json` but never imported in source code | Low | Remove from dependencies. ADR-005 chose custom `useCachedQuery` instead. Adds ~30 KB unnecessary download during `npm install`. |
| B | Node.js 24 in CI workflows | Low | Pin to Node.js 20 LTS for production stability. Node 24 is very new (released April 2025). |
| C | `twitter:card` is `"summary"` instead of `"summary_large_image"` | Low | Change in middleware for better social preview with the 1200x630 OG image. |
| D | `hooks.js` chunk is 208 KB (55 KB gzip) | Info | Contains all shared hooks + queries + Supabase client. Acceptable for MVP but could be split further if initial load becomes a concern. |

---

## 11. Operational Runbook

### When the pipeline fails

1. **Check GitHub Actions** -- go to repo > Actions > "Weekly Deal Pipeline". Click the failed run.
2. **Identify which job failed:**
   - `fetch-migros` failed: Migros API may be down or changed. Check artifacts tab for partial data. Coop deals will still be processed (graceful degradation).
   - `fetch-coop` failed: aktionis.ch may be down or changed structure. Check artifacts tab. Migros deals will still be processed.
   - `process-and-store` failed: Check the "Categorize and store" step logs. Common causes: Supabase connection timeout, schema mismatch, validation errors.
   - `keep-alive` failed: Supabase may already be paused. Log into supabase.com and manually unpause the project.
3. **Check `pipeline_runs` table** in Supabase dashboard > Table Editor. Look for the latest row -- `error_log` column will have details.
4. **Re-run manually:** Actions > "Weekly Deal Pipeline" > "Run workflow" button.
5. **If both sources fail repeatedly:** Check if upstream APIs changed. Review the fetch module logs for HTTP status codes.

### When data is stale (no fresh deals)

1. **Check the stale banner** -- the frontend shows a stale data warning automatically via `StaleBanner` component when the latest pipeline run is older than expected.
2. **Check `pipeline_runs` table** -- sort by `run_at` descending. If the latest run has `status: 'failed'`, follow the pipeline failure runbook above.
3. **If pipeline ran but data looks old:** Check `deals` table -- filter by `is_active = true` and verify `valid_from`/`valid_to` dates. The pipeline deactivates expired deals automatically.
4. **Manual re-run** if needed: trigger the pipeline via GitHub Actions.

### When Supabase pauses (free tier auto-pause after 7 days inactivity)

1. **Symptom:** Frontend shows loading spinner indefinitely, then error state. Supabase queries timeout.
2. **Fix:** Log into supabase.com > select the basketch project > click "Restore project".
3. **Prevention:** The `keep-alive` job in `pipeline.yml` pings Supabase every Wednesday. If the pipeline hasn't run for a week (e.g., workflow disabled), Supabase may pause.
4. **After restore:** Run the pipeline manually to ensure fresh data.

### When a Vercel deployment fails

1. **Check Vercel dashboard** > Deployments tab for error logs.
2. **Common causes:** Build failure (run `cd web && npm run build` locally to reproduce), environment variable missing (check Settings > Environment Variables for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
3. **Rollback:** Vercel dashboard > Deployments > click a previous successful deployment > "Promote to Production".

### Weekly health check (manual, 2 minutes)

1. Open the live site -- verify verdict banner shows current week's data.
2. Check deals page -- verify deals from both Migros and Coop are present.
3. Check Supabase dashboard > `pipeline_runs` -- verify latest run succeeded.
4. Check GitHub Actions -- verify no failed runs in the past week.

---

## 12. Final Sign-Off

| Area | Verdict | Notes |
|------|---------|-------|
| Pipeline reliability | PASS | Graceful degradation, keep-alive, validation, logging all verified |
| Data integrity | PASS | NOT NULL constraints, triggers, RLS, date filters, normalisation all verified |
| Security | PASS | Key separation, RLS, security headers, XSS protection, no credential leaks |
| Performance | PASS | Lazy loading, chunk splitting, caching, efficient queries all verified |
| Monitoring | PASS | Failure notifications, pipeline logging, stale data banner, kill criteria measurable |
| Operational readiness | PASS | Deploy checklist, env docs, SQL setup, CI pipeline all complete |
| Tests | PASS | 380/380 tests passing, zero type errors |
| Build | PASS | Clean production build, correct output structure |

**SRE Verdict: READY WITH CONDITIONS**

The system is operationally sound for a friends-beta launch. The two quality gate blocking issues (cron schedule and middleware headers) have been resolved. The remaining condition is operational: run the pipeline 2-3 weeks to build up Coop product history before sharing the link.

Signed: SRE Agent, 12 April 2026
