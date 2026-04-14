// Tests for Supabase query functions.
// Mocks the Supabase client to verify query patterns.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock supabase module
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockRpc = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockOr = vi.fn()
const mockIlike = vi.fn()
const mockNot = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()

function createChain(data: unknown = [], error: unknown = null) {
  const chain: Record<string, unknown> = {}
  const terminal = { data, error, count: Array.isArray(data) ? data.length : 1 }

  for (const fn of [mockSelect, mockEq, mockIn, mockOr, mockIlike, mockNot, mockOrder, mockLimit]) {
    fn.mockReturnValue(chain)
  }
  mockSingle.mockResolvedValue(terminal)
  mockMaybeSingle.mockResolvedValue(terminal)
  mockInsert.mockReturnValue(chain)
  mockUpdate.mockReturnValue(chain)
  mockDelete.mockReturnValue(chain)

  // Make chain resolve to terminal when awaited
  chain.select = mockSelect
  chain.eq = mockEq
  chain.in = mockIn
  chain.or = mockOr
  chain.ilike = mockIlike
  chain.not = mockNot
  chain.order = mockOrder
  chain.limit = mockLimit
  chain.single = mockSingle
  chain.maybeSingle = mockMaybeSingle
  chain.insert = mockInsert
  chain.update = mockUpdate
  chain.delete = mockDelete
  chain.then = (resolve: (v: unknown) => void) => resolve(terminal)

  return chain
}

const mockFrom = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

// Must import AFTER mocking
const queries = await import('./queries')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchActiveDeals', () => {
  it('queries deals table with is_active and date filter', async () => {
    const chain = createChain([{ id: 'deal-1', store: 'migros' }])
    mockFrom.mockReturnValue(chain)

    const result = await queries.fetchActiveDeals()

    expect(mockFrom).toHaveBeenCalledWith('deals')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('is_active', true)
    expect(mockOr).toHaveBeenCalled()
    expect(result).toEqual([{ id: 'deal-1', store: 'migros' }])
  })

  it('applies store filter when provided', async () => {
    const chain = createChain([])
    mockFrom.mockReturnValue(chain)

    await queries.fetchActiveDeals({ store: 'coop' })

    expect(mockEq).toHaveBeenCalledWith('store', 'coop')
  })

  it('throws on error', async () => {
    const chain = createChain(null, { message: 'Database error' })
    mockFrom.mockReturnValue(chain)

    await expect(queries.fetchActiveDeals()).rejects.toThrow('fetchActiveDeals')
  })
})

describe('fetchDealsByCategory', () => {
  it('returns all deals for "all" category', async () => {
    const chain = createChain([{ id: 'deal-1' }])
    mockFrom.mockReturnValue(chain)

    const result = await queries.fetchDealsByCategory('all')
    expect(result).toEqual([{ id: 'deal-1' }])
  })

  it('filters by sub_category for specific browse category', async () => {
    const chain = createChain([])
    mockFrom.mockReturnValue(chain)

    await queries.fetchDealsByCategory('dairy')

    expect(mockIn).toHaveBeenCalledWith('sub_category', ['dairy', 'eggs'])
  })

  it('returns empty array for unknown category', async () => {
    const result = await queries.fetchDealsByCategory('nonexistent' as never)
    expect(result).toEqual([])
  })
})

describe('fetchBasket', () => {
  it('queries favorites table by ID and maps to Basket shape', async () => {
    const chain = createChain({
      id: 'basket-1',
      email: 'test@example.com',
      created_at: '2026-04-10',
      updated_at: '2026-04-10',
    })
    mockFrom.mockReturnValue(chain)

    const result = await queries.fetchBasket('basket-1')

    expect(mockFrom).toHaveBeenCalledWith('favorites')
    expect(result.id).toBe('basket-1')
    expect(result.email).toBe('test@example.com')
    expect(result.createdAt).toBe('2026-04-10')
  })
})

describe('createBasket', () => {
  it('inserts into favorites table', async () => {
    const chain = createChain({
      id: 'new-basket',
      email: null,
      created_at: '2026-04-10',
      updated_at: '2026-04-10',
    })
    mockFrom.mockReturnValue(chain)

    const result = await queries.createBasket()

    expect(mockFrom).toHaveBeenCalledWith('favorites')
    expect(mockInsert).toHaveBeenCalled()
    expect(result.id).toBe('new-basket')
  })

  it('passes email when provided', async () => {
    const chain = createChain({
      id: 'new-basket',
      email: 'user@test.com',
      created_at: '2026-04-10',
      updated_at: '2026-04-10',
    })
    mockFrom.mockReturnValue(chain)

    const result = await queries.createBasket('user@test.com')
    expect(result.email).toBe('user@test.com')
  })
})

describe('removeBasketItem', () => {
  it('deletes from favorite_items by ID', async () => {
    const chain = createChain(null, null)
    mockFrom.mockReturnValue(chain)

    await queries.removeBasketItem('item-1')

    expect(mockFrom).toHaveBeenCalledWith('favorite_items')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'item-1')
  })
})

describe('lookupBasketByEmail', () => {
  it('calls RPC with email and returns basket', async () => {
    mockRpc.mockResolvedValue({ data: 'basket-id', error: null })
    // Mock fetchBasket chain
    const chain = createChain({
      id: 'basket-id',
      email: 'test@test.com',
      created_at: '2026-04-10',
      updated_at: '2026-04-10',
    })
    mockFrom.mockReturnValue(chain)

    const result = await queries.lookupBasketByEmail('test@test.com')

    expect(mockRpc).toHaveBeenCalledWith('lookup_favorite_by_email', { lookup_email: 'test@test.com' })
    expect(result?.id).toBe('basket-id')
  })

  it('returns null when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const result = await queries.lookupBasketByEmail('missing@test.com')
    expect(result).toBeNull()
  })
})

describe('fetchLatestPipelineRun', () => {
  it('queries pipeline_runs ordered by run_at desc', async () => {
    const chain = createChain({
      id: 'run-1',
      run_at: '2026-04-10',
      store_results: { migros: { status: 'success', count: 50 }, coop: { status: 'success', count: 40 } },
    })
    mockFrom.mockReturnValue(chain)

    const result = await queries.fetchLatestPipelineRun()

    expect(mockFrom).toHaveBeenCalledWith('pipeline_runs')
    expect(mockOrder).toHaveBeenCalledWith('run_at', { ascending: false })
    expect(result).toBeTruthy()
  })

  it('returns null on error', async () => {
    const chain = createChain(null, { message: 'error' })
    mockFrom.mockReturnValue(chain)

    const result = await queries.fetchLatestPipelineRun()
    expect(result).toBeNull()
  })
})
