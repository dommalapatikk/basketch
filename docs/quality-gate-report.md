# Quality Gate Report: basketch v1.0

**Date:** 12 April 2026
**Orchestrator:** Quality Gate Orchestrator
**Reviewers:** VP Product, VP Design, VP Engineering
**Artifacts reviewed:** PRD v2.0, Use Cases v2.0, Architecture v2.1, Design Spec v2.1, Coding Standards v2.0, Deploy Checklist, 12 source files, vercel.json, pipeline.yml

---

## Executive Summary

**Verdict: GO WITH CONDITIONS**

The product is well-built and ready for a friends-beta release. All three VPs agree that the core value proposition is delivered, the code is solid, and the design matches the spec. Three conditions must be met before sharing the link with friends:

1. **[BLOCKING] Security headers are missing from crawler responses** -- the middleware returns raw HTML without security headers for crawlers. Must fix before public access.
2. **[BLOCKING] Pipeline cron schedule is Thursday, not Wednesday** -- the PRD specifies pipeline runs Wednesday 21:00 UTC so deals are ready before Thursday. Current cron runs Thursday 17:17 UTC, meaning users see stale data on Thursday morning (peak shopping planning day).
3. **[CONDITION] Pre-launch pipeline runs** -- must run 2-3 weeks of pipeline before sharing to accumulate Coop product history (per PRD requirement).

No VP disagreements requiring SPADE resolution.

---

## VP Product Review

### Value Proposition: "Your weekly promotions, compared"

**PASS.** The home page delivers the promise clearly:
- H1: "Which store has better promotions this week?" -- question headline, good.
- Subtitle: "Your weekly Migros vs Coop deals, compared in 5 seconds." -- matches tagline.
- No use of "cheaper" or "price comparison" language in user-facing code (verified by grep -- "cheaper" appears only in test descriptions, never in UI copy).
- The word "promotions" is used consistently throughout.

### Aha Moment (Verdict + Deals, Zero Setup)

**PASS.** The home page sequence is correct:
1. Hero section renders immediately (no data dependency) -- good.
2. Verdict banner with transparency line ("Based on X Migros deals (avg Y% off) vs...") -- builds trust.
3. Three category snapshot cards (Fresh, Long-life, Non-food) -- gives depth.
4. Wordle card below category cards (design spec v2.1 moved it below, and code matches).
5. Browse CTA -> /deals.
6. Favorites promo section is secondary, below the fold -- correct sequencing.

### Retention Moment (Favorites Comparison)

**PASS with note.** The comparison page is properly built:
- Split shopping list (Migros items / Coop items) is implemented via `SplitList` component.
- Two-tier Coop status messages are correctly implemented in `CoopStatusMessage.tsx`:
  - Tier 1 (known): "Not on promotion at Coop this week"
  - Tier 2 (unknown): "We haven't found this at Coop yet -- check back next week." with info icon
- `coopProductKnown` flag is populated by `checkCoopProductExists()` in queries.ts -- checks product_group first, then keyword fallback. Correct per architecture.
- Coop transparency label ("Coop: showing promotions found. Not all Coop products are tracked yet.") renders conditionally when `hasUnknownCoopProducts` is true. Correct.
- Returning user banner ("Welcome back") shows when localStorage has `favoriteId`. Correct.
- Email lookup is on the home page. Correct.

**Note:** The comparison page stores `favoriteId` in localStorage (observed in `ComparisonPage.tsx` line 80 where it removes it on error), but I did not find where it is *set*. This should be verified in the onboarding flow -- if the localStorage write is missing, returning users will never see the "Welcome back" banner.

### Two-Tier Coop Status Messages

**PASS.** Implementation in `CoopStatusMessage.tsx` exactly matches the design spec v2.1 Section 4.3:
- Tier 1: plain italic text, `text-muted` class.
- Tier 2: info circle-i SVG icon prefix, full opacity `#666` text (5.7:1 contrast), `role="note"` for screen readers.
- No opacity differentiation (the original 0.7 opacity that failed WCAG was removed per design challenge fix).

