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
// returning a token like "06'6" for 9.90 (the numeral is read rotated), or
// drops the display price token entirely.
//
// Those offers are DROPPED, never derived. Deriving 14.85 x (1 - 0.33) = 9.95
// against a real shelf price of 9.90 would be wrong by 5 rappen and published
// as fact — the Art. 3(1)(e) UWG failure mode. A candidate is only ever
// accepted as "the" display price for an anchor when it is PLAUSIBLY that
// anchor's own price (see `isPlausibleSaleFor` below) — proximity in a wide
// x-band is not enough on its own, because a mangled or missing display price
// must never silently borrow a NEIGHBOURING tile's price instead.
//
// ── Tile geometry (2026-09-15, WP-C1; hardened 2026-09-16, code review) ─────
//
// A Migros flyer page is a two-column grid. Everything a "statt" anchor may
// legitimately pair with — its own display price, its own name, its own
// per-offer validity override — sits in the SAME column ("tile") as the
// anchor, at roughly the same height. The tile bound alone is not sufficient
// (a whole column can be 1000+ px tall, covering several unrelated rows), so
// the sale price is additionally required to be:
//   - horizontally aligned with the statt line (within 5% of the page width),
//   - close above it vertically (within 3% of the page height), and
//   - clearly display-sized, not text-sized (at least 1.8x the statt line's
//     own height — a display price is ~77px, statt text ~30px).
// A candidate failing any of these is not "the nearest price in the tile" —
// it is a different row's price, and the offer is dropped as `noDisplayPrice`
// rather than mis-paired.
//
// The name search is bounded to the tile (not the whole page) and prefers the
// line vertically closest to the offer's own sale price — Migros prints name
// and price at the same height, and a line ending in a hyphen ("Schweins-
// Nierstuck-") or the bare brand word "Migros" continues on the next
// x-aligned line, which is joined in. The join separator depends on the
// continuation's case (see `joinNameParts`): a capitalised continuation is a
// printed compound and keeps its hyphen ("Delikatess-Fleischkase"); a
// lowercase one is a separate qualifying word, so the hyphen is dropped for
// a space instead ("Schweins-Nierstuck steaksmariniert", not the
// run-together "Schweins-Nierstuck-steaksmariniert").
//
// Two price FORMS were also unmodelled: whole-franc ("statt 14.--") and the
// "ab N Stück" multi-buy form. Multi-buy is detected two ways — an inline
// "2.88statt4.30" token with no separate display numeral, AND an "ab N
// Stück" label printed above the badge in the same tile, because OCR
// sometimes splits the inline form into two tokens ("2.88" and "statt 4.30"
// separately), which would otherwise slip through as an ordinary,
// UNLABELLED price.
//
// ── Publishing multi-buy prices (2026-09-16, WP-C4, PM decision TP-7a) ─────
//
// A multi-buy price is now PUBLISHED — with a `QuantityRequirement.minimum(n)`
// so it renders "from n items", never bare — the moment `n` can be read
// honestly from a nearby "ab N Stück" label. `n` is PARSED from the label,
// never hardcoded: on the committed fixture every one of the five real
// multi-buy anchors reads "ab 2 Stück", but the parser reads whatever digit
// is actually printed. An anchor whose price is structurally conditional
// (an inline token, or a label found) but whose label could not be read —
// garbled OCR, or no label found near an inline-only anchor — is still
// WITHHELD: Art. 3(1)(e) UWG requires an honest comparison, and "probably 2,
// because that is what every other one said this week" is a guess, not a
// reading. See `multiBuyUnquantified` in `MigrosFunnel`.
//
// The inline form has no separate display numeral, so its own sale price is
// read directly off the statt line's own text — there is no separate
// `saleBox` to search for. The NAME search for this form is also different
// from the ordinary anchor's: see `findMultiBuyNameLine`.

import { type Discount, discountConsistencyReason, printedDiscount } from '../../domain/discount'
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
import { SINGLE_ITEM, type QuantityRequirement, isMinimumQuantity, minimumQuantity } from '../../domain/quantity-requirement'
import { type Result, isOk, ok } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'

export const MIGROS_EXPECTED_MINIMUM = 10

/**
 * Below this share of PUBLISHABLE anchors (anchors minus the ones that
 * cannot be honestly published at all — WP-C4: a multi-buy-shaped anchor
 * whose quantity could not be read) turned into offers, the run is a
 * failure, not a quiet slow week. See `migrosYieldReason`.
 */
export const MIGROS_MIN_ANCHOR_CONVERSION = 0.5

/**
 * Migros rounds shelf prices to 5 rappen (Swiss cash rounding — the 1- and
 * 2-rappen coins are gone). Confirmed on the KW36 fixture: every real display
 * price is a multiple of 5 (2.85, 4.30, 5.60, 5.25, 9.35, …). WP-C2: without
 * this, a real offer ("1.20 statt 1.85", printed 33%, true 35.1%) was
 * rejected, because one Migros rounding step is 2.7pp on a CHF 1.85 item —
 * more than `PRINTED_DISCOUNT_TOLERANCE_PP`. This is a BACKSTOP behind the
 * tile-geometry pairing above, not a substitute for it.
 */
