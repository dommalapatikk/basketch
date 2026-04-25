import { describe, expect, it } from 'vitest'

import { ACTIVE_CATEGORIES } from '@/lib/category-rules'
import type { Deal, DealCategory } from '@/lib/types'

import { computeAllVerdicts, computeCategoryVerdict, scoreStoresForCategory } from './algorithm'

const make = (
  store: Deal['store'],
  category: DealCategory,
  discountPercent: number,
  id = `${store}-${category}-${Math.random().toString(36).slice(2, 8)}`,
): Deal => ({
  id,
  store,
  productName: 'test product',
  category,
  subCategory: null,
  salePrice: 1,
  originalPrice: null,
  discountPercent,
  pricePerUnit: null,
  canonicalUnit: null,
  format: null,
  imageUrl: null,
  validFrom: '2026-04-24',
  validTo: '2026-05-01',
  sourceUrl: null,
  productId: 'p',
  taxonomyConfidence: 1,
  isActive: true,
  updatedAt: '2026-04-24T00:00:00Z',
})

const repeat = (store: Deal['store'], category: DealCategory, discount: number, n: number) =>
  Array.from({ length: n }, () => make(store, category, discount))

describe('scoreStoresForCategory', () => {
  it('groups by store and averages discount %', () => {
    const deals: Deal[] = [
      make('migros', 'fresh', 30),
      make('migros', 'fresh', 20),
      make('coop', 'fresh', 50),
      make('coop', 'longlife', 99), // wrong category — must be ignored
    ]
    const scores = scoreStoresForCategory(deals, 'fresh')
    expect(scores).toHaveLength(2)
    expect(scores[0]).toMatchObject({ store: 'coop', avgDiscountPct: 50, dealCount: 1 })
    expect(scores[1]).toMatchObject({ store: 'migros', avgDiscountPct: 25, dealCount: 2 })
  })

  it('returns [] when no deals match the category', () => {
    expect(scoreStoresForCategory([make('migros', 'fresh', 10)], 'household')).toEqual([])
  })
})

describe('computeCategoryVerdict — winner', () => {
  it('declares a winner when top beats #2 by ≥ TIE_THRESHOLD_PCT and has ≥ MIN_DEALS', () => {
    const deals = [
      ...repeat('denner', 'longlife', 35, 6),
      ...repeat('migros', 'longlife', 20, 6),
    ]
    const v = computeCategoryVerdict('longlife', scoreStoresForCategory(deals, 'longlife'))
    expect(v.state).toBe('winner')
    expect(v.winner).toBe('denner')
    expect(v.dealCount).toBe(12)
  })
})

describe('computeCategoryVerdict — tied', () => {
  it('returns tied when top and #2 are within 2pp', () => {
    const deals = [
      ...repeat('denner', 'longlife', 25, 6),
      ...repeat('migros', 'longlife', 24, 6),
    ]
    const v = computeCategoryVerdict('longlife', scoreStoresForCategory(deals, 'longlife'))
    expect(v.state).toBe('tied')
    expect(v.winner).toBeNull()
  })

  it('returns tied when top has fewer than MIN_DEALS_FOR_WINNER even if it leads', () => {
    const deals = [
      ...repeat('lidl', 'fresh', 60, 2),
      ...repeat('migros', 'fresh', 20, 30),
    ]
    const v = computeCategoryVerdict('fresh', scoreStoresForCategory(deals, 'fresh'))
    expect(v.state).toBe('tied')
    expect(v.winner).toBeNull()
  })
})

describe('computeCategoryVerdict — edge cases', () => {
  it('returns no-data when category has zero deals', () => {
    const v = computeCategoryVerdict('household', [])
    expect(v.state).toBe('no-data')
    expect(v.winner).toBeNull()
    expect(v.dealCount).toBe(0)
  })

  it('returns single-store when only one store has any deals in the category', () => {
    const deals = repeat('aldi', 'household', 40, 10)
    const v = computeCategoryVerdict('household', scoreStoresForCategory(deals, 'household'))
    expect(v.state).toBe('single-store')
    expect(v.winner).toBeNull()
  })
})

describe('computeAllVerdicts', () => {
  it('produces one verdict per active category, even when some are empty', () => {
    const deals = repeat('migros', 'fresh', 25, 6).concat(repeat('coop', 'fresh', 24, 6))
    const verdicts = computeAllVerdicts(deals, ACTIVE_CATEGORIES)
    expect(verdicts.map((v) => v.category)).toEqual(['fresh', 'longlife', 'household'])
    expect(verdicts.find((v) => v.category === 'longlife')?.state).toBe('no-data')
    expect(verdicts.find((v) => v.category === 'household')?.state).toBe('no-data')
  })
})
