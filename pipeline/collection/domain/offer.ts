// Offer — the aggregate root. One promoted product, one retailer, one period.
//
// Every rule below exists because of a defect found in real source data during
// the 2026-09 source research. See docs/data-source-research-2026-09-07.md.
//
// The whole point of this file: an invalid Offer cannot be constructed. There is
// no setter, no `validate()` to forget to call, and no partially-built state.

import { type Discount, deriveDiscount, isConsistentWithPrices } from './discount'
import { type Money, toFrancs } from './money'
import { type PriceBasis, isMemberOnly } from './price-basis'
import type { ProductImage } from './product-image'
import { type Result, err, ok } from './result'
import { EMPTY_SOURCE_ATTRIBUTES, type SourceAttributes } from './source-attributes'
import type { ValidityPeriod } from './validity-period'

export const RETAILERS = ['migros', 'coop', 'lidl', 'aldi', 'denner', 'spar', 'volg'] as const
export type Retailer = (typeof RETAILERS)[number]

export type Offer = {
  readonly retailer: Retailer
  readonly productName: string
  readonly salePrice: Money
  readonly originalPrice: Money | null
  readonly discount: Discount | null
  readonly validity: ValidityPeriod
  readonly priceBasis: PriceBasis
  readonly image: ProductImage | null
  /** The retailer's own category, where it publishes one (Denner, Migros). */
  readonly sourceCategory: string | null
  /**
   * Metadata the retailer published alongside the offer. Never guessed.
   * Component 2 fills from here before it considers a model call.
   */
  readonly sourceAttributes: SourceAttributes
  /** Link back to the offer or, for flyers, the flyer page. */
  readonly sourceUrl: string | null
}

export type OfferInput = {
  retailer: Retailer
  productName: string
  salePrice: Money
  originalPrice?: Money | null
  /** Printed badge, when the source prints one. Omit to derive from prices. */
  discount?: Discount | null
  validity: ValidityPeriod
  priceBasis?: PriceBasis
  image?: ProductImage | null
  sourceCategory?: string | null
  /** Omit when the retailer publishes nothing beyond name and price. */
  sourceAttributes?: SourceAttributes
  sourceUrl?: string | null
}

const PRICE_FOR_EVERYONE: PriceBasis = { kind: 'everyone' }

export function createOffer(input: OfferInput): Result<Offer> {
  const name = input.productName?.trim()
  if (!name) return err('Offer must have a product name')

  if (!RETAILERS.includes(input.retailer)) {
    return err(`Unknown retailer '${input.retailer}'`)
  }

  // salePrice > 0 — a promotion at zero francs is a parse failure, not a giveaway.
  if (input.salePrice.rappen <= 0) {
    return err(`Offer salePrice must be greater than 0, got ${toFrancs(input.salePrice)}`)
  }

  const originalPrice = input.originalPrice ?? null
  const providedDiscount = input.discount ?? null

  // THE ALDI RULE. Only ~14 of 44 ALDI flyer pages carry a reference price.
  // No original price means no discount — never back-compute one from a badge
  // we cannot verify against a real "statt" price.
  if (originalPrice === null && providedDiscount !== null) {
    return err('Offer cannot carry a discount without an original price (the ALDI rule)')
  }

  let discount: Discount | null = null

  if (originalPrice !== null) {
    if (originalPrice.rappen <= input.salePrice.rappen) {
      return err(
        `Offer originalPrice (${toFrancs(originalPrice)}) must exceed salePrice (${toFrancs(input.salePrice)})`,
      )
    }

    if (providedDiscount !== null) {
      // A printed badge wins, but must be plausible. A wild mismatch means the
      // parser paired a price with the wrong product.
      if (!isConsistentWithPrices(providedDiscount, originalPrice, input.salePrice)) {
        return err(
          `printed discount ${providedDiscount.percent}% is inconsistent with ` +
            `${toFrancs(originalPrice)} -> ${toFrancs(input.salePrice)}`,
        )
      }
      discount = providedDiscount
    } else {
      const derived = deriveDiscount(originalPrice, input.salePrice)
      if (!derived.ok) return err(derived.error)
      discount = derived.value
    }
  }

  const priceBasis = input.priceBasis ?? PRICE_FOR_EVERYONE

  // THE LIDL RULE. Lidl's flyer JSON reports the Lidl Plus price with no flag.
  // A member price must always name its programme so it can never render bare.
  if (isMemberOnly(priceBasis) && !priceBasis.programme) {
    return err('member-only price must name its loyalty programme (the LIDL rule)')
  }

  return ok({
    retailer: input.retailer,
    productName: name,
    salePrice: input.salePrice,
    originalPrice,
    discount,
    validity: input.validity,
    priceBasis,
    image: input.image ?? null,
    sourceCategory: input.sourceCategory?.trim() || null,
    sourceAttributes: input.sourceAttributes ?? EMPTY_SOURCE_ATTRIBUTES,
    sourceUrl: input.sourceUrl ?? null,
  })
}

/**
 * Identity for de-duplication.
 *
 * WHY: real sources repeat rows. Denner's own API returned "Danone Activia
 * Joghurt" twice on page 2 and "Purina ONE" twice on page 11 of the same
 * collection. Without a key, those become duplicate cards.
 *
 * Deliberately excludes image and sourceUrl: the same offer appearing twice
 * with different artwork is still one offer.
 */
export function offerKey(o: Offer): string {
  const name = o.productName.toLowerCase().replace(/\s+/g, ' ').trim()
  const basis = o.priceBasis.kind === 'everyone' ? 'all' : o.priceBasis.programme
  return [o.retailer, name, o.salePrice.rappen, o.validity.from, o.validity.to, basis].join('|')
}

/** Keeps the first occurrence of each key, preserving source order. */
export function dedupeOffers(offers: readonly Offer[]): Offer[] {
  const seen = new Set<string>()
  const out: Offer[] = []
  for (const o of offers) {
    const k = offerKey(o)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(o)
  }
  return out
}
