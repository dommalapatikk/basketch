import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { dedupeOffers } from '../../domain/offer'
import { unwrap } from '../../domain/result'
import { createValidityPeriod } from '../../domain/validity-period'
import {
  createDennerApiSource,
  mapItemToOffer,
  mapSourceAttributes,
  parseContentSize,
  parseDiscountBadge,
  parseInsteadPrice,
  parseResponse,
  requestBody,
} from './denner-api-source'

const FIXTURE = JSON.parse(readFileSync(join(__dirname, '__fixtures__/weekly-special-page1.json'), 'utf8'))
const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))

describe('parseInsteadPrice — real Denner strings', () => {
  it('reads a normal price', () => {
    expect(parseInsteadPrice('statt 2.25')).toBe(2.25)
    expect(parseInsteadPrice('statt 75.30')).toBe(75.3)
  })

  it('reads the Swiss whole-franc shorthand', () => {
    // Coop and Denner both print "10.–" for ten francs exactly.
    expect(parseInsteadPrice('statt 10.–')).toBe(10)
    expect(parseInsteadPrice('statt 31.-')).toBe(31)
  })

  it('returns null when there is no price', () => {
    expect(parseInsteadPrice(null)).toBeNull()
    expect(parseInsteadPrice('SPECIAL')).toBeNull()
    expect(parseInsteadPrice('')).toBeNull()
  })
})

describe('parseDiscountBadge — real Denner badges', () => {
  it('reads a percentage', () => {
    expect(parseDiscountBadge('25%')).toBe(25)
    expect(parseDiscountBadge('44%')).toBe(44)
  })

  it('reads the half-price badge as 50', () => {
    expect(parseDiscountBadge('½ PREIS')).toBe(50)
  })

  it('returns null for a label that is not a discount', () => {
    // This matters: "SPECIAL" must never become an invented percentage.
    expect(parseDiscountBadge('SPECIAL')).toBeNull()
    expect(parseDiscountBadge('AKTION')).toBeNull()
    expect(parseDiscountBadge(null)).toBeNull()
  })
})

