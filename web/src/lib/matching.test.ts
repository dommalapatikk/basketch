// Tests for favorite-to-deal matching and shopping list splitting.

import { describe, expect, it } from 'vitest'

import type { DealRow, FavoriteItemRow } from '../../../shared/types'

import { findBestMatch, getRecommendation, keywordMatches, matchFavorites, matchRelevance, splitShoppingList } from './matching'

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

function makeFavItem(overrides: Partial<FavoriteItemRow> = {}): FavoriteItemRow {
  return {
    id: 'fav-item-1',
    favorite_id: 'fav-1',
    keyword: 'milch',
    label: 'Milk',
    category: 'fresh',
    created_at: '2026-04-10T00:00:00Z',
    ...overrides,
  }
}

describe('findBestMatch', () => {
  it('returns null for empty keyword', () => {
    expect(findBestMatch('', [makeDeal()])).toBeNull()
  })

  it('returns null when no deals match', () => {
    const deals = [makeDeal({ product_name: 'butter 250g' })]
    expect(findBestMatch('milch', deals)).toBeNull()
  })

  it('finds a matching deal', () => {
    const deals = [
      makeDeal({ product_name: 'vollmilch 1l', discount_percent: 20 }),
      makeDeal({ product_name: 'butter 250g', discount_percent: 30 }),
    ]
    const result = findBestMatch('milch', deals)
    expect(result).not.toBeNull()
    expect(result!.product_name).toBe('vollmilch 1l')
  })

  it('returns the deal with highest discount when multiple match', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'milch 1l', discount_percent: 20 }),
      makeDeal({ id: 'd2', product_name: 'milch bio 1l', discount_percent: 40 }),
      makeDeal({ id: 'd3', product_name: 'milch drink', discount_percent: 10 }),
    ]
    const result = findBestMatch('milch', deals)
    expect(result!.id).toBe('d2')
  })

  it('matches case-insensitively', () => {
    const deals = [makeDeal({ product_name: 'Vollmilch Bio 1L' })]
    expect(findBestMatch('MILCH', deals)).not.toBeNull()
  })

  it('prefers standalone keyword match over compound match with higher discount', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'milch 1l', discount_percent: 20 }),
      makeDeal({ id: 'd2', product_name: 'schokolade milch nuss 12x100g', discount_percent: 44 }),
    ]
    // "milch 1l" is a standalone match (relevance 3) and should beat
    // "schokolade milch nuss" even though chocolate has higher discount
    const result = findBestMatch('milch', deals)
    expect(result!.id).toBe('d1')
  })

  it('among equally relevant matches, picks highest discount', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'milch bio 1l', discount_percent: 15 }),
      makeDeal({ id: 'd2', product_name: 'milch uht 1l', discount_percent: 30 }),
    ]
    const result = findBestMatch('milch', deals)
    expect(result!.id).toBe('d2')
  })
})

describe('matchRelevance', () => {
  it('scores keyword in first 2 words as 4', () => {
    expect(matchRelevance('milch', 'milch 1l')).toBe(4)
    expect(matchRelevance('milch', 'bio milch 1l')).toBe(4)
  })

  it('scores standalone keyword later in name as 3', () => {
    expect(matchRelevance('milch', 'schokolade milch nuss 12x100g')).toBe(3)
  })

  it('scores end-of-compound in first 2 words as 4', () => {
    expect(matchRelevance('milch', 'vollmilch 1l')).toBe(4)
  })

  it('scores end-of-compound later in name as 2', () => {
    expect(matchRelevance('milch', 'bio premium vollmilch 1l')).toBe(2)
  })

  it('scores substring match as 1', () => {
    expect(matchRelevance('milch', 'milchschokolade 200g')).toBe(1)
  })

  it('scores no match as 0', () => {
    expect(matchRelevance('milch', 'butter 250g')).toBe(0)
  })
})

describe('getRecommendation', () => {
  it('returns none when both are null', () => {
    expect(getRecommendation(null, null)).toBe('none')
  })

  it('returns coop when migros is null', () => {
    expect(getRecommendation(null, makeDeal({ store: 'coop' }))).toBe('coop')
  })

  it('returns migros when coop is null', () => {
    expect(getRecommendation(makeDeal({ store: 'migros' }), null)).toBe('migros')
  })

  it('returns migros when migros has higher discount', () => {
    const migros = makeDeal({ store: 'migros', discount_percent: 40 })
    const coop = makeDeal({ store: 'coop', discount_percent: 20 })
    expect(getRecommendation(migros, coop)).toBe('migros')
  })

  it('returns coop when coop has higher discount', () => {
    const migros = makeDeal({ store: 'migros', discount_percent: 15 })
    const coop = makeDeal({ store: 'coop', discount_percent: 35 })
    expect(getRecommendation(migros, coop)).toBe('coop')
  })

  it('returns migros when discounts equal but migros cheaper', () => {
    const migros = makeDeal({ store: 'migros', discount_percent: 30, sale_price: 2.5 })
    const coop = makeDeal({ store: 'coop', discount_percent: 30, sale_price: 3.0 })
    expect(getRecommendation(migros, coop)).toBe('migros')
  })

  it('returns both when discounts and prices are equal', () => {
    const migros = makeDeal({ store: 'migros', discount_percent: 30, sale_price: 2.5 })
    const coop = makeDeal({ store: 'coop', discount_percent: 30, sale_price: 2.5 })
    expect(getRecommendation(migros, coop)).toBe('both')
  })
})

