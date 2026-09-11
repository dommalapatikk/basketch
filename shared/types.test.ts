import { describe, it, expect } from 'vitest'

import {
  BROWSE_CATEGORIES,
  STARTER_PACKS,
  TIE_THRESHOLD,
  MIN_DEALS_FOR_VERDICT,
  dealToRow,
  isStorageState,
  topCategoryFor,
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

describe('topCategoryFor', () => {
  /**
   * THE BUG THAT MADE EVERY LIVE CUTOVER WRITE ZERO ROWS, 2026-09-11.
   *
   *   [storage] [ERROR] Upsert batch 1 failed: new row for relation "deals"
   *   violates check constraint "deals_category_check"
   *   [storage] [INFO] Upserted 0 of 922 deals
   *
   * `deals.category` accepts only the three TOP-LEVEL groups. The classifier
   * returns BROWSE categories — 'dairy', 'meat-fish' — and the live path wrote
   * that value straight into the column, so every row was rejected and nothing
   * ever reached the site.
   *
   * The column names are the reverse of what they suggest: `category` holds the
   * top-level group and `sub_category` holds the finer value. That reversal is
   * exactly why this was written wrong, and it is why the mapping lives in one
   * named function rather than being done by hand at each write site.
   */
  it('maps a browse category to its top-level group', () => {
    expect(topCategoryFor('dairy')).toBe('fresh')
  })

  it('only ever returns a value the CHECK constraint allows', () => {
    const allowed = new Set(['fresh', 'long-life', 'non-food'])
    for (const c of BROWSE_CATEGORIES) {
      const top = topCategoryFor(c.id)
      expect(top).not.toBeNull()
      expect(allowed.has(top as string)).toBe(true)
    }
  })

  it('never passes a browse category through unchanged', () => {
    // The precise defect: 'dairy' reaching deals.category unmapped.
    for (const c of BROWSE_CATEGORIES) {
      if (c.id === 'fresh' || c.id === 'long-life' || c.id === 'non-food') continue
      expect(topCategoryFor(c.id)).not.toBe(c.id)
    }
  })

  it('returns null for something that is not a browse category', () => {
    expect(topCategoryFor('tinned-goods')).toBeNull()
    expect(topCategoryFor(null)).toBeNull()
  })
})

describe('dealToRow rounds discount_percent for its INTEGER column', () => {
  /**
   * THE DEFECT, measured in production 2026-09-12:
   *
   *   Upsert batch 5 failed: invalid input syntax for type integer:
   *   "33.33333333333333"
   *
   * 80 of 480 deals were lost in one run. `deals.discount_percent` is INTEGER
   * (baseline.sql), but the collection domain models Discount.percent as a real
   * number ON PURPOSE — it distinguishes a retailer's PRINTED badge from one
   * calculated off the prices, and a calculated one is rarely whole.
   *
   * The domain is right to keep the precision. The row mapper is the boundary
   * where it has to meet the column, and it was passing the value straight
   * through. Rounding belongs here, not in the domain.
   */
  const base: Deal = {
    store: 'denner',
    productName: 'Test',
    originalPrice: 3,
    salePrice: 2,
    discountPercent: 33.33333333333333,
    validFrom: '2026-09-12',
    validTo: '2026-09-18',
    imageUrl: null,
    sourceCategory: null,
    sourceUrl: null,
    category: 'fresh',
    subCategory: 'dairy',
  } as Deal

  it('rounds a calculated percentage to a whole number', () => {
    expect(dealToRow(base).discount_percent).toBe(33)
  })

  it('rounds half up, so 25.5 does not silently become 25', () => {
    expect(dealToRow({ ...base, discountPercent: 25.5 }).discount_percent).toBe(26)
  })

  it('leaves a printed whole percentage untouched', () => {
    // Retailers print whole numbers; those must survive unchanged.
    expect(dealToRow({ ...base, discountPercent: 40 }).discount_percent).toBe(40)
  })

  it('still defaults to 0 when there is no discount (the ALDI rule)', () => {
    expect(dealToRow({ ...base, discountPercent: null }).discount_percent).toBe(0)
  })

  it('never emits a fractional value for any plausible price pair', () => {
    // The property that matters: whatever the arithmetic produces, the column
    // gets an integer. One bad row failed a whole batch of 100.
    for (const [orig, sale] of [[3, 2], [7, 3], [9.95, 6.65], [1.45, 1.2], [62, 25.95]]) {
      const pct = ((orig - sale) / orig) * 100
      const value = dealToRow({ ...base, discountPercent: pct }).discount_percent
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})
