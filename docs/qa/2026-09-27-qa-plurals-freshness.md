# QA Report: fix/plurals-freshness

**Date:** 2026-09-27
**Branch:** fix/plurals-freshness
**Worktree:** /Users/kiran/ClaudeCode/basketch/.claude/worktrees/plurals
**HEAD:** 0d16c5c
**Tester:** QA Tester (automated, local production build, live Supabase data)

## Setup notes

- Copied `.env.local` from `basketch/web-next/.env.local` into the worktree's `web-next/`.
- `.next` already existed but had been built **before** `.env.local` was present (BUILD_ID
  timestamp 18:42 vs. env copy at 18:44) — the Supabase URL/anon key were inlined as empty at
  build time (`NEXT_PUBLIC_*` vars are statically replaced by the bundler). `next start` ran
  fine but every page showed "0 deals across 0 Swiss stores" / all category cards "No data".
  Ran `npm run build` with `.env.local` present to get a build with real data baked in, then
  `next start -p 3125`. This is a setup defect in the test procedure, not a code defect on the
  branch — flagging so future runs copy the env file before building.
- Server started clean on :3125 after rebuild. Killed afterward; `.env.local` deleted;
  `git status --short` on the worktree is clean (no output) — confirmed after test completion.

## Results

### 1. Home page stat line — PASS (EN + DE)
- Local EN: `Based on 1,599 deals across 6 Swiss stores.`
- Local DE: `Basierend auf 1.599 Aktionen aus 6 Schweizer Läden.`
- Correct thousands separator per locale (`,` EN / `.` DE), no NaN, no "1 stores"/"1 deals".
- **Observation (not a branch defect):** live prod (https://basketch.vercel.app) shows
  **inconsistent** numbers between its own EN and DE homepages — EN: `1,599 deals across 6 Swiss
  stores`, DE: `1.623 Aktionen aus 7 Schweizer Läden`. That 24-deal / 1-store gap between two
  locale routes of the same live snapshot looks like ISR staleness between the two static
  renders. Local branch build renders EN and DE from the same fetch and agrees (1,599 / 6 both).
  Worth a follow-up ticket for prod cache coherence between locales, separate from this branch.

### 2. Category cards singular ("1 deal(s)") — PASS (by code + adjacent live proof), data caveat
- Homepage `CategoryVerdictCard` only has 3 top-level categories today (fresh, longlife,
  household), with live counts 308 / 494 / 674 deals — **no card naturally reaches count = 1**,
  so this exact scenario cannot be reproduced live on the homepage right now.
- Verified via code: `CategoryVerdictCard.tsx` calls
  `t('avg_off', { pct, count: verdict.dealCount })` using next-intl ICU plural rules (same
  mechanism proven live in check 3 below), and `src/messages/plurals.test.ts` unit-tests
  `category_card.avg_off` at count=1 explicitly: EN → `avg 20% off · 1 deal`, DE →
  `ø 20% Rabatt · 1 Aktion` (singular, correct).
  - Live-rendered proof of the identical ICU mechanism at count=1 exists elsewhere on the site
    (deals-page subline, check 3) — same `t()`/plural-rule pattern, confirmed correctly singular
    against real data, which corroborates the category-card code path.

### 3. Deals page subline — PASS (EN + DE), all three states verified live
- Default (all deals): `Updated Thu, Sep 24 · 1,599 deals` / `Aktualisiert Do., 24. Sept. ·
  1.599 Aktionen` — correct thousands separator.
- Filtered to exactly 1 deal (`?type=household&sub=make-up`, isolates the single live
  `non-food`/`make-up` deal, ALDI, id `b9e6a743-d20f-4431-8afb-b0b8681c9516`):
  - EN: `Updated Thu, Sep 24 · 1 deal` (singular, not "1 deals")
  - DE: `Aktualisiert Do., 24. Sept. · 1 Aktion` (singular, not "1 Aktionen")
- Filtered to 0 deals (`?type=fresh&sub=make-up`, an impossible combination):
  - EN: `Updated Thu, Sep 24 · no deals`
  - DE: `Aktualisiert Do., 24. Sept. · keine Aktionen`
- Note: the URL filter contract is `?type=` (fresh/longlife/household), `?cat=` (mid-level
  category slug), `?sub=` (sub-category, matches `deals.sub_category` verbatim) — confirmed by
  reading `src/lib/filters.ts` and `src/server/data/filter-deals.ts` after an initial mis-test
  with `?category=`/`?subcategory=` returned no filtering effect (unknown params silently
  ignored, by design — "an attacker-crafted URL can't crash the page").

### 4. Shared-list page — PASS (EN + DE), single item and 2-item/2-store cases
- Single current deal id (Migros, `34e68ca9-ad1c-4427-8479-b0383671b9a2`):
  - EN `<h1>`: `Your item is cheapest here:`
  - DE `<h1>`: `Dein Artikel ist hier am günstigsten:`
- Two current deal ids from different stores (Migros + ALDI):
  - EN `<h1>`: `Your 2 items split best across 2 stores:`
  - DE `<h1>`: `Deine 2 Artikel verteilen sich am besten auf 2 Läden:`
- Deal ids sourced read-only from Supabase REST (`is_active=eq.true&valid_to=gte.2026-09-27`,
  anon key), cross-checked `valid_from ≤ 2026-09-27 ≤ valid_to` in Python before use.

### 5. Share card image — PASS (EN + DE)
- `/card?locale=en` → `200`, `content-type: image/png`, 37,215 bytes, decodes as a valid
  1200×630 RGBA PNG.
- `/card?locale=de` → `200`, `content-type: image/png`, 54,117 bytes, decodes as a valid
  1200×630 RGBA PNG.
- Confirmed via `file` (magic-byte PNG signature + dimensions), not just byte count.

### 6. Grep for broken-plural / NaN patterns — PASS
Searched all 13 fetched HTML files (home EN/DE local+live, deals default/1/0-result EN/DE,
list 1-item/2-item EN/DE) for: `NaN`, `1 items`, `1 stores`, `1 deals`, `0 months`, `1 Tagen`,
`1 Aktionen`, `1 Läden`.
- All zero except `1 items` (5 hits) — verified as false positives, all from the Tailwind class
  name `flex-1 items-stretch` / `flex-1 items-center`, not the English word pattern. No real
  occurrences of any forbidden string.

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | Home stat line (EN/DE) | PASS |
| 2 | Category cards singular | PASS (code + adjacent live proof; no live 1-deal card exists today to test directly) |
| 3 | Deals page subline (1599 / 1 / 0) | PASS |
| 4 | Shared-list page (1 item / 2 items, 2 stores) | PASS |
| 5 | Share card image (EN/DE) | PASS |
| 6 | Grep for broken strings | PASS (no genuine hits) |

**Overall: PASS.** No source edits, no DB writes, no push/merge performed. Worktree left clean.

## Follow-up (not blocking this branch)
- Live prod's EN and DE homepage stat lines disagree (1,599/6 vs 1,623/7) — looks like ISR
  staleness between locale-specific static renders on Vercel. Recommend a separate ticket to
  confirm whether both locales revalidate from the same cache tag/timestamp.