describe('parseResponse — against the real captured response', () => {
  const parsed = parseResponse(FIXTURE, WEEK)

  it('maps every fixture slot into an Offer with no warnings', () => {
    expect(parsed.offers.length).toBe(5)
    expect(parsed.warnings).toEqual([])
  })

  it('carries Denner’s own category through — the reason this source matters', () => {
    const cats = parsed.offers.map((o) => o.sourceCategory)
    expect(cats).toContain('Fleisch/Wurst/Fisch')
    expect(cats).toContain('Brot/Backwaren')
    expect(cats.every((c) => c !== null)).toBe(true)
  })

  it('reads the normal discount case', () => {
    const o = parsed.offers.find((x) => x.productName.startsWith('Denner Schweinsnierstück'))
    expect(o).toBeDefined()
    expect(o?.salePrice.rappen).toBe(167)
    expect(o?.originalPrice?.rappen).toBe(225)
    expect(o?.discount?.percent).toBe(25)
    expect(o?.discount?.provenance).toBe('printed')
  })

  it('reads ½ PREIS as a 50% printed discount and it survives the consistency check', () => {
    const o = parsed.offers.find((x) => x.productName.includes('Luis Felipe'))
    expect(o?.salePrice.rappen).toBe(3765)
    expect(o?.originalPrice?.rappen).toBe(7530)
    expect(o?.discount?.percent).toBe(50)
  })

  it('THE ALDI RULE: an item with no "statt" price gets no discount', () => {
    // Denner's "SPECIAL" badge has no percentage and the item has no original
    // price. Both must come out null rather than invented.
    const o = parsed.offers.find((x) => x.productName.includes('Chickenballs'))
    expect(o).toBeDefined()
    expect(o?.originalPrice).toBeNull()
    expect(o?.discount).toBeNull()
  })

  it('derives validity from the promotion timestamps', () => {
    const o = parsed.offers[0]
    expect(o).toBeDefined()
    const validity = o!.validity
    expect(validity.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(validity.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(validity.to >= validity.from).toBe(true)
  })

  it('builds an absolute source URL from Denner’s relative itemUrl', () => {
    const o = parsed.offers[0]
    expect(o?.sourceUrl).toMatch(/^https:\/\/www\.denner\.ch\/de\/aktionen\//)
  })

  it('keeps the retailer image URL', () => {
    const withImage = parsed.offers.filter((o) => o.image?.kind === 'source-url')
    expect(withImage.length).toBeGreaterThan(0)
  })

  it('reports the API’s own totals so pagination can be driven from them', () => {
    expect(parsed.totalResults).toBe(246)
    expect(parsed.totalPages).toBe(11)
  })

  it('de-duplicates the repeated row the real API actually returns', () => {
    // The fixture deliberately contains the duplicate Denner sends.
    expect(dedupeOffers(parsed.offers)).toHaveLength(4)
  })
})

describe('requestBody — the pagination fix', () => {
  it('sends empty parameters for page 1', () => {
    expect(JSON.parse(requestBody(12, 1)).parameters).toEqual({})
  })

  it('puts refiningId INSIDE parameters for later pages', () => {
    // Top-level refiningId and prd_* keys both silently return page 1 —
    // this placement is the whole fix.
    const body = JSON.parse(requestBody(12, 2))
    expect(body.parameters.refiningId).toContain('prd_page=2')
    expect(body).not.toHaveProperty('refiningId')
    expect(body.parameters).not.toHaveProperty('prd_page')
  })

  it('has no leading ampersand on refiningId', () => {
    expect(JSON.parse(requestBody(12, 3)).parameters.refiningId.startsWith('&')).toBe(false)
  })

  it('targets the current week by default', () => {
    expect(JSON.parse(requestBody(12, 1)).pageId).toBe(12)
  })
})

describe('createDennerApiSource — collection behaviour', () => {
  const source = (fetchPage: (p: number, page: number) => Promise<unknown>, min = 1, maxPages = 2) =>
    createDennerApiSource({ fetchPage, fallbackValidity: WEEK, expectedMinimumOffers: min, maxPages })

  it('walks pages and accumulates offers', async () => {
    const calls: number[] = []
    const s = source(async (_pid, page) => {
      calls.push(page)
      return FIXTURE
    })
    const r = await s.fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.offers.length).toBe(10) // 5 slots x 2 pages
    expect(calls).toEqual([1, 2])
  })

  it('fails the whole source when page 1 is unreachable', async () => {
    const r = await source(async () => {
      throw new Error('HTTP 503')
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('source-unavailable')
      expect(r.detail).toContain('503')
    }
  })

  it('keeps page 1 data and warns when a later page fails', async () => {
    const r = await source(async (_pid, page) => {
      if (page > 1) throw new Error('HTTP 500')
      return FIXTURE
    }).fetchOffers('2026-W37')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.offers.length).toBe(5)
      expect(r.warnings.some((w) => w.message.includes('page 2 failed'))).toBe(true)
    }
  })

  it('reports below-expected-yield rather than a quiet short run', async () => {
    const r = await source(async () => FIXTURE, 100).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('below-expected-yield')
  })

  it('reports source-changed when the response shape no longer matches', async () => {
    const r = await source(async () => ({ blocks: { searches: [] } })).fetchOffers('2026-W37')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('source-changed')
  })

  it('never throws, whatever the API returns', async () => {
    for (const junk of [null, undefined, 'a string', 42, {}, { blocks: null }]) {
      const r = await source(async () => junk).fetchOffers('2026-W37')
      expect(r.ok).toBe(false)
    }
  })
})

describe('mapItemToOffer — defensive translation', () => {
  it('warns instead of throwing when the price is missing', () => {
    const r = mapItemToOffer({ sku: 'x', attributeInfo: [] }, WEEK)
    expect('warning' in r).toBe(true)
  })

  it('warns when the item has no name', () => {
    const r = mapItemToOffer({ sku: 'x', price: 1.5, attributeInfo: [] }, WEEK)
    expect('warning' in r).toBe(true)
  })
})

describe('parseContentSize — decoding Denner’s unit.g key', () => {
  it('reads "unit.g" as kilograms, cross-checked against nameSubline', () => {
    // "0.9 unit.g" sits beside nameSubline "am Stück, mager, ca. 900 g, per 100 g"
    expect(parseContentSize('0.9 unit.g')).toEqual({ amount: 0.9, unit: 'kg' })
    expect(parseContentSize('0.4 unit.g')).toEqual({ amount: 0.4, unit: 'kg' })
    expect(parseContentSize('0.38 unit.g')).toEqual({ amount: 0.38, unit: 'kg' })
  })

  it('reads a literal centilitre size', () => {
    expect(parseContentSize('75 cl')).toEqual({ amount: 75, unit: 'cl' })
  })

  it('converts decilitres to centilitres', () => {
    expect(parseContentSize('5 dl')).toEqual({ amount: 50, unit: 'cl' })
  })

  it('accepts a comma decimal separator', () => {
    expect(parseContentSize('1,5 l')).toEqual({ amount: 1.5, unit: 'l' })
  })

  it('returns null for junk rather than guessing', () => {
    expect(parseContentSize(null)).toBeNull()
    expect(parseContentSize('')).toBeNull()
    expect(parseContentSize('ca. 900 g pro Stück')).toBeNull()
    expect(parseContentSize('0 g')).toBeNull()
  })
})

describe('mapSourceAttributes — published metadata, never inferred', () => {
  const items = FIXTURE.blocks.searches
    .find((b: { blockName: string }) => b.blockName === 'Weekly special')
    .slots.map((s: { item: unknown }) => s.item)

  const byName = (name: string) =>
    items.find(
      (i: { attributeInfo?: { attributeName: string; vals?: { value?: string }[] }[] }) =>
        i.attributeInfo?.find((a) => a.attributeName === 'name')?.vals?.[0]?.value === name,
    )

  it('normalises a meat weight to grams', () => {
    const a = mapSourceAttributes(byName('Denner Schweinsnierstück'))
    expect(a.quantity).toEqual({ amount: 900, unit: 'g' })
  })

  it('keeps the nameSubline verbatim for tier-2 parsing', () => {
    const a = mapSourceAttributes(byName('Denner Schweinsnierstück'))
    expect(a.descriptor).toBe('am Stück, mager, ca. 900 g, per 100 g')
  })

  it('captures the eco label', () => {
    const a = mapSourceAttributes(byName('Denner Schweinsnierstück'))
    expect(a.labels).toContain('Suisse Garantie')
  })

  it('captures wine fields Denner publishes, so no model has to guess them', () => {
    const a = mapSourceAttributes(byName('Luis Felipe Edwards Terraced Carmenère Gran Reserva'))
    expect(a.wine).toEqual({
      colour: 'Rotwein',
      vintage: 2023,
      grape: 'Carménère',
      region: 'Colchagua Valley',
      country: 'Chile',
    })
    expect(a.quantity).toEqual({ amount: 750, unit: 'ml' })
    expect(a.packSize).toBe(6)
    expect(a.container).toBe('bottle')
  })

  it('leaves wine null for a non-wine product', () => {
    expect(mapSourceAttributes(byName('Carna Gallo Chickenballs Krispy')).wine).toBeNull()
  })

  it('never reads _tracking_item_brand — it holds the region for wine', () => {
    const a = mapSourceAttributes(byName('Luis Felipe Edwards Terraced Carmenère Gran Reserva'))
    expect(JSON.stringify(a)).not.toContain('brand')
  })

  it('survives an item with no attributes at all', () => {
    expect(mapSourceAttributes({}).labels).toEqual([])
    expect(mapSourceAttributes({}).quantity).toBeNull()
  })
})

describe('Offer carries sourceAttributes end to end', () => {
  it('attaches published metadata to the built offer', () => {
    const parsed = parseResponse(FIXTURE, WEEK)
    const wine = parsed.offers.find((o) => o.productName.startsWith('Luis Felipe'))
    expect(wine?.sourceAttributes.wine?.vintage).toBe(2023)
    expect(wine?.sourceAttributes.quantity).toEqual({ amount: 750, unit: 'ml' })
  })
})
