import { describe, expect, it, vi } from 'vitest'

import type { WeeklySnapshot } from '@/lib/types'

// Same reason DealsClient.test.tsx mocks this: something in the import
// graph transitively imports `@/i18n/navigation`, which re-exports
// next-intl's client-side `createNavigation`, and that resolves
// `next/navigation` in a way vitest's plain Node resolution cannot follow
// outside the real Next.js runtime.
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  Link: 'a',
}))

// `setRequestLocale` (next-intl/server) throws "not supported in Client
// Components" outside a real `react-server` condition, which vitest never
// sets. HomePage's own call to it is a side effect this test has no
// interest in — the wiring under test is what HomePage passes to
// `getWorthPickingUpCandidates`, not locale negotiation.
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => {},
}))

const mockSnapshot: WeeklySnapshot = {
  updatedAt: '2026-09-15T00:00:00Z',
  totalDeals: 0,
  region: 'all',
  locale: 'en',
  stores: [],
  categories: [],
  deals: [],
  today: '2026-09-15',
}

vi.mock('@/server/data/snapshot', () => ({
  getWeeklySnapshot: vi.fn().mockResolvedValue(mockSnapshot),
}))

const getWorthPickingUpCandidatesMock = vi
  .fn()
  .mockResolvedValue({ mode: 'cold-start', candidates: [] })
vi.mock('@/server/data/worth-picking-up', () => ({
  getWorthPickingUpCandidates: getWorthPickingUpCandidatesMock,
}))

/**
 * F4 (code review of 4e6211a on WP-W3): "the guard that ships is the one
 * nothing tests." The reviewer mutated `page.tsx`'s
 * `today: snapshot.today` to `today: '2000-01-01'` and the full suite (281
 * tests at the time) stayed green — nothing proved `HomePage` forwards the
 * snapshot's own Zurich `today` into `getWorthPickingUpCandidates` rather
 * than any other date. `getWorthPickingUpCandidates` is correct in
 * isolation (worth-picking-up.test.ts); this is the wiring test that closes
 * the gap between "the function is correct" and "the page calls it
 * correctly" — the exact shape HANDOVER.md §4 names as this codebase's most
 * common defect class.
 *
 * WP-W2's entire design (docs/decisions/2026-09-15-in-effect-vs-upcoming.md)
 * depends on every consumer of a given cached snapshot agreeing on the ONE
 * `today` computed for it — a second, independently-sourced date here would
 * silently reintroduce the UTC/stale-cache class of bug that ADR exists to
 * prevent.
 */
describe('HomePage wires WeeklySnapshot.today into getWorthPickingUpCandidates', () => {
  it('forwards snapshot.today — not a second date source', async () => {
    const { default: HomePage } = await import('./page')

    await HomePage({ params: Promise.resolve({ locale: 'en' }) })

    expect(getWorthPickingUpCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ today: mockSnapshot.today }),
    )
  })
})
