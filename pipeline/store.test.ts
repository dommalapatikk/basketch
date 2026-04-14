// Tests for Supabase storage: upsert batching, deactivation, pipeline run logging (mocked client).

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'

// Mock @supabase/supabase-js before importing store module
const mockSelect = vi.fn()
const mockLt = vi.fn(() => ({ select: mockSelect }))
const mockEqIsActive = vi.fn(() => ({ lt: mockLt }))
const mockUpdate = vi.fn(() => ({ eq: mockEqIsActive }))
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
const { storeDeals, logPipelineRun, deactivateExpiredDeals, normalizeProductName } = await import('./store')

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
  }
}

describe('storeDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('returns 0 for empty array', async () => {
    const count = await storeDeals([])
    expect(count).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('upserts a single batch for <= 100 deals', async () => {
    const deals = Array.from({ length: 50 }, (_, i) => makeDeal(i))
    const count = await storeDeals(deals)

    expect(count).toBe(50)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.any(Array),
      { onConflict: 'store,product_name,valid_from' },
    )
  })

  it('splits into batches of 100 for large deal sets', async () => {
    const deals = Array.from({ length: 250 }, (_, i) => makeDeal(i))
    const count = await storeDeals(deals)

    expect(count).toBe(250)
    expect(mockUpsert).toHaveBeenCalledTimes(3)
  })

  it('continues on batch error and returns partial count', async () => {
    mockUpsert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'batch 2 failed' } })
      .mockResolvedValueOnce({ error: null })

    const deals = Array.from({ length: 250 }, (_, i) => makeDeal(i))
    const count = await storeDeals(deals)

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
    mockSelect.mockResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null })

    const count = await deactivateExpiredDeals()

    expect(count).toBe(2)
    expect(mockFrom).toHaveBeenCalledWith('deals')
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false })
    expect(mockEqIsActive).toHaveBeenCalledWith('is_active', true)
    expect(mockLt).toHaveBeenCalledWith('valid_to', expect.any(String))
  })

  it('returns 0 on error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'query failed' } })

    const count = await deactivateExpiredDeals()
    expect(count).toBe(0)
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