### Kill Criteria Measurability

**PASS.** All 8 kill criteria in the PRD are measurable:
- Data quality (categorization accuracy) -- can be verified via pipeline logs.
- Friends beta retention -- measurable via Vercel Analytics.
- PMF survey -- manual survey at week 8.
- Verdict trust -- qualitative feedback.
- Pipeline reliability -- GitHub Actions logs + `pipeline_runs` table.
- Onboarding drop-off -- Vercel Analytics page views /onboarding vs /compare.
- Coop false negatives -- user reports.
- Favorites ignored -- /deals vs /compare traffic ratio.

### Onboarding Flow (5 Starter Packs, Custom Add, Email)

**PASS.** All 5 starter packs are defined in `shared/types.ts`:
1. Swiss Basics (17 items)
2. Indian Kitchen (15 items)
3. Mediterranean (15 items)
4. Studentenkuche (14 items)
5. Familientisch (16 items)

Each pack has `keyword`, `label`, `category`, `excludeTerms`, and `preferTerms` -- well-specified for matching accuracy. The "Start from scratch" option is documented in the design spec wireframe. Email save is implemented in `queries.ts` via `saveBasketEmail()`.

### Wordle Card Growth Mechanism

**PASS.** `VerdictCard.tsx` implements the shareable verdict card:
- Dark navy background (#1a1a2e), white text -- high contrast for WhatsApp compression.
- Three category rows with color-coded indicator bars (Migros #e65100, Coop #007a3d).
- "basketch.ch" branding and tagline in footer.
- "Copy verdict card" button lazy-loads html2canvas on click (verified -- `await import('html2canvas')`).
- Clipboard write with PNG download fallback. Correct.
- `role="img"` with descriptive `aria-label`. Correct.

### VP Product Finding: Pipeline Schedule Mismatch

**FLAG (BLOCKING).** The PRD states:
> Pipeline trigger: Wednesday 21:00 UTC (22:00 CET) -- after both stores publish

But `pipeline.yml` has:
```yaml
cron: '17 17 * * 4'  # Thursday 17:17 UTC
```

This means deals are not ready until Thursday afternoon. Peak shopping planning happens Thursday morning/evening. Users opening basketch Thursday morning will see last week's data with a stale warning. **Must change cron to Wednesday evening.**

---

## VP Design Review

### Built UI vs Design Spec

**PASS with minor findings.**

**Home page layout (375px):** Matches the design spec Section 1.1 wireframe:
- Hero: H1 28px extrabold, subtitle 16px muted. Correct.
- Verdict banner: "WEEKLY VERDICT" label (12px uppercase), store names colored, transparency line. Correct.
- Category cards rendered via `CategorySection` component. Correct.
- Wordle card below category cards (v2.1 position). Correct.
- Browse CTA full-width. Correct.
- Returning user banner with accent left border. Correct.
- Favorites promo with H2. Correct.
- Email lookup with H3. Correct.
- Data freshness at bottom. Correct.

**Deals page:** Matches design spec Section 2:
- Category pills with horizontal scroll, fade gradient, roving tabindex. Correct.
- Desktop: `md:grid md:grid-cols-2 md:gap-6` (side-by-side at 768px+). Correct.
- Store sections with `role="region"` and `aria-label`. Correct.
- Empty state for both stores: "No deals in [category] this week. Try another category." Correct.
- Show more button with remaining count. Correct.

**Comparison page:** Matches design spec Section 4:
- Header with item count and edit button. Correct.
- Summary cards (Migros/Coop totals). Present.
- Split list component. Present.
- Coop transparency label. Present.
- Save section with "Your personal link" + Copy/Share buttons. Correct.

### WCAG 2.1 AA Compliance

**PASS with one finding.**

- **Contrast:** Store colors in code use `text-migros-text` and `text-coop-text` classes (design spec specifies #c54400 and #006030 for text, which pass AA). The design system tokens are correctly defined in the design spec. Verified that `VerdictBanner.tsx` and `DealsPage.tsx` use `text-migros-text` / `text-coop-text`, not the raw badge colors.
- **Touch targets:** `min-h-[44px]` is applied across 7 files (11 occurrences). Category pills, buttons, and interactive links all have 44px minimum height. Correct.
- **Focus-visible:** Used in 5 files (7 occurrences) with `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`. Correct pattern.
- **Skip navigation:** Present in `Layout.tsx` and `styles.css`. Correct per design spec v2.1 fix #8.
- **Screen reader:** `role="status"` + `aria-live="polite"` on verdict banner. `role="tablist"` + `role="tab"` + `aria-selected` on category pills. `role="region"` on store sections. `role="img"` + `aria-label` on Wordle card. `role="note"` on Coop Tier 2 message. All correct.
- **No color-only information:** Store names always appear as text labels alongside colors. Verified in VerdictBanner (StoreLabel component renders text), DealsPage (storeName variable renders "Migros"/"Coop" text), and DealCard (store badge has text).

**Finding:** The VerdictCard uses `#e65100` and `#007a3d` for the category indicator bars (line 123-124 in VerdictCard.tsx), which are the badge colors. On the dark card background (#1a1a2e), both colors have sufficient contrast (they are background fills on bars, not text), and the winner name is rendered as white text. Acceptable -- the bars are decorative alongside text labels.

### Store Colors Correct and Consistent

**PASS.** The design spec v2.1 Section 0.1 defines:
- Migros: #e65100 (bg), #c54400 (text), #FFF3E6 (light bg)
- Coop: #007a3d (bg), #006030 (text), #e6f4ec (light bg)

Code uses Tailwind classes `text-migros-text`, `text-coop-text`, `bg-migros-light`, `bg-coop-light` which are configured to these values. The VerdictCard uses raw hex for the indicator bars, which matches the badge colors. CLAUDE.md correctly documents: "Migros #e65100 (bg) / #c54400 (text). Coop #007a3d (bg) / #006030 (text)."

### Mobile-First Layout (375px)

**PASS.** The design system specifies:
- Mobile default: single column, 16px padding.
- Content max: 640px, auto-centered.
- Desktop (deals only): 768px+ for side-by-side columns.

The DealsPage uses `md:grid md:grid-cols-2` which activates at 768px. All other pages are single-column by default. No horizontal scroll issues detected in the layout code.

### Copy Accuracy

**PASS.** No instances of "cheaper" in UI copy (only in test files). Language consistently uses "promotions", "deals", "on sale", "on promotion". The value proposition framing is correct throughout.

### Wordle Card Visual Quality

**PASS.** The VerdictCard implementation:
- Fixed width: 360px (`w-[360px] max-w-full`). Portrait format.
- Dark background: #1a1a2e. Own background, works on light and dark pages.
- Font sizes: 21px header (text-xl), 15px stats (text-[15px]), 13px tagline (text-[13px]). Design spec v2.1 bumped stats to 15px and tagline to 13px for WhatsApp compression survival. Matches.
- Category bars: `w-1.5` (6px). Design spec v2.1 bumped from 4px to 6px. Matches.
- Branding: "basketch.ch" + "Your weekly promotions, compared." footer. Correct.
- html2canvas renders at 2x scale for crisp output. Good.

---

## VP Engineering Review

### Code Quality

**PASS.**

- **TypeScript strict mode:** Documented in `tsconfig.base.json` spec (coding standards Section 1.1). `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` all enabled.
- **No barrel files:** Grep for `index.ts` in web/src returned zero results. All imports are direct.
- **No default exports:** Grep for `export default` in web/src returned zero results. All named exports. Correct.
- **One component per file:** Verified -- each component file contains a single exported component.
- **Three states (loading, error, success):** HomePage handles all three explicitly. DealsPage handles all three. ComparisonPage handles all three. Correct pattern.
- **`useCachedQuery` for data fetching:** Used consistently. No React Query imports found.
- **Queries centralized in queries.ts:** All Supabase `.from()` calls are in `web/src/lib/queries.ts`. Components never call Supabase directly. Correct.

### Security

**PASS with one finding.**

- **No service role key in frontend:** Grep for `SUPABASE_SERVICE_ROLE_KEY` in `web/` returned zero results. Correct.
- **RLS:** Documented in deploy checklist (Section 2: "enable RLS and create all row-level policies"). The frontend uses `VITE_SUPABASE_ANON_KEY` (read-only via RLS). Correct.
- **Security headers in vercel.json:** All required headers present:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - Static assets: `Cache-Control: public, max-age=31536000, immutable`
- **Email lookup via RPC:** `lookupBasketByEmail()` uses an RPC function (`lookup_favorite_by_email`) to avoid exposing the email column via PostgREST. Good security pattern.

**Finding (BLOCKING):** The middleware returns a raw HTML response for crawlers (line 69-91 of `web/middleware.ts`) but does NOT include the security headers from vercel.json. Vercel headers in vercel.json apply to static file serving and rewrites, but the middleware `new Response()` bypasses them. Crawler responses should include at minimum `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` in the response headers. Fix: add these headers to the Response constructor in the middleware.

### Performance

**PASS.**

- **html2canvas lazy-loaded:** Confirmed in `VerdictCard.tsx` line 48: `const { default: html2canvas } = await import('html2canvas')`. Only loaded on button click. Not in the main bundle.
- **Date filter safety net:** All deal queries in `queries.ts` include `.or('valid_to.is.null,valid_to.gte.${today()}')`. Verified in `fetchActiveDeals`, `fetchDealsByCategory`, `searchDeals`, `fetchFavoriteComparisons`, `fetchActiveDealsForProducts`, and `findBestDeal`. Comprehensive coverage.
- **Caching:** `useCachedQuery` hook with 1-hour stale time (60 minutes passed as third argument in HomePage and DealsPage). Pipeline run data cached separately.
- **Static assets caching:** vercel.json sets immutable cache headers on `/assets/*`. Correct.

### Data Integrity

**PASS.**

- **`discount_percent` NOT NULL:** `DealRow` interface (types.ts line 247) documents `discount_percent: number` with comment "NOT NULL -- pipeline calculates from prices if source omits." The `dealToRow` function defaults to `0` if null: `discount_percent: deal.discountPercent ?? 0`.
- **Product name normalization:** Pipeline `run.ts` line 77 calls `normalizeProductName()` on all deals before processing. Correct.
- **Updated_at triggers:** Documented in deploy checklist Section 2. The trigger must be created via SQL during Supabase setup.
- **JSON validation:** Pipeline `run.ts` validates each deal entry with `isValidDealEntry()` and logs skipped entries. The GitHub Actions workflow also validates the Coop JSON contract (checks required fields on first 5 entries).

### Pipeline Reliability

**PASS.**

- **Graceful degradation:** Pipeline continues if one source fails (line 65-68 of `run.ts`: only exits if BOTH sources return zero). The `process-and-store` job runs if EITHER source succeeds (`if: always() && (needs.fetch-migros.result == 'success' || needs.fetch-coop.result == 'success')`). Correct.
- **Keep-alive:** Supabase keep-alive job pings the database weekly to prevent auto-pause on free tier. Has a fallback GET if the RPC fails. Correct.
- **JSON validation at trust boundary:** Coop JSON contract validated in the workflow before processing. Deal entries validated with `isValidDealEntry()` in `run.ts`. Correct.
- **Pipeline logging:** `logPipelineRun()` records counts, statuses, duration, and errors. The `pipeline_runs` table provides observability. Correct.
- **Deactivation of expired deals:** `deactivateExpiredDeals()` called at the end of each run. Correct.

### Deployment Readiness

**PASS with one finding.**

- **vercel.json valid:** Build command, output directory, framework, headers, rewrites all correctly configured. The SPA rewrite (`"source": "/(.*)", "destination": "/index.html"`) is correct for Vite.
- **Middleware works:** `web/middleware.ts` correctly detects crawlers, serves OG HTML, and passes regular requests through. Static asset requests are excluded. Matcher pattern excludes `_next` and `favicon.ico`. Correct.
- **OG tags per route:** Home, deals, onboarding, about, and compare (with default fallback) all have OG tags defined. Correct.

**Finding:** The `twitter:card` value in middleware is `"summary"` (line 80), but the design spec says `"summary_large_image"`. For a better WhatsApp/social preview with the 1200x630 image, this should be `"summary_large_image"`. Non-blocking but should be fixed.

---

## Blocking Issues

| # | Issue | Owner | Severity | Resolution |
|---|-------|-------|----------|------------|
| 1 | Middleware crawler responses lack security headers (X-Frame-Options, X-Content-Type-Options) | VP Engineering | Blocking | Add headers to the `new Response()` in middleware.ts |
| 2 | Pipeline cron runs Thursday 17:17 UTC instead of Wednesday 21:00 UTC | VP Product / VP Engineering | Blocking | Change cron to `'0 21 * * 3'` (Wednesday 21:00 UTC) |
| 3 | Pre-launch pipeline runs not yet completed | VP Product | Blocking (pre-share) | Run pipeline 2-3 weeks before sharing link with friends |

---

## Release Conditions

If the three blocking issues above are resolved, the product is cleared for friends-beta:

1. **Fix middleware security headers** -- add `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` to the crawler response in `web/middleware.ts`.
2. **Fix pipeline cron** -- change `pipeline.yml` cron from `'17 17 * * 4'` to `'0 21 * * 3'`. Add a verification fetch Thursday 06:17 UTC as documented in the architecture.
3. **Run pipeline 2-3 weeks** -- accumulate Coop product history before sharing.
4. **Verify localStorage write** -- confirm that the onboarding flow writes `basketch_favoriteId` to localStorage so the "Welcome back" banner works for returning users.
5. **Change twitter:card to summary_large_image** -- non-blocking but improves social preview quality.

---

## Non-Blocking Observations

| # | Observation | Owner | Priority |
|---|-------------|-------|----------|
| A | `twitter:card` is "summary" instead of "summary_large_image" | VP Design | Low |
| B | Legacy deprecated query aliases (8 functions) add ~100 lines of dead code to queries.ts | VP Engineering | Low (clean up post-launch) |
| C | Pipeline uses Node.js 24 (node-version: 24 in pipeline.yml) -- this is very new. Consider pinning to Node.js 20 LTS for stability. | VP Engineering | Low |
| D | Wordle card indicator bars use `w-1.5` which is 6px in Tailwind -- matches the design spec v2.1 bump from 4px. Confirmed correct. | VP Design | Info only |
| E | The `findBestDealForItem` function in queries.ts uses `.find()` (returns first match) rather than sorting by discount_percent. Since deals are pre-sorted by discount descending, this is correct -- but fragile if sort order changes upstream. | VP Engineering | Low |

---

## Sign-Off Table

| Reviewer | Verdict | Date | Notes |
|----------|---------|------|-------|
| VP Product | **GO with conditions** | 12 Apr 2026 | Fix cron schedule. Complete pre-launch pipeline runs. Verify localStorage write. |
| VP Design | **GO with conditions** | 12 Apr 2026 | Fix twitter:card value. All other design spec items match. |
| VP Engineering | **GO with conditions** | 12 Apr 2026 | Fix middleware security headers. Consider pinning Node.js version. |

**Overall:** GO WITH CONDITIONS. Resolve the 3 blocking issues, then ship to friends-beta.
