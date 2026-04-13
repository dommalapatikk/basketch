import { describe, it, expect } from 'vitest'

import {
  BROWSE_CATEGORIES,
  STARTER_PACKS,
  TIE_THRESHOLD,
  MIN_DEALS_FOR_VERDICT,
  dealToRow,
} from './types'
import type { Deal } from './types'

describe('BROWSE_CATEGORIES', () => {
  // All 23 DB sub-categories from architecture v2.1 Section 4.10
  const ALL_SUB_CATEGORIES = [
    'fruit', 'vegetables',
    'meat', 'poultry', 'fish',
    'dairy', 'eggs',
    'bread',
    'snacks', 'chocolate',
    'pasta-rice',
    'drinks', 'coffee-tea',
    'ready-meals', 'frozen', 'deli',
    'canned', 'condiments',
    'cleaning', 'laundry', 'paper-goods', 'household',
    'personal-care',
  ]

  it('has exactly 11 browse categories (excluding "all")', () => {
    expect(BROWSE_CATEGORIES).toHaveLength(11)
  })

  it('covers all 23 DB sub-categories', () => {
    const covered = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    for (const sub of ALL_SUB_CATEGORIES) {
      expect(covered).toContain(sub)
    }
  })

  it('maps exactly 23 sub-categories total', () => {
    const covered = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    expect(covered).toHaveLength(23)
  })

  it('has no duplicate sub-categories across browse categories', () => {
    const covered = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    const unique = new Set(covered)
    expect(unique.size).toBe(covered.length)
  })

  it('each browse category has a non-empty label and emoji', () => {
    for (const cat of BROWSE_CATEGORIES) {
      expect(cat.label.length).toBeGreaterThan(0)
      expect(cat.emoji.length).toBeGreaterThan(0)
      expect(cat.subCategories.length).toBeGreaterThan(0)
    }
  })

  it('maps Meat & Fish to meat, poultry, fish (not deli)', () => {
    const meatFish = BROWSE_CATEGORIES.find(c => c.id === 'meat-fish')
    expect(meatFish?.subCategories).toEqual(['meat', 'poultry', 'fish'])
  })

  it('maps Ready Meals & Frozen to ready-meals, frozen, deli', () => {
    const readyMeals = BROWSE_CATEGORIES.find(c => c.id === 'ready-meals-frozen')
    expect(readyMeals?.subCategories).toEqual(['ready-meals', 'frozen', 'deli'])
  })
})

describe('STARTER_PACKS', () => {
  it('has exactly 5 starter packs', () => {
    expect(STARTER_PACKS).toHaveLength(5)
  })

  it('contains the correct 5 packs', () => {
    const names = STARTER_PACKS.map(p => p.name)
    expect(names).toEqual([
      'swiss-basics',
      'indian-kitchen',
      'mediterranean',
      'studentenkueche',
      'familientisch',
    ])
  })

  it('each pack has at least 10 items', () => {
    for (const pack of STARTER_PACKS) {
      expect(pack.items.length).toBeGreaterThanOrEqual(10)
    }
  })

  it('each item has required fields', () => {
    for (const pack of STARTER_PACKS) {
      for (const item of pack.items) {
        expect(item.keyword).toBeTruthy()
        expect(item.label).toBeTruthy()
        expect(['fresh', 'long-life', 'non-food']).toContain(item.category)
      }
    }
  })
})

describe('constants', () => {
  it('TIE_THRESHOLD is 0.05 (5%)', () => {
    expect(TIE_THRESHOLD).toBe(0.05)
  })

  it('MIN_DEALS_FOR_VERDICT is 3', () => {
    expect(MIN_DEALS_FOR_VERDICT).toBe(3)
  })
})

describe('dealToRow', () => {
  const deal: Deal = {
    store: 'migros',
    productName: 'Test Product',
    originalPrice: 10.00,
    salePrice: 7.50,
    discountPercent: 25,
    validFrom: '2026-04-09',
    validTo: '2026-04-15',
    imageUrl: null,
    sourceCategory: 'Dairy',
    sourceUrl: 'https://example.com',
    category: 'fresh',
    subCategory: 'dairy',
  }

  it('converts camelCase to snake_case', () => {
    const row = dealToRow(deal, 'prod-123')
    expect(row.product_name).toBe('Test Product')
    expect(row.original_price).toBe(10.00)
    expect(row.sale_price).toBe(7.50)
    expect(row.discount_percent).toBe(25)
    expect(row.valid_from).toBe('2026-04-09')
    expect(row.valid_to).toBe('2026-04-15')
    expect(row.sub_category).toBe('dairy')
    expect(row.product_id).toBe('prod-123')
    expect(row.is_active).toBe(true)
  })

  it('sets product_id to null when not provided', () => {
    const row = dealToRow(deal)
    expect(row.product_id).toBeNull()
  })

  it('defaults discount_percent to 0 when null', () => {
    const dealNoDiscount: Deal = { ...deal, discountPercent: null }
    const row = dealToRow(dealNoDiscount)
    expect(row.discount_percent).toBe(0)
  })
})