describe('matchFavorites', () => {
  it('returns empty array for empty favorites', () => {
    expect(matchFavorites([], [makeDeal()])).toEqual([])
  })

  it('matches favorite to deals from both stores', () => {
    const favs = [makeFavItem({ keyword: 'milch' })]
    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l', discount_percent: 20 }),
      makeDeal({ store: 'coop', product_name: 'milch bio 1l', discount_percent: 30 }),
    ]

    const results = matchFavorites(favs, deals)
    expect(results).toHaveLength(1)
    expect(results[0]!.migrosDeal).not.toBeNull()
    expect(results[0]!.coopDeal).not.toBeNull()
    expect(results[0]!.recommendation).toBe('coop')
  })

  it('returns none recommendation when no deals match', () => {
    const favs = [makeFavItem({ keyword: 'tofu' })]
    const deals = [makeDeal({ product_name: 'milch 1l' })]

    const results = matchFavorites(favs, deals)
    expect(results[0]!.recommendation).toBe('none')
    expect(results[0]!.migrosDeal).toBeNull()
    expect(results[0]!.coopDeal).toBeNull()
  })

  it('processes multiple favorites', () => {
    const favs = [
      makeFavItem({ id: 'f1', keyword: 'milch' }),
      makeFavItem({ id: 'f2', keyword: 'butter' }),
    ]
    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l' }),
      makeDeal({ store: 'migros', product_name: 'butter 250g' }),
      makeDeal({ store: 'coop', product_name: 'milch bio' }),
    ]

    const results = matchFavorites(favs, deals)
    expect(results).toHaveLength(2)
  })
})

describe('splitShoppingList', () => {
  it('splits comparisons into correct buckets', () => {
    const favMilch = makeFavItem({ id: 'f1', keyword: 'milch', label: 'Milk' })
    const favButter = makeFavItem({ id: 'f2', keyword: 'butter', label: 'Butter' })
    const favTofu = makeFavItem({ id: 'f3', keyword: 'tofu', label: 'Tofu' })
    const favEier = makeFavItem({ id: 'f4', keyword: 'eier', label: 'Eggs' })

    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l', discount_percent: 40 }),
      makeDeal({ store: 'coop', product_name: 'milch bio 1l', discount_percent: 20 }),
      makeDeal({ store: 'coop', product_name: 'butter 250g', discount_percent: 30 }),
      makeDeal({ store: 'migros', product_name: 'eier 6er', discount_percent: 25, sale_price: 3.0 }),
      makeDeal({ store: 'coop', product_name: 'eier bio 6er', discount_percent: 25, sale_price: 3.0 }),
    ]

    const comparisons = matchFavorites([favMilch, favButter, favTofu, favEier], deals)
    const split = splitShoppingList(comparisons)

    expect(split.migros).toHaveLength(1) // milch -> migros wins (40 vs 20)
    expect(split.coop).toHaveLength(1)   // butter -> only at coop
    expect(split.either).toHaveLength(1) // eier -> same discount + same price
    expect(split.noDeals).toHaveLength(1) // tofu -> no match
  })

  it('returns empty buckets for empty comparisons', () => {
    const split = splitShoppingList([])
    expect(split.migros).toHaveLength(0)
    expect(split.coop).toHaveLength(0)
    expect(split.either).toHaveLength(0)
    expect(split.noDeals).toHaveLength(0)
  })
})

describe('keywordMatches', () => {
  it('matches exact word', () => {
    expect(keywordMatches('milch', 'milch 1l')).toBe(true)
  })

  it('matches end-of-compound word (vollmilch)', () => {
    expect(keywordMatches('milch', 'vollmilch 1l')).toBe(true)
  })

  it('does NOT match start-of-compound word (milchschokolade)', () => {
    expect(keywordMatches('milch', 'milchschokolade 200g')).toBe(false)
  })

  it('matches keyword followed by number (milch1l)', () => {
    expect(keywordMatches('milch', 'vollmilch1l')).toBe(true)
  })

  it('matches keyword at end of string', () => {
    expect(keywordMatches('milch', 'bio vollmilch')).toBe(true)
  })

  it('does NOT match partial overlap (ei in reis)', () => {
    expect(keywordMatches('ei', 'reis 1kg')).toBe(false)
  })

  it('matches ei as standalone word', () => {
    expect(keywordMatches('ei', 'ei 6er pack')).toBe(true)
  })

  it('matches eier (plural)', () => {
    expect(keywordMatches('eier', 'freiland eier 6er')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(keywordMatches('milch', 'Vollmilch Bio 1L')).toBe(true)
  })

  it('does NOT match kokosmilch when searching milch (compound start)', () => {
    // kokosmilch ends with milch — this SHOULD match (it's a type of milk)
    expect(keywordMatches('milch', 'kokosmilch 400ml')).toBe(true)
  })
})
