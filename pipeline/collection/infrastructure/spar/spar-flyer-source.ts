// SparFlyerSource — anti-corruption layer for SPAR's weekly flyer PDF.
//
//   GET https://angebote.spar.ch/flugblatt/{YYYY}/spar-angebote-kw{NN}-{YYYY}/GetPDF.ashx
//     → 302 → cdn.ipaper.io/.../Download.pdf   (must follow redirects)
//
// ~28 MB, 17 pages, real text layer (iTextSharp), so no OCR is needed.
// spar.ch itself carries no offer markup — the page is only an iPaper iframe —
// and the flipbook's Search.asmx returns page numbers, not products. The PDF is
// the only usable route.
//
// Field roles come from FONT HEIGHT, measured on the real KW37 flyer:
//   h≈28  discount badge ("43%")
//   h≈27  sale price     ("5.95")
//   h≈11  product name   ("Delikatess Fleischkäse")
//   h≈8   description / "statt 10.50"
//
// Measured yield: 96 "statt" tokens → 82 tiles → ~66 fully parsed (80%).
// The shortfall is tiles where two products cluster together; those are
// reported as warnings rather than guessed at.
//
// SPAR has no product taxonomy in the flyer — page headings are marketing
// slogans ("Vielfalt zu attraktiven Preisen"). sourceCategory is null; our
// model classifies SPAR.
//
// Coverage caveat kept honest: spar.ch/spar-app advertises "exklusive
// Rabattcodes, die du nur in der App findest", so app-only offers exist and are
// not in this flyer.

import { printedDiscount } from '../../domain/discount'
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
import { type PdfPage, type Word, heightOf } from '../pdf/pdf-words'
import { type Tile, clusterIntoTiles, tileText, tileToCropRegion, tileWordsInOrder } from '../pdf/tile-locator'

export const SPAR_EXPECTED_MINIMUM = 30

const PRICE = /^\d{1,3}[.,]\d{2}$/
const PERCENT = /^\d{1,2}\s*%$/

/** Big display type — the sale price and the discount badge. */
const DISPLAY_MIN_HEIGHT = 18
/** Product-name type sits between the description and the display sizes. */
const NAME_MIN_HEIGHT = 9.5
const NAME_MAX_HEIGHT = 13

function toFrancs(text: string): number | null {
  const m = text.match(/^(\d{1,3})[.,](\d{2})$/)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
}

/**
 * "Gültig von Do., 10.09.26 – Mi., 16.09.26" → validity window.
 * SPAR prints a two-digit year on the flyer's first page.
 */
export function parseFlyerValidity(text: string): ValidityPeriod | null {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{2,4})\s*[–-]\s*(?:\w{2}\.,?\s*)?(\d{2})\.(\d{2})\.(\d{2,4})/)
  if (!m) return null
  const year = (y: string) => (y.length === 2 ? `20${y}` : y)
  const v = createValidityPeriod(`${year(m[3]!)}-${m[2]}-${m[1]}`, `${year(m[6]!)}-${m[5]}-${m[4]}`)
  return isOk(v) ? v.value : null
}

/** Scans early pages for the flyer's printed validity line. */
export function findFlyerValidity(pages: readonly PdfPage[]): ValidityPeriod | null {
  for (const page of pages.slice(0, 3)) {
    const text = page.words.map((w) => w.text).join(' ')
    const found = parseFlyerValidity(text)
    if (found) return found
  }
  return null
}

export type SparTileResult = { offer: Offer } | { warning: string }

