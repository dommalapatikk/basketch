// AldiFlyerSource — anti-corruption layer for ALDI SUISSE's weekly catalogue.
//
//   GET https://catalog.aldi-suisse.ch/aldiwoche_kw{NN}-{YYYY}_de/data.json
//        → carries the PDF url (view.publitas.com/.../*.pdf)
//
// WHY the catalogue and not the site: aldi-suisse.ch sits behind Akamai and
// returns 403 to every scripted client, including robots.txt. The Publitas
// catalogue is served openly with deterministic weekly URLs and two weeks of
// lookahead — an open door, not a wall to get around.
//
// ALDI is the hardest source in the set, and the domain rules exist for it:
//
//  1. NO REFERENCE PRICES. Measured on KW37: 40 pages, 358 prices, but only
//     2 "statt" and 25 "PREISSENKUNG". So originalPrice is almost always null,
//     and the ALDI rule in createOffer forbids inventing a discount to match.
//     Most ALDI offers are a price with no percentage. That is correct output.
//
//  2. NO CATEGORIES anywhere — page headers are campaign bands
//     ("PREISSENKUNGEN AB DONNERSTAG"), never "Fleisch & Fisch".
//
//  3. TWO PROMO CYCLES IN ONE FLYER. KW37 carries both "AB DONNERSTAG, 10.9."
//     and "AB MONTAG, 14.9.". Products inherit the most recent heading, so
//     validity is per-page, not per-flyer.
//
// Field roles by font height, measured on the real flyer (502x794pt):
//   h≈39  sale price ("2.99")
//   h≈17  product name, uppercase ("CASHEW-ERDNUSS-MIX")
//   h≈10  unit price ("1.50/100 g") and description bullets

import { createMoney } from '../../domain/money'
import { type Offer, createOffer } from '../../domain/offer'
import {
  type CollectionResult,
  type CollectionWarning,
  type IsoWeek,
  type OfferSource,
  collectedWithYieldCheck,
  collectionFailed,
} from '../../domain/offer-source'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'
import { type PdfPage, heightOf } from '../pdf/pdf-words'
import { type Tile, clusterIntoTiles, tileToCropRegion, tileWordsInOrder } from '../pdf/tile-locator'

export const ALDI_EXPECTED_MINIMUM = 60

const PRICE = /^\d{1,3}[.,]\d{2}$/
const PRICE_MIN_HEIGHT = 30
const NAME_MIN_HEIGHT = 14
const NAME_MAX_HEIGHT = 20

/** ALDI cycles run seven days: "AB DONNERSTAG, 10.9." matches the flyer's own "bis 16.9." */
const CYCLE_DAYS = 7

function toFrancs(text: string): number | null {
  const m = text.match(/^(\d{1,3})[.,](\d{2})$/)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
}

/**
 * "AB DONNERSTAG, 10.9." → the cycle window starting that day.
 *
 * The flyer prints no year and no end date. The year comes from an injected
 * reference (handling the Dec→Jan rollover); the end is start + 6 days, which
 * is not a guess — the flyer's own "bis 16.9." confirms it for the 10.9 cycle.
 */
export function parseCycleStart(text: string, reference: Date): ValidityPeriod | null {
  const m = text.match(/\bab\s+\w+,?\s*(\d{1,2})\.(\d{1,2})\./i)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null

  const refYear = reference.getUTCFullYear()
  const refMonth = reference.getUTCMonth() + 1
  const year = refMonth >= 11 && month <= 2 ? refYear + 1 : refYear

  const start = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + (CYCLE_DAYS - 1) * 86400000)

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const v = createValidityPeriod(iso(start), iso(end))
  return isOk(v) ? v.value : null
}

/**
 * ALDI's layout defeats one-pass clustering, so prices and names are matched
 * explicitly.
 *
 * WHY: ALDI puts the display price at the top of a cell and the product name
 * roughly 150pt below it, past the photo. Clustering loosely enough to bridge
 * that gap also merges neighbouring products (dx=55 gave 4 merged tiles of 16);
 * clustering tightly enough to separate them orphans every name (dx=25 gave 19
 * clean prices but names in their own clusters).
 *
 * So: anchor on each display price, then take the nearest name-band group BELOW
 * it whose column centre is within tolerance. Each name group is claimed once,
 * which stops two prices in adjacent columns sharing a name. Measured on real
 * pages: tolerance 55 gives 19 matched, 0 duplicates, 3 unmatched.
 */
const NAME_COLUMN_TOLERANCE = 55

function centreX(box: { xMin: number; xMax: number }): number {
  return (box.xMin + box.xMax) / 2
}

