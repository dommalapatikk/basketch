import { describe, expect, it } from 'vitest'

import { coldStartCandidates, inEffectCandidateRows } from './worth-picking-up'

/**
 * The defect this guards against (#10, WP-W3;
 * docs/rca/2026-09-15-final-plan.md §1.3;
 * docs/decisions/2026-09-15-in-effect-vs-upcoming.md "Open"):
 * `concept_cheapest_now` and `worth_picking_up_candidates` are materialised
 * views. A materialised view freezes `CURRENT_DATE` at REFRESH time, not at
 * read time — REFRESH runs once, at the end of every (roughly weekly)
 * pipeline run. Even with the migration's WHERE clause fixed
 * (`valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE`, evaluated AT
 * REFRESH), a row that view correctly included can have started, or expired,
 * relative to `today` by the time a real request reads it — hours or days
 * later. `inEffectCandidateRows` is the read-time re-check that catches that
 * window; these tests exist to prove it does.
 */

/** A `worth_picking_up_candidates` row shape, standing in for the real one so
 * this suite has no import-time dependency on the module's private row type. */
type FixtureRow = {
  concept_id: string
  deal_store: string
  deal_id: string
  deal_price: number
  deal_regular_price: number
  discount_percent: number
  valid_from: string
  valid_to: string
  interest_signal: string
  interest_added_at: string
}