export const MIGROS_PRICE_STEP_RAPPEN = 5

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
/**
 * Anchors on the bare word, not on "statt + a parseable price": an anchor
 * whose price OCR could not read ("statt 9.", a single dash) is still a real
 * anchor and must be counted, then rejected as `unreadablePrice` — not
 * silently excluded from the anchor count altogether, which is what letting
 * the price-capturing regex double as the anchor detector used to do.
 */
const STATT_WORD = /statt/i
const STATT = new RegExp(String.raw`statt\s*(${PRICE_TOKEN_SRC})`, 'i')
/**
 * "3.02statt 4.50" — a price immediately before "statt", printed inline with
 * no separate display numeral. This is ONE of two multi-buy signals (see
 * `findMultiBuyLabel` for the other) — OCR sometimes splits this into two
 * tokens, which this alone would miss.
 */
const INLINE_STATT = new RegExp(String.raw`(${PRICE_TOKEN_SRC})\s*statt\s*(${PRICE_TOKEN_SRC})`, 'i')
const PERCENT = /^(\d{1,2})\s*%$/
/**
 * The "ab N Stück" multi-buy label, printed above the badge in the tile.
 * Captures the digit so the quantity is PARSED, not assumed — every label on
 * the committed fixture reads "2", but nothing here hardcodes that.
 */
const AB_STUECK = /ab\s*(\d+)\s*St(?:ü|u)ck/i

/**
 * Reads N from an "ab N Stück" label. Returns null when the label cannot be
 * read as a whole number of at least 2 — garbled OCR must withhold the
 * offer, never guess a number (TP-7a, the same "listed with its own label,
 * never bare" rule CLAUDE.md applies to every conditional price).
 */
export function parseMultiBuyQuantity(label: string): number | null {
  const m = label.match(AB_STUECK)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 2 ? n : null
}
/**
 * A "gültig"/"gultig" mention that ALSO carries a date shape (D.D.) somewhere
 * after it. Two things this must get right at once (re-reviewed 2026-09-16):
 *   - NOT anchored to "…vom…" specifically, because OCR sometimes glues them
 *     ("gultigvom…") and because a line that says "gültig" but fails to parse
 *     a window (missing "vom", wrong order) must still be DETECTED so the
 *     anchor can be rejected rather than silently falling back to the
 *     flyer-wide window — see `findValidityOverride`.
 *   - Ordinary Swiss flyer copy that is never a validity window at all —
 *     "gültig solange Vorrat", "nur gültig mit Cumulus" — carries no date at
 *     all and must NOT be treated as an override candidate. Without the date
 *     requirement, that copy would be found, fail to parse (correctly — it
 *     is not a window), and REJECT an otherwise-valid offer for text that
 *     was never trying to state a validity window in the first place.
 * The `\D*` gap between "gültig" and the date allows "vom", spaces and
 * punctuation, whatever OCR glues or splits.
 */
const PER_OFFER_VALIDITY = /g(ü|u)ltig\D*\d{1,2}\.\d{1,2}\./i

/**
 * Lines that are never a product name. Migros prints the unit basis, the
 * cooperative's own name, quality-programme badges and various boilerplate in
 * the same size as product titles, so OCR alone cannot tell them apart.
 */
