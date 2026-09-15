// MigrosFlyerSource — anti-corruption layer for the Migros weekly flyer.
//
//   https://issuu.com/m-magazin/docs/migros-wochenflyer-{KW}-{YYYY}-d-{region}
//     → page JPEGs at image.isu.pub/{revision}/jpg/page_{N}.jpg
//
// WHY OCR and not an API:
//
//   Migros refuses programmatic access four separate ways — robots.txt
//   disallows */offers/instore/, the terms name "Webcrawler-/Spider-Programme,
//   Metasuchmaschinen" explicitly, the prohibition covers "öffentliche" as well
//   as commercial use, and staff declined an API request on the record. The
//   migros-api-wrapper package works only by TLS-fingerprint pinning past a 403
//   wall, which is circumvention of a technical protection measure — the exact
//   condition the 2023 Federal Supreme Court rulings forbid.
//
//   The flyer is page images with no text layer and no PDF, so reading it means
//   OCR. That is free: rapidocr-onnxruntime, CPU-only, no system dependencies,
//   ~4s/page on a GitHub Actions runner.
//
// REGIONS: Migros is ten legally independent cooperatives publishing separate
// flyers. Tested (research Part 4b): identical prices across Zürich and
// Ostschweiz; Ostschweiz merely adds «Aus der Region.» items. So one region is
// taken as national, which is a measured conclusion, not an assumption.
//
// ── The OCR reliability rule ────────────────────────────────────────────────
//
// OCR reads names, "statt" prices, discount badges, unit prices and the
// validity line reliably. It sometimes fails on the LARGE display sale price,
// returning a token like "06'6" for 9.90 (the numeral is read rotated).
//
// Those offers are DROPPED. The sale price could be derived from the statt
// price and the badge — 14.85 x 0.67 = 9.95 — but the shelf price is 9.90, so
// a derived figure would be wrong by 5 rappen and published as fact. That is
// the Art. 3(1)(e) UWG failure mode. An unreadable price means no offer.
//
// ── Tile geometry (2026-09-15, WP-C1) ───────────────────────────────────────
//
// A Migros flyer page is a two-column grid. Everything a "statt" anchor may
// legitimately pair with — its own display price, its own name, its own
// per-offer validity override — sits in the SAME column ("tile") as the
// anchor, at roughly the same height. Two defects came from ignoring both
// halves of that rule:
//
//   1. The sale price was "the tallest price-shaped token above the anchor in
//      the column", not "the nearest". Every display price on a page is
//      about the same height, so "tallest" picks whichever tile happens to be
//      1-2px taller, regardless of row. Fixed: nearest-above wins.
//   2. The name search had a left bound but no right bound, so a right-column
//      anchor could pick up a name from a NEIGHBOURING left-column tile three
//      rows away — "longest line wins" then favours whichever neighbour
//      happens to have a longer name. Fixed: bounded to the anchor's own
//      half of the page, and among what remains, the line vertically closest
//      to the offer's own sale price wins (Migros prints name and price at
//      the same height; "longest wins" is what let a neighbour's longer name
//      through).
//
// Two price FORMS were also unmodelled: whole-franc ("statt 14.--") and the
// inline "ab 2 Stück" multi-buy form ("3.02statt 4.50", no separate display
// numeral). The multi-buy form is parsed — so it is counted, not silently
// lost — but not published: PriceBasis has no way to say "from 2 items"
// honestly yet (needs QuantityRequirement, WP-C4; PM decision TP-7a).

import { printedDiscount } from '../../domain/discount'
import { type Money, createMoney } from '../../domain/money'
import { type Offer, createOffer } from '../../domain/offer'
import {
  type CollectionFailureReason,
  type CollectionResult,
  type CollectionWarning,
  type IsoWeek,
  type OfferSource,
  collectedWithYieldCheck,
  collectionFailed,
} from '../../domain/offer-source'
import { type ProductImage, cropRegionImage } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'

export const MIGROS_EXPECTED_MINIMUM = 10

/**
 * Below this share of detected anchors turned into published offers, the run
 * is a failure, not a quiet 20% week. Calibrated against the RCA fixture: the
 * pre-fix parser converted about 22-39% of anchors; the tile fix converts
 * 61% on the same fixture (see the golden master below).
 */
export const MIGROS_MIN_ANCHOR_CONVERSION = 0.5

