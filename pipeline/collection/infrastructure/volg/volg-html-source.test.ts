import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createVolgHtmlSource,
  parsePage,
  parseReduction,
  parseSectionDates,
  parseSwissPrice,
  splitSections,
} from './volg-html-source'

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/wochenaktionen.html'), 'utf8')
// The fixture was captured in KW37 2026.
const REFERENCE = new Date('2026-09-09T00:00:00Z')

describe('parseSwissPrice', () => {
  it('reads a normal price', () => {
    expect(parseSwissPrice('6.90')).toBe(6.9)
    expect(parseSwissPrice(' statt 9.20')).toBe(9.2)
  })

  it('reads the whole-franc shorthand', () => {
    expect(parseSwissPrice('10.–')).toBe(10)
  })

  it('returns null when absent', () => {
    expect(parseSwissPrice(null)).toBeNull()
    expect(parseSwissPrice('gratis')).toBeNull()
  })
})

describe('parseReduction', () => {
  it('reads Volg’s negative percentage badge', () => {
    expect(parseReduction('-25%')).toBe(25)
    expect(parseReduction(' -33% ')).toBe(33)
  })

  it('returns null when there is no percentage', () => {
    expect(parseReduction('AKTION')).toBeNull()
    expect(parseReduction(null)).toBeNull()
  })
})

describe('parseSectionDates — no year is printed on the page', () => {
  it('infers the year from the reference date', () => {
    const v = parseSectionDates('Mi. 09.09. bis Sa. 12.09.', REFERENCE)
    expect(v).toEqual({ from: '2026-09-09', to: '2026-09-12' })
  })

  it('handles the Monday–Saturday window', () => {
    expect(parseSectionDates('Mo. 07.09. bis Sa. 12.09.', REFERENCE)).toEqual({
      from: '2026-09-07',
      to: '2026-09-12',
    })
  })

  it('rolls into next year for a December page listing January dates', () => {
    const dec = new Date('2026-12-28T00:00:00Z')
    expect(parseSectionDates('Mo. 04.01. bis Sa. 09.01.', dec)).toEqual({ from: '2027-01-04', to: '2027-01-09' })
  })

  it('handles a window straddling the year boundary', () => {
    const dec = new Date('2026-12-28T00:00:00Z')
    expect(parseSectionDates('Mo. 28.12. bis Sa. 02.01.', dec)).toEqual({ from: '2026-12-28', to: '2027-01-02' })
  })

  it('returns null when no date range is present', () => {
    expect(parseSectionDates('Weitere Aktionen', REFERENCE)).toBeNull()
  })
})

describe('splitSections — against the real page', () => {
  const sections = splitSections(FIXTURE, REFERENCE)

  it('finds the three promo sections', () => {
    const titles = sections.map((s) => s.title)
    expect(titles).toContain('Frische-Aktionen')
    expect(titles).toContain('Volg-Aktionen')
    expect(titles.some((t) => t.startsWith('Weitere Aktionen'))).toBe(true)
  })

  it('gives Frische-Aktionen its own shorter window', () => {
    // This is the point of splitting: fresh runs Wed-Sat, the rest Mon-Sat.
    // Applying one window to all would publish fresh items two days early.
    const fresh = sections.find((s) => s.title === 'Frische-Aktionen')
    const volg = sections.find((s) => s.title === 'Volg-Aktionen')
    expect(fresh?.validity?.from).toBe('2026-09-09')
    expect(volg?.validity?.from).toBe('2026-09-07')
    expect(fresh?.validity?.to).toBe(volg?.validity?.to)
  })
})

describe('parsePage — against the real page', () => {
  const { offers, warnings } = parsePage(FIXTURE, REFERENCE)

  it('extracts every product with no warnings', () => {
    expect(offers).toHaveLength(25)
    expect(warnings).toEqual([])
  })

  it('every offer has both prices and a discount', () => {
    // Volg is the cleanest source: all 25 carry promo price, statt price and %.
    expect(offers.every((o) => o.originalPrice !== null)).toBe(true)
    expect(offers.every((o) => o.discount !== null)).toBe(true)
    expect(offers.every((o) => o.salePrice.rappen > 0)).toBe(true)
  })

  it('reads the first product exactly', () => {
    const o = offers.find((x) => x.productName === 'Findus Plätzli')
    expect(o?.salePrice.rappen).toBe(690)
    expect(o?.originalPrice?.rappen).toBe(920)
    expect(o?.discount?.percent).toBe(25)
    expect(o?.discount?.provenance).toBe('printed')
  })

  it('keeps the retailer image as an absolute URL', () => {
    const o = offers.find((x) => x.productName === 'Findus Plätzli')
    expect(o?.image?.kind).toBe('source-url')
    if (o?.image?.kind === 'source-url') {
      expect(o.image.url).toBe('https://www.volg.ch/fileadmin/_processed_/5/5/csm_promo_75895_de_156ace7fc2.jpg')
    }
  })

  it('assigns each product its own section’s validity', () => {
    const froms = new Set(offers.map((o) => o.validity.from))
    // Two distinct start dates: 09.09 for fresh, 07.09 for the rest.
    expect(froms).toEqual(new Set(['2026-09-09', '2026-09-07']))
  })

  it('sets sourceCategory to null — Volg publishes no taxonomy', () => {
    // The three sections are promo types, not categories. Claiming otherwise
    // would feed the categoriser a false signal.
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })

  it('points sourceUrl at the page, since Volg has no per-product links', () => {
    expect(offers.every((o) => o.sourceUrl === 'https://www.volg.ch/sortiment/wochenaktionen/')).toBe(true)
  })

  it('printed discounts are consistent with the printed prices', () => {
    // createOffer would have rejected any badge that disagreed with the pair,
    // so reaching 25 offers proves all 25 are internally consistent.
    for (const o of offers) {
      const actual = ((o.originalPrice!.rappen - o.salePrice.rappen) / o.originalPrice!.rappen) * 100
      expect(Math.abs(actual - o.discount!.percent)).toBeLessThanOrEqual(1.5)
    }
  })
})

describe('createVolgHtmlSource', () => {
  const source = (fetchPage: () => Promise<string>, min = 10) =>
    createVolgHtmlSource({ fetchPage, reference: REFERENCE, expectedMinimumOffers: min })

  it('collects the full page', async () => {
    const r = await source(async () => FIXTURE).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers).toHaveLength(25)
  })

  it('reports source-unavailable when the page cannot be fetched', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 503')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('reports source-changed when the markup no longer matches', async () => {
    const r = await source(async () => '<html><body>redesigned</body></html>').fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('reports below-expected-yield on a suspiciously short page', async () => {
    const r = await source(async () => FIXTURE, 100).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('never throws on malformed input', async () => {
    for (const junk of ['', '<div class="c-product">', '<<<>>>']) {
      const r = await source(async () => junk).fetchOffers('2026-W37')
      expect(r.ok).toBe(false)
    }
  })
})