const row = (over: Partial<FixtureRow> = {}): FixtureRow => ({
  concept_id: 'c1',
  deal_store: 'aldi',
  deal_id: 'd1',
  deal_price: 1.5,
  deal_regular_price: 2.0,
  discount_percent: 25,
  valid_from: '2026-09-10',
  valid_to: '2026-09-16',
  interest_signal: 'added',
  interest_added_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('"Worth picking up" never shows a deal that has not started', () => {
  it('excludes a row whose validFrom is after today — the run 34833209176 shape', () => {
    // ALDI/LIDL/SPAR's 17.9 flyer, refreshed into the MV on 15.9. Even a
    // materialised view refreshed AFTER this migration lands would still
    // legitimately contain this row for the two days before it starts,
    // because nothing re-runs REFRESH mid-week.
    const rows = [row({ deal_id: 'aldi-1', valid_from: '2026-09-17', valid_to: '2026-09-23' })]
    expect(inEffectCandidateRows(rows, '2026-09-15')).toEqual([])
  })

  it('keeps a row that is genuinely in effect today', () => {
    const rows = [row({ deal_id: 'coop-1', valid_from: '2026-09-10', valid_to: '2026-09-16' })]
    expect(inEffectCandidateRows(rows, '2026-09-13')).toHaveLength(1)
  })
})

describe('"Worth picking up" never shows a deal that expired since the last refresh', () => {
  it('excludes a row whose validTo is before today', () => {
    // Refreshed at end of last week's pipeline run while still valid;
    // today's request lands after valid_to without an intervening REFRESH.
    const rows = [row({ deal_id: 'migros-1', valid_from: '2026-09-01', valid_to: '2026-09-10' })]
    expect(inEffectCandidateRows(rows, '2026-09-15')).toEqual([])
  })

  it('is inclusive of the last valid day', () => {
    const rows = [row({ deal_id: 'spar-1', valid_from: '2026-09-01', valid_to: '2026-09-15' })]
    expect(inEffectCandidateRows(rows, '2026-09-15')).toHaveLength(1)
  })
})

describe('the read-time filter is what catches staleness — not the SQL alone', () => {
  it('filters even a set of rows that represent a CORRECTLY-refreshed MV', () => {
    // This fixture models the migration's WHERE clause already having run
    // successfully at REFRESH time: every row here WAS in effect the moment
    // Postgres evaluated `valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE`.
    // The two "since" rows model time having passed between that REFRESH and
    // this request — exactly the gap no SQL filter, however correct, can
    // close on its own. If this passed only because the SQL filter kept these
    // rows out already, it would prove nothing about the JS layer; it passes
    // here because `today` (2026-09-17) is later than any fixed refresh
    // instant could have accounted for.
    const refreshedCorrectly = [
      row({ deal_id: 'still-running', valid_from: '2026-09-10', valid_to: '2026-09-20' }),
      row({ deal_id: 'expired-since-refresh', valid_from: '2026-09-05', valid_to: '2026-09-16' }),
      row({
        deal_id: 'not-yet-started-when-read',
        valid_from: '2026-09-18',
        valid_to: '2026-09-25',
      }),
    ]

    const result = inEffectCandidateRows(refreshedCorrectly, '2026-09-17')

    expect(result.map((r) => r.deal_id)).toEqual(['still-running'])
  })
})

describe('mutation coverage — removing the filter is a defect', () => {
  it('a row outside the window is not silently kept (regression guard for `.filter` being dropped)', () => {
    // Documents the exact mutation verified by hand while building this WP:
    // deleting the `.filter(...)` body inside `inEffectCandidateRows` (i.e.
    // `return rows` unfiltered) turns every test in this file red, including
    // this one. See the WP-W3 report for the manual red -> green transcript —
    // there is no automated mutation-testing tool wired into this project.
    const rows = [
      row({ deal_id: 'in', valid_from: '2026-09-01', valid_to: '2026-09-30' }),
      row({ deal_id: 'not-started', valid_from: '2026-10-01', valid_to: '2026-10-10' }),
    ]
    expect(inEffectCandidateRows(rows, '2026-09-15').map((r) => r.deal_id)).toEqual(['in'])
  })
})

/**
 * `coldStartCandidates` reads `deals` directly — not a materialised view —
 * but had until this follow-up NEITHER half of the "in effect" rule: no
 * `.gte('valid_to', …)` query-level safety net at all (CLAUDE.md; every
 * other deal query in this codebase carries one) and no `isInEffect`
 * re-check. Both halves are tested independently below, because each one
 * must be able to fail on its own (mutation-tested by hand, see the WP-W3
 * follow-up report):
 *
 *   - the QUERY test is a spy: it asserts `.gte('valid_to', today)` was
 *     actually sent, since this fake does not implement real SQL filtering
 *     and a black-box "final result" assertion alone could not tell the
 *     query-level filter and the read-time filter apart — either one
 *     filtering correctly produces the same visible result.
 *   - the READ-TIME tests use rows that model the query filter having, for
 *     whatever reason, let an invalid row through — the fake does not filter
 *     by any chained call, so these only pass because `coldStartCandidates`
 *     calls `inEffectCandidateRows` itself.
 */

type DealRow = {
  id: string
  store: string
  product_name: string
  sale_price: number
  original_price: number | null
  discount_percent: number
  image_url: string | null
  sub_category: string | null
  category_slug: string | null
  valid_from: string
  valid_to: string
}

const dealRow = (over: Partial<DealRow> = {}): DealRow => ({
  id: 'd1',
  store: 'aldi',
  product_name: 'Rimuss Traubensaft 1L',
  sale_price: 1.95,
  original_price: 2.95,
  discount_percent: 34,
  image_url: null,
  sub_category: 'drinks',
  category_slug: 'drinks',
  valid_from: '2026-09-10',
  valid_to: '2026-09-16',
  ...over,
})

/**
 * A chainable fake standing in for the Supabase query builder.
 *
 * Records every chained call (a spy) and, when awaited, resolves with
 * whatever rows it was seeded with — it does NOT filter by any chained
 * `.eq`/`.gte` call. That is deliberate: a fake this dumb is what makes the
 * read-time tests below prove `coldStartCandidates` itself does the
 * filtering, not an accident of the test double being smarter than the code
 * under test.
 */
function fakeDealsClient(rows: DealRow[]) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain = {
    from(...args: unknown[]) {
      calls.push({ method: 'from', args })
      return chain
    },
    select(...args: unknown[]) {
      calls.push({ method: 'select', args })
      return chain
    },
    eq(...args: unknown[]) {
      calls.push({ method: 'eq', args })
      return chain
    },
    gte(...args: unknown[]) {
      calls.push({ method: 'gte', args })
      return chain
    },
    order(...args: unknown[]) {
      calls.push({ method: 'order', args })
      return chain
    },
    limit(...args: unknown[]) {
      calls.push({ method: 'limit', args })
      return chain
    },
    // Makes `chain` awaitable — `coldStartCandidates` does
    // `await sb.from(...)...` — without a real network round trip. This is
    // an intentional thenable, mirroring how the real Supabase query builder
    // itself is awaitable, not an accidental `.then` on a plain object.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable fake, see comment above
    then(resolve: (value: { data: DealRow[]; error: null }) => void) {
      resolve({ data: rows, error: null })
    },
  }
  return { chain, calls }
}

// biome-ignore lint/suspicious/noExplicitAny: fakeDealsClient stands in for the Supabase client type, not a domain type
const asSupabaseClient = (chain: unknown) => chain as any

describe('cold-start suggestions never include a deal outside its validity window', () => {
  it('the query carries the valid_to safety net — the defect was NO date filter at all', async () => {
    const { chain, calls } = fakeDealsClient([])

    await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(calls).toContainEqual({ method: 'gte', args: ['valid_to', '2026-09-15'] })
  })

  it('excludes an expired row even if the query filter let it through', async () => {
    const rows = [
      dealRow({ id: 'expired', valid_from: '2026-09-01', valid_to: '2026-09-10' }),
      dealRow({ id: 'ok', valid_from: '2026-09-01', valid_to: '2026-09-20' }),
    ]
    const { chain } = fakeDealsClient(rows)

    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(result.map((c) => c.conceptId)).toEqual(['ok'])
  })

  it('excludes a not-yet-started row even if the query filter let it through', async () => {
    // .gte('valid_to', today) alone cannot express this half — valid_to
    // being in the future says nothing about whether valid_from already is.
    const rows = [
      dealRow({ id: 'not-started', valid_from: '2026-09-20', valid_to: '2026-09-25' }),
      dealRow({ id: 'ok', valid_from: '2026-09-01', valid_to: '2026-09-20' }),
    ]
    const { chain } = fakeDealsClient(rows)

    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(result.map((c) => c.conceptId)).toEqual(['ok'])
  })
})