/** One OCR-detected text region: the text and its quadrilateral in image pixels. */
export type OcrItem = {
  readonly text: string
  readonly box: readonly (readonly number[])[]
}

export type OcrPage = {
  readonly pageNumber: number
  readonly width: number
  readonly height: number
  readonly items: readonly OcrItem[]
}

/** A franc amount: decimal (12.34, -.94) or Swiss whole-franc (14.-, 9.--). */
const PRICE_TOKEN_SRC = String.raw`(?:-|\d{1,3})[.,]\d{2}|\d{1,3}\s*\.\s*[-–]{1,2}`

/** A display price standing on its own — never a whole-franc or inline form. */
const PRICE = /^\d{1,3}[.,]\d{2}$/
const STATT = new RegExp(String.raw`statt\s*(${PRICE_TOKEN_SRC})`, 'i')
/**
 * "3.02statt 4.50" — a price immediately before "statt", printed inline with
 * no separate display numeral. This is how Migros prints the "ab 2 Stück"
 * multi-buy form; a standalone "statt 2.10" never matches this.
 */
const INLINE_STATT = new RegExp(String.raw`(${PRICE_TOKEN_SRC})\s*statt\s*(${PRICE_TOKEN_SRC})`, 'i')
const PERCENT = /^(\d{1,2})\s*%$/
/** A per-offer validity override: "gültig vom 10.9. bis 13.9.2026". */
const PER_OFFER_VALIDITY = /g(ü|u)ltig\s+vom/i

/**
 * Lines that are never a product name. Migros prints the unit basis, the
 * cooperative's own name, quality-programme badges and various boilerplate in
 * the same size as product titles, so OCR alone cannot tell them apart.
 */
