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
import { isMinimumQuantity } from '../domain/quantity-requirement'
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

/**
 * Same, but excludes a multi-buy offer's SALE price (WP-C4).
 *
 * Hand-verified against the KW36 fixture: every multi-buy ORIGINAL price
 * ("statt") is still on Migros's ordinary 5-rappen shelf grid (450, 175, 695,
 * 430, 140 rappen — all multiples of 5), but the per-item SALE price printed
 * next to "ab N Stück" is not (302, 117, 466, 288, 94 rappen — none are).
 *
 * NOT "a bundle total divided by N" (an earlier, wrong guess, corrected in
 * code review): every one of the five is exactly the printed 33%-off badge
 * applied to the original and rounded to the rappen —
 * `round(original × (100 − 33) / 100)`, verified below as a real invariant,
 * not a carve-out. 450→302, 175→117, 695→466, 430→288, 140→94 all match
 * exactly. It is simply not ALSO independently re-rounded to Migros's
 * 5-rappen shelf-price grid afterwards, the way an ordinary display price
 * is — a genuine, narrower rounding rule for this one price form, not an
 * absence of one. The ORIGINAL price of a multi-buy offer is still checked
 * against the grid here; only the sale price is exempt from THIS property
 * (see `printedPercentAccountsForTheSalePrice` below for what replaces it).
 */
function pricesRappenExcludingMultiBuySale(offers: readonly Offer[]): number[] {
  const prices: number[] = []
  for (const o of offers) {
    if (!isMinimumQuantity(o.quantityRequirement)) prices.push(o.salePrice.rappen)
    if (o.originalPrice) prices.push(o.originalPrice.rappen)
  }
  return prices
}

/** Lists the offending (non-multiple) prices, in FRANCS, so a failure is readable without a calculator. */
function offGrid(prices: readonly number[], step: number): number[] {
  return prices.filter((p) => p % step !== 0).map((p) => p / 100)
}

/**
 * `round(originalRappen × (100 − pct) / 100)` — the printed badge applied to
 * the original price, in INTEGER rappen throughout. Multiplying the two
 * integers FIRST and dividing once at the end (rather than computing
 * `1 - pct/100` as a float first) matters: for Zwetschgen,
 * `450 * (1 - 33/100)` is `301.49999999999994` in IEEE-754 (0.67 has no exact
 * binary form), which rounds DOWN to 301 — one rappen off the real 302. This
 * genuinely happened while writing this property: the naive float formula
 * failed one of the five real fixture cases; the integer-first formula
 * passes all five exactly.
 */
function predictedSaleRappen(originalRappen: number, printedPct: number): number {
  return Math.round((originalRappen * (100 - printedPct)) / 100)
}

describe('WP-C2 property (F1): every real price an adapter parses sits on its declared rounding grid', () => {
  it('Migros — every single-item sale/original price on the KW36 fixture is a multiple of MIGROS_PRICE_STEP_RAPPEN', () => {
    const PAGES = JSON.parse(readFileSync(join(__dirname, 'migros/__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'))
    const { offers } = parseMigrosFlyer(PAGES, new Date('2026-09-09T00:00:00Z'), null)
    expect(offers.length).toBeGreaterThan(0)
    expect(offGrid(pricesRappenExcludingMultiBuySale(offers), MIGROS_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Migros — a multi-buy offer’s ORIGINAL price is still on the shelf grid (WP-C4)', () => {
    const PAGES = JSON.parse(readFileSync(join(__dirname, 'migros/__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'))
    const { offers } = parseMigrosFlyer(PAGES, new Date('2026-09-09T00:00:00Z'), null)
    const multiBuy = offers.filter((o) => isMinimumQuantity(o.quantityRequirement))
    expect(multiBuy.length).toBe(5)
    const originals = multiBuy.map((o) => o.originalPrice!.rappen)
    expect(offGrid(originals, MIGROS_PRICE_STEP_RAPPEN)).toEqual([])
  })

  it('Migros — a multi-buy sale price is exactly its printed badge applied to the original (a real invariant, replacing an earlier loose "off-grid" carve-out — code review)', () => {
    // Stronger than "off the 5-rappen grid": this is a genuine correctness
    // check that would catch a mis-pair (a sale price paired with the wrong
    // anchor's original, or the wrong badge) — the loose "off-grid" property
    // above only proves the sale price ISN'T independently shelf-rounded, it
    // says nothing about whether it is the RIGHT number.
    const PAGES = JSON.parse(readFileSync(join(__dirname, 'migros/__fixtures__/ocr-kw36-zh-pages2-5.json'), 'utf8'))
    const { offers } = parseMigrosFlyer(PAGES, new Date('2026-09-09T00:00:00Z'), null)
    const multiBuy = offers.filter((o) => isMinimumQuantity(o.quantityRequirement))
    expect(multiBuy.length).toBe(5)
    for (const o of multiBuy) {
      expect(o.discount, `${o.productName} has no printed badge to check against`).not.toBeNull()
      const predicted = predictedSaleRappen(o.originalPrice!.rappen, o.discount!.percent)
      expect(o.salePrice.rappen, `${o.productName}: round(${o.originalPrice!.rappen} × ${100 - o.discount!.percent}/100)`).toBe(predicted)
    }
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
