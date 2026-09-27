# ADR: the deals cache is keyed by the Zurich date

**Date:** 2026-09-27 · **Status:** Accepted (PM P-17) · **Supersedes:** the caching part of
`2026-09-15-in-effect-vs-upcoming.md` ("Amended in code review of 9525601" and its rejected
"compute `today` outside the cache" alternative). That ADR's in-effect / upcoming rules are
unchanged.

## Context

On 2026-09-27 every active Volg deal had `valid_to = 2026-09-26`, yet the German homepage still
counted them ("1.623 Aktionen aus 7 Schweizer Läden") while `/en` showed 1,599 from 6. Root cause
(`docs/rca/2026-09-27-tech-lead-stale-expired-deals.md`, `…-architect-stale-expired-deals.md`):

1. `todayInZurich()` ran inside the cached `getWeeklySnapshot`, whose cache key was `{locale}`
   only — a Saturday entry was still a valid answer on Sunday.
2. The homepage read the snapshot at its top level, so the deal data was baked into the
   prerendered page that Vercel stores per path. `expire: 3600` bounded the data cache, not that
   stored page, which only refreshes when someone requests it.
3. `/api/revalidate` used `revalidateTag(tag, 'hours')`, so the first visitor after a pipeline
   run still got the previous run's data.

Price comparisons must be objectively correct and expire aggressively (CLAUDE.md, Art. 3(1)(e) UWG).

## Decision

- **D1** — `getWeeklySnapshot` is uncached: `await connection()`, then `todayInZurich()`, then the
  cached `getDealRowsForDay({ today })` tagged `deals` and `deals:${today}`. A new Zurich day is a
  new cache key, so no entry can be served after midnight. The provider takes `today` as input.
- **D2** — the homepage renders its deal content inside `<Suspense>` (the `/deals` pattern), so no
  stored page contains deal data.
- **D3** — `/api/revalidate` calls `revalidateTag(tag, { expire: 0 })`: the next request after a
  pipeline run gets fresh data.
- **D5** — a browser guard (`MidnightGuard`) for a tab left open across midnight, and `validTo` on
  saved list items so ended items are marked.
- **D6** — architecture tests (`server/data/deals-freshness-architecture.test.ts`): no
  `'use cache'` function reads the clock; every `deals` read filters on `valid_to`; web code never
  reads the materialised views that freeze `CURRENT_DATE`.

**No scheduled jobs.** Expiry is evaluated at read time; the first request after midnight is the
trigger (PM 2026-09-27: event-driven over polling). `is_active` means "withdrawn or replaced",
written by the pipeline sweep; "expired" is never stored.

## Consequences

- One small uncached function call per homepage view plus a streamed data section — within the
  free tier at 10–50 users.
- Rule: **never read the clock inside `'use cache'`** — pass the date in as an argument.
- Open: the `/card` link-preview image in `[locale]/layout.tsx` metadata still has no date
  parameter (link-preview crawlers may cache it); the share button's `/card` link carries `d=`.
