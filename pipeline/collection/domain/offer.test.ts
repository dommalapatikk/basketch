import { describe, expect, it } from 'vitest'

import { printedDiscount } from './discount'
import { createMoney } from './money'
import { createOffer, dedupeOffers, offerKey } from './offer'
import { PRICE_FOR_EVERYONE, memberOnly } from './price-basis'
import { sourceUrlImage } from './product-image'
import { minimumQuantity } from './quantity-requirement'
import { isOk, unwrap } from './result'
import { createValidityPeriod } from './validity-period'

const chf = (n: number) => unwrap(createMoney(n))
const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
// Denner's real grid (WP-C2) — the offers below use Denner's real 1.67/2.25 pair.
const DENNER = { priceStepRappen: 1 }
const MIGROS = { priceStepRappen: 5 }

const base = {
  retailer: 'denner' as const,
  productName: 'Denner Schweinsnierstück',
  salePrice: chf(1.67),
  originalPrice: chf(2.25),
  validity: WEEK,
}

describe('Offer — basics', () => {
  it('builds a normal offer and derives the discount', () => {
    const o = unwrap(createOffer(base))
    expect(o.productName).toBe('Denner Schweinsnierstück')
    expect(o.discount?.provenance).toBe('derived')
    expect(o.discount?.percent).toBeCloseTo(25.78, 2)
    expect(o.priceBasis).toEqual(PRICE_FOR_EVERYONE)
  })

  it('keeps a printed badge rather than overwriting it', () => {
    const o = unwrap(createOffer({ ...base, discount: unwrap(printedDiscount(25, DENNER)) }))
    expect(o.discount?.percent).toBe(25)
    expect(o.discount?.provenance).toBe('printed')
  })

  it('trims the product name and rejects an empty one', () => {
    expect(unwrap(createOffer({ ...base, productName: '  Butter  ' })).productName).toBe('Butter')
    expect(isOk(createOffer({ ...base, productName: '   ' }))).toBe(false)
  })

  it('rejects an unknown retailer', () => {
    // @ts-expect-error deliberately violating the type at a boundary
    expect(isOk(createOffer({ ...base, retailer: 'otto-s' }))).toBe(false)
  })

  it('rejects a zero or negative sale price', () => {
    expect(isOk(createOffer({ ...base, salePrice: chf(0) }))).toBe(false)
  })

  it('rejects an original price that is not above the sale price', () => {
    expect(isOk(createOffer({ ...base, originalPrice: chf(1.67) }))).toBe(false)
    expect(isOk(createOffer({ ...base, originalPrice: chf(1.0) }))).toBe(false)
  })
})

describe('Offer — THE ALDI RULE: no original price means no discount', () => {
  it('accepts an offer with neither original price nor discount', () => {
    const o = unwrap(createOffer({ ...base, retailer: 'aldi', originalPrice: null }))
    expect(o.originalPrice).toBeNull()
    expect(o.discount).toBeNull()
  })

  it('refuses a discount when no original price exists', () => {
    const r = createOffer({
      ...base,
      retailer: 'aldi',
      originalPrice: null,
      discount: unwrap(printedDiscount(33, MIGROS)),
    })
    expect(isOk(r)).toBe(false)
  })

  it('never invents a discount to fill the gap', () => {
    const o = unwrap(createOffer({ ...base, retailer: 'aldi', originalPrice: null }))
    expect(o.discount).toBeNull()
  })
})

describe('Offer — THE LIDL RULE: member prices must name their programme', () => {
  it('carries the programme when the price is member-only', () => {
    // Real case: red grapes, JSON says 1.39, non-members pay 1.49.
    const o = unwrap(
      createOffer({
        retailer: 'lidl',
        productName: 'Trauben rot kernlos',
        salePrice: chf(1.39),
        originalPrice: null,
        validity: WEEK,
        priceBasis: unwrap(memberOnly('Lidl Plus')),
      }),
    )
    expect(o.priceBasis).toEqual({ kind: 'member-only', programme: 'Lidl Plus' })
  })

  it('rejects a member-only basis with no programme named', () => {
    const r = createOffer({
      ...base,
      retailer: 'lidl',
      // @ts-expect-error deliberately violating the type at a boundary
      priceBasis: { kind: 'member-only', programme: '' },
    })
    expect(isOk(r)).toBe(false)
  })

  it('defaults to a price everyone can pay', () => {
    expect(unwrap(createOffer(base)).priceBasis.kind).toBe('everyone')
  })
})

