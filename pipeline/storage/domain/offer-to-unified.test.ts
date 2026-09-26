import { describe, expect, it } from 'vitest'
import { printedDiscount } from '../../collection/domain/discount'
import { createMoney } from '../../collection/domain/money'
import { type Offer, createOffer } from '../../collection/domain/offer'
import { cropRegionImage, sourceUrlImage } from '../../collection/domain/product-image'
import { minimumQuantity } from '../../collection/domain/quantity-requirement'
import { unwrap } from '../../collection/domain/result'
import { createValidityPeriod } from '../../collection/domain/validity-period'
import { offerToUnifiedDeal } from './offer-to-unified'

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
      // Denner's real grid (WP-C2): fixture-verified 1.67 is not a multiple of 5.
      discount: unwrap(printedDiscount(25, { priceStepRappen: 1 })),
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
    expect(d.image?.kind).toBe('source-url')
    expect(d.image?.kind === 'source-url' && d.image.url).toContain('imgix')
  })

  // WP-1d (ADR-IMG-1): the mapper used to drop a CropRegion here — "it has no
  // single url" — and rely on a second write (dealStoreEnrichment) to carry
  // it on its own key. That gave the image two owners and a boundary where a
  // held-back deal, a `|` in the product name, or a Map-vs-dedupe mismatch
  // could silently lose the picture. Now it travels through whole.
  it('carries a CropRegion through losslessly — it rides the main upsert now', () => {
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    const d = offerToUnifiedDeal(offer({ image }))
    expect(d.image).toEqual(image)
  })

  it('leaves minQuantity null for the ordinary single-item price (WP-C4)', () => {
    expect(offerToUnifiedDeal(offer()).minQuantity).toBeNull()
  })

  it('carries a multi-buy quantity requirement through the main write', () => {
    const d = offerToUnifiedDeal(offer({ quantityRequirement: unwrap(minimumQuantity(2)) }))
    expect(d.minQuantity).toBe(2)
  })
})

// WP-1e: rappen, price basis and the loyalty programme used to be split off
// into a second, natural-key-matched write (dealStoreEnrichment). They now
// ride the main mapper, so the same guarantees are asserted here, on it.
describe('offerToUnifiedDeal — what the enrichment pass used to carry', () => {
  it('always carries integer rappen — the NUMERIC columns are the lossy copy', () => {
    const d = offerToUnifiedDeal(offer({ salePrice: unwrap(createMoney(0.3)) }))
    expect(d.salePriceRappen).toBe(30)
    expect(d.originalPriceRappen).toBeNull()
  })

  it('records a member price and its programme — the LIDL rule', () => {
    const d = offerToUnifiedDeal(offer({ retailer: 'lidl', priceBasis: { kind: 'member-only', programme: 'Lidl Plus' } }))
    expect(d.priceBasis).toBe('member-only')
    expect(d.loyaltyProgramme).toBe('Lidl Plus')
  })

  it('marks an ordinary price as available to everyone', () => {
    const d = offerToUnifiedDeal(offer())
    expect(d.priceBasis).toBe('everyone')
    expect(d.loyaltyProgramme).toBeNull()
  })

  it('carries image, rappen and price basis together in one value — nothing is split off', () => {
    const image = unwrap(cropRegionImage({ pageImageUrl: 'https://x.test/p.jpg', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }))
    const d = offerToUnifiedDeal(
      offer({
        retailer: 'lidl',
        salePrice: unwrap(createMoney(1.39)),
        image,
        priceBasis: { kind: 'member-only', programme: 'Lidl Plus' },
      }),
    )
    expect(d.image).toEqual(image)
    expect(d.priceBasis).toBe('member-only')
    expect(d.salePriceRappen).toBe(139)
  })
})