// ⚠️ `^BIO$` (WP-C4), not `\bBIO\b`: the standalone quality badge Migros
// prints as its OWN line ("BIO", nothing else — real fixture item at
// (1430,1852)-(1471,1889)) is a descriptor. An UNANCHORED `\bBIO\b` also
// matched inside a genuine product name that happens to contain the word —
// "Migros Bio Bohnen" — which silently discarded that offer's own name as
// "not a product name" (`noName`). Anchoring to the whole line keeps
// catching the badge without catching a name that merely mentions it.
const DESCRIPTOR =
  /per\s*\d|in\s+Selbstbedienung|Genossenschaft|solange\s+Vorrat|Angebote\s+gelten|g(ü|u)ltig|^\d+\s*(g|kg|ml|l|St(ü|u)ck)\b|^\(|Dazu\s+passt|SPAREN|\bca\.|Sonderpackung|erh(ä|a)ltlich|Zucht\s+aus|Wildfang|z\.\s*B\.|in\s+gr(ö|o)sseren\s+Filialen|IP-SUISSE\+?|^\s*BIO\s*$|Aus\s*der\s*Region|Beutel\s*,?\s*\d/i

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

/** The overlap of two windows, or null when they do not overlap at all. */
export function intersectValidity(a: ValidityPeriod, b: ValidityPeriod): ValidityPeriod | null {
  const from = a.from > b.from ? a.from : b.from
  const to = a.to < b.to ? a.to : b.to
  const result = createValidityPeriod(from, to)
  return isOk(result) ? result.value : null
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
  // Pass 1: the "Angebote gelten" sentence is ALWAYS one contiguous OCR item
  // in real captures (verified on the committed fixture), so this parses
  // each ITEM'S own text, never the whole page joined together. Joining the
  // whole page first and THEN testing/parsing is a defect in its own right:
  // if a per-tile "gültig vom …" override happens to sit earlier in item
  // order than the flyer's own "Angebote gelten …" footer on the SAME page,
  // parseValidityLine's un-anchored regex would find the OVERRIDE's dates
  // first and misreport them as the flyer-wide window.
  for (const page of pages) {
    for (const i of page.items) {
      if (!/Angebote\s+gelten/i.test(i.text)) continue
      const found = parseValidityLine(i.text, reference)
      if (found) return found
    }
  }
  // Pass 2 (fallback): any "vom … bis …" match anywhere, whole page joined —
  // only reached when no page has its own "Angebote gelten" line at all.
  for (const page of pages) {
    const joined = page.items.map((i) => i.text).join(' ')
    const found = parseValidityLine(joined, reference)
    if (found) return found
  }
  return null
}

/** Per-page tally of what happened to each detected "statt" anchor. */
export type MigrosFunnel = {
  readonly anchors: number
  readonly accepted: number
  /**
   * Of `accepted`, how many needed WP-C2's rappen grid to pass — the pp rule
   * alone was not enough (F6). Not a rejection count: these offers ARE
   * published. Visible here so a future flyer that starts mis-pairing on
   * cheap items shows up as a rising share of `accepted`, not an identical
   * summary line.
   */
  readonly gridAccepted: number
  /**
   * Of `accepted`, how many carry a `QuantityRequirement.minimum(n)` (WP-C4,
   * TP-7a) — published as "from n items", never bare. NOT a withheld count
   * any more: a multi-buy price whose quantity can be read is a normal,
   * published offer, the same status `gridAccepted` already has relative to
   * `accepted`.
   */
  readonly multiBuy: number
  /**
   * A multi-buy-SHAPED anchor (an inline "X statt Y" token and/or a nearby
   * "ab N Stück" label) where no whole number of at least 2 could be read
   * from a label. TP-7a requires an honest "from N items" label — never a
   * guessed one — so this anchor is withheld, and is the ONLY multi-buy
   * outcome still excluded from `migrosYieldReason`'s denominator.
   */
  readonly multiBuyUnquantified: number
  readonly unreadablePrice: number
  readonly noDisplayPrice: number
  readonly noName: number
  readonly invalidValidity: number
  readonly invariantRejected: number
}

const EMPTY_FUNNEL: MigrosFunnel = {
  anchors: 0,
  accepted: 0,
  gridAccepted: 0,
  multiBuy: 0,
  multiBuyUnquantified: 0,
  unreadablePrice: 0,
  noDisplayPrice: 0,
  noName: 0,
  invalidValidity: 0,
  invariantRejected: 0,
}

function addFunnel(a: MigrosFunnel, b: MigrosFunnel): MigrosFunnel {
  return {
    anchors: a.anchors + b.anchors,
    accepted: a.accepted + b.accepted,
    gridAccepted: a.gridAccepted + b.gridAccepted,
    multiBuy: a.multiBuy + b.multiBuy,
    multiBuyUnquantified: a.multiBuyUnquantified + b.multiBuyUnquantified,
    unreadablePrice: a.unreadablePrice + b.unreadablePrice,
    noDisplayPrice: a.noDisplayPrice + b.noDisplayPrice,
    noName: a.noName + b.noName,
    invalidValidity: a.invalidValidity + b.invalidValidity,
    invariantRejected: a.invariantRejected + b.invariantRejected,
  }
}

export function formatFunnel(f: MigrosFunnel): string {
  return (
    `funnel: ${f.anchors} anchors -> ${f.accepted} accepted (${f.gridAccepted} via the rappen grid, ${f.multiBuy} multi-buy "from N items"), ` +
    `${f.multiBuyUnquantified} multi-buy unquantified (withheld), ` +
    `${f.unreadablePrice} unreadable statt, ${f.noDisplayPrice} no display price, ` +
    `${f.noName} no name, ${f.invalidValidity} invalid validity, ${f.invariantRejected} discount-inconsistent`
  )
}

/**
 * Below `MIGROS_MIN_ANCHOR_CONVERSION` of PUBLISHABLE anchors converted to
 * offers, the run is a failure regardless of the absolute floor.
 *
 * WP-C4: a multi-buy anchor is now published whenever its quantity can be
 * read, so it counts toward `acceptedCount` like any other offer — the
 * denominator no longer excludes it. The ONLY anchors still excluded are the
 * ones that are structurally impossible to publish honestly:
 * `multiBuyUnquantified` — a conditional price with no readable "from N
 * items" label. A week that is genuinely 30-40% multi-buy is not read as a
 * parsing failure; a week where the LABELS cannot be read still is.
 */
export function migrosYieldReason(acceptedCount: number, anchorCount: number, multiBuyUnquantifiedCount: number): CollectionFailureReason | null {
  const publishable = anchorCount - multiBuyUnquantifiedCount
  if (publishable <= 0) return null
  if (acceptedCount < publishable * MIGROS_MIN_ANCHOR_CONVERSION) return 'below-expected-yield'
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

const SALE_X_ALIGN_FRACTION = 0.05
const SALE_MAX_GAP_FRACTION = 0.03
const SALE_MIN_HEIGHT_RATIO = 1.8

/**
 * Is `sale` PLAUSIBLY the display price for `statt`? Tile membership alone is
 * not enough — a column can span several unrelated rows. All three must hold:
 * horizontally aligned (within 5% of the page width), close above (within 3%
 * of the page height), and display-sized (at least 1.8x the statt line's own
 * height — a display price is ~77px tall, statt text ~30px). Reproduced
 * without this: dropping a genuine display price makes the statt pair with
 * WHATEVER same-height price is nearest in a wide x-band, in a different row
 * or even a different tile.
 */
function isPlausibleSaleFor(sale: Box, statt: Box, page: OcrPage): boolean {
  if (Math.abs(centreX(sale) - centreX(statt)) > page.width * SALE_X_ALIGN_FRACTION) return false
  const gap = statt.y0 - sale.y1
  if (gap < -10 || gap > page.height * SALE_MAX_GAP_FRACTION) return false
  const stattHeight = statt.y1 - statt.y0
  const saleHeight = sale.y1 - sale.y0
  return saleHeight >= stattHeight * SALE_MIN_HEIGHT_RATIO
}

/** The nearest PLAUSIBLE price above the statt line, within the anchor's tile. */
function findNearestSaleAbove(page: OcrPage, stattBox: Box, tile: Tile): OcrItem | undefined {
  return page.items
    .filter((i) => PRICE.test(i.text.trim()) && withinTile(boxOf(i), tile) && isPlausibleSaleFor(boxOf(i), stattBox, page))
    .sort((a, b) => stattBox.y1 - boxOf(a).y1 - (stattBox.y1 - boxOf(b).y1))[0]
}

const MULTI_BUY_LABEL_MAX_GAP_FRACTION = 0.12

/**
 * An "ab N Stück" label above the badge in the same tile — the multi-buy
 * signal that survives even when OCR SPLITS the inline "2.88statt4.30" token
 * into two ("2.88" and "statt 4.30" separately), which would otherwise be
 * published as an ordinary, unlabelled everyone-price. Real evidence: this
 * label sits 210-300px above its own statt line on the committed fixture,
 * comfortably under the 12%-of-page-height bound used here, while the gap to
 * an UNRELATED row's statt line is 800px or more.
 */
function findMultiBuyLabel(page: OcrPage, tile: Tile, stattBox: Box, pageHeight: number): OcrItem | undefined {
  return page.items.find((i) => {
    if (!AB_STUECK.test(i.text)) return false
    const b = boxOf(i)
    if (!withinTile(b, tile)) return false
    const gap = stattBox.y0 - b.y1
    return gap >= 0 && gap <= pageHeight * MULTI_BUY_LABEL_MAX_GAP_FRACTION
  })
}

const MULTI_BUY_NAME_MAX_GAP_FRACTION = 0.04

/**
 * The name for an INLINE multi-buy anchor ("3.02statt4.50" — no separate
 * display numeral, so there is no `saleBox` to search from). Real fixture
 * evidence (WP-C4): a multi-buy tile reads top to bottom as [name] ->
 * [zero or more descriptor/origin lines] -> [the inline-price line], for
 * example "Trauben weiss und gemischt,kernlos" -> "Schale,500g,z.B.weiss," ->
 * "Italien/Spanien/Griechenland," -> "1.17statt1.75,...". The origin line
 * sits CLOSER to the price (3px) than the real name does (76px) and is not
 * (yet) in DESCRIPTOR, so "nearest wins" — the ordinary anchor's rule,
 * correct there because its own price sits at the SAME height as its name —
 * would pick the wrong line here. A multi-buy tile has no such same-height
 * anchor, so this picks the TOPMOST non-price, non-descriptor, non-label
 * candidate within the gap instead: the name is always read first, whatever
 * descriptor text follows it before the price.
 */
function findMultiBuyNameLine(page: OcrPage, tile: Tile, stattBox: Box, pageHeight: number): OcrItem | undefined {
  return page.items
    .filter((i) => {
      const b = boxOf(i)
      if (!withinTile(b, tile)) return false
      const gap = stattBox.y0 - b.y1
      return gap >= -5 && gap <= pageHeight * MULTI_BUY_NAME_MAX_GAP_FRACTION
    })
    .filter((i) => !PRICE.test(i.text.trim()) && !PERCENT.test(i.text.trim()) && !STATT_WORD.test(i.text) && !AB_STUECK.test(i.text))
    .filter((i) => !DESCRIPTOR.test(i.text))
    .filter((i) => i.text.trim().length > 3)
    .sort((a, b) => boxOf(a).y0 - boxOf(b).y0)[0]
}

/** Lines Migros wraps onto a second row: a hyphenated break, or its own bare brand word. */
const INCOMPLETE_BRAND_WORDS = new Set(['Migros'])

function looksIncomplete(text: string): boolean {
  return text.endsWith('-') || INCOMPLETE_BRAND_WORDS.has(text)
}

/**
 * The x-aligned line immediately below `primaryBox`, if one exists — the
 * second half of a name Migros wrapped onto two OCR lines.
 */
function findContinuationLine(page: OcrPage, tile: Tile, primaryBox: Box, pageHeight: number): OcrItem | undefined {
  return page.items
    .filter((i) => {
      const b = boxOf(i)
      if (!withinTile(b, tile)) return false
      if (Math.abs(b.x0 - primaryBox.x0) > 20) return false
      const gap = b.y0 - primaryBox.y1
      return gap >= -5 && gap <= pageHeight * 0.01
    })
    .filter((i) => !PRICE.test(i.text.trim()) && !PERCENT.test(i.text.trim()) && !STATT_WORD.test(i.text))
    .sort((a, b) => boxOf(a).y0 - boxOf(b).y0)[0]
}

/**
 * The non-descriptor line vertically closest to the offer's own sale price,
 * bounded to the anchor's tile. Migros prints the name at the same height as
 * the price; picking the CLOSEST (not "longest") line is what stops a
 * neighbouring tile's name from being picked when it happens to be longer.
 */
function findPrimaryNameLine(page: OcrPage, tile: Tile, saleBox: Box, stattBox: Box, pageHeight: number): OcrItem | undefined {
  const nameBandTop = saleBox.y0 - pageHeight * 0.02
  const nameBandBottom = stattBox.y1 + pageHeight * 0.02

  return page.items
    .filter((i) => {
      const b = boxOf(i)
      return withinTile(b, tile) && b.y0 >= nameBandTop && b.y1 <= nameBandBottom
    })
    .filter((i) => !PRICE.test(i.text.trim()) && !PERCENT.test(i.text.trim()) && !STATT_WORD.test(i.text))
    .filter((i) => !DESCRIPTOR.test(i.text))
    .filter((i) => i.text.trim().length > 3)
    .sort((a, b) => Math.abs(boxOf(a).y0 - saleBox.y0) - Math.abs(boxOf(b).y0 - saleBox.y0))[0]
}

/**
 * The offer's name and the box it came from (for the crop region). Joins a
 * second OCR line when the first looks like a wrapped hyphenated word or a
 * bare brand prefix ("Migros" alone) — otherwise a genuinely two-line name
 * ("Migros" / "Kalbsplätzli", "Delikatess-" / "Fleischkäse,IP-SUISSE") is
 * truncated to its first line, which is itself a naming defect: too generic
 * to be useful for identity or classification, exactly the class of bug this
 * WP fixes for cross-tile mis-pairs.
 */
/**
 * Joins a name Migros wrapped onto two OCR lines (re-reviewed 2026-09-16,
 * N2). Migros hyphenates genuine compounds with the continuation
 * CAPITALISED — "Delikatess-" + "Fleischkäse" -> "Delikatess-Fleischkäse" —
 * matching the flyer's own one-line convention for the same shape of word
 * elsewhere on the fixture ("Schweins-Geschnetzeltes", never wrapped). A
 * LOWERCASE continuation is never a capitalised compound continuation; German
 * retail copy reads it as a separate qualifying word instead — "Schweins-
 * Nierstück-" + "steaksmariniert" reads as "Schweins-Nierstück steaks,
 * mariniert" (kidney-piece steaks, MARINATED — a quality adjective, not a
 * mid-word break) — so the hyphen is dropped and a space takes its place,
 * giving "Schweins-Nierstück steaksmariniert" rather than the run-together
 * "Schweins-Nierstück-steaksmariniert" that reads as one garbled word.
 */
export function joinNameParts(primaryText: string, continuationFirstSegment: string): string {
  const continuationStartsUpper = /^[A-ZÄÖÜ]/.test(continuationFirstSegment)
  if (primaryText.endsWith('-')) {
    if (continuationStartsUpper) return primaryText + continuationFirstSegment
    return `${primaryText.slice(0, -1)} ${continuationFirstSegment}`
  }
  return `${primaryText} ${continuationFirstSegment}`
}

/**
 * `wideNameSearch` selects `findMultiBuyNameLine` over the ordinary
 * `findPrimaryNameLine` — true exactly when the anchor's price came from the
 * INLINE multi-buy form, where there is no separate `saleBox` at the same
 * height as the name (see `findMultiBuyNameLine`'s own header for why the
 * ordinary "nearest wins" rule picks the wrong line there).
 */
function findOfferName(
  page: OcrPage,
  tile: Tile,
  saleBox: Box,
  stattBox: Box,
  pageHeight: number,
  wideNameSearch: boolean,
): { text: string; box: Box } | undefined {
  const primary = wideNameSearch
    ? findMultiBuyNameLine(page, tile, stattBox, pageHeight)
    : findPrimaryNameLine(page, tile, saleBox, stattBox, pageHeight)
  if (!primary) return undefined

  const primaryText = primary.text.trim()
  const primaryBox = boxOf(primary)
  if (!looksIncomplete(primaryText)) return { text: primaryText, box: primaryBox }

  const continuation = findContinuationLine(page, tile, primaryBox, pageHeight)
  if (!continuation) return { text: primaryText, box: primaryBox }

  const continuationFirstSegment = continuation.text.split(',')[0]!.trim()
  if (!continuationFirstSegment || DESCRIPTOR.test(continuationFirstSegment)) {
    return { text: primaryText, box: primaryBox }
  }

  const continuationBox = boxOf(continuation)
  const joinedBox: Box = {
    x0: Math.min(primaryBox.x0, continuationBox.x0),
    y0: Math.min(primaryBox.y0, continuationBox.y0),
    x1: Math.max(primaryBox.x1, continuationBox.x1),
    y1: Math.max(primaryBox.y1, continuationBox.y1),
  }
  return { text: joinNameParts(primaryText, continuationFirstSegment), box: joinedBox }
}

type ValidityOverrideResult = { kind: 'none' } | { kind: 'invalid'; raw: string } | { kind: 'override'; period: ValidityPeriod }

/**
 * A "gültig …" line inside THIS tile beats the flyer-wide window — clipped to
 * never extend past it (a genuine "gültig vom 3.9. bis 30.9." on a flyer that
 * only runs to 16.9 must not publish a price as valid two weeks after the
 * flyer itself has expired). A "gültig" line that is FOUND but fails to parse
 * (missing "vom", "bis" before "vom", OCR noise) REJECTS the anchor rather
 * than silently falling back to the flyer-wide window — the exact defect
 * this WP exists to fix (a weekend-only item was published under the wrong,
 * wider window and was still live on the site days after it expired).
 *
 * The search band starts at the SALE price's own top, mirroring the name
 * band — anchoring it to the statt line instead (the original bug) missed an
 * override sitting right after the price, higher up than the statt line by
 * more than a few percent of the page.
 */
function findValidityOverride(
  page: OcrPage,
  tile: Tile,
  stattBox: Box,
  saleBox: Box,
  pageHeight: number,
  reference: Date,
  flyerValidity: ValidityPeriod,
): ValidityOverrideResult {
  const bandTop = saleBox.y0 - pageHeight * 0.02
  const bandBottom = stattBox.y1 + pageHeight * 0.1
  const overrideItem = page.items.find((i) => {
    const b = boxOf(i)
    return withinTile(b, tile) && PER_OFFER_VALIDITY.test(i.text) && b.y0 >= bandTop && b.y0 <= bandBottom
  })
  if (!overrideItem) return { kind: 'none' }

  const parsed = parseValidityLine(overrideItem.text, reference)
  if (!parsed) return { kind: 'invalid', raw: overrideItem.text }

  const intersected = intersectValidity(parsed, flyerValidity)
  if (!intersected) return { kind: 'invalid', raw: overrideItem.text }

  return { kind: 'override', period: intersected }
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

/** The nearest printed discount badge above the statt line, within the anchor's tile. */
function findPrintedDiscount(page: OcrPage, stattBox: Box, tile: Tile): Discount | null {
  const pctItem = page.items
    .filter((i) => PERCENT.test(i.text.trim()) && withinTile(boxOf(i), tile) && boxOf(i).y1 <= stattBox.y1 + 5)
    .sort((a, b) => stattBox.y1 - boxOf(a).y1 - (stattBox.y1 - boxOf(b).y1))[0]
  if (!pctItem) return null
  const d = printedDiscount(Number(pctItem.text.trim().replace('%', '')), {
    priceStepRappen: MIGROS_PRICE_STEP_RAPPEN,
  })
  return isOk(d) ? d.value : null
}

/** Local mirror of `QuantityRequirement`'s two shapes — kept anchor-parsing-only until built into the real domain value in `buildOfferFromDetails`. */
type QuantityOutcome = { kind: 'single' } | { kind: 'minimum'; count: number }
const SINGLE_QUANTITY: QuantityOutcome = { kind: 'single' }

type MultiBuyUnquantifiedOutcome = { kind: 'multi-buy-unquantified'; warning: CollectionWarning }
type RejectedOutcome = {
  kind: 'rejected'
  warning: CollectionWarning
  funnelField: keyof Omit<MigrosFunnel, 'anchors' | 'accepted'>
}
type AnchorOutcome = { kind: 'offer'; offer: Offer } | MultiBuyUnquantifiedOutcome | RejectedOutcome
type PriceOutcome =
  | MultiBuyUnquantifiedOutcome
  | RejectedOutcome
  | { kind: 'prices'; sale: Money; original: Money; saleBox: Box; quantity: QuantityOutcome; usedInlinePrice: boolean }
type PriceFormOutcome =
  | MultiBuyUnquantifiedOutcome
  | RejectedOutcome
  | { kind: 'priced'; originalFrancs: number; quantity: QuantityOutcome; inlineSaleFrancs: number | null }

/**
 * Reads the anchor's own statt price and tells apart the shapes it may take:
 * unreadable, multi-buy with no readable quantity (withheld — TP-7a), or a
 * priced anchor ready to be paired with a display price (ordinary, or
 * multi-buy WITH a readable quantity, WP-C4).
 */
function classifyAnchorPriceForm(stattItem: OcrItem, page: OcrPage, tile: Tile, stattBox: Box, pageRef: string): PriceFormOutcome {
  const originalFrancs = toFrancs(stattItem.text.match(STATT)?.[1] ?? '')
  if (originalFrancs === null) {
    return {
      kind: 'rejected',
      warning: { message: `unreadable statt price: ${stattItem.text}`, item: pageRef },
      funnelField: 'unreadablePrice',
    }
  }

  const inlineMatch = stattItem.text.match(INLINE_STATT)
  const multiBuyLabel = findMultiBuyLabel(page, tile, stattBox, page.height)
  if (!inlineMatch && !multiBuyLabel) {
    return { kind: 'priced', originalFrancs, quantity: SINGLE_QUANTITY, inlineSaleFrancs: null }
  }

  // Multi-buy SHAPE detected — an inline "X statt Y" token, a nearby "ab N
  // Stück" label, or both. TP-7a: publish it labelled "from N items" the
  // moment N can be read; the label is the only source of N, so an
  // inline-only anchor with no locatable label is still withheld.
  const quantityCount = multiBuyLabel ? parseMultiBuyQuantity(multiBuyLabel.text) : null
  if (quantityCount === null) {
    const inlineSale = inlineMatch ? toFrancs(inlineMatch[1]!) : null
    return {
      kind: 'multi-buy-unquantified',
      warning: {
        message:
          `multi-buy: "${stattItem.text.trim()}"${multiBuyLabel ? ` near "${multiBuyLabel.text.trim()}"` : ''} is a conditional price ` +
          `(${inlineSale === null ? 'unread' : inlineSale.toFixed(2)} statt ${originalFrancs.toFixed(2)}) with no readable "ab N Stück" quantity — ` +
          'withheld, never published without an honest label',
        item: pageRef,
      },
    }
  }

  return {
    kind: 'priced',
    originalFrancs,
    quantity: { kind: 'minimum', count: quantityCount },
    inlineSaleFrancs: inlineMatch ? toFrancs(inlineMatch[1]!) : null,
  }
}

/**
 * Pairs an already-classified statt price with its display price.
 *
 * The INLINE multi-buy form (`inlineSaleFrancs !== null`) has no separate
 * display numeral at all — the sale price is read straight off the statt
 * line's own text, and `saleBox` is the statt line's own box (there is
 * nothing else to point at for the name search or the crop region). Every
 * other form — ordinary, or multi-buy where OCR split the price into its own
 * token — searches for the nearest plausible display price above, exactly as
 * before.
 */
function pairSalePrice(
  page: OcrPage,
  tile: Tile,
  stattBox: Box,
  form: { originalFrancs: number; quantity: QuantityOutcome; inlineSaleFrancs: number | null },
  pageRef: string,
): PriceOutcome {
  if (form.inlineSaleFrancs !== null) {
    const sale = createMoney(form.inlineSaleFrancs)
    const original = createMoney(form.originalFrancs)
    if (!isOk(sale) || !isOk(original)) {
      return { kind: 'rejected', warning: { message: 'bad inline price pair', item: pageRef }, funnelField: 'unreadablePrice' }
    }
    return { kind: 'prices', sale: sale.value, original: original.value, saleBox: stattBox, quantity: form.quantity, usedInlinePrice: true }
  }

  const saleItem = findNearestSaleAbove(page, stattBox, tile)
  if (!saleItem) {
    // OCR mangles or drops the big display numeral often enough to matter.
    // Deriving it from statt x (1 - discount) would be wrong by rappen and
    // published as fact, so the offer is dropped instead.
    return {
      kind: 'rejected',
      warning: {
        message: `no readable display price above "statt ${form.originalFrancs.toFixed(2)}" — offer dropped rather than derived`,
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
  const original = createMoney(form.originalFrancs)
  if (!isOk(sale) || !isOk(original)) {
    return { kind: 'rejected', warning: { message: 'bad price pair', item: pageRef }, funnelField: 'unreadablePrice' }
  }

  return { kind: 'prices', sale: sale.value, original: original.value, saleBox: boxOf(saleItem), quantity: form.quantity, usedInlinePrice: false }
}

function readAnchorPrices(stattItem: OcrItem, page: OcrPage, tile: Tile, stattBox: Box, pageRef: string): PriceOutcome {
  const form = classifyAnchorPriceForm(stattItem, page, tile, stattBox, pageRef)
  if (form.kind !== 'priced') return form
  return pairSalePrice(page, tile, stattBox, form, pageRef)
}

type DetailsOutcome =
  | RejectedOutcome
  | { kind: 'details'; name: string; discount: Discount | null; validity: ValidityPeriod; image: ProductImage | null }

/** Resolves the name, discount badge, per-offer validity and crop region for an already-priced anchor. */
function resolveOfferDetails(
  page: OcrPage,
  tile: Tile,
  stattBox: Box,
  saleBox: Box,
  wideNameSearch: boolean,
  flyerValidity: ValidityPeriod,
  reference: Date,
  pageImageUrl: string | null,
  pageRef: string,
): DetailsOutcome {
  const nameResult = findOfferName(page, tile, saleBox, stattBox, page.height, wideNameSearch)
  if (!nameResult) {
    return { kind: 'rejected', warning: { message: 'no product name near statt line', item: pageRef }, funnelField: 'noName' }
  }

  const validityResult = findValidityOverride(page, tile, stattBox, saleBox, page.height, reference, flyerValidity)
  if (validityResult.kind === 'invalid') {
    return {
      kind: 'rejected',
      warning: { message: `per-offer validity line could not be parsed: "${validityResult.raw}"`, item: pageRef },
      funnelField: 'invalidValidity',
    }
  }

  const discount = findPrintedDiscount(page, stattBox, tile)
  const validity = validityResult.kind === 'override' ? validityResult.period : flyerValidity
  const image = pageImageUrl ? buildOfferCropRegion(page, pageImageUrl, saleBox, nameResult.box) : null

  return { kind: 'details', name: nameResult.text, discount, validity, image }
}

type OfferDetails = { name: string; discount: Discount | null; validity: ValidityPeriod; image: ProductImage | null }
type PricedAnchor = { sale: Money; original: Money; quantity: QuantityOutcome }

/**
 * Builds a domain `QuantityRequirement` from the parsed outcome, through the
 * SAME factory `Offer`'s own invariant re-check backstops (WP-C4) — never a
 * raw literal, matching how `findPrintedDiscount` builds `Discount` through
 * `printedDiscount` rather than assembling the object by hand.
 */
function buildQuantityRequirement(quantity: QuantityOutcome): Result<QuantityRequirement> {
  return quantity.kind === 'single' ? ok(SINGLE_ITEM) : minimumQuantity(quantity.count)
}

/** Builds the domain `Offer` from an already-priced, already-detailed anchor. */
function buildOfferFromDetails(priced: PricedAnchor, details: OfferDetails, flyerUrl: string | null, pageRef: string): AnchorOutcome {
  const quantityRequirement = buildQuantityRequirement(priced.quantity)
  if (!isOk(quantityRequirement)) {
    return {
      kind: 'rejected',
      warning: { message: `${details.name}: ${quantityRequirement.error}`, item: pageRef },
      funnelField: 'invariantRejected',
    }
  }

  const offer = createOffer({
    retailer: 'migros',
    productName: details.name,
    salePrice: priced.sale,
    originalPrice: priced.original,
    discount: details.discount,
    validity: details.validity,
    quantityRequirement: quantityRequirement.value,
    image: details.image,
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
    warning: { message: `${details.name}: ${offer.error}`, item: pageRef },
    funnelField: 'invariantRejected',
  }
}

/** Resolves one "statt" anchor into an offer, a withheld multi-buy, or a rejection. */
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

  const priced = readAnchorPrices(stattItem, page, tile, stattBox, pageRef)
  if (priced.kind !== 'prices') return priced

  const details = resolveOfferDetails(page, tile, stattBox, priced.saleBox, priced.usedInlinePrice, validity, reference, pageImageUrl, pageRef)
  if (details.kind !== 'details') return details

  return buildOfferFromDetails(priced, details, flyerUrl, pageRef)
}

/** F6: did this offer's printed badge need the rappen grid, not just the pp rule, to pass? */
function usedRappenGrid(offer: Offer): boolean {
  if (!offer.discount || !offer.originalPrice) return false
  return discountConsistencyReason(offer.discount, offer.originalPrice, offer.salePrice) === 'grid'
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

  const stattItems = page.items.filter((i) => STATT_WORD.test(i.text))

  for (const stattItem of stattItems) {
    funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, anchors: 1 })
    const outcome = resolveAnchor(stattItem, page, validity, reference, pageImageUrl, flyerUrl)

    if (outcome.kind === 'offer') {
      offers.push(outcome.offer)
      funnel = addFunnel(funnel, {
        ...EMPTY_FUNNEL,
        accepted: 1,
        gridAccepted: usedRappenGrid(outcome.offer) ? 1 : 0,
        multiBuy: isMinimumQuantity(outcome.offer.quantityRequirement) ? 1 : 0,
      })
    } else if (outcome.kind === 'multi-buy-unquantified') {
      warnings.push(outcome.warning)
      funnel = addFunnel(funnel, { ...EMPTY_FUNNEL, multiBuyUnquantified: 1 })
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

      const yieldReason = migrosYieldReason(offers.length, funnel.anchors, funnel.multiBuyUnquantified)
      if (yieldReason) {
        return collectionFailed(
          'migros',
          yieldReason,
          `${formatFunnel(funnel)} — below the ${Math.round(MIGROS_MIN_ANCHOR_CONVERSION * 100)}% publishable-anchor conversion floor`,
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
