// Tests for pipeline validation at the Python-TypeScript trust boundary.

import { describe, expect, it } from 'vitest'

import { isValidDealEntry } from './validate'

describe('isValidDealEntry', () => {
  const validDeal = {
    store: 'coop',
    productName: 'butter 250g',
    originalPrice: 4.5,
    salePrice: 2.95,
    discountPercent: 34,
    validFrom: '2026-04-07',
    validTo: '2026-04-13',
    imageUrl: 'https://example.com/img.jpg',
    sourceCategory: 'Milchprodukte',
    sourceUrl: 'https://example.com/deal',
  }

  it('accepts a valid deal', () => {
    expect(isValidDealEntry(validDeal)).toBe(true)
  })

  it('accepts a deal with null optional fields', () => {
    const deal = {
      store: 'migros',
      productName: 'milch 1l',
      salePrice: 1.5,
      validFrom: '2026-04-07',
      originalPrice: null,
      discountPercent: null,
      validTo: null,
      imageUrl: null,
      sourceCategory: null,
      sourceUrl: null,
    }
    expect(isValidDealEntry(deal)).toBe(true)
  })

  it('accepts a deal with missing optional fields', () => {
    const deal = {
      store: 'coop',
      productName: 'reis 1kg',
      salePrice: 3.0,
      validFrom: '2026-04-07',
    }
    expect(isValidDealEntry(deal)).toBe(true)
  })

  it('rejects null', () => {
    expect(isValidDealEntry(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isValidDealEntry(undefined)).toBe(false)
  })

  it('rejects a string', () => {
    expect(isValidDealEntry('not a deal')).toBe(false)
  })

  it('rejects missing store', () => {
    const deal = { ...validDeal, store: undefined }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects invalid store', () => {
    const deal = { ...validDeal, store: 'walmart' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('accepts new stores (aldi, lidl, denner, spar, volg)', () => {
    for (const store of ['aldi', 'lidl', 'denner', 'spar', 'volg']) {
      expect(isValidDealEntry({ ...validDeal, store })).toBe(true)
    }
  })

  it('rejects missing productName', () => {
    const deal = { ...validDeal, productName: undefined }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects empty productName', () => {
    const deal = { ...validDeal, productName: '' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-string productName', () => {
    const deal = { ...validDeal, productName: 123 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects missing salePrice', () => {
    const deal = { ...validDeal, salePrice: undefined }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects zero salePrice', () => {
    const deal = { ...validDeal, salePrice: 0 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects negative salePrice', () => {
    const deal = { ...validDeal, salePrice: -1 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-number salePrice', () => {
    const deal = { ...validDeal, salePrice: '2.95' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects NaN salePrice', () => {
    const deal = { ...validDeal, salePrice: NaN }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects Infinity salePrice', () => {
    const deal = { ...validDeal, salePrice: Infinity }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects missing validFrom', () => {
    const deal = { ...validDeal, validFrom: undefined }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-ISO validFrom', () => {
    const deal = { ...validDeal, validFrom: '07/04/2026' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects invalid date in validFrom', () => {
    const deal = { ...validDeal, validFrom: '2026-13-45' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-string originalPrice', () => {
    const deal = { ...validDeal, originalPrice: 'four' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects NaN originalPrice', () => {
    const deal = { ...validDeal, originalPrice: NaN }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects discountPercent above 100', () => {
    const deal = { ...validDeal, discountPercent: 150 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects negative discountPercent', () => {
    const deal = { ...validDeal, discountPercent: -10 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-number discountPercent', () => {
    const deal = { ...validDeal, discountPercent: '34%' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-ISO validTo', () => {
    const deal = { ...validDeal, validTo: 'next week' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects validTo before validFrom', () => {
    const deal = { ...validDeal, validFrom: '2026-04-13', validTo: '2026-04-07' }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects salePrice greater than originalPrice', () => {
    const deal = { ...validDeal, originalPrice: 2.0, salePrice: 3.0 }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('rejects non-string imageUrl', () => {
    const deal = { ...validDeal, imageUrl: true }
    expect(isValidDealEntry(deal)).toBe(false)
  })

  it('accepts discountPercent of 0', () => {
    const deal = { ...validDeal, discountPercent: 0 }
    expect(isValidDealEntry(deal)).toBe(true)
  })

  it('accepts equal salePrice and originalPrice', () => {
    const deal = { ...validDeal, originalPrice: 2.95, salePrice: 2.95 }
    expect(isValidDealEntry(deal)).toBe(true)
  })
})
