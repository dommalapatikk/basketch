import { describe, expect, it } from 'vitest'
import { printedDiscount } from '../../collection/domain/discount'
import { createMoney } from '../../collection/domain/money'
import { type Offer, createOffer } from '../../collection/domain/offer'
import { cropRegionImage, sourceUrlImage } from '../../collection/domain/product-image'
import { unwrap } from '../../collection/domain/result'
import { createValidityPeriod } from '../../collection/domain/validity-period'
import { dealStoreEnrichment, naturalKey, offerToUnifiedDeal } from './offer-to-unified'

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

describe('offerToUnifiedDeal — the shared path', () => {
  it('carries the fields UnifiedDeal can hold', () => {
    const o = offer({
      salePrice: unwrap(createMoney(1.67)),
      originalPrice: unwrap(createMoney(2.25)),
      discount: unwrap(printedDiscount(25)),
      sourceCategory: 'Fleisch/Wurst/Fisch',
    })
    const d = offerToUnifiedDeal(o)
    expect(d.salePrice).toBe(1.67)
    expect(d.originalPrice).toBe(2.25)
    expect(d.discountPercent).toBe(25)
    expect(d.sourceCategory).toBe('Fleisch/Wurst/Fisch')
    expect(d.validFrom).toBe('2026-09-10')
  })

  it('leaves discount NULL when there is no reference price — the ALDI rule', () => {
    // Roughly 40 of ALDI's 44 pages print no "statt" price. Back-computing one
    // would publish a saving that does not exist.
    const d = offerToUnifiedDeal(offer({ originalPrice: null }))
    expect(d.originalPrice).toBeNull()
    expect(d.discountPercent).toBeNull()
  })

  it('passes a plain image url straight through', () => {
    const d = offerToUnifiedDeal(offer({ image: unwrap(sourceUrlImage('https://denner.imgix.net/x.jpg')) }))
    expect(d.imageUrl).toContain('imgix')
  })

  it('drops a CropRegion — it has no single url, so the enrichment pass carries it', () => {
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    expect(offerToUnifiedDeal(offer({ image })).imageUrl).toBeNull()
  })
})

describe('dealStoreEnrichment — recovering what the mapper drops', () => {
  it('keys on the constraint the table actually enforces', () => {
    // Verified against the live schema: unique_deal is
    // (store, product_name, valid_from).
    const e = dealStoreEnrichment(offer())
    expect(e?.key).toBe(naturalKey('denner', 'Emmi Milch', '2026-09-10'))
  })

  it('always carries integer rappen — the NUMERIC columns are the lossy copy', () => {
    const e = dealStoreEnrichment(offer({ salePrice: unwrap(createMoney(0.3)) }))
    expect(e?.sale_price_rappen).toBe(30)
  })

  it('recovers the CropRegion the mapper dropped', () => {
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    const e = dealStoreEnrichment(offer({ retailer: 'spar', image }))
    expect(e?.page_image_url).toContain('p.jpg')
    expect(e?.crop_w).toBe(0.3)
    expect(e?.crop_h).toBe(0.4)
  })

  it('records a member price and its programme — the LIDL rule', () => {
    const e = dealStoreEnrichment(offer({ retailer: 'lidl', priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } }))
    expect(e?.price_basis).toBe('member-only')
    expect(e?.loyalty_programme).toBe('Lidl Plus')
  })

  it('marks an ordinary price as available to everyone', () => {
    const e = dealStoreEnrichment(offer())
    expect(e?.price_basis).toBe('everyone')
    expect(e?.loyalty_programme).toBeNull()
  })

  it('writes no crop columns for a source-url image', () => {
    const e = dealStoreEnrichment(offer({ image: unwrap(sourceUrlImage('https://a.test/x.jpg')) }))
    expect(e?.page_image_url).toBeNull()
    expect(e?.crop_x).toBeNull()
  })
})

describe('the two halves fit back together', () => {
  it('loses nothing between the mapper and the enrichment', () => {
    // The mapper is lossy BY DESIGN; this asserts the loss is recovered. If a
    // field is added to Offer and only to one half, this is what should fail.
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    const o = offer({
      retailer: 'lidl',
      salePrice: unwrap(createMoney(1.39)),
      image,
      priceBasis: { kind: 'member-only', programme: 'Lidl Plus' },
    })

    const d = offerToUnifiedDeal(o)
    const e = dealStoreEnrichment(o)

    // Dropped by the mapper…
    expect(d.imageUrl).toBeNull()
    // …recovered by the enrichment.
    expect(e?.page_image_url).toContain('p.jpg')
    expect(e?.price_basis).toBe('member-only')
    expect(e?.sale_price_rappen).toBe(139)
  })

  it('produces a key both halves agree on', () => {
    const o = offer({ retailer: 'spar', productName: 'Fleischkäse' })
    const d = offerToUnifiedDeal(o)
    expect(dealStoreEnrichment(o)?.key).toBe(naturalKey(d.store, d.productName, d.validFrom))
  })
})
