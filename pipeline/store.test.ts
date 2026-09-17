// Tests for Supabase storage: upsert batching, deactivation, pipeline run logging (mocked client).

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'
import type { StoreSweepPlan } from './storage/domain/stale-sweep'

// Mock @supabase/supabase-js before importing store module.
//
// `.update()` is chained differently by each caller — deactivateExpiredDeals
// is `eq().lt().select()`, deactivateStaleForStores is now
// `eq().eq().gte().lte().in().lt().select()` (store.ts: item #10, F3/F4) —
// so the chain below is a single flexible builder rather than a fixed shape,
// and each test supplies its own chain so it can assert exactly which
// filters were applied.
type UpdateChainResult = {
  data: { id: string; store?: string }[] | null
  error: { message: string; details?: string; hint?: string } | null
}

function createUpdateChain(result: UpdateChainResult) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    select: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

// A `.select().eq().gte().order().range()` read chain — activeCountsByWindow
// (F1/N2). `range` is the terminal call and resolves one PAGE per
// invocation, in order, repeating the LAST page if called more times than
// pages supplied — which is what makes "a repeated page" easy to model: give
// it exactly one page and let the chain hand it back forever.
type SelectPage = {
  data: { store: string; valid_from: string }[] | null
  error: { message: string; details?: string; hint?: string } | null
  count?: number | null
}

function createSelectChain(pages: SelectPage[]) {
  let call = 0
  const chain = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => {
      const page = pages[Math.min(call, pages.length - 1)]!
      call += 1
      return Promise.resolve(page)
    }),
  }
  return chain
}

const mockUpdate = vi.fn()
const mockUpsert = vi.fn()
const mockInsert = vi.fn()
const mockSelectDeals = vi.fn()
const mockFrom = vi.fn((table: string) => {
  if (table === 'deals') {
    return { upsert: mockUpsert, update: mockUpdate, select: mockSelectDeals }
  }
  if (table === 'pipeline_runs') {
    return { insert: mockInsert }
  }
  return {}
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// Must import after mocking
const {
  storeDeals,
  logPipelineRun,
  deactivateExpiredDeals,
  deactivateStaleForStores,
  activeCountsByWindow,
  normalizeProductName,
} = await import('./store')

function makeDeal(index: number): Deal {
  return {
    store: 'migros',
    productName: `product ${index}`,
    originalPrice: 10,
    salePrice: 8,
    discountPercent: 20,
    validFrom: '2026-04-09',
    validTo: '2026-04-16',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    category: 'fresh',
    taxonomyConfidence: 0.7,
  }
}

describe('storeDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // storeDeals now chains .select(), because a count that is not read back
    // from the database is a claim rather than a measurement. The mock returns
    // one row per row submitted — a database that accepted everything.
    mockUpsert.mockImplementation((batch: unknown[]) => ({
      select: () =>
        Promise.resolve({
          data: batch.map((r) => ({
            id: 'x',
            store: (r as { store: string }).store,
            valid_from: (r as { valid_from: string }).valid_from,
          })),
          error: null,
        }),
    }))
  })

  it('returns 0 for empty array', async () => {
    const { total: count } = await storeDeals([])
    expect(count).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('upserts a single batch for <= 100 deals', async () => {
    const deals = Array.from({ length: 50 }, (_, i) => makeDeal(i))
    const { total: count } = await storeDeals(deals)

    expect(count).toBe(50)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.any(Array),
      { onConflict: 'store,product_name,valid_from' },
    )
  })

  it('splits into batches of 100 for large deal sets', async () => {
    const deals = Array.from({ length: 250 }, (_, i) => makeDeal(i))
    const { total: count } = await storeDeals(deals)

    expect(count).toBe(250)
    expect(mockUpsert).toHaveBeenCalledTimes(3)
  })

  it('continues on batch error and returns partial count', async () => {
    // Batch 2 fails outright; 1 and 3 are accepted in full. The mock models
    // the real chain — .upsert(...).select(...) — because the count now comes
    // from the rows the database hands back, not from the batch length.
    const accepted = (batch: unknown[]) => ({
      select: () =>
        Promise.resolve({
          data: batch.map((r) => ({
            id: 'x',
            store: (r as { store: string }).store,
            valid_from: (r as { valid_from: string }).valid_from,
          })),
          error: null,
        }),
    })
    mockUpsert
      .mockImplementationOnce(accepted)
      .mockImplementationOnce(() => ({
        select: () => Promise.resolve({ data: null, error: { message: 'batch 2 failed' } }),
      }))
      .mockImplementationOnce(accepted)

    const deals = Array.from({ length: 250 }, (_, i) => makeDeal(i))
    const { total: count } = await storeDeals(deals)

    // Batch 1 (100) + batch 3 (50) = 150, batch 2 failed
    expect(count).toBe(150)
    expect(mockUpsert).toHaveBeenCalledTimes(3)
  })

  it('converts Deal to snake_case row format with normalised name', async () => {
    const deals = [makeDeal(0)]
    await storeDeals(deals)

    const upsertedRows = mockUpsert.mock.calls[0]![0] as Record<string, unknown>[]
    // product name should be normalised (lowercase, trimmed)
    expect(upsertedRows[0]).toHaveProperty('product_name', 'product 0')
    expect(upsertedRows[0]).toHaveProperty('sale_price', 8)
    expect(upsertedRows[0]).toHaveProperty('is_active', true)
    expect(upsertedRows[0]).not.toHaveProperty('productName')
  })

  it('normalises product names before upsert', async () => {
    const deal: Deal = {
      ...makeDeal(0),
      productName: '  Vollmilch   1 Liter  ',
    }
    await storeDeals([deal])

    const upsertedRows = mockUpsert.mock.calls[0]![0] as Record<string, unknown>[]
    expect(upsertedRows[0]).toHaveProperty('product_name', 'vollmilch 1 l')
  })

  it('selects id, store and valid_from on every upsert — the sweep plan depends on it (F2)', async () => {
    const select = vi.fn(() => Promise.resolve({ data: [], error: null }))
    mockUpsert.mockReturnValue({ select })

    await storeDeals([makeDeal(0)])

    expect(select).toHaveBeenCalledWith('id, store, valid_from')
  })
})