describe('Offer — printed badge consistency', () => {
  it('rejects a badge that cannot match the prices — a mis-paired parse', () => {
    const r = createOffer({ ...base, discount: unwrap(printedDiscount(70, DENNER)) })
    expect(isOk(r)).toBe(false)
  })

  it('tolerates the rounding retailers actually print', () => {
    // Migros: 9.90 from 14.85 printed as 33% (really 33.33%)
    const r = createOffer({
      retailer: 'migros',
      productName: 'Eierschwämme',
      salePrice: chf(9.9),
      originalPrice: chf(14.85),
      validity: WEEK,
      discount: unwrap(printedDiscount(33, MIGROS)),
    })
    expect(isOk(r)).toBe(true)
  })
})

describe('Offer — QuantityRequirement (WP-C4, TP-7a): a minimum below 2 cannot be constructed', () => {
  it('defaults to the single-item price when omitted', () => {
    expect(unwrap(createOffer(base)).quantityRequirement).toEqual({ kind: 'single' })
  })

  it('carries a "from 2 items" requirement built through the factory', () => {
    const o = unwrap(createOffer({ ...base, quantityRequirement: unwrap(minimumQuantity(2)) }))
    expect(o.quantityRequirement).toEqual({ kind: 'minimum', count: 2 })
  })

  it('re-enforces the invariant even when a caller bypasses the factory', () => {
    // QuantityRequirement is a plain union, so nothing stops a caller from
    // writing the literal object directly — the same shape of gap the LIDL
    // rule re-check above exists for.
    const r = createOffer({
      ...base,
      quantityRequirement: { kind: 'minimum', count: 1 },
    })
    expect(isOk(r)).toBe(false)
  })
})

describe('Offer — optional fields', () => {
  it('normalises a blank source category to null', () => {
    expect(unwrap(createOffer({ ...base, sourceCategory: '   ' })).sourceCategory).toBeNull()
    expect(unwrap(createOffer({ ...base, sourceCategory: 'Fleisch/Wurst/Fisch' })).sourceCategory).toBe(
      'Fleisch/Wurst/Fisch',
    )
  })

  it('accepts an image but does not require one', () => {
    expect(unwrap(createOffer(base)).image).toBeNull()
    const img = unwrap(sourceUrlImage('https://denner.imgix.net/x.png'))
    expect(unwrap(createOffer({ ...base, image: img })).image).toEqual(img)
  })
})

describe('Offer — de-duplication', () => {
  // Denner's own API returned these twice in one collection.
  const activia = {
    retailer: 'denner' as const,
    productName: 'Danone Activia Joghurt',
    salePrice: chf(5.2),
    originalPrice: chf(7.5),
    validity: WEEK,
  }

  it('treats two identical rows as one offer', () => {
    const a = unwrap(createOffer(activia))
    const b = unwrap(createOffer(activia))
    expect(offerKey(a)).toBe(offerKey(b))
    expect(dedupeOffers([a, b])).toHaveLength(1)
  })

  it('keeps genuinely different offers apart', () => {
    const a = unwrap(createOffer(activia))
    const differentPrice = unwrap(createOffer({ ...activia, salePrice: chf(4.9) }))
    const differentStore = unwrap(createOffer({ ...activia, retailer: 'coop' }))
    expect(dedupeOffers([a, differentPrice, differentStore])).toHaveLength(3)
  })

  it('does not collapse a member price into the public one', () => {
    const publicPrice = unwrap(createOffer({ ...activia, retailer: 'lidl' }))
    const memberPrice = unwrap(
      createOffer({ ...activia, retailer: 'lidl', priceBasis: unwrap(memberOnly('Lidl Plus')) }),
    )
    expect(dedupeOffers([publicPrice, memberPrice])).toHaveLength(2)
  })

  it('a multi-buy price never dedupes against the single-item price (WP-C4)', () => {
    // Same product, same store, same dates, same sale price even — the ONLY
    // difference is the quantity requirement. A shopper choosing between
    // "pay 5.20 for one" and "pay 5.20 each from 2" is choosing between two
    // real, different offers, not seeing the same one twice.
    const singleItem = unwrap(createOffer(activia))
    const multiBuy = unwrap(createOffer({ ...activia, quantityRequirement: unwrap(minimumQuantity(2)) }))
    expect(offerKey(singleItem)).not.toBe(offerKey(multiBuy))
    expect(dedupeOffers([singleItem, multiBuy])).toHaveLength(2)
  })

  it('two multi-buy offers with the same stated minimum still collapse as duplicates', () => {
    const a = unwrap(createOffer({ ...activia, quantityRequirement: unwrap(minimumQuantity(2)) }))
    const b = unwrap(createOffer({ ...activia, quantityRequirement: unwrap(minimumQuantity(2)) }))
    expect(offerKey(a)).toBe(offerKey(b))
    expect(dedupeOffers([a, b])).toHaveLength(1)
  })

  it('a "from 2" and a "from 3" requirement for the same product are kept apart', () => {
    const min2 = unwrap(createOffer({ ...activia, quantityRequirement: unwrap(minimumQuantity(2)) }))
    const min3 = unwrap(createOffer({ ...activia, quantityRequirement: unwrap(minimumQuantity(3)) }))
    expect(offerKey(min2)).not.toBe(offerKey(min3))
  })

  it('ignores whitespace and casing differences in the name', () => {
    const a = unwrap(createOffer(activia))
    const b = unwrap(createOffer({ ...activia, productName: 'danone  activia   joghurt' }))
    expect(dedupeOffers([a, b])).toHaveLength(1)
  })

  it('preserves source order', () => {
    const a = unwrap(createOffer(activia))
    const c = unwrap(createOffer({ ...activia, productName: 'Emmi Caffè Latte' }))
    expect(dedupeOffers([a, c, a]).map((o) => o.productName)).toEqual(['Danone Activia Joghurt', 'Emmi Caffè Latte'])
  })

  it('offerKey uses normalizeProductName — one definition of name identity shared with storage', () => {
    // normalizeProductName also standardises units ('500gr' -> '500g'), which
    // offerKey's own ad-hoc lowercase-and-collapse never did.
    const a = unwrap(createOffer({ ...activia, productName: 'Rivella 500gr' }))
    const b = unwrap(createOffer({ ...activia, productName: 'Rivella 500g' }))
    expect(offerKey(a)).toBe(offerKey(b))
  })
})

