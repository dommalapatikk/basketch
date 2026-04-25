# basketch — session summary

**Date range:** 2026-04-24 → 2026-04-25 (carried into 2026-04-25 evening session)
**Outcome:** v2.1 corrective patches shipped (yesterday), then today: external auditor's Patch C, Patch D, plus a Vercel/repo cleanup pass — legacy Vite app retired, project renamed, root URL claimed. HR10 responsiveness fix applied twice (first as `startTransition`, then as a proper client-side filter against an in-memory snapshot). User reports HR10 v2 helped but the app still isn't where it needs to be — awaiting Claude Cowork external review.

---

## Live state (end of 2026-04-25)

| | |
|---|---|
| 🌐 Live site | https://basketch.vercel.app (was basketch-redesign.vercel.app — renamed today) |
| 🌐 Old Vite app | RETIRED — archived to `archive/web-vite/`, Vercel project deleted |
| 🌿 Branch | `redesign` (ahead of `main`) |
| 🏗️ Vercel project | `dommalapatikks-projects/basketch` (renamed from basketch-redesign) |
| 📄 Latest commit | `d92300e` — HR10 proper fix: client-side filter against in-memory snapshot |
| 🔐 Vercel Authentication | DISABLED on the project (was Standard Protection — was blocking public access) |
| 🛠️ Vercel project settings | Root Directory = `web-next`, Framework = Next.js (defaults). No build override. |

---

## What shipped today (2026-04-25)

### Patch C — applied + deployed (commit 319bf6a)
- **HR9** (sub-cat selected state) — desktop FilterRail.tsx sub-cat buttons now render `bg-ink text-paper font-semibold` when selected; was `bg-page` invisible
- **HR10 v1** (page freeze) — wrapped `router.replace` in `startTransition` in FilterRail + FilterSheet. Local diagnostic showed massive improvement (1.2 s → 86 ms desktop, 30 s → 374 ms mobile throttled). **In hindsight this was insufficient** — the page tree still re-rendered on every click, just async; real users still felt the lag.
- **HR11** (image padding) — DealCard primary `p-2 → p-1`, compact `p-1 → p-0.5`. User noted PNG halos still present (upstream image issue, not CSS); deferred server-side cropping to a later patch (Designer-flagged option, user picked "ship & iterate")

### Patch D — applied + deployed (commit c704136)
- **HR12** (mobile compact 2-row) — DealCard.tsx Compact variant now uses `grid-cols-[40px_1fr] grid-rows-[auto_auto]` below `md`, with image spanning both rows. md+ keeps the original 4-col 1-row layout via `md:contents` on the price+button wrapper (no DOM duplication). AC16 Playwright tests pass at 320/360/390/414 px.
- **HR13** (Type filter de-dup) — removed Type pill row from FilterSheet (it was duplicated with TypeSegmented at top of page). Sheet title now carries the active Type as a kicker — "Long-life · Filters". Tech Lead estimate of 45 min (not 15) was right — needed state-model surgery (trimmed Type from draft, removed setType, removed TYPES const). AC17 passes.

### HR10 v2 — proper client-side fix (commit d92300e) — the real responsiveness fix
- New `web-next/src/app/[locale]/deals/DealsClient.tsx` — holds the snapshot in memory, owns filter state, computes `filterDeals/storeCounts/subCategoryCounts/buildSections` via `useMemo` on every state change.
- All filter clicks update local state + URL via `window.history.replaceState` — **no `router.replace`, no RSC fetch, zero server round-trips**.
- `page.tsx` is now a thin async wrapper that fetches the cached snapshot inside `Suspense` (Cache Components requirement) and hands off to `DealsClient`.
- DealCard converted to `'use client'` so the list re-renders in place when filters change.
- FilterRail / FilterSheet / TypeSegmented / DealsSearch / BottomBar refactored to take an `onChange(filters)` callback from DealsClient instead of dialing `router.replace` themselves.
- `getWeeklySnapshot`'s `'use cache' + cacheTag('deals')` preserved — server still fetches once per cache window; clients hold what they got.
- **Verified diagnostic numbers (localhost prod build):**
  - Desktop click→URL: 1199 ms → **54 ms**
  - Mobile (4× CPU + Slow 4G) click→URL: 30 000+ ms → **118 ms**
  - RSC requests on click: 1 → **0**
  - Bytes downloaded on click: 180 KB → **0**
- **User feedback after deploy:** "improved but still not good — let me ask Claude Cowork to test." Synthetic numbers don't match real-device experience. Next step is external review.

