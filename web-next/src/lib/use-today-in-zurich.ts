'use client'

import { useEffect, useState } from 'react'

import { todayInZurich } from '@/lib/domain/validity'

// Same coarse interval MidnightGuard already polls at
// (components/shared/MidnightGuard.tsx) — a tab left open across a Zurich
// midnight should not need a full reload just to stop counting an item whose
// `validTo` closed at midnight.
const CHECK_INTERVAL_MS = 60_000

/**
 * The Zurich calendar date, read only after mount — never during render.
 * `null` until the first effect commits, the same "not hydrated yet" shape
 * `useOrigin` (lib/use-origin.ts) already returns for the same reason: a
 * client component still runs through the server prerender pass, where
 * reading the clock during render breaks `next build` (commit 2c39e74,
 * ListDrawer.test.tsx's renderToString regression).
 *
 * Re-reads on an interval so a long-lived tab notices the day change without
 * a full page reload — shared by every caller that needs "is this still
 * today" rather than a one-time snapshot (`stores/list-store.ts`
 * `useActiveListItems`, `MidnightGuard`, `DealsClient`'s D5 filter).
 */
export function useTodayInZurich(): string | null {
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    setToday(todayInZurich())
    const id = setInterval(() => setToday(todayInZurich()), CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
  return today
}
