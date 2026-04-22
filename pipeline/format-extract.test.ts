// Tests for format-extract: format/container detection, pack parsing,
// canonical unit derivation, and pricePerUnit correctness.

import { describe, it, expect } from 'vitest'

import type { Deal } from '../shared/types'

import { extractFormat } from './format-extract'

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    store: 'lidl',
    productName: 'test product',
    originalPrice: 10,
    salePrice: 8,
    discountPercent: 20,
    validFrom: '2026-04-22',
    validTo: '2026-04-29',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    category: 'long-life',
    subCategory: null,
    taxonomyConfidence: 0.95,
    ...overrides,
  }
}

describe('extractFormat — water band', () => {
  it('parses 6x1.5L PET pack and emits CHF/L', () => {
    const deal = makeDeal({
      productName: 'schweizer mineralwasser 6x1.5l pet',
      subCategory: 'water',
      salePrice: 2.60,
      quantityDisplay: '6 x 1.5 L',
    })
    const result = extractFormat(deal)
    expect(result.packSize).toBe(6)
    expect(result.unitVolumeMl).toBe(1500)
    expect(result.canonicalUnit).toBe('L')
    expect(result.canonicalUnitValue).toBe(9)
    expect(result.pricePerUnit).toBeCloseTo(0.29, 2)
    expect(result.container).toBe('pet')
  })

  it('parses single 1L glass bottle and classifies format=still via schema default', () => {
    const deal = makeDeal({
      productName: 'elmer schnitzwasser naturelle 1l glasflasche',
      subCategory: 'water',
      salePrice: 7.80,
      quantityDisplay: '1 Liter',
    })
    const result = extractFormat(deal)
    expect(result.packSize).toBe(1)
    expect(result.unitVolumeMl).toBe(1000)
    expect(result.canonicalUnit).toBe('L')
    expect(result.canonicalUnitValue).toBe(1)
    expect(result.pricePerUnit).toBeCloseTo(7.80, 2)
    expect(result.container).toBe('glass')
    expect(result.format).toBe('still')
  })

  it('detects sparkling format via "mit kohlensäure"', () => {
    const deal = makeDeal({
      productName: 'knutwiler blau mineralwasser mit kohlensäure 1l',
      subCategory: 'water',
      salePrice: 4.10,
    })
    const result = extractFormat(deal)
    expect(result.format).toBe('sparkling')
  })

  it('detects still format via "ohne kohlensäure" — negation beats substring', () => {
    // Regression: "kohlensäure" used to match sparkling before "ohne kohlensäure"
    // could match still. Rule order now protects this.
    const deal = makeDeal({
      productName: 'valais mineralwasser ohne kohlensäure',
      subCategory: 'water',
      salePrice: 4.50,
    })
    const result = extractFormat(deal)
    expect(result.format).toBe('still')
  })

  it('returns undefined canonical fields when volume cannot be parsed', () => {
    const deal = makeDeal({
      productName: 'mystery water product',
      subCategory: 'water',
      salePrice: 3,
    })
    const result = extractFormat(deal)
    expect(result.canonicalUnitValue).toBeUndefined()
    expect(result.pricePerUnit).toBeUndefined()
  })
})

describe('extractFormat — other categories', () => {
  it('handles 500g bread as kg', () => {
    const deal = makeDeal({
      productName: 'ruchbrot dunkel 500g',
      subCategory: 'bread',
      salePrice: 3.00,
    })
    const result = extractFormat(deal)
    expect(result.canonicalUnit).toBe('kg')
    expect(result.canonicalUnitValue).toBeCloseTo(0.5, 3)
    expect(result.pricePerUnit).toBeCloseTo(6.00, 2)
  })

  it('handles 250g coffee as 100g unit', () => {
    const deal = makeDeal({
      productName: 'lavazza crema e gusto 250g beans',
      subCategory: 'coffee',
      salePrice: 4.99,
    })
    const result = extractFormat(deal)
    expect(result.canonicalUnit).toBe('100g')
    expect(result.canonicalUnitValue).toBeCloseTo(2.5, 3)
    expect(result.pricePerUnit).toBeCloseTo(2.00, 2)
  })
})

describe('extractFormat — prefers Python quantity over regex', () => {
  it('uses quantityDisplay when present even if productName has noise', () => {
    const deal = makeDeal({
      productName: 'big bottle 12x0.5l offer',
      subCategory: 'water',
      salePrice: 6.00,
      // Python-extracted authoritative quantity
      quantityDisplay: '6 x 1.5 L',
    })
    const result = extractFormat(deal)
    expect(result.packSize).toBe(6)
    expect(result.unitVolumeMl).toBe(1500)
  })

  it('trusts authoritative quantity + quantityUnit even when productName is ambiguous', () => {
    const deal = makeDeal({
      productName: 'giant offer pack',
      subCategory: 'water',
      salePrice: 3.60,
      quantity: 9,
      quantityUnit: 'l',
      quantityDisplay: '6 x 1.5 L',
    })
    const result = extractFormat(deal)
    expect(result.canonicalUnit).toBe('L')
    expect(result.canonicalUnitValue).toBe(9)
    expect(result.packSize).toBe(6)
    expect(result.unitVolumeMl).toBe(1500)
  })

  it('falls back to productName multipack regex when no Python hint present', () => {
    const deal = makeDeal({
      productName: 'mineralwasser 12x0.5l pet',
      subCategory: 'water',
      salePrice: 5.00,
    })
    const result = extractFormat(deal)
    expect(result.packSize).toBe(12)
    expect(result.unitVolumeMl).toBe(500)
    expect(result.canonicalUnitValue).toBe(6)
  })
})