describe('deactivateExpiredDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries for active deals past valid_to', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }, { id: '2' }], error: null })
    mockUpdate.mockReturnValue(chain)

    const count = await deactivateExpiredDeals()

    expect(count).toBe(2)
    expect(mockFrom).toHaveBeenCalledWith('deals')
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false })
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    expect(chain.lt).toHaveBeenCalledWith('valid_to', expect.any(String))
  })

  it('returns 0 on error', async () => {
    mockUpdate.mockReturnValue(createUpdateChain({ data: null, error: { message: 'query failed' } }))

    const count = await deactivateExpiredDeals()
    expect(count).toBe(0)
  })
})

/** Builds a StoreSweepPlan fixture, for readable test setup. */
function plan(min: string, max: string, windows: string[]): StoreSweepPlan {
  return { range: { min, max }, windows: new Set(windows) }
}

describe('deactivateStaleForStores sweeps exactly what its plan says (F3/F4)', () => {
  /**
   * ITEM #10, 2026-09-15. `deactivateStaleForStores` used to deactivate
   * every active row of a refreshed store whose `updated_at < runStart`,
   * WHATEVER its `valid_from`. Run 34833209176 fetched ALDI's, LIDL's and
   * SPAR's NEXT WEEK flyer; the sweep read "not refreshed by this run" as
   * "withdrawn by the retailer", when it meant "belongs to a publication
   * this run never touched". `Deactivated 316 stale deals (aldi=143,
   * lidl=80, spar=69, coop=19, denner=5)` left ALDI, LIDL and SPAR with 0
   * offers in effect. The fix takes a `sweepPlan` output (range + exact
   * windows, `stale-sweep.ts`) and applies it as-is — nothing is decided
   * here that wasn't already decided by the plan.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a next-week flyer does not deactivate this weeks deals — run 34833209176 deactivated aldi=143, lidl=80, spar=69 and left 0 offers in effect', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }], error: null })
    mockUpdate.mockReturnValue(chain)

    const stalePlan = new Map([['aldi', plan('2026-09-17', '2026-09-21', ['2026-09-17', '2026-09-21'])]])
    await deactivateStaleForStores(new Date('2026-09-15T05:00:00Z'), stalePlan)

    expect(chain.gte).toHaveBeenCalledWith('valid_from', '2026-09-17')
    expect(chain.lte).toHaveBeenCalledWith('valid_from', '2026-09-21')
    expect(chain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17', '2026-09-21'])
    // This week's window (08.9) must never appear anywhere in the query.
    expect(chain.gte).not.toHaveBeenCalledWith('valid_from', '2026-09-08')
    expect(chain.in).not.toHaveBeenCalledWith('valid_from', expect.arrayContaining(['2026-09-08']))
  })

  it('a deal that vanished from the same publication window is still swept', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }], error: null })
    mockUpdate.mockReturnValue(chain)

    const stalePlan = new Map([['lidl', plan('2026-09-17', '2026-09-17', ['2026-09-17'])]])
    const count = await deactivateStaleForStores(new Date('2026-09-15T05:00:00Z'), stalePlan)

    expect(chain.eq).toHaveBeenCalledWith('store', 'lidl')
    expect(chain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17'])
    expect(chain.lt).toHaveBeenCalledWith('updated_at', expect.any(String))
    expect(count).toBe(1)
  })

  it('asserts is_active=true is part of the query — a sweep must never touch an already-inactive row', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }], error: null })
    mockUpdate.mockReturnValue(chain)

    await deactivateStaleForStores(new Date(), new Map([['aldi', plan('2026-09-17', '2026-09-17', ['2026-09-17'])]]))

    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('skips a store whose plan has no sweepable windows, without querying unscoped', async () => {
    const count = await deactivateStaleForStores(
      new Date(),
      new Map([['aldi', plan('2026-09-17', '2026-09-21', [])]]),
    )

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(count).toBe(0)
  })

  it('scopes each store to its own plan — one store never sweeps by another store"s window', async () => {
    const aldiChain = createUpdateChain({ data: [{ id: '1' }, { id: '2' }], error: null })
    const lidlChain = createUpdateChain({ data: [{ id: '3' }], error: null })
    mockUpdate.mockReturnValueOnce(aldiChain).mockReturnValueOnce(lidlChain)

    const stalePlan = new Map([
      ['aldi', plan('2026-09-17', '2026-09-17', ['2026-09-17'])],
      ['lidl', plan('2026-09-24', '2026-09-24', ['2026-09-24'])],
    ])
    const count = await deactivateStaleForStores(new Date(), stalePlan)

    expect(aldiChain.eq).toHaveBeenCalledWith('store', 'aldi')
    expect(aldiChain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17'])
    expect(lidlChain.eq).toHaveBeenCalledWith('store', 'lidl')
    expect(lidlChain.in).toHaveBeenCalledWith('valid_from', ['2026-09-24'])
    expect(count).toBe(3)
  })

  it('one store"s sweep error does not abort the others', async () => {
    const failedChain = createUpdateChain({ data: null, error: { message: 'timeout' } })
    const okChain = createUpdateChain({ data: [{ id: '1' }, { id: '2' }], error: null })
    mockUpdate.mockReturnValueOnce(failedChain).mockReturnValueOnce(okChain)

    const stalePlan = new Map([
      ['aldi', plan('2026-09-17', '2026-09-17', ['2026-09-17'])],
      ['lidl', plan('2026-09-17', '2026-09-17', ['2026-09-17'])],
    ])
    const count = await deactivateStaleForStores(new Date(), stalePlan)

    expect(failedChain.eq).toHaveBeenCalledWith('store', 'aldi')
    expect(okChain.eq).toHaveBeenCalledWith('store', 'lidl')
    expect(count).toBe(2)
  })

  it('logs .details and .hint on a sweep query error, not just .message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdate.mockReturnValue(
      createUpdateChain({
        data: null,
        error: { message: 'permission denied', details: 'RLS blocked the update', hint: 'check policies' },
      }),
    )

    await deactivateStaleForStores(new Date(), new Map([['aldi', plan('2026-09-17', '2026-09-17', ['2026-09-17'])]]))

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('aldi'),
      'permission denied',
      { details: 'RLS blocked the update', hint: 'check policies' },
    )
    errorSpy.mockRestore()
  })

  it('returns 0 for an empty plan', async () => {
    const count = await deactivateStaleForStores(new Date(), new Map())
    expect(count).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('normalizeProductName', () => {
  it('lowercases the name', () => {
    expect(normalizeProductName('Vollmilch 1L')).toBe('vollmilch 1l')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeProductName('barilla   spaghetti   500g')).toBe('barilla spaghetti 500g')
  })

  it('trims whitespace', () => {
    expect(normalizeProductName('  milch 1l  ')).toBe('milch 1l')
  })

  it('collapses tabs and newlines', () => {
    expect(normalizeProductName('milch\t1l\n')).toBe('milch 1l')
  })

  it('standardises "liter" to "l"', () => {
    expect(normalizeProductName('Wasser 1.5 Liter')).toBe('wasser 1.5 l')
  })

  it('standardises "gr" to "g"', () => {
    expect(normalizeProductName('Reis 500gr')).toBe('reis 500g')
  })

  it('standardises "stk" to "stück"', () => {
    expect(normalizeProductName('Eier 6 stk')).toBe('eier 6 stück')
  })

  it('standardises "pcs" to "stück"', () => {
    expect(normalizeProductName('Weggli 10 pcs')).toBe('weggli 10 stück')
  })
})

describe('logPipelineRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('inserts a pipeline run record', async () => {
    await logPipelineRun({
      store_results: {
        migros: { status: 'success', count: 100 },
        coop: { status: 'failed', count: 0 },
      },
      total_stored: 100,
      duration_ms: 5000,
      error_log: null,
    })

    expect(mockFrom).toHaveBeenCalledWith('pipeline_runs')
    expect(mockInsert).toHaveBeenCalledWith({
      store_results: {
        migros: { status: 'success', count: 100 },
        coop: { status: 'failed', count: 0 },
      },
      total_stored: 100,
      duration_ms: 5000,
      error_log: null,
    })
  })
})

describe('storeDeals reports what the database accepted, not what it was handed', () => {
  /**
   * DEFECT #5 — the live blackout risk, 2026-09-11.
   *
   * `storedCount += batch.length` counted rows SUBMITTED. The upsert had no
   * `.select()`, so a batch every row of which the database rejected was
   * indistinguishable from one that landed.
   *
   * That number used to feed the store-level sweep guard directly; it now
   * also feeds `sweepPlan`'s share checks (`writtenByWindow`). Replay the
   * real failure: every row violates deals_category_check, the writer still
   * reports 922 across seven stores, every store looks sweepable, and the
   * sweep empties a public site.
   *
   * A guard fed a lie is not a guard. The count must come from the database.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const deal = (store: Deal['store'], name: string): Deal =>
    ({
      store,
      productName: name,
      category: 'fresh',
      subCategory: 'dairy',
      salePrice: 1.5,
      originalPrice: 2,
      discountPercent: 25,
      validFrom: '2026-09-09',
      validTo: '2026-09-15',
      imageUrl: null,
      sourceCategory: null,
      sourceUrl: null,
      taxonomyConfidence: 0.9,
    }) as Deal

  it('reports zero when the database accepted nothing', async () => {
    // PostgREST returns no error for rows it rejected via a CHECK — this is
    // exactly how `Upserted 0 of 922` looked like success for a day.
    mockUpsert.mockReturnValue({ select: () => Promise.resolve({ data: [], error: null }) })
    const result = await storeDeals([deal('coop', 'Emmi Milch')])
    expect(result.total).toBe(0)
  })

  it('reports per-store counts the sweep can be trusted with', async () => {
    mockUpsert.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [
            { id: '1', store: 'coop', valid_from: '2026-09-09' },
            { id: '2', store: 'coop', valid_from: '2026-09-09' },
            { id: '3', store: 'denner', valid_from: '2026-09-09' },
          ],
          error: null,
        }),
    })
    const result = await storeDeals([
      deal('coop', 'A'),
      deal('coop', 'B'),
      deal('denner', 'C'),
      deal('migros', 'D'),
    ])
    expect(result.byStore.get('coop')).toBe(2)
    expect(result.byStore.get('denner')).toBe(1)
    // migros was handed over and rejected — it must NOT appear.
    expect(result.byStore.get('migros')).toBeUndefined()
  })

  it('derives sweep windows from what the database WROTE, not from what was attempted', async () => {
    // Two deals attempted, in two different publication windows. The database
    // accepts only the 2026-09-09 row (the 2026-09-16 row is rejected, e.g.
    // by a CHECK constraint). writtenByWindow must reflect ONLY the accepted
    // window — feeding the sweep an attempted-not-written window is the same
    // shape of lie as defect #5 (storedByStore from `resolved`, not the DB).
    mockUpsert.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [{ id: '1', store: 'aldi', valid_from: '2026-09-09' }],
          error: null,
        }),
    })
    const result = await storeDeals([
      { ...deal('aldi', 'A'), validFrom: '2026-09-09' },
      { ...deal('aldi', 'B'), validFrom: '2026-09-16' },
    ])

    expect(result.writtenByWindow.get('aldi')).toEqual(new Map([['2026-09-09', 1]]))
  })

  it('drops an accepted row with no usable valid_from from the sweep windows, logs a WARN, but still counts it as stored (F2)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockUpsert.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [{ id: '1', store: 'aldi', valid_from: null }],
          error: null,
        }),
    })

    const result = await storeDeals([deal('aldi', 'A')])

    expect(result.writtenByWindow.get('aldi')).toBeUndefined()
    expect(result.total).toBe(1)
    expect(result.byStore.get('aldi')).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('valid_from'))
    warnSpy.mockRestore()
  })

  // WP-P7 (RCA item 2): `logStorageShortfall` (run-pipeline.ts) used to read
  // `attempted - total` as a WRITE FAILURE. A collapsed duplicate conflict
  // key was never sent to Postgres at all — it is this function's own
  // dedupe, not the database refusing anything — so folding it into the
  // same number as a genuine CHECK-constraint rejection is exactly the "48
  // failed were collapses" defect this field exists to separate out.
  it('reports a collapsed duplicate conflict key separately from a database rejection', async () => {
    // Two deals for the SAME conflict key (store + product_name + valid_from)
    // — the second collapses into the first before anything is upserted.
    mockUpsert.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [{ id: '1', store: 'coop', valid_from: '2026-09-09' }],
          error: null,
        }),
    })
    const result = await storeDeals([
      { ...deal('coop', 'Emmi Milch'), discountPercent: 10 },
      { ...deal('coop', 'Emmi Milch'), discountPercent: 25 },
    ])

    expect(result.attempted).toBe(2)
    expect(result.collapsed).toBe(1)
    expect(result.total).toBe(1)
    // attempted - collapsed - total is the genuine shortfall: here, zero.
    expect(result.attempted - result.collapsed - result.total).toBe(0)
  })

  it('reports zero collapsed when every attempted deal has its own conflict key', async () => {
    mockUpsert.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [{ id: '1', store: 'coop', valid_from: '2026-09-09' }],
          error: null,
        }),
    })
    const result = await storeDeals([deal('coop', 'Emmi Milch')])
    expect(result.collapsed).toBe(0)
  })
})

describe('activeCountsByWindow — live counts read BEFORE this run writes anything (F1/N2)', () => {
  /**
   * F1, 2026-09-15. The prior `activeDealCountByStore` called `.limit(10_000)`
   * and was read AFTER `storeDeals` — both wrong. PostgREST silently caps an
   * unpaginated read at its configured `db-max-rows` regardless of
   * `.limit()`; a store past that point looked like it had fewer live rows
   * than it really did, which is the wrong direction for a guard that exists
   * to refuse sweeping too much.
   *
   * N2, 2026-09-16 (re-review). Stopping pagination on "this page came back
   * shorter than 1000" assumes the SERVER's own cap is at least 1000. If it
   * is lower, every page looks short from page one and the loop stops having
   * silently missed rows — the identical undercount F1 exists to prevent,
   * one layer down. `{ count: 'exact' }` gives an independent total to check
   * the paginated sum against.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates active rows per store per window from a single page', async () => {
    mockSelectDeals.mockReturnValue(
      createSelectChain([
        {
          data: [
            { store: 'aldi', valid_from: '2026-09-17' },
            { store: 'aldi', valid_from: '2026-09-17' },
            { store: 'lidl', valid_from: '2026-09-17' },
          ],
          error: null,
          count: 3,
        },
      ]),
    )

    const result = await activeCountsByWindow()

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.counts.get('aldi')).toEqual(new Map([['2026-09-17', 2]]))
    expect(result.counts.get('lidl')).toEqual(new Map([['2026-09-17', 1]]))
  })

  it('a store past row 1000 is not a first run — pagination sums across pages instead of truncating', async () => {
    const page1 = Array.from({ length: 1000 }, () => ({ store: 'coop', valid_from: '2026-09-08' }))
    const page2 = Array.from({ length: 500 }, () => ({ store: 'coop', valid_from: '2026-09-08' }))
    const chain = createSelectChain([
      { data: page1, error: null, count: 1500 },
      { data: page2, error: null, count: 1500 },
    ])
    mockSelectDeals.mockReturnValue(chain)

    const result = await activeCountsByWindow()

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.counts.get('coop')?.get('2026-09-08')).toBe(1500)
    expect(chain.range).toHaveBeenCalledTimes(2)
    expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('reads in a deterministic order — pagination without one can skip or repeat rows', async () => {
    const chain = createSelectChain([{ data: [], error: null, count: 0 }])
    mockSelectDeals.mockReturnValue(chain)

    await activeCountsByWindow()

    expect(chain.order).toHaveBeenCalledWith('id')
  })

  it('an unreadable count is never a bare empty map, and logs .details/.hint', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = createSelectChain([
      { data: null, error: { message: 'connection reset', details: 'upstream closed', hint: 'retry' } },
    ])
    mockSelectDeals.mockReturnValue(chain)

    const result = await activeCountsByWindow()

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.error.message).toBe('connection reset')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('active window counts'),
      'connection reset',
      { details: 'upstream closed', hint: 'retry' },
    )
    errorSpy.mockRestore()
  })

  it('a server page cap below 1000 undercounts — the sweep guard must refuse, not permit (N2)', async () => {
    // The server's real cap is 500: every page it returns is short of the
    // 1000 we asked for, so the OLD "page shorter than requested = done"
    // rule stops after page 1 having missed 1000 rows. The independently-
    // computed `count: 'exact'` total (1500) catches the mismatch.
    const chain = createSelectChain([
      {
        data: Array.from({ length: 500 }, () => ({ store: 'coop', valid_from: '2026-09-08' })),
        error: null,
        count: 1500,
      },
    ])
    mockSelectDeals.mockReturnValue(chain)

    const result = await activeCountsByWindow()

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.error.message).toContain('1500')
  })

  it('a repeated page terminates instead of looping forever (N2)', async () => {
    // Only ONE page is supplied; createSelectChain hands it back on every
    // subsequent call, modelling a server or mock that ignores `range()`
    // and repeats the same full page forever. Without a page cap this never
    // resolves.
    const chain = createSelectChain([
      { data: Array.from({ length: 1000 }, () => ({ store: 'coop', valid_from: '2026-09-08' })), error: null, count: 999_999 },
    ])
    mockSelectDeals.mockReturnValue(chain)

    const result = await activeCountsByWindow()

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(chain.range).toHaveBeenCalledTimes(50)
  })
})