describe('Offer — de-duplication of display-truncated names (WP-C3 / HANDOVER item 8)', () => {
  const truncated = {
    retailer: 'coop' as const,
    productName: 'Soave Classico DOC Rocca Alata Cantina di Soave 6x 75cl...',
    salePrice: chf(15.9),
    originalPrice: chf(35.7),
    validity: WEEK,
  }

  it('keeps two truncated names distinct through collection — different sourceUrls (code review F3)', () => {
    // This is the exact defect: aktionis truncates the 2024 and 2025 vintage
    // to the identical title. Losing the vintage must not also lose the row
    // — at THIS layer. This is a collection-layer guarantee only: storage
    // (store.ts) upserts on (store, normalizeProductName(product_name),
    // valid_from), which has no sourceUrl column, so if the ACL's own
    // cross-check ever falls back to two IDENTICAL truncated names (the
    // "does not extend" warning path), the second row still overwrites the
    // first at write time. This test proves collectOffers never merges them
    // in memory; it does not prove the database keeps both.
    const vintage2025 = unwrap(
      createOffer({ ...truncated, sourceUrl: 'https://www.aktionis.ch/deals/soave-2025' }),
    )
    const vintage2024 = unwrap(
      createOffer({ ...truncated, sourceUrl: 'https://www.aktionis.ch/deals/soave-2024' }),
    )
    expect(offerKey(vintage2025)).not.toBe(offerKey(vintage2024))
    expect(dedupeOffers([vintage2025, vintage2024])).toHaveLength(2)
  })

  it('still collapses a genuinely repeated truncated card (same sourceUrl)', () => {
    const a = unwrap(createOffer({ ...truncated, sourceUrl: 'https://www.aktionis.ch/deals/soave-2025' }))
    const b = unwrap(createOffer({ ...truncated, sourceUrl: 'https://www.aktionis.ch/deals/soave-2025' }))
    expect(offerKey(a)).toBe(offerKey(b))
    expect(dedupeOffers([a, b])).toHaveLength(1)
  })

  it('a truncated name with no sourceUrl at all still keys distinctly from one that has one', () => {
    const withUrl = unwrap(createOffer({ ...truncated, sourceUrl: 'https://www.aktionis.ch/deals/soave-2025' }))
    const withoutUrl = unwrap(createOffer({ ...truncated, sourceUrl: null }))
    expect(offerKey(withUrl)).not.toBe(offerKey(withoutUrl))
  })

  it('untruncated names keep ignoring sourceUrl, as before', () => {
    const untruncated = {
      retailer: 'denner' as const,
      productName: 'Danone Activia Joghurt',
      salePrice: chf(5.2),
      originalPrice: chf(7.5),
      validity: WEEK,
    }
    const a = unwrap(createOffer({ ...untruncated, sourceUrl: 'https://a.test' }))
    const b = unwrap(createOffer({ ...untruncated, sourceUrl: 'https://b.test' }))
    expect(offerKey(a)).toBe(offerKey(b))
  })
})