export function mapTileToOffer(
  tile: Tile,
  page: PdfPage,
  validity: ValidityPeriod,
  pageImageUrl: string | null,
  flyerUrl: string | null = null,
): SparTileResult {
  const ordered = tileWordsInOrder(tile)
  const stattIndexes = ordered
    .map((w, i) => (w.text.toLowerCase() === 'statt' ? i : -1))
    .filter((i) => i >= 0)

  if (stattIndexes.length === 0) return { warning: 'tile has no "statt" price' }
  if (stattIndexes.length > 1) {
    // Two products clustered together. Guessing which price belongs to which
    // name would risk publishing a wrong pairing — refuse instead.
    return { warning: `tile merges ${stattIndexes.length} products: ${tileText(tile).slice(0, 70)}` }
  }

  const stattAt = stattIndexes[0]!
  const nextWord = ordered[stattAt + 1]
  const originalFrancs = nextWord && PRICE.test(nextWord.text) ? toFrancs(nextWord.text) : null
  if (originalFrancs === null) return { warning: 'no price after "statt"' }

  const displayPrices = tile.words
    .filter((w: Word) => PRICE.test(w.text) && heightOf(w) > DISPLAY_MIN_HEIGHT)
    .sort((a, b) => heightOf(b) - heightOf(a))
  const saleWord = displayPrices[0]
  const saleFrancs = saleWord ? toFrancs(saleWord.text) : null
  if (saleFrancs === null) return { warning: 'no display sale price in tile' }

  const nameWords = ordered.filter((w) => {
    const h = heightOf(w)
    return h > NAME_MIN_HEIGHT && h < NAME_MAX_HEIGHT
  })
  const name = nameWords.map((w) => w.text).join(' ').trim()
  if (!name) return { warning: `no product name in tile: ${tileText(tile).slice(0, 60)}` }

  const sale = createMoney(saleFrancs)
  if (!isOk(sale)) return { warning: `${name}: bad sale price — ${sale.error}` }
  const original = createMoney(originalFrancs)
  if (!isOk(original)) return { warning: `${name}: bad original price — ${original.error}` }

  const pctWord = tile.words.find((w) => PERCENT.test(w.text))
  let discount = null
  if (pctWord) {
    const d = printedDiscount(Number(pctWord.text.replace('%', '').trim()))
    if (isOk(d)) discount = d.value
  }

  const image = pageImageUrl ? tileToCropRegion(tile, page, pageImageUrl) : null

  const offer = createOffer({
    retailer: 'spar',
    productName: name,
    salePrice: sale.value,
    originalPrice: original.value,
    discount,
    validity,
    image,
    // The flyer prints slogans, not categories.
    sourceCategory: null,
    // SPAR has no per-product page. Point at the flyer this offer was read
    // from — the provenance of the price, and something a visitor can check.
    sourceUrl: flyerUrl,
  })

  return isOk(offer) ? { offer: offer.value } : { warning: `${name}: ${offer.error}` }
}

export function parseFlyer(
  pages: readonly PdfPage[],
  validity: ValidityPeriod,
  pageImageUrl?: (pageNumber: number) => string,
  flyerUrl?: string,
): { offers: Offer[]; warnings: CollectionWarning[] } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []

  for (const page of pages) {
    for (const tile of clusterIntoTiles(page.words)) {
      // Skip clusters that plainly are not products.
      if (!tile.words.some((w) => w.text.toLowerCase() === 'statt')) continue

      const result = mapTileToOffer(
        tile,
        page,
        validity,
        pageImageUrl?.(page.pageNumber) ?? null,
        flyerUrl ?? null,
      )
      if ('offer' in result) offers.push(result.offer)
      else warnings.push({ message: result.warning, item: `page ${page.pageNumber}` })
    }
  }

  return { offers, warnings }
}

// ── the source ───────────────────────────────────────────────────────────────

export type SparSourceDeps = {
  /** Returns positioned words per page. Injected so tests never shell out. */
  loadPages: () => Promise<PdfPage[]>
  /** Fallback when the flyer's own validity line cannot be read. */
  fallbackValidity?: ValidityPeriod | null
  pageImageUrl?: (pageNumber: number) => string
  expectedMinimumOffers?: number
  /**
   * The human-readable flyer this week's offers were read from, used as each
   * offer's sourceUrl. SPAR publishes no per-product page, and a card that
   * links nowhere is worse than one linking to the flyer the price is printed
   * in.
   */
  flyerUrl?: string
}

/**
 * The human-readable flyer — what a visitor should be sent to.
 *
 * `flyerPdfUrl` is this plus `GetPDF.ashx`; deriving one from the other means
 * the link and the download can never point at different weeks.
 */
export function flyerPageUrl(year: number, kw: number): string {
  const kwPadded = String(kw).padStart(2, '0')
  return `https://angebote.spar.ch/flugblatt/${year}/spar-angebote-kw${kwPadded}-${year}/`
}

export function flyerPdfUrl(year: number, kw: number): string {
  return `${flyerPageUrl(year, kw)}GetPDF.ashx`
}

export function createSparFlyerSource(deps: SparSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? SPAR_EXPECTED_MINIMUM

  return {
    retailer: 'spar',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      let pages: PdfPage[]
      try {
        pages = await deps.loadPages()
      } catch (e) {
        return collectionFailed('spar', 'source-unavailable', e instanceof Error ? e.message : String(e))
      }

      const validity = findFlyerValidity(pages) ?? deps.fallbackValidity ?? null
      if (!validity) {
        // Without a window we cannot say when an offer is valid, and publishing
        // an undated price comparison is the Art. 3(1)(e) UWG risk.
        return collectionFailed('spar', 'source-changed', 'no validity window found on the flyer')
      }

      const { offers, warnings } = parseFlyer(pages, validity, deps.pageImageUrl, deps.flyerUrl)
      return collectedWithYieldCheck({ retailer: 'spar', expectedMinimumOffers }, offers, warnings)
    },
  }
}
