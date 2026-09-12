import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type OcrPage,
  createMigrosFlyerSource,
  findValidity,
  issuuDocUrl,
  parseFlyer,
  parseValidityLine,
} from './migros-flyer-source'

const PAGES: OcrPage[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'),
)
const REFERENCE = new Date('2026-09-09T00:00:00Z')

describe('issuuDocUrl', () => {
  it('builds the regional flyer URL', () => {
    expect(issuuDocUrl(36, 2026)).toBe('https://issuu.com/m-magazin/docs/migros-wochenflyer-36-2026-d-zh')
    expect(issuuDocUrl(36, 2026, 'os')).toContain('-d-os')
  })
})

describe('parseValidityLine — OCR reads this line reliably', () => {
  it('reads the printed window', () => {
    expect(parseValidityLine('Angebote gelten vom 3.9. bis 9.9.2026, solange Vorrat.', REFERENCE)).toEqual({
      from: '2026-09-03',
      to: '2026-09-09',
    })
  })

  it('falls back to the reference year when none is printed', () => {
    expect(parseValidityLine('gelten vom 3.9. bis 9.9.', REFERENCE)?.from).toBe('2026-09-03')
  })

  it('returns null on unrelated text', () => {
    expect(parseValidityLine('MIGROS MEGA DEAL', REFERENCE)).toBeNull()
  })
})

describe('findValidity — against real captured OCR', () => {
  it('finds the window somewhere in the flyer', () => {
    expect(findValidity(PAGES, REFERENCE)).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })
})

describe('parseFlyer — against real captured OCR', () => {
  const { offers, warnings } = parseFlyer(PAGES, REFERENCE, null)

  it('extracts offers', () => {
    expect(offers.length).toBeGreaterThan(0)
  })

  it('every offer has a verified price pair — never a derived one', () => {
    for (const o of offers) {
      expect(o.originalPrice).not.toBeNull()
      expect(o.originalPrice!.rappen).toBeGreaterThan(o.salePrice.rappen)
      expect(o.salePrice.rappen).toBeGreaterThan(0)
    }
  })

  it('DROPS an offer when OCR mangles the display price rather than deriving it', () => {
    // OCR returns tokens like "06'6" for 9.90. statt x (1 - discount) would give
    // 9.95 against a real shelf price of 9.90 — wrong by 5 rappen, published as
    // fact. Art. 3(1)(e) UWG makes that the expensive kind of mistake.
    const dropped = warnings.filter((w) => w.message.includes('dropped rather than derived'))
    expect(dropped.length).toBeGreaterThan(0)
  })

  it('applies the flyer’s own validity window to every offer', () => {
    expect(offers.every((o) => o.validity.from === '2026-09-03' && o.validity.to === '2026-09-09')).toBe(true)
  })

  it('keeps printed discounts consistent with the price pair', () => {
    for (const o of offers) {
      if (!o.discount || !o.originalPrice) continue
      const actual = ((o.originalPrice.rappen - o.salePrice.rappen) / o.originalPrice.rappen) * 100
      expect(Math.abs(actual - o.discount.percent)).toBeLessThanOrEqual(1.5)
    }
  })

  it('produces CropRegions inside the unit square', () => {
    const withImages = parseFlyer(PAGES, REFERENCE, null, (n) => `https://image.isu.pub/rev/jpg/page_${n}.jpg`)
    const cropped = withImages.offers.filter((o) => o.image?.kind === 'crop-region')
    expect(cropped.length).toBeGreaterThan(0)
    for (const o of cropped) {
      if (o.image?.kind !== 'crop-region') continue
      const r = o.image.region
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width).toBeLessThanOrEqual(1.000001)
      expect(r.y + r.height).toBeLessThanOrEqual(1.000001)
    }
  })

  it('never emits an empty product name', () => {
    expect(offers.every((o) => o.productName.trim().length > 0)).toBe(true)
  })

  it('leaves sourceCategory null for now', () => {
    // Migros is the ONLY retailer printing real category headings
    // ("Brot & Backwaren"). Associating them to products needs heading
    // detection that is not built yet — see the module header.
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })
})

describe('createMigrosFlyerSource', () => {
  const source = (over: Partial<Parameters<typeof createMigrosFlyerSource>[0]> = {}) =>
    createMigrosFlyerSource({
      loadPages: async () => PAGES,
      reference: REFERENCE,
      expectedMinimumOffers: 1,
      ...over,
    })

  it('collects from captured OCR', async () => {
    const r = await source().fetchOffers('2026-W36')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBeGreaterThan(0)
  })

  it('reports source-unavailable when pages cannot be loaded', async () => {
    const r = await source({
      loadPages: async () => {
        throw new Error('issuu 404')
      },
    }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports below-expected-yield when OCR degrades', async () => {
    // The yield floor is the guard against a silently bad OCR run.
    const r = await source({ expectedMinimumOffers: 500 }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed when OCR returns nothing', async () => {
    const r = await source({ loadPages: async () => [] }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('never throws on malformed OCR output', async () => {
    const junk = [{ pageNumber: 1, width: 0, height: 0, items: [{ text: '', box: [] }] }] as OcrPage[]
    const r = await source({ loadPages: async () => junk }).fetchOffers('2026-W36')
    expect(r.ok).toBe(false)
  })
})

/**
 * WHY A FLYER-LEVEL sourceUrl AND NOT null, 2026-09-12.
 *
 * This retailer publishes no per-product page, so sourceUrl was null. On the
 * site that made the card unclickable — and before that, when the card still
 * rendered `<a href="#">`, clicking a Migros product reloaded basketch.
 * That was the reported bug: "migros and aldi product urls goes to basketch
 * url not to companies link".
 *
 * Pointing at the flyer THIS OFFER WAS READ FROM is the honest destination.
 * It is the actual provenance of the price, it lets a visitor verify the
 * claim — which Art. 3(1)(e) UWG effectively requires of a price comparison —
 * and it is the same thing VolgHtmlSource already does with its page URL.
 *
 * Not a store homepage: a homepage does not evidence this week's price.
 */

describe('every offer points at the flyer it was read from', () => {
  const FLYER = issuuDocUrl(37, 2026)

  it('sets sourceUrl to the issuu flyer when one is supplied', () => {
    const { offers } = parseFlyer(PAGES, REFERENCE, null, undefined, FLYER)
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((o) => o.sourceUrl === FLYER)).toBe(true)
  })

  it('leaves sourceUrl null when no flyer url is supplied', () => {
    const { offers } = parseFlyer(PAGES, REFERENCE, null)
    expect(offers.every((o) => o.sourceUrl === null)).toBe(true)
  })
})
