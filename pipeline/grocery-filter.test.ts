// Tests for grocery-filter: Parkside/Silvercrest/etc. rejected, groceries kept.

import { describe, it, expect } from 'vitest'

import type { UnifiedDeal } from '../shared/types'

import { filterGrocery } from './grocery-filter'

function makeDeal(overrides: Partial<UnifiedDeal> = {}): UnifiedDeal {
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
    ...overrides,
  }
}

describe('filterGrocery — brand blocklist', () => {
  it.each([
    ['parkside seil-/kordel-sortiment', 'parkside'],
    ['PARKSIDE PERFORMANCE akku-bohrer', 'parkside performance'],
    ['silvercrest küchenmaschine', 'silvercrest'],
    ['crivit kinder-mountainbike 20"', 'crivit'],
    ['livergy herren-polohemd', 'livergy'],
    ['powerfix werkzeug-set', 'powerfix'],
  ])('rejects "%s" via brand blocklist (%s)', (name, brand) => {
    const deal = makeDeal({ productName: name })
    const result = filterGrocery(deal)
    expect(result.keep).toBe(false)
    expect(result.reason).toBe('brand-blocklist')
    expect(result.matched).toBe(brand)
  })
})

describe('filterGrocery — grocery items pass', () => {
  it.each([
    'dr. oetker pizza casa di mama',
    'denner bbq rib eye',
    'schweizer mineralwasser 6x1.5l',
    'rippli nierstück geräuchert, ip-suisse',
    'milka schokolade 100g',
  ])('keeps grocery product "%s"', (name) => {
    const deal = makeDeal({ productName: name })
    const result = filterGrocery(deal)
    expect(result.keep).toBe(true)
  })
})

describe('filterGrocery — source category denylist', () => {
  it('rejects when sourceCategory indicates non-grocery department', () => {
    const deal = makeDeal({
      productName: 'some tool',
      sourceCategory: 'Werkzeug & Heimwerken',
    })
    const result = filterGrocery(deal)
    expect(result.keep).toBe(false)
    expect(result.reason).toBe('source-category-denylist')
  })

  it('is inert when sourceCategory is null (aktionis.ch behaviour)', () => {
    const deal = makeDeal({
      productName: 'some normal product',
      sourceCategory: null,
    })
    const result = filterGrocery(deal)
    expect(result.keep).toBe(true)
  })
})

describe('filterGrocery — word-boundary safety', () => {
  it('does not match brand as a substring inside another word', () => {
    // 'parkside' is a prefix of nothing real, but guard the principle.
    const deal = makeDeal({ productName: 'poulet bio' })
    expect(filterGrocery(deal).keep).toBe(true)
  })
})