### Repo + Vercel cleanup (commits b5c32d5, 25600e8, 0bbde7d, c7b5822, fb16115)
- `web/` (legacy Vite app) → `archive/web-vite/` via `git mv` (history preserved)
- Created `archive/web-vite/RETIRED.md` with do-not-modify notice
- `.github/workflows/ci.yml` — dropped legacy `web/` from lint+test jobs, removed "Build Frontend (legacy web)" job
- Updated `CLAUDE.md` folder structure to point at `web-next/` and reference archive
- Deleted old `basketch` Vercel project entirely
- Renamed `basketch-redesign` → `basketch` in Vercel dashboard (only manual web step in this session)
- Moved `vercel.json` (legacy Vite config: `cd web && npm install && npm run build` + framework `vite`) → `archive/web-vite/vercel.json`. This file at repo root was overriding the dashboard's project settings on every deploy — the actual cause of repeated build failures during the rename.
- `vercel alias` manually pointed `basketch.vercel.app` at the new prod deployment (auto-aliasing didn't fire after rename)
- Disabled **Vercel Authentication** in project settings (was set to "Standard Protection" which 401-locked all `*.vercel.app` URLs because no custom domain present)
- Added `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as GitHub repo secrets (`gh secret set`) — were missing, causing CI build job to fail (pre-existing, surfaced today)

---

## Decisions made today (D / E / F sequencing — for next session)

External auditor delivered three more spec docs in `Claude Cowork output/`:
- `basketch-spec-v2-patch-d.md` — mobile compact + Type de-dup ✅ APPLIED today
- `basketch-spec-v2-patch-e.md` — restore 4-level taxonomy (Type → Category → Sub-cat → Stores) in UI
- `basketch-spec-v2-patch-f.md` — backend schema migration to support Patch E
- `basketch-needs-for-cc-verification.md` — architect verification gate

Architect agent (Sonnet) ran the verification checklist. Findings in detail in the chat history; key facts:
- Schema today is **2-level** (`category` column = Type, `sub_category` conflates Category + Sub-cat). 1.4 k rows.
- Aktionis scraper emits NO source-native categories (`sourceCategory: None`). Migros source code is archived. So all categorization is keyword/brand-derived.
- `BROWSE_CATEGORIES` constant in `shared/types.ts:140-155` is already a 3-level tree but unused by web-next — reusable.
- Patch F §F0/§F2/§F5 contain factual errors. Architect's revised plan is ~half the original Patch F scope (additive-only, no rename, alias keyed by current sub_category value, alias table only — no DB label columns).
- DB stores Type as `non-food` but UI sees `household` via boundary alias in `web-next/src/server/data/supabase-provider.ts:39-45`.

Team review (Tech Lead + VP Eng + Designer, Sonnet × 3) ran on D/E/F. Findings summarised in chat. Cadence consensus override of PM's plan: **D solo today → F silent (no UI change, bake 1 wk) → E behind a `NEXT_PUBLIC_TAXONOMY_V2` feature flag → flip flag.** VP Eng calls the feature flag non-negotiable because Patch E breaks the `?cat=` URL semantics.

**PM decisions locked in:**
- **Q1 (legacy `web/`):** archive to `archive/web-vite/` ✅ done today
- **Q2 (DB rename non-food → household):** keep alias forever, no rename
- **Q3 (sequence):** D today → F backend (~1.5 d) → E frontend (~1.5 d). Single deploy at end of E.
- **D/E/F sub-decisions** (out of architect/team's 5):
  1. URL contract `?cat=` flip on Patch E — **A. Accept the break** (pre-PMF, no real bookmarks)
  2. Translation scope for Patch E — **A. DE + EN only** (FR + IT TODO)
  3. Mobile floor for AC16 — **B. 320 px minimum** (Galaxy Fold + WCAG Reflow)
  4. Backfill cron interaction — **A. Pause cron manually** for ~1 hr during backfill
  5. Sentry vs simpler alerting (AC25) — **A. Defer Sentry** to a Patch G; use `pipeline_unknown_tags` table + GH email

---

## ⚠️ Known issues / open

1. **HR10 v2 user feedback:** "improved but still not good." Synthetic diagnostic showed 54 ms desktop / 118 ms mobile click→URL with zero RSC fetches, but the user still feels lag on real device. Possible remaining bottlenecks (untested):
   - Image hydration time on the new card list
   - Initial page payload (1.5 MB HTML — full snapshot embedded for client filtering — may slow initial load on slow networks)
   - Number of DOM nodes (1.4 k deals × ~12 elements each)
   - React commit time when re-rendering a 200-card list
   **Action pending:** external Claude Cowork review.

2. **4 pre-existing Playwright failures** (AC4, AC7, AC8, AC11) — present on `main` before today, not caused by Patch C / D / HR10 v2. Out of scope for current sprint. Backlog for a separate fix-pass.

3. **`web-next/scripts/diag-c2-live.mjs` and `diag-c2-local.mjs`** are throwaway diagnostic tools committed to the repo (debug helpers from the Patch C investigation). Decision: keep them for now in case responsiveness regresses; revisit later.

4. **`web-next/src/lib/site-url.ts`** comment was updated to reference `basketch.vercel.app` but the actual code reads from `VERCEL_PROJECT_PRODUCTION_URL` env var — Vercel auto-injects this so no functional change needed. Comment is just documentation.

---

## Patches NOT yet started (next session)

- **Patch F (revised, ~1.5 days backend/pipeline)** — add `category_slug` column to `deals`, create `taxonomy_category` + `taxonomy_subcategory` + `taxonomy_feed_alias` tables, seed alias from current 28 distinct `subCategory` values per architect's mapping (Patch F §F2 minus the label columns — those live in next-intl JSON instead). Pipeline change goes in a NEW `pipeline/resolve-taxonomy.ts` (separate step in `run.ts`, NOT inside `categorize.ts` per Tech Lead — keeps categorize pure for unit tests). Pause cron during backfill window.
- **Patch E (~1.5 days frontend)** — add Category section to FilterRail + FilterSheet between Type and Sub-cat. New URL contract: `?cat=<category-slug>&sub=<sub-category-slug>`. Wire Lucide icons per Patch E §E3 (note `Sparkle`/`Sparkles` collision — swap one for `Gem` or `Heart` per Designer). Use existing `IconHeading` component. DE + EN dictionary only. Ship behind `NEXT_PUBLIC_TAXONOMY_V2` feature flag (VP Eng non-negotiable).
- **Patch G (Sentry, deferred)** — install Sentry in pipeline + web-next; replace `pipeline_unknown_tags` table approach with proper alerts.

---

## Key reference files (web-next is the live app — `archive/web-vite/` is RETIRED)

- `web-next/src/app/[locale]/deals/page.tsx` — server shell, fetches snapshot in Suspense
- `web-next/src/app/[locale]/deals/DealsClient.tsx` — **NEW** client-side filter owner (HR10 v2 heart)
- `web-next/src/server/data/snapshot.ts` — `'use cache' + cacheTag('deals') + cacheLife('hours')`. ISR + tag-based revalidation hooked to pipeline cron
- `web-next/src/server/data/filter-deals.ts` — pure filter functions (now used client-side too via DealsClient)
- `web-next/src/server/data/supabase-provider.ts:39-45` — boundary alias `non-food → household`
- `web-next/src/lib/filters.ts` — URL contract: `parseFilters` / `serializeFilters` / `DealsFilters` type
- `web-next/src/components/deals/DealCard.tsx` — now `'use client'`
- `web-next/src/components/deals/{FilterRail,FilterSheet,TypeSegmented,BottomBar,DealsSearch}.tsx` — all take `onChange(filters)` callback
- `shared/category-rules.ts` — keyword rules, hierarchical (category + sub_category per rule). `BROWSE_CATEGORIES` 3-level tree at lines 140-155 is reusable for Patch E.
- `shared/types.ts` — `Deal`, `DealCategory`, `WeeklySnapshot`, `BROWSE_CATEGORIES`
- `pipeline/categorize.ts` — `categorizeDeal(deal: UnifiedDeal): Deal`. KEEP PURE — Patch F's alias resolver should be a separate step in `run.ts`, not injected here
- `Claude Cowork output/basketch-spec-v2-patch-e.md` — IA spec for 4-level
- `Claude Cowork output/basketch-spec-v2-patch-f.md` — backend spec (use revised, simpler architect version, NOT verbatim)
- `Claude Cowork output/basketch-needs-for-cc-verification.md` — verification checklist (already answered by architect)

---

## How to resume

When you say "pick up basketch":

1. Read this file
2. Read `web-next/AGENTS.md` (warns: Next.js 16, not the version Claude knew)
3. Check Claude Cowork's external review of HR10 v2 responsiveness — that's the gate before doing anything else perf-related
4. If responsiveness issues are confirmed real and the hot path is found, fix it before starting Patch F
5. Otherwise: start Patch F per the architect's revised plan + the 5 PM decisions above
6. Run `vercel ls` from `/Users/kiran/ClaudeCode/basketch/web-next` to see current deploy state — note local CLI link may be stale because of the rename; if `vercel ls` shows "Project was deleted" but the live URL works, just re-link with `vercel link --yes` or work via dashboard

---

## Folder map

```
basketch/
├── web-next/              # Next.js 16 frontend (LIVE at basketch.vercel.app)
├── archive/
│   └── web-vite/          # RETIRED legacy Vite app — do not modify
├── pipeline/              # TS+Python data pipeline, GH Actions cron Mon/Tue/Thu
├── shared/                # Shared types + category-rules.ts (used by both pipeline and web-next)
├── docs/                  # PRD, architecture, redesign ADR
├── Documents for claude code to refer/   # Internal specs (basketch-redesign-spec-v2.1.md amends v2)
└── Claude Cowork output/  # External auditor specs (v2, Patch C, Patch D, Patch E, Patch F + verification doc)
```
