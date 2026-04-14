// Tests for verdict computation logic.

import { describe, expect, it } from 'vitest'

import type { DealRow, Store } from '@shared/types'
import { MIN_DEALS_FOR_VERDICT } from '@shared/types'

import {
  averageDiscount,
  calculateVerdict,
  computeCategoryVerdict,
  computeWeeklyVerdict,
  scoreStore,
} from './verdict'

function makeDeal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    id: 'deal-1',
    store: 'migros',
    product_name: 'test product',
    category: 'fresh',
    sub_category: null,
    original_price: 5.0,
    sale_price: 3.5,
    discount_percent: 30,
    valid_from: '2026-04-07',
    valid_to: '2026-04-13',
    image_url: null,
    source_category: null,
    source_url: null,
    product_id: null,
    is_active: true,
    fetched_at: '2026-04-10T00:00:00Z',
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    ...overrides,
  }
}

// Helper to build a Map<Store, DealRow[]> for computeCategoryVerdict
function dealMapFromArrays(migros: DealRow[], coop: DealRow[]): Map<Store, DealRow[]> {
  const map = new Map<Store, DealRow[]>()
  map.set('migros', migros)
  map.set('coop', coop)
  return map
}

describe('averageDiscount', () => {
  it('returns 0 for empty array', () => {
    expect(averageDiscount([])).toBe(0)
  })

  it('calculates average of one deal', () => {
    expect(averageDiscount([makeDeal({ discount_percent: 40 })])).toBe(40)
  })

  it('calculates average of multiple deals', () => {
    const deals = [
      makeDeal({ discount_percent: 20 }),
      makeDeal({ discount_percent: 40 }),
      makeDeal({ discount_percent: 30 }),
    ]
    expect(averageDiscount(deals)).toBe(30)
  })

  it('rounds to nearest integer', () => {
    const deals = [
      makeDeal({ discount_percent: 10 }),
      makeDeal({ discount_percent: 15 }),
    ]
    // (10 + 15) / 2 = 12.5 -> 13
    expect(averageDiscount(deals)).toBe(13)
  })

  it('treats null discount_percent as 0', () => {
    const deals = [
      makeDeal({ discount_percent: 20 }),
      makeDeal({ discount_percent: null as unknown as number }),
    ]
    expect(averageDiscount(deals)).toBe(10)
  })
})

describe('scoreStore', () => {
  it('returns 0 for empty deals', () => {
    expect(scoreStore([], 10, 30)).toBe(0)
  })

  it('returns 100 when store has all deals and highest avg discount', () => {
    const deals = [
      makeDeal({ discount_percent: 50 }),
      makeDeal({ discount_percent: 50 }),
    ]
    expect(scoreStore(deals, 2, 50)).toBe(100)
  })

  it('scores lower when store has fewer deals than max', () => {
    const deals = [makeDeal({ discount_percent: 50 })]
    const fullScore = scoreStore(deals, 1, 50)
    const halfScore = scoreStore(deals, 2, 50)
    expect(halfScore).toBeLessThan(fullScore)
  })
})

