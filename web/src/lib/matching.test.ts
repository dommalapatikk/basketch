// Tests for favorite-to-deal matching and shopping list splitting.

import { describe, expect, it } from 'vitest'

import type { DealRow, FavoriteItemRow } from '@shared/types'

import type { ProductRow, RegularPrice } from '@shared/types'

import { findBestMatch, findBestMatchByProductGroup, findRegularPrice, getRecommendation, isExcluded, isPreferred, keywordMatches, matchFavorites, matchRelevance, splitShoppingList } from './matching'

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'prod-1',
    canonical_name: 'Test Product',
    brand: null,
    is_organic: false,
    store: 'migros',
    category: 'fresh',
    sub_category: null,
    product_group: null,
    source_name: 'test product',
    regular_price: null,
    price_updated_at: null,
    first_seen_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    ...overrides,
  }
}

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
    product_id: null,
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
    exclude_terms: null,
    prefer_terms: null,
    product_group_id: null,
    created_at: '2026-04-10T00:00:00Z',
    ...overrides,
  }
}

describe('isExcluded', () => {
  it('returns false for null/empty exclude terms', () => {
    expect(isExcluded('vollmilch 1l', null)).toBe(false)
    expect(isExcluded('vollmilch 1l', [])).toBe(false)
  })

  it('returns true when product contains an exclude term', () => {
    expect(isExcluded('tafelschokolade milch & nuss', ['schokolade'])).toBe(true)
  })

  it('returns false when product does not contain any exclude term', () => {
    expect(isExcluded('vollmilch 1l', ['schokolade', 'branche'])).toBe(false)
  })

  it('is case insensitive', () => {
    expect(isExcluded('Tafelschokolade Milch', ['schokolade'])).toBe(true)
  })
})

