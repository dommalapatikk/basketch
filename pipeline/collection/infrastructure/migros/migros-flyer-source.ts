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
import { cropRegionImage } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'

export const MIGROS_EXPECTED_MINIMUM = 10

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

const PRICE = /^\d{1,3}[.,]\d{2}$/
const STATT = /statt\s*(\d{1,3}[.,]\d{2})/i
const PERCENT = /^(\d{1,2})\s*%$/

/**
 * Lines that are never a product name. Migros prints the unit basis and the
 * cooperative's own name in the same size as product titles, so OCR alone
 * cannot tell them apart.
 */
const DESCRIPTOR =
  /per\s*\d|in\s+Selbstbedienung|Genossenschaft|solange\s+Vorrat|Angebote\s+gelten|^\d+\s*(g|kg|ml|l|St(ü|u)ck)\b|^\(|Dazu\s+passt|SPAREN/i

export function issuuDocUrl(kw: number, year: number, region = 'zh', lang = 'd'): string {
  return `https://issuu.com/m-magazin/docs/migros-wochenflyer-${kw}-${year}-${lang}-${region}`
}

type Box = { x0: number; y0: number; x1: number; y1: number }

export function boxOf(item: OcrItem): Box {
  const xs = item.box.map((p) => p[0] ?? 0)
  const ys = item.box.map((p) => p[1] ?? 0)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const heightOf = (item: OcrItem) => {
  const b = boxOf(item)
  return b.y1 - b.y0
}
const centreX = (b: Box) => (b.x0 + b.x1) / 2

function toFrancs(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3})[.,](\d{2})$/)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
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

export function findValidity(pages: readonly OcrPage[], reference: Date): ValidityPeriod | null {
  for (const page of pages) {
    const joined = page.items.map((i) => i.text).join(' ')
    const found = parseValidityLine(joined, reference)
    if (found) return found
  }
  return null
}

/**
 * Groups a page's OCR regions into products.
 *
 * Anchor on each "statt" line: it is the most reliably read element and marks
 * exactly one product. The sale price is the tallest price-shaped token above
 * it in the same column; the name is the nearest text below.
 */
