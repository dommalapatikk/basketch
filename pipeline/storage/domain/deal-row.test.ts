import { describe, expect, it } from 'vitest'
import { createMoney } from '../../collection/domain/money'
import { type Offer, createOffer } from '../../collection/domain/offer'
import { printedDiscount } from '../../collection/domain/discount'
import { cropRegionImage, sourceUrlImage } from '../../collection/domain/product-image'
import { unwrap } from '../../collection/domain/result'
import { createValidityPeriod } from '../../collection/domain/validity-period'
import { offerToRow, topCategoryFor } from './deal-row'
import type { Classified } from './deal-row'

const WEEK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

const offer = (over: Partial<Parameters<typeof createOffer>[0]> = {}): Offer =>
  unwrap(
    createOffer({
      retailer: 'denner',
      productName: 'Emmi Milch',
      salePrice: unwrap(createMoney(1.5)),
      validity: WEEK,
      ...over,
    }),
  )

const classified = (over: Partial<Classified> = {}): Classified => ({
  category: 'dairy',
  subCategory: 'dairy',
  confidence: 0.95,
  isUncertain: false,
  ...over,
})

describe('the column meanings are the reverse of their names', () => {
  it('writes the TOP-LEVEL group to `category`, not the browse id', () => {
    // Discovered the hard way: deals.category has a CHECK allowing only
    // fresh|long-life|non-food, so writing 'dairy' there fails outright.
    const row = offerToRow(offer(), classified(), 'run-1')
    expect(row.category).toBe('fresh')
    expect(row.sub_category).toBe('dairy')
  })

  it('maps each group correctly', () => {
    expect(topCategoryFor('dairy')).toBe('fresh')
    expect(topCategoryFor('snacks-sweets')).toBe('long-life')
    expect(topCategoryFor('beauty-hygiene')).toBe('non-food')
  })

  it('returns null for a category that does not exist', () => {
    expect(topCategoryFor('tinned-goods')).toBeNull()
  })
})

describe('uncertainty reaches the database (D3)', () => {
  it('writes NULL category rather than guessing', () => {
    // The old pipeline DELETED uncertain products. The bridge then held them
    // back because the column was NOT NULL. Now they can be stored honestly.
    const row = offerToRow(offer(), classified({ category: null, subCategory: null, isUncertain: true, confidence: 0 }), 'run-1')
    expect(row.category).toBeNull()
    expect(row.sub_category).toBeNull()
    expect(row.is_uncertain).toBe(true)
  })

  it('keeps the price on an uncertain product — the label is hidden, not the deal', () => {
    const row = offerToRow(offer(), classified({ category: null, isUncertain: true }), 'run-1')
    expect(row.sale_price).toBe(1.5)
    expect(row.sale_price_rappen).toBe(150)
  })
})

describe('the LIDL rule, persisted', () => {
  it('records the programme for a member-only price', () => {
    const o = offer({ priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } })
    const row = offerToRow(o, classified(), 'run-1')
    expect(row.price_basis).toBe('member-only')
    expect(row.loyalty_programme).toBe('Lidl Plus')
  })

  it('marks an ordinary price as available to everyone', () => {
    const row = offerToRow(offer(), classified(), 'run-1')
    expect(row.price_basis).toBe('everyone')
    expect(row.loyalty_programme).toBeNull()
  })
})

