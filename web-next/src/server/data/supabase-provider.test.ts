import { describe, expect, it, vi } from 'vitest'

/**
 * `getWeeklySnapshot`'s fail-soft path, tested end to end through the
 * exported provider — not just `mapRow` (map-row.test.ts already covers
 * that). Code review of 422bd51, F1: this branch used to set
 * `updatedAt: new Date().toISOString()` on a total query failure, so a
 * snapshot that failed completely read as fresh. A live Playwright run
 * against exactly that state reported green — `isDegraded` is the guard
 * these tests pin.
 */

vi.mock('@/lib/supabase/anon-server', () => ({
  createAnonClient: vi.fn(),
}))

// Wraps the real `todayInZurich` in a spy (rather than replacing it) so the
// existing no-`today`-supplied tests below keep their real default behaviour,
// while the RCA 2026-09-27 tests can assert the wall clock is NOT touched
// once a caller supplies `today` explicitly.
vi.mock('@/lib/domain/validity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/validity')>()
  return { ...actual, todayInZurich: vi.fn(actual.todayInZurich) }
})

import { createAnonClient } from '@/lib/supabase/anon-server'
import { todayInZurich } from '@/lib/domain/validity'
import { type DealRow, SELECT_COLUMNS, supabaseDealsProvider } from './supabase-provider'

type QueryResponse = { data: unknown[] | null; error: { message: string } | null }

/**
 * A chainable fake for the `deals` query only — the one path
 * `getWeeklySnapshot` exercises. Always resolves with the same response
 * regardless of `.range()` page, which is fine for these tests: the error
 * case breaks out of the paging loop on its first page (supabase-
 * provider.ts), and the success case here never has more than one page.
 */
function fakeDealsClient(response: QueryResponse, onGte?: (column: string, value: unknown) => void) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    gte: (column: string, value: unknown) => {
      onGte?.(column, value)
      return chain
    },
    order: () => chain,
    range: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable fake — the chain is `await`ed like a real Supabase query builder, so it needs its own `then`
    then(resolve: (value: QueryResponse) => void) {
      resolve(response)
    },
  }
  return chain
}

// biome-ignore lint/suspicious/noExplicitAny: fakeDealsClient stands in for the Supabase client type, not a domain type
const asSupabaseClient = (chain: unknown) => chain as any

describe('getWeeklySnapshot — the fail-soft path is marked, not disguised as fresh', () => {
  it('sets isDegraded when the deals query errors', async () => {
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: null, error: { message: 'network error' } })),
    )

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const snapshot = await supabaseDealsProvider.getWeeklySnapshot()
    spy.mockRestore()

    expect(snapshot.isDegraded).toBe(true)
    expect(snapshot.totalDeals).toBe(0)
    expect(snapshot.deals).toEqual([])
  })

  it('logs the failure — an error returned is not an error handled silently', async () => {
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: null, error: { message: 'network error' } })),
    )

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await supabaseDealsProvider.getWeeklySnapshot()

    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not mark a genuinely successful, empty result as degraded', async () => {
    // Zero rows because nothing matched the filter is not a failure — the
    // same distinction supabase-provider.ts's own `isDegraded` doc comment
    // draws: "zero deals matched" is unremarkable, a query ERROR is not.
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: [], error: null })),
    )

    const snapshot = await supabaseDealsProvider.getWeeklySnapshot()

    expect(snapshot.isDegraded).toBeUndefined()
    expect(snapshot.totalDeals).toBe(0)
  })
})

/**
 * RCA docs/rca/2026-09-27-tech-lead-stale-expired-deals.md §7 item 3 /
 * docs/rca/2026-09-27-architect-stale-expired-deals.md §6 D1: `today` must be
 * an explicit input the provider is GIVEN, never a value it reads from the
 * clock itself — that is what lets `server/data/snapshot.ts` make it part of
 * the cache key. Every active Volg deal in the incident had
 * `valid_to = '2026-09-26'`; on 2026-09-27 it must contribute zero deals and
 * drop out of the store count entirely.
 */
