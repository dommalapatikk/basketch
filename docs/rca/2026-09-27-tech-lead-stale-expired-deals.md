# RCA — German homepage served expired Volg deals after their valid_to (2026-09-27)

Author: Tech Lead · Scope: RCA + fix design only (no code changed, nothing pushed)

## 1. Defect

- Every active Volg deal has `valid_to = 2026-09-26` (read-only Supabase check: 0 Volg deals with `valid_to >= 2026-09-27`).
- On 2026-09-27 (Sunday, Zurich) `https://basketch.vercel.app/en` showed "1,599 deals across 6 Swiss stores" (correct), while `https://basketch.vercel.app/` (German) showed "1,623 … 7 Schweizer Läden" — 24 expired Volg deals still counted and voting in verdicts.
- CLAUDE.md legal rule: price comparisons must be objectively correct; expire aggressively. A deal past its `valid_to` must never be shown, whatever any cache holds.

## 2. Reproduction (2026-09-27, ~18:41 UTC = 20:41 Zurich)

`curl -sI` (bounded, `--max-time 20`), first request in this session:

| URL | x-matched-path | x-vercel-cache | age | cache-control | x-nextjs-prerender |
|---|---|---|---|---|---|
| `/` | `/de` | PRERENDER | 0 | public, max-age=0, must-revalidate | 1 |
| `/en` | `/en` | PRERENDER | 0 | same | 1 |
| `/deals` | `/de/deals` | PRERENDER | 0 | same | 1 |
| `/en/deals` | `/en/deals` | **HIT** | **128008 (35.5 h)** | same | 1 |
| `/list` | `/de/list` | PRERENDER | 0 | same | 1 |
| `/en/list` | `/en/list` | **HIT** | **36850 (10.2 h)** | same | 1 |
| `/card?locale=de` | — | MISS | 0 | same | — |

