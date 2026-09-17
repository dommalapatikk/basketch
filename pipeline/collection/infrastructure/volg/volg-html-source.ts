// VolgHtmlSource — anti-corruption layer for Volg's weekly promotions page.
//
//   GET https://www.volg.ch/sortiment/wochenaktionen/
//
// No API and none needed: the HTML is already structured markup. Volg is also
// the only retailer whose published set equals its full offer set — no app-only
// or online-only promotions were found (research Part 2).
//
// Two Volg-specific quirks this layer absorbs:
//
//  1. THREE sections with DIFFERENT validity windows. "Frische-Aktionen" runs
//     Wed–Sat while "Volg-Aktionen" and "Weitere Aktionen" run Mon–Sat. Applying
//     one window to all of them would publish fresh items as valid two days
//     early, which is exactly the Art. 3(1)(e) UWG accuracy problem.
//
//  2. Dates carry NO YEAR — "Mi. 09.09. bis Sa. 12.09.". The year is inferred
//     from a reference date, handling the December→January rollover.
//
// Volg publishes no per-product links, so sourceUrl is the page itself.
// c-product__title, c-product__price-main, c-product__reduction etc. stop here.

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

const PAGE_URL = 'https://www.volg.ch/sortiment/wochenaktionen/'
const SITE = 'https://www.volg.ch'

export const VOLG_EXPECTED_MINIMUM = 10

/**
 * Volg rounds shelf prices to 5 rappen. Confirmed on the committed fixture:
 * every sale and statt price observed (6.90, 11.95, 2.-, 9.20, 14.95, …) is a
 * multiple of 5. WP-C2 backstop — see collection/domain/discount.ts.
 */
export const VOLG_PRICE_STEP_RAPPEN = 5

// ── small HTML helpers (the markup is regular; no parser dependency needed) ──

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

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
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim()
}

// ── dates ────────────────────────────────────────────────────────────────────

/**
 * "Mi. 09.09. bis Sa. 12.09." → { from, to }, year inferred from `reference`.
 *
 * If the parsed month is far behind the reference month, the window belongs to
 * next year (a late-December page listing January dates).
 */
