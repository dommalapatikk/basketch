import { cacheLife, cacheTag } from 'next/cache'

import type { SnapshotInput, WeeklySnapshot } from '@/lib/types'

import { supabaseDealsProvider } from './supabase-provider'

/**
 * Cached read of the weekly snapshot. Per architect H1 + ADR D2:
 *   - tag 'deals' so the pipeline can call /api/revalidate to invalidate
 *   - a bounded cache profile as a safety belt — if the pipeline never
 *     fires a revalidate, the snapshot still refreshes
 *   - region/locale become part of the cache key automatically (function args)
 *
 * NOT the "hours" preset (code review of 9525601, HIGH). "hours" revalidates
 * in the background hourly but only EXPIRES — forces a synchronous, fresh
 * rebuild — after a day. `WeeklySnapshot.today` (lib/domain/validity.ts) is
 * computed inside this cached function, so with 10-50 users (CLAUDE.md) an
 * overnight gap in traffic means nobody's request ever triggers that
 * background revalidation: the first visitor after a quiet night could be
 * served a `today` up to ~24h stale, e.g. Thursday's flyer still reading
 * "from Thu" and excluded from the verdict. An explicit `expire` of one hour
 * bounds that worst case to at most an hour — see
 * docs/decisions/2026-09-15-in-effect-vs-upcoming.md for why this, rather
 * than computing `today` outside the cache entirely, is the chosen fix.
 */
export async function getWeeklySnapshot(input: SnapshotInput = {}): Promise<WeeklySnapshot> {
  'use cache'
  cacheTag('deals')
  cacheLife({ revalidate: 900, expire: 3600 })
  return supabaseDealsProvider.getWeeklySnapshot(input)
}