describe('computeCategoryVerdict', () => {
  it('returns tie when both stores have identical deals (above min threshold)', () => {
    const migros = Array.from({ length: MIN_DEALS_FOR_VERDICT }, () =>
      makeDeal({ store: 'migros', discount_percent: 30 }),
    )
    const coop = Array.from({ length: MIN_DEALS_FOR_VERDICT }, () =>
      makeDeal({ store: 'coop', discount_percent: 30 }),
    )
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays(migros, coop))

    expect(verdict.category).toBe('fresh')
    expect(verdict.winner).toBe('tie')
    expect(verdict.scores['migros']).toBe(verdict.scores['coop'])
  })

  it('declares migros winner when it has better deals', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 50 }),
      makeDeal({ store: 'migros', discount_percent: 40 }),
      makeDeal({ store: 'migros', discount_percent: 45 }),
    ]
    const coop = [
      makeDeal({ store: 'coop', discount_percent: 10 }),
      makeDeal({ store: 'coop', discount_percent: 15 }),
      makeDeal({ store: 'coop', discount_percent: 12 }),
    ]
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays(migros, coop))

    expect(verdict.winner).toBe('migros')
    expect(verdict.scores['migros']!).toBeGreaterThan(verdict.scores['coop']!)
  })

  it('declares coop winner when it has better deals', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 10 }),
      makeDeal({ store: 'migros', discount_percent: 12 }),
      makeDeal({ store: 'migros', discount_percent: 11 }),
    ]
    const coop = [
      makeDeal({ store: 'coop', discount_percent: 50 }),
      makeDeal({ store: 'coop', discount_percent: 45 }),
      makeDeal({ store: 'coop', discount_percent: 48 }),
    ]
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays(migros, coop))

    expect(verdict.winner).toBe('coop')
  })

  it('returns tie with empty scores when both are empty (insufficient data)', () => {
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays([], []))
    expect(verdict.winner).toBe('tie')
    expect(Object.keys(verdict.scores)).toHaveLength(0)
  })

  it('returns tie with empty scores when below MIN_DEALS_FOR_VERDICT', () => {
    const migros = [makeDeal({ store: 'migros', discount_percent: 50 })]
    const coop = [makeDeal({ store: 'coop', discount_percent: 10 })]
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays(migros, coop))

    // Below threshold — insufficient data
    expect(verdict.winner).toBe('tie')
    expect(Object.keys(verdict.scores)).toHaveLength(0)
    // But deal counts are still populated
    expect(verdict.dealCounts['migros']).toBe(1)
    expect(verdict.dealCounts['coop']).toBe(1)
  })

  it('returns insufficient data when only one store has enough deals', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 50 }),
      makeDeal({ store: 'migros', discount_percent: 40 }),
      makeDeal({ store: 'migros', discount_percent: 45 }),
    ]
    const coop = [makeDeal({ store: 'coop', discount_percent: 10 })]
    const verdict = computeCategoryVerdict('fresh', dealMapFromArrays(migros, coop))

    expect(verdict.winner).toBe('tie')
    expect(Object.keys(verdict.scores)).toHaveLength(0)
  })

  it('populates deal counts and avg discounts', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 20 }),
      makeDeal({ store: 'migros', discount_percent: 30 }),
      makeDeal({ store: 'migros', discount_percent: 25 }),
    ]
    const coop = [
      makeDeal({ store: 'coop', discount_percent: 40 }),
      makeDeal({ store: 'coop', discount_percent: 35 }),
      makeDeal({ store: 'coop', discount_percent: 38 }),
    ]
    const verdict = computeCategoryVerdict('long-life', dealMapFromArrays(migros, coop))

    expect(verdict.dealCounts['migros']).toBe(3)
    expect(verdict.dealCounts['coop']).toBe(3)
    expect(verdict.avgDiscounts['migros']).toBe(25)
    expect(verdict.avgDiscounts['coop']).toBe(38)
  })
})

describe('computeWeeklyVerdict', () => {
  it('returns all three categories', () => {
    const verdict = computeWeeklyVerdict([], '2026-04-10')
    expect(verdict.categories).toHaveLength(3)
    expect(verdict.categories.map((c) => c.category)).toEqual([
      'fresh',
      'long-life',
      'non-food',
    ])
  })

  it('marks freshness as stale when no deals', () => {
    const verdict = computeWeeklyVerdict([], '2026-04-10')
    expect(verdict.dataFreshness).toBe('stale')
  })

  it('marks freshness as partial when only one store has deals', () => {
    const deals = [makeDeal({ store: 'migros' })]
    const verdict = computeWeeklyVerdict(deals, '2026-04-10')
    expect(verdict.dataFreshness).toBe('partial')
  })

  it('marks freshness as current when all stores have deals', () => {
    const deals = [
      makeDeal({ store: 'migros' }),
      makeDeal({ store: 'coop' }),
      makeDeal({ store: 'lidl' }),
      makeDeal({ store: 'aldi' }),
      makeDeal({ store: 'denner' }),
      makeDeal({ store: 'spar' }),
      makeDeal({ store: 'volg' }),
    ]
    const verdict = computeWeeklyVerdict(deals, '2026-04-10')
    expect(verdict.dataFreshness).toBe('current')
  })

  it('marks freshness as partial when only some stores have deals', () => {
    const deals = [
      makeDeal({ store: 'migros' }),
      makeDeal({ store: 'coop' }),
    ]
    const verdict = computeWeeklyVerdict(deals, '2026-04-10')
    expect(verdict.dataFreshness).toBe('partial')
  })

  it('sets weekOf and lastUpdated', () => {
    const verdict = computeWeeklyVerdict([], '2026-04-10')
    expect(verdict.weekOf).toBe('2026-04-10')
    expect(verdict.lastUpdated).toBeTruthy()
  })
})

describe('calculateVerdict', () => {
  it('returns a WeeklyVerdict with computed weekOf', () => {
    const verdict = calculateVerdict([])
    expect(verdict.weekOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(verdict.categories).toHaveLength(3)
  })

  it('handles real deal data', () => {
    const deals = Array.from({ length: 5 }, (_, i) =>
      makeDeal({
        id: `m-${i}`,
        store: 'migros',
        category: 'fresh',
        discount_percent: 20 + i * 5,
      }),
    ).concat(
      Array.from({ length: 4 }, (_, i) =>
        makeDeal({
          id: `c-${i}`,
          store: 'coop',
          category: 'fresh',
          discount_percent: 15 + i * 3,
        }),
      ),
    )

    const verdict = calculateVerdict(deals)
    const freshVerdict = verdict.categories.find((c) => c.category === 'fresh')!

    expect(freshVerdict.dealCounts['migros']).toBe(5)
    expect(freshVerdict.dealCounts['coop']).toBe(4)
    expect(freshVerdict.winner).toBe('migros')
  })
})
