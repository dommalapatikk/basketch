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
import { type Edition, edition } from '../../domain/edition'
import { isoWeekOf } from '../../domain/iso-week'
import { createMoney } from '../../domain/money'
import { type Offer, createOffer } from '../../domain/offer'
import {
  type CollectionResult,
  type CollectionWarning,
  type OfferSource,
  collectedWithYieldCheck,
  collectionFailed,
} from '../../domain/offer-source'
import { sourceUrlImage } from '../../domain/product-image'
import { isOk } from '../../domain/result'
import { type ValidityPeriod, createValidityPeriod } from '../../domain/validity-period'
import { isDisplayTruncated } from '../../../../shared/types'

const SITE = 'https://www.aktionis.ch'
const VENDOR_PATH = '/vendors/coop'

/** aktionis carried ~1006 Coop deals when measured; a healthy run clears 300. */
export const COOP_EXPECTED_MINIMUM = 300

/**
 * Coop rounds shelf prices to 5 rappen. Confirmed on the committed fixture:
 * every observed price-new/price-old pair (4.45/9.95, 15.90/35.70,
 * 45.60/101.70, 24.95/53.20) is a multiple of 5. WP-C2 backstop — see
 * collection/domain/discount.ts.
 */
export const COOP_PRICE_STEP_RAPPEN = 5

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

// ── the h3 truncation guard ──────────────────────────────────────────────────
//
// aktionis truncates <h3 class="card-title"> server-side at ~42–59 characters
// with a literal "...". On the live site 274 of 923 Coop deals (29.7%) ended
// in it — two Soave vintages and four L'Oréal shades each collapsing into one
// row, because the vintage/shade is exactly what a mid-word cut removes
// (HANDOVER item 8, WP-C3).
//
// The full name is on the SAME card, in the link's
// title="Mehr Infos über …" — zero extra requests, so the one-fetch rule
// holds. It is accepted only if it starts with the h3 text minus "..." — a
// cross-check against aktionis ever changing its wording without telling us.
// If the check fails, the truncated h3 is kept, with a warning, rather than
// silently publishing a stray title string as a product name.

/**
 * The SHAPE aktionis' own appended descriptor always takes: " – <type>,
 * <country> (<volume>)" — e.g. " – Weisswein, Italien (0.75l)". Verified
 * against all 17 dash-bearing titles across both committed fixtures.
 *
 * Deliberately a shape check, not "does it contain ' – ' at all": a product's
 * OWN name can contain an en dash, or a hyphen an editor typed as one — e.g.
 * a hypothetical "Bio Rüebli – Schweiz". Stripping on `indexOf(' – ')` alone
 * would cut that to "Bio Rüebli" permanently, with no warning — the exact
 * defect this file exists to fix, by a different route (code review finding
 * F1, WP-C3 round 2).
 */
// Both dash characters, because only the en dash was observed and a silent
// miss on an em dash would be the same defect wearing a different character
// (code review N1). The separator is captured once here so the search and the
// shape check can never disagree about what a separator is.
const AKTIONIS_DESCRIPTOR_SEPARATOR = /[ ][–—][ ]/
const AKTIONIS_DESCRIPTOR_SHAPE = /^ [–—] [^–—,]+, [^–—(]+\(\d+(?:[.,]\d+)?\s*[a-zA-Zäöü]+\)$/

/**
 * aktionis appends its own descriptor after every wine's full name, separated
 * by an en dash: "Chardonnay California Round Hill (2023) – Weisswein, USA
 * (0.75l)". TP-8 (PM decision, 2026-09-15): identity only. The vintage stays
 * — it is part of the name, before the dash — but the type/country/volume
 * aktionis adds is aktionis' OWN labelling of Coop's product, not Coop's own
 * (the same provenance reason `sourceCategory` stays null below). It is
 * dropped here: never stored, never displayed, never handed to the
 * classifier — there is nowhere downstream that could pick it up again,
 * because this adapter never puts it in `sourceAttributes.descriptor` either.
 *
 * A " – " that does NOT match the descriptor shape is left untouched, with a
 * warning rather than silence — so an aktionis format change is visible in
 * the run log instead of quietly cutting a real product name.
 */
function stripAktionisDescriptor(fullName: string): { name: string; warning?: string } {
  const dashIndex = fullName.search(AKTIONIS_DESCRIPTOR_SEPARATOR)
  if (dashIndex === -1) return { name: fullName }

  const tail = fullName.slice(dashIndex)
  if (!AKTIONIS_DESCRIPTOR_SHAPE.test(tail)) {
    return {
      name: fullName,
      warning: `${fullName}: a descriptor separator is present but its tail does not match aktionis' descriptor shape — kept in full`,
    }
  }

  return { name: fullName.slice(0, dashIndex).trim() }
}

function withoutTruncationMarker(name: string): string {
  return name.replace(/(\.\.\.|…)\s*$/, '').trim()
}

/**
 * Resolves the full product name for a card.
 *
 * - h3 not truncated: use it (after stripping aktionis' own appended text,
 *   in case a future untruncated card ever carries it too).
 * - h3 truncated, and the title attribute extends it: use the title, minus
 *   the appended descriptor. The vintage/shade/volume before it survives.
 * - h3 truncated, and the title attribute does NOT extend it: fall back to
 *   the truncated h3, with a warning — never publish an unrelated string.
 */
function resolveFullName(h3Name: string, rawTitle: string | null): { name: string; warning?: string } {
  if (!isDisplayTruncated(h3Name)) return stripAktionisDescriptor(h3Name)

  const h3Prefix = withoutTruncationMarker(h3Name)
  if (rawTitle && rawTitle.startsWith(h3Prefix)) {
    return stripAktionisDescriptor(rawTitle)
  }

  return {
    name: h3Name,
    warning: `${h3Name}: the title attribute does not extend the truncated h3 — falling back to it`,
  }
}

// ── card → Offer ─────────────────────────────────────────────────────────────

export function mapCardToOffer(card: string): { offer: Offer; warning?: string } | { warning: string } {
  const h3Name = firstGroup(card, /class="card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)
  if (!h3Name) return { warning: 'card has no title' }

  const rawTitle = firstGroup(card, /<a[^>]+title="Mehr Infos über ([^"]*)"/)
  const resolved = resolveFullName(h3Name, rawTitle)
  const name = resolved.name

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
      const d = printedDiscount(pct, { priceStepRappen: COOP_PRICE_STEP_RAPPEN })
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

  if (!isOk(offer)) return { warning: `${name}: ${offer.error}` }
  return resolved.warning ? { offer: offer.value, warning: resolved.warning } : { offer: offer.value }
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
    if ('offer' in mapped) {
      offers.push(mapped.offer)
      if (mapped.warning) warnings.push({ message: mapped.warning, item: mapped.offer.productName })
    } else {
      warnings.push({ message: mapped.warning })
    }
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

    // aktionis.ch/vendors/coop is a continuously-updated listing, not a
    // week-numbered URL — there is no publication identifier to read off the
    // wire. The edition is the plain ISO week of the day we asked, kept for
    // the WP-J2 ledger's own bookkeeping, not for building a request.
    editionFor(date: Date): Edition {
      return edition('coop', isoWeekOf(date))
    },

    async fetchOffers(_edition: Edition): Promise<CollectionResult> {
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
