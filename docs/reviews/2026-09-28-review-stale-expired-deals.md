# Code review — stale expired deals fix (2026-09-27 defect)

**Branch:** `worktree-agent-ada672819484965c9` · **Range:** `origin/main..4c92d48` (8 commits) · **Reviewer:** Code Reviewer (Opus) · **Date:** 2026-09-28
**Plan checked against:** `docs/rca/2026-09-27-tech-lead-stale-expired-deals.md` § Cross-review resolution; `docs/rca/2026-09-27-architect-stale-expired-deals.md` §6, §10; ADR `docs/decisions/2026-09-27-deals-cache-keyed-by-zurich-date.md`.

## Gates re-run by reviewer
- vitest: 44 files / 457 tests pass
- `tsc --noEmit`: clean
- biome check on the 29 changed files: clean
- `next build` (env copied in, then removed): exit 0. `/[locale]` is now `◐ Partial Prerender`.
- **D2 proven on real build output:** `.next/server/app/de.html` (8 KB) and `en.html` hold one postponed Suspense hole (`<!--$?-->`, `de.meta` has `"postponed"`) with the skeleton. No deal count, no store count, no verdict text. The only store names are in `<meta description>`, and the only "7 Schweizer Läden" is static copy from MethodologyStrip and the footer. The homepage shell can no longer hold a day's deals.
- `git status` clean after every mutation (each file restored with `git checkout -- <file>`).

## Mutation proofs (guards tested by breaking the code)

| # | Mutation | Result |
|---|---|---|
| M1 | remove `.gte('valid_to', today)` from `supabase-provider.ts` | **killed**: D6 "every deals read filters on valid_to" + provider `.gte` test fail |
| M2 | read `todayInZurich()` inside `getDealRowsForDay` (`'use cache'`) | **killed**: D6 clock guard + 2 snapshot source tests fail |
| M3 | `revalidateTag(tag, 'max')` instead of `{ expire: 0 }` | **killed**: 2 route tests fail |
| M4 | `await getWeeklySnapshot()` at HomePage top level | **killed**: page.test "HomePage itself does not call getWeeklySnapshot" |
| M8 | `hasExpired` uses `<=` (off by one) | **killed**: validity + ItemNote boundary tests |
| M5 | ListDrawer sums/shares `items` again instead of `activeItems` | **SURVIVED**: 260/260 pass. Expired-item exclusion is untested |
| M6 | MidnightGuard reads the clock during render (`useState(() => todayInZurich() > …)`) | **SURVIVED**: no test pins "clock only in useEffect" |
| M7 | delete `await connection()` from `getWeeklySnapshot` | **SURVIVED**: the source test's `indexOf('await connection()')` matches the JSDoc comment instead |
| M9 | cached fn reads the clock through a helper (`zurichDay()` → `todayInZurich()`) | **SURVIVED**: 119/119 pass. The D6 guard only works at grep level and the regression test cannot tell the difference, because `'use cache'` does nothing under vitest |

The guards catch the direct form of each defect (M1–M4, M8). They do not catch the indirect forms (M5–M7, M9). See the SHOULD-FIX items.

## MUST-FIX

**MF-1: D5 was not done on `/deals` (plan item 5, TDD test 8).** The Tech Lead's ruling says: "`DealsClient` compares browser `todayInZurich()` with `snapshot.today`; if later, drops `validTo < clientToday` and prompts refresh". `MidnightGuard` is mounted only in `[locale]/page.tsx:59` (`grep MidnightGuard src` finds one use), and `DealsClient.tsx` only threads `validTo` through to `DealCard`. `/deals` is the page where people add items to a list. If a tab stays open across a Zurich midnight, it keeps showing, and keeps letting people add, deals whose `valid_to` was yesterday. The ADR's D5 line also leaves this out without saying so. Fix: mount `<MidnightGuard referenceDay={snapshot.today} />` in `DealsClient`. After the guard fires, filter `hasExpired(d, clientToday)` out of `snapshot.deals` before `filterDeals`/counts. Add the test 8 case (`snapshot.today = 2026-09-26`, browser 2026-09-27, a `validTo 2026-09-26` deal is hidden and the prompt is shown).

