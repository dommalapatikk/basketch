import type { SnapshotInput, WeeklySnapshot } from '@/lib/types'

// Per ADR D2: web-next reads from Supabase. Pipeline writes to Supabase.
// aktionis.ch is a pipeline-only input. This contract abstracts the read path
// so we could swap Supabase for a different read source later (e.g. Edge Config
// snapshot, R2 JSON dump) without touching pages/components.
export interface DealsProvider {
  getWeeklySnapshot(input?: SnapshotInput): Promise<WeeklySnapshot>
}
