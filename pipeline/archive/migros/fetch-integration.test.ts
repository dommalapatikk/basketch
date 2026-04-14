// Integration tests for fetchMigrosDeals — mocks migros-api-wrapper entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UnifiedDeal } from '../../shared/types'

// Mock migros-api-wrapper before importing fetch
vi.mock('migros-api-wrapper', () => ({
  MigrosAPI: {
    account: {
      oauth2: {
        getGuestToken: vi.fn(),
      },
    },
    products: {
      productDisplay: {
        getProductPromotionSearch: vi.fn(),
        getProductCards: vi.fn(),
      },
    },
  },
}))

// Import after mock is set up
import { MigrosAPI } from 'migros-api-wrapper'

import { fetchMigrosDeals } from './fetch'

const mockGetGuestToken = MigrosAPI.account.oauth2.getGuestToken as ReturnType<typeof vi.fn>
const mockGetPromoSearch = MigrosAPI.products.productDisplay.getProductPromotionSearch as ReturnType<typeof vi.fn>
const mockGetProductCards = MigrosAPI.products.productDisplay.getProductCards as ReturnType<typeof vi.fn>

const VALID_CARD = {
  uid: 100100300000,
  name: 'Caffè Latte',
  title: 'Emmi Caffè Latte 230ml',
  offer: {
    price: { advertisedValue: 1.95 },
    promotionPrice: { advertisedValue: 1.45 },
    badges: [{ type: 'PERCENTAGE_PROMOTION', description: '26%' }],
    promotionDateRange: { startDate: '2026-04-07', endDate: '2026-04-13' },
  },
  imageTransparent: { url: 'https://image.migros.ch/d/{stack}/abc/latte.png' },
  images: [],
  breadcrumb: [{ id: '1', name: 'Milchgetränke' }],
  productUrls: 'https://www.migros.ch/de/product/100100300000',
}

const CARD_NO_IMAGE = {
  uid: 100300500000,
  name: 'Mystery Product',
  title: 'Mystery Product 500g',
  offer: {
    price: { advertisedValue: 3.0 },
    promotionPrice: { advertisedValue: 2.0 },
    badges: [],
    promotionDateRange: { startDate: '2026-04-07', endDate: '2026-04-13' },
  },
  images: [],
  breadcrumb: [],
  productUrls: null,
}

const CARD_NULL_PRICES = {
  uid: 100400600000,
  name: 'Bad Product',
  title: 'Bad Product 100g',
  offer: {
    price: { advertisedValue: null },
    promotionPrice: { advertisedValue: null },
    badges: [],
  },
}

