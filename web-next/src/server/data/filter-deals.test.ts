import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTERS, parseFilters } from '@/lib/filters'
import type { Deal } from '@/lib/types'

import {
  buildSections,
  countMatches,
  filterDeals,
  matchDeal,
  storeCounts,
  subCategoryCounts,
} from './filter-deals'

const D = (overrides: Partial<Deal>): Deal => ({
  id: '1',
  store: 'migros',
  productName: 'Milk 1L',
  category: 'fresh',
  subCategory: 'Dairy',
  salePrice: 1,
  originalPrice: 2,
  discountPercent: 50,
  pricePerUnit: 1,
  canonicalUnit: 'L',
  format: '1L',
  imageUrl: null,
  validFrom: '2026-04-20',
  validTo: '2026-04-30',
  sourceUrl: null,
  productId: 'p1',
  taxonomyConfidence: 0.9,
  isActive: true,
  updatedAt: '2026-04-24T00:00:00Z',
  ...overrides,
})

describe('filterDeals', () => {
  it('passes everything through when filters are default', () => {
    const deals = [D({ id: '1' }), D({ id: '2', store: 'coop' })]
    expect(filterDeals(deals, DEFAULT_FILTERS).length).toBe(2)
  })

  it('filters by type', () => {
    const deals = [D({ id: '1', category: 'fresh' }), D({ id: '2', category: 'household' })]
    expect(filterDeals(deals, { ...DEFAULT_FILTERS, type: 'fresh' }).length).toBe(1)
  })

  it('filters by sub-category case-insensitively', () => {
    const deals = [D({ id: '1', subCategory: 'Dairy' }), D({ id: '2', subCategory: 'Bread' })]
    // Patch F: subCategory now lives on filters.subCategory; filters.category is the
    // mid-level Category (drinks, snacks-sweets, ...).
    expect(filterDeals(deals, { ...DEFAULT_FILTERS, subCategory: 'dairy' }).length).toBe(1)
  })

  it('filters by store', () => {
    const deals = [D({ id: '1', store: 'migros' }), D({ id: '2', store: 'coop' })]
    expect(filterDeals(deals, { ...DEFAULT_FILTERS, stores: ['coop'] }).length).toBe(1)
  })

  it('filters by search query (case-insensitive substring)', () => {
    const deals = [
      D({ id: '1', productName: 'Vollmilch 1L' }),
      D({ id: '2', productName: 'Brot 500g' }),
    ]
    expect(filterDeals(deals, { ...DEFAULT_FILTERS, q: 'voll' }).length).toBe(1)
  })
})

describe('storeCounts', () => {
  it('returns counts ignoring the active store filter', () => {
    const deals = [
      D({ id: '1', store: 'migros' }),
      D({ id: '2', store: 'coop' }),
      D({ id: '3', store: 'coop' }),
    ]
    const counts = storeCounts(deals, { ...DEFAULT_FILTERS, stores: ['migros'] })
    expect(counts.migros).toBe(1)
    expect(counts.coop).toBe(2)
  })
})

describe('subCategoryCounts', () => {
  it('groups by sub_category and sorts desc', () => {
    const deals = [
      D({ id: '1', subCategory: 'Dairy' }),
      D({ id: '2', subCategory: 'Dairy' }),
      D({ id: '3', subCategory: 'Bread' }),
    ]
    const result = subCategoryCounts(deals, DEFAULT_FILTERS)
    expect(result[0]).toEqual({ key: 'Dairy', count: 2 })
    expect(result[1]).toEqual({ key: 'Bread', count: 1 })
  })

  it('breaks count ties alphabetically (asc)', () => {
    const deals = [
      D({ id: '1', subCategory: 'Cheese' }),
      D({ id: '2', subCategory: 'Apples' }),
      D({ id: '3', subCategory: 'Bread' }),
    ]
    const result = subCategoryCounts(deals, DEFAULT_FILTERS)
    expect(result.map((r) => r.key)).toEqual(['Apples', 'Bread', 'Cheese'])
  })

  it('keeps every sub-category in the type universe even when stores filter zeroes them out', () => {
    // HR7 / v2.1 §E.2: changing stores must dim chips to 0, not delete them.
    const deals = [
      D({ id: '1', store: 'migros', category: 'fresh', subCategory: 'Dairy' }),
      D({ id: '2', store: 'coop', category: 'fresh', subCategory: 'Bread' }),
      D({ id: '3', store: 'lidl', category: 'fresh', subCategory: 'Fruit' }),
    ]
    const result = subCategoryCounts(deals, { ...DEFAULT_FILTERS, type: 'fresh', stores: ['migros'] })
    const keys = result.map((r) => r.key)
    expect(keys).toContain('Dairy')
    expect(keys).toContain('Bread')
    expect(keys).toContain('Fruit')
    expect(result.find((r) => r.key === 'Dairy')?.count).toBe(1)
    expect(result.find((r) => r.key === 'Bread')?.count).toBe(0)
    expect(result.find((r) => r.key === 'Fruit')?.count).toBe(0)
  })

  it('sinks zero-count chips to the bottom (still alphabetised within zero group)', () => {
    // v2.1 §D.5: sort = count desc, alpha asc on ties, zero-count last.
    const deals = [
      D({ id: '1', store: 'migros', category: 'fresh', subCategory: 'Cheese' }),
      D({ id: '2', store: 'coop', category: 'fresh', subCategory: 'Apples' }),
      D({ id: '3', store: 'coop', category: 'fresh', subCategory: 'Bread' }),
    ]
    const result = subCategoryCounts(deals, {
      ...DEFAULT_FILTERS,
      type: 'fresh',
      stores: ['migros'],
    })
    expect(result.map((r) => r.key)).toEqual(['Cheese', 'Apples', 'Bread'])
    expect(result.map((r) => r.count)).toEqual([1, 0, 0])
  })

  it('respects the q filter for counts but not for the universe', () => {
    const deals = [
      D({ id: '1', category: 'fresh', subCategory: 'Dairy', productName: 'Milch 1L' }),
      D({ id: '2', category: 'fresh', subCategory: 'Dairy', productName: 'Käse' }),
      D({ id: '3', category: 'fresh', subCategory: 'Bread', productName: 'Brot' }),
    ]
    const result = subCategoryCounts(deals, { ...DEFAULT_FILTERS, type: 'fresh', q: 'milch' })
    expect(result.find((r) => r.key === 'Dairy')?.count).toBe(1)
    expect(result.find((r) => r.key === 'Bread')?.count).toBe(0)
  })

  it('excludes sub-categories that do not exist under the active type filter', () => {
    const deals = [
      D({ id: '1', category: 'fresh', subCategory: 'Dairy' }),
      D({ id: '2', category: 'household', subCategory: 'Cleaning' }),
    ]
    const result = subCategoryCounts(deals, { ...DEFAULT_FILTERS, type: 'fresh' })
    expect(result.map((r) => r.key)).toEqual(['Dairy'])
  })
})