Immediately afterwards a `GET /` returned `x-vercel-cache: HIT, age: 7` and "1’599 Aktionen aus 6 Schweizer Läden" — i.e. the German homepage only regenerated because *a request arrived* (this investigation's own HEAD). That is the stale-while-revalidate mechanism in action: the stale copy is kept until someone asks, and the first asker can be served the stale copy.

Notes:
- All routes are prerendered (`x-nextjs-prerender: 1`); the durable copy lives in Vercel's ISR cache (survives up to 31 days), not in the browser (`max-age=0`).
- `/en/deals` and `/en/list` with ages of 35 h / 10 h are *shells only* — their deal data is in a Suspense hole rendered per request (they read `searchParams`), and their HTML carried `today":"2026-09-27"`. So an old shell is harmless there; an old *homepage* is not, because the homepage has no hole (see §3).
- Last commit/deploy: 2026-09-26 00:04 +0200. The German homepage's ISR copy was built on or after that and — with no weekend pipeline run — nothing but a visitor could replace it.

## 3. Root cause

### 3.1 The homepage bakes the deals into the static ISR shell
`web-next/src/app/[locale]/page.tsx:18-20` awaits `getWeeklySnapshot({ locale })` at the top level of the page with no request-time API (`connection()`, `searchParams`, cookies). Under `cacheComponents: true` (`next.config.ts:7`) the whole page, including the deal count and verdicts, becomes part of the prerendered shell, and `[locale]/layout.tsx:72-73` (`generateStaticParams` → `de`, `en`) makes `/de` and `/en` **two independent ISR entries**.

### 3.2 "today" is decided at cache-fill time, not at serve time
`web-next/src/server/data/supabase-provider.ts:184` computes `const today = todayInZurich()` **inside** the cached call, and uses it for `.gte('valid_to', today)` (`:199`) and verdicts (`:261-263`). `web-next/src/server/data/snapshot.ts:26-30` wraps that in `'use cache'` with `cacheLife({ revalidate: 900, expire: 3600 })` and key = `(input)` = `{ locale }` only. The Zurich date is **not part of the cache key**, so an entry filled at 23:50 on 26 Sep with `today = 2026-09-26` is, by key, a perfectly valid answer on 27 Sep. Nothing ties a cache entry's life to the day boundary.

### 3.3 Time-based revalidation is stale-while-revalidate, and it only fires on traffic
Per Next docs (`node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md:23`) and Vercel ISR semantics, time-based revalidation serves the cached copy and regenerates **in the background, triggered by a request**. With 10-50 users, a quiet locale can go many hours without a request; the first request after midnight gets yesterday's page. `/en` happened to receive a request (which triggered regeneration) before the reporter looked; `/de` did not — so EN was fresh and DE was stale. **That is the entire EN/DE asymmetry: two ISR entries, each refreshed only by its own traffic.**

The `expire: 3600` in `snapshot.ts:29` was believed to bound staleness to 1 h (see its comment `:14-24` and `snapshot.test.ts:28`). It bounds the *in-memory `use cache` data entry* (which on serverless barely persists anyway — `use-cache.md:206`), not the durable Vercel ISR copy of a fully-prerendered page, which is what users are served. The observed DE page, still showing 26-Sep data well past 00:00 + 1 h on 27 Sep, is the empirical proof.

### 3.4 No event at the day boundary
- The pipeline calls `/api/revalidate` only at the end of a run (`pipeline/composition.ts:388`, `pipeline/run-pipeline.ts:750`), and runs only **Mon/Tue/Thu 05:00 UTC** (`.github/workflows/pipeline.yml:4-10`). 26 Sep was Saturday → nothing fires on the Sat→Sun boundary when Volg expired.
- Even when it fires, `web-next/src/app/api/revalidate/route.ts:36` calls `revalidateTag(tag, 'hours')` — stale-while-revalidate again (the next visitor still gets stale). Per `revalidateTag.md:136`, an external webhook that needs immediate expiry should pass `{ expire: 0 }`. The comment on `:10-12` still refers to `cacheLife('hours')`, which `snapshot.ts` no longer uses — drift.

### 3.5 Why an expired deal can outlive its valid_to at all
Validity is a function of **(row, Zurich date)**, but every cache layer is keyed on **(locale)** only and refreshed on **(time since fill, traffic, pipeline event)**. None of those three is "the Zurich date changed". So any entry filled before midnight can outlive midnight by an unbounded amount (traffic-dependent), and the filtering that should remove expired rows (`.gte('valid_to', today)`) ran with yesterday's `today`.

## 4. Exposure of other surfaces

| Surface | How data is rendered | Exposure |
|---|---|---|
| `/` and `/en` (homepage) | Data in static ISR shell (§3.1) | **Unbounded** (until a request triggers regen, and that request itself is stale). The reported defect. |
| `/deals`, `/en/deals` | Snapshot inside Suspense hole with `searchParams` → per request | Bounded by the in-memory `use cache` entry on a warm instance: up to ~1 h past midnight (revalidate 900 / expire 3600 SWR). Still a legal exposure window, smaller. |
| `/list`, `/en/list` | Same pattern (`list/page.tsx:37-54`) | Same ~1 h window. |
| `/card?locale=` (share image) | Route handler, MISS per request, same cached snapshot (`card/route.tsx:44`) | Same ~1 h window; plus any downstream social-preview caches, which we don't control. |
| `generateMetadata` (deals) | Static strings, no snapshot | None. |

## 5. Why tests missed it
1. `snapshot.test.ts:21-43` is a source-regex test that asserts `expire <= 3600`. It encodes the false premise that `cacheLife.expire` bounds what users see; it never models the Vercel ISR layer of a fully-prerendered page.
2. No test (unit or e2e) crosses a Zurich midnight: the provider test injects `today`, but nothing asserts that *a snapshot built for day D cannot be served on day D+1*.
3. No test asserts the homepage keeps deal data out of the static shell (i.e. behind `connection()`), so moving `getWeeklySnapshot` to the page top level was invisible.
4. No test on `/api/revalidate` asserts immediate expiry semantics (`{ expire: 0 }`).
5. No production canary compares "deals rendered" against "deals in effect today" — CI and pipeline both go green while the site shows expired prices.

## 6. Fix design (free tiers only)

Principle: make validity **structurally** impossible to carry across midnight, then add a cheap event so the first post-midnight visitor is not the one paying for it. Root-cause fix is F1; F2-F4 are required companions; F5 is an optional detector.

### F1 (root cause) — the Zurich date is read at request time and is part of the cache key
1. `snapshot.ts`: split into
   - `getWeeklySnapshotForDay(input: SnapshotInput & { today: string })` — `'use cache'`, `cacheTag('deals')`, `cacheLife({ revalidate: 900, expire: 3600 })` (or longer; freshness is now carried by the key). The provider receives `today` as an argument and **must not** call `todayInZurich()` itself.
   - `getWeeklySnapshot(input)` — NOT cached: `await connection()` (from `next/server`), then `const today = todayInZurich()`, then `return getWeeklySnapshotForDay({ ...input, today })`.
   Because `today` is an argument, it is in the cache key (`use-cache.md` "Cache keys", §3): a 26-Sep entry can never answer a 27-Sep request — it simply isn't looked up.
2. `supabase-provider.ts:180-184`: take `today` from input (keep `todayInZurich()` only as a default for non-cached callers/tests, or remove it); `.gte('valid_to', today)` and verdicts use that value.
3. `[locale]/page.tsx`: move the snapshot-reading body into a child `<HomeBody locale>` wrapped in `<Suspense fallback={<HeroSkeleton/>}>`, exactly the pattern `/deals` and `/list` already use. The homepage becomes a PPR route: static shell (layout/nav/hero copy) from ISR, deal count + verdicts rendered per request from the day-keyed cache. `connection()` is the documented Cache Components way to defer a wall-clock read to request time (`01-getting-started/08-caching.md:195-205`).
4. `/deals`, `/list`, `/card` call the same `getWeeklySnapshot` → they inherit the fix automatically (closes the ~1 h window in §4).

Cost: one function invocation per homepage request (already true for `/deals`, `/list`, `/card`). At 10-50 users this is far inside Vercel Hobby's free allowance; no `use cache: remote`, no paid cache.

Rejected alternatives:
- *Compute `expire` = seconds until Zurich midnight inside `cacheLife`*: bounds only the in-memory entry; the Vercel ISR copy of a prerendered page is still SWR/traffic-driven (§3.3). Doesn't fix the reported surface.
- *Only a midnight cron*: GitHub Actions schedules drift 5-30+ min and are auto-disabled after 60 days without commits (known basketch incident); Vercel Hobby crons run once/day with no minute precision. A cron alone leaves a window and a silent failure mode. Use it as a companion (F3), never as the fix.
- *`export const dynamic = 'force-dynamic'`*: not the Next 16 Cache Components model; `connection()` + Suspense is.

### F2 — `/api/revalidate` expires immediately
`route.ts:36`: `revalidateTag(tag, { expire: 0 })` (webhook pattern, `revalidateTag.md:136`), and fix the stale comment at `:10-12`. After a pipeline run the next request blocks and renders fresh instead of serving one more stale page.

### F3 — daily Zurich-midnight revalidate + warm (free, GitHub Actions)
New workflow `.github/workflows/midnight-revalidate.yml`: cron `5 22 * * *` and `5 23 * * *` (UTC; covers 00:05 Zurich in CEST and CET — the job itself checks `TZ=Europe/Zurich date +%H` is `00` and no-ops otherwise), POST `/api/revalidate` with the existing secret, then GET `/`, `/en`, `/deals`, `/en/deals`, `/list`, `/en/list` (curl `--max-time 20`) so regeneration is paid by the bot, not a user. Redundant after F1 for correctness, but it also refreshes ISR shells and exercises the site daily. Reuses `WEB_REVALIDATE_URL`/`WEB_REVALIDATE_SECRET`.

### F4 — fix the lying guard
Replace `snapshot.test.ts`'s "expire <= 3600 bounds today" premise with the tests in §7; keep a short note in `snapshot.ts` explaining that freshness is carried by the `today` key, not by `cacheLife`. Update `docs/decisions/2026-09-15-in-effect-vs-upcoming.md` (it chose "keep today inside the cache + 1 h expire"; this RCA supersedes that choice) — Builder should flag this to the Architect since it reverses an ADR.

### F5 (optional, recommended) — production canary
In the F3 job, after warming: fetch `/` and `/en`, extract the rendered deal count and store count, compare with a read-only Supabase count of `valid_from <= today <= valid_to` (Zurich). Fail the job (GitHub emails the owner, free) on mismatch. This is the detector that would have caught this defect on the night it happened.

## 7. TDD — tests the Builder writes first (all must fail on current `main`)

1. **Regression, named after this defect** — `web-next/src/server/data/snapshot.test.ts`:
   `it('2026-09-27 stale-expired-deals: a snapshot filled on 2026-09-26 is never served on 2026-09-27 (Volg valid_to 2026-09-26)')`
   Mock `supabaseDealsProvider.getWeeklySnapshot` and `todayInZurich`/clock; call `getWeeklySnapshot({ locale: 'de' })` at 2026-09-26T21:50Z (23:50 Zurich) then at 2026-09-26T22:10Z (00:10 Zurich, 27 Sep). Assert the provider received `today: '2026-09-26'` then `today: '2026-09-27'` — i.e. the day is passed as an argument (cache-key input), not computed inside the provider. (Since `'use cache'` is inert under vitest, this asserts the contract that makes the key correct; the source test below asserts the directive placement.)
2. `snapshot.test.ts` (source-level, same style as existing): the `'use cache'` function's parameter includes `today`; the exported uncached `getWeeklySnapshot` calls `connection()` before `todayInZurich()`; `todayInZurich` is not referenced inside the `'use cache'` body.
3. `supabase-provider.test.ts`: `getWeeklySnapshot({ locale, today: '2026-09-27' })` issues `.gte('valid_to', '2026-09-27')` and returns `today === '2026-09-27'`; with fixture Volg rows `valid_to = '2026-09-26'`, Volg contributes 0 deals and the store count excludes Volg. Also: provider does **not** call the wall clock when `today` is supplied (spy on clock).
4. `[locale]/page.test.tsx`: homepage deal count/verdicts render inside a `Suspense` boundary (component reading the snapshot is a child of `<Suspense>`), mirroring `/deals`. Source-level assertion acceptable: `page.tsx` default export does not call `getWeeklySnapshot` directly.
5. `web-next/src/app/api/revalidate/route.test.ts`: with valid bearer, `revalidateTag` is called with `('deals', { expire: 0 })`; 401 without; 500 without secret.
6. `validity.test.ts` (if not present): `todayInZurich` at 2026-09-26T21:59:59Z → `2026-09-26`; at 2026-09-26T22:00:00Z → `2026-09-27` (CEST); at 2026-12-31T23:00:00Z → `2027-01-01` (CET).
7. Workflow guard (if F3 lands) — `web-next/src/lib/midnight-workflow.test.ts` or pipeline test: `midnight-revalidate.yml` has both `22` and `23` UTC hours and hits `/` and `/en`.
8. E2E (Playwright, if the suite runs against a preview): `/` and `/en` render the same deal count and store count for the same instant.

## 8. Verification after deploy
1. `curl -sI` `/` and `/en`: expect PPR (`x-nextjs-prerender: 1`) with the count now in the streamed hole; view source shows `today":"<Zurich date>"` in both.
2. Next day boundary: at 00:10 Zurich, `/` and `/en` counts both exclude any deal with `valid_to` = previous day (compare with Supabase read-only count).
3. `vercel logs` for `/api/revalidate` from the midnight job: 200; subsequent `/` request not `STALE`.
