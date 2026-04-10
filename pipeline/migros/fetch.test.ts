// Tests for Migros deal normalization and fetch logic.

import { describe, expect, it } from 'vitest'

import type { UnifiedDeal } from '../../shared/types'

import {
  calculateDiscountPercent,
  normalizeMigrosDeal,
  normalizeProductName,
} from './normalize'
import fixture from './fixtures/migros-response.json'

describe('normalizeProductName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeProductName('  Zweifel   Paprika Chips  Original   200 G '))
      .toBe('zweifel paprika chips original 200g')
  })

  it('normalises quantity patterns like "6 x 1.5 L"', () => {
    expect(normalizeProductName('Rivella Rot 6 x 1.5 L'))
      .toBe('rivella rot 6x1.5l')
  })

  it('normalises "2 x 500 ml"', () => {
    expect(normalizeProductName('Coca Cola 2 x 500 ml'))
      .toBe('coca cola 2x500ml')
  })

  it('handles already-clean names', () => {
    expect(normalizeProductName('butter 250g'))
      .toBe('butter 250g')
  })
})

describe('calculateDiscountPercent', () => {
  it('calculates correct percentage', () => {
    expect(calculateDiscountPercent(4.5, 2.95)).toBe(34)
  })

  it('returns null when original is null', () => {
    expect(calculateDiscountPercent(null, 1.95)).toBeNull()
  })

  it('returns null when sale is null', () => {
    expect(calculateDiscountPercent(4.5, null)).toBeNull()
  })

  it('returns null when sale >= original', () => {
    expect(calculateDiscountPercent(2.0, 2.5)).toBeNull()
  })

  it('returns null when original is zero', () => {
    expect(calculateDiscountPercent(0, 1.0)).toBeNull()
  })
})

describe('normalizeMigrosDeal', () => {
  it('normalizes a standard deal from fixture', () => {
    const raw = fixture.products[0]
    const deal = normalizeMigrosDeal(raw)

    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    expect(d.store).toBe('migros')
    expect(d.productName).toBe('emmi caffè latte 230ml')
    expect(d.originalPrice).toBe(1.95)
    expect(d.salePrice).toBe(1.45)
    expect(d.discountPercent).toBe(26)
    expect(d.validFrom).toBe('2026-04-07')
    expect(d.validTo).toBe('2026-04-13')
    expect(d.imageUrl).toBe('https://image.migros.ch/original/abc123.jpg')
    expect(d.sourceCategory).toBe('Milchgetränke')
    expect(d.sourceUrl).toBe('https://www.migros.ch/de/product/100100300000')
  })

  it('calculates discount when promotionPercentage is null', () => {
    const raw = fixture.products[1]
    const deal = normalizeMigrosDeal(raw)

    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    // (4.5 - 2.95) / 4.5 = 34.4% -> rounds to 34
    expect(d.discountPercent).toBe(34)
  })

  it('handles missing image gracefully', () => {
    const raw = fixture.products[2]
    const deal = normalizeMigrosDeal(raw)

    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    expect(d.imageUrl).toBeNull()
  })

  it('handles null categories', () => {
    const raw = fixture.products[2]
    const deal = normalizeMigrosDeal(raw)

    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    expect(d.sourceCategory).toBeNull()
  })

  it('handles missing productUrls', () => {
    const raw = fixture.products[2]
    const deal = normalizeMigrosDeal(raw)

    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    expect(d.sourceUrl).toBeNull()
  })

  it('handles deal with no sale price but valid original + percentage', () => {
    const raw = fixture.products[3]
    const deal = normalizeMigrosDeal(raw)

    // promotionPrice.value is null, but original is 2.6 and percentage is 20
    // effectiveSalePrice falls back to originalPrice (2.6)
    expect(deal).not.toBeNull()
    const d = deal as UnifiedDeal
    expect(d.salePrice).toBe(2.6)
    expect(d.discountPercent).toBe(20)
  })

  it('returns null for null input', () => {
    expect(normalizeMigrosDeal(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(normalizeMigrosDeal(undefined)).toBeNull()
  })

  it('returns null for missing name', () => {
    expect(normalizeMigrosDeal({ offer: { price: { value: 1 } } })).toBeNull()
  })

  it('returns null for missing offer', () => {
    expect(normalizeMigrosDeal({ name: 'Test Product' })).toBeNull()
  })

  it('returns null when both prices are null', () => {
    const raw = {
      name: 'Test Product',
      offer: {
        price: { value: null },
        promotionPrice: { value: null },
        promotionPercentage: null,
      },
    }
    expect(normalizeMigrosDeal(raw)).toBeNull()
  })

  it('normalizes all fixture products without throwing', () => {
    const results = fixture.products.map(normalizeMigrosDeal)
    const validDeals = results.filter((d): d is UnifiedDeal => d !== null)

    // All 5 fixture items should produce valid deals
    expect(validDeals.length).toBe(5)
    for (const deal of validDeals) {
      expect(deal.store).toBe('migros')
      expect(typeof deal.productName).toBe('string')
      expect(deal.productName.length).toBeGreaterThan(0)
      expect(typeof deal.salePrice).toBe('number')
    }
  })
})