describe('the CropRegion that used to be discarded', () => {
  it('writes the crop and no image_url', () => {
    // Spar, Aldi and Migros had NO images at all before this: the region was
    // computed, validated, and then dropped on write.
    const image = unwrap(
      cropRegionImage({ pageImageUrl: 'https://image.isu.pub/rev/jpg/page_5.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
    )
    const row = offerToRow(offer({ retailer: 'migros', image }), classified(), 'run-1')
    expect(row.page_image_url).toContain('page_5.jpg')
    expect(row.crop_x).toBe(0.1)
    expect(row.crop_w).toBe(0.3) // domain calls it width; the column is crop_w
    expect(row.crop_h).toBe(0.4)
    expect(row.image_url).toBeNull()
  })

  it('writes a source url and no crop', () => {
    const image = unwrap(sourceUrlImage('https://denner.imgix.net/x.jpg'))
    const row = offerToRow(offer({ image }), classified(), 'run-1')
    expect(row.image_url).toContain('imgix')
    expect(row.page_image_url).toBeNull()
    expect(row.crop_x).toBeNull()
  })

  it('never writes both image kinds — the database rejects a row that does', () => {
    for (const img of [
      unwrap(sourceUrlImage('https://a.test/x.jpg')),
      unwrap(cropRegionImage({ pageImageUrl: 'https://b.test/p.jpg', x: 0, y: 0, width: 1, height: 1 })),
    ]) {
      const row = offerToRow(offer({ image: img }), classified(), 'run-1')
      expect(row.image_url === null || row.page_image_url === null).toBe(true)
    }
  })

  it('writes neither when the offer has no image', () => {
    const row = offerToRow(offer({ image: null }), classified(), 'run-1')
    expect(row.image_url).toBeNull()
    expect(row.page_image_url).toBeNull()
  })
})

describe('money keeps its integer form', () => {
  it('writes both rappen and francs during cutover', () => {
    const o = offer({
      salePrice: unwrap(createMoney(1.67)),
      originalPrice: unwrap(createMoney(2.25)),
      discount: unwrap(printedDiscount(25)),
    })
    const row = offerToRow(o, classified(), 'run-1')
    expect(row.sale_price_rappen).toBe(167)
    expect(row.original_price_rappen).toBe(225)
    expect(row.sale_price).toBe(1.67)
    expect(row.original_price).toBe(2.25)
  })

  it('survives a price that has no exact float form', () => {
    // 0.1 + 0.2 territory. Integer rappen is why the domain models money this way.
    const row = offerToRow(offer({ salePrice: unwrap(createMoney(0.3)) }), classified(), 'run-1')
    expect(row.sale_price_rappen).toBe(30)
  })
})

describe('the ALDI rule', () => {
  it('writes discount 0 rather than inventing one when there is no original price', () => {
    // Roughly 40 of ALDI's 44 flyer pages print no "statt" price at all.
    const row = offerToRow(offer({ originalPrice: null }), classified(), 'run-1')
    expect(row.original_price_rappen).toBeNull()
    expect(row.discount_percent).toBe(0)
  })
})

describe('traceability', () => {
  it('stamps every row with the run that produced it', () => {
    const row = offerToRow(offer(), classified({ classificationKey: 'emmi milch|t3|p1|s1' }), 'gha-1234567890')
    expect(row.run_id).toBe('gha-1234567890')
    expect(row.classification_key).toBe('emmi milch|t3|p1|s1')
  })
})

describe('storage is a facet, not a category (ADR-001)', () => {
  it('records frozen alongside the product family, not instead of it', () => {
    // Frozen salmon is meat-fish that happens to be frozen. Filing it as
    // "frozen" would put it nowhere near fresh salmon.
    const row = offerToRow(offer(), classified({ category: 'meat-fish', subCategory: 'fish', storage: 'frozen' }), 'run-1')
    expect(row.sub_category).toBe('fish')
    expect(row.storage).toBe('frozen')
    expect(row.category).toBe('fresh')
  })

  it('leaves storage null when it was not stated', () => {
    expect(offerToRow(offer(), classified(), 'run-1').storage).toBeNull()
  })
})

describe('attributes', () => {
  it('carries the per-category metadata as jsonb', () => {
    const row = offerToRow(offer(), classified({ attributes: { fatPercent: 3.5, salted: null } }), 'run-1')
    expect(row.attributes).toEqual({ fatPercent: 3.5, salted: null })
  })

  it('defaults to an empty object, never null', () => {
    expect(offerToRow(offer(), classified(), 'run-1').attributes).toEqual({})
  })
})
