import type { SnapshotInput, WeeklySnapshot } from '@/lib/types'

/**
 * SF-3, docs/reviews/2026-09-28-review-stale-expired-deals.md: `SnapshotInput.
 * today` is optional because `server/data/snapshot.ts`'s uncached
 * `getWeeklySnapshot` is the ONE place allowed to default it from the wall
 * clock (D1). A `DealsProvider` must never do that itself — the review's own
 * words: "a future `'use cache'` wrapper around
 * `supabaseDealsProvider.getWeeklySnapshot({ locale })` would bring back the
 * exact 2026-09-27 defect, and every D6 guard would pass (same shape as M9)."
 * Requiring `today` here makes that mistake fail to compile instead.
 */
export type ProviderSnapshotInput = Omit<SnapshotInput, 'today'> & { today: string }

// Per ADR D2: web-next reads from Supabase. Pipeline writes to Supabase.
// aktionis.ch is a pipeline-only input. This contract abstracts the read path
// so we could swap Supabase for a different read source later (e.g. Edge Config
// snapshot, R2 JSON dump) without touching pages/components.
export interface DealsProvider {
  getWeeklySnapshot(input: ProviderSnapshotInput): Promise<WeeklySnapshot>
}