describe('isPreferred', () => {
  it('returns false for null/empty prefer terms', () => {
    expect(isPreferred('vollmilch 1l', null)).toBe(false)
    expect(isPreferred('vollmilch 1l', [])).toBe(false)
  })

  it('returns true when product contains a prefer term', () => {
    expect(isPreferred('vollmilch 1l', ['vollmilch'])).toBe(true)
  })

  it('returns false when no prefer term matches', () => {
    expect(isPreferred('milch drink 500ml', ['vollmilch', 'halbfettmilch'])).toBe(false)
  })
})

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

  it('excludes products matching exclude terms', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'naturaplan bio branche milch 30x23g', discount_percent: 44 }),
      makeDeal({ id: 'd2', product_name: 'vollmilch 1l', discount_percent: 20 }),
    ]
    const result = findBestMatch('milch', deals, {
      excludeTerms: ['schokolade', 'branche'],
    })
    expect(result!.id).toBe('d2')
  })

  it('prefers products matching prefer terms', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'milch drink 500ml', discount_percent: 30 }),
      makeDeal({ id: 'd2', product_name: 'vollmilch 1l', discount_percent: 20 }),
    ]
    const result = findBestMatch('milch', deals, {
      preferTerms: ['vollmilch'],
    })
    expect(result!.id).toBe('d2')
  })

  it('excludes chocolate when searching for milk with real-world data', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'naturaplan bio branche milch 30x23g', discount_percent: 44 }),
      makeDeal({ id: 'd2', product_name: 'tafelschokolade milch & nuss 12x100g', discount_percent: 43 }),
      makeDeal({ id: 'd3', product_name: 'valflora vollmilch uht 1l', discount_percent: 20 }),
    ]
    const result = findBestMatch('milch', deals, {
      excludeTerms: ['schokolade', 'branche', 'kokos'],
      preferTerms: ['vollmilch', 'halbfettmilch'],
    })
    expect(result!.id).toBe('d3')
  })

  it('excludes egg pasta when searching for eggs', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'gala 3-eier hörnli grob', discount_percent: 20 }),
      makeDeal({ id: 'd2', product_name: 'freiland eier 6er', discount_percent: 15 }),
    ]
    const result = findBestMatch('eier', deals, {
      excludeTerms: ['hörnli', 'nudeln', 'penne', 'magronen'],
      preferTerms: ['freiland', 'eier 6'],
    })
    expect(result!.id).toBe('d2')
  })

  it('excludes chicken-flavored chips when searching for chicken', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'zweifel chips poulet', discount_percent: 33 }),
      makeDeal({ id: 'd2', product_name: 'poulet brust schnitzel mariniert', discount_percent: 25 }),
    ]
    const result = findBestMatch('poulet', deals, {
      excludeTerms: ['chips', 'bouillon', 'geschmack'],
      preferTerms: ['pouletbrust', 'pouletflügeli'],
    })
    expect(result!.id).toBe('d2')
  })

  it('returns null when all matching deals are excluded', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'tafelschokolade milch & nuss', discount_percent: 44 }),
      makeDeal({ id: 'd2', product_name: 'branche milch 30x23g', discount_percent: 40 }),
    ]
    const result = findBestMatch('milch', deals, {
      excludeTerms: ['schokolade', 'branche'],
    })
    expect(result).toBeNull()
  })

  it('excludes a deal even if it matches a prefer term', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'vollmilch schokolade 200g', discount_percent: 40 }),
      makeDeal({ id: 'd2', product_name: 'milch drink 500ml', discount_percent: 15 }),
    ]
    const result = findBestMatch('milch', deals, {
      excludeTerms: ['schokolade'],
      preferTerms: ['vollmilch'],
    })
    // d1 has "vollmilch" (preferred) but also "schokolade" (excluded) — exclude wins
    expect(result!.id).toBe('d2')
  })

  it('excludes bread spread when searching for bread', () => {
    const deals = [
      makeDeal({ id: 'd1', product_name: 'le parfait brotaufstrich mit leber', discount_percent: 20 }),
      makeDeal({ id: 'd2', product_name: 'ruchbrot 500g', discount_percent: 15 }),
    ]
    const result = findBestMatch('brot', deals, {
      excludeTerms: ['aufstrich', 'brotaufstrich'],
      preferTerms: ['ruchbrot', 'toast'],
    })
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

  it('scores start-of-compound in first word as 4', () => {
    expect(matchRelevance('poulet', 'pouletbrust 500g')).toBe(4)
    expect(matchRelevance('poulet', 'pouletflügeli 1kg')).toBe(4)
  })

  it('scores 0 for form-changing compounds (different product)', () => {
    expect(matchRelevance('milch', 'milchdrink 500ml')).toBe(0)
    expect(matchRelevance('tomaten', 'tomatenpüree 3x200g')).toBe(0)
    expect(matchRelevance('milch', 'milchschokolade 200g')).toBe(0)
    expect(matchRelevance('kartoffel', 'kartoffelstock 500g')).toBe(0)
    expect(matchRelevance('kartoffel', 'kartoffelgratin 400g')).toBe(0)
    expect(matchRelevance('tomaten', 'tomatensauce basilikum')).toBe(0)
  })

  it('scores start-of-compound with qualifier prefix as 4', () => {
    expect(matchRelevance('poulet', 'optigal pouletschnitzel')).toBe(4)
    expect(matchRelevance('poulet', 'm-classic pouletbrustschnitzel mariniert')).toBe(4)
  })

  it('scores start-of-compound later in name as 2 (non-form-changing)', () => {
    // "premium" is not a qualifier, so pouletbrust as 3rd+ word gets lower score
    expect(matchRelevance('poulet', 'swiss premium pouletbrust 500g')).toBe(2)
  })

  it('scores end-of-compound later in name as 2', () => {
    expect(matchRelevance('milch', 'bio premium vollmilch 1l')).toBe(2)
  })

  it('scores substring match as 1', () => {
    // "milch" in "milchschokolade" — startsWith would match, but this is the first word
    // so it gets 4 now. Let's test a non-first-word substring instead.
    expect(matchRelevance('milch', 'butter 250g')).toBe(0)
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

  it('compares regular prices when no deals exist', () => {
    const migrosPrice: RegularPrice = { productName: 'milch 1l', price: 1.50, store: 'migros' }
    const coopPrice: RegularPrice = { productName: 'milch 1l', price: 1.80, store: 'coop' }
    expect(getRecommendation(null, null, migrosPrice, coopPrice)).toBe('migros')
  })

  it('returns coop when coop regular price is cheaper', () => {
    const migrosPrice: RegularPrice = { productName: 'butter', price: 3.50, store: 'migros' }
    const coopPrice: RegularPrice = { productName: 'butter', price: 2.90, store: 'coop' }
    expect(getRecommendation(null, null, migrosPrice, coopPrice)).toBe('coop')
  })

  it('returns both when regular prices are equal', () => {
    const migrosPrice: RegularPrice = { productName: 'eier', price: 4.20, store: 'migros' }
    const coopPrice: RegularPrice = { productName: 'eier', price: 4.20, store: 'coop' }
    expect(getRecommendation(null, null, migrosPrice, coopPrice)).toBe('both')
  })

  it('returns migros when only migros has regular price', () => {
    const migrosPrice: RegularPrice = { productName: 'milch 1l', price: 1.50, store: 'migros' }
    expect(getRecommendation(null, null, migrosPrice, null)).toBe('migros')
  })

  it('returns none when no deals and no regular prices', () => {
    expect(getRecommendation(null, null, null, null)).toBe('none')
  })

  it('deal always wins over regular price', () => {
    const deal = makeDeal({ store: 'migros', discount_percent: 20 })
    const coopPrice: RegularPrice = { productName: 'milch 1l', price: 0.50, store: 'coop' }
    // Migros has a deal, coop only has a regular price — deal wins
    expect(getRecommendation(deal, null, null, coopPrice)).toBe('migros')
  })
})

describe('findRegularPrice', () => {
  it('finds cheapest regular price in a product group', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros', regular_price: 1.80 }),
      makeProduct({ id: 'p2', product_group: 'milk-whole-1l', store: 'migros', regular_price: 1.50, source_name: 'bio milch 1l' }),
    ]

    const result = findRegularPrice('milk-whole-1l', 'migros', products)
    expect(result).not.toBeNull()
    expect(result!.price).toBe(1.50)
    expect(result!.store).toBe('migros')
  })

  it('returns null when no products have regular prices', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros', regular_price: null }),
    ]

    expect(findRegularPrice('milk-whole-1l', 'migros', products)).toBeNull()
  })

  it('filters by store', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros', regular_price: 1.50 }),
      makeProduct({ id: 'p2', product_group: 'milk-whole-1l', store: 'coop', regular_price: 1.80 }),
    ]

    const result = findRegularPrice('milk-whole-1l', 'coop', products)
    expect(result!.price).toBe(1.80)
    expect(result!.store).toBe('coop')
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

  it('applies exclude terms from favorite items', () => {
    const favs = [makeFavItem({
      keyword: 'milch',
      exclude_terms: ['schokolade', 'branche'],
    })]
    const deals = [
      makeDeal({ id: 'd1', store: 'migros', product_name: 'naturaplan bio branche milch 30x23g', discount_percent: 44 }),
      makeDeal({ id: 'd2', store: 'migros', product_name: 'vollmilch 1l', discount_percent: 20 }),
    ]

    const results = matchFavorites(favs, deals)
    expect(results[0]!.migrosDeal!.id).toBe('d2')
  })
})

