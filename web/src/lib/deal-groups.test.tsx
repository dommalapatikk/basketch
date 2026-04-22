// Regression test: `_uncategorised` must never leak into the UI.
// Tests the pure grouping helper directly to avoid pulling the supabase
// client import chain (which throws in CI when VITE_SUPABASE_* is unset).

import { describe, it, expect } from 'vitest'

import type { DealRow } from '@shared/types'

import { groupDealsBySubCategory } from './deal-groups'

function makeRow(overrides: Partial<DealRow> = {}): DealRow {
  return {
    id: overrides.id ?? 'row-' + Math.random(),
    store: 'migros',
    product_name: 'test',
    category: 'long-life',
    sub_category: null,
    original_price: null,
    sale_price: 1,
    discount_percent: 10,
    valid_from: '2026-04-22',
    valid_to: null,
    image_url: null,
    source_category: null,
    source_url: null,
    product_id: null,
    is_active: true,
    format: null,
    container: null,
    pack_size: null,
    unit_volume_ml: null,
    unit_weight_g: null,
    unit_count: null,
    canonical_unit: null,
    canonical_unit_value: null,
    price_per_unit: null,
    taxonomy_confidence: 0.7,
    fetched_at: '2026-04-22T00:00:00Z',
    created_at: '2026-04-22T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    ...overrides,
  }
}

describe('groupDealsBySubCategory — v4 field mapping', () => {
  it('copies pricePerUnit / canonicalUnit / format / container / packSize / unitVolumeMl from DealRow', () => {
    const rows = [
      makeRow({
        sub_category: 'water',
        store: 'lidl',
        price_per_unit: 0.29,
        canonical_unit: 'L',
        format: 'still',
        container: 'pet',
        pack_size: 6,
        unit_volume_ml: 1500,
      }),
    ]
    const bands = groupDealsBySubCategory(rows)
    const deal = bands[0]?.bandDeals[0]
    expect(deal?.pricePerUnit).toBe(0.29)
    expect(deal?.canonicalUnit).toBe('L')
    expect(deal?.format).toBe('still')
    expect(deal?.container).toBe('pet')
    expect(deal?.packSize).toBe(6)
    expect(deal?.unitVolumeMl).toBe(1500)
  })

  it('returns totalDealCount = raw row count per band', () => {
    const rows = [
      makeRow({ id: 'a', sub_category: 'water', store: 'lidl' }),
      makeRow({ id: 'b', sub_category: 'water', store: 'lidl' }),
      makeRow({ id: 'c', sub_category: 'water', store: 'migros' }),
    ]
    const bands = groupDealsBySubCategory(rows)
    expect(bands[0]?.totalDealCount).toBe(3)
    // per-store collapsing still applies
    expect(bands[0]?.bandDeals.length).toBe(2)
  })

  it('leaves v4 fields undefined when DealRow has nulls', () => {
    const bands = groupDealsBySubCategory([makeRow({ sub_category: 'water' })])
    const deal = bands[0]?.bandDeals[0]
    expect(deal?.pricePerUnit).toBeUndefined()
    expect(deal?.format).toBeUndefined()
  })
})

describe('groupDealsBySubCategory — _uncategorised regression', () => {
  it('never emits a band with a label starting with "_"', () => {
    const rows = [
      makeRow({ sub_category: null, store: 'migros' }),
      makeRow({ sub_category: null, store: 'coop' }),
      makeRow({ sub_category: 'water', store: 'lidl' }),
    ]
    const bands = groupDealsBySubCategory(rows)
    for (const band of bands) {
      expect(band.label.startsWith('_')).toBe(false)
      expect(band.subCategory.startsWith('_')).toBe(false)
    }
  })

  it('groups null sub_category rows under a single "Other" band', () => {
    const rows = [
      makeRow({ id: 'a', sub_category: null, store: 'migros' }),
      makeRow({ id: 'b', sub_category: null, store: 'coop' }),
    ]
    const bands = groupDealsBySubCategory(rows)
    const otherBands = bands.filter((b) => b.label === 'Other')
    expect(otherBands).toHaveLength(1)
  })

  it('preserves known sub_category labels', () => {
    const rows = [makeRow({ sub_category: 'water', store: 'lidl' })]
    const bands = groupDealsBySubCategory(rows)
    expect(bands[0]?.label).toBe('Water')
  })
})
