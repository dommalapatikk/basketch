// WP-C2, code review finding F1 — the per-retailer rounding grid
// (`*_PRICE_STEP_RAPPEN`) is a silent correctness knob: nothing checked that
// the declared value actually matches the retailer's real shelf-price
// granularity. Mutating Denner 1->5, Volg 5->1, Spar 5->25 and Migros 5->50
// left all 1,156 tests green.
//
// This property test closes that gap in the DANGEROUS direction — a step
// declared COARSER than reality. (A step declared finer than reality is
// always safe: it only tightens `isConsistentWithPrices`, never loosens it,
// so there is nothing for a property test to catch there.) For every price
// each adapter's own `printedDiscount()` call site is wired to check against
// its own committed fixture, that price must be an exact multiple of the
// declared step — if it isn't, the retailer isn't really on that grid, and
// the badge check would tolerate more slack than the retailer's own
// rounding ever produces.
//
// Deliberately placed in `infrastructure/`, not `domain/`: it imports every
// adapter, which the domain layer must never do.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Offer } from '../domain/offer'
import { unwrap } from '../domain/result'
import { createValidityPeriod } from '../domain/validity-period'
import { COOP_PRICE_STEP_RAPPEN, parsePage as parseCoopPage } from './coop/coop-aktionis-source'
import { DENNER_PRICE_STEP_RAPPEN, parseResponse as parseDennerResponse } from './denner/denner-api-source'
import { MIGROS_PRICE_STEP_RAPPEN, parseFlyer as parseMigrosFlyer } from './migros/migros-flyer-source'
import { parseBboxXml } from './pdf/pdf-words'
import { SPAR_PRICE_STEP_RAPPEN, parseFlyer as parseSparFlyer } from './spar/spar-flyer-source'
import { VOLG_PRICE_STEP_RAPPEN, parsePage as parseVolgPage } from './volg/volg-html-source'

/** Every real money value an adapter emitted: the sale price and, when present, the original. */
function pricesRappen(offers: readonly Offer[]): number[] {
  const prices: number[] = []
  for (const o of offers) {
    prices.push(o.salePrice.rappen)
    if (o.originalPrice) prices.push(o.originalPrice.rappen)
  }
  return prices
}

/** Lists the offending (non-multiple) prices, in FRANCS, so a failure is readable without a calculator. */
function offGrid(prices: readonly number[], step: number): number[] {
  return prices.filter((p) => p % step !== 0).map((p) => p / 100)
}

describe('WP-C2 property (F1): every real price an adapter parses sits on its declared rounding grid', () => {
  it('Migros — every sale/original price on the KW36 fixture is a multiple of MIGROS_PRICE_STEP_RAPPEN', () => {
    const PAGES = JSON.parse(readFileSync(join(__dirname, 'migros/__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'))
    const { offers } = parseMigrosFlyer(PAGES, new Date('2026-09-09T00:00:00Z'), null)
    expect(offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappen(offers), MIGROS_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Coop — every sale/original price on the fixture is a multiple of COOP_PRICE_STEP_RAPPEN', () => {
    const FIXTURE = readFileSync(join(__dirname, 'coop/__fixtures__/vendors-coop-page1.html'), 'utf8')
    const { offers } = parseCoopPage(FIXTURE)
    expect(offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappen(offers), COOP_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Denner — every sale/original price on the fixture is a multiple of DENNER_PRICE_STEP_RAPPEN', () => {
    const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'denner/__fixtures__/weekly-special-page1.json'), 'utf8'))
    const WEEK = unwrap(createValidityPeriod('2026-09-03', '2026-09-09'))
    const parsed = parseDennerResponse(FIXTURE, WEEK)
    expect(parsed.offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappen(parsed.offers), DENNER_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Spar — every sale/original price on the KW37 fixture is a multiple of SPAR_PRICE_STEP_RAPPEN', () => {
    const XML = readFileSync(join(__dirname, 'spar/__fixtures__/flyer-kw37-pages1-3.xml'), 'utf8')
    const PAGES = parseBboxXml(XML)
    const FALLBACK = unwrap(createValidityPeriod('2026-09-10', '2026-09-16'))
    const { offers } = parseSparFlyer(PAGES, FALLBACK)
    expect(offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappen(offers), SPAR_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Volg — every sale/original price on the fixture is a multiple of VOLG_PRICE_STEP_RAPPEN', () => {
    const FIXTURE = readFileSync(join(__dirname, 'volg/__fixtures__/wochenaktionen.html'), 'utf8')
    const { offers } = parseVolgPage(FIXTURE, new Date('2026-09-09T00:00:00Z'))
    expect(offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappen(offers), VOLG_PRICE_STEP_RAPPEN)).toEqual([])
  })
})
