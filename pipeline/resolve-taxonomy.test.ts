import { describe, it, expect } from 'vitest'

import type { Deal } from '../shared/types'

import { collectUnknownTags, resolveTaxonomy, type AliasMap } from './resolve-taxonomy'

function fakeDeal(subCategory: string | null, store = 'coop', productName = 'test'): Deal {
  return {
    store: store as Deal['store'],
    productName,
    category: 'long-life',
    subCategory,
    originalPrice: 10,
    salePrice: 5,
    discountPercent: 50,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    taxonomyConfidence: 0.9,
  } as unknown as Deal
}

const aliases: AliasMap = new Map([
  ['wine', { categorySlug: 'drinks', subcategorySlug: 'wine' }],
  ['snacks', { categorySlug: 'snacks-sweets', subcategorySlug: null }],
])

describe('resolveTaxonomy', () => {
  it('attaches categorySlug from the alias map', () => {
    const result = resolveTaxonomy(fakeDeal('wine'), aliases)
    expect((result as Deal & { categorySlug?: string }).categorySlug).toBe('drinks')
  })

  it('returns the deal unchanged when subCategory is null', () => {
    const result = resolveTaxonomy(fakeDeal(null), aliases)
    expect((result as Deal & { categorySlug?: string }).categorySlug).toBeUndefined()
  })

  it('returns the deal unchanged when subCategory has no alias', () => {
    const result = resolveTaxonomy(fakeDeal('pet-food'), aliases)
    expect((result as Deal & { categorySlug?: string }).categorySlug).toBeUndefined()
  })

  it('matches case-insensitively', () => {
    const result = resolveTaxonomy(fakeDeal('WINE'), aliases)
    expect((result as Deal & { categorySlug?: string }).categorySlug).toBe('drinks')
  })

  it('preserves the rest of the deal verbatim', () => {
    const input = fakeDeal('wine')
    const result = resolveTaxonomy(input, aliases)
    expect(result.productName).toBe(input.productName)
    expect(result.salePrice).toBe(input.salePrice)
    expect(result.subCategory).toBe(input.subCategory)
  })
})

describe('collectUnknownTags', () => {
  it('returns one entry per unique (tag, store) tuple', () => {
    const deals = [
      fakeDeal('wine', 'coop'), // alias hit → skip
      fakeDeal('pet-food', 'coop'),
      fakeDeal('pet-food', 'coop'), // dup of (pet-food, coop) → skip
      fakeDeal('pet-food', 'migros'), // different store → keep
      fakeDeal('rare-tag', 'coop'),
    ]
    const out = collectUnknownTags(deals, aliases)
    expect(out).toHaveLength(3)
    const keys = out.map((u) => `${u.source_tag}|${u.store}`).sort()
    expect(keys).toEqual(['pet-food|coop', 'pet-food|migros', 'rare-tag|coop'])
  })

  it('skips deals without a subCategory', () => {
    const deals = [fakeDeal(null, 'coop'), fakeDeal('rare', 'coop')]
    const out = collectUnknownTags(deals, aliases)
    expect(out).toHaveLength(1)
    expect(out[0]?.source_tag).toBe('rare')
  })

  it('returns empty when every tag is mapped', () => {
    const deals = [fakeDeal('wine', 'coop'), fakeDeal('snacks', 'migros')]
    const out = collectUnknownTags(deals, aliases)
    expect(out).toEqual([])
  })
})
