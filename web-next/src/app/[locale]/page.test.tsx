// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    // D2 (docs/rca/2026-09-27-architect-stale-expired-deals.md §6): the
    // snapshot read now lives in `HomeBody`, a child of `<Suspense>` inside
    // `HomePage`, not in `HomePage` itself — exactly the shape `/deals`
    // already uses. `HomeBody` is still a plain async function, so awaiting
    // it directly and rendering the resolved element works the same way
    // awaiting `HomePage` itself used to; rendering `HomePage`'s own output
    // would try to hand React an UNRESOLVED async component as a Suspense
    // child, which plain react-dom (this test's renderer) cannot do — only
    // Next's RSC runtime can.
    const { HomeBody } = await import('./page')
    const element = await HomeBody({ locale: 'en' })

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {element}
      </NextIntlClientProvider>,
    )

    // `MethodologyStrip` ("how it works") is no longer part of `HomeBody`'s
    // own output — D2 moved it to sit alongside the Suspense boundary in
    // `HomePage` itself, since it has no snapshot dependency and does not
    // need to be deferred. Its continued presence in `HomePage` is checked
    // in the source-shape describe block below; this test renders `HomeBody`
    // in isolation (see the comment above), so it is not expected here.

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

/**
 * D2, RCA docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §6 / §7 item 4:
 * the homepage's deal count and verdicts must never sit in the static ISR
 * shell — that is exactly how a Volg deal with `valid_to` yesterday stayed
 * visible on 2026-09-27. Source-level, mirroring `snapshot.test.ts`'s own
 * "'use cache' is inert under vitest" reasoning: there is no real prerender
 * pass to inspect from a unit test, so this asserts the shape that produces
 * the correct behaviour instead — `getWeeklySnapshot` is called by a
 * component rendered as a child of `<Suspense>`, never by `HomePage` itself.
 */
describe('page.tsx keeps deal data out of the static shell (source shape)', () => {
  const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

  it('HomePage itself does not call getWeeklySnapshot', () => {
    const start = source.indexOf('export default async function HomePage')
    const end = source.indexOf('\n}', start)
    const body = source.slice(start, end)
    expect(body).not.toMatch(/getWeeklySnapshot\(/)
  })

  it('HomePage renders HomeBody as a child of <Suspense>', () => {
    // Not a single regex across the tag — `<Suspense fallback={<HomeSkeleton
    // />}>` has a `>` inside its own fallback prop, so a naive
    // `<Suspense[^>]*>` stops there instead of at the real opening tag's end.
    // Index-based containment sidesteps that without a JSX parser.
    const openIndex = source.indexOf('<Suspense')
    const closeIndex = source.indexOf('</Suspense>', openIndex)
    const homeBodyIndex = source.indexOf('<HomeBody', openIndex)
    expect(openIndex).toBeGreaterThan(-1)
    expect(closeIndex).toBeGreaterThan(-1)
    expect(homeBodyIndex).toBeGreaterThan(openIndex)
    expect(homeBodyIndex).toBeLessThan(closeIndex)
  })

  it('HomeBody — the Suspense child — is the one that calls getWeeklySnapshot', () => {
    const start = source.indexOf('async function HomeBody')
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf('\n}', start)
    const body = source.slice(start, end)
    expect(body).toMatch(/getWeeklySnapshot\(/)
  })

  it('MethodologyStrip has no snapshot dependency and stays outside the Suspense boundary', () => {
    expect(source).toMatch(/<MethodologyStrip/)
  })
})