export function parsePage(
  page: OcrPage,
  validity: ValidityPeriod,
  pageImageUrl: string | null,
): { offers: Offer[]; warnings: CollectionWarning[] } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []

  const stattItems = page.items.filter((i) => STATT.test(i.text))

  for (const stattItem of stattItems) {
    const stattBox = boxOf(stattItem)
    const originalFrancs = toFrancs(stattItem.text.match(STATT)?.[1] ?? '')
    if (originalFrancs === null) {
      warnings.push({ message: `unreadable statt price: ${stattItem.text}`, item: `page ${page.pageNumber}` })
      continue
    }

    const near = page.items.filter((i) => Math.abs(centreX(boxOf(i)) - centreX(stattBox)) < page.width * 0.18)

    // The display sale price sits just above the statt line.
    const saleItem = near
      .filter((i) => PRICE.test(i.text.trim()) && boxOf(i).y1 <= stattBox.y1 + 5)
      .sort((a, b) => heightOf(b) - heightOf(a))[0]

    if (!saleItem) {
      // OCR mangles the big display numeral often enough to matter. Deriving it
      // from statt x (1 - discount) would be wrong by rappen and published as
      // fact, so the offer is dropped instead.
      warnings.push({
        message: `no readable display price above "statt ${originalFrancs.toFixed(2)}" — offer dropped rather than derived`,
        item: `page ${page.pageNumber}`,
      })
      continue
    }

    const saleFrancs = toFrancs(saleItem.text)
    if (saleFrancs === null) {
      warnings.push({ message: `unreadable sale price ${saleItem.text}`, item: `page ${page.pageNumber}` })
      continue
    }

    const sale = createMoney(saleFrancs)
    const original = createMoney(originalFrancs)
    if (!isOk(sale) || !isOk(original)) {
      warnings.push({ message: 'bad price pair', item: `page ${page.pageNumber}` })
      continue
    }

    // Product name: Migros sets the name to the RIGHT of the price block, at
    // roughly the same height — not below it. Below the price sits the unit
    // line ("per 100 g", "in Selbstbedienung"), which is a description.
    const nameItem = page.items
      .filter((i) => {
        const b = boxOf(i)
        // Vertically overlapping the price block, allowing a little drift.
        return b.y1 > stattBox.y0 - page.height * 0.06 && b.y0 < stattBox.y1 + page.height * 0.04
      })
      .filter((i) => boxOf(i).x0 > stattBox.x0 - 10)
      .filter((i) => !PRICE.test(i.text.trim()) && !PERCENT.test(i.text.trim()) && !STATT.test(i.text))
      .filter((i) => !DESCRIPTOR.test(i.text))
      .filter((i) => i.text.trim().length > 3)
      // Prefer the longest — product names are longer than stray fragments.
      .sort((a, b) => b.text.trim().length - a.text.trim().length)[0]

    const name = nameItem?.text.trim()
    if (!name) {
      warnings.push({ message: 'no product name near statt line', item: `page ${page.pageNumber}` })
      continue
    }

    let discount = null
    const pctItem = near.find((i) => PERCENT.test(i.text.trim()))
    if (pctItem) {
      const d = printedDiscount(Number(pctItem.text.trim().replace('%', '')))
      if (isOk(d)) discount = d.value
    }

    // Crop region spans the price block down to the name, in page fractions.
    let image = null
    if (pageImageUrl) {
      const nb = boxOf(nameItem!)
      const sb = boxOf(saleItem)
      const x0 = Math.max(0, Math.min(sb.x0, nb.x0) - 40)
      const y0 = Math.max(0, Math.min(sb.y0, nb.y0) - 260)
      const x1 = Math.min(page.width, Math.max(sb.x1, nb.x1) + 40)
      const y1 = Math.min(page.height, Math.max(sb.y1, nb.y1) + 20)
      const built = cropRegionImage({
        pageImageUrl,
        x: x0 / page.width,
        y: y0 / page.height,
        width: (x1 - x0) / page.width,
        height: (y1 - y0) / page.height,
      })
      if (isOk(built)) image = built.value
    }

    const offer = createOffer({
      retailer: 'migros',
      productName: name,
      salePrice: sale.value,
      originalPrice: original.value,
      discount,
      validity,
      image,
      // Migros DOES print category headings ("Brot & Backwaren") — the only
      // retailer that does. Associating them to products needs heading
      // detection that is not built yet, so this stays null for now.
      sourceCategory: null,
      sourceUrl: null,
    })

    if (isOk(offer)) offers.push(offer.value)
    else warnings.push({ message: `${name}: ${offer.error}`, item: `page ${page.pageNumber}` })
  }

  return { offers, warnings }
}

export function parseFlyer(
  pages: readonly OcrPage[],
  reference: Date,
  fallbackValidity: ValidityPeriod | null,
  pageImageUrl?: (pageNumber: number) => string,
): { offers: Offer[]; warnings: CollectionWarning[] } {
  const validity = findValidity(pages, reference) ?? fallbackValidity
  if (!validity) return { offers: [], warnings: [{ message: 'no validity line found in the flyer' }] }

  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  for (const page of pages) {
    const r = parsePage(page, validity, pageImageUrl?.(page.pageNumber) ?? null)
    offers.push(...r.offers)
    warnings.push(...r.warnings)
  }
  return { offers, warnings }
}

// ── the source ───────────────────────────────────────────────────────────────

export type MigrosSourceDeps = {
  /** Injected so tests use captured OCR output rather than running a model. */
  loadPages: () => Promise<OcrPage[]>
  reference?: Date
  fallbackValidity?: ValidityPeriod | null
  pageImageUrl?: (pageNumber: number) => string
  expectedMinimumOffers?: number
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

      const { offers, warnings } = parseFlyer(
        pages,
        deps.reference ?? new Date(),
        deps.fallbackValidity ?? null,
        deps.pageImageUrl,
      )
      return collectedWithYieldCheck({ retailer: 'migros', expectedMinimumOffers }, offers, warnings)
    },
  }
}
