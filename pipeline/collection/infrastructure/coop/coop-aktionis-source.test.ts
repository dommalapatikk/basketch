import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { dedupeOffers } from '../../domain/offer'
import {
  createCoopAktionisSource,
  mapCardToOffer,
  parseCardDate,
  parseCards,
  parseDiscountPercent,
  parsePage,
  parsePrice,
} from './coop-aktionis-source'

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/vendors-coop-page1.html'), 'utf8')

describe('parsePrice', () => {
  it('reads aktionis prices', () => {
    expect(parsePrice('4.45')).toBe(4.45)
    expect(parsePrice('101.70')).toBe(101.7)
  })

  it('reads whole-franc shorthand', () => {
    expect(parsePrice('10.–')).toBe(10)
  })

  it('returns null when absent', () => {
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice('gratis')).toBeNull()
  })
})

describe('parseDiscountPercent', () => {
  it('reads the badge', () => {
    expect(parseDiscountPercent('55%')).toBe(55)
    expect(parseDiscountPercent('53%')).toBe(53)
  })

  it('returns null without a percentage', () => {
    expect(parseDiscountPercent('AKTION')).toBeNull()
    expect(parseDiscountPercent(null)).toBeNull()
  })
})

describe('parseCardDate — full year is printed, nothing inferred', () => {
  it('reads a same-week window', () => {
    expect(parseCardDate('07.09.2026 - 09.09.2026')).toEqual({ from: '2026-09-07', to: '2026-09-09' })
  })

  it('reads a long-running campaign window', () => {
    // Household lines run for weeks; the end date is what matters for expiry.
    expect(parseCardDate('27.08.2026 - 09.09.2026')).toEqual({ from: '2026-08-27', to: '2026-09-09' })
  })

  it('accepts an en-dash separator', () => {
    expect(parseCardDate('03.09.2026 – 09.09.2026')).toEqual({ from: '2026-09-03', to: '2026-09-09' })
  })

  it('returns null on anything else', () => {
    expect(parseCardDate('noch 3 Tage')).toBeNull()
    expect(parseCardDate(null)).toBeNull()
  })
})

describe('parsePage — against the real captured page', () => {
  const { offers, warnings } = parsePage(FIXTURE)

  it('extracts every card with no warnings', () => {
    expect(parseCards(FIXTURE).length).toBeGreaterThan(0)
    expect(offers.length).toBe(parseCards(FIXTURE).length)
    expect(warnings).toEqual([])
  })

  it('reads a card exactly', () => {
    const o = offers.find((x) => x.productName.startsWith('Lindt Matcha'))
    expect(o?.salePrice.rappen).toBe(445)
    expect(o?.originalPrice?.rappen).toBe(995)
    expect(o?.discount?.percent).toBe(55)
    expect(o?.discount?.provenance).toBe('printed')
    expect(o?.validity).toEqual({ from: '2026-09-07', to: '2026-09-09' })
  })

  it('carries per-deal validity windows, not one shared week', () => {
    // Real aktionis data has campaigns starting on different dates but ending
    // together. Flattening them to one window would misstate when an offer began.
    const froms = new Set(offers.map((o) => o.validity.from))
    expect(froms.size).toBeGreaterThan(1)
    expect(new Set(offers.map((o) => o.validity.to))).toEqual(new Set(['2026-09-09']))
  })

  it('hotlinks the image rather than copying it', () => {
    const o = offers.find((x) => x.productName.startsWith('Lindt Matcha'))
    expect(o?.image?.kind).toBe('source-url')
    if (o?.image?.kind === 'source-url') expect(o.image.url).toContain('storage.cpstatic.ch')
  })

  it('builds an absolute source URL', () => {
    expect(offers.every((o) => o.sourceUrl?.startsWith('https://www.aktionis.ch/deals/'))).toBe(true)
  })

  it('leaves sourceCategory null — aktionis labels are not Coop’s own', () => {
    // aktionis publishes a 39-label taxonomy, but it is a third party's
    // labelling. Passing it as sourceCategory would misrepresent provenance.
    expect(offers.every((o) => o.sourceCategory === null)).toBe(true)
  })

  it('de-duplicates the repeated cards aktionis actually serves', () => {
    // The fixture contains the duplicate "Soave Classico" rows from the live page.
    expect(dedupeOffers(offers).length).toBeLessThan(offers.length)
  })

  it('every printed discount is consistent with its prices', () => {
    for (const o of offers) {
      if (!o.originalPrice || !o.discount) continue
      const actual = ((o.originalPrice.rappen - o.salePrice.rappen) / o.originalPrice.rappen) * 100
      expect(Math.abs(actual - o.discount.percent)).toBeLessThanOrEqual(1.5)
    }
  })
})

describe('mapCardToOffer — defensive', () => {
  it('warns on a card with no title', () => {
    expect('warning' in mapCardToOffer('<div data-upox-id="1"></div>')).toBe(true)
  })

  it('warns when the validity window is missing', () => {
    const card = '<div data-upox-id="1"><h3 class="card-title">X</h3><span class="price-new">1.00</span></div>'
    const r = mapCardToOffer(card)
    expect('warning' in r).toBe(true)
    if ('warning' in r) expect(r.warning).toContain('validity')
  })
})

describe('createCoopAktionisSource', () => {
  const source = (fetchPage: (p: number) => Promise<string>, min = 1, maxPages = 5) =>
    createCoopAktionisSource({ fetchPage, expectedMinimumOffers: min, maxPages })

  it('stops when a page repeats ids, not when the widget runs out of links', async () => {
    // The pagination widget shows only 6 links though ~20 pages exist, so the
    // adapter walks until it sees nothing new.
    let calls = 0
    const r = await source(async () => {
      calls++
      return FIXTURE
    }).fetchOffers('2026-W37')
    expect(calls).toBe(2) // page 2 repeats page 1's ids -> stop
    expect(r.ok).toBe(true)
  })

  it('accumulates across pages with distinct ids', async () => {
    const pageTwo = FIXTURE.replace(/data-upox-id="(\d+)"/g, (_m, id) => `data-upox-id="9${id}"`)
    const r = await source(async (p) => (p === 1 ? FIXTURE : p === 2 ? pageTwo : '')).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBe(parseCards(FIXTURE).length * 2)
  })

  it('fails the source when page 1 is unreachable', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 503')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-unavailable')
  })

  it('keeps earlier pages and warns when a later page fails', async () => {
    const pageTwo = FIXTURE.replace(/data-upox-id="(\d+)"/g, (_m, id) => `data-upox-id="9${id}"`)
    const r = await source(async (p) => {
      if (p === 1) return FIXTURE
      if (p === 2) return pageTwo
      throw new Error('HTTP 500')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warnings.some((w) => w.message.includes('page 3 failed'))).toBe(true)
  })

  it('reports below-expected-yield rather than a quiet short run', async () => {
    const r = await source(async () => FIXTURE, 300).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed when the markup no longer matches', async () => {
    const r = await source(async () => '<html><body>redesigned</body></html>').fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('never throws on malformed input', async () => {
    for (const junk of ['', '<div data-upox-id="1">', '<<<>>>']) {
      const r = await source(async () => junk).fetchOffers('2026-W37')
      expect(r.ok).toBe(false)
    }
  })
})