export function parseSectionDates(text: string, reference: Date): ValidityPeriod | null {
  const match = text.match(/(\d{1,2})\.(\d{1,2})\.\s*bis[^0-9]*(\d{1,2})\.(\d{1,2})\./)
  if (!match) return null
  const d1 = Number(match[1])
  const m1 = Number(match[2])
  const d2 = Number(match[3])
  const m2 = Number(match[4])
  if (![d1, m1, d2, m2].every(Number.isFinite)) return null

  const refYear = reference.getUTCFullYear()
  const refMonth = reference.getUTCMonth() + 1
  const yearFor = (month: number) => (refMonth >= 11 && month <= 2 ? refYear + 1 : refYear)

  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${yearFor(m1)}-${pad(m1)}-${pad(d1)}`
  // A window may straddle a year boundary (28.12 → 03.01).
  const toYear = m2 < m1 ? yearFor(m1) + 1 : yearFor(m2)
  const to = `${toYear}-${pad(m2)}-${pad(d2)}`

  const v = createValidityPeriod(from, to)
  return isOk(v) ? v.value : null
}

// ── prices ───────────────────────────────────────────────────────────────────

/** "6.90" → 6.9 · "10.–" → 10 */
export function parseSwissPrice(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.match(/(\d{1,4})[.,](\d{2}|[–-])/)
  if (!m) return null
  const cents = m[2] === '–' || m[2] === '-' ? 0 : Number(m[2])
  const francs = Number(m[1])
  return Number.isFinite(francs) && Number.isFinite(cents) ? francs + cents / 100 : null
}

/** "-25%" → 25 */
export function parseReduction(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.match(/(\d{1,2})\s*%/)
  return m ? Number(m[1]) : null
}

// ── parsing ──────────────────────────────────────────────────────────────────

type Section = { title: string; validity: ValidityPeriod | null; html: string }

/**
 * Splits the page into its promo sections so each carries its own window.
 * Falls back to a single unnamed section if the headings ever disappear.
 */
export function splitSections(html: string, reference: Date): Section[] {
  const headingRe = /c-section__subtitle[^>]*>([\s\S]{0,400}?)<\/(?:h\d|div|span)>/g
  const marks: { title: string; validity: ValidityPeriod | null; index: number }[] = []

  for (const m of html.matchAll(headingRe)) {
    // The heading element carries BOTH the section name and its date range,
    // e.g. "Frische-Aktionen Mi. 09.09. bis Sa. 12.09."
    const headText = clean(m[1] ?? '')
    if (!headText) continue
    const validity = parseSectionDates(headText, reference)
    // Title is everything before the date range.
    const title = headText.replace(/\s*(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*\d{1,2}\.\d{1,2}\..*$/i, '').trim()
    marks.push({ title: title || headText, validity, index: m.index })
  }

  if (marks.length === 0) return [{ title: '', validity: null, html }]

  return marks.map((mark, i) => ({
    title: mark.title,
    validity: mark.validity,
    html: html.slice(mark.index, marks[i + 1]?.index ?? html.length),
  }))
}

/**
 * MUST-FIX 1 (code review): the LAST product in a section has no next
 * "c-product" marker to stop at, so its slice used to run all the way to the
 * end of `sectionHtml` — which, for the page's last section, is the end of
 * the entire fetched document: share buttons, scripts, and `<footer>`. A bare
 * text search anywhere in THAT block (the "statt" price match below has no
 * class anchor, unlike title/price/reduction) can then pick up chrome content
 * as if it belonged to the product — a wrong IMAGE (isChromeImagePath) or,
 * worse, a fabricated PRICE (a crossed-out price Volg never printed, the Art.
 * 3(1)(e) UWG exposure the regression test below is named after). Bounding
 * every block before the trailing chrome — the share-buttons `<section>` AND
 * `<footer>`, see below — closes both at once, at the source.
 */
function parseProductBlocks(sectionHtml: string): string[] {
  // Blocks are delimited by the opening tag; slice to the next one.
  const starts: number[] = []
  const re = /<div class="c-product"/g
  for (const m of sectionHtml.matchAll(re)) starts.push(m.index)

  // On the LAST promo section, sectionHtml runs past the product grid: a
  // share-buttons `<section>` and scripts sit between the grid and
  // `<footer>` (verified on the committed fixture). Bounding at `<footer`
  // alone is not enough — that chrome section itself, not only the footer,
  // is where the fabricated-price mutation in the regression test lands.
  // Bounding at whichever of `<section` or `<footer` comes first closes both.
  const chromeIndexes = [sectionHtml.search(/<section\b/), sectionHtml.search(/<footer\b/)].filter((i) => i >= 0)
  const end = chromeIndexes.length > 0 ? Math.min(...chromeIndexes) : sectionHtml.length

  return starts.map((s, i) => sectionHtml.slice(s, starts[i + 1] ?? end))
}

/**
 * Rejects an image path that is obviously site chrome, not a product photo.
 *
 * THE DEFECT (QA 2026-09-16): "volg küchenreiniger spray" was published with
 * `image_url = https://www.volg.ch/_assets/.../Images/logo-footer.svg` — the
 * site's own footer logo. Root cause, traced against the committed fixture:
 * `parseProductBlocks` slices each product from its own `<div class="c-product">`
 * to the NEXT one — or, for the LAST product in the LAST section, to the end
 * of the fetched HTML, because no next marker exists. When that last product's
 * own `<div class="c-product__image">` is empty (no `<img>` at all — a real,
 * fairly common shape on this page), the single greedy `<img>` regex below
 * keeps scanning past the product grid, past the share buttons, into
 * `<footer class="c-footer">`, and finds the site's own logo — reproduced
 * verbatim on the committed fixture's last item, "Glade Duftkerze Anti-Tabac".
 *
 * A content guard is the fix that holds regardless of which product ends up
 * last on a future page (restructuring the slice boundary would only move the
 * failure mode, not remove it): if the matched path names logo/icon/sprite
 * chrome, it was never a product photo, so no image beats a wrong one.
 */
export function isChromeImagePath(url: string): boolean {
  return /\b(logo|favicon|sprite|icon)\b/i.test(url)
}

export function mapBlockToOffer(
  block: string,
  validity: ValidityPeriod | null,
): { offer: Offer } | { warning: string } {
  const title = block.match(/c-product__title[^>]*>([\s\S]*?)<\/h3>/)
  const name = title ? clean(title[1] ?? '') : ''
  if (!name) return { warning: 'product block has no title' }

  if (!validity) return { warning: `${name}: no validity window for its section` }

  const priceMain = block.match(/c-product__price-main[^>]*>([\s\S]*?)<\/span>/)
  const saleFrancs = parseSwissPrice(priceMain ? clean(priceMain[1] ?? '') : null)
  if (saleFrancs === null) return { warning: `${name}: no sale price` }
  const sale = createMoney(saleFrancs)
  if (!isOk(sale)) return { warning: `${name}: bad sale price ${saleFrancs}` }

  const stattMatch = block.match(/statt\s*([\d.,–-]+)/)
  const originalFrancs = parseSwissPrice(stattMatch ? stattMatch[1] : null)
  let original = null
  if (originalFrancs !== null) {
    const m = createMoney(originalFrancs)
    if (!isOk(m)) return { warning: `${name}: bad original price ${originalFrancs}` }
    original = m.value
  }

  let discount = null
  if (original !== null) {
    const red = block.match(/c-product__reduction[^>]*>([\s\S]*?)<\/div>/)
    const pct = parseReduction(red ? clean(red[1] ?? '') : null)
    if (pct !== null) {
      const d = printedDiscount(pct, { priceStepRappen: VOLG_PRICE_STEP_RAPPEN })
      if (isOk(d)) discount = d.value
    }
  }

  const imgSrc = block.match(/<img[^>]+src="([^"]+)"/)
  const rawImageUrl = imgSrc ? (imgSrc[1]!.startsWith('http') ? imgSrc[1]! : `${SITE}${imgSrc[1]}`) : null
  const imageUrl = rawImageUrl && !isChromeImagePath(rawImageUrl) ? rawImageUrl : null
  const image = imageUrl ? sourceUrlImage(imageUrl) : null

  const offer = createOffer({
    retailer: 'volg',
    productName: name,
    salePrice: sale.value,
    originalPrice: original,
    discount,
    validity,
    image: image && isOk(image) ? image.value : null,
    // Volg publishes no product taxonomy — only three promo-type sections,
    // which are not categories. Our classifier handles this retailer.
    sourceCategory: null,
    // No per-product links exist; the page is the best available reference.
    sourceUrl: PAGE_URL,
  })

  return isOk(offer) ? { offer: offer.value } : { warning: `${name}: ${offer.error}` }
}

