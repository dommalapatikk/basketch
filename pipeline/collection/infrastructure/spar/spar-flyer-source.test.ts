import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { unwrap } from '../../domain/result'
import { createValidityPeriod } from '../../domain/validity-period'
import { parseBboxXml } from '../pdf/pdf-words'
import { clusterIntoTiles } from '../pdf/tile-locator'
import {
  createSparFlyerSource,
  findFlyerValidity,
  flyerPageUrl,
  flyerPdfUrl,
  parseFlyer,
  parseFlyerValidity,
} from './spar-flyer-source'

const XML = readFileSync(join(__dirname, '__fixtures__/flyer-kw37-pages1-3.xml'), 'utf8')
const PAGES = parseBboxXml(XML)
const FALLBACK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))

describe('flyerPdfUrl', () => {
  it('builds the weekly URL with a zero-padded week', () => {
    expect(flyerPdfUrl(2026, 37)).toBe('https://angebote.spar.ch/flugblatt/2026/spar-angebote-kw37-2026/GetPDF.ashx')
    expect(flyerPdfUrl(2026, 5)).toContain('kw05-2026')
  })
})

describe('parseFlyerValidity — SPAR prints a two-digit year', () => {
  it('reads the real printed line', () => {
    // "Angebote der Woche: Gültig von Do., 10.09.26 – Mi., 16.09.26"
    expect(parseFlyerValidity('Angebote der Woche: Gültig von Do., 10.09.26 – Mi., 16.09.26')).toEqual({
      from: '2026-09-10',
      to: '2026-09-16',
    })
  })

  it('accepts a four-digit year too', () => {
    expect(parseFlyerValidity('Gültig von 10.09.2026 - 16.09.2026')).toEqual({
      from: '2026-09-10',
      to: '2026-09-16',
    })
  })

  it('returns null when no range is present', () => {
    expect(parseFlyerValidity('Vielfalt zu attraktiven Preisen')).toBeNull()
  })
})

describe('findFlyerValidity — against the real flyer', () => {
  it('finds the window on the front pages', () => {
    expect(findFlyerValidity(PAGES)).toEqual({ from: '2026-09-10', to: '2026-09-16' })
  })
})

describe('parseBboxXml — against the real flyer', () => {
  it('reads pages with A4 dimensions and positioned words', () => {
    expect(PAGES).toHaveLength(3)
    expect(PAGES[0]?.widthPt).toBeCloseTo(595.28, 1)
    expect(PAGES[0]?.heightPt).toBeCloseTo(841.89, 1)
    expect(PAGES[0]!.words.length).toBeGreaterThan(20)
  })

  it('every word carries a positive-area box', () => {
    for (const p of PAGES) {
      for (const w of p.words) {
        expect(w.xMax).toBeGreaterThan(w.xMin)
        expect(w.yMax).toBeGreaterThan(w.yMin)
      }
    }
  })
})

describe('clusterIntoTiles — the geometry that makes flyers parseable', () => {
  it('groups a page into product tiles', () => {
    const page3 = PAGES[2]!
    const tiles = clusterIntoTiles(page3.words).filter((t) =>
      t.words.some((w) => w.text.toLowerCase() === 'statt'),
    )
    // Page 3 of KW37 carries 7 products.
    expect(tiles.length).toBeGreaterThanOrEqual(5)
    for (const t of tiles) {
      expect(t.xMax).toBeGreaterThan(t.xMin)
      expect(t.yMax).toBeGreaterThan(t.yMin)
    }
  })

  it('a wider gap threshold merges neighbouring products — why 55/30 was chosen', () => {
    const page3 = PAGES[2]!
    const tight = clusterIntoTiles(page3.words).filter((t) => t.words.some((w) => w.text === 'statt')).length
    const loose = clusterIntoTiles(page3.words, { maxGapX: 120, maxGapY: 90 }).filter((t) =>
      t.words.some((w) => w.text === 'statt'),
    ).length
    expect(loose).toBeLessThan(tight)
  })
})