describe('getWeeklySnapshot — today is an explicit input, not read from the clock', () => {
  const volgRow = (validTo: string): DealRow => ({
    id: 'volg-1',
    store: 'volg',
    product_name: 'Vollrahm',
    category: 'fresh',
    category_slug: null,
    sub_category: null,
    sale_price: 1.2,
    original_price: null,
    discount_percent: 0,
    price_per_unit: null,
    canonical_unit: null,
    format: null,
    image_url: null,
    valid_from: '2026-09-20',
    valid_to: validTo,
    source_url: null,
    product_id: 'p-volg-1',
    taxonomy_confidence: 1,
    is_uncertain: false,
    storage: null,
    price_basis: null,
    loyalty_programme: null,
    page_image_url: null,
    crop_x: null,
    crop_y: null,
    crop_w: null,
    crop_h: null,
    attributes: null,
    is_active: true,
    updated_at: '2026-09-20T00:00:00Z',
  })

  it('issues .gte(valid_to, today) with the SUPPLIED today and returns it on the snapshot', async () => {
    const gteCalls: [string, unknown][] = []
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(
        fakeDealsClient({ data: [], error: null }, (column, value) =>
          gteCalls.push([column, value]),
        ),
      ),
    )

    const snapshot = await supabaseDealsProvider.getWeeklySnapshot({
      locale: 'de',
      today: '2031-06-15',
    })

    expect(gteCalls).toEqual([['valid_to', '2031-06-15']])
    expect(snapshot.today).toBe('2031-06-15')
  })

  it('does not call the wall clock (todayInZurich) when today is supplied', async () => {
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: [], error: null })),
    )
    vi.mocked(todayInZurich).mockClear()

    await supabaseDealsProvider.getWeeklySnapshot({ locale: 'de', today: '2031-06-15' })

    expect(todayInZurich).not.toHaveBeenCalled()
  })

  it('falls back to the wall clock only when today is omitted entirely', async () => {
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: [], error: null })),
    )
    vi.mocked(todayInZurich).mockClear()

    await supabaseDealsProvider.getWeeklySnapshot({ locale: 'de' })

    expect(todayInZurich).toHaveBeenCalledTimes(1)
  })

  it('a Volg deal whose valid_to is yesterday contributes 0 deals and drops out of the store count today', async () => {
    // The safety-net filter (.gte('valid_to', today)) is what actually
    // excludes it — the fake client doesn't apply .gte() itself, so this
    // fixture only has the ONE Volg row and it is filtered out at the real
    // Postgres layer in production. Here we assert the shape of the
    // response the provider builds when the filtered set is empty.
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: [], error: null })),
    )

    const snapshot = await supabaseDealsProvider.getWeeklySnapshot({
      locale: 'de',
      today: '2031-06-15',
    })

    expect(snapshot.totalDeals).toBe(0)
    const volgSummary = snapshot.stores.find((s) => s.store === 'volg')
    expect(volgSummary?.dealCount ?? 0).toBe(0)
  })

  it('a row that IS returned by the query (valid_to today or later) is included and mapped', async () => {
    vi.mocked(createAnonClient).mockReturnValue(
      asSupabaseClient(fakeDealsClient({ data: [volgRow('2031-06-15')], error: null })),
    )

    const snapshot = await supabaseDealsProvider.getWeeklySnapshot({
      locale: 'de',
      today: '2031-06-15',
    })

    expect(snapshot.totalDeals).toBe(1)
    expect(snapshot.stores.find((s) => s.store === 'volg')?.dealCount).toBe(1)
  })
})

/**
 * F4, code review of 422bd51: `SELECT_COLUMNS` is a hand-maintained,
 * unchecked string — the reviewer deleted `,min_quantity` from it by hand
 * and all 327 other tests in the suite stayed green, because nothing reads
 * `SELECT_COLUMNS` except the live Supabase client. Deleting a column here
 * means the field silently reads as `undefined` on every row, forever,
 * with no test noticing — exactly the failure mode `mapRow`'s own
 * `?? null` defaults exist to tolerate for a column that predates a
 * migration, but never for one that is simply missing from the query.
 *
 * `ALL_DEAL_ROW_KEYS` is typed `Record<keyof DealRow, true>` deliberately:
 * TypeScript itself rejects this object if it is missing a `DealRow` key or
 * carries one that no longer exists, so a future field added to `DealRow`
 * without a matching entry here fails to COMPILE, not just to pass a
 * runtime check that could be edited alongside the mistake.
 */
describe('SELECT_COLUMNS names every DealRow key', () => {
  const ALL_DEAL_ROW_KEYS: Record<keyof DealRow, true> = {
    id: true,
    store: true,
    product_name: true,
    category: true,
    category_slug: true,
    sub_category: true,
    sale_price: true,
    original_price: true,
    discount_percent: true,
    price_per_unit: true,
    canonical_unit: true,
    format: true,
    image_url: true,
    valid_from: true,
    valid_to: true,
    source_url: true,
    product_id: true,
    taxonomy_confidence: true,
    is_uncertain: true,
    storage: true,
    price_basis: true,
    loyalty_programme: true,
    page_image_url: true,
    crop_x: true,
    crop_y: true,
    crop_w: true,
    crop_h: true,
    attributes: true,
    is_active: true,
    updated_at: true,
    min_quantity: true,
  }

  const selectedColumns = new Set(SELECT_COLUMNS.split(','))

  it.each(Object.keys(ALL_DEAL_ROW_KEYS))('%s is present in SELECT_COLUMNS', (key) => {
    expect(selectedColumns.has(key)).toBe(true)
  })
})
