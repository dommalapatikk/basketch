// Tests for product resolution: find existing, create new, batch handling (mocked Supabase).

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Deal } from '../shared/types'

// Build a chainable mock that tracks the query
const mockSelectEqResult = vi.fn()
const mockUpsertSelectResult = vi.fn()

const mockUpdateEqResult = vi.fn().mockResolvedValue({ error: null })

const mockFrom = vi.fn((_table: string) => ({
  // For: .select(...).eq(...)
  select: vi.fn(() => ({
    eq: mockSelectEqResult,
  })),
  // For: .upsert(...).select(...)
  upsert: vi.fn(() => ({
    select: mockUpsertSelectResult,
  })),
  // For: .update(...).eq(...)
  update: vi.fn(() => ({
    eq: mockUpdateEqResult,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// Mock product-group-assign to avoid needing all group rules
vi.mock('./product-group-assign', () => ({
  assignProductGroup: () => null,
}))

const { resolveProducts } = await import('./product-resolve')

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    store: 'migros',
    productName: 'Vollmilch 1L',
    originalPrice: 1.95,
    salePrice: 1.5,
    discountPercent: 23,
    validFrom: '2026-04-09',
    validTo: '2026-04-16',
    imageUrl: null,
    sourceCategory: 'Milch',
    sourceUrl: null,
    category: 'fresh',
    subCategory: 'dairy',
    taxonomyConfidence: 0.7,
    ...overrides,
  }
}

describe('resolveProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty map for empty deals array', async () => {
    const result = await resolveProducts([], 'migros')
    expect(result.size).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('matches existing products by source_name', async () => {
    mockSelectEqResult.mockResolvedValueOnce({
      data: [
        { id: 'prod-1', source_name: 'Vollmilch 1L', product_group: 'milk-whole-1l' },
      ],
      error: null,
    })

    const deals = [makeDeal({ productName: 'Vollmilch 1L' })]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(1)
    expect(result.get('Vollmilch 1L')).toEqual({
      productId: 'prod-1',
      productGroup: 'milk-whole-1l',
    })
  })

  it('creates new products for unmatched deals', async () => {
    // Fetch returns no existing products
    mockSelectEqResult.mockResolvedValueOnce({ data: [], error: null })
    // Upsert returns new product
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'new-prod-1', source_name: 'Pouletbrust 500g', product_group: null }],
      error: null,
    })

    const deals = [makeDeal({ productName: 'Pouletbrust 500g', category: 'fresh', subCategory: 'poultry' })]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(1)
    expect(result.get('Pouletbrust 500g')?.productId).toBe('new-prod-1')
  })

  it('handles fetch error gracefully', async () => {
    mockSelectEqResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    })

    const deals = [makeDeal()]
    const result = await resolveProducts(deals, 'migros')

    expect(result.size).toBe(0)
  })

  it('handles insert error gracefully and continues', async () => {
    mockSelectEqResult.mockResolvedValueOnce({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert failed' },
    })

    const deals = [makeDeal()]
    const result = await resolveProducts(deals, 'migros')

    // Failed to insert, so no products resolved from insert
    expect(result.size).toBe(0)
  })

  it('deduplicates by source_name in a single run', async () => {
    mockSelectEqResult.mockResolvedValueOnce({ data: [], error: null })
    mockUpsertSelectResult.mockResolvedValueOnce({
      data: [{ id: 'deduped-1', source_name: 'Vollmilch 1L', product_group: null }],
      error: null,
    })

    // Same product name appears twice in deals
    const deals = [
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-04-09' }),
      makeDeal({ productName: 'Vollmilch 1L', validFrom: '2026-04-16' }),
    ]
    const result = await resolveProducts(deals, 'migros')

    // Both deals map to the same product
    expect(result.size).toBe(1)
    expect(result.get('Vollmilch 1L')?.productId).toBe('deduped-1')
  })
})
