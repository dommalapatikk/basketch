// Tests for v4 deal-format helpers: CHF/L rendering and format-aware delta.

import { describe, it, expect } from 'vitest'

import type { BandDeal } from '../components/SubCategoryBand'

import { deltaVsHero, formatChf, formatPackDescriptor, formatPerUnit } from './deal-format'

function makeBandDeal(overrides: Partial<BandDeal> = {}): BandDeal {
  return {
    id: 'd1',
    store: 'lidl',
    productName: 'test',
    salePrice: 2.6,
    regularPrice: 3.65,
    discountPercent: 28,
    hasPromo: true,
    ...overrides,
  }
}

describe('formatChf', () => {
  it('prints two decimals with CHF prefix', () => {
    expect(formatChf(2.6)).toBe('CHF 2.60')
    expect(formatChf(0.29)).toBe('CHF 0.29')
  })
})

describe('formatPerUnit', () => {
  it('renders CHF X.XX / L for liquids', () => {
    expect(formatPerUnit(0.29, 'L')).toBe('CHF 0.29 / L')
  })
  it('renders CHF X.XX / 100g for coffee', () => {
    expect(formatPerUnit(2.0, '100g')).toBe('CHF 2.00 / 100g')
  })
  it('returns null when fields missing', () => {
    expect(formatPerUnit(undefined, 'L')).toBeNull()
    expect(formatPerUnit(0.29, undefined)).toBeNull()
  })
})

describe('formatPackDescriptor', () => {
  it('describes a 6x1.5L still pack', () => {
    const d = makeBandDeal({
      format: 'still',
      packSize: 6,
      unitVolumeMl: 1500,
      canonicalUnit: 'L',
      pricePerUnit: 0.29,
    })
    expect(formatPackDescriptor(d)).toBe('Still · 6 × 1.5 L · 9 L')
  })

  it('describes a single 1L bottle without pack multiplier', () => {
    const d = makeBandDeal({
      format: 'sparkling',
      packSize: 1,
      unitVolumeMl: 1000,
      canonicalUnit: 'L',
      pricePerUnit: 4.1,
    })
    expect(formatPackDescriptor(d)).toBe('Sparkling · 1 L')
  })

  it('returns empty string when nothing is derivable', () => {
    const d = makeBandDeal({})
    expect(formatPackDescriptor(d)).toBe('')
  })
})

describe('deltaVsHero', () => {
  const hero = makeBandDeal({
    id: 'hero',
    pricePerUnit: 0.29,
    canonicalUnit: 'L',
    format: 'still',
  })

  it('emits +CHF X.XX / L when same format and more expensive', () => {
    const row = makeBandDeal({
      id: 'row',
      pricePerUnit: 1.97,
      canonicalUnit: 'L',
      format: 'still',
    })
    expect(deltaVsHero(row, hero)).toEqual({ text: '+CHF 1.68 / L', sameFormat: true })
  })

  it('emits warning (no numeric delta) when format differs', () => {
    const row = makeBandDeal({
      id: 'row',
      pricePerUnit: 4.1,
      canonicalUnit: 'L',
      format: 'sparkling',
    })
    const result = deltaVsHero(row, hero)
    expect(result?.sameFormat).toBe(false)
    expect(result?.text).toBe('⚠ Different format — not comparable')
  })

  it('returns null when hero has no per-unit price', () => {
    const bareHero = makeBandDeal({ id: 'bare' })
    expect(deltaVsHero(makeBandDeal(), bareHero)).toBeNull()
  })

  it('returns null when row has no per-unit price and format matches', () => {
    const row = makeBandDeal({ id: 'row', format: 'still' })
    expect(deltaVsHero(row, hero)).toBeNull()
  })
})
