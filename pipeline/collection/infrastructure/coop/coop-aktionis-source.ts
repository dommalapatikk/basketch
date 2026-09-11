// CoopAktionisSource — anti-corruption layer for Coop offers via aktionis.ch.
//
//   GET https://www.aktionis.ch/vendors/coop        (page 1)
//   GET https://www.aktionis.ch/vendors/coop/{n}    (pages 2..n)
//
// WHY Coop is the one retailer we do NOT reach directly:
//
//   coop.ch is behind DataDome and returns 403 to every non-browser client,
//   including robots.txt. Defeating that would be circumvention of a technical
//   protection measure — the explicit condition the 2023 Federal Supreme Court
//   rulings forbid (see CLAUDE.md § Legal Constraints).
//
//   Coop's own epaper flyer IS openly served, but it was measured as an ~11%
//   subset: 31 of 281 sampled aktionis products appear in it (research Part 4c).
//   Coop runs ~1000 promotions a week and prints ~195. Tested and rejected: that
//   the remainder are stale (25/25 sampled were current) or from other weeks
//   (40/40 sampled ended on the same date as the flyer window).
//
//   aktionis is therefore the only source carrying Coop's full weekly set.
//
// aktionis' own terms carry no anti-scraping, anti-bot or database clause
// (verified term by term), and /vendors/* is not disallowed in its robots.txt.
//
// Everything on the listing card — id, both prices, discount, validity window,
// image, link — so no per-deal fetches are needed. ~20 page requests per run.
//
// card-title, price-new, price-old, data-upox-id etc. stop at this file.

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
import { sourceUrlImage } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'

const SITE = 'https://www.aktionis.ch'
const VENDOR_PATH = '/vendors/coop'

/** aktionis carried ~1006 Coop deals when measured; a healthy run clears 300. */
export const COOP_EXPECTED_MINIMUM = 300

/** Safety stop — measured at ~20 pages of 51. */
const MAX_PAGES = 40

// ── helpers ──────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function firstGroup(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m?.[1] ? clean(m[1]) : null
}

/** "4.45" → 4.45 · "10.–" → 10 */
export function parsePrice(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/(\d{1,4})[.,](\d{2}|[–-])/)
  if (!m) return null
  const cents = m[2] === '–' || m[2] === '-' ? 0 : Number(m[2])
  return Number(m[1]) + cents / 100
}

/** "55%" → 55 */
export function parseDiscountPercent(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/(\d{1,2})\s*%/)
  return m ? Number(m[1]) : null
}

/**
 * "07.09.2026 - 09.09.2026" → validity window.
 * Unlike Volg, aktionis prints the full year, so nothing is inferred.
 */
export function parseCardDate(text: string | null): ValidityPeriod | null {
  if (!text) return null
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  const [, d1, m1, y1, d2, m2, y2] = m
  const v = createValidityPeriod(`${y1}-${m1}-${d1}`, `${y2}-${m2}-${d2}`)
  return isOk(v) ? v.value : null
}

// ── card → Offer ─────────────────────────────────────────────────────────────

