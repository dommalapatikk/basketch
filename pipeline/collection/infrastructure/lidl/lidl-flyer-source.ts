// LidlFlyerSource — anti-corruption layer for LIDL Schweiz's weekly flyer.
//
//   GET https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw{NN}
//
// LIDL is the only source where the convenient route is the DANGEROUS one.
//
// ── The member-price problem ────────────────────────────────────────────────
//
// The flyer JSON reports the Lidl Plus loyalty price with NO indication that it
// is one. Research found red grapes at `price: "1.39"` when a non-member pays
// 1.49; the PDF says "Lidl Plus" 47 times, the JSON zero. Publishing that price
// as if anyone can pay it is exactly the Art. 3(1)(e) UWG exposure — a price
// comparison must be objectively correct.
//
// The JSON carries no loyalty field of any kind, so the price cannot be trusted
// on its own. The PDF is the only cross-check, and it is awkward: text is
// glyph-spaced ("A b D o. 1 0. 9."), so "Lidl Plus" only matches after
// whitespace is squashed out, and `pdftotext -bbox` crashes on this file
// (poppler std::out_of_range) so per-product coordinates are unavailable.
//
// What IS available: which PAGE a product sits on (flyer.pages[].links[].id)
// and whether that page mentions Lidl Plus. Measured on KW37: 29 mentions
// across 18 of 34 pages.
//
// DECISION: products on a page that mentions Lidl Plus are DROPPED with a
// warning. Page-level is coarse and this discards roughly half of LIDL, but the
// alternatives are worse — publishing a price nobody pays, or labelling every
// LIDL offer member-only when most are not. Refusing to guess is the same rule
// the domain applies everywhere else. The dropped count is visible in telemetry.
//
// ── Validity ────────────────────────────────────────────────────────────────
//
// Use offerStartDate/offerEndDate, NOT startDate/endDate. On KW37 the flyer
// publishes on 2026-09-06 but the offers only run 2026-09-10 → 2026-09-16,
// which matches the window printed on the PDF ("Ab Do. 10.9. bis Mi. 16.9.").
// Using startDate would publish every offer as valid four days early.

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

export const LIDL_EXPECTED_MINIMUM = 40
const LOYALTY_MARKER = 'lidlplus'

// ── LIDL's wire shape. Referenced nowhere outside this file. ────────────────

type LidlProduct = {
  productId?: string
  title?: string
  price?: string
  image?: string
  url?: string
  categoryPrimary?: string
  description?: string
}

type LidlPageLink = { id?: string; displayType?: string }
type LidlPage = { number?: number; links?: LidlPageLink[] }

type LidlFlyer = {
  offerStartDate?: string
  offerEndDate?: string
  startDate?: string
  endDate?: string
  pdfUrl?: string
  pages?: LidlPage[]
  products?: Record<string, LidlProduct>
}

export type LidlResponse = { flyer?: LidlFlyer }

export function flyerUrl(kw: number): string {
  return `https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=lidl-aktuell-kw${String(kw).padStart(2, '0')}`
}

/**
 * Whitespace-insensitive search. The PDF's text layer separates every glyph,
 * so "Lidl Plus" arrives as "L i d l P l u s".
 */