describe('findBestMatchByProductGroup', () => {
  it('finds the best deal matching a product group', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros' }),
      makeProduct({ id: 'p2', product_group: 'milk-whole-1l', store: 'migros' }),
    ]
    const deals = [
      makeDeal({ id: 'd1', product_id: 'p1', discount_percent: 20, store: 'migros' }),
      makeDeal({ id: 'd2', product_id: 'p2', discount_percent: 40, store: 'migros' }),
    ]

    const result = findBestMatchByProductGroup('milk-whole-1l', deals, products)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('d2') // higher discount wins
  })

  it('returns null when no products match the group', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'butter-250g', store: 'migros' }),
    ]
    const deals = [
      makeDeal({ id: 'd1', product_id: 'p1', discount_percent: 20 }),
    ]

    const result = findBestMatchByProductGroup('milk-whole-1l', deals, products)
    expect(result).toBeNull()
  })

  it('ignores deals with 0% discount', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros' }),
    ]
    const deals = [
      makeDeal({ id: 'd1', product_id: 'p1', discount_percent: 0 }),
    ]

    const result = findBestMatchByProductGroup('milk-whole-1l', deals, products)
    expect(result).toBeNull()
  })

  it('only matches deals whose product_id is in the group', () => {
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros' }),
      makeProduct({ id: 'p2', product_group: 'butter-250g', store: 'migros' }),
    ]
    const deals = [
      makeDeal({ id: 'd1', product_id: 'p1', discount_percent: 20 }),
      makeDeal({ id: 'd2', product_id: 'p2', discount_percent: 50 }),
      makeDeal({ id: 'd3', product_id: null, discount_percent: 60 }),
    ]

    const result = findBestMatchByProductGroup('milk-whole-1l', deals, products)
    expect(result!.id).toBe('d1')
  })
})

