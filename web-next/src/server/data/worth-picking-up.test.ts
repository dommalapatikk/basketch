import { describe, expect, it, vi } from 'vitest'

// Both mocked file-wide. Neither affects the `coldStartCandidates` /
// `inEffectCandidateRows` tests below — those call the exported functions
// directly with an explicit `sb`, never through `createAnonClient()`. Only
// `getWorthPickingUpCandidates` (bottom of this file) calls `createAnonClient()`
// and `cacheLife`/`cacheTag` internally, so only its tests need these.
vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}))
vi.mock('@/lib/supabase/anon-server', () => ({
  createAnonClient: vi.fn(),
}))

import { createAnonClient } from '@/lib/supabase/anon-server'
import {
  coldStartCandidates,
  getWorthPickingUpCandidates,
  inEffectCandidateRows,
} from './worth-picking-up'

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
  // Nullable, like the column itself (baseline.sql:96) — the fixture type has
  // to be able to express a row the database can actually hold.
  valid_to: string | null
  price_basis: string | null
  loyalty_programme: string | null
  min_quantity: number | null
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
  price_basis: 'everyone',
  loyalty_programme: null,
  min_quantity: null,
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

  // `deals.valid_to` is nullable (baseline.sql:96). Both callers' queries
  // already exclude NULLs (`NULL >= CURRENT_DATE` is NULL in Postgres), so
  // reaching this at all would take a schema or query change.
  //
  // Honest note on what this test does and does not prove (code review of
  // d9fd44e asked for it as a guard test): removing the explicit
  // `row.valid_to !== null &&` guard leaves it GREEN, because `isInEffect`
  // already rejects a null end date anyway — `'2026-09-15' <= null` coerces
  // to a NaN comparison, which is false. So the guard is belt-and-braces,
  // not load-bearing, and this test pins the OUTCOME rather than the line:
  // it fails if either layer ever starts treating "no end date" as
  // open-ended. An end date we do not know is not one we can honour —
  // CLAUDE.md says expire aggressively.
  it('treats a row with no end date as not in effect — an unknown end is not an open-ended one', () => {
    const rows = [row({ deal_id: 'coop-1', valid_from: '2026-09-01', valid_to: null })]
    expect(inEffectCandidateRows(rows, '2026-09-15')).toEqual([])
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
  price_basis: string | null
  loyalty_programme: string | null
  min_quantity: number | null
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
  price_basis: 'everyone',
  loyalty_programme: null,
  min_quantity: null,
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

/**
 * Architect audit, 2026-09-16: `coldStartCandidates` never selected
 * `price_basis`/`loyalty_programme`, so a member-only price reaching cold
 * start (any store's >= 30% discount, not just Coop's) would render with no
 * label — the exact CLAUDE.md rule the main deals list already enforces via
 * supabase-provider.ts's `mapRow`, one surface over. QA's own finding: the
 * live cold-start set is 100% Coop open-price today, so this was not yet
 * visible — these tests prove the wiring exists BEFORE the first real
 * member-only candidate qualifies, not after.
 */
describe('the home page never shows a member price without naming the programme (cold-start)', () => {
  it('carries a member-only price through as a labelled PriceBasis', async () => {
    const rows = [
      dealRow({ id: 'lidl-1', price_basis: 'member-only', loyalty_programme: 'Lidl Plus' }),
    ]
    const { chain } = fakeDealsClient(rows)

    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(result).toHaveLength(1)
    expect(result[0]?.priceBasis).toEqual({ kind: 'member-only', programme: 'Lidl Plus' })
  })

  it('reads an open price as everyone, never guessing a restriction', async () => {
    const { chain } = fakeDealsClient([dealRow()])
    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')
    expect(result[0]?.priceBasis).toEqual({ kind: 'everyone' })
  })

  it('drops a row whose member price names no programme, rather than showing it unlabelled', async () => {
    // The CHECK constraint on `deals` should make this unreachable — refused
    // outright here for the same reason mapRow refuses it on the main list:
    // showing it as an open price is worse than dropping it.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rows = [
      dealRow({ id: 'bad', price_basis: 'member-only', loyalty_programme: null }),
      dealRow({ id: 'ok' }),
    ]
    const { chain } = fakeDealsClient(rows)

    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(result.map((c) => c.conceptId)).toEqual(['ok'])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

/**
 * Code review of 422bd51 found the IDENTICAL gap for `min_quantity` that
 * the block above closes for `price_basis`: `coldStartCandidates` never
 * selected the column, so a Migros "ab N Stück" price could win a
 * cold-start spot and render bare on the home page the first week WP-C4's
 * pipeline lands — the same Art. 3(1)(e) UWG failure, one field over.
 */
describe('the home page never shows a multi-buy price without its condition (cold-start)', () => {
  it('carries a multi-buy minimum through unchanged', async () => {
    const rows = [dealRow({ id: 'migros-1', store: 'migros', min_quantity: 2 })]
    const { chain } = fakeDealsClient(rows)

    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')

    expect(result).toHaveLength(1)
    expect(result[0]?.minQuantity).toBe(2)
  })

  it('reads the ordinary single-item price as null', async () => {
    const { chain } = fakeDealsClient([dealRow()])
    const result = await coldStartCandidates(asSupabaseClient(chain), '2026-09-15')
    expect(result[0]?.minQuantity).toBeNull()
  })
})

/**
 * F4 (code review of 4e6211a): "the guard that ships is the one nothing
 * tests." Every test above exercises `inEffectCandidateRows` and
 * `coldStartCandidates` directly — neither proves `getWorthPickingUpCandidates`
 * itself actually calls them on the personal (MV) path. The reviewer
 * confirmed that mutating `worth-picking-up.ts` to `const inEffect = data as
 * PersonalCandidateRow[]` (deleting the read-time re-check) left all tests
 * green before this block existed. This describe block is the end-to-end
 * test that closes that gap — see the wiring counterpart in
 * `src/app/[locale]/page.test.tsx`, which closes the matching gap for
 * `page.tsx` forwarding `snapshot.today`.
 */

type TableResponse = {
  data?: unknown[] | null
  error?: { message: string } | null
  count?: number | null
}

/**
 * A fake spanning multiple tables — the personal path queries
 * `user_interest`, `worth_picking_up_candidates`, `concept` and `deals` in
 * sequence. Same "dumb, does not filter by any chained call" design as
 * `fakeDealsClient` above: keyed by table name, resolves with whatever it
 * was seeded for that table regardless of `.eq`/`.gte`/etc.
 */
function fakeMultiTableClient(responses: Record<string, TableResponse>) {
  function chainFor(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      in: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable fake, see fakeDealsClient above
      then(resolve: (v: TableResponse) => void) {
        resolve(responses[table] ?? { data: [], error: null })
      },
    }
    return chain
  }
  return { from: (table: string) => chainFor(table) }
}

describe('getWorthPickingUpCandidates — the personal path re-applies isInEffect end-to-end', () => {
  it('an expired MV row never reaches the user — falls back to cold-start', async () => {
    const client = fakeMultiTableClient({
      user_interest: { count: 5 },
      worth_picking_up_candidates: {
        data: [row({ deal_id: 'expired', valid_from: '2026-09-01', valid_to: '2026-09-10' })],
        error: null,
      },
      deals: { data: [], error: null },
    })
    vi.mocked(createAnonClient).mockReturnValue(asSupabaseClient(client))

    const result = await getWorthPickingUpCandidates({
      userEmail: 'shopper@example.ch',
      locale: 'en',
      today: '2026-09-15',
    })

    expect(result.mode).toBe('cold-start')
    expect(result.candidates.some((c) => c.conceptId === 'c1')).toBe(false)
  })

  it('an in-effect MV row does reach the user, in personal mode', async () => {
    // Sanity check the fake and the happy path aren't what's making the
    // test above pass — a fake that always fell back to cold-start would
    // make the expired-row test above pass for the wrong reason.
    const client = fakeMultiTableClient({
      user_interest: { count: 5 },
      worth_picking_up_candidates: {
        data: [row({ deal_id: 'still-running', valid_from: '2026-09-01', valid_to: '2026-09-20' })],
        error: null,
      },
      concept: { data: [{ id: 'c1', display_name: 'Rimuss Traubensaft' }], error: null },
      deals: { data: [], error: null },
    })
    vi.mocked(createAnonClient).mockReturnValue(asSupabaseClient(client))

    const result = await getWorthPickingUpCandidates({
      userEmail: 'shopper@example.ch',
      locale: 'en',
      today: '2026-09-15',
    })

    expect(result.mode).toBe('personal')
    expect(result.candidates.map((c) => c.conceptId)).toEqual(['c1'])
  })

  it('the home page never shows a member price without naming the programme (personal path)', async () => {
    const client = fakeMultiTableClient({
      user_interest: { count: 5 },
      worth_picking_up_candidates: {
        data: [
          row({
            deal_id: 'lidl-1',
            deal_store: 'lidl',
            valid_from: '2026-09-01',
            valid_to: '2026-09-20',
            price_basis: 'member-only',
            loyalty_programme: 'Lidl Plus',
          }),
        ],
        error: null,
      },
      concept: { data: [{ id: 'c1', display_name: 'Alpine milk 1L' }], error: null },
      deals: { data: [], error: null },
    })
    vi.mocked(createAnonClient).mockReturnValue(asSupabaseClient(client))

    const result = await getWorthPickingUpCandidates({
      userEmail: 'shopper@example.ch',
      locale: 'en',
      today: '2026-09-15',
    })

    expect(result.mode).toBe('personal')
    expect(result.candidates[0]?.priceBasis).toEqual({
      kind: 'member-only',
      programme: 'Lidl Plus',
    })
  })

  it('the home page never shows a multi-buy price without its condition (personal path)', async () => {
    // Code review of 422bd51: the personal path takes the minimum sale_price
    // per concept from concept_cheapest_now with no multi-buy exclusion or
    // label — the identical gap the test above closes for price_basis.
    const client = fakeMultiTableClient({
      user_interest: { count: 5 },
      worth_picking_up_candidates: {
        data: [
          row({
            deal_id: 'migros-1',
            deal_store: 'migros',
            valid_from: '2026-09-01',
            valid_to: '2026-09-20',
            min_quantity: 2,
          }),
        ],
        error: null,
      },
      concept: { data: [{ id: 'c1', display_name: 'Rindsplätzli' }], error: null },
      deals: { data: [], error: null },
    })
    vi.mocked(createAnonClient).mockReturnValue(asSupabaseClient(client))

    const result = await getWorthPickingUpCandidates({
      userEmail: 'shopper@example.ch',
      locale: 'en',
      today: '2026-09-15',
    })

    expect(result.mode).toBe('personal')
    expect(result.candidates[0]?.minQuantity).toBe(2)
  })
})