export function parsePage(
  page: PdfPage,
  validity: ValidityPeriod,
  pageImageUrl: string | null,
): { offers: Offer[]; warnings: CollectionWarning[] } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []

  const prices = page.words
    .filter((w) => PRICE.test(w.text) && heightOf(w) > PRICE_MIN_HEIGHT)
    .sort((a, b) => a.yMin - b.yMin)

  const nameGroups = clusterIntoTiles(
    page.words.filter((w) => {
      const h = heightOf(w)
      return h > NAME_MIN_HEIGHT && h < NAME_MAX_HEIGHT
    }),
    { maxGapX: 30, maxGapY: 14 },
  )
  const claimed = new Set<Tile>()

  for (const priceWord of prices) {
    const match = nameGroups
      .filter((g) => !claimed.has(g))
      .filter((g) => g.yMin > priceWord.yMin && Math.abs(centreX(g) - centreX(priceWord)) <= NAME_COLUMN_TOLERANCE)
      .sort((a, b) => a.yMin - b.yMin)[0]

    if (!match) {
      warnings.push({ message: `price ${priceWord.text} has no product name below it`, item: `page ${page.pageNumber}` })
      continue
    }
    claimed.add(match)

    const francs = toFrancs(priceWord.text)
    if (francs === null) {
      warnings.push({ message: `unreadable price ${priceWord.text}`, item: `page ${page.pageNumber}` })
      continue
    }
    const sale = createMoney(francs)
    if (!isOk(sale)) {
      warnings.push({ message: `bad price ${francs} — ${sale.error}`, item: `page ${page.pageNumber}` })
      continue
    }

    const name = tileWordsInOrder(match)
      .map((w) => w.text)
      .join(' ')
      .trim()

    // The tile for cropping spans the price down to the name — the photo sits
    // between them, so no upward padding is needed here.
    const tile: Tile = {
      words: [...match.words, priceWord],
      xMin: Math.min(match.xMin, priceWord.xMin),
      yMin: Math.min(match.yMin, priceWord.yMin),
      xMax: Math.max(match.xMax, priceWord.xMax),
      yMax: Math.max(match.yMax, priceWord.yMax),
    }

    const offer = createOffer({
      retailer: 'aldi',
      productName: name,
      salePrice: sale.value,
      // ALDI prints a reference price on only a handful of pages, and a bare
      // "-10%" badge cannot be verified without one. Both stay null — the ALDI
      // rule in createOffer forbids inventing a discount.
      originalPrice: null,
      discount: null,
      validity,
      image: pageImageUrl ? tileToCropRegion(tile, page, pageImageUrl, 12) : null,
      sourceCategory: null,
      sourceUrl: null,
    })

    if (isOk(offer)) offers.push(offer.value)
    else warnings.push({ message: `${name}: ${offer.error}`, item: `page ${page.pageNumber}` })
  }

  return { offers, warnings }
}

export function parseFlyer(
  pages: readonly PdfPage[],
  reference: Date,
  fallbackValidity: ValidityPeriod | null,
  pageImageUrl?: (pageNumber: number) => string,
): { offers: Offer[]; warnings: CollectionWarning[] } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  // Headings appear on some pages only; the rest inherit the most recent one.
  let currentCycle: ValidityPeriod | null = fallbackValidity

  for (const page of pages) {
    const pageText = page.words.map((w) => w.text).join(' ')
    const found = parseCycleStart(pageText, reference)
    if (found) currentCycle = found

    if (!currentCycle) {
      if (page.words.length > 0) {
        warnings.push({ message: 'no promo cycle known yet', item: `page ${page.pageNumber}` })
      }
      continue
    }

    const result = parsePage(page, currentCycle, pageImageUrl?.(page.pageNumber) ?? null)
    offers.push(...result.offers)
    warnings.push(...result.warnings)
  }

  return { offers, warnings }
}

// ── the source ───────────────────────────────────────────────────────────────

export type AldiSourceDeps = {
  loadPages: () => Promise<PdfPage[]>
  /** Injected so year inference is deterministic under test. */
  reference?: Date
  fallbackValidity?: ValidityPeriod | null
  pageImageUrl?: (pageNumber: number) => string
  expectedMinimumOffers?: number
}

export function catalogDataUrl(year: number, kw: number): string {
  return `https://catalog.aldi-suisse.ch/aldiwoche_kw${String(kw).padStart(2, '0')}-${year}_de/data.json`
}

/** Pulls the PDF url out of the Publitas catalogue descriptor. */
export function findPdfUrl(dataJson: unknown): string | null {
  const m = JSON.stringify(dataJson ?? null).match(/"(https?:\/\/[^"]*\.pdf[^"]*)"/)
  return m?.[1] ? m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null
}

export function createAldiFlyerSource(deps: AldiSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? ALDI_EXPECTED_MINIMUM

  return {
    retailer: 'aldi',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      let pages: PdfPage[]
      try {
        pages = await deps.loadPages()
      } catch (e) {
        return collectionFailed('aldi', 'source-unavailable', e instanceof Error ? e.message : String(e))
      }

      const { offers, warnings } = parseFlyer(
        pages,
        deps.reference ?? new Date(),
        deps.fallbackValidity ?? null,
        deps.pageImageUrl,
      )
      return collectedWithYieldCheck({ retailer: 'aldi', expectedMinimumOffers }, offers, warnings)
    },
  }
}
