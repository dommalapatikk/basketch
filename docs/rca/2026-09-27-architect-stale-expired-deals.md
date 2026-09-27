# RCA (Architect view) — expired Volg deals still counted on the German homepage

- **Date:** 2026-09-27
- **Author:** Solution Architect (independent; parallel to `2026-09-27-tech-lead-stale-expired-deals.md`, which this file does not edit)
- **Status:** Investigation + proposed target design. No code changed, nothing pushed.
- **Supersedes (proposed, needs user approval):** the "Rejected for now" alternative in `docs/decisions/2026-09-15-in-effect-vs-upcoming.md` §"compute `today` outside the cache entirely".

## 1. Symptom and evidence

| Observation | Source |
|---|---|
| Every active Volg deal has `valid_to = 2026-09-26`. From 2026-09-27 00:00 Zurich (2026-09-26 22:00 UTC) none of them may appear. | Caller's verification, 2026-09-27 |
| `/` (DE) showed "1.623 … 7 Schweizer Läden" while `/en` showed "1,599 … 6". The 24-deal / 1-store gap is Volg. | Caller's verification, 2026-09-27 |
| Re-checked 2026-09-27 18:41 UTC: both `/` and `/en` now show 1,599 / 6. Headers: `x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, `age: 16`, `cache-control: public, max-age=0, must-revalidate`, `x-matched-path: /de`. The DE entry had been regenerated seconds before — most likely by the verifying request itself (stale-while-revalidate: the first visitor gets the old page, the *next* one gets the new one). | `curl -D -` against production, this investigation |
| `/en/deals`: static shell `age: 128039` s (~35 h), yet the embedded `today` is `2026-09-27`. The shell holds no deal data (skeleton only); the deals are rendered in a per-request dynamic hole. | same |
| `/en/list`: shell `age: 36883` s (~10 h) — same PPR shape as `/deals`, harmless for the same reason. | same |

Conclusion: the defect is confined to pages whose **deal data is baked into cached HTML** — today that is the homepage (both locales). `/deals` and `/list` are exposed only to the smaller in-memory data-cache window (§3, layer L1).

## 2. The freshness path, end to end

```
GitHub Actions cron (pipeline.yml)           Mon/Tue/Thu 05:00 UTC only — nothing on Fri/Sat/Sun
  └─ run-pipeline.ts  → Supabase `deals` (is_active, valid_from, valid_to)
        │   store.ts sets is_active=false for valid_to < today — ONLY when a run happens
        └─ deps.revalidate() → pingRevalidateWebhook → POST /api/revalidate {tag:'deals'}
              └─ revalidateTag('deals', 'hours')          ← stale-while-revalidate, up to 1 day
                                                               (not an expiry)
Request ─► Vercel CDN (regional, per path)  ─► ISR cache (durable, per path: /de, /en separately)
              │ HIT: HTML served as-is, no code runs          │ STALE: old HTML served, regen in background
              ▼
        Function render of the route
              └─ getWeeklySnapshot({locale})  'use cache', cacheTag('deals'),
                   cacheLife({revalidate:900, expire:3600})   ← in-memory, per instance (L1)
                     └─ SupabaseDealsProvider.getWeeklySnapshot
                          today = todayInZurich()   ← "today" decided HERE, inside the cache
                          .gte('valid_to', today)   ← the ONLY web-side expiry filter
                          totalDeals / stores[] / verdicts computed from that