const DESCRIPTOR =
  /per\s*\d|in\s+Selbstbedienung|Genossenschaft|solange\s+Vorrat|Angebote\s+gelten|g(ü|u)ltig|^\d+\s*(g|kg|ml|l|St(ü|u)ck)\b|^\(|Dazu\s+passt|SPAREN|\bca\.|Sonderpackung|erh(ä|a)ltlich|Zucht\s+aus|Wildfang|z\.\s*B\.|in\s+gr(ö|o)sseren\s+Filialen/i

export function issuuDocUrl(kw: number, year: number, region = 'zh', lang = 'd'): string {
  return `https://issuu.com/m-magazin/docs/migros-wochenflyer-${kw}-${year}-${lang}-${region}`
}

type Box = { x0: number; y0: number; x1: number; y1: number }

export function boxOf(item: OcrItem): Box {
  const xs = item.box.map((p) => p[0] ?? 0)
  const ys = item.box.map((p) => p[1] ?? 0)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const centreX = (b: Box) => (b.x0 + b.x1) / 2

/**
 * Parses a franc token: "4.50" / "4,50" → 4.50, "-.94" → 0.94 (Migros omits
 * the leading zero under one franc), "14.--" / "9.-" → 14.00 / 9.00 (Swiss
 * whole-franc notation, never seen by the old decimal-only parser).
 */
export function toFrancs(text: string): number | null {
  const trimmed = text.trim()
  const whole = trimmed.match(/^(\d{1,3})\s*\.\s*[-–]{1,2}$/)
  if (whole) return Number(whole[1])
  const decimal = trimmed.match(/^(-|\d{1,3})[.,](\d{2})$/)
  if (!decimal) return null
  const francs = decimal[1] === '-' ? 0 : Number(decimal[1])
  return francs + Number(decimal[2]) / 100
}

/**
 * "Angebote gelten vom 3.9. bis 9.9.2026, solange Vorrat."
 * OCR reliably reads this line; the year appears on the end date only.
 */
export function parseValidityLine(text: string, reference: Date): ValidityPeriod | null {
  const m = text.match(/vom\s*(\d{1,2})\.(\d{1,2})\.\s*bis\s*(\d{1,2})\.(\d{1,2})\.(\d{4})?/i)
  if (!m) return null
  const year = m[5] ? Number(m[5]) : reference.getUTCFullYear()
  const pad = (n: string) => n.padStart(2, '0')
  const from = `${year}-${pad(m[2]!)}-${pad(m[1]!)}`
  const to = `${year}-${pad(m[4]!)}-${pad(m[3]!)}`
  const v = createValidityPeriod(from, to)
  return isOk(v) ? v.value : null
}

/**
 * The flyer-wide window. Prefers a line containing "Angebote gelten" over any
 * other "vom … bis …" match, and searches EVERY page for one before falling
 * back — not just the first page that contains any date-shaped text.
 *
 * WHY: a per-offer override ("gültig vom 10.9. bis 13.9.2026", a weekend-only
 * item) matches the same generic date regex. If it happens to sit on an
 * earlier page than the flyer's own "Angebote gelten …" line, taking the
 * first match anywhere would silently turn one product's weekend window into
 * every product's window.
 */
export function findValidity(pages: readonly OcrPage[], reference: Date): ValidityPeriod | null {
  const joined = pages.map((page) => page.items.map((i) => i.text).join(' '))

  for (const text of joined) {
    if (!/Angebote\s+gelten/i.test(text)) continue
    const found = parseValidityLine(text, reference)
    if (found) return found
  }
  for (const text of joined) {
    const found = parseValidityLine(text, reference)
    if (found) return found
  }
  return null
}

/** Per-page tally of what happened to each detected "statt" anchor. */
export type MigrosFunnel = {
  readonly anchors: number
  readonly accepted: number
  readonly multiBuy: number
  readonly unreadablePrice: number
  readonly noDisplayPrice: number
  readonly noName: number
  readonly invariantRejected: number
}

const EMPTY_FUNNEL: MigrosFunnel = {
  anchors: 0,
  accepted: 0,
  multiBuy: 0,
  unreadablePrice: 0,
  noDisplayPrice: 0,
  noName: 0,
  invariantRejected: 0,
}

function addFunnel(a: MigrosFunnel, b: MigrosFunnel): MigrosFunnel {
  return {
    anchors: a.anchors + b.anchors,
    accepted: a.accepted + b.accepted,
    multiBuy: a.multiBuy + b.multiBuy,
    unreadablePrice: a.unreadablePrice + b.unreadablePrice,
    noDisplayPrice: a.noDisplayPrice + b.noDisplayPrice,
    noName: a.noName + b.noName,
    invariantRejected: a.invariantRejected + b.invariantRejected,
  }
}

export function formatFunnel(f: MigrosFunnel): string {
  return (
    `funnel: ${f.anchors} anchors -> ${f.accepted} accepted, ${f.multiBuy} multi-buy (not published), ` +
    `${f.unreadablePrice} unreadable statt, ${f.noDisplayPrice} no display price, ` +
    `${f.noName} no name, ${f.invariantRejected} discount-inconsistent`
  )
}

/**
 * Below `MIGROS_MIN_ANCHOR_CONVERSION` of anchors converted to offers, the run
 * is a failure regardless of the absolute floor. A run that finds 18 anchors
 * and 0 publishes is exactly as much a defect at 4 accepted (22%) as at 0 —
 * the OLD parser's actual measured range — even though 4 clears an absolute
 * floor set low enough not to block a genuinely small flyer week.
 */
export function migrosYieldReason(acceptedCount: number, anchorCount: number): CollectionFailureReason | null {
  if (anchorCount === 0) return null
  if (acceptedCount < anchorCount * MIGROS_MIN_ANCHOR_CONVERSION) return 'below-expected-yield'
  return null
}

/** The anchor's half of the two-column page. Migros prints two columns; this
 * is what stops a name or price from a neighbouring column's row reaching in. */
type Tile = { x0: number; x1: number }

function tileFor(stattBox: Box, pageWidth: number): Tile {
  const half = pageWidth / 2
  return centreX(stattBox) < half ? { x0: 0, x1: half } : { x0: half, x1: pageWidth }
}

function withinTile(b: Box, tile: Tile): boolean {
  const c = centreX(b)
  return c >= tile.x0 && c < tile.x1
}

/**
 * The nearest price-shaped token above the statt line, within the anchor's
 * tile. NOT the tallest — every display price on a Migros page is about the
 * same height, so "tallest" was arbitrary between tiles. Migros Spiesse:
 * statt 4.30 must pair with 2.85 (47px away), not 1.90 (690px away, and 2px
 * taller).
 */
function findNearestSaleAbove(page: OcrPage, stattBox: Box, tile: Tile): OcrItem | undefined {
  return page.items
    .filter((i) => PRICE.test(i.text.trim()) && withinTile(boxOf(i), tile) && boxOf(i).y1 <= stattBox.y1 + 5)
    .sort((a, b) => stattBox.y1 - boxOf(a).y1 - (stattBox.y1 - boxOf(b).y1))[0]
}

/**
 * The non-descriptor line vertically closest to the offer's own sale price,
 * bounded to the anchor's tile. Migros prints the name at the same height as
 * the price; "longest wins" (the old rule, with no right bound at all) is
 * what let "OptigalPouletgeschnetzeltes" — the RIGHT tile's own,
 * correctly-scoped name — get picked for a LEFT tile anchor.
 */
function findOfferName(page: OcrPage, tile: Tile, saleBox: Box, stattBox: Box, pageHeight: number): OcrItem | undefined {
  // Wide enough to reach a two-line name, narrow enough not to reach the row
  // above or below.
  const nameBandTop = saleBox.y0 - pageHeight * 0.02
  const nameBandBottom = stattBox.y1 + pageHeight * 0.02

  return page.items
    .filter((i) => {
      const b = boxOf(i)
      return withinTile(b, tile) && b.y0 >= nameBandTop && b.y1 <= nameBandBottom
    })
    .filter((i) => !PRICE.test(i.text.trim()) && !PERCENT.test(i.text.trim()) && !STATT.test(i.text))
    .filter((i) => !DESCRIPTOR.test(i.text))
    .filter((i) => i.text.trim().length > 3)
    .sort((a, b) => Math.abs(boxOf(a).y0 - saleBox.y0) - Math.abs(boxOf(b).y0 - saleBox.y0))[0]
}

/**
 * A "gültig vom … bis …" line inside THIS tile beats the flyer-wide window.
 * Real evidence: a weekend-only item valid 10.9-13.9 was published under the
 * flyer's 3.9-9.9 window and was still live on the site on 15.9 — the
 * Art. 3(1)(e) UWG failure mode.
 */
function findValidityOverride(
  page: OcrPage,
  tile: Tile,
  stattBox: Box,
  pageHeight: number,
  reference: Date,
): ValidityPeriod | null {
  const overrideItem = page.items.find((i) => {
    const b = boxOf(i)
    return (
      withinTile(b, tile) &&
      PER_OFFER_VALIDITY.test(i.text) &&
      b.y0 >= stattBox.y0 - pageHeight * 0.02 &&
      b.y0 <= stattBox.y1 + pageHeight * 0.1
    )
  })
  return overrideItem ? parseValidityLine(overrideItem.text, reference) : null
}

/** Spans the price block down to the name, in page fractions. */
function buildOfferCropRegion(page: OcrPage, pageImageUrl: string, saleBox: Box, nameBox: Box): ProductImage | null {
  const x0 = Math.max(0, Math.min(saleBox.x0, nameBox.x0) - 40)
  const y0 = Math.max(0, Math.min(saleBox.y0, nameBox.y0) - 260)
  const x1 = Math.min(page.width, Math.max(saleBox.x1, nameBox.x1) + 40)
  const y1 = Math.min(page.height, Math.max(saleBox.y1, nameBox.y1) + 20)
  const built = cropRegionImage({
    pageImageUrl,
    x: x0 / page.width,
    y: y0 / page.height,
    width: (x1 - x0) / page.width,
    height: (y1 - y0) / page.height,
  })
  return isOk(built) ? built.value : null
}

/** Reads the printed discount badge near the statt line, if one is present. */
function findPrintedDiscount(page: OcrPage, stattBox: Box) {
  // The narrow x-proximity band the discount badge search already used.
  // Left unchanged: every badge in this flyer prints "33%", so a mis-scoped
  // pick is numerically invisible, and narrowing it is a separate concern
  // from the name/price tile fix this WP is scoped to.
  const near = page.items.filter((i) => Math.abs(centreX(boxOf(i)) - centreX(stattBox)) < page.width * 0.18)
  const pctItem = near.find((i) => PERCENT.test(i.text.trim()))
  if (!pctItem) return null
  const d = printedDiscount(Number(pctItem.text.trim().replace('%', '')))
  return isOk(d) ? d.value : null
}

type MultiBuyOutcome = { kind: 'multi-buy'; warning: CollectionWarning }
type RejectedOutcome = {
  kind: 'rejected'
  warning: CollectionWarning
  funnelField: keyof Omit<MigrosFunnel, 'anchors' | 'accepted'>
}
type AnchorOutcome = { kind: 'offer'; offer: Offer } | MultiBuyOutcome | RejectedOutcome

type PriceOutcome = MultiBuyOutcome | RejectedOutcome | { kind: 'prices'; sale: Money; original: Money; saleItem: OcrItem }

/**
 * Reads the anchor's own statt price and pairs it with the nearest sale price
 * above it in its tile. Separated from name/offer resolution because this is
 * where the two REAL price forms are told apart: an inline "ab 2 Stück" price
 * (no separate display numeral, parsed but withheld) versus an ordinary
 * standalone statt line (paired against a display price).
 */
function readAnchorPrices(stattItem: OcrItem, page: OcrPage, tile: Tile, pageRef: string): PriceOutcome {
  const stattBox = boxOf(stattItem)
  const originalFrancs = toFrancs(stattItem.text.match(STATT)?.[1] ?? '')
  if (originalFrancs === null) {
    return {
      kind: 'rejected',
      warning: { message: `unreadable statt price: ${stattItem.text}`, item: pageRef },
      funnelField: 'unreadablePrice',
    }
  }

  const inlineMatch = stattItem.text.match(INLINE_STATT)
  if (inlineMatch) {
    // "ab 2 Stück": the sale price is printed inline, with no separate
    // display numeral. Parsed so the funnel counts it honestly instead of
    // reporting "no readable display price" — but not published: it needs
    // QuantityRequirement (WP-C4) to say "from 2 items" instead of
    // rendering as an unconditional price, which TP-7a has not cleared yet.
    const inlineSale = toFrancs(inlineMatch[1]!)
    return {
      kind: 'multi-buy',
      warning: {
        message:
          `multi-buy: "${stattItem.text.trim()}" is an ab-2-Stück price ` +
          `(${inlineSale === null ? '?' : inlineSale.toFixed(2)} statt ${originalFrancs.toFixed(2)}) — ` +
          'parsed but withheld until QuantityRequirement lands (WP-C4)',
        item: pageRef,
      },
    }
  }

  const saleItem = findNearestSaleAbove(page, stattBox, tile)
  if (!saleItem) {
    // OCR mangles the big display numeral often enough to matter. Deriving it
    // from statt x (1 - discount) would be wrong by rappen and published as
    // fact, so the offer is dropped instead.
    return {
      kind: 'rejected',
      warning: {
        message: `no readable display price above "statt ${originalFrancs.toFixed(2)}" — offer dropped rather than derived`,
        item: pageRef,
      },
      funnelField: 'noDisplayPrice',
    }
  }

  const saleFrancs = toFrancs(saleItem.text)
  if (saleFrancs === null) {
    return { kind: 'rejected', warning: { message: `unreadable sale price ${saleItem.text}`, item: pageRef }, funnelField: 'unreadablePrice' }
  }

  const sale = createMoney(saleFrancs)
  const original = createMoney(originalFrancs)
  if (!isOk(sale) || !isOk(original)) {
    return { kind: 'rejected', warning: { message: 'bad price pair', item: pageRef }, funnelField: 'unreadablePrice' }
  }

  return { kind: 'prices', sale: sale.value, original: original.value, saleItem }
}

/** Resolves one "statt" anchor into an offer, a multi-buy skip, or a rejection. */
function resolveAnchor(
  stattItem: OcrItem,
  page: OcrPage,
  validity: ValidityPeriod,
  reference: Date,
  pageImageUrl: string | null,
  flyerUrl: string | null,
): AnchorOutcome {
  const pageRef = `page ${page.pageNumber}`
  const stattBox = boxOf(stattItem)
  const tile = tileFor(stattBox, page.width)

  const priced = readAnchorPrices(stattItem, page, tile, pageRef)
  if (priced.kind !== 'prices') return priced

  const saleBox = boxOf(priced.saleItem)
  const nameItem = findOfferName(page, tile, saleBox, stattBox, page.height)
  const name = nameItem?.text.trim()
  if (!nameItem || !name) {
    return { kind: 'rejected', warning: { message: 'no product name near statt line', item: pageRef }, funnelField: 'noName' }
  }

  const discount = findPrintedDiscount(page, stattBox)
  const overrideValidity = findValidityOverride(page, tile, stattBox, page.height, reference)
  const image = pageImageUrl ? buildOfferCropRegion(page, pageImageUrl, saleBox, boxOf(nameItem)) : null

  const offer = createOffer({
    retailer: 'migros',
    productName: name,
    salePrice: priced.sale,
    originalPrice: priced.original,
    discount,
    validity: overrideValidity ?? validity,
    image,
    // Migros DOES print category headings ("Brot & Backwaren") — the only
    // retailer that does. Associating them to products needs heading
    // detection that is not built yet, so this stays null for now.
    sourceCategory: null,
    // Migros has no per-product page. Point at the issuu flyer this offer
    // was read from — the provenance of the price, and checkable.
    sourceUrl: flyerUrl,
  })

  if (isOk(offer)) return { kind: 'offer', offer: offer.value }
  return {
    kind: 'rejected',
    warning: { message: `${name}: ${offer.error}`, item: pageRef },
    funnelField: 'invariantRejected',
  }
}

/**
 * Groups a page's OCR regions into products.
 *
 * Anchors on each "statt" line — the most reliably read element, marking
 * exactly one product's tile.
 */
export function parsePage(
  page: OcrPage,
  validity: ValidityPeriod,
  reference: Date,
  pageImageUrl: string | null,
  flyerUrl: string | null = null,
): { offers: Offer[]; warnings: CollectionWarning[]; funnel: MigrosFunnel } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  let funnel = EMPTY_FUNNEL

  const stattItems = page.items.filter((i) => STATT.test(i.text))

  for (const stattItem of stattItems) {
    funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, anchors: 1 })
    const outcome = resolveAnchor(stattItem, page, validity, reference, pageImageUrl, flyerUrl)

    if (outcome.kind === 'offer') {
      offers.push(outcome.offer)
      funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, accepted: 1 })
    } else if (outcome.kind === 'multi-buy') {
      warnings.push(outcome.warning)
      funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, multiBuy: 1 })
    } else {
      warnings.push(outcome.warning)
      funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, [outcome.funnelField]: 1 })
    }
  }

  return { offers, warnings, funnel }
}

