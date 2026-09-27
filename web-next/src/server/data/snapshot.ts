import { connection } from 'next/server'
import { cacheLife, cacheTag } from 'next/cache'

import { todayInZurich } from '@/lib/domain/validity'
import type { SnapshotInput, WeeklySnapshot } from '@/lib/types'

import { computeSnapshotFromDeals, supabaseDealsProvider } from './supabase-provider'

/**
 * The ONLY cached step. Root-cause fix for docs/rca/2026-09-27-tech-lead-
 * stale-expired-deals.md and docs/rca/2026-09-27-architect-stale-expired-
 * deals.md (§6 D1): `today` is a parameter, not a value read from the clock
 * inside this function — that is what makes the Zurich date part of the
 * cache key (Next docs, "use cache" → "Cache keys": serializable arguments
 * are part of the key). A snapshot built for 2026-09-26 therefore lives
 * under a DIFFERENT key than one for 2026-09-27; a 27-Sep request can never
 * look up, let alone receive, a 26-Sep entry. This supersedes the
 * 2026-09-15 decision (docs/decisions/2026-09-15-in-effect-vs-upcoming.md)
 * to keep `today` inside the cache and bound staleness with `expire` alone —
 * that bounded only this in-memory cache entry, not the durable, traffic-
 * driven Vercel ISR copy of a fully-prerendered page (the actual defect).
 *
 * Only the fetch is cached here — NOT the counts/verdicts computed from it.
 * Those are pure, cheap functions of (deals, today) and are computed by the
 * uncached `getWeeklySnapshot` below, on every request: caching them would
 * only add a second place a stale `today` could hide behind.
 *
 * `cacheTag('deals', ...)` keeps the plain 'deals' tag ALSO on this entry so
 * `/api/revalidate` (which only ever knows the tag name, never which day's
 * key it should target) still reaches every day's cache entry when the
 * pipeline finishes a run.
 */
async function getDealRowsForDay(input: { today: string }) {
  'use cache'
  cacheTag('deals', `deals:${input.today}`)
  cacheLife({ revalidate: 900, expire: 3600 })
  return supabaseDealsProvider.fetchDealRows({ today: input.today })
}

/**
 * NOT cached. `await connection()` defers this function past the static
 * prerender pass (Next docs, `connection.md`): everything below it — reading
 * the Zurich date, calling the cached fetch above, and assembling the
 * snapshot — runs at request time, in whichever component/route calls it,
 * which per D2 (docs/rca/2026-09-27-architect-stale-expired-deals.md §6)
 * must always be a child of a `<Suspense>` boundary, never a page's
 * top-level body. That keeps deal data out of any statically-prerendered
 * shell (ISR/CDN, keyed by path only — see the RCA §2.2 layer table) so it
 * can never outlive the Zurich day boundary the way the homepage's baked-in
 * snapshot did on 2026-09-27.
 */
export async function getWeeklySnapshot(input: SnapshotInput = {}): Promise<WeeklySnapshot> {
  await connection()
  const region = input.region ?? 'all'
  const locale = input.locale ?? 'de'
  const today = input.today ?? todayInZurich()

  const { deals, error } = await getDealRowsForDay({ today })
  return computeSnapshotFromDeals(deals, { region, locale, today, isDegraded: Boolean(error) })
}