**MF-2: expired items still go out in the `/deals` mobile share (`BottomBar.tsx:29-35`).** Commit 7f87887 sets the rule "expired items are excluded from the WhatsApp/email share text (UWG)". Only `ListDrawer` applies it. `BottomBar` still calls `createShareTarget({ …, items })` with the raw store items, so the mobile Share button on `/deals` sends yesterday's prices. This is also the M5 gap: no test pins the exclusion anywhere. Fix it at the root, not per caller: add one hook (e.g. `useActiveListItems()` in `stores/list-store.ts` or `lib/`) that reads the Zurich date after mount and returns `items.filter(i => !hasExpired(i, today))`. Use it in `ListDrawer` (totals + share) and `BottomBar` (share). Add a jsdom test: an item with `validTo` yesterday is visible in the list but absent from `WhereToBuy` totals and from `shareText` (this kills M5).

## SHOULD-FIX

**SF-1: the regression test cannot see the defect class (M9, M2 at runtime).** `snapshot.test.ts` "2026-09-27 stale-expired-deals…" spies on `fetchDealRows`. Because `'use cache'` does nothing under vitest, it passes whether the date comes from the argument or from the clock inside the cached function. Export `getDealRowsForDay` (or a `__test` handle) and add the one test that tells the two apart: clock set to 2026-09-27T00:10 Zurich, call it with `{ today: '2026-09-26' }`, expect the fetch to get `'2026-09-26'` (the argument wins over the clock). Also make the plan's fixture assertion real: the "Volg valid_to yesterday contributes 0 deals" provider test (`supabase-provider.test.ts:190`) feeds `data: []` and asserts 0, which proves nothing. Have the fake apply `.gte` (or assert on `computeSnapshotFromDeals` with the Volg row present vs absent) so `totalDeals`/`stores` visibly differ between 26 and 27 Sep, as plan test 1 requires.

**SF-2: the `connection()`-order test is fooled by the comment (M7).** `snapshot.test.ts:35-41` uses `source.indexOf('await connection()')`, and that string appears first in the JSDoc (`snapshot.ts:41`; the real call is :53). Slice the function body first (as the test at :47 already does), or strip comments. `next build` would probably still catch a missing `connection()` at prerender (clock read in a server component), but the unit test's claim is false as written.

**SF-3: the provider still has a clock fallback (plan D1: "Provider takes `today` as input and reads no clock").** `SupabaseDealsProvider.getWeeklySnapshot` (`supabase-provider.ts:302`) does `input.today ?? todayInZurich()` and is called only from tests. A future `'use cache'` wrapper around `supabaseDealsProvider.getWeeklySnapshot({ locale })` would bring back the exact 2026-09-27 defect, and every D6 guard would pass (same shape as M9). Make `today` required on the provider method (or delete the method and the now-unused `DealsProvider` contract path). Keep the single clock read in `snapshot.ts`.

**SF-4: ListDrawer reads `today` once per page load.** `ListDrawer.tsx:56` `useEffect(() => setToday(todayInZurich()), [])`. The drawer is mounted in the layout, so in a long client-side session across midnight, items expiring at 00:00 stay in totals and share text. Re-read on open (`[open]` dependency), or share the hook from MF-2 with a coarse interval like MidnightGuard's.

**SF-5: MidnightGuard CTA is 36 px tall (`h-9`).** The project standard is 44 px touch targets as a build requirement. Use `min-h-11` (or `h-11`). Also add a test that the component does not read the clock during `renderToString` (as `ListDrawer.test.tsx` does) to kill M6.

