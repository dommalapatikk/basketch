// Tests for verdict computation logic.

import { describe, expect, it } from 'vitest'

import type { DealRow } from '@shared/types'

import { averageDiscount, computeCategoryVerdict, computeWeeklyVerdict, scoreStore } from './verdict'

function makeDeal(overrides: Partial<DealRow> = {}): DealRow {
  return {
    id: 'deal-1',
    store: 'migros',
    product_name: 'test product',
    category: 'fresh',
    original_price: 5.0,
    sale_price: 3.5,
    discount_percent: 30,
    valid_from: '2026-04-07',
    valid_to: '2026-04-13',
    image_url: null,
    source_category: null,
    source_url: null,
    is_active: true,
    fetched_at: '2026-04-10T00:00:00Z',
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    ...overrides,
  }
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
      makeDeal({ discount_percent: null }),
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
  it('returns tie when both stores have identical deals', () => {
    const migros = [makeDeal({ store: 'migros', discount_percent: 30 })]
    const coop = [makeDeal({ store: 'coop', discount_percent: 30 })]
    const verdict = computeCategoryVerdict('fresh', migros, coop)

    expect(verdict.category).toBe('fresh')
    expect(verdict.winner).toBe('tie')
    expect(verdict.migrosScore).toBe(verdict.coopScore)
  })

  it('declares migros winner when it has better deals', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 50 }),
      makeDeal({ store: 'migros', discount_percent: 40 }),
    ]
    const coop = [makeDeal({ store: 'coop', discount_percent: 10 })]
    const verdict = computeCategoryVerdict('fresh', migros, coop)

    expect(verdict.winner).toBe('migros')
    expect(verdict.migrosScore).toBeGreaterThan(verdict.coopScore)
  })

  it('declares coop winner when it has better deals', () => {
    const migros = [makeDeal({ store: 'migros', discount_percent: 10 })]
    const coop = [
      makeDeal({ store: 'coop', discount_percent: 50 }),
      makeDeal({ store: 'coop', discount_percent: 45 }),
    ]
    const verdict = computeCategoryVerdict('fresh', migros, coop)

    expect(verdict.winner).toBe('coop')
  })

  it('returns tie when both are empty', () => {
    const verdict = computeCategoryVerdict('fresh', [], [])
    expect(verdict.winner).toBe('tie')
    expect(verdict.migrosScore).toBe(0)
    expect(verdict.coopScore).toBe(0)
  })

  it('populates deal counts and avg discounts', () => {
    const migros = [
      makeDeal({ store: 'migros', discount_percent: 20 }),
      makeDeal({ store: 'migros', discount_percent: 30 }),
    ]
    const coop = [makeDeal({ store: 'coop', discount_percent: 40 })]
    const verdict = computeCategoryVerdict('long-life', migros, coop)

    expect(verdict.migrosDeals).toBe(2)
    expect(verdict.coopDeals).toBe(1)
    expect(verdict.migrosAvgDiscount).toBe(25)
    expect(verdict.coopAvgDiscount).toBe(40)
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

  it('marks freshness as current when both stores have deals', () => {
    const deals = [
      makeDeal({ store: 'migros' }),
      makeDeal({ store: 'coop' }),
    ]
    const verdict = computeWeeklyVerdict(deals, '2026-04-10')
    expect(verdict.dataFreshness).toBe('current')
  })

  it('sets weekOf and lastUpdated', () => {
    const verdict = computeWeeklyVerdict([], '2026-04-10')
    expect(verdict.weekOf).toBe('2026-04-10')
    expect(verdict.lastUpdated).toBeTruthy()
  })
})