export function mapCardToOffer(card: string): { offer: Offer } | { warning: string } {
  const name = firstGroup(card, /class="card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)
  if (!name) return { warning: 'card has no title' }

  const validity = parseCardDate(firstGroup(card, /class="card-date"[^>]*>([\s\S]*?)<\/span>/))
  if (!validity) return { warning: `${name}: no validity window on the card` }

  const saleFrancs = parsePrice(firstGroup(card, /class="price-new"[^>]*>([\s\S]*?)<\/span>/))
  if (saleFrancs === null) return { warning: `${name}: no sale price` }
  const sale = createMoney(saleFrancs)
  if (!isOk(sale)) return { warning: `${name}: bad sale price ${saleFrancs} — ${sale.error}` }

  const originalFrancs = parsePrice(firstGroup(card, /class="price-old"[^>]*>([\s\S]*?)<\/span>/))
  let original = null
  if (originalFrancs !== null) {
    const m = createMoney(originalFrancs)
    if (!isOk(m)) return { warning: `${name}: bad original price ${originalFrancs}` }
    original = m.value
  }

  let discount = null
  if (original !== null) {
    const pct = parseDiscountPercent(firstGroup(card, /class="price-discount"[^>]*>([\s\S]*?)<\/span>/))
    if (pct !== null) {
      const d = printedDiscount(pct)
      if (isOk(d)) discount = d.value
    }
  }

  // Product image lives on aktionis' CDN. Hotlinked, never copied — Art. 2
  // Abs. 3bis URG protects Swiss product photographs.
  const imgMatch = card.match(/class="card-image"[\s\S]*?<img[^>]+src="([^"]+)"/)
  const image = imgMatch?.[1] ? sourceUrlImage(imgMatch[1]) : null

  const hrefMatch = card.match(/<a[^>]+href="(\/deals\/[^"]+)"/)
  const sourceUrl = hrefMatch?.[1] ? `${SITE}${hrefMatch[1]}` : null

  const offer = createOffer({
    retailer: 'coop',
    productName: name,
    salePrice: sale.value,
    originalPrice: original,
    discount,
    validity,
    image: image && isOk(image) ? image.value : null,
    // Deliberately null. aktionis publishes its own 39-label taxonomy, but that
    // is a third party's labelling of Coop's products, not Coop's own. Passing
    // it as sourceCategory would misrepresent provenance and hand the
    // categoriser a signal we cannot attribute to the retailer. Our model
    // classifies Coop from the product name, and Denner's genuine retailer
    // categories remain the marking scheme.
    sourceCategory: null,
    sourceUrl,
  })

  return isOk(offer) ? { offer: offer.value } : { warning: `${name}: ${offer.error}` }
}

export function parseCards(html: string): string[] {
  const starts: number[] = []
  for (const m of html.matchAll(/<div data-upox-id="/g)) starts.push(m.index)
  return starts.map((s, i) => html.slice(s, starts[i + 1] ?? html.length))
}

export function parsePage(html: string): { offers: Offer[]; warnings: CollectionWarning[] } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  for (const card of parseCards(html)) {
    const mapped = mapCardToOffer(card)
    if ('offer' in mapped) offers.push(mapped.offer)
    else warnings.push({ message: mapped.warning })
  }
  return { offers, warnings }
}

// ── the source ───────────────────────────────────────────────────────────────

export type CoopSourceDeps = {
  fetchPage: (page: number) => Promise<string>
  expectedMinimumOffers?: number
  maxPages?: number
}

export async function httpFetchPage(page: number): Promise<string> {
  const url = page <= 1 ? `${SITE}${VENDOR_PATH}` : `${SITE}${VENDOR_PATH}/${page}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`)
  return res.text()
}

export function createCoopAktionisSource(deps: CoopSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? COOP_EXPECTED_MINIMUM
  const maxPages = deps.maxPages ?? MAX_PAGES

  return {
    retailer: 'coop',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      const all: Offer[] = []
      const warnings: CollectionWarning[] = []
      // The pagination widget shows only 6 links even though ~20 pages exist,
      // so walk until a page yields nothing new rather than trusting the widget.
      const seenIds = new Set<string>()

      for (let page = 1; page <= maxPages; page++) {
        let html: string
        try {
          html = await deps.fetchPage(page)
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e)
          if (page === 1) return collectionFailed('coop', 'source-unavailable', detail)
          warnings.push({ message: `page ${page} failed: ${detail}` })
          break
        }

        const ids = parseCards(html).map((c) => c.match(/data-upox-id="(\d+)"/)?.[1] ?? '')
        const fresh = ids.filter((id) => id && !seenIds.has(id))
        if (fresh.length === 0) break
        for (const id of fresh) seenIds.add(id)

        const { offers, warnings: pageWarnings } = parsePage(html)
        all.push(...offers)
        warnings.push(...pageWarnings)
      }

      return collectedWithYieldCheck({ retailer: 'coop', expectedMinimumOffers }, all, warnings)
    },
  }
}