**SF-6: ruling on the open item (layout OG `/card?locale=` has no `d=`).** **Do not add `d=` to the layout metadata.** `generateMetadata` output is part of the prerendered head. A date put there is frozen at build/ISR time, which is the defect class this branch removes. Reading it per request would force a clock read into metadata under Cache Components. The real risk is somewhere else: `/card` returns `ImageResponse` with its default header `cache-control: public, immutable, no-transform, max-age=31536000` (`node_modules/next/dist/compiled/@vercel/og/index.node.js:21490`, not overridden in `app/card/route.tsx`). So any browser or proxy that honours it keeps one day's verdict image for a year, under a URL that never changes. Fix: set an explicit short `Cache-Control` on the `/card` response (e.g. `public, max-age=0, s-maxage=900, stale-while-revalidate=60`). Record in the ADR that third-party link-preview caches (WhatsApp, LinkedIn) are outside our control and are accepted. Not a blocker for this defect: the page itself is correct.

## NIT

- **N-1** `getDealRowsForDay` returns `{ deals, error: Error }` from `'use cache'`. React Flight turns an `Error` value into `"$Z"` in production (`react-server-dom-webpack-server.node.production.js:1668`), so on a cache hit the message is gone. Only `Boolean(error)` is used, so return `isDegraded: boolean` instead and drop the `as unknown as Error` cast. Note: an outage result is still cached for up to `revalidate: 900` under that day's key. This did not change on this branch; now is a good time to decide on it.
- **N-2** D6 directive regex `^['"]use cache['"]` misses `'use cache: remote'` / `'use cache: private'` and a file-level directive (`lastIndexOf('{')` returns -1). Widen it to `use cache(:\s*\w+)?`.
- **N-3** D6 valid_to guard scans only `web-next/src`. Plan test 4 also names `pipeline/` (excluding `migrate/`, `scripts/`, writes). Either extend it or record why not.
- **N-4** `ShareVerdictButton.today` is optional, but its only caller always passes it. Make it required so a new caller cannot silently drop `d=`.
- **N-5** `HomeSkeleton` does not reserve height for `ShareVerdictButton`/StaleBanner. There is a small layout shift when the hole streams in. Check it on the preview.
- **N-6** Copy: `midnight_guard.refresh` EN "It's a new day — today's deals may have changed." / DE "Es ist ein neuer Tag – die Aktionen könnten sich geändert haben."; `list.expired_label` "Expired" / "Abgelaufen". The wording is understated, correct Swiss German with no ß, and passes message-lint and the parity tests. Fine as is.

## What is good
- D1 has the right shape: an uncached `connection()` → a single `todayInZurich()` → a cached row fetch keyed and tagged by day. Counts and verdicts are pure and computed outside the cache (`computeSnapshotFromDeals`). Keeping the plain `'deals'` tag so the webhook reaches every day's entry is a careful touch.
- D2 is verified on real build output, not just by reading the code.
- D3 matches the Next 16 docs word for word (`revalidateTag.md:136`), and the new route tests cover 200 / default tag / 401 / 500.
- `validTo?` on `ListItem` is safe for existing saved lists: it is optional, `sanitizeItems` only checks the v1 shape, and there are pre-D5 rehydrate tests. `hasExpired` treats unknown as not expired, and its boundary is pinned (M8 killed).
- 2c39e74 is a real catch: a render-time clock read in a layout-mounted client component broke `next build`. The `renderToString` regression test is the right kind of test.
- The ADR and the CLAUDE.md pitfall line are short and accurate. The superseded ADR is annotated rather than rewritten.

## Verdict

**Needs Changes.** The root-cause fixes (D1, D2, D3) are correct, and D2 is proven on the real build. They can ship once MF-1 and MF-2 are fixed. Both are small, and both are places where the D5 invariant is stated but only half applied: the `/deals` midnight guard, and expired items in the `/deals` share. SF-1 to SF-3 close the guard gaps shown by the surviving mutations M5, M7 and M9. They should go in the same round, because M9 is exactly the 2026-09-27 defect written one function deeper.