Browser: DealsClient uses snapshot.today (server's value); ListDrawer calls todayInZurich() itself
```

### 2.1 Every place "today" is decided

| # | Where | Evaluated when | Can be older than the Zurich day? |
|---|---|---|---|
| T1 | `server/data/supabase-provider.ts:184` `todayInZurich()` inside `getWeeklySnapshot` | When the `'use cache'` entry is (re)built | **Yes** — lives as long as the cache entry and any HTML built from it |
| T2 | `snapshot.today` → `DealsClient` (`buildSections`, `onlyStoreSubCategories`, `startsAfterToday`) | Copied from T1 | Yes, inherits T1 |
| T3 | `components/list/ListDrawer.tsx:194` `todayInZurich()` in the browser | Every render, client clock | No (client clock), but list items carry no `validTo`, so it cannot hide expired items |
| T4 | `pipeline/store.ts:193` deactivation `valid_to < today` | Only on Mon/Tue/Thu runs | Yes — Volg rows ending Saturday stay `is_active = true` until Monday 05:00 UTC |
| T5 | `app/sitemap.ts:11` `new Date()` | Build / regen | Irrelevant to prices |

There is **no single owner of "today"**. The web's correctness rests entirely on T1, and T1 is frozen inside a cache.

### 2.2 Every cache that can outlive a Zurich day boundary

| Layer | What it holds | Key | Lifetime / invalidation | Outlives midnight? |
|---|---|---|---|---|
| **L1** `'use cache'` on `getWeeklySnapshot` | Snapshot incl. `today`, `totalDeals`, `stores`, deals | fn args `{locale}` — **no date** | In-memory per instance; `revalidate 900` (then SWR), `expire 3600`; tag `deals` | **Yes, up to ~1 h.** With Fluid compute an instance serving a 23:50 entry returns it until 00:05, then once more as STALE while refreshing; hard cap 01:00. |
| **L2** ISR cache (Vercel, durable) | Full homepage HTML + RSC payload for `/de` and `/en` **separately** | path | Route revalidate = min cacheLife revalidate (900 s); SWR; tag-invalidated by `revalidateTag` | **Yes, unbounded in practice.** A holeless prerender is served by SWR: after 15 min the *next* request gets the old HTML (STALE) and triggers regen. On a quiet night nobody triggers it, so the first visitor after midnight gets pre-midnight HTML. Whether Vercel enforces the 3600 s `expire` on the ISR layer is **unverified**; the observed defect (hours after 22:00 UTC) indicates that at minimum it did not bound it to one hour. |
| **L3** Vercel CDN (regional) | Same HTML | path + `Vary` | Replica of L2; purged ~300 ms after tag invalidation | Same as L2 |
| **L4** Next client router cache | RSC payload in the tab | route | `x-nextjs-stale-time: 300` (5 min) | Only for an open tab across midnight — minor |
| **L5** Pipeline `revalidateTag('deals','hours')` | — | — | Marks stale with `hours` profile = serve stale up to 1 day | Makes every pipeline refresh itself SWR: first visitor per locale after a run still sees the previous run's data |

**Why DE and EN diverged:** L2/L3 entries are per path. `/en` happened to be requested (and so regenerated) after midnight; `/de` had not been, so its entry still held a T1 computed on 2026-09-26. Locale is not the cause — **traffic is**. Any low-traffic path is the one that goes wrong.

## 3. Root cause (architecture)

1. **Time-dependent output cached under a time-independent key.** The snapshot is a function of (DB rows, *Zurich date*), but it is keyed only by `{locale}` and invalidated only by *data events* (pipeline runs). Midnight is not an event anything listens to: the DB rows do not change at midnight (T4 only runs Mon/Tue/Thu), so no revalidation fires.
2. **The 2026-09-15 decision bounded the wrong layer.** It tightened L1 to `expire: 3600` and reasoned "at most an hour of boundary staleness". That is true of L1 only. The homepage has no dynamic hole, so L1's output is **baked into L2/L3 HTML**, whose lifetime is governed by ISR stale-while-revalidate, not by L1's `expire`. The residual window was never one hour for `/` and `/en`.
3. **Stale-while-revalidate is the wrong primitive for legal expiry.** SWR guarantees *eventual* freshness and deliberately serves the old copy to one visitor. At 10–50 users, "one visitor" is often *the* visitor. CLAUDE.md's rule (price comparisons objectively correct, expire aggressively) needs a guarantee, not eventual consistency. The same flaw exists on the invalidation side (L5: `revalidateTag(tag,'hours')`).
4. **No defence in depth.** One filter (`.gte('valid_to', today)`) at one moment. Nothing downstream re-checks `validTo` against a fresh date: not the page, not the client, not the DB.

## 4. Invariant the target design must hold

> **No response body that contains deal data may have been computed for a Zurich date other than the one current when it is served.**

Stated structurally, so it holds without anyone remembering it:

- **R1** — Any cached computation whose output depends on the date takes the Zurich date as an **explicit input** (cache key), never reads a clock inside the cache boundary.
- **R2** — No HTML/RSC that **contains deal data** is stored in a cache keyed without the date (ISR/CDN are keyed by path only, so deal data must not be in the prerendered shell).
- **R3** — Correctness must not depend on a scheduler firing on time, or on a visitor triggering a regeneration.

## 5. Options considered

| Opt | Mechanism | Free tier | Guarantees R1–R3? | Verdict |
|---|---|---|---|---|
| A | Keep static homepage; GitHub Actions cron at 00:05 Zurich calls `/api/revalidate` | Yes | **No** (R3). Cron is UTC, so DST needs two entries (22:05 and 23:05 UTC) with a Zurich-hour guard; GitHub documents scheduled runs can be delayed or dropped (already cited in `docs/design/2026-09-25-architect-pm-decisions-design.md` §SPAR "Reliability: Poor"); today's webhook is SWR, so the first visitor after the purge still gets the old page unless it switches to `{ expire: 0 }` and warms both locales. Window 00:00 → job completion always exists. | Reject as primary |
| B | Vercel Hobby cron | Yes | **No** (R3). Hobby cron is limited to daily runs with imprecise timing within the hour (verify against current Vercel plan docs before relying on it). Same window as A. | Reject |
| C | `cacheLife({ expire: secondsToNextZurichMidnight })` inside `getWeeklySnapshot` | Yes | **No** (R2). Bounds L1 only. The homepage ISR entry (L2/L3) is still served stale-while-revalidate. Next docs: a cache with `expire` < 5 min is excluded from prerenders and becomes a dynamic hole — so near midnight builds behave differently from the rest of the day (non-determinism). | Reject; unnecessary once R1 holds |
| D | **Date in the key + deal data only in a per-request dynamic hole** (the shape `/deals` and `/list` already have) | Yes | **Yes.** A new Zurich day is a new key → a miss → a fresh query. No deal data sits in ISR/CDN. No scheduler involved. | **Recommend** |
| E | Date-scoped tag (`deals:2026-09-27`) on a static page | Yes | **No** — a prerendered page cannot know the date without a request, so something must still purge it at midnight → collapses into A. | Reject |
| F | Client-side guard only (browser re-filters by `validTo`) | Yes | **No** — first paint, no-JS and crawlers still see server numbers; count flicker. | Adopt as defence in depth only |
| G | `'use cache: remote'` for a shared L1 | Check runtime-cache free limits | Neutral on correctness | Not needed at 10–50 users; revisit only if Supabase load matters |

## 6. Target design (recommended: D + defences)

**D1 — "today" becomes an input (R1).** The route computes `today = todayInZurich()` at request time (under `cacheComponents` this needs `await connection()` inside a `<Suspense>` boundary before reading the clock) and passes it in: `getWeeklySnapshot({ locale, today })`. Inside, no clock is read. Tags: `cacheTag('deals', `deals:${today}`)`. Keep `cacheLife({ revalidate: 900, expire: 3600 })` — it now only governs *data* freshness within one day; the day boundary is handled by the key. This is exactly the alternative the 2026-09-15 decision "rejected for now"; §3.2 shows its premise ("at most an hour") was false for the homepage, so the trade-off it weighed no longer holds. Cleanest shape (same ADR's wording): cache the Supabase row fetch keyed by `today` (the `.gte('valid_to', today)` filter makes it date-dependent anyway), and compute verdicts/counts outside the cache — they are pure and cheap.

**D2 — homepage becomes PPR (R2).** Static shell: header, labels, `MethodologyStrip`, skeleton. Dynamic hole in `<Suspense>`: `StaleBanner`, `VerdictHero`, `CategoryVerdictCard`s, `ShareVerdictButton`'s data. This is the pattern `/deals` and `/list` already run in production — and production shows it works: `/en/deals` shell is ~35 h old yet served `today = 2026-09-27` (§1).
- Cost: one function invocation per homepage view (Hobby includes a monthly invocation allowance far above 10–50 users; confirm current figure). An L1 miss costs ≤2 PostgREST pages (1000 rows each). Cold renders: the shell paints instantly; the hole streams — needs a skeleton to avoid layout shift. CDN cost: lower ISR writes (no more time-based homepage regenerations every 15 min of traffic).
- SEO: Vercel serves crawlers the full assembled response, so indexed content is the correct day's.
- `/card` (OG image) already renders per request; pass `today` and put it in the OG URL (`/card?locale=de&d=2026-09-27`) so social-network caches key by day too.

**D3 — webhook expires, not SWRs.** `/api/revalidate`: `revalidateTag(tag, { expire: 0 })` (Next 16 `revalidateTag.md`: "For webhooks … that need immediate expiration, pass `{ expire: 0 }`"). Today's `'hours'` profile lets the first visitor after every pipeline run see the previous run's data for up to a day (L5). Independent of this defect, but the same class.

**D4 — data layer tells the truth daily (defence, fixes T4).** Supabase `pg_cron` (runs in UTC) job, **hourly** to sidestep DST arithmetic: `update deals set is_active = false where is_active and valid_to < (now() at time zone 'Europe/Zurich')::date`. Free tier (verify `pg_cron` is enabled on the project). Makes `is_active` correct on Fri/Sat/Sun when no pipeline runs, for every reader (web, pipeline, future API). Not relied on for web correctness — D1 already filters by date — so a missed tick is harmless.

**D5 — client guard (defence, covers L4 and list).** `DealsClient`: on mount compute `todayInZurich()` in the browser; if it is later than `snapshot.today`, drop `validTo < clientToday` and show "Angebote werden aktualisiert" / refresh. Add `validTo` to `ListItem` so `ListDrawer` (T3) can mark or remove expired items a user saved earlier — today it cannot.

**D6 — make the rule enforceable.** Architecture test: no `todayInZurich()` / `new Date()` / `Date.now()` inside any `'use cache'` function (grep-level test like the existing `architecture.test.ts` in the pipeline). Unit test with the injectable `Clock`: same rows, `today = 2026-09-26` vs `2026-09-27` must give different `totalDeals`/`stores`. Production synthetic check (can live in the pipeline's post-run or a daily job): homepage store count equals `count(distinct store) where is_active and valid_to >= Zurich today`.

## 7. Interaction with the approved Volg daily refresh (02:30 UTC)

Source: `docs/design/2026-09-25-architect-pm-decisions-design.md` §3 (V-1a, cron `30 2 * * *`, calls `WEB_REVALIDATE_URL` only if an image changed). Not yet built — `.github/workflows/` contains only `ci.yml` and `pipeline.yml`.

- **It must not be counted as the midnight mechanism.** 02:30 UTC is 04:30 (CEST) / 03:30 (CET) Zurich — hours after the boundary; it only revalidates when an image changed; it is a GitHub schedule (delay/drop risk); and today's webhook is SWR. It would have shortened this incident by chance, not fixed it.
- **Its "live Volg rows" predicate must use the Zurich date, not `is_active` alone.** `is_active` lags by up to 3 days (T4). Match rows with `valid_to >= Zurich today` (reuse the pipeline's date rule) so it never refreshes, or implies liveness of, an expired row. With D4 in place the two agree.
- **Under the target design it is simply a data-change event.** With D3 it expires the `deals` tag immediately; with D1 the next request rebuilds the current day's key. No ordering dependency on midnight, no race with the 05:00 pipeline (both just invalidate). The design doc's line "Without this step the fix does nothing, because the web serves the cached snapshot" stays true for images — images are data, not date.

## 8. Open verification items (not proven here)

1. Whether Vercel's ISR layer enforces a Next `expire` on a prerendered route or keeps serving STALE indefinitely. Check with `vercel logs` for the stale `/` request on 2026-09-27: `cacheReason = stale_time` long after `expire` would prove it. The target design does not depend on the answer.
2. The exact UTC time at which `/` was seen with 1,623 / 7 (to size the window). Tech Lead RCA may hold it.
3. `pg_cron` availability on the Supabase free project; Vercel Hobby invocation allowance and cron precision (current plan docs).
4. Side note for PM, not part of this defect: `totalDeals` counts all rows with `valid_to >= today`, which includes deals whose `valid_from` is still in the future (shown labelled "ab Do" per the 2026-09-15 decision). The headline "N Aktionen" therefore mixes in-effect and upcoming offers — confirm that is the intended wording.

## 9. Decisions needed from the user

- Approve superseding the 2026-09-15 "rejected for now" alternative (D1) and turning the homepage into PPR (D2). This is a change to an approved architecture, so it needs an explicit yes.
- Whether to add the `pg_cron` daily deactivation (D4) — adds a second writer to `deals` (a DB-side job, not code in the repo unless the migration is committed).
