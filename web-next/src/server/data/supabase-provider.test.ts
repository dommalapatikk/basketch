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

import { createAnonClient } from '@/lib/supabase/anon-server'
import { type DealRow, SELECT_COLUMNS, supabaseDealsProvider } from './supabase-provider'

type QueryResponse = { data: unknown[] | null; error: { message: string } | null }

/**
 * A chainable fake for the `deals` query only — the one path
 * `getWeeklySnapshot` exercises. Always resolves with the same response
 * regardless of `.range()` page, which is fine for these tests: the error
 * case breaks out of the paging loop on its first page (supabase-
 * provider.ts), and the success case here never has more than one page.
 */
function fakeDealsClient(response: QueryResponse) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
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
