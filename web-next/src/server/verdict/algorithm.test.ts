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
    isUncertain: false,
    storage: null,
    priceBasis: { kind: 'everyone' as const },
    crop: null,
    attributes: {},
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

describe('uncertain deals do not vote (D3)', () => {
  const uncertain = (store: Deal['store'], category: DealCategory, discount: number): Deal => ({
    ...make(store, category, discount),
    isUncertain: true,
  })

  it('excludes an uncertain deal from a store score', () => {
    const deals = [...repeat('coop', 'fresh', 10, 5), uncertain('coop', 'fresh', 90)]
    const scores = scoreStoresForCategory(deals, 'fresh')
    // The 90% deal is real, but we are not sure it is fresh. Averaging it in
    // would move Coop from 10% to 23% on a category guess.
    expect(scores[0]?.avgDiscountPct).toBe(10)
    expect(scores[0]?.dealCount).toBe(5)
  })

  it('does not let an uncertain deal hand a store the win', () => {
    const deals = [
      ...repeat('coop', 'fresh', 20, 5),
      ...repeat('migros', 'fresh', 30, 5),
      // One unverified 99% deal would otherwise flip the headline.
      uncertain('coop', 'fresh', 99),
    ]
    const verdict = computeCategoryVerdict('fresh', scoreStoresForCategory(deals, 'fresh'))
    expect(verdict.winner).toBe('migros')
  })

  it('reports no-data rather than a verdict built only from guesses', () => {
    const deals = [uncertain('coop', 'fresh', 40), uncertain('migros', 'fresh', 50)]
    const verdict = computeCategoryVerdict('fresh', scoreStoresForCategory(deals, 'fresh'))
    expect(verdict.state).toBe('no-data')
    expect(verdict.winner).toBeNull()
  })

  it('still leaves the deal itself in the list — only its vote is withheld', () => {
    // The offer is published; the price is not the uncertain part. This suite
    // covers the verdict only, so the assertion here is the negative one:
    // nothing in scoring mutates or removes the input.
    const deals = [...repeat('coop', 'fresh', 20, 5), uncertain('coop', 'fresh', 99)]
    scoreStoresForCategory(deals, 'fresh')
    expect(deals).toHaveLength(6)
  })
})