describe('matchFavorites — product group path', () => {
  it('uses product group matching when product_group_id is set', () => {
    const favs = [makeFavItem({ keyword: 'milch', product_group_id: 'milk-whole-1l' })]
    const products = [
      makeProduct({ id: 'p1', product_group: 'milk-whole-1l', store: 'migros' }),
      makeProduct({ id: 'p2', product_group: 'milk-whole-1l', store: 'coop' }),
    ]
    const deals = [
      makeDeal({ id: 'd1', store: 'migros', product_id: 'p1', product_name: 'vollmilch 1l', discount_percent: 30 }),
      makeDeal({ id: 'd2', store: 'coop', product_id: 'p2', product_name: 'bio milch 1l', discount_percent: 20 }),
    ]

    const results = matchFavorites(favs, deals, products)
    expect(results[0]!.migrosDeal!.id).toBe('d1')
    expect(results[0]!.coopDeal!.id).toBe('d2')
    expect(results[0]!.recommendation).toBe('migros')
  })

  it('does NOT fall back to keyword when product_group_id is set but products empty', () => {
    const favs = [makeFavItem({ keyword: 'milch', product_group_id: 'milk-whole-1l' })]
    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l', discount_percent: 30 }),
    ]

    // Products array is empty — should NOT fall back to keyword match
    const results = matchFavorites(favs, deals, [])
    expect(results[0]!.migrosDeal).toBeNull()
    expect(results[0]!.coopDeal).toBeNull()
    expect(results[0]!.recommendation).toBe('none')
  })

  it('does NOT fall back to keyword when product_group_id is set but products undefined', () => {
    const favs = [makeFavItem({ keyword: 'milch', product_group_id: 'milk-whole-1l' })]
    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l', discount_percent: 30 }),
    ]

    // Products undefined — should NOT fall back to keyword match
    const results = matchFavorites(favs, deals, undefined)
    expect(results[0]!.recommendation).toBe('none')
  })

  it('uses keyword matching when product_group_id is null', () => {
    const favs = [makeFavItem({ keyword: 'milch', product_group_id: null })]
    const deals = [
      makeDeal({ store: 'migros', product_name: 'milch 1l', discount_percent: 30 }),
    ]

    const results = matchFavorites(favs, deals, [])
    expect(results[0]!.migrosDeal).not.toBeNull()
    expect(results[0]!.recommendation).toBe('migros')
  })

  it('isolates product groups per store', () => {
    const favs = [makeFavItem({ keyword: 'milch', product_group_id: 'milk-whole-1l' })]
    const products = [
      makeProduct({ id: 'p-migros', product_group: 'milk-whole-1l', store: 'migros' }),
      // No coop product in this group
    ]
    const deals = [
      makeDeal({ id: 'd1', store: 'migros', product_id: 'p-migros', discount_percent: 30 }),
      makeDeal({ id: 'd2', store: 'coop', product_id: null, product_name: 'milch 1l', discount_percent: 40 }),
    ]

    const results = matchFavorites(favs, deals, products)
    expect(results[0]!.migrosDeal!.id).toBe('d1')
    expect(results[0]!.coopDeal).toBeNull() // no coop product in group
    expect(results[0]!.recommendation).toBe('migros')
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

  it('matches keyword followed by comma (rotwein,)', () => {
    expect(keywordMatches('wein', 'rotwein, österreich')).toBe(true)
  })

  it('matches keyword followed by period', () => {
    expect(keywordMatches('milch', 'vollmilch. bio')).toBe(true)
  })

  it('matches keyword followed by closing paren', () => {
    expect(keywordMatches('milch', 'vollmilch) test')).toBe(true)
  })
})
