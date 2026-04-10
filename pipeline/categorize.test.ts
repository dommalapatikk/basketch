// Tests for the deal categorizer: keyword matching, source category, discount_percent guarantee.

import { describe, it, expect } from 'vitest'

import type { UnifiedDeal } from '../shared/types'

import { categorizeDeal } from './categorize'

function makeDeal(overrides: Partial<UnifiedDeal> = {}): UnifiedDeal {
  return {
    store: 'migros',
    productName: 'test product',
    originalPrice: 10,
    salePrice: 8,
    discountPercent: 20,
    validFrom: '2026-04-09',
    validTo: '2026-04-16',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    ...overrides,
  }
}

describe('categorizeDeal', () => {
  describe('fresh items', () => {
    it.each([
      ['Vollmilch 1L', 'milch'],
      ['Weissbrot 500g', 'brot'],
      ['Poulet Brust', 'poulet'],
      ['Freiland Eier 6er', 'eier'],
    ])('categorizes "%s" as fresh (keyword: %s)', (productName) => {
      const deal = makeDeal({ productName })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('fresh')
    })
  })

  describe('non-food items', () => {
    it.each([
      ['Head & Shoulders Shampoo', 'shampoo'],
      ['Hakle Toilettenpapier 24 Rollen', 'toilettenpapier'],
      ['Persil Waschmittel Gel', 'waschmittel'],
    ])('categorizes "%s" as non-food (keyword: %s)', (productName) => {
      const deal = makeDeal({ productName })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('non-food')
    })
  })

  describe('long-life defaults', () => {
    it.each([
      'Barilla Spaghetti 500g',
      'Barilla Penne 500g',
      'Ragusa Pralinés 200g',
      'Nescafé Gold 200g',
    ])('categorizes "%s" as long-life (no matching keyword)', (productName) => {
      const deal = makeDeal({ productName })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('long-life')
    })
  })

  describe('source category matching', () => {
    it('matches on sourceCategory when productName has no keyword', () => {
      const deal = makeDeal({
        productName: 'Bio Produkt',
        sourceCategory: 'Frische Milchprodukte',
      })
      const result = categorizeDeal(deal)
      // 'frisch' keyword matches sourceCategory
      expect(result.category).toBe('fresh')
    })

    it('matches non-food via sourceCategory', () => {
      const deal = makeDeal({
        productName: 'Markenprodukt',
        sourceCategory: 'Haushalt & Putzmittel',
      })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('non-food')
    })
  })

  describe('discount_percent is always non-null', () => {
    it('preserves existing discount_percent', () => {
      const deal = makeDeal({ discountPercent: 25 })
      const result = categorizeDeal(deal)
      expect(result.discountPercent).toBe(25)
    })

    it('calculates discount_percent from prices when null', () => {
      const deal = makeDeal({
        originalPrice: 10,
        salePrice: 7,
        discountPercent: null,
      })
      const result = categorizeDeal(deal)
      expect(result.discountPercent).toBe(30)
    })

    it('sets discount_percent to 0 when no prices available', () => {
      const deal = makeDeal({
        originalPrice: null,
        salePrice: 5,
        discountPercent: null,
      })
      const result = categorizeDeal(deal)
      expect(result.discountPercent).toBe(0)
    })
  })

  describe('first match wins', () => {
    it('matches fresh before non-food for a product with both keywords', () => {
      // 'frisch' is in fresh rules, checked first
      const deal = makeDeal({ productName: 'frisch shampoo' })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('fresh')
    })
  })
})
