import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createLidlFlyerSource,
  decodeEntities,
  lidlSourceAttributes,
  flyerUrl,
  pagesMentioningLoyalty,
  parseFlyer,
  productPageIndex,
  readValidity,
  squash,
} from './lidl-flyer-source'

const FLYER = JSON.parse(readFileSync(join(__dirname, '__fixtures__/flyer-kw37.json'), 'utf8'))
const PDF_TEXT = readFileSync(join(__dirname, '__fixtures__/flyer-kw37-pages.txt'), 'utf8')

describe('flyerUrl', () => {
  it('builds the weekly endpoint', () => {
    expect(flyerUrl(37)).toBe('https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw37')
    expect(flyerUrl(5)).toContain('kw05')
  })
})

describe('squash — LIDL’s PDF separates every glyph', () => {
  it('makes "L i d l P l u s" findable', () => {
    // Real extracted text looks like "A b D o. 1 0. 9. bi s Mi. 1 6. 9."
    expect(squash('L i d l  P l u s')).toBe('lidlplus')
    expect(squash('A b D o. 1 0. 9.')).toBe('abdo.10.9.')
  })
})

describe('readValidity — offer window, not publication window', () => {
  it('uses offerStartDate/offerEndDate', () => {
    // The flyer publishes 2026-09-06 but offers run 2026-09-10 → 16. Using
    // startDate would publish every offer as valid four days early.
    expect(readValidity(FLYER.flyer)).toEqual({ from: '2026-09-10', to: '2026-09-16' })
    expect(FLYER.flyer.startDate).toBe('2026-09-06')
  })

  it('returns null when the offer window is missing', () => {
    expect(readValidity({ startDate: '2026-09-06', endDate: '2026-09-16' })).toBeNull()
  })
})

describe('pagesMentioningLoyalty — against the real PDF text', () => {
  const pages = pagesMentioningLoyalty(PDF_TEXT)

  it('finds the pages that mention Lidl Plus despite glyph spacing', () => {
    expect(pages.has(1)).toBe(true)
    expect(pages.has(2)).toBe(true)
    expect(pages.has(6)).toBe(true)
  })

  it('does not flag pages that are clean', () => {
    expect(pages.has(5)).toBe(false)
    expect(pages.has(9)).toBe(false)
  })
})

describe('productPageIndex', () => {
  it('maps every linked product to its page', () => {
    const index = productPageIndex(FLYER.flyer)
    expect(index.size).toBeGreaterThan(0)
    for (const page of index.values()) expect(page).toBeGreaterThan(0)
  })
})

