// Tests for Supabase storage: upsert batching, deactivation, pipeline run logging (mocked client).

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'

// Mock @supabase/supabase-js before importing store module.
//
// `.update()` is chained differently by each caller — deactivateExpiredDeals
// is `eq().lt().select()`, deactivateStaleForStores is now
// `eq().eq().in().lt().select()` (store.ts: item #10, 2026-09-15) — so the
// chain below is a single flexible builder rather than a fixed shape, and
// each test supplies its own chain so it can assert exactly which filters
// were applied.
type UpdateChainResult = {
  data: { id: string; store?: string }[] | null
  error: { message: string } | null
}

function createUpdateChain(result: UpdateChainResult) {
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    select: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

const mockUpdate = vi.fn()
const mockUpsert = vi.fn()
const mockInsert = vi.fn()
const mockFrom = vi.fn((table: string) => {
  if (table === 'deals') {
    return { upsert: mockUpsert, update: mockUpdate }
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
const { storeDeals, logPipelineRun, deactivateExpiredDeals, deactivateStaleForStores, normalizeProductName } =
  await import('./store')

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
          data: batch.map((r) => ({ id: 'x', store: (r as { store: string }).store })),
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
          data: batch.map((r) => ({ id: 'x', store: (r as { store: string }).store })),
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

describe('deactivateStaleForStores scopes to the publication windows this run wrote', () => {
  /**
   * ITEM #10, 2026-09-15. `deactivateStaleForStores` used to deactivate every
   * active row of a refreshed store whose `updated_at < runStart`, WHATEVER
   * its `valid_from`. Run 34833209176 fetched ALDI's, LIDL's and SPAR's NEXT
   * WEEK flyer; the sweep read "not refreshed by this run" as "withdrawn by
   * the retailer", when it meant "belongs to a publication this run never
   * touched". `Deactivated 316 stale deals (aldi=143, lidl=80, spar=69,
   * coop=19, denner=5)` left ALDI, LIDL and SPAR with 0 offers in effect.
   *
   * The fix restricts the update to `.in('valid_from', …)` — the windows
   * `sweepWindows` reports this store's WRITTEN rows actually belong to.
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a next-week flyer does not deactivate this weeks deals — run 34833209176 deactivated aldi=143, lidl=80, spar=69 and left 0 offers in effect', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }], error: null })
    mockUpdate.mockReturnValue(chain)

    // This run wrote ONLY the 17.9 window for aldi — never 08.9, the window
    // still in effect. The query must be scoped to what was actually wrote.
    const windowsByStore = new Map([['aldi', new Set(['2026-09-17'])]])
    await deactivateStaleForStores(['aldi'], new Date('2026-09-15T05:00:00Z'), windowsByStore)

    // Scoped to exactly the window this run wrote, called exactly once —
    // together these rule out 08.9 (this week) ever reaching the query.
    expect(chain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17'])
    expect(chain.in).toHaveBeenCalledTimes(1)
  })

  it('a deal that vanished from the same publication window is still swept', async () => {
    const chain = createUpdateChain({ data: [{ id: '1' }], error: null })
    mockUpdate.mockReturnValue(chain)

    const windowsByStore = new Map([['lidl', new Set(['2026-09-17'])]])
    const count = await deactivateStaleForStores(['lidl'], new Date('2026-09-15T05:00:00Z'), windowsByStore)

    expect(chain.eq).toHaveBeenCalledWith('store', 'lidl')
    expect(chain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17'])
    expect(chain.lt).toHaveBeenCalledWith('updated_at', expect.any(String))
    expect(count).toBe(1)
  })

  it('skips a store with no recorded window rather than sweeping unscoped', async () => {
    const count = await deactivateStaleForStores(['aldi'], new Date(), new Map())

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(count).toBe(0)
  })

  it('scopes each store to its own windows — one store never sweeps by another store"s window', async () => {
    const aldiChain = createUpdateChain({ data: [{ id: '1' }, { id: '2' }], error: null })
    const lidlChain = createUpdateChain({ data: [{ id: '3' }], error: null })
    mockUpdate.mockReturnValueOnce(aldiChain).mockReturnValueOnce(lidlChain)

    const windowsByStore = new Map([
      ['aldi', new Set(['2026-09-17'])],
      ['lidl', new Set(['2026-09-24'])],
    ])
    const count = await deactivateStaleForStores(['aldi', 'lidl'], new Date(), windowsByStore)

    expect(aldiChain.eq).toHaveBeenCalledWith('store', 'aldi')
    expect(aldiChain.in).toHaveBeenCalledWith('valid_from', ['2026-09-17'])
    expect(lidlChain.eq).toHaveBeenCalledWith('store', 'lidl')
    expect(lidlChain.in).toHaveBeenCalledWith('valid_from', ['2026-09-24'])
    expect(count).toBe(3)
  })

  it('returns 0 for no successful stores', async () => {
    const count = await deactivateStaleForStores([], new Date(), new Map())
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
   * That number feeds `storesSafeToSweep`, which decides which stores have
   * their un-refreshed deals switched off. Replay the real failure: every row
   * violates deals_category_check, the writer still reports 922 across seven
   * stores, every store looks sweepable, and the sweep empties a public site.
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
          data: [{ id: '1', store: 'coop' }, { id: '2', store: 'coop' }, { id: '3', store: 'denner' }],
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
    // by a CHECK constraint). windowsByStore must reflect ONLY the accepted
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

    expect(result.windowsByStore.get('aldi')).toEqual(new Set(['2026-09-09']))
    expect(result.windowsByStore.get('aldi')?.has('2026-09-16')).toBe(false)
  })
})