export function squash(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

/** Page numbers (1-based) whose text mentions Lidl Plus. */
export function pagesMentioningLoyalty(pdfText: string): Set<number> {
  const pages = pdfText.split('\f')
  const found = new Set<number>()
  pages.forEach((page, i) => {
    if (squash(page).includes(LOYALTY_MARKER)) found.add(i + 1)
  })
  return found
}

/** Maps each product key to the page it appears on. */
export function productPageIndex(flyer: LidlFlyer): Map<string, number> {
  const index = new Map<string, number>()
  for (const page of flyer.pages ?? []) {
    const number = page.number
    if (typeof number !== 'number') continue
    for (const link of page.links ?? []) {
      if (link.id && !index.has(link.id)) index.set(link.id, number)
    }
  }
  return index
}

export function readValidity(flyer: LidlFlyer): ValidityPeriod | null {
  // offerStart/End is the window the prices are actually valid for.
  const from = flyer.offerStartDate
  const to = flyer.offerEndDate
  if (!from || !to) return null
  const v = createValidityPeriod(from, to)
  return isOk(v) ? v.value : null
}

export function parseFlyer(
  body: unknown,
  pdfText: string,
): { offers: Offer[]; warnings: CollectionWarning[]; droppedForLoyalty: number } {
  const flyer = (body as LidlResponse)?.flyer
  const offers: Offer[] = []
  const warnings: CollectionWarning[] = []
  let droppedForLoyalty = 0

  if (!flyer) return { offers, warnings: [{ message: 'no flyer in response' }], droppedForLoyalty }

  const validity = readValidity(flyer)
  if (!validity) {
    return { offers, warnings: [{ message: 'no offer validity window in flyer' }], droppedForLoyalty }
  }

  const loyaltyPages = pagesMentioningLoyalty(pdfText)
  const pageOf = productPageIndex(flyer)

  for (const [key, product] of Object.entries(flyer.products ?? {})) {
    const name = product.title?.trim()
    if (!name) {
      warnings.push({ message: `product ${product.productId ?? key} has no title` })
      continue
    }

    const page = pageOf.get(key)
    if (page === undefined) {
      // Without a page we cannot run the loyalty check, so we cannot vouch for
      // the price.
      warnings.push({ message: `${name}: not linked to any page, cannot verify price basis` })
      continue
    }

    if (loyaltyPages.has(page)) {
      droppedForLoyalty += 1
      warnings.push({ message: `${name}: page ${page} mentions Lidl Plus — price basis unverifiable`, item: `page ${page}` })
      continue
    }

    const priceText = product.price
    const francs = priceText ? Number(priceText.replace(',', '.')) : Number.NaN
    if (!Number.isFinite(francs)) {
      warnings.push({ message: `${name}: unreadable price ${String(priceText)}` })
      continue
    }
    const sale = createMoney(francs)
    if (!isOk(sale)) {
      warnings.push({ message: `${name}: bad price ${francs} — ${sale.error}` })
      continue
    }

    const image = product.image ? sourceUrlImage(product.image) : null

    const offer = createOffer({
      retailer: 'lidl',
      productName: name,
      salePrice: sale.value,
      // The flyer JSON carries no reference price at all, so there is nothing
      // to derive a discount from. The ALDI rule keeps both null.
      originalPrice: null,
      discount: null,
      validity,
      image: image && isOk(image) ? image.value : null,
      // categoryPrimary is only "Food" / "Non Food" — not a grocery taxonomy.
      sourceCategory: null,
      sourceUrl: product.url ?? null,
    })

    if (isOk(offer)) offers.push(offer.value)
    else warnings.push({ message: `${name}: ${offer.error}` })
  }

  return { offers, warnings, droppedForLoyalty }
}

// ── the source ───────────────────────────────────────────────────────────────

export type LidlSourceDeps = {
  fetchFlyer: () => Promise<unknown>
  /** Required — without it no price can be vouched for. */
  fetchPdfText: () => Promise<string>
  expectedMinimumOffers?: number
}

export function createLidlFlyerSource(deps: LidlSourceDeps): OfferSource {
  const expectedMinimumOffers = deps.expectedMinimumOffers ?? LIDL_EXPECTED_MINIMUM

  return {
    retailer: 'lidl',
    expectedMinimumOffers,

    async fetchOffers(_week: IsoWeek): Promise<CollectionResult> {
      let body: unknown
      try {
        body = await deps.fetchFlyer()
      } catch (e) {
        return collectionFailed('lidl', 'source-unavailable', e instanceof Error ? e.message : String(e))
      }

      let pdfText: string
      try {
        pdfText = await deps.fetchPdfText()
      } catch (e) {
        // Deliberate: the PDF is the ONLY way to tell a public price from a
        // Lidl Plus price. Without it, every price is unverifiable, and
        // publishing unverifiable prices is the one thing we will not do.
        return collectionFailed(
          'lidl',
          'source-unavailable',
          `cannot verify member prices without the flyer PDF: ${e instanceof Error ? e.message : String(e)}`,
        )
      }

      const { offers, warnings } = parseFlyer(body, pdfText)
      return collectedWithYieldCheck({ retailer: 'lidl', expectedMinimumOffers }, offers, warnings)
    },
  }
}
