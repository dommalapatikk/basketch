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
      // 'milch' in sourceCategory matches dairy rule -> fresh
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

  describe('sub_category assignment', () => {
    it.each([
      ['Vollmilch 1L', 'dairy'],
      ['Gruyère AOC 200g', 'dairy'],
      ['Poulet Brust', 'poultry'],
      ['Hackfleisch 500g', 'meat'],
      ['Rispentomaten 500g', 'vegetables'],
      ['Bananen 1kg', 'fruit'],
      ['Barilla Spaghetti 500g', 'pasta-rice'],
      ['Persil Waschmittel Gel', 'laundry'],
      ['Head & Shoulders Shampoo', 'personal-care'],
      ['Hakle Toilettenpapier 24 Rollen', 'paper-goods'],
      ['Chips Original 170g', 'snacks'],
      ['Lindt Lindor 200g', 'chocolate'],
      ['Rivella rot 50cl', 'drinks'],
      ['Nescafé Kaffee Gold 200g', 'coffee-tea'],
    ])('assigns sub_category "%s" -> %s', (productName, expectedSub) => {
      const deal = makeDeal({ productName })
      const result = categorizeDeal(deal)
      expect(result.subCategory).toBe(expectedSub)
    })

    it('assigns null sub_category for unmatched products', () => {
      const deal = makeDeal({ productName: 'unknown product xyz' })
      const result = categorizeDeal(deal)
      expect(result.subCategory).toBeNull()
    })
  })

  describe('false positive prevention', () => {
    it('does NOT categorize dental products as meat', () => {
      const mouthwash = makeDeal({ productName: 'meridol mundspülung zahnfleischschutz' })
      const result1 = categorizeDeal(mouthwash)
      expect(result1.subCategory).toBe('personal-care')
      expect(result1.category).toBe('non-food')

      const toothpaste = makeDeal({ productName: 'meridol zahnpasta' })
      const result2 = categorizeDeal(toothpaste)
      expect(result2.subCategory).toBe('personal-care')
      expect(result2.category).toBe('non-food')
    })

    it('still categorizes real meat products correctly', () => {
      const deal = makeDeal({ productName: 'rindfleisch 500g' })
      const result = categorizeDeal(deal)
      expect(result.subCategory).toBe('meat')
    })
  })

  describe('first match wins', () => {
    it('matches fresh before non-food for a product with both keywords', () => {
      // 'milch' is in fresh > dairy rules, checked before non-food
      const deal = makeDeal({ productName: 'milch seife set' })
      const result = categorizeDeal(deal)
      expect(result.category).toBe('fresh')
    })
  })
})