describe('parseFlyer — against the real flyer', () => {
  const { offers, warnings } = parseFlyer(PAGES, FALLBACK)

  it('extracts real products', () => {
    expect(offers.length).toBeGreaterThan(8)
  })

  it('every offer has both prices, and the original exceeds the sale price', () => {
    for (const o of offers) {
      expect(o.originalPrice).not.toBeNull()
      expect(o.originalPrice!.rappen).toBeGreaterThan(o.salePrice.rappen)
    }
  })

  it('reads a known product exactly', () => {
    const o = offers.find((x) => x.productName.includes('Fleischkäse'))
    expect(o).toBeDefined()
    expect(o?.salePrice.rappen).toBe(595)
    expect(o?.originalPrice?.rappen).toBe(1050)
    expect(o?.discount?.percent).toBe(43)
  })

  it('refuses tiles that merge two products rather than guessing the pairing', () => {
    // Mispairing a name with another product's price would publish a wrong
    // price, which is the one thing Art. 3(1)(e) UWG actually punishes.
    const merged = warnings.filter((w) => w.message.includes('merges'))
    expect(merged.every((w) => w.item?.startsWith('page '))).toBe(true)
  })

  it('leaves sourceCategory null — the flyer prints slogans, not categories', () => {
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })

  it('produces a CropRegion when a page image URL is supplied', () => {
    const withImages = parseFlyer(PAGES, FALLBACK, (n) => `https://example.test/spar/kw37/page-${n}.jpg`)
    const cropped = withImages.offers.filter((o) => o.image?.kind === 'crop-region')
    expect(cropped.length).toBeGreaterThan(0)
    for (const o of cropped) {
      if (o.image?.kind !== 'crop-region') continue
      const r = o.image.region
      // Fractions of the page, never points — see product-image.ts.
      for (const v of [r.x, r.y, r.width, r.height]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(r.x + r.width).toBeLessThanOrEqual(1.000001)
      expect(r.y + r.height).toBeLessThanOrEqual(1.000001)
    }
  })
})

describe('createSparFlyerSource', () => {
  const source = (loadPages: () => Promise<typeof PAGES>, min = 5) =>
    createSparFlyerSource({ loadPages, expectedMinimumOffers: min })

  it('collects from the flyer', async () => {
    const r = await source(async () => PAGES).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBeGreaterThan(8)
  })

  it('uses the flyer’s own printed validity, not the fallback', async () => {
    const r = await createSparFlyerSource({
      loadPages: async () => PAGES,
      expectedMinimumOffers: 5,
      fallbackValidity: unwrap(createValidityPeriod('2000-01-01', '2000-01-02')),
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers[0]?.validity).toEqual({ from: '2026-09-10', to: '2026-09-16' })
  })

  it('refuses to publish undated offers when no window can be found', async () => {
    const undated = PAGES.map((p) => ({ ...p, words: p.words.filter((w) => !/\d{2}\.\d{2}\.\d{2}/.test(w.text)) }))
    const r = await createSparFlyerSource({ loadPages: async () => undated, expectedMinimumOffers: 5 }).fetchOffers(
      '2026-W37',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('source-changed')
      expect(r.detail).toContain('validity')
    }
  })

  it('reports source-unavailable when the PDF cannot be loaded', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 404')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports below-expected-yield on a short flyer', async () => {
    const r = await source(async () => PAGES, 500).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed on an empty PDF', async () => {
    const r = await source(async () => []).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
  })
})

/**
 * WHY A FLYER-LEVEL sourceUrl AND NOT null, 2026-09-12.
 *
 * SPAR publishes no per-product page, so sourceUrl was null and the card was
 * unclickable — and before that, while the card still rendered `<a href="#">`,
 * clicking a SPAR product reloaded basketch.
 *
 * Pointing at the flyer THIS OFFER WAS READ FROM is the honest destination: it
 * is the provenance of the price and it lets a visitor verify the claim, which
 * Art. 3(1)(e) UWG effectively requires of a price comparison. VolgHtmlSource
 * already does exactly this with its page URL.
 */

describe('flyerPageUrl — the human-readable flyer behind the PDF endpoint', () => {
  it('is the PDF url without GetPDF.ashx', () => {
    expect(flyerPageUrl(2026, 37)).toBe(
      'https://angebote.spar.ch/flugblatt/2026/spar-angebote-kw37-2026/',
    )
    expect(flyerPdfUrl(2026, 37)).toBe(`${flyerPageUrl(2026, 37)}GetPDF.ashx`)
  })

  it('zero-pads the week the same way', () => {
    expect(flyerPageUrl(2026, 7)).toContain('kw07-2026')
  })
})

describe('every offer points at the flyer it was read from', () => {
  const FLYER = 'https://angebote.spar.ch/flugblatt/2026/spar-angebote-kw37-2026/'

  it('sets sourceUrl to the flyer url when one is supplied', () => {
    const { offers } = parseFlyer(PAGES, FALLBACK, undefined, FLYER)
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.sourceUrl === FLYER)).toBe(true)
  })

  it('leaves sourceUrl null when no flyer url is supplied', () => {
    const { offers } = parseFlyer(PAGES, FALLBACK)
    expect(offers.every((o) => o.sourceUrl === null)).toBe(true)
  })
})
