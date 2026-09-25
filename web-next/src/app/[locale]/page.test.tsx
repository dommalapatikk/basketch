// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WeeklySnapshot } from '@/lib/types'
import messages from '@/messages/en.json'

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
// interest in.
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => {},
}))

/**
 * Code review of 760a8b4 (re-review, optional note): the first version of
 * this test proved "no worth_picking_up_candidates query" only by
 * accident — a full revert of `page.tsx` re-adds an import of the deleted
 * `server/data/worth-picking-up.ts`, which fails on module resolution
 * before any assertion runs. A revert that *also* restored a working,
 * non-crashing data module would sail through unnoticed.
 *
 * Mocking the shared Supabase client factory directly — the same one
 * `server/data/supabase-provider.ts` and the deleted `worth-picking-up.ts`
 * both built on — lets the assertion below catch that: any code reachable
 * from `HomePage` that calls `createAnonClient().from(...)` runs through
 * this fake, whether or not it crashes, and the fake's `from` calls are
 * inspectable directly.
 */
const fromMock = vi.fn((_table: string) => fakeQueryChain())
vi.mock('@/lib/supabase/anon-server', () => ({
  createAnonClient: vi.fn(() => ({ from: fromMock })),
}))

type FakeQueryChain = {
  select: () => FakeQueryChain
  eq: () => FakeQueryChain
  gte: () => FakeQueryChain
  order: () => FakeQueryChain
  range: () => FakeQueryChain
  then: (resolve: (value: { data: unknown[]; error: null }) => void) => void
}

// A chainable, always-empty-success fake — mirrors supabase-provider.test.ts's
// fakeDealsClient. It exists so a reintroduced query resolves instead of
// throwing, which is exactly the case the accidental pass above missed.
function fakeQueryChain(): FakeQueryChain {
  const chain: FakeQueryChain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    range: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable fake — mirrors a real Supabase query builder
    then(resolve) {
      resolve({ data: [], error: null })
    },
  }
  return chain
}

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

const getWeeklySnapshotMock = vi.fn().mockResolvedValue(mockSnapshot)
vi.mock('@/server/data/snapshot', () => ({
  getWeeklySnapshot: getWeeklySnapshotMock,
}))

afterEach(cleanup)

/**
 * WP-11 (code review of 760a8b4, M-1): the removed `page.test.tsx` proved
 * only that `page.tsx` forwarded `snapshot.today` into
 * `getWorthPickingUpCandidates` — once that call was deleted, the file had
 * zero tests left and was deleted whole. That left `HomePage` itself
 * completely untested, and nothing pinned that the Worth Picking Up
 * section (and the query it required) actually stopped rendering rather
 * than just losing its own dedicated test file.
 *
 * Tech-lead plan §7, WP-11 row, names this test: "the homepage renders
 * without the Worth-a-look section and issues no worth_picking_up_candidates
 * query." A later revert or partial cherry-pick from a branch that still has
 * `server/data/worth-picking-up.ts` — reintroducing the fetch, the render
 * branch, or both — must fail this test, not silently pass.
 */
describe('HomePage renders without the Worth Picking Up section', () => {
  it('renders without the Worth-a-look section and issues no worth_picking_up_candidates query', async () => {
    const { default: HomePage } = await import('./page')
    const element = await HomePage({ params: Promise.resolve({ locale: 'en' }) })

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {element}
      </NextIntlClientProvider>,
    )

    // The "how it works" strip still renders — removal did not take
    // unrelated content with it.
    expect(screen.getByRole('heading', { name: messages.methodology.title })).toBeTruthy()

    // No trace of the removed section, its cold-start copy, or its
    // "hidden suggestions" settings route.
    expect(screen.queryByText(/worth a look/i)).toBeNull()
    expect(screen.queryByText(/worth picking up/i)).toBeNull()
    expect(screen.queryByText(/hidden suggestions/i)).toBeNull()
    expect(document.querySelector('a[href="/settings/hidden"]')).toBeNull()

    // The only data call HomePage makes through the snapshot layer is the
    // one snapshot fetch.
    expect(getWeeklySnapshotMock).toHaveBeenCalledTimes(1)

    // And underneath any data layer, the shared Supabase client never
    // queries `worth_picking_up_candidates` — this holds regardless of
    // whether a reintroduced caller crashes, throws, or resolves cleanly,
    // because it inspects the fake client's own call log rather than
    // relying on an unmocked import failing first.
    const queriedTables = fromMock.mock.calls.map(([table]) => table)
    expect(queriedTables).not.toContain('worth_picking_up_candidates')
  })
})
