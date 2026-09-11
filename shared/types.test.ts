import { describe, it, expect } from 'vitest'

import {
  BROWSE_CATEGORIES,
  STARTER_PACKS,
  TIE_THRESHOLD,
  MIN_DEALS_FOR_VERDICT,
  dealToRow,
  isStorageState,
} from './types'
import type { Deal } from './types'

describe('BROWSE_CATEGORIES', () => {
  // The original grocery sub-categories. The taxonomy has grown well past these
  // (see ADR-001), but none of them may ever disappear — the PM's standing
  // instruction is that the taxonomy is additive only.
  const ORIGINAL_SUB_CATEGORIES = [
    'fruit', 'vegetables',
    'meat', 'poultry', 'fish', 'deli',
    'dairy', 'eggs',
    'bread',
    'snacks', 'chocolate',
    'pasta-rice',
    'drinks', 'coffee-tea',
    'ready-meals', 'frozen',
    'canned', 'condiments',
    'cleaning', 'laundry', 'paper-goods', 'household',
    'personal-care',
  ]

  // Counts are a tripwire against accidental edits, not a design constraint.
  // Growing the taxonomy is expected — update these deliberately when you do.
  it('has 22 browse categories (excluding "all")', () => {
    expect(BROWSE_CATEGORIES).toHaveLength(22)
  })

  it('never loses an original sub-category — the taxonomy is additive only', () => {
    const covered = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    for (const sub of ORIGINAL_SUB_CATEGORIES) {
      expect(covered).toContain(sub)
    }
  })

  it('maps 76 sub-categories total', () => {
    const covered = BROWSE_CATEGORIES.flatMap(c => c.subCategories)
    expect(covered).toHaveLength(76)
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

  it('gives every browse category a valid top category', () => {
    for (const cat of BROWSE_CATEGORIES) {
      expect(['fresh', 'long-life', 'non-food']).toContain(cat.topCategory)
    }
  })

  it('keeps deli under Meat & Fish', () => {
    const meatFish = BROWSE_CATEGORIES.find(c => c.id === 'meat-fish')
    expect(meatFish?.subCategories).toContain('deli')
  })

  it('separates alcohol from soft drinks — Migros and Coop both do (ADR-001)', () => {
    const drinks = BROWSE_CATEGORIES.find(c => c.id === 'drinks')
    const alcohol = BROWSE_CATEGORIES.find(c => c.id === 'alcohol')
    expect(drinks?.subCategories).not.toContain('wine')
    expect(alcohol?.subCategories).toEqual(expect.arrayContaining(['wine', 'beer', 'spirits']))
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

  // D3 — the uncertainty flag has to survive the write, or the review queue is
  // empty and the label is shown as if it were certain.
  it('writes is_uncertain when the classifier was not confident', () => {
    const row = dealToRow({ ...deal, isUncertain: true })
    expect(row.is_uncertain).toBe(true)
  })

  it('treats an absent isUncertain as confident, not as unknown', () => {
    const row = dealToRow(deal)
    expect(row.is_uncertain).toBe(false)
  })

  // ADR-001 — storage is a column, not a jsonb field, because the Frozen browse
  // tile is a facet count over it.
  it('writes storage through to its own column', () => {
    const row = dealToRow({ ...deal, storage: 'frozen' })
    expect(row.storage).toBe('frozen')
  })

  it('writes null storage when the retailer did not state it', () => {
    const row = dealToRow(deal)
    expect(row.storage).toBeNull()
  })

  // The enrich step's whole output reached the cache and then stopped there
  // before this; the column stayed '{}' on every row in the table.
  it('writes attributes through to the row', () => {
    const row = dealToRow({ ...deal, attributes: { fatPercent: 3.5, organic: true } })
    expect(row.attributes).toEqual({ fatPercent: 3.5, organic: true })
  })

  it('defaults attributes to an empty object, never null', () => {
    const row = dealToRow(deal)
    expect(row.attributes).toEqual({})
  })
})

describe('isStorageState', () => {
  it('accepts every value the database CHECK constraint allows', () => {
    for (const s of ['fresh', 'chilled', 'frozen', 'ambient']) {
      expect(isStorageState(s)).toBe(true)
    }
  })

  it('rejects a plausible value that is not in the taxonomy', () => {
    // 'tiefkühl' is what a retailer writes; it is not what the column stores.
    expect(isStorageState('tiefkühl')).toBe(false)
    expect(isStorageState('room-temperature')).toBe(false)
  })

  it('rejects non-strings without throwing', () => {
    expect(isStorageState(null)).toBe(false)
    expect(isStorageState(undefined)).toBe(false)
    expect(isStorageState(3)).toBe(false)
  })
})
