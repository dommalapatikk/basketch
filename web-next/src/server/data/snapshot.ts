import { cacheLife, cacheTag } from 'next/cache'

import type { SnapshotInput, WeeklySnapshot } from '@/lib/types'

import { supabaseDealsProvider } from './supabase-provider'

/**
 * Cached read of the weekly snapshot. Per architect H1 + ADR D2:
 *   - tag 'deals' so the pipeline can call /api/revalidate to invalidate
 *   - cacheLife('hours') as a safety belt — if the pipeline never fires
 *     a revalidate, the snapshot still refreshes every hour
 *   - region/locale become part of the cache key automatically (function args)
 */
export async function getWeeklySnapshot(input: SnapshotInput = {}): Promise<WeeklySnapshot> {
  'use cache'
  cacheTag('deals')
  cacheLife('hours')
  return supabaseDealsProvider.getWeeklySnapshot(input)
}