export function parseFlyer(
  pages: readonly OcrPage[],
  reference: Date,
  fallbackValidity: ValidityPeriod | null,
  pageImageUrl?: (pageNumber: number) => string,
  flyerUrl?: string,
): { offers: Offer[]; warnings: CollectionWarning[]; funnel: MigrosFunnel } {
  const validity = findValidity(pages, reference) ?? fallbackValidity
  if (!validity) {
    return { offers: [], warnings: [{ message: 'no validity line found in the flyer' }], funnel: EMPTY_FUNNEL }
  }

  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  let funnel = EMPTY_FUNNEL
  for (const page of pages) {
    const r = parsePage(page, validity, reference, pageImageUrl?.(page.pageNumber) ?? null, flyerUrl ?? null)
    offers.push(...r.offers)
    warnings.push(...r.warnings)
    funnel = addFunnel(funnel, r.funnel)
  }
  return { offers, warnings, funnel }
}

// ── the source ───────────────────────────────────────────────────────────────

export type MigrosSourceDeps = {
  /** Injected so tests use captured OCR output rather than running a model. */
  loadPages: () => Promise<OcrPage[]>
  reference?: Date
  fallbackValidity?: ValidityPeriod | null
  pageImageUrl?: (pageNumber: number) => string
  expectedMinimumOffers?: number
  /**
   * The issuu flyer this week's offers were read from, used as each offer's
   * sourceUrl. Migros publishes no per-product page we may fetch, and a card
   * that links nowhere is worse than one linking to the flyer the price is
   * printed in.
   */
  flyerUrl?: string
}

export function createMigrosFlyerSource(deps: MigrosSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? MIGROS_EXPECTED_MINIMUM

  return {
    retailer: 'migros',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      let pages: OcrPage[]
      try {
        pages = await deps.loadPages()
      } catch (e) {
        return collectionFailed('migros', 'source-unavailable', e instanceof Error ? e.message : String(e))
      }

      const { offers, warnings, funnel } = parseFlyer(
        pages,
        deps.reference ?? new Date(),
        deps.fallbackValidity ?? null,
        deps.pageImageUrl,
        deps.flyerUrl,
      )

      const yieldReason = migrosYieldReason(offers.length, funnel.anchors)
      if (yieldReason) {
        return collectionFailed(
          'migros',
          yieldReason,
          `${formatFunnel(funnel)} — below the ${Math.round(MIGROS_MIN_ANCHOR_CONVERSION * 100)}% anchor conversion floor`,
        )
      }

      return collectedWithYieldCheck(
        { retailer: 'migros', expectedMinimumOffers },
        offers,
        [{ message: formatFunnel(funnel) }, ...warnings],
      )
    },
  }
}
