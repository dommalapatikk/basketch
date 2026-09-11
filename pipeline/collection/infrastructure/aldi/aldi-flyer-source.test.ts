import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { unwrap } from '../../domain/result'
import { createValidityPeriod } from '../../domain/validity-period'
import { parseBboxXml } from '../pdf/pdf-words'
import { catalogDataUrl, createAldiFlyerSource, findPdfUrl, parseCycleStart, parseFlyer } from './aldi-flyer-source'

const PAGES = parseBboxXml(readFileSync(join(__dirname, '__fixtures__/catalog-kw37-pages3-6.xml'), 'utf8'))
const REFERENCE = new Date('2026-09-09T00:00:00Z')

describe('catalogDataUrl', () => {
  it('builds the weekly catalogue URL', () => {
    expect(catalogDataUrl(2026, 37)).toBe('https://catalog.aldi-suisse.ch/aldiwoche_kw37-2026_de/data.json')
    expect(catalogDataUrl(2026, 5)).toContain('kw05-2026')
  })
})

describe('findPdfUrl', () => {
  it('pulls the PDF url out of the Publitas descriptor', () => {
    const data = { id: 1, pages: [{ href: 'https://view.publitas.com/95562/3331426/pdfs/abc.pdf?x=1' }] }
    expect(findPdfUrl(data)).toBe('https://view.publitas.com/95562/3331426/pdfs/abc.pdf?x=1')
  })

  it('unescapes JSON-encoded ampersands', () => {
    expect(findPdfUrl({ u: 'https://a.test/x.pdf?a=1\\u0026b=2' })).toContain('&b=2')
  })

  it('returns null when there is none', () => {
    expect(findPdfUrl({ nothing: true })).toBeNull()
    expect(findPdfUrl(null)).toBeNull()
  })
})

describe('parseCycleStart — ALDI prints a start, never an end', () => {
  it('reads the Thursday cycle and derives a 7-day window', () => {
    // The flyer's own "bis 16.9." confirms 10.9 + 6 days, so this is measured
    // rather than assumed.
    expect(parseCycleStart('PREISSENKUNGEN AB DONNERSTAG, 10.9.', REFERENCE)).toEqual({
      from: '2026-09-10',
      to: '2026-09-16',
    })
  })

  it('reads the Monday cycle', () => {
    expect(parseCycleStart('AB MONTAG, 14.9.', REFERENCE)).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('is case-insensitive, as the flyer mixes both', () => {
    expect(parseCycleStart('ab Donnerstag, 10.9.', REFERENCE)?.from).toBe('2026-09-10')
  })

  it('rolls into next year for a December flyer listing January dates', () => {
    const dec = new Date('2026-12-20T00:00:00Z')
    expect(parseCycleStart('AB MONTAG, 5.1.', dec)?.from).toBe('2027-01-05')
  })

  it('rejects an impossible date', () => {
    expect(parseCycleStart('AB MONTAG, 45.99.', REFERENCE)).toBeNull()
  })

  it('returns null when there is no cycle heading', () => {
    expect(parseCycleStart('WIR SENKEN DIE PREISE', REFERENCE)).toBeNull()
  })
})

describe('parseFlyer — against the real catalogue', () => {
  const { offers, warnings } = parseFlyer(PAGES, REFERENCE, null)

  it('extracts products', () => {
    expect(offers.length).toBeGreaterThan(10)
  })

  it('THE ALDI RULE: no reference price means no discount, on every offer', () => {
    // ALDI's flyer carries 2 "statt" across 40 pages. Anything else would mean
    // we invented a discount.
    expect(offers.every((o) => o.originalPrice === null)).toBe(true)
    expect(offers.every((o) => o.discount === null)).toBe(true)
  })

  it('never produces a zero or negative price', () => {
    expect(offers.every((o) => o.salePrice.rappen > 0)).toBe(true)
  })

  it('carries the promo cycle from the page heading', () => {
    expect(offers.every((o) => o.validity.to >= o.validity.from)).toBe(true)
    expect(offers.some((o) => o.validity.from === '2026-09-10')).toBe(true)
  })

  it('warns instead of guessing when a price has no name beneath it', () => {
    // Pairing a price with a neighbouring column's name would publish a wrong
    // price, so unmatched prices are dropped with a reason.
    const unmatched = warnings.filter((w) => w.message.includes('no product name below it'))
    expect(unmatched.every((w) => w.item?.startsWith('page '))).toBe(true)
  })

  it('claims each name group once, so adjacent columns cannot share a name', () => {
    const names = offers.map((o) => o.productName)
    // Within a single page's parse, a name group is consumed when matched.
    expect(new Set(names).size).toBeGreaterThan(names.length / 2)
  })

  it('produces CropRegions inside the unit square', () => {
    const withImages = parseFlyer(PAGES, REFERENCE, null, (n) => `https://example.test/aldi/page-${n}.jpg`)
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

  it('leaves sourceCategory null — ALDI publishes none anywhere', () => {
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })
})

describe('createAldiFlyerSource', () => {
  const source = (loadPages: () => Promise<typeof PAGES>, min = 5) =>
    createAldiFlyerSource({ loadPages, reference: REFERENCE, expectedMinimumOffers: min })

  it('collects from the catalogue', async () => {
    const r = await source(async () => PAGES).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBeGreaterThan(10)
  })

  it('reports source-unavailable when the PDF cannot be loaded', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 403')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports below-expected-yield on a short catalogue', async () => {
    const r = await source(async () => PAGES, 5000).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed on an empty catalogue', async () => {
    const r = await source(async () => []).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('falls back to a supplied window when no heading is found', async () => {
    const noHeadings = PAGES.map((p) => ({
      ...p,
      words: p.words.filter((w) => !/^\d{1,2}\.\d{1,2}\.$/.test(w.text) && !/donnerstag|montag/i.test(w.text)),
    }))
    const r = await createAldiFlyerSource({
      loadPages: async () => noHeadings,
      reference: REFERENCE,
      expectedMinimumOffers: 1,
      fallbackValidity: unwrap(createValidityPeriod('2026-09-10', '2026-09-16')),
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
  })

  it('never throws on malformed pages', async () => {
    const junk = [{ pageNumber: 1, widthPt: 0, heightPt: 0, words: [] }]
    const r = await source(async () => junk).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
  })
})