describe('filter parity (desktop ↔ mobile)', () => {
  // Spec §11 M5 acceptance: "filter-parity test (desktop vs mobile produce
  // the same deal set for a given URL)". Both surfaces drive the same URL
  // contract, so the only thing we can drift on is the predicate. This test
  // pins matchDeal + filterDeals + countMatches together for the same URL.
  it('the URL → filter set → deal set chain is identical across surfaces', () => {
    const deals: Deal[] = [
      D({ id: '1', store: 'migros', category: 'fresh', subCategory: 'Dairy', productName: 'Milch' }),
      D({ id: '2', store: 'coop', category: 'fresh', subCategory: 'Dairy', productName: 'Milch' }),
      D({ id: '3', store: 'lidl', category: 'household', subCategory: 'Cleaning', productName: 'Sagrotan' }),
      D({ id: '4', store: 'migros', category: 'longlife', subCategory: 'Pasta', productName: 'Spaghetti' }),
      D({ id: '5', store: 'denner', category: 'fresh', subCategory: 'Bread', productName: 'Vollkornbrot' }),
    ]

    // What the URL `?type=fresh&stores=migros,coop` parses to:
    const filters = parseFilters({ type: 'fresh', stores: 'migros,coop' })

    // Desktop path: server filterDeals
    const desktopDeals = filterDeals(deals, filters)
    expect(desktopDeals.map((d) => d.id).sort()).toEqual(['1', '2'])

    // Mobile path: same predicate + slim count for the "Show n deals" button
    const facets = deals.map((d) => ({
      store: d.store,
      category: d.category,
      subCategory: d.subCategory,
      productName: d.productName,
    }))
    expect(countMatches(facets, filters)).toBe(desktopDeals.length)

    // And per-deal results match
    expect(facets.filter((d) => matchDeal(d, filters)).length).toBe(desktopDeals.length)
  })

  it('same URL with q= narrows results identically on both surfaces', () => {
    const deals: Deal[] = [
      D({ id: '1', productName: 'Vollmilch 1L' }),
      D({ id: '2', productName: 'Magermilch' }),
      D({ id: '3', productName: 'Brot' }),
    ]
    const filters = parseFilters({ q: 'milch' })
    const desktop = filterDeals(deals, filters)
    const facets = deals.map((d) => ({
      store: d.store,
      category: d.category,
      subCategory: d.subCategory,
      productName: d.productName,
    }))
    expect(countMatches(facets, filters)).toBe(desktop.length)
    expect(desktop.length).toBe(2)
  })
})

describe('buildSections', () => {
  it('groups deals into sections with primary = highest discount', () => {
    const deals = [
      D({ id: '1', subCategory: 'Dairy', discountPercent: 20 }),
      D({ id: '2', subCategory: 'Dairy', discountPercent: 50 }),
      D({ id: '3', subCategory: 'Dairy', discountPercent: 30 }),
    ]
    const sections = buildSections(deals)
    expect(sections[0].subCategory).toBe('Dairy')
    expect(sections[0].primary.id).toBe('2')
    expect(sections[0].others.map((d) => d.id)).toEqual(['3', '1'])
  })

  it('caps `others` at the compactLimit', () => {
    const deals = Array.from({ length: 10 }, (_, i) =>
      D({ id: String(i), subCategory: 'Dairy', discountPercent: 100 - i }),
    )
    const sections = buildSections(deals, 4)
    expect(sections[0].others.length).toBe(4)
  })
})