describe('parseFlyer — THE LIDL RULE', () => {
  const { offers, warnings, droppedForLoyalty } = parseFlyer(FLYER, PDF_TEXT)

  it('drops products on pages that mention Lidl Plus', () => {
    // The JSON gives no loyalty flag at all, so a price on such a page cannot
    // be shown to be one anyone can pay.
    expect(droppedForLoyalty).toBeGreaterThan(0)
    expect(warnings.some((w) => w.message.includes('Lidl Plus'))).toBe(true)
  })

  it('keeps products from clean pages', () => {
    expect(offers.length).toBeGreaterThan(0)
  })

  it('keeps exactly the products that sit on clean pages', () => {
    // Compared by count, not by title: LIDL repeats titles across pages, so a
    // title lookup cannot tell a clean-page product from a loyalty-page one.
    const loyal = pagesMentioningLoyalty(PDF_TEXT)
    const pageOf = productPageIndex(FLYER.flyer)
    const eligible = Object.keys(FLYER.flyer.products).filter((key) => {
      const page = pageOf.get(key)
      return page !== undefined && !loyal.has(page)
    })
    expect(offers.length).toBe(eligible.length)
    expect(droppedForLoyalty).toBe(Object.keys(FLYER.flyer.products).length - eligible.length)
  })

  it('never publishes a bare member price', () => {
    // Everything published is payable by anyone.
    expect(offers.every((o) => o.priceBasis.kind === 'everyone')).toBe(true)
  })

  it('carries no discount — the JSON has no reference price', () => {
    expect(offers.every((o) => o.originalPrice === null && o.discount === null)).toBe(true)
  })

  it('uses the offer window on every offer', () => {
    expect(offers.every((o) => o.validity.from === '2026-09-10' && o.validity.to === '2026-09-16')).toBe(true)
  })

  it('leaves sourceCategory null — categoryPrimary is only Food/Non Food', () => {
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })

  it('keeps the retailer image and product link', () => {
    expect(offers.some((o) => o.image?.kind === 'source-url')).toBe(true)
    expect(offers.some((o) => o.sourceUrl?.includes('lidl.ch'))).toBe(true)
  })

  it('warns rather than throwing when the flyer is missing', () => {
    const r = parseFlyer({}, PDF_TEXT)
    expect(r.offers).toEqual([])
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('refuses everything when no offer window exists', () => {
    const noWindow = { flyer: { ...FLYER.flyer, offerStartDate: undefined, offerEndDate: undefined } }
    const r = parseFlyer(noWindow, PDF_TEXT)
    expect(r.offers).toEqual([])
  })
})

describe('createLidlFlyerSource', () => {
  const source = (over: Partial<Parameters<typeof createLidlFlyerSource>[0]> = {}) =>
    createLidlFlyerSource({
      fetchFlyer: async () => FLYER,
      fetchPdfText: async () => PDF_TEXT,
      expectedMinimumOffers: 1,
      ...over,
    })

  it('collects the verifiable offers', async () => {
    const r = await source().fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBeGreaterThan(0)
  })

  it('FAILS rather than publishing unverifiable prices when the PDF is unavailable', async () => {
    // The PDF is the only way to distinguish a public price from a Lidl Plus
    // price. Without it, nothing can be vouched for.
    const r = await source({
      fetchPdfText: async () => {
        throw new Error('HTTP 500')
      },
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('source-unavailable')
      expect(r.detail).toContain('cannot verify member prices')
    }
  })

  it('reports source-unavailable when the flyer JSON fails', async () => {
    const r = await source({
      fetchFlyer: async () => {
        throw new Error('HTTP 404')
      },
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports below-expected-yield on a short flyer', async () => {
    const r = await source({ expectedMinimumOffers: 5000 }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('never throws on malformed input', async () => {
    for (const junk of [null, undefined, 'text', 42, {}, { flyer: null }]) {
      const r = await source({ fetchFlyer: async () => junk }).fetchOffers('2026-W37')
      expect(r.ok).toBe(false)
    }
  })
})

describe('decodeEntities — Lidl escapes German', () => {
  it('decodes umlauts', () => {
    expect(decodeEntities('Pro 20 St&uuml;ck')).toBe('Pro 20 Stück')
    expect(decodeEntities('K&auml;se &Ouml;l Ma&szlig;')).toBe('Käse Öl Maß')
  })

  it('decodes symbols and dashes', () => {
    expect(decodeEntities('4/12 &ndash; 9/12 Nespresso&reg; kompatibel')).toBe(
      '4/12 – 9/12 Nespresso® kompatibel',
    )
  })

  it('decodes numeric entities', () => {
    expect(decodeEntities('caf&#233; &#x00e9;')).toBe('café é')
  })

  it('leaves an unknown entity untouched rather than mangling it', () => {
    expect(decodeEntities('a &notreal; b')).toBe('a &notreal; b')
  })
})

describe('lidlSourceAttributes — the description field', () => {
  it('captures the descriptor verbatim, decoded', () => {
    const a = lidlSourceAttributes({
      description: 'Diverse Sorten 4/12 &ndash; 9/12 Nespresso&reg; kompatibel Pro 20 St&uuml;ck',
    })
    expect(a.descriptor).toBe('Diverse Sorten 4/12 – 9/12 Nespresso® kompatibel Pro 20 Stück')
  })

  it('keeps origin and price basis for tier-2 parsing downstream', () => {
    const a = lidlSourceAttributes({ description: 'Herkunft: Schweiz Pro 2 x 250 g 100 g = 1.58' })
    expect(a.descriptor).toBe('Herkunft: Schweiz Pro 2 x 250 g 100 g = 1.58')
  })

  it('collapses runs of whitespace', () => {
    expect(lidlSourceAttributes({ description: 'Pro   390 g\n\n100 g = 0.51' }).descriptor).toBe(
      'Pro 390 g 100 g = 0.51',
    )
  })

  it('returns empty attributes when there is no description', () => {
    expect(lidlSourceAttributes({}).descriptor).toBeNull()
    expect(lidlSourceAttributes({ description: '   ' }).descriptor).toBeNull()
  })

  it('does not invent quantity — parsing the descriptor is component 2’s job', () => {
    const a = lidlSourceAttributes({ description: 'Herkunft: Italien Pro 2 kg 1 kg = 1.90' })
    expect(a.quantity).toBeNull()
    expect(a.unitPrice).toBeNull()
  })
})