export function parsePage(
  html: string,
  reference: Date,
): { offers: Offer[]; warnings: CollectionWarning[]; sections: number } {
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  const sections = splitSections(html, reference)

  for (const section of sections) {
    for (const block of parseProductBlocks(section.html)) {
      const mapped = mapBlockToOffer(block, section.validity)
      if ('offer' in mapped) offers.push(mapped.offer)
      else warnings.push({ message: mapped.warning, item: section.title || undefined })
    }
  }

  return { offers, warnings, sections: sections.length }
}

// ── the source ───────────────────────────────────────────────────────────────

export type VolgSourceDeps = {
  fetchPage: () => Promise<string>
  /** Injected so year inference is deterministic under test. */
  reference?: Date
  expectedMinimumOffers?: number
}

export async function httpFetchPage(): Promise<string> {
  const res = await fetch(PAGE_URL, {
    headers: { 'User-Agent': 'basketch/1.0 (+https://basketch.vercel.app; weekly price comparison)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export function createVolgHtmlSource(deps: VolgSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? VOLG_EXPECTED_MINIMUM

  return {
    retailer: 'volg',
    expectedMinimumOffers,

    // volg.ch/sortiment/wochenaktionen/ is a single "current promotions" page
    // with no week-numbered URL — the "fresh" section's later start (WP-J1
    // ADR) is a validity window INSIDE this one publication, not a second
    // one. The edition is the plain ISO week of the day we asked, kept for
    // the WP-J2 ledger's own bookkeeping, not for building a request.
    editionFor(date: Date): Edition {
      return edition('volg', isoWeekOf(date))
    },

    async fetchOffers(_edition: Edition): Promise<CollectionResult> {
      let html: string
      try {
        html = await deps.fetchPage()
      } catch (e) {
        return collectionFailed('volg', 'source-unavailable', e instanceof Error ? e.message : String(e))
      }

      const { offers, warnings } = parsePage(html, deps.reference ?? new Date())
      return collectedWithYieldCheck({ retailer: 'volg', expectedMinimumOffers }, offers, warnings)
    },
  }
}