describe('fetchMigrosDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns deals on happy path', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [{ type: 'PRODUCT', id: 100100300000 }],
    })
    mockGetProductCards.mockResolvedValue([VALID_CARD])

    const deals = await fetchMigrosDeals()

    expect(deals).toHaveLength(1)
    expect(deals[0]!.store).toBe('migros')
    expect(deals[0]!.productName).toBe('emmi caffè latte 230ml')
    expect(deals[0]!.salePrice).toBe(1.45)
    expect(deals[0]!.originalPrice).toBe(1.95)
    expect(deals[0]!.discountPercent).toBe(26)
  })

  it('returns empty array when guest token fails', async () => {
    mockGetGuestToken.mockResolvedValue({ token: null })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deals = await fetchMigrosDeals()

    expect(deals).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to obtain guest token'),
    )
    consoleSpy.mockRestore()
  })

  it('returns empty array when getGuestToken throws', async () => {
    mockGetGuestToken.mockRejectedValue(new Error('Network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deals = await fetchMigrosDeals()

    expect(deals).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch deals'),
      'Network error',
    )
    consoleSpy.mockRestore()
  })

  it('returns empty array when promo search returns empty', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({ items: [] })

    const deals = await fetchMigrosDeals()

    expect(deals).toEqual([])
  })

  it('handles multiple pages of promo results', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })

    // First page: 100 items (full page triggers next fetch)
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      type: 'PRODUCT',
      id: 1000 + i,
    }))
    // Second page: 10 items (partial page stops pagination)
    const partialPage = Array.from({ length: 10 }, (_, i) => ({
      type: 'PRODUCT',
      id: 2000 + i,
    }))

    mockGetPromoSearch
      .mockResolvedValueOnce({ items: fullPage })
      .mockResolvedValueOnce({ items: partialPage })

    mockGetProductCards.mockResolvedValue([VALID_CARD])

    const deals = await fetchMigrosDeals()

    // Should have called promo search twice
    expect(mockGetPromoSearch).toHaveBeenCalledTimes(2)
    // Product cards fetched in batches of 50: 110 IDs = 3 batches (50+50+10)
    expect(mockGetProductCards).toHaveBeenCalledTimes(3)
    // Each batch returns 1 card from our mock
    expect(deals).toHaveLength(3)
  })

  it('calculates discountPercent from prices when badge absent', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [{ type: 'PRODUCT', id: 100300500000 }],
    })
    mockGetProductCards.mockResolvedValue([CARD_NO_IMAGE])

    const deals = await fetchMigrosDeals()

    expect(deals).toHaveLength(1)
    // (3.0 - 2.0) / 3.0 = 33.3% -> rounds to 33
    expect(deals[0]!.discountPercent).toBe(33)
    expect(deals[0]!.originalPrice).toBe(3.0)
    expect(deals[0]!.salePrice).toBe(2.0)
  })

  it('maps all fields correctly to UnifiedDeal', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [{ type: 'PRODUCT', id: 100100300000 }],
    })
    mockGetProductCards.mockResolvedValue([VALID_CARD])

    const deals = await fetchMigrosDeals()
    const deal = deals[0] as UnifiedDeal

    expect(deal.store).toBe('migros')
    expect(deal.productName).toBe('emmi caffè latte 230ml')
    expect(deal.originalPrice).toBe(1.95)
    expect(deal.salePrice).toBe(1.45)
    expect(deal.discountPercent).toBe(26)
    expect(deal.validFrom).toBe('2026-04-07')
    expect(deal.validTo).toBe('2026-04-13')
    expect(deal.imageUrl).toBe('https://image.migros.ch/d/original/abc/latte.png')
    expect(deal.sourceCategory).toBe('Milchgetränke')
    expect(deal.sourceUrl).toBe('https://www.migros.ch/de/product/100100300000')
  })

  it('skips items with null prices', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [
        { type: 'PRODUCT', id: 100100300000 },
        { type: 'PRODUCT', id: 100400600000 },
      ],
    })
    mockGetProductCards.mockResolvedValue([VALID_CARD, CARD_NULL_PRICES])

    const deals = await fetchMigrosDeals()

    // Only the valid card should produce a deal
    expect(deals).toHaveLength(1)
    expect(deals[0]!.productName).toBe('emmi caffè latte 230ml')
  })

  it('handles missing fields gracefully (no image, no URL, no breadcrumb)', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [{ type: 'PRODUCT', id: 100300500000 }],
    })
    mockGetProductCards.mockResolvedValue([CARD_NO_IMAGE])

    const deals = await fetchMigrosDeals()

    expect(deals).toHaveLength(1)
    const deal = deals[0] as UnifiedDeal
    expect(deal.imageUrl).toBeNull()
    expect(deal.sourceUrl).toBeNull()
    expect(deal.sourceCategory).toBeNull()
  })

  it('continues when a single batch fails', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })

    // 60 IDs = 2 batches (50 + 10)
    const items = Array.from({ length: 60 }, (_, i) => ({
      type: 'PRODUCT',
      id: 3000 + i,
    }))
    mockGetPromoSearch.mockResolvedValue({ items })

    // First batch fails, second succeeds
    mockGetProductCards
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce([VALID_CARD])

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deals = await fetchMigrosDeals()

    // Only the second batch's deal should be returned
    expect(deals).toHaveLength(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Batch at offset 0 failed'),
      'Timeout',
    )
    consoleSpy.mockRestore()
  })

  it('skips non-PRODUCT items from promo search', async () => {
    mockGetGuestToken.mockResolvedValue({ token: 'fake-token' })
    mockGetPromoSearch.mockResolvedValue({
      items: [
        { type: 'CATEGORY', id: 999 },
        { type: 'PRODUCT', id: 100100300000 },
        { type: 'BANNER', id: 888 },
      ],
    })
    mockGetProductCards.mockResolvedValue([VALID_CARD])

    const deals = await fetchMigrosDeals()

    // Only 1 PRODUCT ID should be fetched
    expect(mockGetProductCards).toHaveBeenCalledWith(
      { productFilter: { uids: [100100300000] } },
      { leshopch: 'fake-token' },
    )
    expect(deals).toHaveLength(1)
  })
})