---

## Re-review (2026-09-28): fixed items only, `4c92d48..7d70549` (12 commits)

**Gates re-run by reviewer:** vitest 468/468. `next build` exit 0 (env copied in, then removed): `/[locale]` and `/[locale]/deals` are still `◐`, `/card` is `ƒ`. `de.html` and `de/deals.html` each hold one postponed Suspense hole and no deal count. `git status` clean after every mutation.

| Finding | Commit(s) | Status | Evidence |
|---|---|---|---|
| MF-1 D5 on `/deals` | ea0e3af | **Closed** | `MidnightGuard` mounted in `DealsClient`. `activeDeals` (filtered by `hasExpired(d, clientToday)` once the client day passes `snapshot.today`) now feeds every count, facet, section and virtual row. Mutation *filter disabled* is **killed** ("drops a deal whose validTo has passed the client day and shows the refresh prompt"). |
| MF-2 expired items in share | 60692f3, 3d392be | **Closed (see R-1)** | One `useActiveListItems()` in `stores/list-store.ts`, used by `ListDrawer` (totals + share) and `BottomBar` (share). M5 (ListDrawer) is killed per the coordinator and tested in `ListDrawer.test.tsx`. |
| SF-1 argument vs clock, real Volg fixture | 928fcd0, dc53c1b | **Closed** | "fetches the day it was called with, not the day the system clock reports" fails under M9. |
| SF-2 comment-proof `connection()` test | 928fcd0 | **Closed** | M7 re-run: **killed**. |
| SF-3 / N-1 provider has no clock default; `isDegraded` boolean | a413d4f | **Closed** | `supabase-provider.ts:300-306` takes `today` from required input. The cached fn returns `{ deals, isDegraded }`. |
| SF-4 ListDrawer reads today once | 60692f3 | **Closed** | The new `useTodayInZurich()` re-reads every 60 s after mount and never during render. It is shared by ListDrawer, BottomBar, DealsClient and MidnightGuard. |
| SF-5 44 px + no render clock | ee13f3c | **Closed** | `min-h-11`. Mutation M6 (clock read in MidnightGuard's render) re-run: **killed** by the SSR test. |
| SF-6 `/card` Cache-Control + ruling | abedb4d | **Closed** | `cache-control: public, max-age=0, s-maxage=900, stale-while-revalidate=60` overrides ImageResponse's `immutable, max-age=31536000`. The ADR records that layout OG `d=` stays out on purpose. |
| M9 / N-2 / N-3 D6 guard | 0466366 | **Closed** | Transitive same-file helper scan, `'use cache: <mode>'` plus file-level directive, and `pipeline/` valid_to scan (excluding `migrate/`, `scripts/`, writes). M9 re-run: **killed** (3 tests). |
| N-4, N-5 | 9864a33, ec8fd6e | **Closed** | `today` is required; the skeleton reserves the share block's height. |

**Mutations re-run by reviewer:** M9 killed, M7 killed, MF-1 filter-disabled killed, M6 killed. **M5b survived:** reverting `BottomBar.tsx` to `useListStore((s) => s.items)` → 468/468 still pass.

### Remaining
- **R-1 (SHOULD-FIX, non-blocking):** `BottomBar` is the exact call site MF-2 was raised about, and no test pins it. The hook itself is tested, but nothing stops a caller from bypassing it. The cheapest guard is a grep test in `deals-freshness-architecture.test.ts`: "every `createShareTarget(` caller outside `lib/` gets its items from `useActiveListItems()`". A one-case BottomBar jsdom test would also work. Either one kills M5b.
- Transitive clock guard is same-file only (documented in the test). Cross-module helpers still rely on SF-1's argument-vs-clock test. That is acceptable.

### Re-review verdict
**Approved.** Every MUST-FIX and SHOULD-FIX from the first review is closed, and 4 re-run mutations are killed. R-1 is a small test-only follow-up and does not block merge.
